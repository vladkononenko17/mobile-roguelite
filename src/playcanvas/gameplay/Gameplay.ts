import { Vec3, type AnimTrack, type AppBase, type Asset, type ContainerResource, type Entity, type Texture } from "playcanvas";
import { WEAPONS, type WeaponId } from "../config";
import type { PlayerController } from "../player/PlayerController";
import type { WeaponHolder } from "../player/WeaponHolder";
import type { Hud } from "../ui/Hud";
import type { CollisionWorld } from "../world/collision/CollisionWorld";
import type { Biome, Campaign, LevelBounds, WayPoint, Zone } from "../world/level/Biome";
import { DROPS, ENEMIES, ENEMY_LIMITS, ENEMY_SKINS, ENEMY_VISUALS, SYNERGIES, WAVES, XP, LEVEL_UP, SHOP, shopPrice, WEAPON_CARDS, WEAPON_STATS, upgradeText, type EnemyId, type EnemySkinId, type EnemyVisualId, type ShopItem, type UpgradeDef, type UpgradeId, type UpgradeTag, type WaveDef } from "./config";
import { BossBrain } from "./BossBrain";
import { HELL_BOSSES, HELL_TYPE_SKINS } from "./hellConfig";
import { Effects } from "./Effects";
import { EnemyManager, isAlive, type BodySource, type Enemy } from "./EnemyManager";
import { Hazards } from "./Hazards";
import { NavField } from "./NavField";
import { PlayerGun } from "./PlayerGun";
import { Pickups, type PickupKind } from "./Pickups";
import { PlayerStats } from "./PlayerStats";
import { SpawnDirector } from "./SpawnDirector";
import { TargetDebug } from "../ui/TargetDebug";
import { Combat } from "./Combat";
import { Drones } from "./Drones";
import { ScreenProjector } from "../camera/ScreenProjector";
import { applyUpgrade, availableUpgrades, rollUpgrades, tagCounts, upgradeStacks, type SynergyReached } from "./Upgrades";

