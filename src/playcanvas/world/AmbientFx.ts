import {
  BLEND_ADDITIVE, BLEND_NORMAL, Color, Curve, CurveSet, EMITTERSHAPE_BOX, Entity, PIXELFORMAT_SRGBA8, StandardMaterial, Texture, Vec3,
  type AppBase,
} from "playcanvas";

/**
 * One ambient emitter placed by a level (a biome lists its own): drifting dust motes over an area,
 * a smoke column / wisp from a fire or wreck, or occasional spark bursts from a generator or lamp.
 * Positions are world metres; `size` is the area (dust) or the emitter spread (smoke / sparks).
 */
export interface AmbientEmitter {
  kind: "dust" | "smoke" | "sparks";
  x: number;
  y?: number;
  z: number;
  /** Area / spread in metres (x, z). */
  size?: [number, number];
  /** 0..1+, scales how much it emits. */
  intensity?: number;
  /** Sparks: seconds between bursts (randomised +-50%). */
  every?: number;
}

interface Burst {
  entity: Entity;
  every: number;
  timer: number;
}

/** One spark speck of a burst (pooled mesh; no particle-system resets, which rebuild the emitter). */
interface Spark {
  entity: Entity;
  velocity: Vec3;
  life: number;
}

const SPARKS_PER_BURST = 10;
const SPARK_POOL = 30;

/** Emitters farther than this from the focus (the hero) are switched off (+ hysteresis). */
const ACTIVE_RADIUS = 20;

/**
 * Cheap ambient life for a level: dust and smoke are GPU particle systems (one draw call each, no
 * shadows, no lighting, a shared soft sprite); spark bursts are a small pool of additive specks.
 * Only emitters near the hero run. Kept sparse on purpose: effects sit at the edges of the combat
 * space (fires, wrecks, machines) and never block it.
 */
export class AmbientFx {
  private readonly root = new Entity("AmbientFx");
  private readonly bursts: Burst[] = [];
  private readonly emitters: { entity: Entity; reach: number }[] = [];
  private readonly sparks: Spark[] = [];
  private readonly tmp = new Vec3();

  constructor(app: AppBase, emitters: AmbientEmitter[]) {
    app.root.addChild(this.root);
    const sprite = softDot(app);
    const hot = new StandardMaterial();
    hot.diffuse.set(0, 0, 0);
    hot.emissive = new Color(1, 0.72, 0.3);
    hot.useLighting = false;
    hot.blendType = BLEND_ADDITIVE;
    hot.depthWrite = false;
    hot.update();
    for (let i = 0; i < SPARK_POOL; i++) {
      const entity = new Entity("spark");
      entity.addComponent("render", { type: "box", material: hot, castShadows: false, receiveShadows: false });
      entity.enabled = false;
      this.root.addChild(entity);
      this.sparks.push({ entity, velocity: new Vec3(), life: 0 });
    }
    for (const e of emitters) this.add(e, sprite);
  }

  private add(e: AmbientEmitter, sprite: Texture): void {
    const entity = new Entity(`ambient-${e.kind}`);
    entity.setPosition(e.x, e.y ?? 0, e.z);
    this.root.addChild(entity);
    this.emitters.push({ entity, reach: Math.max(...(e.size ?? [1, 1])) / 2 });
    const k = e.intensity ?? 1;
    const [sx, sz] = e.size ?? [1, 1];
    const common = { colorMap: sprite, depthWrite: false, lighting: false, localSpace: false, emitterShape: EMITTERSHAPE_BOX };
    if (e.kind === "dust") {
      // Sun-lit motes drifting sideways, fading in and out (additive, so they read on any ground).
      entity.addComponent("particlesystem", {
        ...common, numParticles: Math.round(30 * k), lifetime: 7, rate: 0.2 / k, rate2: 0.35 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx, 1.6, sz), blendType: BLEND_ADDITIVE,
        velocityGraph: new CurveSet([[0, 0.12], [0, 0.02], [0, 0.05]]), velocityGraph2: new CurveSet([[0, 0.28], [0, 0.08], [0, -0.05]]),
        scaleGraph: new Curve([0, 0.07, 1, 0.1]), scaleGraph2: new Curve([0, 0.1, 1, 0.14]),
        alphaGraph: new Curve([0, 0, 0.3, 0.55, 0.7, 0.55, 1, 0]),
        colorGraph: new CurveSet([[0, 0.55], [0, 0.48], [0, 0.36]]),
      });
    } else if (e.kind === "smoke") {
      // Soft grey puffs rising and widening, drifting with a light wind.
      entity.addComponent("particlesystem", {
        ...common, numParticles: Math.round(16 * k), lifetime: 4.5, rate: 0.28 / k, rate2: 0.4 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx * 0.4, 0.1, sz * 0.4), blendType: BLEND_NORMAL,
        velocityGraph: new CurveSet([[0, 0.05, 1, 0.3], [0, 0.6, 1, 0.9], [0, -0.05, 1, 0.05]]),
        velocityGraph2: new CurveSet([[0, 0.15, 1, 0.45], [0, 0.9, 1, 1.2], [0, 0.05, 1, 0.15]]),
        scaleGraph: new Curve([0, 0.5, 1, 2.0]), scaleGraph2: new Curve([0, 0.7, 1, 2.6]),
        alphaGraph: new Curve([0, 0, 0.15, 0.5 * Math.min(1, k), 1, 0]),
        colorGraph: new CurveSet([[0, 0.5, 1, 0.72], [0, 0.47, 1, 0.68], [0, 0.43, 1, 0.62]]),
        startAngle: 0, startAngle2: 360,
      });
    } else {
      // Bursts of hot sparks every few seconds (see burst()).
      const every = e.every ?? 6;
      this.bursts.push({ entity, every, timer: every * (0.3 + Math.random()) });
    }
  }

  private burst(at: Vec3): void {
    let n = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.life = 0.45 + Math.random() * 0.35;
      s.velocity.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 3);
      s.entity.setPosition(at);
      s.entity.setLocalScale(0.035, 0.035, 0.035);
      s.entity.enabled = true;
      if (++n >= SPARKS_PER_BURST) break;
    }
  }

  /** `focus`: the hero; only emitters near it simulate and draw (at most a few at a time). */
  update(dt: number, focus: Vec3): void {
    for (const { entity, reach } of this.emitters) {
      const p = entity.getPosition();
      const d = Math.hypot(p.x - focus.x, p.z - focus.z) - reach;
      if (entity.enabled && d > ACTIVE_RADIUS + 2) entity.enabled = false;
      else if (!entity.enabled && d < ACTIVE_RADIUS) entity.enabled = true;
    }
    for (const b of this.bursts) {
      if (!b.entity.enabled) continue;
      b.timer -= dt;
      if (b.timer > 0) continue;
      b.timer = b.every * (0.5 + Math.random());
      this.burst(b.entity.getPosition());
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.entity.enabled = false;
        continue;
      }
      s.velocity.y -= 9 * dt;
      const p = s.entity.getPosition();
      s.entity.setPosition(this.tmp.set(p.x + s.velocity.x * dt, Math.max(0.02, p.y + s.velocity.y * dt), p.z + s.velocity.z * dt));
      const k = 0.035 * Math.min(1, s.life / 0.3);
      s.entity.setLocalScale(k, k, k);
    }
  }
}

/** Soft round white sprite (alpha falloff) shared by every ambient emitter. */
function softDot(app: AppBase): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_SRGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}
