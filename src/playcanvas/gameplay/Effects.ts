import { BLEND_ADDITIVE, Color, Entity, StandardMaterial, Vec3, type AppBase } from "playcanvas";

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

/**
 * Cheap combat effects from small pools (no allocation while fighting): muzzle flashes, bullet
 * tracers and hit sparks. Each is a primitive with a shared additive unlit material that shrinks
 * away over a few frames; no lights, no particles, no shadows.
 */
export class Effects {
  private readonly flashes: Pooled[] = [];
  private readonly tracers: Pooled[] = [];
  private readonly sparks: Pooled[] = [];
  private readonly root = new Entity("Effects");
  private readonly tmp = new Vec3();

  constructor(app: AppBase) {
    app.root.addChild(this.root);
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
