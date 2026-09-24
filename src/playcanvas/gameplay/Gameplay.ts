import { Vec3, type AnimTrack, type AppBase, type Asset, type ContainerResource, type Entity } from "playcanvas";
import { CHARACTERS, WEAPONS, type WeaponId } from "../config";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { Hud } from "../ui/Hud";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import { DROPS, ENEMY_LIMITS, LEVELS, RUN_START, SHOP, WEAPON_STATS, type ShopItem } from "./config";
import { Effects } from "./Effects";
import { EnemyManager, type BodySource, type Enemy } from "./EnemyManager";
import { Hazards } from "./Hazards";
import { NavField } from "./NavField";
import { PlayerGun } from "./PlayerGun";
import { Pickups, type PickupKind } from "./Pickups";
import { PlayerStats } from "./PlayerStats";
import { SpawnDirector } from "./SpawnDirector";
import { applyUpgrade, rollUpgrades } from "./Upgrades";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RunPhase = "loading" | "combat" | "cleared" | "reward" | "shop" | "dead" | "complete";

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
  readonly pickups: Pickups;
  private readonly tmp = new Vec3();
  private navTimer = 0;
  private clearTimer = 0;
  private readonly params = new URLSearchParams(location.search);

  constructor(
    private readonly app: AppBase,
    private readonly camera: Entity,
    collision: CollisionWorld,
    bounds: Bounds,
    private readonly player: PlayerController,
    private readonly weapons: WeaponHolder,
    private readonly hud: Hud,
    private readonly characterScale: () => number,
    private readonly onTeleport: () => void = () => {},
  ) {
    this.effects = new Effects(app);
    this.hazards = new Hazards(app);
    this.pickups = new Pickups(app);
    this.pickups.onCollect = (kind, value) => this.collect(kind, value);
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
      (error: unknown) => {
        console.warn("[Gameplay] boss rig failed to load; bosses fall back to the survivor.", error);
        this.enemies.bossFallback = true;
      },
    );
    this.startRun();
  }

  startRun(): void {
    const s = this.stats;
    Object.assign(s, new PlayerStats());
    s.owned.clear();
    s.owned.add("pistol");
    s.upgrades.clear();
    const requested = this.params.get("weapon");
    this.equip(requested && requested in WEAPON_STATS ? (requested as WeaponId) : "pistol");
    // Debug: ?level=2 starts at level 2, ?levelTime=0.2 shortens every level's wave time.
    this.director.durationScale = Number(this.params.get("levelTime")) || 1;
    const level = Math.min(LEVELS.length, Math.max(1, Number(this.params.get("level")) || 1));
    this.params.delete("level"); // only for the first run; restarts begin at level 1
    this.startLevel(level - 1);
  }

  startLevel(index: number): void {
    this.enemies.clear();
    this.pickups.clear();
    // Every level starts in the open yard.
    this.player.entity.setPosition(RUN_START.x, 0, RUN_START.z);
    this.player.yawDeg = RUN_START.yawDeg;
    this.player.velocity.set(0, 0, 0);
    this.onTeleport();
    this.nav.build(RUN_START.x, RUN_START.z);
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

  /** The level's boss is dead: the rest of the horde drops, leftover pickups fly to the hero. */
  private levelCleared(): void {
    this.phase = "cleared";
    this.enemies.killAll();
    this.hazards.reset();
    this.clearTimer = 3;
    this.hud.showBanner(`${this.director.level.label} CLEARED`, 2.6);
  }

  /** After the clear pause: boss reward, shop, then the next level (or the end of the run). */
  private afterLevel(): void {
    const next = this.director.levelIndex + 1;
    if (next < LEVELS.length) {
      this.openReward(next);
      return;
    }
    this.phase = "complete";
    this.player.controlsEnabled = false;
    this.player.aimYawDeg = null;
    this.hud.openModal({
      title: "RUN COMPLETE",
      text: `The outpost is quiet. ${this.stats.kills} kills · ${this.stats.scrap} scrap left.`,
      actions: [{ label: "New run", onClick: () => this.startRun() }],
    });
  }

  /** Boss reward: choose one of three random upgrades. Combat is paused. */
  private openReward(next: number): void {
    this.phase = "reward";
    this.player.controlsEnabled = false;
    this.player.aimYawDeg = null;
    const offers = rollUpgrades(this.stats, 3);
    this.hud.openModal({
      title: "CHOOSE AN UPGRADE",
      text: `${this.director.level.label} boss down. Pick one:`,
      cards: offers.map((u) => ({ title: u.title, text: u.text, tag: u.category, kind: u.category })),
      onCard: (i) => {
        applyUpgrade(this.stats, offers[i].id);
        this.openShop(next);
      },
    });
  }

  /** Between levels: spend scrap. */
  private openShop(next: number): void {
    this.phase = "shop";
    const s = this.stats;
    const items = SHOP.filter((item) => !item.weapon || WEAPON_STATS[item.weapon]);
    const soldOut = (item: ShopItem) => (item.weapon ? s.owned.has(item.weapon) : false) || (item.id === "heal" && s.hp >= s.maxHp);
    this.hud.openModal({
      title: "SHOP",
      compact: true,
      text: `Scrap: ${s.scrap} · HP ${Math.ceil(s.hp)}/${s.maxHp} · ${WEAPONS.list[s.weapon]?.label ?? s.weapon}`,
      cards: items.map((item) => ({
        title: `${item.title} — ${item.cost}`,
        text: soldOut(item) ? (item.weapon ? "Owned" : "HP full") : item.text,
        tag: item.weapon ? "weapon" : "",
        kind: item.weapon ? "weapon" : "player",
        disabled: soldOut(item) || s.scrap < item.cost,
      })),
      onCard: (i) => {
        const item = items[i];
        if (s.scrap < item.cost || soldOut(item)) return;
        s.scrap -= item.cost;
        this.buy(item);
        this.openShop(next);
      },
      actions: [{ label: `Continue to ${LEVELS[next].label}`, onClick: () => this.startLevel(next) }],
    });
  }

  private buy(item: ShopItem): void {
    const s = this.stats;
    switch (item.id) {
      case "heal": s.hp = s.maxHp; break;
      case "maxHp": s.maxHp += 25; s.heal(25); break;
      case "armor": s.armor = Math.min(0.6, s.armor + 0.1); break;
      case "damage": s.damageMult *= 1.1; break;
      case "fireRate": s.fireRateMult *= 1.1; break;
      default: if (item.weapon) this.equip(item.weapon);
    }
  }

  private onEnemyDeath(enemy: Enemy): void {
    this.stats.kills++;
    if (this.stats.vampireChance > 0 && Math.random() < this.stats.vampireChance) this.stats.heal(this.stats.vampireHeal);
    // Drops: most zombies leave nothing, so the ground stays readable.
    const { x, z } = enemy.position;
    const drops = enemy.def.drops;
    if (enemy.def.boss) {
      const pieces = DROPS.bossScrapPieces;
      for (let i = 0; i < pieces; i++) this.pickups.drop("scrap", x, z, Math.ceil(enemy.def.scrap / pieces));
    } else if (Math.random() < drops.scrap) this.pickups.drop("scrap", x, z, enemy.def.scrap);
    if (Math.random() < drops.health) this.pickups.drop("health", x, z);
    if (Math.random() < drops.upgrade) this.pickups.drop("upgrade", x, z);
  }

  private collect(kind: PickupKind, value: number): void {
    const s = this.stats;
    if (kind === "scrap") s.scrap += value;
    else if (kind === "health") {
      s.heal(s.maxHp * DROPS.healthFraction);
      this.hud.showBanner("+HP", 0.6);
    } else {
      const [pick] = rollUpgrades(s, 1);
      if (pick) {
        applyUpgrade(s, pick.id);
        this.hud.showBanner(pick.title.toUpperCase() + " · " + pick.text, 2);
      }
    }
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
      if (this.director.phase === "cleared") this.levelCleared();
    } else if (this.phase === "cleared") {
      this.enemies.update(dt, position, false);
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.afterLevel();
    }
    this.gun.update(dt, this.player, this.weapons, this.characterScale(), combat && this.stats.alive);
    if (combat || this.phase === "cleared") this.pickups.update(dt, position, this.characterScale(), this.phase === "cleared");
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
    const remaining = Math.max(0, d.duration - d.time);
    const right = d.phase === "waves" ? `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, "0")}` : d.phase === "boss" ? "BOSS" : "CLEAR";
    this.hud.setLevel(d.level.label, d.progress, right);
    const boss = d.boss && d.boss.state !== "dead" ? d.boss : null;
    this.hud.setBoss(boss ? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.update(dt, this.camera.camera!);
  }
}
