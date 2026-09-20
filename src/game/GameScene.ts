import Phaser from "phaser";
import { ENEMIES, RUN_LENGTH_SECONDS, UPGRADE_COPY } from "./config";
import { createGameTextures } from "./TextureFactory";
import { Weapon } from "./Weapon";
import { contractComplete } from "./math";
import { drawWasteland } from "./World";
import type { EnemyKind, HudState, ResultState, RunMode, UpgradeChoice, UpgradeId } from "./types";

const WORLD_SIZE = 2600;

export class GameScene extends Phaser.Scene {
  readonly uiEvents = new Phaser.Events.EventEmitter();
  private mode: RunMode = "menu";
  private player!: Phaser.Physics.Arcade.Sprite;
  private rifle!: Phaser.GameObjects.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private moveInput = new Phaser.Math.Vector2();
  private firing = false;
  private autoFire = false;
  private manualAim: number | null = null;
  private weapon = new Weapon();
  private facing = 0;
  private elapsed = 0;
  private remaining = RUN_LENGTH_SECONDS;
  private spawnClock = 0;
  private eliteClock = 0;
  private bossSpawned = false;
  private bossDefeated = false;
  private boss: Phaser.Physics.Arcade.Sprite | null = null;
  private hp = 100;
  private maxHp = 100;
  private moveSpeed = 205;
  private hitFlash = 0;
  private hudClock = 0;
  private recoil = 0;
  private muzzle!: Phaser.GameObjects.Image;
  private effects!: Phaser.GameObjects.Group;
  private healthBars!: Phaser.GameObjects.Graphics;
  private kills = 0;
  private xp = 0;
  private xpToNext = 14;
  private level = 1;
  private invulnerable = 0;
  private enemyId = 0;
  private upgradeLevels: Record<UpgradeId, number> = {
    damage: 0,
    firerate: 0,
    magazine: 0,
    crit: 0,
    speed: 0,
    pierce: 0,
  };

  constructor() {
    super("game");
  }

