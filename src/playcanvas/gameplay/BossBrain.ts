import { Vec3 } from "playcanvas";
import type { Enemy, EnemyManager } from "./EnemyManager";
import type { Hazards } from "./Hazards";
import { HELL_BOSSES, type BossAttack, type BossPhase, type HellEnemyId } from "./hellConfig";

type Step = "idle" | "approach" | "windup" | "active" | "recover" | "roar";

/** Per-boss runtime state (Enemy.brain). */
export interface BossState {
  phases: BossPhase[];
  phase: number;
  /** Next attack in the phase's cycle. */
  next: number;
  attack: BossAttack | null;
  step: Step;
  /** Seconds in the current step. */
  t: number;
  /** Seconds until the next attack starts (idle). */
  wait: number;
  /** Swings / volleys / rings / charges / meteors done in this attack. */
  count: number;
  dirX: number;
  dirZ: number;
  /** Charge distance covered. */
  travelled: number;
  marker: ReturnType<Hazards["ring"]>;
  hitDone: boolean;
}

export interface BossSteer {
  x: number;
  z: number;
  speed: number;
  /** Walk along the nav field (when chasing on foot). */
  useNav: boolean;
}

/**
 * Boss scripts (data: HELL_BOSSES). Each boss cycles through its current phase's attacks with a
 * pause (`cadence`) between them; below each phase threshold it roars (invulnerable, the arena
 * reacts) and switches to the next, faster phase. Every damaging attack is telegraphed:
 * - melee: the swing's wind-up animation, and only within reach;
 * - slam / meteors / eruptions: rings on the ground that fill up exactly as they hit;
 * - charge / dive: a lane from the boss, then the dash (winded afterwards: +50% damage taken);
 * - volley / radial: a glowing charge-up at the boss before the bolts fly (dodge between them);
 * - summon: portals open before the demons step out.
 * Movement goes back to EnemyManager (walk with the nav field, or fly for the wyrm).
 */
export class BossBrain {
  /** Visual hooks (Gameplay wires them to effects / HUD / the arena). */
  onWindup: (enemy: Enemy, seconds: number) => void = () => {};
  onPhase: (enemy: Enemy, phase: BossPhase, index: number) => void = () => {};
  onBlast: (position: Vec3, radius: number) => void = () => {};
  onSummon: (type: HellEnemyId, x: number, z: number) => void = () => {};
  private readonly out: BossSteer = { x: 0, z: 0, speed: 0, useNav: false };
  private readonly tmp = new Vec3();

  constructor(private readonly enemies: EnemyManager, private readonly hazards: Hazards) {}

  create(enemy: Enemy): BossState {
    const phases = HELL_BOSSES[enemy.def.script!];
    return {
      phases, phase: 0, next: 0, attack: null, step: "idle", t: 0, wait: 2, count: 0,
      dirX: 0, dirZ: 1, travelled: 0, marker: null, hitDone: false,
    };
  }

  invulnerable(enemy: Enemy): boolean {
    return enemy.brain?.step === "roar";
  }

  /** Winded after a charge: takes extra damage. */
  vulnerable(enemy: Enemy): boolean {
    return enemy.brain?.step === "recover" && enemy.brain.attack?.kind === "charge";
  }

  speedFactor(enemy: Enemy): number {
    const b = enemy.brain;
    return b ? b.phases[b.phase].speed : 1;
  }

