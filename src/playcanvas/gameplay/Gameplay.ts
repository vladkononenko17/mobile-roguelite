import { Vec3, type AnimTrack, type AppBase, type Asset, type ContainerResource, type Entity, type Texture } from "playcanvas";
import { WEAPONS, type WeaponId } from "../config";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { Hud } from "../ui/Hud";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import { DROPS, ENEMIES, ENEMY_LIMITS, ENEMY_SKINS, ENEMY_VISUALS, RUN_START, WAVES, XP, SHOP, WEAPON_STATS, upgradeText, type EnemySkinId, type EnemyVisualId, type ShopItem, type UpgradeId } from "./config";
import { Effects } from "./Effects";
import { EnemyManager, isAlive, type BodySource, type Enemy } from "./EnemyManager";
import { Hazards } from "./Hazards";
import { NavField } from "./NavField";
import { PlayerGun } from "./PlayerGun";
import { Pickups, type PickupKind } from "./Pickups";
import { PlayerStats } from "./PlayerStats";
import { SpawnDirector } from "./SpawnDirector";
import { TargetDebug } from "../ui/TargetDebug";
import { ScreenProjector } from "../camera/ScreenProjector";
import { applyUpgrade, availableUpgrades, rollUpgrades, upgradeStacks } from "./Upgrades";

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RunPhase = "loading" | "combat" | "cleared" | "shop" | "dead" | "complete";

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
  /** Level-ups waiting for an upgrade choice (the choice modal pauses the game). */
  private pendingLevelUps = 0;
  private choosing = false;
  private readonly params = new URLSearchParams(location.search);
  private readonly targetDebug = new TargetDebug();
  private readonly projector: ScreenProjector;

  constructor(
    private readonly app: AppBase,
    camera: Entity,
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
    this.projector = new ScreenProjector(camera.camera!);
    this.gun = new PlayerGun(this.enemies, this.effects, collision, this.stats, this.projector);
    this.enemies.onPlayerHit = (damage) => this.hurtPlayer(damage);
    this.hazards.onImpact = (position, radius, damage) => {
      const p = this.player.entity.getPosition();
      if (Math.hypot(p.x - position.x, p.z - position.z) <= radius) this.hurtPlayer(damage);
      this.effects.spark(position, radius * 0.8);
    };
    this.gun.onHit = (position, amount, crit) => this.hud.damageNumber(position, String(amount), crit ? "crit" : "normal");
    this.enemies.onDeath = (enemy) => this.onEnemyDeath(enemy);
    this.enemies.onStranded = (enemy) => this.director.relocate(enemy, this.player.entity.getPosition(), this.projector);
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
    this.pendingLevelUps = 0;
    this.choosing = false;
    this.app.timeScale = 1;
    // Debug: ?wave=2 starts at wave 2, ?waveTime=0.2 shortens every wave.
    this.director.durationScale = Number(this.params.get("waveTime")) || 1;
    const wave = Math.min(WAVES.length, Math.max(1, Number(this.params.get("wave")) || 1));
    this.params.delete("wave"); // only for the first run; restarts begin at wave 1
    this.startWave(wave - 1);
  }

  startWave(index: number): void {
    this.enemies.clear();
    this.pickups.clear();
    // Every wave starts in the open yard.
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
    this.hud.showBanner(WAVES[index].label, 2.2);
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
      text: `${this.director.wave.label} · Level ${this.stats.level} · ${this.stats.kills} kills · ${this.stats.cash}$`,
      actions: [{ label: "Restart run", onClick: () => this.startRun() }],
    });
  }

  /** The wave is over: the rest of the horde drops (no rewards), leftover pickups fly to the hero. */
  private waveComplete(): void {
    this.phase = "cleared";
    this.enemies.killAll();
    this.hazards.reset();
    this.clearTimer = 2.8;
    this.player.aimYawDeg = null;
    this.hud.showBanner(`${this.director.wave.label} complete`, 2.4);
  }

  /** After the short "wave complete": the shop, then the next wave (or the end of the run). */
  private afterWave(): void {
    const next = this.director.waveIndex + 1;
    if (next < WAVES.length) {
      this.openShop(next);
      return;
    }
    this.phase = "complete";
    this.player.controlsEnabled = false;
    this.player.aimYawDeg = null;
    this.hud.openModal({
      title: "RUN COMPLETE",
      text: `The outpost is quiet. Level ${this.stats.level} · ${this.stats.kills} kills · ${this.stats.cash}$ left.`,
      actions: [{ label: "New run", onClick: () => this.startRun() }],
    });
  }

  /**
   * Level-up: the game pauses (time scale 0), three upgrade cards from the level-up pool; the pick is
   * applied and play resumes (several pending level-ups are chosen one after another).
   */
  private openLevelUp(): void {
    const offers = rollUpgrades(this.stats, XP.choices, "levelUp");
    if (!offers.length) {
      this.pendingLevelUps = 0;
      return;
    }
    this.choosing = true;
    this.app.timeScale = 0;
    this.player.aimYawDeg = null;
    const level = this.stats.level - this.pendingLevelUps + 1;
    this.hud.openModal({
      title: "LEVEL UP",
      text: `Level ${level} · choose one`,
      levelUp: true,
      cards: offers.map((u) => {
        const stacks = upgradeStacks(this.stats, u.id);
        return {
          title: u.name, text: upgradeText(u), kind: u.category, icon: u.icon,
          tag: stacks > 0 ? `Lv ${stacks} → ${stacks + 1}` : u.rarity === "common" ? "new" : `new · ${u.rarity}`,
        };
      }),
      onCard: (i) => {
        const def = applyUpgrade(this.stats, offers[i].id);
        this.pendingLevelUps--;
        this.hud.closeModal();
        this.choosing = false;
        this.app.timeScale = 1;
        this.hud.showUpgrade(def, this.player.entity);
      },
    });
  }

  /** Between waves: spend cash. */
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
      actions: [{ label: `Start ${WAVES[next].label}`, onClick: () => this.startWave(next) }],
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

  /** Called exactly once per enemy death (EnemyManager.die): XP, heal-on-kill, drops. */
  private onEnemyDeath(enemy: Enemy): void {
    this.stats.kills++;
    this.pendingLevelUps += this.stats.gainXp(enemy.def.xp);
    if (this.stats.vampireChance > 0 && Math.random() < this.stats.vampireChance) this.stats.heal(this.stats.vampireHeal);
    // Drops: most zombies leave nothing, so the ground stays readable.
    const { x, z } = enemy.position;
    this.effects.bloodDecal(x, z, enemy.scale * (enemy.def.boss ? 1.6 : 1));
    const drops = enemy.def.drops;
    if (enemy.def.boss) {
      const pieces = DROPS.bossCashPieces;
      for (let i = 0; i < pieces; i++) this.pickups.drop("cash", x, z, Math.ceil(enemy.def.cash / pieces));
    } else if (Math.random() < drops.cash) this.pickups.drop("cash", x, z, enemy.def.cash);
    if (Math.random() < drops.health) this.pickups.drop("health", x, z);
    if (Math.random() < drops.upgrade) {
      // Rolled now so the world badge shows which upgrade it is.
      const [offer] = rollUpgrades(this.stats, 1, "drop");
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
      const pick = upgrade && availableUpgrades(s, "drop").some((u) => u.id === upgrade) ? upgrade : rollUpgrades(s, 1, "drop")[0]?.id;
      if (pick) this.hud.showUpgrade(applyUpgrade(s, pick), this.player.entity);
    }
  }

  update(dt: number): void {
    if (this.phase === "loading") return;
    // Screen projections for this frame (targeting, spawning, HUD), read before any DOM writes.
    this.projector.refresh();
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
      this.director.update(dt, position, this.projector);
      this.enemies.update(dt, position, this.stats.alive);
      this.hazards.update(dt);
      if (this.director.phase === "complete") this.waveComplete();
    } else if (this.phase === "cleared") {
      this.enemies.update(dt, position, false);
      this.clearTimer -= dt;
      if (this.clearTimer <= 0 && !this.choosing) this.afterWave();
    }
    this.gun.update(dt, this.player, this.weapons, this.characterScale(), combat && this.stats.alive);
    if (combat || this.phase === "cleared") this.pickups.update(dt, position, this.characterScale(), this.phase === "cleared");
    this.effects.update(dt);
    // Level-ups wait for combat (or the wave-complete pause) and a living hero.
    if (this.pendingLevelUps > 0 && !this.choosing && (combat || this.phase === "cleared") && this.stats.alive) this.openLevelUp();
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
    this.hud.setWave(d.wave.label, d.progress, right);
    this.hud.setXp(s.level, s.xp, s.xpNeeded);
    const boss = d.boss && isAlive(d.boss) ? d.boss : null;
    this.hud.setBoss(boss ? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    this.hud.update(dt, this.projector);
    this.targetDebug.update(this.gun.debug);
  }
}
