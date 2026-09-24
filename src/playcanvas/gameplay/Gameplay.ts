import { Vec3, type AnimTrack, type AppBase, type Asset, type ContainerResource, type Entity } from "playcanvas";
import { CHARACTERS, WEAPONS, type WeaponId } from "../config";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { Hud } from "../ui/Hud";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import { ENEMY_LIMITS, LEVELS, WEAPON_STATS } from "./config";
import { Effects } from "./Effects";
import { EnemyManager, type BodySource, type Enemy } from "./EnemyManager";
import { Hazards } from "./Hazards";
import { NavField } from "./NavField";
import { PlayerGun } from "./PlayerGun";
import { PlayerStats } from "./PlayerStats";
import { SpawnDirector } from "./SpawnDirector";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RunPhase = "loading" | "combat" | "cleared" | "dead" | "complete";

async function loadBody(app: AppBase, url: string): Promise<BodySource> {
  const asset = await new Promise<Asset>((resolve, reject) => {
    app.assets.loadFromUrlAndFilename(url, url.split("/").pop()!, "container", (error, loaded) => {
      if (error || !loaded) reject(new Error(`Failed to load ${url}: ${error}`));
      else resolve(loaded);
    });
  });
  const resource = asset.resource as ContainerResource;
  const animations = (resource as unknown as { animations: Asset[] }).animations ?? [];
  return { resource, tracks: animations.map((a) => a.resource as AnimTrack) };
}

/**
 * The roguelite run on the arena: owns the hero's run stats, the enemies, the gun, the spawn director,
 * hazards, effects and the HUD, and steps them every frame. The player controller, weapon holder and
 * hand/pose systems stay as they are; this only reads the hero's position and steers aiming.
 */
export class Gameplay {
  phase: RunPhase = "loading";
  readonly stats = new PlayerStats();
  readonly enemies: EnemyManager;
  readonly gun: PlayerGun;
  readonly director: SpawnDirector;
  readonly nav: NavField;
  private readonly effects: Effects;
  private readonly hazards: Hazards;
  private readonly tmp = new Vec3();
  private navTimer = 0;

  constructor(
    private readonly app: AppBase,
    private readonly camera: Entity,
    collision: CollisionWorld,
    bounds: Bounds,
    private readonly player: PlayerController,
    private readonly weapons: WeaponHolder,
    private readonly hud: Hud,
    private readonly characterScale: () => number,
  ) {
    this.effects = new Effects(app);
    this.hazards = new Hazards(app);
    this.nav = new NavField(collision, bounds);
    this.enemies = new EnemyManager(app, collision, this.nav, this.hazards);
    this.director = new SpawnDirector(this.enemies, this.nav, bounds);
    this.gun = new PlayerGun(this.enemies, this.effects, collision, this.stats);
    this.enemies.onPlayerHit = (damage) => this.hurtPlayer(damage);
    this.hazards.onImpact = (position, radius, damage) => {
      const p = this.player.entity.getPosition();
      if (Math.hypot(p.x - position.x, p.z - position.z) <= radius) this.hurtPlayer(damage);
      this.effects.spark(position, radius * 0.8);
    };
    this.gun.onHit = (position, amount, crit) => this.hud.damageNumber(position, String(amount), crit ? "crit" : "normal");
    this.enemies.onDeath = (enemy) => this.onEnemyDeath(enemy);
    this.enemies.onStranded = (enemy) => this.director.relocate(enemy, this.player.entity.getPosition(), this.camera.camera!);
  }