  update(enemy: Enemy, dt: number, player: Vec3, playerAlive: boolean): BossSteer {
    const b = enemy.brain!;
    const out = this.out;
    out.x = out.z = out.speed = 0;
    out.useNav = false;
    b.t += dt;
    const dx = player.x - enemy.position.x, dz = player.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    const toX = dx / (distance || 1), toZ = dz / (distance || 1);
    const anim = enemy.model.anim!;
    const phase = b.phases[b.phase];

    // Phase change: below the next threshold, roar (cancel the current attack).
    const upcoming = b.phases[b.phase + 1];
    if (upcoming && enemy.hp / enemy.maxHp <= upcoming.below && b.step !== "roar") {
      this.cancel(enemy);
      b.phase++;
      b.next = 0;
      b.step = "roar";
      b.t = 0;
      enemy.state = "boss";
      anim.speed = 1;
      anim.baseLayer!.transition("Roar", 0.15);
      this.onPhase(enemy, upcoming, b.phase);
      return out;
    }
    if (!playerAlive) return out;

    switch (b.step) {
      case "roar": {
        this.face(enemy, toX, toZ, dt, 4);
        if (b.t >= (phase.enter?.roar ?? 1.5)) this.toIdle(enemy, 0.6);
        break;
      }
      case "idle": {
        b.wait -= dt;
        this.chase(enemy, distance, toX, toZ, player);
        if (b.wait <= 0) this.begin(enemy, phase.attacks[b.next++ % phase.attacks.length]);
        break;
      }
      case "approach": {
        // Melee: close in first (give up after 3 s and move on).
        const a = b.attack as Extract<BossAttack, { kind: "melee" }>;
        this.chase(enemy, distance, toX, toZ, player);
        if (distance <= a.range * 0.9) this.windup(enemy, "Attack", a.windup);
        else if (b.t > 3) this.toIdle(enemy, 0.2);
        break;
      }
      case "windup":
      case "active":
      case "recover":
        this.run(enemy, dt, player, distance, toX, toZ);
        break;
    }
    // Always face the player except mid-charge / dive.
    if (!(b.attack && (b.attack.kind === "charge" || b.attack.kind === "dive") && b.step === "active")) {
      if (out.speed === 0) this.face(enemy, toX, toZ, dt, 8);
    }
    return out;
  }

  /** Walk towards the player (ground) or circle at the orbit distance (flyer). */
  private chase(enemy: Enemy, distance: number, toX: number, toZ: number, player: Vec3): void {
    const out = this.out;
    const fly = enemy.def.fly;
    if (fly) {
      enemy.orbit += 0.012;
      const tx = player.x - Math.sin(enemy.orbit) * fly.orbit, tz = player.z - Math.cos(enemy.orbit) * fly.orbit;
      const ox = tx - enemy.position.x, oz = tz - enemy.position.z;
      const od = Math.hypot(ox, oz);
      if (od > 0.5) {
        out.x = ox / od;
        out.z = oz / od;
        out.speed = enemy.def.speed * this.speedFactor(enemy) * Math.min(1, od / 3);
      }
      return;
    }
    if (distance > enemy.def.attackRange * 0.8) {
      out.x = toX;
      out.z = toZ;
      out.speed = enemy.def.speed * this.speedFactor(enemy);
      out.useNav = true;
    }
  }

  private begin(enemy: Enemy, attack: BossAttack): void {
    const b = enemy.brain!;
    b.attack = attack;
    b.count = 0;
    b.t = 0;
    b.hitDone = false;
    switch (attack.kind) {
      case "melee":
        b.step = "approach";
        break;
      case "slam":
        b.marker = this.hazards.ring(enemy.position.x, enemy.position.z, attack.radius, attack.telegraph);
        this.windup(enemy, "Slam", attack.telegraph);
        break;
      case "charge":
      case "dive":
        this.aimLane(enemy, attack);
        break;
      case "volley":
      case "radial":
        this.windup(enemy, "Cast", attack.windup);
        this.onWindup(enemy, attack.windup);
        break;
      case "meteors":
      case "eruption":
        this.windup(enemy, "Cast", 0.5);
        this.onWindup(enemy, 0.5);
        break;
      case "summon":
        this.windup(enemy, "Roar", attack.portal);
        break;
    }
  }

  private aimLane(enemy: Enemy, attack: Extract<BossAttack, { kind: "charge" | "dive" }>): void {
    const b = enemy.brain!;
    const p = this.enemies.playerPosition;
    const dx = p.x - enemy.position.x, dz = p.z - enemy.position.z;
    const d = Math.hypot(dx, dz) || 1;
    b.dirX = dx / d;
    b.dirZ = dz / d;
    b.travelled = 0;
    b.hitDone = false;
    this.hazards.clear(b.marker);
    b.marker = this.hazards.lane(enemy.position.x, enemy.position.z, b.dirX, b.dirZ, attack.distance, enemy.def.radius * 2.2, attack.telegraph);
    this.windup(enemy, "Special", attack.telegraph);
  }

