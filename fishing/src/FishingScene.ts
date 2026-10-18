import Phaser from "phaser";
import { createFishingTextures, drawLandscape, FISH_LOOK, INK, PAPER, S, YELLOW } from "./art";
import { play } from "./sfx";
import { DAYS, FishingSim, type Fish, type PerkId, type SimEvent, type SimSnapshot } from "./sim";

const TAUNTS = [
  "ОПА! ЕЩЁ ОДИН!",
  "ТУТ МЕСТО ЗНАТЬ НАДО",
  "ДЕРЖИ, ПОКАЖУ КАК НАДО",
  "ЧЁ, НЕ КЛЮЁТ? ХЕ-ХЕ",
  "СЕДЬМОЙ… ИЛИ ВОСЬМОЙ?",
  "МОЖЕТ, НАЖИВКУ ПОМЕНЯЕШЬ?",
  "ИДИ СЮДА, ТУТ НА ВСЕХ ХВАТИТ",
  "У МЕНЯ ДЕД ТАК ЖЕ ЛОВИЛ",
  "О, ТЯЖЁЛЕНЬКИЙ!",
];
const DISTRACT_LINES: Record<string, string[]> = {
  phone: ["АЛЛО? ДА, КЛЮЁТ КАК БЕШЕНАЯ!", "ЗАЙ, Я НА РАБОТЕ… НУ ПОЧТИ"],
  bushes: ["Я В КУСТЫ. СЛЕДИ ЗА УДОЧКОЙ", "ЩАС ПРИДУ, НЕ ТРОГАЙ НИЧЕГО"],
  stretch: ["ЭЭЭХ, СПИНА…", "ХОРОШО СИДИМ!"],
};

interface Layout {
  w: number;
  h: number;
  waterTop: number;
  waterBottom: number;
  groundY: number;
  px: number;
  fx: number;
  myBobber: Phaser.Math.Vector2;
  friendBobber: Phaser.Math.Vector2;
}

export class FishingScene extends Phaser.Scene {
  readonly uiEvents = new Phaser.Events.EventEmitter();
  sim = new FishingSim();
  private mode: "menu" | "playing" | "paused" | "shop" | "over" = "menu";
  private L!: Layout;
  private bg!: Phaser.GameObjects.Image;
  private skyTint!: Phaser.GameObjects.Rectangle;
  private sun!: Phaser.GameObjects.Graphics;
  private clouds: Phaser.GameObjects.Graphics[] = [];
  private water!: Phaser.GameObjects.Graphics;
  private lines!: Phaser.GameObjects.Graphics;
  private arm!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private playerSkin!: Phaser.GameObjects.Image;
  private playerHead!: Phaser.GameObjects.Container;
  private friend!: Phaser.GameObjects.Container;
  private friendBody!: Phaser.GameObjects.Image;
  private friendHead!: Phaser.GameObjects.Image;
  private myBobber!: Phaser.GameObjects.Image;
  private friendBobberImg!: Phaser.GameObjects.Image;
  private alert!: Phaser.GameObjects.Text;
  private cooler!: Phaser.GameObjects.Image;
  private myBucket!: Phaser.GameObjects.Image;
  private friendBucketImg!: Phaser.GameObjects.Image;
  private bucketFish!: Phaser.GameObjects.Graphics;
  private bush!: Phaser.GameObjects.Image;
  private reeds: Phaser.GameObjects.Image[] = [];
  private heldItem!: Phaser.GameObjects.Image;
  private cig!: Phaser.GameObjects.Image;
  private bubble?: Phaser.GameObjects.Container;
  private question!: Phaser.GameObjects.Text;
  private zzz?: Phaser.Time.TimerEvent;
  private t = 0;
  private hudClock = 0;
  private puffClock = 0;
  private friendAway = false;
  private friendRodPull = 0;
  private myRodPull = 0;
  private meltdownRod: Phaser.GameObjects.Graphics[] = [];
  private sway = 0;

  constructor() {
    super("fishing");
  }