/** "travel": a campaign level is won and the hero walks to the way on (see Zone.exit). */
export type RunPhase = "loading" | "combat" | "cleared" | "shop" | "travel" | "dead" | "complete";

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
  /** The walk to the next level's zone (phase "travel"). */
  private travel: { next: number; zone: string; exits: WayPoint[]; opened: boolean[]; exit: NonNullable<Zone["exit"]>; region: LevelBounds } | null = null;
  private readonly wayPoint = new Vec3();
  private navTimer = 0;
  private clearTimer = 0;
  /** Level-ups waiting for an upgrade choice (the choice modal pauses the game). */
  private pendingLevelUps = 0;
  private choosing = false;
  private readonly params = new URLSearchParams(location.search);
  private readonly targetDebug = new TargetDebug();
  private readonly projector: ScreenProjector;
  private readonly combat: Combat;
  private readonly drones: Drones;
  private readonly brain: BossBrain;
  /** The run's levels (a biome campaign, else the shared WAVES) and its zones. */
  readonly levels: WaveDef[];
  private readonly campaign: Campaign | null;
  private region: LevelBounds;
  /** Burn damage waiting to be applied (fire zones tick in small amounts). */
  private burn = 0;
  /** A weapon picked up between levels: its NEW WEAPON card shows when the next level starts. */
  private unlocked: WeaponId | null = null;
  /** The armory has been visited this run (campaign-only weapons appear in the shop). */
  private armorySeen = false;
  private meteorTimer = 0;

  constructor(
    private readonly app: AppBase,
    camera: Entity,
    collision: CollisionWorld,
    private readonly biome: Biome,
    private readonly player: PlayerController,
    private readonly weapons: WeaponHolder,
    private readonly hud: Hud,
    private readonly characterScale: () => number,
    private readonly onTeleport: () => void = () => {},
  ) {
    const bounds = biome.bounds;
    this.campaign = biome.campaign ?? null;
    this.levels = this.campaign?.levels ?? WAVES;
    this.region = bounds;
    this.effects = new Effects(app);
    this.hazards = new Hazards(app);
    this.pickups = new Pickups(app);
    this.pickups.onCollect = (kind, value, upgrade) => this.collect(kind, value, upgrade);
    // The nav grid covers the first level's region (re-gridded per level on large maps).
    const first = this.zoneOf(0);
    this.region = first?.region ?? bounds;
    this.nav = new NavField(collision, this.region);
    this.enemies = new EnemyManager(app, collision, this.nav, this.hazards);
    this.enemies.bounds = this.region;
    this.director = new SpawnDirector(this.enemies, this.nav, this.region, this.levels);
    this.brain = new BossBrain(this.enemies, this.hazards);
    this.enemies.brain = this.brain;
    this.projector = new ScreenProjector(camera.camera!);
    this.combat = new Combat(this.enemies, this.effects, this.stats);
    this.combat.onHit = (position, amount, style) => this.hud.damageNumber(position, String(amount), style);
    this.gun = new PlayerGun(this.enemies, this.effects, collision, this.stats, this.projector, this.combat);
    this.drones = new Drones(app, this.effects, this.combat, this.gun);
    this.enemies.onPlayerHit = (damage, from) => {
      const push = from.def.knockback ?? 0;
      if (push > 0 && this.hurtPlayer(damage)) {
        const p = this.player.entity.getPosition();
        const dx = p.x - from.position.x, dz = p.z - from.position.z;
        const d = Math.hypot(dx, dz) || 1;
        this.player.push.set((dx / d) * push, 0, (dz / d) * push);
      } else if (push <= 0) this.hurtPlayer(damage);
    };
    this.enemies.onSlam = (position, radius) => this.effects.ring(position, radius, false);
    this.hazards.onImpact = (position, radius, damage) => {
      const p = this.player.entity.getPosition();
      if (Math.hypot(p.x - position.x, p.z - position.z) <= radius) this.hurtPlayer(damage);
      this.effects.spark(position, radius * 0.8);
    };
    this.hazards.onBoltHit = (damage) => this.hurtPlayer(damage);
    this.hazards.onBurn = (damage) => {
      // Fire ticks twice a second (each tick can hit through the short post-hit invulnerability).
      this.burn += damage;
      if (this.burn >= 4) {
        this.stats.invulnerable = 0;
        this.hurtPlayer(this.burn);
        this.burn = 0;
      }
    };
    this.hazards.onBlast = (position, radius, kind) => {
      if (kind === "bolt") this.effects.spark(position, 0.3);
      else this.effects.explosion(position, radius);
    };
    this.brain.onWindup = (enemy) => {
      this.tmp.set(enemy.position.x, enemy.lift + 1.2 * enemy.scale * 0.5, enemy.position.z);
      this.effects.ring(this.tmp, 1.2 + enemy.def.radius, true);
      this.effects.flame(this.tmp);
    };
    this.brain.onBlast = (position, radius) => this.effects.ring(position, radius, false);
    this.brain.onSummon = (type, x, z) => {
      const w = this.director.wave;
      this.effects.explosion(this.tmp.set(x, 0.1, z), 0.8);
      this.enemies.spawn(type, x, z, w.hpScale, w.damageScale);
    };
    this.brain.onPhase = (enemy, phase) => {
      if (phase.enter) {
        this.hud.showBanner(phase.enter.banner, 2.2);
        this.campaign?.arena?.(phase.enter.arena);
      }
      this.effects.ring(this.tmp.set(enemy.position.x, 0.1, enemy.position.z), 7, true);
      this.effects.explosion(this.tmp, 2);
    };
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
    // Attachment models (horns...) before the looks that wear them.
    const attachmentUrls = new Set(Object.values(ENEMY_VISUALS).flatMap((v) => (v.attachments ?? []).map((a) => a.url).filter((u): u is string => !!u)));
    await Promise.all([...attachmentUrls].map((url) => body(url).then(
      (b) => this.enemies.attachmentModels.set(url, b.resource),
      (error: unknown) => console.warn(`[Gameplay] attachment ${url} failed to load.`, error),
    )));
    const load = (visual: EnemyVisualId, count: number) =>
      body(ENEMY_VISUALS[visual].url).then(
        (body) => this.enemies.addVisual(visual, body, count),
        (error: unknown) => console.warn(`[Gameplay] enemy look ${visual} failed to load.`, error),
      );
    // Only the enemy types this run's levels (and their bosses' summons) use.
    const types = new Set<EnemyId>();
    for (const level of this.levels) {
      for (const p of level.phases) for (const id of Object.keys(p.weights)) types.add(id as EnemyId);
      if (level.boss) {
        types.add(level.boss.type);
        const script = ENEMIES[level.boss.type].script;
        for (const phase of script ? HELL_BOSSES[script] : []) for (const a of phase.attacks) if (a.kind === "summon") a.enemies.forEach((e) => types.add(e.type));
      }
    }
    const openers = Object.keys(this.levels[0].phases[0].weights) as EnemyId[];
    const first = new Set(openers.flatMap((id) => ENEMIES[id].visuals));
    const neededSkins = new Set<EnemySkinId>([...types].flatMap((id) => [
      ...((HELL_TYPE_SKINS as Partial<Record<EnemyId, EnemySkinId[]>>)[id] ?? []),
      ...ENEMIES[id].visuals.flatMap((v) => ENEMY_VISUALS[v].skins ?? []),
    ]));
    const skins = (Object.keys(ENEMY_SKINS) as EnemySkinId[]).filter((skin) => neededSkins.has(skin)).map((skin) =>
      loadTexture(this.app, `${base}${ENEMY_SKINS[skin]}`).then(
        (texture) => this.enemies.addSkin(skin, texture),
        (error: unknown) => console.warn(`[Gameplay] enemy skin ${skin} failed to load.`, error),
      ),
    );
    await Promise.all([...[...first].map((v) => load(v, ENEMY_LIMITS.prebuild)), ...skins]);
    const rest = new Set([...types].flatMap((id) => ENEMIES[id].visuals).filter((v) => !first.has(v)));
    for (const visual of rest) void load(visual, ENEMY_LIMITS.prebuild / 4);
    this.startRun();
  }

  startRun(): void {
    const s = this.stats;
    Object.assign(s, new PlayerStats());
    s.owned.clear();
    s.owned.add("pistol");
    s.upgrades.clear();
    this.unlocked = null;
    this.armorySeen = false;
    const kit = this.campaign?.run;
    const requested = this.params.get("weapon");
    this.equip(requested && requested in WEAPON_STATS ? (requested as WeaponId) : kit?.startWeapon ?? "pistol");
    this.pendingLevelUps = 0;
    if (kit) {
      // A veteran: cash for the first shop, and the first upgrades picked before the first demon.
      s.cash = kit.startCash;
      s.level += kit.startPicks;
      this.pendingLevelUps = kit.startPicks;
    }
    this.choosing = false;
    this.app.timeScale = 1;
    // Debug: ?wave=2 starts at wave 2, ?waveTime=0.2 shortens every wave.
    this.director.durationScale = Number(this.params.get("waveTime")) || 1;
    const wave = Math.min(this.levels.length, Math.max(1, Number(this.params.get("wave")) || 1));
    this.params.delete("wave"); // only for the first run; restarts begin at wave 1
    this.startWave(wave - 1);
  }

  /** The zone of level `index` (campaigns on large maps), or null. */
  private zoneOf(index: number) {
    const zone = this.levels[index]?.zone;
    return zone && this.campaign ? this.campaign.zones[zone] ?? null : null;
  }

  /** Starts level `index`; `arrived`: the hero walked into its zone (no move to the zone's start). */
  startWave(index: number, arrived = false): void {
    this.travel = null;
    this.enemies.clear();
    this.pickups.clear();
    // The level's zone: its region bounds the player, the nav grid and spawning.
    const zone = this.zoneOf(index);
    const region = zone?.region ?? this.biome.bounds;
    if (region !== this.region) {
      this.region = region;
      this.nav.setBounds(region);
      this.director.bounds = region;
      this.enemies.bounds = region;
    }
    this.player.bounds = region;
    this.campaign?.onLevel?.(index, this.levels[index].zone ?? "");
    this.campaign?.arena?.(0);
    this.burn = 0;
    this.meteorTimer = this.levels[index].meteors?.every ?? 0;
    // Every wave starts in the zone's (or map's) open area.
    const start = zone?.start ?? this.biome.runStart;
    if (!arrived) {
      this.player.entity.setPosition(start.x, 0, start.z);
      this.player.yawDeg = start.yawDeg;
      this.player.velocity.set(0, 0, 0);
      this.onTeleport();
    }
    const here = this.player.entity.getPosition();
    this.nav.build(here.x, here.z);
    this.hazards.reset();
    this.combat.reset();
    if (index > 0) this.stats.rerolls += LEVEL_UP.rerollsPerWave;
    this.director.start(index);
    this.gun.reset();
    this.phase = "combat";
    this.player.controlsEnabled = true;
    this.hud.closeModal();
    const level = this.levels[index];
    this.hud.showBanner(level.subtitle ? `${level.label} · ${level.subtitle}` : level.label, 2.6);
    const card = this.unlocked && WEAPON_CARDS[this.unlocked];
    if (card) this.hud.showWeapon(WEAPONS.list[this.unlocked!].label, card.text, card.stats, card.color);
    this.unlocked = null;
  }

  equip(weapon: WeaponId): void {
    if (this.phase !== "loading" && !this.stats.owned.has(weapon) && WEAPON_CARDS[weapon]) this.unlocked = weapon;
    this.stats.weapon = weapon;
    this.stats.owned.add(weapon);
    this.weapons.equip(weapon);
    this.gun.reset();
  }

  /** Damages the hero; returns whether any damage was taken. */
  private hurtPlayer(damage: number): boolean {
    if (this.phase !== "combat") return false;
    const taken = this.stats.hurt(damage);
    if (taken <= 0) return false;
    this.hud.flashHurt();
    this.tmp.copy(this.player.entity.getPosition());
    this.tmp.y += 2.1 * this.characterScale();
    this.hud.damageNumber(this.tmp, `-${taken}`, "player");
    if (!this.stats.alive) this.die();
    return true;
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
    if (next < this.levels.length) {
      const run = this.campaign?.run;
      if (run && this.director.waveIndex === run.pactAfter) this.openPact(next);
      else if (run?.armory && this.director.waveIndex === run.armory.after) this.openArmory(next, run.armory.weapons);
      else this.openShop(next);
      return;
    }
    this.phase = "complete";
    this.player.controlsEnabled = false;
    this.player.aimYawDeg = null;
    const victory = this.campaign?.victory ?? { title: "RUN COMPLETE", text: "The outpost is quiet." };
    this.hud.openModal({
      title: victory.title,
      text: `${victory.text} Level ${this.stats.level} · ${this.stats.kills} kills · ${this.stats.cash}$ left.`,
      actions: [{ label: "New run", onClick: () => this.startRun() }],
    });
  }

  /**
   * Level-up: the game pauses (time scale 0), three upgrade cards from the level-up pool; the pick is
   * applied and play resumes (several pending level-ups are chosen one after another).
   */
  private offers: UpgradeDef[] = [];

  /**
   * Level-up: the game pauses (time scale 0) and three upgrade cards from the level-up pool are
   * offered (evolutions first when unlocked); the player can reroll all or banish one (limited per
   * run), then picks one: it is applied (with any synergy tier it completes) and play resumes.
   * Several pending level-ups are chosen one after another.
   */
  private openLevelUp(): void {
    this.offers = rollUpgrades(this.stats, XP.choices, "levelUp");
    if (!this.offers.length) {
      this.pendingLevelUps = 0;
      return;
    }
    this.choosing = true;
    this.app.timeScale = 0;
    this.player.aimYawDeg = null;
    this.showLevelUp();
  }

  private showLevelUp(): void {
    const s = this.stats;
    const counts = tagCounts(s);
    this.hud.openLevelUp({
      level: s.level - this.pendingLevelUps + 1,
      cards: this.offers.map((u) => {
        const stacks = upgradeStacks(s, u.id);
        return {
          name: u.name, text: upgradeText(u), icon: u.icon, category: u.category, evolution: !!u.requires,
          tag: stacks > 0 ? `Lv ${stacks} → ${stacks + 1}` : u.rarity === "common" ? "new" : `new · ${u.rarity}`,
          tags: (u.tags ?? []).map((t) => ({ label: SYNERGIES[t].label, color: SYNERGIES[t].color })),
        };
      }),
      synergies: (Object.keys(SYNERGIES) as UpgradeTag[]).map((tag) => {
        const tier = s.synergyTiers.get(tag) ?? 0;
        const next = SYNERGIES[tag].tiers[tier];
        return { label: SYNERGIES[tag].label, color: SYNERGIES[tag].color, count: counts[tag], next: next ? next.count : null, tier };
      }),
      rerolls: s.rerolls,
      banishes: s.banishes,
      onPick: (i) => this.pickLevelUp(i),
      onReroll: () => {
        if (s.rerolls <= 0) return;
        s.rerolls--;
        const fresh = rollUpgrades(s, XP.choices, "levelUp", this.offers.map((u) => u.id));
        // Not enough new options left: allow repeats of the current ones.
        this.offers = fresh.length >= Math.min(XP.choices, this.offers.length) ? fresh : rollUpgrades(s, XP.choices, "levelUp");
        this.showLevelUp();
      },
      onBanish: (i) => {
        if (s.banishes <= 0) return;
        s.banishes--;
        s.banished.add(this.offers[i].id);
        const [replacement] = rollUpgrades(s, 1, "levelUp", this.offers.map((u) => u.id));
        if (replacement) this.offers[i] = replacement;
        else this.offers.splice(i, 1);
        if (!this.offers.length) this.offers = rollUpgrades(s, XP.choices, "levelUp");
        if (!this.offers.length) {
          this.pickLevelUp(-1);
          return;
        }
        this.showLevelUp();
      },
    });
  }

  /** Applies offer `i` (-1: nothing left to offer), closes the screen and resumes play. */
  private pickLevelUp(i: number): void {
    this.pendingLevelUps--;
    this.hud.closeModal();
    this.choosing = false;
    this.app.timeScale = 1;
    if (i >= 0) this.announce(applyUpgrade(this.stats, this.offers[i].id));
  }

  /** Upgrade toast, then a toast per synergy tier it completed. */
  private announce(result: { def: UpgradeDef; synergies: SynergyReached[] }): void {
    this.hud.showUpgrade(result.def, this.player.entity);
    for (const { tag, tier, level } of result.synergies) {
      const syn = SYNERGIES[tag];
      this.hud.showUpgrade({
        name: `${syn.label} synergy ${"I".repeat(level)} · ${tier.name}`, stat: tier.text, value: "", icon: syn.icon,
        category: "special", rarity: "common", color: syn.color,
      }, this.player.entity);
    }
  }

  /** Between waves: spend cash. */
  private openShop(next: number): void {
    this.phase = "shop";
    const s = this.stats;
    const items = SHOP.filter((item) => (!item.weapon || WEAPON_STATS[item.weapon]) && (!item.campaign || this.armorySeen));
    const count = (item: ShopItem) => s.bought.get(item.id) ?? 0;
    const maxed = (item: ShopItem) => item.max !== undefined && count(item) >= item.max;
    const soldOut = (item: ShopItem) => (item.weapon ? s.owned.has(item.weapon) : false) || (item.id === "heal" && s.hp >= s.maxHp) || maxed(item);
    const note = (item: ShopItem) => item.weapon ? "Owned" : maxed(item) ? `Maxed ${count(item)}/${item.max}` : "HP full";
    this.hud.openModal({
      title: "SHOP",
      compact: true,
      text: `Cash: ${s.cash}$ · HP ${Math.ceil(s.hp)}/${s.maxHp} · ${WEAPONS.list[s.weapon]?.label ?? s.weapon}`,
      cards: items.map((item) => ({
        title: maxed(item) ? item.title : `${item.title} — ${this.shopPrice(item)}$`,
        text: soldOut(item) ? note(item) : item.max !== undefined ? `${item.text} · ${count(item)}/${item.max}` : item.text,
        tag: item.weapon ? "weapon" : "",
        kind: item.weapon ? "weapon" : "player",
        disabled: soldOut(item) || s.cash < this.shopPrice(item),
      })),
      onCard: (i) => {
        const item = items[i];
        const price = this.shopPrice(item);
        if (s.cash < price || soldOut(item)) return;
        s.cash -= price;
        s.bought.set(item.id, count(item) + 1);
        this.buy(item);
        this.openShop(next);
      },
      actions: [{ label: `${this.wayOn(next) ? "On to" : "Start"} ${this.levels[next].label}`, onClick: () => this.beforeLevel(next) }],
    });
  }

  /** What `item` costs now (its price grows with each purchase this run). */
  shopPrice(item: ShopItem): number {
    return shopPrice(item, this.stats.bought.get(item.id) ?? 0);
  }

  /** The last level gets a warning first: this is the final encounter. */
  private beforeLevel(next: number): void {
    if (this.campaign?.run && next === this.campaign.run.finalLevel) {
      this.hud.openModal({
        title: "THE FINAL ENCOUNTER",
        text: "The Archfiend waits on its throne. There is no way back and no second chance: read its attacks, move, and trust your build.",
        actions: [{ label: `Enter ${this.levels[next].label}`, onClick: () => this.proceed(next) }],
      });
      return;
    }
    this.proceed(next);
  }

  /** The current zone's way on to level `next` (campaigns whose zones have exits), or null. */
  private wayOn(next: number): { zone: string; exit: NonNullable<Zone["exit"]>; region: LevelBounds } | null {
    const zone = this.levels[this.director.waveIndex]?.zone;
    const from = this.zoneOf(this.director.waveIndex), to = this.zoneOf(next);
    return zone && from?.exit && to && this.campaign?.exits ? { zone, exit: from.exit, region: to.region } : null;
  }

  /** Next level: walk there over the map when the zone has a way on, else start it in place. */
  private proceed(next: number): void {
    const way = this.wayOn(next);
    const exits = way ? this.campaign!.exits!(way.zone) : [];
    if (!way || !exits.length) {
      this.startWave(next);
      return;
    }
    this.travel = { next, zone: way.zone, exits, opened: exits.map(() => false), exit: way.exit, region: way.region };
    this.phase = "travel";
    this.hud.closeModal();
    this.player.controlsEnabled = true;
    // Free to walk this zone and the next one (the island rims and bridge walls still hold).
    const a = this.region, b = way.region;
    this.player.bounds = { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) };
    this.hud.showBanner("The way is open", 2.4);
  }

  /** Walking to the way on: seals open as the hero comes near; past the line, the next level starts. */
  private updateTravel(position: Vec3): void {
    const t = this.travel!;
    for (let i = 0; i < t.exits.length; i++) {
      if (t.opened[i] || wayDistance(t.exits[i], position, this.wayPoint) > TRAVEL.openDistance) continue;
      t.opened[i] = true;
      this.campaign?.openExit?.(t.zone, i);
      const w = t.exits[i];
      this.effects.explosion(this.tmp.set(w.x, 0.4, w.z), Math.min(3, w.width / 2));
    }
    const along = (t.exit.axis === "z" ? position.z : position.x) - t.exit.at;
    const r = t.region;
    const inside = position.x > r.minX + 1 && position.x < r.maxX - 1 && position.z > r.minZ + 1 && position.z < r.maxZ - 1;
    if (along * t.exit.dir > TRAVEL.crossDistance && inside) {
      this.travel = null;
      this.startWave(t.next, true);
    }
  }

  /**
   * The Infernal Pact (before Hell's last act): three build-defining upgrades, each with a price;
   * one must be taken. Then the shop.
   */
  private openPact(next: number): void {
    this.phase = "shop";
    const offers = rollUpgrades(this.stats, 3, "pact");
    if (!offers.length) {
      this.openShop(next);
      return;
    }
    this.hud.openModal({
      title: "THE INFERNAL PACT",
      text: "Deeper Hell will test your build. Choose one pact - its power has a price.",
      cards: offers.map((u) => ({ title: u.name, text: upgradeText(u), tag: "pact", kind: "special" })),
      onCard: (i) => {
        this.announce(applyUpgrade(this.stats, offers[i].id));
        this.openShop(next);
      },
    });
  }

  /**
   * The Infernal Armory (after the first Hell boss): one new rifle, free. Each suits a different
   * build; the other one is sold in the shop from now on. Then the shop.
   */
  private openArmory(next: number, weapons: readonly WeaponId[]): void {
    this.phase = "shop";
    this.armorySeen = true;
    const offers = weapons.filter((id) => WEAPON_STATS[id] && !this.stats.owned.has(id));
    if (!offers.length) {
      this.openShop(next);
      return;
    }
    this.hud.openModal({
      title: "THE INFERNAL ARMORY",
      text: "The Glutton guarded a cache of hellforged rifles. Take one - the other waits in the shop.",
      cards: offers.map((id) => ({ title: WEAPONS.list[id].label, text: WEAPON_CARDS[id]?.text ?? "", tag: "weapon", kind: "weapon" })),
      onCard: (i) => {
        this.equip(offers[i]);
        this.openShop(next);
      },
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
    if (this.stats.healOnKill > 0) this.stats.heal(this.stats.healOnKill);
    this.pendingLevelUps += this.stats.gainXp(enemy.def.xp);
    if (this.stats.vampireChance > 0 && Math.random() < this.stats.vampireChance) this.stats.heal(this.stats.vampireHeal);
    // Drops: most zombies leave nothing, so the ground stays readable.
    const { x, z } = enemy.position;
    if (enemy.def.deathFx === "ember") {
      // Demons burst into embers and leave a scorch mark.
      this.tmp.set(x, 0.6 * enemy.scale + enemy.lift, z);
      this.effects.explosion(this.tmp, (enemy.def.boss ? 2.4 : 0.55) * Math.min(2, enemy.scale));
      this.effects.flame(this.tmp);
      this.effects.bloodDecal(x, z, enemy.scale * (enemy.def.boss ? 1.6 : 0.8));
    } else this.effects.bloodDecal(x, z, enemy.scale * (enemy.def.boss ? 1.6 : 1));
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
      if (pick) this.announce(applyUpgrade(s, pick));
    }
  }

  /** Level hazards: environmental meteor showers around the hero (Hell's last act). */
  private environment(dt: number, position: Vec3): void {
    const m = this.director.wave.meteors;
    if (!m) return;
    this.meteorTimer -= dt;
    if (this.meteorTimer > 0) return;
    this.meteorTimer = m.every * (0.7 + Math.random() * 0.6);
    const w = this.director.wave;
    for (let i = 0; i < m.count; i++) {
      const r = i === 0 ? 0.5 : 2 + Math.random() * 4, a = Math.random() * Math.PI * 2;
      this.hazards.strike(position.x + Math.sin(a) * r, position.z + Math.cos(a) * r, m.radius, 1.3 + i * 0.25, m.damage * w.damageScale, "meteor", 3, 8);
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
      this.combat.update(dt);
      this.hazards.update(dt, position, this.player.radius);
      this.environment(dt, position);
      if (this.director.phase === "complete") this.waveComplete();
    } else if (this.phase === "cleared") {
      this.enemies.update(dt, position, false);
      this.clearTimer -= dt;
      if (this.clearTimer <= 0 && !this.choosing) this.afterWave();
    } else if (this.phase === "travel" && !this.choosing) {
      this.updateTravel(position);
    }
    this.gun.update(dt, this.player, this.weapons, this.characterScale(), combat && this.stats.alive);
    this.drones.update(dt, position, this.stats.drones, this.characterScale(), combat && this.stats.alive);
    if (combat || this.phase === "cleared") this.pickups.update(dt, position, this.characterScale(), this.phase === "cleared");
    this.effects.update(dt);
    this.campaign?.update?.(dt);
    // Level-ups wait for combat (or the wave-complete pause) and a living hero.
    if (this.pendingLevelUps > 0 && !this.choosing && (combat || this.phase === "cleared" || this.phase === "travel") && this.stats.alive) this.openLevelUp();
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
    if (this.travel) this.hud.setWave(this.levels[this.travel.next].label, 0, "GO");
    else this.hud.setWave(d.wave.label, d.progress, right);
    this.hud.setXp(s.level, s.xp, s.xpNeeded);
    const boss = d.boss && isAlive(d.boss) ? d.boss : null;
    this.hud.setBoss(boss ? boss.def.label : null, boss ? boss.hp / boss.maxHp : 0);
    // Off-screen pointer: the way on while travelling, else the boss (the arenas are large; its
    // attacks can land from off screen).
    const hero = this.player.entity.getPosition();
    const combatBoss = boss && this.phase === "combat" ? boss : null;
    if (this.travel) {
      const t = this.travel;
      let best = Infinity;
      const past = ((t.exit.axis === "z" ? hero.z : hero.x) - t.exit.at) * t.exit.dir > 0;
      if (past) {
        // Through the seal: lead on into the next zone (its near edge, straight ahead), not back.
        const r = t.region;
        const edge = t.exit.dir < 0 ? (t.exit.axis === "z" ? r.maxZ : r.maxX) - 2 : (t.exit.axis === "z" ? r.minZ : r.minX) + 2;
        if (t.exit.axis === "z") this.wayPoint.set(Math.min(r.maxX - 2, Math.max(r.minX + 2, hero.x)), 0, edge);
        else this.wayPoint.set(edge, 0, Math.min(r.maxZ - 2, Math.max(r.minZ + 2, hero.z)));
        best = Math.hypot(this.wayPoint.x - hero.x, this.wayPoint.z - hero.z);
      } else {
        for (const w of t.exits) {
          const dist = wayDistance(w, hero, this.tmp);
          if (dist < best) {
            best = dist;
            this.wayPoint.copy(this.tmp);
          }
        }
      }
      this.hud.setPointer(Number.isFinite(best) ? this.wayPoint : null, best, "way");
    } else {
      this.hud.setPointer(combatBoss?.position ?? null, combatBoss ? Math.hypot(combatBoss.position.x - hero.x, combatBoss.position.z - hero.z) : 0, "boss");
    }
    this.hud.update(dt, this.projector);
    this.targetDebug.update(this.gun.debug);
  }
}

/** The walk between campaign levels. */
const TRAVEL = {
  /** A way-on seal opens when the hero comes this close (m). */
  openDistance: 4.5,
  /** The next level starts this far past the exit line (m), inside the next region. */
  crossDistance: 3,
};

/** Distance (m, ground plane) from `p` to a way-on seal; its nearest point goes to `out`. */
function wayDistance(w: WayPoint, p: Vec3, out: Vec3): number {
  const half = w.width / 2;
  const alongX = Math.abs(((w.yawDeg % 180) + 180) % 180) < 45;
  const x = alongX ? Math.min(w.x + half, Math.max(w.x - half, p.x)) : w.x;
  const z = alongX ? w.z : Math.min(w.z + half, Math.max(w.z - half, p.z));
  out.set(x, 0, z);
  return Math.hypot(p.x - x, p.z - z);
}