  private windup(enemy: Enemy, clip: string, seconds: number): void {
    const b = enemy.brain!;
    b.step = "windup";
    b.t = 0;
    b.hitDone = false;
    enemy.state = "boss";
    const anim = enemy.model.anim!;
    // Stretch the clip so its strike lines up with the end of the wind-up.
    anim.speed = clip === "Attack" ? Math.max(0.6, Math.min(1.6, 0.4 / seconds)) : 1;
    anim.baseLayer!.transition(clip, 0.1);
  }

  /** The attack in progress. */
  private run(enemy: Enemy, dt: number, player: Vec3, distance: number, toX: number, toZ: number): void {
    const b = enemy.brain!;
    const a = b.attack!;
    const damage = (n: number) => n * enemy.damageScale;
    const out = this.out;
    switch (a.kind) {
      case "melee": {
        if (b.step === "windup" && b.t >= a.windup) {
          if (distance <= a.range * 1.1) this.enemies.onPlayerHit(damage(a.damage), enemy);
          this.onBlast(this.at(enemy, toX * a.range * 0.6, toZ * a.range * 0.6), 1.2);
          b.count++;
          if (b.count < a.hits) this.windup(enemy, "Attack", a.windup);
          else this.recover(enemy, 0.6);
        }
        break;
      }
      case "slam": {
        if (b.step === "windup" && b.t >= a.telegraph) {
          this.hazards.clear(b.marker);
          b.marker = null;
          if (distance <= a.radius) this.enemies.onPlayerHit(damage(a.damage), enemy);
          this.onBlast(this.at(enemy, 0, 0), a.radius);
          if (a.fire) this.hazards.fire(enemy.position.x, enemy.position.z, a.radius * 0.8, a.fire, 12 * enemy.damageScale);
          this.recover(enemy, 0.9);
        }
        break;
      }
      case "charge":
      case "dive": {
        if (b.step === "windup") {
          this.face(enemy, b.dirX, b.dirZ, dt, 14);
          if (b.t >= a.telegraph) {
            this.hazards.clear(b.marker);
            b.marker = null;
            b.step = "active";
            b.t = 0;
            enemy.state = a.kind === "dive" ? "dive" : "charge";
            enemy.model.anim!.speed = 1.6;
          }
        } else if (b.step === "active") {
          out.x = b.dirX;
          out.z = b.dirZ;
          out.speed = a.speed;
          b.travelled += a.speed * dt;
          if (!b.hitDone && distance < enemy.def.radius + 0.9) {
            b.hitDone = true;
            this.enemies.onPlayerHit(damage(a.damage), enemy);
          }
          if (b.travelled >= a.distance) {
            b.count++;
            enemy.state = "boss";
            const repeat = a.kind === "charge" ? a.repeat ?? 1 : 1;
            if (b.count < repeat) this.aimLane(enemy, a);
            else this.recover(enemy, a.kind === "charge" ? a.recover : 0.8);
          }
        }
        break;
      }
      case "volley": {
        if (b.step === "windup" && b.t >= a.windup) {
          b.step = "active";
          b.t = a.gap;
        }
        if (b.step === "active") {
          if (b.t >= a.gap) {
            b.t = 0;
            this.tmp.set(enemy.position.x + toX, enemy.lift + 1.3, enemy.position.z + toZ);
            this.enemies.fan(this.tmp, toX, toZ, a.count, a.spreadDeg, a.speed, 0.38, damage(a.damage), 22);
            if (++b.count >= a.volleys) this.recover(enemy, 0.5);
          }
        }
        break;
      }
      case "radial": {
        if (b.step === "windup" && b.t >= a.windup) {
          b.step = "active";
          b.t = a.gap;
        }
        if (b.step === "active" && b.t >= a.gap) {
          b.t = 0;
          const offset = (b.count % 2) * (Math.PI / a.count) + ((a.spiral ?? 0) * b.count * Math.PI) / 180;
          this.tmp.set(enemy.position.x, enemy.lift + 1.2, enemy.position.z);
          for (let i = 0; i < a.count; i++) {
            const ang = offset + (i / a.count) * Math.PI * 2;
            this.hazards.bolt(this.tmp, Math.sin(ang), Math.cos(ang), a.speed, 0.36, damage(a.damage), 22);
          }
          if (++b.count >= a.rings) this.recover(enemy, 0.6);
        }
        break;
      }
      case "meteors": {
        if (b.step === "windup" && b.t >= 0.5) {
          b.step = "active";
          b.t = a.gap;
        }
        if (b.step === "active" && b.t >= a.gap) {
          b.t = 0;
          // The first lands on the player's spot; the rest scatter around it.
          const r = b.count === 0 ? 0 : a.spread * Math.sqrt(Math.random());
          const ang = Math.random() * Math.PI * 2;
          this.hazards.strike(player.x + Math.sin(ang) * r, player.z + Math.cos(ang) * r, a.radius, a.delay, damage(a.damage), "meteor", a.fire, 10 * enemy.damageScale);
          if (++b.count >= a.count) this.recover(enemy, 0.4);
        }
        break;
      }
      case "eruption": {
        if (b.step === "windup" && b.t >= 0.5) {
          // A line of cracks racing from the boss towards (and past) the player.
          for (let i = 1; i <= a.count; i++) {
            const d = i * a.spacing;
            this.hazards.strike(enemy.position.x + toX * d, enemy.position.z + toZ * d, a.radius, a.delay + i * 0.07, damage(a.damage), "eruption", a.fire, 10 * enemy.damageScale);
          }
          this.recover(enemy, 0.6);
        }
        break;
      }
      case "summon": {
        if (b.step === "windup" && !b.hitDone) {
          b.hitDone = true;
          let n = 0;
          const total = a.enemies.reduce((k, e) => k + e.count, 0);
          for (const group of a.enemies) {
            for (let i = 0; i < group.count; i++, n++) {
              const ang = (n / total) * Math.PI * 2 + Math.random() * 0.3;
              const x = enemy.position.x + Math.sin(ang) * a.radius, z = enemy.position.z + Math.cos(ang) * a.radius;
              const type = group.type;
              this.hazards.portal(x, z, 0.9, a.portal, () => this.onSummon(type, x, z));
            }
          }
        }
        if (b.step === "windup" && b.t >= a.portal) this.recover(enemy, 0.4);
        break;
      }
    }
    if (b.step === "recover" && b.t >= b.wait) this.toIdle(enemy, b.phases[b.phase].cadence);
  }