  create(): void {
    createGameTextures(this);
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBackgroundColor("#342c28");
    drawWasteland(this, WORLD_SIZE);

    this.enemies = this.physics.add.group({ maxSize: 90 });
    this.bullets = this.physics.add.group({ maxSize: 70 });
    this.enemyBullets = this.physics.add.group({ maxSize: 40 });
    this.pickups = this.physics.add.group({ maxSize: 80 });
    this.effects = this.add.group({ maxSize: 100 });
    this.healthBars = this.add.graphics().setDepth(12);

    this.player = this.physics.add.sprite(WORLD_SIZE / 2, WORLD_SIZE / 2, "wastelander");
    this.player.setDepth(10).setCircle(17, 9, 12).setCollideWorldBounds(true);
    this.rifle = this.add.image(this.player.x + 28, this.player.y, "rifle").setOrigin(0.18, 0.5).setDepth(11);
    this.muzzle = this.add.image(0, 0, "muzzle").setOrigin(0, 0.5).setDepth(12).setVisible(false);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.physics.add.overlap(this.bullets, this.enemies, (bullet, enemy) => {
      this.hitEnemy(bullet as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.player, this.enemies, (player, enemy) => {
      this.touchEnemy(player as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (player, projectile) => {
      this.hitPlayerWithProjectile(player as Phaser.GameObjects.GameObject, projectile as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.player, this.pickups, (player, pickup) => {
      this.collectPickup(player as Phaser.GameObjects.GameObject, pickup as Phaser.GameObjects.GameObject);
    });

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.mode = "menu";
    this.physics.pause();
    this.uiEvents.emit("ready");
  }

  startRun(loadout: UpgradeId = "damage"): void {
    this.tweens.killAll();
    this.effects.clear(true, true);
    this.clearGroups();
    this.mode = "playing";
    this.physics.resume();
    this.tweens.resumeAll();
    this.elapsed = 0;
    this.remaining = RUN_LENGTH_SECONDS;
    this.spawnClock = 0.4;
    this.eliteClock = 16;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.boss = null;
    this.hp = 100;
    this.maxHp = 100;
    this.moveSpeed = 205;
    this.weapon = new Weapon();
    this.weapon.upgrade(loadout);
    this.hitFlash = 0;
    this.hudClock = 0;
    this.recoil = 0;
    this.manualAim = null;
    this.muzzle.setVisible(false);
    this.healthBars.clear();
    this.kills = 0;
    this.xp = 0;
    this.xpToNext = 14;
    this.level = 1;
    this.invulnerable = 0;
    this.enemyId = 0;
    this.firing = false;
    this.autoFire = false;
    this.moveInput.set(0, 0);
    this.upgradeLevels = { damage: 0, firerate: 0, magazine: 0, crit: 0, speed: 0, pierce: 0 };
    this.upgradeLevels[loadout] = 1;
    this.player.enableBody(true, WORLD_SIZE / 2, WORLD_SIZE / 2, true, true);
    this.player.setAlpha(1).clearTint().setVelocity(0, 0).setAngle(0);
    this.rifle.setVisible(true);
    this.cameras.main.fadeIn(220, 20, 16, 16);
    this.uiEvents.emit("toast", "CONTRACT LIVE // SURVIVE 90 SECONDS");
    this.emitHud();
  }

  setMove(x: number, y: number): void {
    this.moveInput.set(x, y);
    if (this.moveInput.lengthSq() > 1) this.moveInput.normalize();
  }

  setFiring(active: boolean): void {
    this.firing = active && this.mode === "playing";
  }

  setAim(angle: number | null): void {
    this.manualAim = angle;
  }

  setAutoFire(active: boolean): void {
    this.autoFire = active;
  }

  pauseIfPlaying(): void {
    if (this.mode === "playing") this.togglePause();
  }

  requestReload(): void {
    if (this.mode !== "playing") return;
    this.beginReload();
  }

  togglePause(forceResume = false): void {
    if (this.mode === "playing" && !forceResume) {
      this.mode = "paused";
      this.firing = false;
      this.player.setVelocity(0, 0);
      this.physics.pause();
      this.tweens.pauseAll();
      this.uiEvents.emit("paused", true);
      return;
    }
    if (this.mode === "paused") {
      this.mode = "playing";
      this.physics.resume();
      this.tweens.resumeAll();
      this.uiEvents.emit("paused", false);
    }
  }

  abandonRun(): void {
    if (this.mode === "menu") return;
    this.finish(false);
  }

  applyUpgrade(id: UpgradeId): void {
    if (this.mode !== "upgrading") return;
    this.upgradeLevels[id] += 1;
    this.weapon.upgrade(id);
    if (id === "speed") this.moveSpeed = Math.min(350, this.moveSpeed * 1.12);
    this.hp = Math.min(this.maxHp, this.hp + 12);
    this.mode = "playing";
    this.physics.resume();
    this.tweens.resumeAll();
    this.uiEvents.emit("upgrade-closed");
    this.uiEvents.emit("toast", `${UPGRADE_COPY[id].title} // INSTALLED`);
    this.emitHud();
  }

  update(_time: number, deltaMs: number): void {
    if (this.mode !== "playing") {
      return;
    }

    const dt = Math.min(deltaMs / 1000, 0.035);
    this.elapsed += dt;
    this.remaining = Math.max(0, RUN_LENGTH_SECONDS - this.elapsed);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.player.setTint(this.hitFlash > 0 ? 0xff7744 : 0xffffff);
    if (this.weapon.update(dt)) this.uiEvents.emit("toast", "LOCKED. LOADED. RUDE.");
    this.spawnClock -= dt;
    this.eliteClock -= dt;

    this.updateMovement();
    this.updateWeapon(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);

    if (this.spawnClock <= 0 && this.remaining > 0) {
      this.spawnClock = Math.max(0.38, 1.02 - this.elapsed * 0.006);
      const kind: EnemyKind = this.elapsed > 12 && Math.random() < 0.34 ? "spitter" : "raider";
      this.spawnEnemy(kind);
    }
    if (this.eliteClock <= 0 && this.elapsed < 58) {
      this.eliteClock = 22;
      this.spawnEnemy("brute");
      this.uiEvents.emit("toast", "BAD NEWS // BRUTE INBOUND");
    }
    if (!this.bossSpawned && this.elapsed >= 60) {
      this.bossSpawned = true;
      this.spawnEnemy("boss");
      this.uiEvents.emit("toast", "BOUNTY TARGET // THE FOREMAN");
      this.cameras.main.shake(420, 0.012);
    }
    if (contractComplete(this.elapsed, RUN_LENGTH_SECONDS, this.bossDefeated)) this.finish(true);

    this.hudClock -= dt;
    if (this.hudClock <= 0) {
      this.hudClock = 0.08;
      this.emitHud();
    }
  }

  private updateMovement(): void {
    let x = this.moveInput.x;
    let y = this.moveInput.y;
    if (this.cursors.left?.isDown || this.wasd.A?.isDown) x -= 1;
    if (this.cursors.right?.isDown || this.wasd.D?.isDown) x += 1;
    if (this.cursors.up?.isDown || this.wasd.W?.isDown) y -= 1;
    if (this.cursors.down?.isDown || this.wasd.S?.isDown) y += 1;
    const movement = new Phaser.Math.Vector2(x, y);
    if (movement.lengthSq() > 1) movement.normalize();
    this.player.setVelocity(movement.x * this.moveSpeed, movement.y * this.moveSpeed);
    if (Math.abs(movement.x) > 0.05) this.player.setFlipX(movement.x < 0);
    this.player.setAngle(Math.sin(this.elapsed * 11) * Math.min(2.5, movement.length() * 2.5));
    const frame = movement.lengthSq() > 0.01 ? Math.floor(this.elapsed * 10) % 4 : 0;
    this.player.setTexture(`wastelander-${frame}`);
  }

  private updateWeapon(dt: number): void {
    const target = this.findNearestEnemy();
    if (this.manualAim !== null) this.facing = this.manualAim;
    else if (target) this.facing = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    this.recoil = Math.max(0, this.recoil - dt * 45);
    const targetAngle = Phaser.Math.RadToDeg(this.facing);
    this.rifle.setPosition(
      this.player.x + Math.cos(this.facing) * (12 - this.recoil),
      this.player.y + Math.sin(this.facing) * (12 - this.recoil),
    );
    this.rifle.setAngle(targetAngle);
    this.rifle.setFlipY(Math.cos(this.facing) < 0);
    this.muzzle.setVisible(this.recoil > 3).setRotation(this.facing).setPosition(
      this.player.x + Math.cos(this.facing) * 59,
      this.player.y + Math.sin(this.facing) * 59,
    );

    if (this.weapon.reloadLeft > 0) {
      this.rifle.setAngle(targetAngle + Math.sin(this.elapsed * 35) * 7);
      return;
    }

    if ((this.firing || (this.autoFire && target !== null)) && this.weapon.cooldown <= 0) this.shoot();
  }

  private shoot(): void {
    if (this.weapon.reloadLeft > 0 || this.weapon.cooldown > 0) return;
    const spread = Phaser.Math.FloatBetween(-0.045, 0.045);
    const angle = this.facing + spread;
    const bullet = this.bullets.get(
      this.player.x + Math.cos(angle) * 41,
      this.player.y + Math.sin(angle) * 41,
      "bullet",
    ) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) return;
    if (!this.weapon.shoot()) { bullet.disableBody(true, true); return; }
    const critical = Math.random() < this.weapon.critChance;
    bullet.enableBody(true, bullet.x, bullet.y, true, true);
    bullet.setDepth(9).setRotation(angle);
    bullet.setCircle(4, 6, 2);
    bullet.setVelocity(Math.cos(angle) * 720, Math.sin(angle) * 720);
    bullet.setData("damage", this.weapon.damage * (critical ? 2 : 1));
    bullet.setData("critical", critical);
    bullet.setData("pierce", this.weapon.pierce);
    bullet.setData("hits", new Set<number>());
    bullet.setData("life", 1.05);
    this.recoil = 5;
    this.cameras.main.shake(45, 0.0022);
    this.uiEvents.emit("shot");
    if (this.weapon.ammo === 0) this.uiEvents.emit("toast", "RELOADING // KEEP MOVING");
  }

  private beginReload(): void {
    if (this.mode === "playing" && this.weapon.reload()) this.uiEvents.emit("toast", "RELOADING // KEEP MOVING");
  }

  private spawnEnemy(kind: EnemyKind): void {
    const config = ENEMIES[kind];
    const angle = Math.random() * Math.PI * 2;
    const view = this.cameras.main;
    const distance = Math.min((view.width / 2 + 55) / Math.max(0.01, Math.abs(Math.cos(angle))),
      (view.height / 2 + 55) / Math.max(0.01, Math.abs(Math.sin(angle))));
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * distance, 50, WORLD_SIZE - 50);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * distance, 50, WORLD_SIZE - 50);
    const enemy = this.enemies.get(x, y, config.texture) as Phaser.Physics.Arcade.Sprite | null;
    if (!enemy) return;
    const scale = 1 + this.elapsed * 0.004;
    // Group.get reuses inactive objects without applying the new texture or scale.
    enemy.setTexture(config.texture).setScale(1).setAlpha(1).clearTint().setAngle(0);
    enemy.enableBody(true, x, y, true, true);
    enemy.setDepth(8).setCircle(config.radius, enemy.width / 2 - config.radius, enemy.height / 2 - config.radius).setDataEnabled();
    enemy.setData({
      id: ++this.enemyId,
      kind,
      hp: config.hp * scale,
      maxHp: config.hp * scale,
      speed: config.speed * (1 + this.elapsed * 0.0015),
      damage: config.damage,
      xp: config.xp,
      cooldown: Phaser.Math.FloatBetween(0.4, 1.5),
      contact: 0,
      flash: 0,
    });
    if (kind === "boss") this.boss = enemy;
  }

  private updateEnemies(dt: number): void {
    this.healthBars.clear();
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
      const kind = enemy.getData("kind") as EnemyKind;
      const config = ENEMIES[kind];
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      let velocity = enemy.getData("speed") as number;
      let cooldown = (enemy.getData("cooldown") as number) - dt;
      enemy.setData("contact", Math.max(0, (enemy.getData("contact") as number) - dt));
      enemy.setData("flash", Math.max(0, (enemy.getData("flash") as number) - dt));

      if (config.ranged && distance < (kind === "boss" ? 440 : 310)) {
        velocity *= distance < 210 ? -0.35 : 0.12;
        if (cooldown <= 0) {
          this.enemyShoot(enemy, kind === "boss");
          cooldown = kind === "boss" ? 0.78 : 1.7;
        }
      }
      enemy.setData("cooldown", cooldown);
      enemy.setVelocity(Math.cos(angle) * velocity, Math.sin(angle) * velocity);
      enemy.setFlipX(Math.cos(angle) < 0);
      enemy.setAngle(Math.sin(this.elapsed * 9 + enemy.getData("id")) * 4);
      if (enemy.getData("flash") > 0) enemy.setAlpha(0.66);
      else enemy.setAlpha(1);
      if (kind === "brute" || kind === "boss") {
        const w = enemy.width * 0.8;
        const y = enemy.y - enemy.height / 2 - 10;
        this.healthBars.fillStyle(0x171318).fillRect(enemy.x - w / 2 - 2, y - 2, w + 4, 7);
        this.healthBars.fillStyle(kind === "boss" ? 0xb8d84a : 0xe8602f)
          .fillRect(enemy.x - w / 2, y, w * Math.max(0, enemy.getData("hp") / enemy.getData("maxHp")), 3);
      }
      return true;
    });
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite, volley: boolean): void {
    const base = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const shots = volley ? [-0.22, 0, 0.22] : [0];
    for (const offset of shots) {
      const angle = base + offset;
      const projectile = this.enemyBullets.get(enemy.x, enemy.y, "enemy-bullet") as Phaser.Physics.Arcade.Sprite | null;
      if (!projectile) continue;
      projectile.enableBody(true, enemy.x, enemy.y, true, true);
      projectile.setCircle(5, 3, 3);
      projectile.setDepth(7).setVelocity(Math.cos(angle) * 260, Math.sin(angle) * 260);
      projectile.setData("damage", volley ? 14 : 10);
      projectile.setData("life", 2.2);
    }
  }

  private updateProjectiles(dt: number): void {
    const updateGroup = (group: Phaser.Physics.Arcade.Group): void => {
      group.children.each((child) => {
        const projectile = child as Phaser.Physics.Arcade.Sprite;
        if (!projectile.active) return true;
        const life = (projectile.getData("life") as number) - dt;
        projectile.setData("life", life);
        if (life <= 0) projectile.disableBody(true, true);
        return true;
      });
    };
    updateGroup(this.bullets);
    updateGroup(this.enemyBullets);
  }

  private updatePickups(dt: number): void {
    this.pickups.children.each((child) => {
      const pickup = child as Phaser.Physics.Arcade.Sprite;
      if (!pickup.active) return true;
      pickup.setRotation(pickup.rotation + dt * 2.5);
      const distance = Phaser.Math.Distance.Between(pickup.x, pickup.y, this.player.x, this.player.y);
      if (distance < 105) {
        const angle = Phaser.Math.Angle.Between(pickup.x, pickup.y, this.player.x, this.player.y);
        pickup.setVelocity(Math.cos(angle) * 280, Math.sin(angle) * 280);
      } else {
        pickup.setVelocity(0, 0);
      }
      return true;
    });
  }

  private hitEnemy(
    bulletObject: Phaser.GameObjects.GameObject,
    enemyObject: Phaser.GameObjects.GameObject,
  ): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    if (this.mode !== "playing" || !bullet.active || !enemy.active) return;
    const hits = bullet.getData("hits") as Set<number>;
    const enemyId = enemy.getData("id") as number;
    if (hits.has(enemyId)) return;
    hits.add(enemyId);
    const damage = bullet.getData("damage") as number;
    const critical = bullet.getData("critical") as boolean;
    enemy.setData("hp", (enemy.getData("hp") as number) - damage);
    enemy.setData("flash", 0.07);
    this.damageNumber(enemy.x, enemy.y - 20, Math.round(damage), critical);
    this.impact(enemy.x, enemy.y, critical ? 0xf2b632 : 0xe7ddc6);
    let pierce = bullet.getData("pierce") as number;
    if (pierce <= 0) bullet.disableBody(true, true);
    else bullet.setData("pierce", --pierce);
    if ((enemy.getData("hp") as number) <= 0) this.killEnemy(enemy);
  }