  create(): void {
    createFishingTextures(this);
    this.bg = this.add.image(0, 0, "__DEFAULT").setOrigin(0).setDepth(-10);
    this.skyTint = this.add.rectangle(0, 0, 10, 10, 0xff9a7a, 0).setOrigin(0).setDepth(-6);
    this.sun = this.add.graphics().setDepth(-9);
    this.drawSun();
    for (let i = 0; i < 3; i++) this.clouds.push(this.makeCloud(i));
    this.water = this.add.graphics().setDepth(1);
    this.lines = this.add.graphics().setDepth(6);
    this.arm = this.add.graphics().setDepth(14);
    this.myBobber = this.add.image(0, 0, "bobber").setScale(0.5).setOrigin(0.5, 0.6).setDepth(3);
    this.friendBobberImg = this.add.image(0, 0, "bobber").setScale(0.45).setOrigin(0.5, 0.6).setDepth(3);
    this.alert = this.add.text(0, 0, "!", {
      fontFamily: "Oswald, sans-serif", fontSize: "34px", fontStyle: "bold", color: "#f2b632", stroke: "#171318", strokeThickness: 7,
    }).setOrigin(0.5, 1).setDepth(30).setVisible(false);

    for (let i = 0; i < 4; i++) this.reeds.push(this.add.image(0, 0, "reed").setScale(0.5).setOrigin(0.5, 1).setDepth(4));
    this.bush = this.add.image(0, 0, "bush").setScale(0.5).setOrigin(0.5, 1).setDepth(8);
    this.cooler = this.add.image(0, 0, "cooler").setScale(0.5).setOrigin(0.5, 1).setDepth(12);
    this.myBucket = this.add.image(0, 0, "bucket").setScale(0.5).setOrigin(0.5, 1).setDepth(13);
    this.friendBucketImg = this.add.image(0, 0, "bucket").setScale(0.5).setOrigin(0.5, 1).setDepth(12);
    this.bucketFish = this.add.graphics().setDepth(12.5);

    this.friendBody = this.add.image(0, 0, "friend-body").setScale(0.5).setOrigin(0.5, 1);
    this.friendHead = this.add.image(4, -128, "friend-head-back").setScale(0.5).setOrigin(0.5, 0.85);
    this.friend = this.add.container(0, 0, [this.friendBody, this.friendHead]).setDepth(10);

    this.playerBody = this.add.image(0, 0, "player-body").setScale(0.5).setOrigin(0.5, 1);
    this.playerSkin = this.add.image(0, 0, "player-skin").setScale(0.5).setOrigin(0.5, 0.85);
    const hat = this.add.image(0, 0, "player-hat").setScale(0.5).setOrigin(0.5, 0.85);
    this.playerHead = this.add.container(4, -100, [this.playerSkin, hat]);
    this.heldItem = this.add.image(46, -60, "beer").setScale(0.5).setVisible(false);
    this.cig = this.add.image(22, -96, "cig").setScale(0.5).setOrigin(0, 0.5).setVisible(false);
    this.player = this.add.container(0, 0, [this.playerBody, this.playerHead, this.heldItem, this.cig]).setDepth(11);

    this.question = this.add.text(0, 0, "?", {
      fontFamily: "Oswald, sans-serif", fontSize: "30px", fontStyle: "bold", color: "#e7ddc6", stroke: "#171318", strokeThickness: 6,
    }).setOrigin(0.5, 1).setDepth(31).setVisible(false);

    this.layout();
    this.scale.on("resize", () => this.layout());
    this.uiEvents.emit("ready");
  }

  // ------------------------------------------------------------- public API
  startRun(): void {
    this.sim = new FishingSim(Date.now() & 0xffffffff);
    this.resetVisuals();
    this.mode = "playing";
    this.cameras.main.fadeIn(350, 23, 19, 24);
    this.toast(`${DAYS[0].name} · ДЕНЬ 1 ИЗ ${DAYS.length}`);
    this.say("НУ ЧТО, КТО БОЛЬШЕ ПОЙМАЕТ?", 2600);
    this.emitHud();
  }

  choosePerk(id: PerkId): void {
    if (this.mode !== "shop") return;
    this.sim.nextDay(id);
    this.resetVisuals();
    this.mode = "playing";
    this.toast(`${DAYS[this.sim.day].name} · ДЕНЬ ${this.sim.day + 1} ИЗ ${DAYS.length}`);
    this.say(this.sim.day === DAYS.length - 1 ? "СЕГОДНЯ Я СОМА ВОЗЬМУ, ЧУЮ" : "ВЧЕРА РАЗМИНКА БЫЛА", 2600);
    this.emitHud();
  }

  tapRod(): void { if (this.mode === "playing") this.sim.tap(); }
  beer(): void { if (this.mode === "playing") this.sim.drinkBeer(); }
  smoke(): void { if (this.mode === "playing") this.sim.lightSmoke(); }
  openPhone(): void { if (this.mode === "playing") this.sim.openPhone(); }
  swipe(): void { if (this.mode === "playing") this.sim.swipe(); }
  closePhone(): void { if (this.mode === "playing") this.sim.closePhone(); }
  stealStart(): void { if (this.mode === "playing") this.sim.startSteal(); }
  stealEnd(): void { if (this.mode === "playing") this.sim.cancelSteal(); }

  togglePause(force?: boolean): void {
    if (this.mode === "playing" && force !== true) {
      this.mode = "paused";
      this.tweens.pauseAll();
      this.time.paused = true;
      this.uiEvents.emit("paused", true);
    } else if (this.mode === "paused") {
      this.mode = "playing";
      this.tweens.resumeAll();
      this.time.paused = false;
      this.uiEvents.emit("paused", false);
    }
  }

  pauseIfPlaying(): void {
    if (this.mode === "playing") this.togglePause();
  }

  abandon(): void {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.mode = "over";
    this.uiEvents.emit("result", this.result(false, true));
  }

  /** Portrait art of the hero for the menu, rendered from the live textures. */
  heroPortrait(): string {
    const rt = this.make.renderTexture({ width: 130, height: 160 }, false);
    rt.draw(this.playerBody, 65, 150);
    rt.draw(this.playerSkin, 69, 50);
    rt.draw(this.playerHead.list[1] as Phaser.GameObjects.Image, 69, 50);
    let url = "";
    rt.snapshot((image) => { url = (image as HTMLImageElement).src; });
    return url;
  }

