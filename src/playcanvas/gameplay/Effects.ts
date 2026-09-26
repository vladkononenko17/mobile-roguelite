import { BLEND_ADDITIVE, BLEND_ADDITIVEALPHA, BLEND_NORMAL, Color, Entity, PIXELFORMAT_RGBA8, StandardMaterial, Texture, Vec3, type AppBase, type MeshInstance } from "playcanvas";
import { softGlow } from "../world/AmbientFx";

/** A small moving particle (blood droplet, dust puff, shell casing): ballistic, then gone. */
interface Bit {
  entity: Entity;
  velocity: Vec3;
  life: number;
  total: number;
  size: number;
  gravity: number;
  grow: number;
  spin: number;
}

/** A flat decal on the ground that fades out at the end of its life. */
interface Decal {
  entity: Entity;
  mesh: MeshInstance;
  life: number;
}

/** What a body spills when hit: red blood, glowing alien goo, or a machine's oil and sparks. */
export type Gore = "blood" | "goo" | "oil";

const DECAL_LIFE = 9;

/** An expanding flat ring on the ground (explosions, shock pulses), fading out. */
interface Ring {
  entity: Entity;
  mesh: MeshInstance;
  life: number;
  total: number;
  radius: number;
}

/** A blast ball that swells, then collapses. */
interface Blast {
  entity: Entity;
  life: number;
  total: number;
  radius: number;
}

interface Pooled {
  entity: Entity;
  life: number;
  total: number;
  length: number;
  width: number;
}

function glow(color: Color): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.useLighting = false;
  material.blendType = BLEND_ADDITIVE;
  material.depthWrite = false;
  material.update();
  return material;
}