  private touchEnemy(
    _playerObject: Phaser.GameObjects.GameObject,
    enemyObject: Phaser.GameObjects.GameObject,
  ): void {
    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    if (this.mode !== "playing" || !enemy.active || this.invulnerable > 0 || (enemy.getData("contact") as number) > 0) return;
    enemy.setData("contact", 0.8);
    this.hurtPlayer(enemy.getData("damage") as number);
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    this.player.setVelocity(Math.cos(angle) * 330, Math.sin(angle) * 330);
  }

  private hitPlayerWithProjectile(
    _playerObject: Phaser.GameObjects.GameObject,
    projectileObject: Phaser.GameObjects.GameObject,
  ): void {
    const projectile = projectileObject as Phaser.Physics.Arcade.Sprite;
    if (this.mode !== "playing" || !projectile.active) return;
    projectile.disableBody(true, true);
    this.hurtPlayer(projectile.getData("damage") as number);
  }

  private hurtPlayer(amount: number): void {
    if (this.invulnerable > 0 || this.mode !== "playing") return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = 0.48;
    this.hitFlash = 0.1;
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(90, 214, 55, 50, false);
    if (navigator.vibrate) navigator.vibrate([25, 20, 35]);
    if (this.hp <= 0) this.finish(false);
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    const kind = enemy.getData("kind") as EnemyKind;
    const xpValue = enemy.getData("xp") as number;
    const drops = kind === "boss" ? 10 : kind === "brute" ? 4 : 1;
    for (let index = 0; index < drops; index += 1) {
      const pickup = this.pickups.get(
        enemy.x + Phaser.Math.Between(-14, 14),
        enemy.y + Phaser.Math.Between(-14, 14),
        "scrap",
      ) as Phaser.Physics.Arcade.Sprite | null;
      if (!pickup) continue;
      pickup.enableBody(true, pickup.x, pickup.y, true, true);
      pickup.setDepth(6).setData("value", xpValue / drops);
    }
    this.impact(enemy.x, enemy.y, kind === "boss" ? 0xb8d84a : 0xe8602f, kind === "boss" ? 22 : 8);
    enemy.disableBody(true, true);
    this.kills += 1;
    if (kind === "boss") {
      this.bossDefeated = true;
      this.uiEvents.emit("toast", "THE FOREMAN IS DOWN // HOLD THE LINE");
      this.cameras.main.flash(240, 184, 216, 74, false);
    }
    if (kind === "brute") this.hp = Math.min(this.maxHp, this.hp + 10);
  }