  // --------------------------------------------------------------- layout
  private layout(): void {
    const w = Math.max(320, this.scale.width);
    const h = Math.max(560, this.scale.height);
    const key = "landscape";
    const land = drawLandscape(this, w, h, key);
    this.bg.setTexture(key).setScale(1 / S);
    const groundY = h - Math.min(206, h * 0.25);
    const mid = land.waterTop + (land.waterBottom - land.waterTop) * 0.5;
    const unit = Math.min(1.15, Math.max(0.85, w / 390));
    this.L = {
      w, h,
      waterTop: land.waterTop,
      waterBottom: land.waterBottom,
      groundY,
      px: w * 0.27,
      fx: w * 0.75,
      myBobber: new Phaser.Math.Vector2(w * 0.33, mid + 10),
      friendBobber: new Phaser.Math.Vector2(w * 0.7, mid - 18),
    };
    this.skyTint.setSize(w, h);
    this.player.setPosition(this.L.px, groundY).setScale(unit);
    if (!this.friendAway) this.friend.setPosition(this.L.fx, groundY + 4).setScale(unit * 0.98);
    this.cooler.setPosition(this.L.px - 66 * unit, groundY - 6).setScale(0.5 * unit);
    this.myBucket.setPosition(this.L.px - 48 * unit, groundY + 22).setScale(0.5 * unit);
    this.friendBucketImg.setPosition(w * 0.5, groundY + 18).setScale(0.5 * unit);
    this.bush.setPosition(w + 6, groundY - 70).setScale(0.75);
    const reedX = [0.04, 0.16, 0.9, 0.98];
    this.reeds.forEach((r, i) => r.setPosition(w * reedX[i], land.waterBottom + 8).setScale(0.5 + (i % 2) * 0.12));
    this.clouds.forEach((c, i) => c.setY(Math.min(land.waterTop - 70, 128 + i * 30)));
    this.cameras.main.setSize(w, h);
  }