  /** Loads enemy bodies (the survivor first, the bigger boss rig in the background) and starts the run. */
  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    const survivor = await loadBody(this.app, `${base}${CHARACTERS.survivor.url}`);
    this.enemies.addSource("survivor", survivor, ENEMY_LIMITS.pool);
    loadBody(this.app, `${base}${CHARACTERS.vanguard.url}`).then(
      (vanguard) => this.enemies.addSource("vanguard", vanguard, ENEMY_LIMITS.bossPool),
      (error: unknown) => console.warn("[Gameplay] boss rig failed to load; bosses fall back to the survivor.", error),
    );
    this.startRun();
  }

  startRun(): void {
    const s = this.stats;
    Object.assign(s, new PlayerStats());
    s.owned.clear();
    s.owned.add("pistol");
    s.upgrades.clear();
    const requested = new URLSearchParams(location.search).get("weapon");
    this.equip(requested && requested in WEAPON_STATS ? (requested as WeaponId) : "pistol");
    this.startLevel(0);
  }

  startLevel(index: number): void {
    this.enemies.clear();
    this.hazards.reset();
    this.director.start(index);
    this.gun.reset();
    this.phase = "combat";
    this.player.controlsEnabled = true;
    this.hud.closeModal();
    this.hud.showBanner(LEVELS[index].label, 2.2);
  }

  equip(weapon: WeaponId): void {
    this.stats.weapon = weapon;
    this.stats.owned.add(weapon);
    this.weapons.equip(weapon);
    this.gun.reset();
  }

  private hurtPlayer(damage: number): void {
    if (this.phase !== "combat") return;
    const taken = this.stats.hurt(damage);
    if (taken <= 0) return;
    this.hud.flashHurt();
    this.tmp.copy(this.player.entity.getPosition());
    this.tmp.y += 2.1 * this.characterScale();
    this.hud.damageNumber(this.tmp, `-${taken}`, "player");
    if (!this.stats.alive) this.die();
  }

  private die(): void {
    this.phase = "dead";
    this.player.controlsEnabled = false;
    this.player.aimYawDeg = null;
    this.hud.openModal({
      title: "YOU DIED",
      text: `${this.director.level.label} · ${this.stats.kills} kills · ${this.stats.scrap} scrap`,
      actions: [{ label: "Restart run", onClick: () => this.startRun() }],
    });
  }

  private onEnemyDeath(enemy: Enemy): void {
    this.stats.kills++;
    if (this.stats.vampireChance > 0 && Math.random() < this.stats.vampireChance) this.stats.heal(this.stats.vampireHeal);
    void enemy;
  }

  update(dt: number): void {
    if (this.phase === "loading") return;
    const position = this.player.entity.getPosition();
    const combat = this.phase === "combat";
    // Weapon shown in the hands is the one fired (the tune panel may switch it for testing).
    const held = this.weapons.current;
    if (held && held !== this.stats.weapon && WEAPON_STATS[held]) this.stats.weapon = held;
    if (combat) {
      this.navTimer -= dt;
      if (this.navTimer <= 0) {
        this.nav.build(position.x, position.z);
        this.navTimer = 0.3;
      }
      this.stats.invulnerable = Math.max(0, this.stats.invulnerable - dt);
      this.player.speedMultiplier = this.stats.moveSpeedMult;
      this.director.update(dt, position, this.camera.camera!);
      this.enemies.update(dt, position, this.stats.alive);
      this.hazards.update(dt);
    }
    this.gun.update(dt, this.player, this.weapons, this.characterScale(), combat && this.stats.alive);
    this.effects.update(dt);
    this.updateHud(dt);
  }

  private updateHud(dt: number): void {
    const s = this.stats;
    const d = this.director;
    this.hud.setHp(s.hp, s.maxHp);
    this.hud.setScrap(s.scrap);
    const ws = s.weaponStats();
    const label = WEAPONS.list[s.weapon]?.label ?? s.weapon;
    this.hud.setWeapon(label, this.gun.ammo, ws?.magazine ?? 0, this.gun.reloading > 0);
    const remaining = Math.max(0, d.level.duration - d.time);
    const right = d.phase === "waves" ? `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, "0")}` : d.phase === "boss" ? "BOSS" : "CLEAR";
    this.hud.setLevel(d.level.label, d.progress, right);
    const boss = d.boss && d.boss.state !== "dead" ? d.boss : null;
    this.hud.setBoss(boss ? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.update(dt, this.camera.camera!);
  }
}
