import { BLEND_ADDITIVE, BLEND_NORMAL, Color, Entity, PIXELFORMAT_RGBA8, StandardMaterial, Texture, Vec3, type AppBase, type MeshInstance } from "playcanvas";

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

const DECAL_LIFE = 9;

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
  private readonly dust: Bit[] = [];
  private readonly casings: Bit[] = [];
  private readonly decals: Decal[] = [];
  private nextDecal = 0;
  private readonly root = new Entity("Effects");
  private readonly tmp = new Vec3();

  constructor(app: AppBase) {
    app.root.addChild(this.root);
    const bloodMat = flat(new Color(0.34, 0.04, 0.03));
    const dustMat = flat(new Color(0.62, 0.55, 0.44), 0.5);
    const brass = flat(new Color(0.85, 0.62, 0.25));
    for (let i = 0; i < 28; i++) this.blood.push(this.bit("blood", "box", bloodMat));
    for (let i = 0; i < 12; i++) this.dust.push(this.bit("dust", "sphere", dustMat));
    for (let i = 0; i < 10; i++) this.casings.push(this.bit("casing", "cylinder", brass));
    const decalMat = new StandardMaterial();
    decalMat.diffuse.set(0, 0, 0);
    decalMat.emissive.set(0.28, 0.03, 0.02);
    decalMat.useLighting = false;
    decalMat.opacityMap = splatTexture(app);
    decalMat.opacityMapChannel = "a";
    decalMat.blendType = BLEND_NORMAL;
    decalMat.depthWrite = false;
    decalMat.update();
    for (let i = 0; i < 18; i++) {
      const entity = new Entity("blood-decal");
      entity.addComponent("render", { type: "plane", material: decalMat, castShadows: false, receiveShadows: false });
      entity.enabled = false;
      this.root.addChild(entity);
      this.decals.push({ entity, mesh: entity.render!.meshInstances[0], life: 0 });
    }
    const flash = glow(new Color(1, 0.8, 0.35));
    const tracer = glow(new Color(1, 0.85, 0.5));
    const spark = glow(new Color(1, 0.45, 0.25));
    for (let i = 0; i < 6; i++) this.flashes.push(this.make("flash", "sphere", flash));
    for (let i = 0; i < 24; i++) this.tracers.push(this.make("tracer", "box", tracer));
    for (let i = 0; i < 16; i++) this.sparks.push(this.make("spark", "sphere", spark));
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

  /** A short spray of dark droplets from a bullet hit, away from the shooter (dirX, dirZ). */
  bloodHit(position: Vec3, dirX: number, dirZ: number): void {
    for (let i = 0; i < 4; i++) {
      const spread = 1.2 + Math.random() * 1.6;
      this.launch(this.blood, position,
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

  /** A blood pool left where a zombie died (fades out after a few seconds). */
  bloodDecal(x: number, z: number, scale = 1): void {
    const d = this.decals[this.nextDecal];
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

  muzzleFlash(position: Vec3, size = 0.22): void {
    const p = this.take(this.flashes);
    p.entity.enabled = true;
    p.entity.setPosition(position);
    p.life = p.total = 0.06;
    p.width = size;
    p.entity.setLocalScale(size, size, size);
  }

  /** A streak from `from` to `to`. */
  tracer(from: Vec3, to: Vec3): void {
    const p = this.take(this.tracers);
    const length = from.distance(to);
    if (length < 0.05) return;
    p.entity.enabled = true;
    this.tmp.lerp(from, to, 0.5);
    p.entity.setPosition(this.tmp);
    p.entity.lookAt(to);
    p.life = p.total = 0.07;
    p.length = length;
    p.width = 0.035;
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
    for (const pool of [this.blood, this.dust, this.casings]) {
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
    for (const p of this.tracers) {
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