  private drawSun(): void {
    const g = this.sun;
    g.clear();
    const r = 22;
    const points: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 8; i++) points.push({ x: Math.cos(i / 8 * Math.PI * 2) * r, y: Math.sin(i / 8 * Math.PI * 2) * r });
    g.fillStyle(0xfff0b0, 0.35).fillCircle(0, 0, r + 12);
    g.fillStyle(YELLOW, 1).fillPoints(points, true);
    g.fillStyle(0xffd76a, 1);
    g.fillTriangle(points[4].x, points[4].y, points[5].x, points[5].y, 0, 0).fillTriangle(points[5].x, points[5].y, points[6].x, points[6].y, 0, 0);
    g.lineStyle(3, INK, 1).strokePoints(points, true, true);
  }

  private makeCloud(i: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(-8);
    const w = 60 + i * 18;
    const p = [{ x: 0, y: 0 }, { x: w * 0.2, y: -12 }, { x: w * 0.45, y: -20 }, { x: w * 0.7, y: -10 }, { x: w, y: 0 }];
    g.fillStyle(0xf4f1e6, 1).fillPoints(p, true);
    g.fillStyle(0xdfe2da, 1).fillTriangle(w * 0.45, -20, w * 0.7, -10, w, 0).fillTriangle(w * 0.45, -20, w, 0, w * 0.5, 0);
    g.lineStyle(2.5, INK, 1).strokePoints(p, true, true);
    g.x = 40 + i * 140;
    return g;
  }

  private resetVisuals(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.time.paused = false;
    this.meltdownRod.forEach((g) => g.destroy());
    this.meltdownRod = [];
    this.bubble?.destroy();
    this.bubble = undefined;
    this.friendAway = false;
    this.player.setAlpha(1).setAngle(0).setVisible(true);
    this.playerHead.setAngle(0).setY(-100);
    this.heldItem.setVisible(false);
    this.cig.setVisible(false);
    this.question.setVisible(false);
    this.friendBody.setTexture("friend-body");
    this.friendHead.setTexture("friend-head-back").setVisible(true);
    this.friend.setAlpha(1).setVisible(true);
    this.sway = 0;
    this.cameras.main.setRotation(0).setZoom(1);
    this.layout();
  }

  // --------------------------------------------------------------- frame
  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    this.animateAmbient(dt);
    if (this.mode !== "playing") {
      this.drawRods(this.sim.snapshot());
      return;
    }
    const events = this.sim.update(dt);
    events.forEach((e) => this.handle(e));
    const snap = this.sim.snapshot();
    this.animateState(snap, dt);
    this.drawRods(snap);
    this.hudClock -= dt;
    if (this.hudClock <= 0) {
      this.hudClock = 0.08;
      this.emitHud(snap);
    }
  }

  private emitHud(snap = this.sim.snapshot()): void {
    this.uiEvents.emit("hud", snap);
  }

  private animateAmbient(dt: number): void {
    const { w } = this.L;
    this.clouds.forEach((c, i) => {
      c.x += dt * (6 + i * 3);
      if (c.x > w + 20) c.x = -120;
    });
    const p = this.sim.snapshot().dayProgress;
    const angle = Math.PI * (1 - p);
    this.sun.setPosition(w / 2 + Math.cos(angle) * w * 0.42, this.L.waterTop - 10 - Math.sin(angle) * this.L.waterTop * 0.6);
    // Dawn pink → clear noon → orange sunset → violet dusk.
    let color = 0xff9a7a;
    let alpha = 0;
    if (p < 0.2) { color = 0xff9a7a; alpha = 0.28 * (1 - p / 0.2); }
    else if (p > 0.95) { color = 0x2b2350; alpha = 0.38 * ((p - 0.95) / 0.05) + 0.1; }
    else if (p > 0.72) { color = 0xff7a3a; alpha = 0.26 * ((p - 0.72) / 0.23); }
    this.skyTint.setFillStyle(color, alpha);

    const g = this.water;
    g.clear();
    for (const [b, phase] of [[this.L.myBobber, 0], [this.L.friendBobber, 1.7]] as const) {
      for (let i = 0; i < 2; i++) {
        const k = ((this.t * 0.5 + phase + i * 0.5) % 1);
        g.lineStyle(1.5, 0xd9f2ee, 0.5 * (1 - k)).strokeEllipse(b.x, b.y + 3, 16 + k * 30, 4 + k * 8);
      }
    }
  }

  private animateState(s: SimSnapshot, dt: number): void {
    // Bobber states.
    const bob = Math.sin(this.t * 2.4) * 1.5;
    let dy = bob;
    let dx = 0;
    if (s.rod === "nibble") dy = bob + Math.abs(Math.sin(this.t * 30)) * 3;
    if (s.rod === "bite") dy = 9 + Math.sin(this.t * 40) * 2;
    if (s.rod === "reeling") { dx = Math.sin(this.t * 7) * 10; dy = 6 + Math.sin(this.t * 11) * 4; }
    const broken = s.rod === "broken";
    this.myBobber.setVisible(!broken && s.rod !== "recast");
    this.myBobber.setPosition(this.L.myBobber.x + dx, this.L.myBobber.y + dy).setAlpha(s.rod === "bite" ? 0.45 : 1);
    this.alert.setVisible(s.rod === "bite" && s.hands !== "phone");
    if (this.alert.visible) {
      this.alert.setPosition(this.L.myBobber.x, this.L.myBobber.y - 14 + Math.sin(this.t * 25) * 3).setScale(1 + Math.sin(this.t * 20) * 0.1);
      if (s.rod === "bite") this.water.lineStyle(2.5, 0xffffff, 0.8).strokeEllipse(this.L.myBobber.x, this.L.myBobber.y + 4, 30 + Math.sin(this.t * 20) * 6, 8);
    }
    this.friendRodPull = Math.max(0, this.friendRodPull - dt * 0.9);
    this.myRodPull = s.rod === "reeling" ? 1 : Math.max(0, this.myRodPull - dt * 2);
    this.friendBobberImg.setVisible(!this.friendAway).setPosition(this.L.friendBobber.x, this.L.friendBobber.y + Math.sin(this.t * 2 + 1) * 1.5 + this.friendRodPull * 8);

    // Rage: face reddens, steam, shaking.
    const rage = s.rage / 100;
    const red = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xffffff), Phaser.Display.Color.ValueToColor(0xff4a3a), 100, Math.max(0, rage - 0.3) / 0.7 * 100);
    this.playerSkin.setTint(Phaser.Display.Color.GetColor(red.r, red.g, red.b));
    const shake = rage > 0.78 ? (rage - 0.78) * 14 : 0;
    if (s.phase === "playing") this.player.x = this.L.px + (Math.random() - 0.5) * shake;
    this.puffClock -= dt;
    if (this.puffClock <= 0) {
      if (rage > 0.6 && s.hands !== "asleep") {
        this.puffClock = 0.75 - rage * 0.45;
        this.puff(this.player.x + (Math.random() < 0.5 ? -14 : 22), this.player.y - 128, 0xf4f1e6, -1);
      }
      if (s.smoking > 0) {
        this.puffClock = Math.min(this.puffClock > 0 ? this.puffClock : 0.4, 0.4);
        this.puff(this.player.x + 40, this.player.y - 100, 0xc9c9c9, 1);
      }
      if (this.puffClock <= 0) this.puffClock = 0.3;
    }
    this.cig.setVisible(s.smoking > 0);
    if (s.hands === "phone") this.heldItem.setTexture("phone").setVisible(true).setPosition(30, -78).setAngle(-10);
    else if (s.hands === "beer") this.heldItem.setTexture("beer").setVisible(true);
    else if (s.hands === "steal") this.heldItem.setVisible(false);
    else if (s.hands === "free" && this.heldItem.texture.key === "phone") this.heldItem.setVisible(false);

    if (s.hands === "steal" && s.phase === "playing") {
      this.player.x = this.L.px + 10 + s.stealProgress * 16;
      this.playerHead.setAngle(8);
    } else if (s.hands !== "asleep" && s.phase === "playing") {
      this.playerHead.setAngle(Math.sin(this.t * 1.3) * 1.5);
    }

    // Drunk sway.
    const cam = this.cameras.main;
    const target = s.drunk >= 2 ? Math.sin(this.t * 0.9) * 0.008 * s.drunk : 0;
    this.sway = Phaser.Math.Linear(this.sway, target, 0.08);
    cam.setRotation(this.sway);
    this.question.setVisible(s.gaze === "suspicious" && !this.friendAway);
    if (this.question.visible) this.question.setPosition(this.friend.x - 6, this.friend.y - 170 + Math.sin(this.t * 12) * 2);

    this.drawBucketFish(s);
  }

  private drawBucketFish(s: SimSnapshot): void {
    const g = this.bucketFish;
    g.clear();
    const draw = (x: number, y: number, n: number) => {
      for (let i = 0; i < Math.min(n, 6); i++) {
        const fx = x - 12 + (i % 3) * 11;
        const fy = y - 22 - Math.floor(i / 3) * 6;
        g.fillStyle(0xc4cfa6, 1).fillTriangle(fx, fy, fx + 6, fy - 12, fx + 10, fy - 2);
        g.lineStyle(2, INK, 1).strokeTriangle(fx, fy, fx + 6, fy - 12, fx + 10, fy - 2);
      }
    };
    draw(this.friendBucketImg.x, this.friendBucketImg.y, s.friendBucket);
    draw(this.myBucket.x, this.myBucket.y, s.myCount);
  }

  private drawRods(s: SimSnapshot): void {
    const g = this.lines;
    g.clear();
    this.arm.clear();
    const unit = this.player.scale;
    if (this.player.visible && s.rod !== "broken") {
      const hand = new Phaser.Math.Vector2(this.player.x + 46 * unit, this.player.y - 54 * unit);
      const tip = new Phaser.Math.Vector2(this.player.x + 70 * unit, this.player.y - 250 * unit);
      const bob = new Phaser.Math.Vector2(this.myBobber.x, this.myBobber.y - 6);
      this.rod(g, hand, tip, bob, this.myRodPull, s.rod === "recast" || s.hands === "asleep");
    }
    if (s.hands === "steal" && this.player.visible) {
      // A sneaky arm creeping toward Tolik's bucket.
      const shoulder = new Phaser.Math.Vector2(this.player.x + 36 * unit, this.player.y - 78 * unit);
      const target = new Phaser.Math.Vector2(this.friendBucketImg.x - 4, this.friendBucketImg.y - 26);
      const hand = shoulder.clone().lerp(target, 0.4 + s.stealProgress * 0.6);
      const elbow = shoulder.clone().lerp(hand, 0.5).add(new Phaser.Math.Vector2(0, -14));
      const arm = new Phaser.Curves.QuadraticBezier(shoulder, elbow, hand).getPoints(8);
      const a = this.arm;
      a.lineStyle(13, INK, 1).strokePoints(arm);
      a.lineStyle(8, 0x5f6e37, 1).strokePoints(arm);
      a.fillStyle(0xe0a77d, 1).fillCircle(hand.x, hand.y, 6);
      a.lineStyle(2.5, INK, 1).strokeCircle(hand.x, hand.y, 6);
    }
    if (!this.friendAway) {
      const fu = this.friend.scale;
      const pose = this.friendBody.texture.key;
      if (pose === "friend-body") {
        const hand = new Phaser.Math.Vector2(this.friend.x - 37 * fu, this.friend.y - 54 * fu);
        const tip = new Phaser.Math.Vector2(this.friend.x - 64 * fu, this.friend.y - 262 * fu);
        this.rod(g, hand, tip, new Phaser.Math.Vector2(this.friendBobberImg.x, this.friendBobberImg.y - 6), this.friendRodPull, false);
      } else {
        // Rod propped on a forked stick while his hands are busy.
        const base = new Phaser.Math.Vector2(this.friend.x - 52 * fu, this.friend.y + 4);
        const tip = new Phaser.Math.Vector2(this.friend.x - 70 * fu, this.friend.y - 240 * fu);
        this.rod(g, base, tip, new Phaser.Math.Vector2(this.friendBobberImg.x, this.friendBobberImg.y - 6), 0, false);
      }
    } else {
      const base = new Phaser.Math.Vector2(this.L.fx - 52, this.L.groundY + 4);
      const tip = new Phaser.Math.Vector2(this.L.fx - 70, this.L.groundY - 240);
      this.rod(g, base, tip, new Phaser.Math.Vector2(this.L.friendBobber.x, this.L.friendBobber.y - 6), 0, false);
    }
  }

  private rod(g: Phaser.GameObjects.Graphics, hand: Phaser.Math.Vector2, tip: Phaser.Math.Vector2, bobber: Phaser.Math.Vector2, pull: number, slack: boolean): void {
    // Bend the tip toward the bobber while a fish pulls.
    const bentTip = tip.clone().lerp(bobber, 0.12 * pull);
    const ctrl = hand.clone().lerp(bentTip, 0.55).add(new Phaser.Math.Vector2((bobber.x - hand.x) * 0.08 * pull, 18 * pull));
    const curve = new Phaser.Curves.QuadraticBezier(hand, ctrl, bentTip);
    const p = curve.getPoints(12);
    g.lineStyle(6, INK, 1).strokePoints(p);
    g.lineStyle(3, 0x8a5a2b, 1).strokePoints(p.slice(0, 7));
    g.lineStyle(2.5, 0x2c3036, 1).strokePoints(p.slice(6));
    if (slack) return;
    const sag = new Phaser.Math.Vector2((bentTip.x + bobber.x) / 2, Math.max(bentTip.y, bobber.y) - 10 + (1 - pull) * 26);
    const line = new Phaser.Curves.QuadraticBezier(bentTip, sag, bobber);
    g.lineStyle(1.2, 0xf4f1e6, 0.85).strokePoints(line.getPoints(14));
  }

  // --------------------------------------------------------------- events
  private handle(e: SimEvent): void {
    switch (e.type) {
      case "nibble":
        break;
      case "bite":
        this.uiEvents.emit("bell");
        play("bell");
        this.splash(this.L.myBobber.x, this.L.myBobber.y + 6, 5);
        break;
      case "early":
        this.toast("РАНО ДЁРНУЛ!");
        if (Math.random() < 0.4) this.say("НЕ ТОРОПИСЬ, ХЕ-ХЕ", 1500);
        break;
      case "missed":
        this.toast("ПРОЗЕВАЛ ПОКЛЁВКУ");
        this.floatText(this.player.x, this.player.y - 150, "+8", "#d63732");
        break;
      case "hooked":
        this.splash(this.L.myBobber.x, this.L.myBobber.y + 6, 8);
        play("plop");
        this.uiEvents.emit("reel", true);
        break;
      case "catch":
        this.uiEvents.emit("reel", false);
        this.landFish(e.fish, this.L.myBobber, this.myBucket, "#b8d84a");
        play("catch");
        this.toast(`${e.fish.species} · ${e.fish.weight.toFixed(2)} КГ`);
        if (e.fish.size === 1 && Math.random() < 0.6) this.say("МАЛЁК! ОТПУСТИ, ПУСТЬ ПОДРАСТЁТ", 1800);
        break;
      case "snap":
        this.uiEvents.emit("reel", false);
        this.toast("СОШЛА!");
        play("snap");
        this.splash(this.L.myBobber.x, this.L.myBobber.y, 6);
        this.floatText(this.player.x, this.player.y - 150, "+10", "#d63732");
        break;
      case "friendCatch":
        this.friendRodPull = 1.4;
        this.time.delayedCall(450, () => {
          this.landFish(e.fish, this.L.friendBobber, this.friendBucketImg, "#e7ddc6");
          this.say(e.fish.species === "СОМ" ? "СО-О-ОМ!!! ВИДАЛ?!" : Phaser.Utils.Array.GetRandom(TAUNTS), 1700);
          this.cameras.main.shake(140, 0.004 * e.fish.size);
          play("friendCatch");
        });
        this.floatText(this.player.x + 10, this.player.y - 150, `+${Math.round(8 + e.fish.size * 4.5)}`, "#d63732");
        break;
      case "friendDistracted":
        if (e.reason === "bushes") this.friendLeave();
        else {
          this.friendBody.setTexture(e.reason === "phone" ? "friend-phone" : "friend-stretch");
          this.friendHead.setTexture(e.reason === "phone" ? "friend-head-down" : "friend-head-back");
        }
        this.say(Phaser.Utils.Array.GetRandom(DISTRACT_LINES[e.reason]), 1800);
        break;
      case "friendBack":
        if (this.friendAway) this.friendReturn();
        this.friendBody.setTexture("friend-body");
        this.friendHead.setTexture("friend-head-back");
        break;
      case "friendSuspicious":
        this.friendHead.setTexture("friend-head-sus");
        break;
      case "friendWatching":
        this.friendHead.setTexture("friend-head-look");
        break;
      case "stolen":
        this.landFish(e.fish, new Phaser.Math.Vector2(this.friendBucketImg.x, this.friendBucketImg.y - 20), this.myBucket, "#9a6bd1");
        this.toast(`СТЫРИЛ: ${e.fish.species} ${e.fish.weight.toFixed(2)} КГ`);
        play("plop");
        break;
      case "caught":
        this.friendHead.setTexture("friend-head-look");
        this.say("Э! ТЫ ЧЁ, МОЮ РЫБУ?!", 2000);
        this.toast("СПАЛИЛСЯ");
        play("caught");
        this.cameras.main.shake(200, 0.006);
        this.floatText(this.player.x, this.player.y - 150, "+22", "#d63732");
        break;
      case "beerOpen":
        this.heldItem.setTexture("beer").setVisible(true).setPosition(46, -64).setAngle(0);
        this.floatText(this.player.x + 60, this.player.y - 90, "ПШШШ", "#e7ddc6", 16);
        play("beer");
        this.tweens.add({ targets: this.heldItem, x: 26, y: -92, angle: -70, duration: 450, delay: 250, hold: 600, yoyo: true });
        break;
      case "beerDone":
        this.heldItem.setVisible(false);
        if (this.sim.drunk >= 2) this.floatText(this.player.x + 30, this.player.y - 140, "ИК!", "#f2b632", 18);
        if (this.sim.drunk === 4) this.toast("ЕЩЁ ОДНА — И СПАТЬ");
        break;
      case "smoke":
        this.floatText(this.player.x + 40, this.player.y - 120, "ЧИРК", "#f2b632", 15);
        play("light");
        break;
      case "smokeDone":
        break;
      case "video":
        play("swipe");
        this.uiEvents.emit("video", e.video);
        break;
      case "phoneOpen":
      case "phoneClose":
        this.uiEvents.emit(e.type);
        break;
      case "sleep":
        this.uiEvents.emit("sleep", true);
        this.heldItem.setVisible(false);
        this.tweens.add({ targets: this.playerHead, angle: 28, y: -88, duration: 600 });
        this.zzz = this.time.addEvent({ delay: 700, loop: true, callback: () => this.floatText(this.player.x + 30, this.player.y - 130, "Z", "#e7ddc6", 20) });
        this.toast("УСНУЛ…");
        break;
      case "wake":
        this.uiEvents.emit("sleep", false);
        this.zzz?.remove();
        this.tweens.add({ targets: this.playerHead, angle: 0, y: -100, duration: 300 });
        this.toast(e.missedFish ? `ПОКА СПАЛ, ТОЛИК ПОЙМАЛ ${e.missedFish}` : "ПРОСНУЛСЯ. ГОЛОВА ГУДИТ");
        if (e.missedFish) this.say("С ДОБРЫМ УТРОМ! ГЛЯНЬ, СКОЛЬКО У МЕНЯ", 2200);
        break;
      case "meltdown":
        this.meltdown();
        break;
      case "dayEnd":
        this.mode = "shop";
        this.cameras.main.setRotation(0);
        this.uiEvents.emit("dayEnd", { day: e.day, offers: this.sim.offerPerks(), snapshot: this.sim.snapshot() });
        break;
      case "won":
        this.mode = "over";
        this.cameras.main.setRotation(0);
        this.time.delayedCall(400, () => this.uiEvents.emit("result", this.result(true)));
        break;
      case "lost":
        this.mode = "over";
        this.uiEvents.emit("result", this.result(false));
        break;
      case "denied":
        this.toast(e.reason);
        break;
    }
  }

  private result(won: boolean, abandoned = false) {
    const s = this.sim.snapshot();
    return {
      won,
      abandoned,
      day: s.day,
      myKg: s.myKg,
      myCount: s.myCount,
      friendKg: s.friendKg,
      friendCount: s.friendCount,
      stolen: this.sim.stolenCount,
      caught: this.sim.caughtStealing,
      biggest: [...this.sim.myFish].sort((a, b) => b.weight - a.weight)[0] as Fish | undefined,
    };
  }

  // --------------------------------------------------------------- effects
  private toast(text: string): void {
    this.uiEvents.emit("toast", text);
  }

  private say(text: string, ms: number): void {
    if (this.friendAway && !text.includes("КУСТЫ") && !text.includes("ПРИДУ")) return;
    this.bubble?.destroy();
    const label = this.add.text(0, 0, text, {
      fontFamily: "Oswald, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#171318",
      align: "center", wordWrap: { width: 150 },
    }).setOrigin(0.5);
    const pw = label.width + 18;
    const ph = label.height + 12;
    const g = this.add.graphics();
    g.fillStyle(INK, 1).fillRoundedRect(-pw / 2 + 3, -ph / 2 + 4, pw, ph, 6);
    g.fillStyle(PAPER, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 6);
    g.lineStyle(3, INK, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 6);
    g.fillStyle(PAPER, 1).fillTriangle(10, ph / 2 - 2, 26, ph / 2 - 2, 22, ph / 2 + 12);
    g.lineStyle(3, INK, 1).lineBetween(10, ph / 2, 22, ph / 2 + 12).lineBetween(26, ph / 2, 22, ph / 2 + 12);
    const fx = this.friendAway ? this.L.w - 60 : this.friend.x;
    const x = Phaser.Math.Clamp(fx - 6, pw / 2 + 8, this.L.w - pw / 2 - 8);
    const y = this.L.groundY - 200 - ph / 2;
    this.bubble = this.add.container(x, y, [g, label]).setDepth(40).setScale(0.6);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: "Back.Out" });
    const bubble = this.bubble;
    this.time.delayedCall(ms, () => {
      if (this.bubble !== bubble) return;
      this.tweens.add({ targets: bubble, alpha: 0, duration: 200, onComplete: () => bubble.destroy() });
      this.bubble = undefined;
    });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 22): void {
    const label = this.add.text(x, y, text, {
      fontFamily: "Oswald, sans-serif", fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#171318", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(35);
    this.tweens.add({ targets: label, y: y - 46, alpha: 0, duration: 1100, ease: "Cubic.Out", onComplete: () => label.destroy() });
  }

  private puff(x: number, y: number, color: number, dir: number): void {
    const d = this.add.image(x, y, "dot").setTint(color).setScale(0.6).setAlpha(0.85).setDepth(20);
    this.tweens.add({
      targets: d, x: x + dir * Phaser.Math.Between(6, 18), y: y - Phaser.Math.Between(28, 46),
      scale: 1.8, alpha: 0, duration: 900, onComplete: () => d.destroy(),
    });
  }

  private splash(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const d = this.add.image(x, y, "dot").setTint(0xe2f6f2).setScale(0.4).setDepth(9);
      this.tweens.add({
        targets: d, x: x + Phaser.Math.Between(-26, 26), y: y - Phaser.Math.Between(10, 34), alpha: 0,
        duration: 420, ease: "Quad.Out", onComplete: () => d.destroy(),
      });
    }
  }

  private landFish(fish: Fish, from: Phaser.Math.Vector2, bucket: Phaser.GameObjects.Image, color: string): void {
    const look = FISH_LOOK[fish.species] ?? FISH_LOOK["ОКУНЬ"];
    const scale = 0.32 + fish.size * 0.1 + (fish.species === "СОМ" ? 0.2 : 0);
    const img = this.add.image(from.x, from.y, look.key).setTint(look.tint).setScale(scale).setDepth(34);
    this.splash(from.x, from.y + 4, 6);
    const tx = bucket.x;
    const ty = bucket.y - 26;
    const peak = Math.min(from.y, ty) - 90;
    const counter = { t: 0 };
    this.tweens.add({
      targets: counter, t: 1, duration: 700, ease: "Sine.InOut",
      onUpdate: () => {
        const t = counter.t;
        img.x = Phaser.Math.Linear(from.x, tx, t);
        img.y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * peak + t * t * ty;
        img.angle = Math.sin(this.t * 30) * 25 + t * 80 * (tx > from.x ? 1 : -1);
      },
      onComplete: () => {
        img.destroy();
        this.tweens.add({ targets: bucket, scaleY: bucket.scaleY * 0.9, duration: 80, yoyo: true });
      },
    });
    this.floatText(from.x, from.y - 30, `${fish.weight.toFixed(2)} КГ`, color, 16);
  }

  private friendLeave(): void {
    this.friendAway = true;
    this.friendBody.setTexture("friend-body");
    this.friendHead.setTexture("friend-head-back");
    this.tweens.add({ targets: this.friend, x: this.L.w + 30, y: this.L.groundY - 40, alpha: 0, duration: 900, ease: "Sine.In" });
    this.tweens.add({ targets: this.bush, angle: { from: -4, to: 4 }, duration: 160, yoyo: true, repeat: 8, delay: 900 });
  }

  private friendReturn(): void {
    this.friendAway = false;
    this.tweens.add({ targets: this.friend, x: this.L.fx, y: this.L.groundY + 4, alpha: 1, duration: 700, ease: "Sine.Out" });
  }

  private meltdown(): void {
    this.uiEvents.emit("meltdown");
    this.bubble?.destroy();
    this.heldItem.setVisible(false);
    this.cig.setVisible(false);
    this.question.setVisible(false);
    this.friendHead.setTexture("friend-head-look");
    // The rod snaps over the knee: two halves spin away.
    const unit = this.player.scale;
    const hx = this.player.x + 46 * unit;
    const hy = this.player.y - 54 * unit;
    for (let i = 0; i < 2; i++) {
      const g = this.add.graphics().setDepth(33);
      g.lineStyle(6, INK, 1).lineBetween(0, 0, 0, -90);
      g.lineStyle(3, i ? 0x2c3036 : 0x8a5a2b, 1).lineBetween(0, 0, 0, -90);
      g.setPosition(hx, hy);
      this.meltdownRod.push(g);
      this.tweens.add({
        targets: g, x: hx + (i ? 140 : -60), y: hy - 140, angle: i ? 540 : -380, duration: 900, delay: 500, ease: "Quad.Out",
      });
      this.tweens.add({ targets: g, y: this.L.waterBottom - 20, duration: 600, delay: 1400, ease: "Quad.In", onComplete: () => g.setVisible(false) });
    }
    this.floatText(hx, hy - 40, "ХРЯСЬ!", "#f2b632", 34);
    play("crack");
    this.cameras.main.shake(300, 0.012);
    // Then a running jump into the river.
    const startX = this.player.x;
    const startY = this.player.y;
    const target = new Phaser.Math.Vector2(this.L.w * 0.45, this.L.waterTop + (this.L.waterBottom - this.L.waterTop) * 0.6);
    const counter = { t: 0 };
    this.tweens.add({
      targets: counter, t: 1, duration: 950, delay: 1200, ease: "Sine.In",
      onUpdate: () => {
        const t = counter.t;
        this.player.x = Phaser.Math.Linear(startX, target.x, t);
        this.player.y = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * (target.y - 160) + t * t * target.y;
        this.player.angle = t * 200;
        this.player.setScale(this.player.scale * 0.995);
      },
      onComplete: () => {
        this.player.setVisible(false);
        this.splash(target.x, target.y, 22);
        this.floatText(target.x, target.y - 20, "БУЛЬ!", "#54b7c6", 40);
        play("splash");
        this.say("…ВОТ ЭТО ПОЙМАЛ", 2400);
        this.cameras.main.shake(250, 0.01);
      },
    });
  }
}