function flat(color: Color, opacity = 1): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.useLighting = false;
  if (opacity < 1) {
    material.opacity = opacity;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

/**
 * Cheap combat effects from small pools (no allocation while fighting): muzzle flashes, bullet
 * tracers, sparks, blood spray on zombie hits, dust puffs where bullets hit walls, shell casings and
 * blood decals left by kills. Primitives with shared unlit materials (decals fade per instance);
 * no lights, no shadows, no per-frame allocation.
 */
export class Effects {
  private readonly flashes: Pooled[] = [];
  private readonly tracers: Pooled[] = [];
  private readonly sparks: Pooled[] = [];
  private readonly blood: Bit[] = [];
  private readonly goo: Bit[] = [];
  private readonly oil: Bit[] = [];
  private readonly decalMats = {} as Record<Gore, StandardMaterial>;
  private readonly dust: Bit[] = [];
  private readonly casings: Bit[] = [];
  private readonly decals: Decal[] = [];
  private readonly fire: Bit[] = [];
  private readonly frost: Bit[] = [];
  private readonly bolts: Pooled[] = [];
  private readonly rings: Ring[] = [];
  private readonly blasts: Blast[] = [];
  private nextDecal = 0;
  private readonly root = new Entity("Effects");
  private readonly tmp = new Vec3();
  private readonly tmp2 = new Vec3();

  constructor(app: AppBase) {
    app.root.addChild(this.root);
    const bloodMat = flat(new Color(0.34, 0.04, 0.03));
    const dustMat = flat(new Color(0.62, 0.55, 0.44), 0.5);
    const brass = flat(new Color(0.85, 0.62, 0.25));
    for (let i = 0; i < 28; i++) this.blood.push(this.bit("blood", "box", bloodMat));
    // Alien goo glows a sickly green (additive droplets read as luminous ichor).
    const gooMat = glow(new Color(0.3, 0.95, 0.22));
    for (let i = 0; i < 28; i++) this.goo.push(this.bit("goo", "sphere", gooMat));
    const oilMat = flat(new Color(0.04, 0.04, 0.05));
    for (let i = 0; i < 12; i++) this.oil.push(this.bit("oil", "box", oilMat));
    for (let i = 0; i < 12; i++) this.dust.push(this.bit("dust", "sphere", dustMat));
    for (let i = 0; i < 10; i++) this.casings.push(this.bit("casing", "cylinder", brass));
    const flame = glow(new Color(1, 0.48, 0.12));
    const ice = glow(new Color(0.45, 0.75, 1));
    const bolt = glow(new Color(0.55, 0.8, 1));
    const blast = glow(new Color(1, 0.55, 0.18));
    for (let i = 0; i < 36; i++) this.fire.push(this.bit("fire", "sphere", flame));
    for (let i = 0; i < 16; i++) this.frost.push(this.bit("frost", "sphere", ice));
    for (let i = 0; i < 36; i++) this.bolts.push(this.make("bolt", "box", bolt));
    for (let i = 0; i < 8; i++) {
      const entity = new Entity("blast");
      entity.addComponent("render", { type: "sphere", material: blast, castShadows: false, receiveShadows: false });
      entity.enabled = false;
      this.root.addChild(entity);
      this.blasts.push({ entity, life: 0, total: 1, radius: 1 });
    }
    const ringTexture = ringCanvasTexture(app);
    for (const [color, count] of [[new Color(1, 0.55, 0.2), 6], [new Color(0.45, 0.8, 1), 3]] as const) {
      const m = new StandardMaterial();
      m.diffuse.set(0, 0, 0);
      m.emissive.copy(color);
      m.useLighting = false;
      m.opacityMap = ringTexture;
      m.opacityMapChannel = "a";
      m.blendType = BLEND_ADDITIVEALPHA;
      m.depthWrite = false;
      m.update();
      for (let i = 0; i < count; i++) {
        const entity = new Entity(color.b > 0.5 ? "ring-shock" : "ring-fire");
        entity.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
        entity.enabled = false;
        this.root.addChild(entity);
        this.rings.push({ entity, mesh: entity.render!.meshInstances[0], life: 0, total: 1, radius: 1 });
      }
    }
    const splat = splatTexture(app);
    const decal = (r: number, g: number, b: number) => {
      const m = new StandardMaterial();
      m.diffuse.set(0, 0, 0);
      m.emissive.set(r, g, b);
      m.useLighting = false;
      m.opacityMap = splat;
      m.opacityMapChannel = "a";
      m.blendType = BLEND_NORMAL;
      m.depthWrite = false;
      m.update();
      return m;
    };
    const decalMat = decal(0.28, 0.03, 0.02);
    this.decalMats.blood = decalMat;
    // Goo pools stay faintly luminous; oil is near black.
    this.decalMats.goo = decal(0.16, 0.55, 0.1);
    this.decalMats.oil = decal(0.035, 0.035, 0.04);
    for (let i = 0; i < 18; i++) {
      const entity = new Entity("blood-decal");
      entity.addComponent("render", { type: "plane", material: decalMat, castShadows: false, receiveShadows: false });
      entity.enabled = false;
      this.root.addChild(entity);
      this.decals.push({ entity, mesh: entity.render!.meshInstances[0], life: 0 });
    }
    const flash = glow(new Color(1, 0.8, 0.35));
    const tracer = glow(new Color(1, 0.85, 0.5));
    this.flashMat = flash;
    this.tracerMat = tracer;
    this.glowOf = (c) => glow(new Color(c[0], c[1], c[2]));
    const spark = glow(new Color(1, 0.45, 0.25));
    for (let i = 0; i < 6; i++) this.flashes.push(this.make("flash", "sphere", flash));
    // Kill pops: a hot white-gold burst that swells and fades at a dying enemy.
    const pop = glow(new Color(1, 0.9, 0.62));
    for (let i = 0; i < 10; i++) this.pops.push(this.make("pop", "sphere", pop));
    // Muzzle light: a soft warm pool on the ground under each shot (a light without a light).
    this.softGlowTexture = softGlow(app);
    for (let i = 0; i < 6; i++) {
      const entity = new Entity("muzzle-light");
      entity.addComponent("render", { type: "plane", material: this.groundGlow([1, 0.72, 0.35]), castShadows: false, receiveShadows: false });
      entity.enabled = false;
      this.root.addChild(entity);
      this.muzzleLights.push({ entity, life: 0, total: 1, width: 1, length: 0 });
    }
    for (let i = 0; i < 24; i++) this.tracers.push(this.make("tracer", "box", tracer));
    for (let i = 0; i < 16; i++) this.sparks.push(this.make("spark", "sphere", spark));
    for (let i = 0; i < 20; i++) this.shots.push(Object.assign(this.make("energy", "sphere", tracer), { from: new Vec3(), to: new Vec3() }));
  }

  private readonly pops: Pooled[] = [];
  private readonly muzzleLights: Pooled[] = [];
  private softGlowTexture!: Texture;
  private readonly groundGlows = new Map<string, StandardMaterial>();

  /** A soft additive light pool of colour `c` (shared per colour). */
  private groundGlow(c: readonly [number, number, number]): StandardMaterial {
    const key = c.join(",");
    let m = this.groundGlows.get(key);
    if (!m) {
      m = new StandardMaterial();
      m.diffuse.set(0, 0, 0);
      m.emissive.set(c[0] * 0.55, c[1] * 0.55, c[2] * 0.55);
      m.emissiveMap = this.softGlowTexture;
      m.useLighting = false;
      m.blendType = BLEND_ADDITIVE;
      m.depthWrite = false;
      m.update();
      this.groundGlows.set(key, m);
    }
    return m;
  }

  /** A kill's pop: a bright burst of `size` metres at the body. */
  killFlash(position: Vec3, size: number): void {
    const p = this.take(this.pops);
    p.entity.enabled = true;
    p.entity.setPosition(position);
    p.life = p.total = size > 1.5 ? 0.3 : 0.14;
    p.width = size;
    p.entity.setLocalScale(size * 0.5, size * 0.5, size * 0.5);
  }

  private flashMat!: StandardMaterial;
  private tracerMat!: StandardMaterial;
  private glowOf!: (c: readonly [number, number, number]) => StandardMaterial;
  private readonly tints = new Map<string, StandardMaterial>();
  /** Visible energy shots flying muzzle -> hit (the damage itself is instant). */
  private readonly shots: (Pooled & { from: Vec3; to: Vec3 })[] = [];

  /** A shared additive material of colour `c` (weapon effects). */
  private tint(c: readonly [number, number, number] | undefined, fallback: StandardMaterial): StandardMaterial {
    if (!c) return fallback;
    const key = c.join(",");
    let m = this.tints.get(key);
    if (!m) this.tints.set(key, (m = this.glowOf(c)));
    return m;
  }

  /**
   * A glowing shot travelling from `from` to `to` at `speed` m/s (energy weapons), leaving a short
   * streak behind it.
   */
  energyShot(from: Vec3, to: Vec3, speed: number, color: readonly [number, number, number], size: number): void {
    let p = this.shots.find((s) => !s.entity.enabled);
    if (!p) {
      if (this.shots.length >= 40) p = this.shots[0];
      else this.shots.push((p = Object.assign(this.make("energy", "sphere", this.tracerMat), { from: new Vec3(), to: new Vec3() })));
    }
    p.from.copy(from);
    p.to.copy(to);
    p.entity.render!.meshInstances[0].material = this.tint(color, this.tracerMat);
    p.entity.enabled = true;
    p.total = Math.max(0.04, from.distance(to) / speed);
    p.life = p.total;
    p.width = size;
    p.entity.setPosition(from);
    p.entity.setLocalScale(size, size, size);
  }

  private make(name: string, type: string, material: StandardMaterial): Pooled {
    const entity = new Entity(name);
    entity.addComponent("render", { type, castShadows: false, receiveShadows: false, material });
    entity.enabled = false;
    this.root.addChild(entity);
    return { entity, life: 0, total: 1, length: 1, width: 1 };
  }

  private bit(name: string, type: string, material: StandardMaterial): Bit {
    const entity = new Entity(name);
    entity.addComponent("render", { type, castShadows: false, receiveShadows: false, material });
    entity.enabled = false;
    this.root.addChild(entity);
    return { entity, velocity: new Vec3(), life: 0, total: 1, size: 0.05, gravity: 0, grow: 0, spin: 0 };
  }

  private takeBit(pool: Bit[]): Bit {
    let oldest = pool[0];
    for (const b of pool) {
      if (!b.entity.enabled) return b;
      if (b.life < oldest.life) oldest = b;
    }
    return oldest;
  }

  private launch(pool: Bit[], at: Vec3, vx: number, vy: number, vz: number, life: number, size: number, gravity: number, grow = 0): void {
    const b = this.takeBit(pool);
    b.entity.enabled = true;
    b.entity.setPosition(at);
    b.velocity.set(vx, vy, vz);
    b.life = b.total = life;
    b.size = size;
    b.gravity = gravity;
    b.grow = grow;
    b.spin = Math.random() * 360;
    b.entity.setLocalScale(size, size, size);
  }

  /**
   * A short spray from a bullet hit, away from the shooter (dirX, dirZ): dark blood, glowing alien
   * goo, or (machines) sparks and a few drops of oil.
   */
  bloodHit(position: Vec3, dirX: number, dirZ: number, gore: Gore = "blood"): void {
    if (gore === "oil") this.spark(position, 0.14);
    const pool = gore === "goo" ? this.goo : gore === "oil" ? this.oil : this.blood;
    for (let i = 0; i < (gore === "oil" ? 2 : 4); i++) {
      const spread = 1.2 + Math.random() * 1.6;
      this.launch(pool, position,
        dirX * spread + (Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.4, dirZ * spread + (Math.random() - 0.5) * 1.4,
        0.32 + Math.random() * 0.12, 0.035 + Math.random() * 0.03, 9);
    }
  }

  /** Where a bullet hits a wall: a small dust puff and a spark. */
  impact(position: Vec3): void {
    for (let i = 0; i < 3; i++) {
      this.launch(this.dust, position, (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, 0.45, 0.07, 0, 0.35);
    }
    this.spark(position, 0.1);
  }

  /** A brass casing ejected to the shooter's right (rightX, rightZ) from `position`. */
  casing(position: Vec3, rightX: number, rightZ: number): void {
    const s = 1.3 + Math.random() * 0.6;
    this.launch(this.casings, position, rightX * s + (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 0.8, rightZ * s + (Math.random() - 0.5) * 0.4, 0.5, 0.03, 9);
  }

  /** A small flame licking up from a burning enemy. */
  flame(position: Vec3): void {
    this.launch(this.fire, position, (Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.15, 0.09 + Math.random() * 0.05, -1.5);
  }

  /** A pale-blue fleck on a slowed enemy. */
  frostPuff(position: Vec3): void {
    this.launch(this.frost, position, (Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 0.4, 0.06, 0);
  }

  /** A jagged electric arc from `from` to `to` (three kinked segments). */
  lightning(from: Vec3, to: Vec3): void {
    const a = this.tmp, b = this.tmp2;
    a.copy(from);
    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      b.lerp(from, to, t);
      if (i < 3) b.set(b.x + (Math.random() - 0.5) * 0.5, b.y + (Math.random() - 0.5) * 0.4, b.z + (Math.random() - 0.5) * 0.5);
      const p = this.take(this.bolts);
      const length = a.distance(b);
      if (length > 0.02) {
        p.entity.enabled = true;
        p.entity.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        p.entity.lookAt(b);
        p.life = p.total = 0.14;
        p.length = length;
        p.width = 0.05;
        p.entity.setLocalScale(p.width, p.width, length);
      }
      a.copy(b);
    }
  }

  /** An explosion: a swelling orange blast and a fire ring on the ground (`radius` m). */
  explosion(position: Vec3, radius: number): void {
    let b = this.blasts[0];
    for (const x of this.blasts) if (!x.entity.enabled || x.life < b.life) b = x;
    b.entity.enabled = true;
    b.entity.setPosition(position.x, 0.6, position.z);
    b.life = b.total = 0.32;
    b.radius = radius * 0.8;
    this.ring(position, radius, false);
    for (let i = 0; i < 5; i++) this.flame(this.tmp.set(position.x + (Math.random() - 0.5) * radius, 0.3, position.z + (Math.random() - 0.5) * radius));
  }

  /** An expanding ring on the ground: fire (explosions) or electric blue (shock pulses). */
  ring(position: Vec3, radius: number, shock: boolean): void {
    const name = shock ? "ring-shock" : "ring-fire";
    let r: Ring | null = null;
    for (const x of this.rings) if (x.entity.name === name && (!r || !x.entity.enabled || x.life < r.life)) r = x;
    if (!r) return;
    r.entity.enabled = true;
    r.entity.setPosition(position.x, 0.06, position.z);
    r.life = r.total = shock ? 0.4 : 0.35;
    r.radius = radius;
  }

  /** A burst when a body dies: goo splashes up and out; a machine blows apart in sparks. */
  goreBurst(position: Vec3, size: number, gore: Gore): void {
    if (gore === "oil") {
      this.explosion(position, 0.6 * size);
      for (let i = 0; i < 3; i++) this.spark(position, 0.2 * size);
    }
    if (gore === "blood") return;
    const pool = gore === "goo" ? this.goo : this.oil;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, v = (1.5 + Math.random() * 2.5) * Math.min(2, size);
      this.launch(pool, position, Math.sin(a) * v, 1.5 + Math.random() * 2.5, Math.cos(a) * v, 0.45 + Math.random() * 0.2, (0.05 + Math.random() * 0.05) * Math.min(2, size), 9);
    }
  }

  /** A pool left where a body died (fades out after a few seconds): blood, goo or oil. */
  bloodDecal(x: number, z: number, scale = 1, gore: Gore = "blood"): void {
    const d = this.decals[this.nextDecal];
    d.mesh.material = this.decalMats[gore];
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    d.entity.enabled = true;
    d.entity.setPosition(x + (Math.random() - 0.5) * 0.4, 0.045 + this.nextDecal * 0.0005, z + (Math.random() - 0.5) * 0.4);
    d.entity.setEulerAngles(0, Math.random() * 360, 0);
    const size = (0.9 + Math.random() * 0.5) * scale;
    d.entity.setLocalScale(size, 1, size * (0.7 + Math.random() * 0.3));
    d.life = DECAL_LIFE;
    d.mesh.setParameter("material_opacity", 0.75);
  }

  private take(pool: Pooled[]): Pooled {
    let oldest = pool[0];
    for (const p of pool) {
      if (!p.entity.enabled) return p;
      if (p.life < oldest.life) oldest = p;
    }
    return oldest;
  }

  muzzleFlash(position: Vec3, size = 0.22, color?: readonly [number, number, number]): void {
    const p = this.take(this.flashes);
    p.entity.render!.meshInstances[0].material = this.tint(color, this.flashMat);
    p.entity.enabled = true;
    p.entity.setPosition(position);
    p.life = p.total = 0.06;
    p.width = size;
    p.entity.setLocalScale(size, size, size);
    // Its light on the ground.
    const l = this.take(this.muzzleLights);
    l.entity.render!.meshInstances[0].material = this.groundGlow(color ?? [1, 0.72, 0.35]);
    l.entity.enabled = true;
    l.entity.setPosition(position.x, 0.06, position.z);
    l.life = l.total = 0.07;
    l.width = 2.2 + size * 4;
    l.entity.setLocalScale(l.width, 1, l.width);
  }

  /** A streak from `from` to `to` (weapons may colour, widen and lengthen it). */
  tracer(from: Vec3, to: Vec3, style?: { color?: readonly [number, number, number]; width?: number; life?: number }): void {
    const p = this.take(this.tracers);
    const length = from.distance(to);
    if (length < 0.05) return;
    p.entity.render!.meshInstances[0].material = this.tint(style?.color, this.tracerMat);
    p.entity.enabled = true;
    this.tmp.lerp(from, to, 0.5);
    p.entity.setPosition(this.tmp);
    p.entity.lookAt(to);
    p.life = p.total = style?.life ?? 0.07;
    p.length = length;
    p.width = style?.width ?? 0.035;
    p.entity.setLocalScale(p.width, p.width, length);
  }

  spark(position: Vec3, size = 0.18): void {
    const p = this.take(this.sparks);
    p.entity.enabled = true;
    p.entity.setPosition(position);
    p.life = p.total = 0.12;
    p.width = size;
    p.entity.setLocalScale(size, size, size);
  }

  update(dt: number): void {
    for (const s of this.shots) {
      if (!s.entity.enabled) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.entity.enabled = false;
        continue;
      }
      this.tmp.lerp(s.to, s.from, s.life / s.total);
      s.entity.setPosition(this.tmp);
    }
    for (const b of this.blasts) {
      if (!b.entity.enabled) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.entity.enabled = false;
        continue;
      }
      const t = 1 - b.life / b.total;
      const s = b.radius * 2 * (t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6 * 0.9);
      b.entity.setLocalScale(s, s * 0.7, s);
    }
    for (const r of this.rings) {
      if (!r.entity.enabled) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.entity.enabled = false;
        continue;
      }
      const t = 1 - r.life / r.total;
      const s = r.radius * 2 * (0.3 + 0.7 * Math.sqrt(t));
      r.entity.setLocalScale(s, 1, s);
      r.mesh.setParameter("material_opacity", 1 - t);
    }
    for (const pool of [this.blood, this.goo, this.oil, this.dust, this.casings, this.fire, this.frost]) {
      for (const b of pool) {
        if (!b.entity.enabled) continue;
        b.life -= dt;
        const p = b.entity.getPosition();
        if (b.life <= 0 || p.y < -0.05) {
          b.entity.enabled = false;
          continue;
        }
        b.velocity.y -= b.gravity * dt;
        this.tmp.set(p.x + b.velocity.x * dt, Math.max(0.01, p.y + b.velocity.y * dt), p.z + b.velocity.z * dt);
        // Casings and droplets stop on the ground.
        if (this.tmp.y <= 0.011 && b.gravity > 0) b.velocity.set(0, 0, 0);
        b.entity.setPosition(this.tmp);
        b.spin += dt * 720;
        if (pool === this.casings) b.entity.setLocalEulerAngles(b.spin, 0, 90);
        const s = b.size * (1 + b.grow * (1 - b.life / b.total) * 10) * (pool === this.dust ? b.life / b.total : 1);
        if (pool === this.casings) b.entity.setLocalScale(s * 0.6, s * 1.6, s * 0.6);
        else b.entity.setLocalScale(s, s, s);
      }
    }
    for (const d of this.decals) {
      if (!d.entity.enabled) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.entity.enabled = false;
        continue;
      }
      if (d.life < 2.5) d.mesh.setParameter("material_opacity", 0.75 * (d.life / 2.5));
    }
    for (const pool of [this.flashes, this.sparks]) {
      for (const p of pool) {
        if (!p.entity.enabled) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.entity.enabled = false;
          continue;
        }
        const s = p.width * (0.4 + 0.6 * (p.life / p.total));
        p.entity.setLocalScale(s, s, s);
      }
    }
    for (const p of this.pops) {
      if (!p.entity.enabled) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.entity.enabled = false;
        continue;
      }
      const t = 1 - p.life / p.total;
      const s = p.width * (0.5 + 0.9 * t) * (1 - t * t);
      p.entity.setLocalScale(s, s, s);
    }
    for (const l of this.muzzleLights) {
      if (!l.entity.enabled) continue;
      l.life -= dt;
      if (l.life <= 0) l.entity.enabled = false;
    }
    for (const p of [...this.tracers, ...this.bolts]) {
      if (!p.entity.enabled) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.entity.enabled = false;
        continue;
      }
      const w = p.width * (p.life / p.total);
      p.entity.setLocalScale(w, w, p.length);
    }
  }
}

/** An irregular splat (alpha) for blood decals: a blob with a few droplets around it. */
function splatTexture(app: AppBase): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  const blob = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(32, 32, 14);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i;
    blob(32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 6 + (i % 3) * 2);
    blob(32 + Math.cos(a) * (22 + (i % 2) * 5), 32 + Math.sin(a) * (22 + (i % 2) * 5), 1.5 + (i % 3));
  }
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_RGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}

/** A soft ring (alpha) for ground pulses. */
function ringCanvasTexture(app: AppBase): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 18, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.55, "rgba(255,255,255,0.9)");
  g.addColorStop(0.8, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_RGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}