  private recover(enemy: Enemy, seconds: number): void {
    const b = enemy.brain!;
    b.step = "recover";
    b.t = 0;
    b.wait = seconds;
    enemy.state = "boss";
    const anim = enemy.model.anim!;
    anim.speed = b.attack?.kind === "charge" ? 0.4 : 1;
    anim.baseLayer!.transition("Move", 0.25);
  }

  private toIdle(enemy: Enemy, wait: number): void {
    const b = enemy.brain!;
    b.step = "idle";
    b.t = 0;
    b.wait = wait;
    b.attack = null;
    enemy.state = "move";
    const anim = enemy.model.anim!;
    anim.speed = 1;
    anim.baseLayer!.transition("Move", 0.2);
  }

  private cancel(enemy: Enemy): void {
    const b = enemy.brain!;
    this.hazards.clear(b.marker);
    b.marker = null;
    b.attack = null;
  }

  /** Clears telegraphs when the boss dies. */
  release(enemy: Enemy): void {
    if (enemy.brain) this.cancel(enemy);
  }

  private at(enemy: Enemy, ox: number, oz: number): Vec3 {
    return this.tmp.set(enemy.position.x + ox, 0.1, enemy.position.z + oz);
  }

  private face(enemy: Enemy, x: number, z: number, dt: number, sharpness: number): void {
    const target = (Math.atan2(x, z) * 180) / Math.PI;
    let delta = ((target - enemy.yaw + 540) % 360) - 180;
    delta *= 1 - Math.exp(-sharpness * dt);
    enemy.yaw += delta;
  }
}
