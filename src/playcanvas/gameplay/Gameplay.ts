import { Vec3, type AnimTrack, type AppBase, type Asset, type ContainerResource, type Entity, type Texture } from "playcanvas";
import { WEAPONS, type WeaponId } from "../config";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { Hud } from "../ui/Hud";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import { DROPS, ENEMIES, ENEMY_LIMITS, ENEMY_SKINS, ENEMY_VISUALS, LEVELS, RUN_START, SHOP, WEAPON_STATS, upgradeText, type EnemySkinId, type EnemyVisualId, type ShopItem, type UpgradeId } from "./config";
import { Effects } from "./Effects";
import { EnemyManager, type BodySource, type Enemy } from "./EnemyManager";
import { Hazards } from "./Hazards";
import { NavField } from "./NavField";
import { PlayerGun } from "./PlayerGun";
import { Pickups, type PickupKind } from "./Pickups";
import { PlayerStats } from "./PlayerStats";
import { SpawnDirector } from "./SpawnDirector";
import { TargetDebug } from "../ui/TargetDebug";
import { applyUpgrade, availableUpgrades, rollUpgrades } from "./Upgrades";

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

async function loadTexture(app: AppBase, url: string): Promise<Texture> {
  const asset = await new Promise<Asset>((resolve, reject) => {
    app.assets.loadFromUrl(url, "texture", (error, loaded) => {
      if (error || !loaded) reject(new Error(`Failed to load ${url}: ${error}`));
      else resolve(loaded);
    });
  });
  return asset.resource as Texture;
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
  private readonly targetDebug = new TargetDebug();

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
    this.pickups.onCollect = (kind, value, upgrade) => this.collect(kind, value, upgrade);
    this.nav = new NavField(collision, bounds);
    this.enemies = new EnemyManager(app, collision, this.nav, this.hazards);
    this.director = new SpawnDirector(this.enemies, this.nav, bounds);
    this.gun = new PlayerGun(this.enemies, this.effects, collision, this.stats, camera.camera!);
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

  /** Loads the enemy looks (the walkers' before the run starts, the rest in the background). */
  async init(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    // Looks may share a model file (walker and brute): each file downloads once.
    const bodies = new Map<string, Promise<BodySource>>();
    const body = (url: string) => {
      let promise = bodies.get(url);
      if (!promise) bodies.set(url, (promise = loadBody(this.app, `${base}${url}`)));
      return promise;
    };
    const load = (visual: EnemyVisualId, count: number) =>
      body(ENEMY_VISUALS[visual].url).then(
        (body) => this.enemies.addVisual(visual, body, count),
        (error: unknown) => console.warn(`[Gameplay] enemy look ${visual} failed to load.`, error),
      );
    const first = new Set(ENEMIES.walker.visuals);
    const skins = (Object.keys(ENEMY_SKINS) as EnemySkinId[]).map((skin) =>
      loadTexture(this.app, `${base}${ENEMY_SKINS[skin]}`).then(
        (texture) => this.enemies.addSkin(skin, texture),
        (error: unknown) => console.warn(`[Gameplay] enemy skin ${skin} failed to load.`, error),
      ),
    );
    await Promise.all([...[...first].map((v) => load(v, ENEMY_LIMITS.prebuild)), ...skins]);
    const rest = new Set(Object.values(ENEMIES).flatMap((def) => def.visuals).filter((v) => !first.has(v)));
    for (const visual of rest) void load(visual, ENEMY_LIMITS.prebuild / 4);
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
      text: `${this.director.level.label} · ${this.stats.kills} kills · ${this.stats.cash}$`,
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
      text: `The outpost is quiet. ${this.stats.kills} kills · ${this.stats.cash}$ left.`,
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
      cards: offers.map((u) => ({ title: u.name, text: upgradeText(u), tag: u.rarity === "common" ? u.category : `${u.rarity} ${u.category}`, kind: u.category, icon: u.icon })),
      onCard: (i) => {
        applyUpgrade(this.stats, offers[i].id);
        this.openShop(next);
      },
    });
  }

  /** Between levels: spend cash. */
  private openShop(next: number): void {
    this.phase = "shop";
    const s = this.stats;
    const items = SHOP.filter((item) => !item.weapon || WEAPON_STATS[item.weapon]);
    const soldOut = (item: ShopItem) => (item.weapon ? s.owned.has(item.weapon) : false) || (item.id === "heal" && s.hp >= s.maxHp);
    this.hud.openModal({
      title: "SHOP",
      compact: true,
      text: `Cash: ${s.cash}$ · HP ${Math.ceil(s.hp)}/${s.maxHp} · ${WEAPONS.list[s.weapon]?.label ?? s.weapon}`,
      cards: items.map((item) => ({
        title: `${item.title} — ${item.cost}$`,
        text: soldOut(item) ? (item.weapon ? "Owned" : "HP full") : item.text,
        tag: item.weapon ? "weapon" : "",
        kind: item.weapon ? "weapon" : "player",
        disabled: soldOut(item) || s.cash < item.cost,
      })),
      onCard: (i) => {
        const item = items[i];
        if (s.cash < item.cost || soldOut(item)) return;
        s.cash -= item.cost;
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
      const pieces = DROPS.bossCashPieces;
      for (let i = 0; i < pieces; i++) this.pickups.drop("cash", x, z, Math.ceil(enemy.def.cash / pieces));
    } else if (Math.random() < drops.cash) this.pickups.drop("cash", x, z, enemy.def.cash);
    if (Math.random() < drops.health) this.pickups.drop("health", x, z);
    if (Math.random() < drops.upgrade) {
      // Rolled now so the world badge shows which upgrade it is.
      const [offer] = rollUpgrades(this.stats, 1);
      if (offer) this.pickups.drop("upgrade", x, z, 0, offer.id);
    }
  }

  private collect(kind: PickupKind, value: number, upgrade: UpgradeId | null): void {
    const s = this.stats;
    if (kind === "cash") s.cash += value;
    else if (kind === "health") {
      const before = s.hp;
      s.heal(s.maxHp * DROPS.healthFraction);
      const p = this.player.entity.getPosition();
      this.tmp.set(p.x, 2.1 * this.characterScale(), p.z);
      this.hud.damageNumber(this.tmp, `+${Math.round(s.hp - before)} HP`, "heal");
    } else {
      // The pickup carries the upgrade it shows; reroll if that one got maxed out meanwhile.
      const pick = upgrade && availableUpgrades(s).some((u) => u.id === upgrade) ? upgrade : rollUpgrades(s, 1)[0]?.id;
      if (pick) this.hud.showUpgrade(applyUpgrade(s, pick), this.player.entity);
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
    this.hud.setCash(s.cash);
    const ws = s.weaponStats();
    const label = WEAPONS.list[s.weapon]?.label ?? s.weapon;
    this.hud.setWeapon(label, this.gun.ammo, ws?.magazine ?? 0, this.gun.reloading > 0);
    const remaining = Math.max(0, d.duration - d.time);
    const right = d.phase === "waves" ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}` : d.phase === "boss" ? "BOSS" : "CLEAR";
    this.hud.setLevel(d.level.label, d.progress, right);
    const boss = d.boss && d.boss.state !== "dead" ? d.boss : null;
    this.hud.setBoss(boss ? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.update(dt, this.camera.camera!);
    this.targetDebug.update(this.gun.debug);
  }
}