  private collectPickup(
    _playerObject: Phaser.GameObjects.GameObject,
    pickupObject: Phaser.GameObjects.GameObject,
  ): void {
    const pickup = pickupObject as Phaser.Physics.Arcade.Sprite;
    if (this.mode !== "playing" || !pickup.active) return;
    this.xp += pickup.getData("value") as number;
    pickup.disableBody(true, true);
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.28 + 4);
      this.presentUpgrade();
    }
  }

  private presentUpgrade(): void {
    this.mode = "upgrading";
    this.physics.pause();
    this.tweens.pauseAll();
    this.player.setVelocity(0, 0);
    this.firing = false;
    const ids = Phaser.Utils.Array.Shuffle(Object.keys(UPGRADE_COPY) as UpgradeId[]).slice(0, 3);
    const choices: UpgradeChoice[] = ids.map((id) => ({
      id,
      ...UPGRADE_COPY[id],
      level: this.upgradeLevels[id] + 1,
    }));
    this.uiEvents.emit("upgrade", choices);
  }

  private damageNumber(x: number, y: number, value: number, critical: boolean): void {
    if (this.effects.isFull()) return;
    const text = this.add.text(x, y, critical ? `${value}!` : String(value), {
      fontFamily: "Barlow Condensed, sans-serif",
      fontSize: critical ? "25px" : "17px",
      fontStyle: "bold",
      color: critical ? "#f2b632" : "#e7ddc6",
      stroke: "#171318",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(20);
    this.effects.add(text);
    this.tweens.add({
      targets: text,
      y: y - 42,
      alpha: 0,
      scale: critical ? 1.35 : 1,
      duration: 540,
      ease: "Cubic.Out",
      onComplete: () => this.effects.remove(text, true, true),
    });
  }

  private impact(x: number, y: number, tint: number, count = 5): void {
    for (let index = 0; index < count; index += 1) {
      if (this.effects.isFull()) break;
      const particle = this.add.image(x, y, "dust").setTint(tint).setDepth(15);
      this.effects.add(particle);
      const angle = Math.random() * Math.PI * 2;
      const distance = Phaser.Math.Between(18, 68);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.4, 1.5),
        duration: Phaser.Math.Between(180, 420),
        onComplete: () => this.effects.remove(particle, true, true),
      });
    }
  }

  private findNearestEnemy(): Phaser.Physics.Arcade.Sprite | null {
    let nearest: Phaser.Physics.Arcade.Sprite | null = null;
    let nearestDistance = 520 * 520;
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return true;
      const distance = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
      return true;
    });
    return nearest;
  }

  private finish(won: boolean): void {
    if (this.mode === "won" || this.mode === "lost" || this.mode === "menu") return;
    this.mode = won ? "won" : "lost";
    this.physics.pause();
    this.tweens.pauseAll();
    this.firing = false;
    this.player.setVelocity(0, 0);
    this.rifle.setVisible(false);
    this.muzzle.setVisible(false);
    const result: ResultState = {
      won,
      elapsed: this.elapsed,
      kills: this.kills,
      level: this.level,
    };
    this.uiEvents.emit("result", result);
  }

  private emitHud(): void {
    const state: HudState = {
      hp: this.hp,
      maxHp: this.maxHp,
      ammo: this.weapon.ammo,
      magazine: this.weapon.magazine,
      reloading: this.weapon.reloadLeft > 0,
      reloadProgress: this.weapon.reloadLeft > 0 ? 1 - this.weapon.reloadLeft / this.weapon.reloadDuration : 1,
      remaining: this.remaining,
      kills: this.kills,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      bossRatio: this.boss?.active ? Math.max(0, this.boss.getData("hp") / this.boss.getData("maxHp")) : null,
      bossDefeated: this.bossDefeated,
    };
    this.uiEvents.emit("hud", state);
  }

  private clearGroups(): void {
    this.enemies?.clear(true, true);
    this.bullets?.clear(true, true);
    this.enemyBullets?.clear(true, true);
    this.pickups?.clear(true, true);
  }

}
