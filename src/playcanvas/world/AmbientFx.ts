import {
  BLEND_ADDITIVE, BLEND_NORMAL, Color, Curve, CurveSet, EMITTERSHAPE_BOX, Entity, PIXELFORMAT_SRGBA8, StandardMaterial, Texture, Vec3,
  type AppBase,
} from "playcanvas";

/**
 * One ambient emitter placed by a level (a biome lists its own): drifting dust motes over an area,
 * a smoke column / wisp from a fire or wreck (or steam from a vent), occasional spark bursts from a
 * generator or lamp, or a coloured pool of light on the floor under a screen or lamp (optionally
 * pulsing, for alarms); a fire (licking flames over a flickering light pool: burning wrecks,
 * barrels, camp fires); leaves and scraps blowing across an area; a flock of crows circling high over
 * it. Positions are world metres; `size` is the area (dust, glow, leaves, the flock's circle) or the
 * emitter spread (smoke / sparks / fire).
 */
export interface AmbientEmitter {
  kind: "dust" | "smoke" | "sparks" | "glow" | "embers" | "sigil" | "fire" | "leaves" | "birds";
  /** Tint (linear 0..1): dust and smoke colour, glow light colour. */
  color?: [number, number, number];
  /** Glow: pulses per second (0 = steady). */
  pulse?: number;
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
  private readonly pulses: { material: StandardMaterial; rate: number; base: number; phase: number }[] = [];
  private readonly glowMaterials = new Map<string, StandardMaterial>();
  /** Fire light pools flicker (irregular, not the alarm pulse). */
  private readonly flickers: { material: StandardMaterial; base: number; phase: number }[] = [];
  private readonly flocks: { entity: Entity; homeX: number; homeZ: number; birds: { entity: Entity; angle: number; speed: number; radius: number; height: number; flap: number }[] }[] = [];
  private birdMaterial: StandardMaterial | null = null;
  private leafTexture: Texture | null = null;
  private glowTexture: Texture | null = null;
  private sigilTexture: Texture | null = null;
  private time = 0;
  private readonly tmp = new Vec3();

  constructor(private readonly app: AppBase, emitters: AmbientEmitter[]) {
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
    if (e.kind === "glow" || e.kind === "sigil") {
      this.addGlow(entity, e);
      return;
    }
    if (e.kind === "birds") {
      this.addFlock(entity, e);
      return;
    }
    const [cr, cg, cb] = e.color ?? [1, 1, 1];
    const common = { colorMap: sprite, depthWrite: false, lighting: false, localSpace: false, emitterShape: EMITTERSHAPE_BOX };
    if (e.kind === "dust") {
      // Sun-lit motes drifting sideways, fading in and out (additive, so they read on any ground).
      entity.addComponent("particlesystem", {
        ...common, numParticles: Math.round(30 * k), lifetime: 7, rate: 0.2 / k, rate2: 0.35 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx, 1.6, sz), blendType: BLEND_ADDITIVE,
        velocityGraph: new CurveSet([[0, 0.12], [0, 0.02], [0, 0.05]]), velocityGraph2: new CurveSet([[0, 0.28], [0, 0.08], [0, -0.05]]),
        scaleGraph: new Curve([0, 0.07, 1, 0.1]), scaleGraph2: new Curve([0, 0.1, 1, 0.14]),
        alphaGraph: new Curve([0, 0, 0.3, 0.55, 0.7, 0.55, 1, 0]),
        colorGraph: new CurveSet([[0, 0.55 * cr], [0, 0.48 * cg], [0, 0.36 * cb]]),
      });
    } else if (e.kind === "embers") {
      // Glowing flecks rising off lava and braziers, wandering as they climb and burning out.
      entity.addComponent("particlesystem", {
        ...common, numParticles: Math.round(24 * k), lifetime: 3.2, rate: 0.12 / k, rate2: 0.25 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx, 0.2, sz), blendType: BLEND_ADDITIVE,
        velocityGraph: new CurveSet([[0, -0.25, 0.5, 0.2, 1, -0.2], [0, 0.7, 1, 1.1], [0, -0.2, 0.5, 0.25, 1, -0.1]]),
        velocityGraph2: new CurveSet([[0, 0.25, 0.5, -0.2, 1, 0.25], [0, 1.1, 1, 1.6], [0, 0.2, 0.5, -0.25, 1, 0.15]]),
        scaleGraph: new Curve([0, 0.05, 1, 0.02]), scaleGraph2: new Curve([0, 0.08, 1, 0.03]),
        alphaGraph: new Curve([0, 0, 0.1, 1, 0.7, 0.8, 1, 0]),
        colorGraph: new CurveSet([[0, 1.0 * cr, 1, 0.9 * cr], [0, 0.55 * cg, 1, 0.25 * cg], [0, 0.18 * cb, 1, 0.05 * cb]]),
      });
    } else if (e.kind === "fire") {
      // Licking flames: bright additive tongues rising fast and shrinking, over a flickering light pool.
      entity.addComponent("particlesystem", {
        ...common, numParticles: Math.round(26 * k), lifetime: 0.9, rate: 0.03 / k, rate2: 0.05 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx * 0.5, 0.1, sz * 0.5), blendType: BLEND_ADDITIVE,
        velocityGraph: new CurveSet([[0, -0.15, 1, 0.1], [0, 1.1, 1, 1.8], [0, -0.15, 1, 0.1]]),
        velocityGraph2: new CurveSet([[0, 0.15, 1, -0.1], [0, 1.6, 1, 2.4], [0, 0.15, 1, -0.1]]),
        scaleGraph: new Curve([0, 0.6, 0.3, 0.75, 1, 0.12]), scaleGraph2: new Curve([0, 0.85, 0.3, 1.0, 1, 0.2]),
        alphaGraph: new Curve([0, 0, 0.12, 1, 0.6, 0.8, 1, 0]),
        colorGraph: new CurveSet([[0, 1.6, 1, 1.2], [0, 1.0, 0.5, 0.55, 1, 0.22], [0, 0.35, 1, 0.05]]),
      });
      const light = new Entity("fire-light");
      entity.addChild(light);
      this.addGlow(light, { kind: "glow", x: e.x, z: e.z, size: [sx * 5 + 3, sz * 5 + 3], color: [1, 0.55, 0.18], intensity: 0.55 * k });
      const m = light.render!.meshInstances[0].material as StandardMaterial;
      this.flickers.push({ material: m, base: 0.55 * k, phase: Math.random() * 100 });
    } else if (e.kind === "leaves") {
      // Dry leaves and paper scraps skittering across the ground with the wind.
      entity.addComponent("particlesystem", {
        ...common, colorMap: (this.leafTexture ??= leafTexture(this.app)), numParticles: Math.round(18 * k), lifetime: 6, rate: 0.25 / k, rate2: 0.4 / k, preWarm: true, loop: true,
        emitterExtents: new Vec3(sx, 1.2, sz), blendType: BLEND_NORMAL,
        velocityGraph: new CurveSet([[0, 0.6, 0.5, 1.4, 1, 0.8], [0, -0.1, 0.5, 0.25, 1, -0.2], [0, -0.2, 1, 0.2]]),
        velocityGraph2: new CurveSet([[0, 1.2, 0.5, 2.2, 1, 1.4], [0, 0.15, 0.5, -0.1, 1, 0.1], [0, 0.2, 1, -0.2]]),
        scaleGraph: new Curve([0, 0.22]), scaleGraph2: new Curve([0, 0.32]),
        rotationSpeedGraph: new Curve([0, -360]), rotationSpeedGraph2: new Curve([0, 360]),
        alphaGraph: new Curve([0, 0, 0.1, 1, 0.9, 1, 1, 0]),
        colorGraph: new CurveSet([[0, 0.7 * cr], [0, 0.55 * cg], [0, 0.28 * cb]]),
        colorGraph2: new CurveSet([[0, 0.95 * cr], [0, 0.78 * cg], [0, 0.45 * cb]]),
        startAngle: 0, startAngle2: 360,
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
        colorGraph: new CurveSet([[0, 0.5 * cr, 1, 0.72 * cr], [0, 0.47 * cg, 1, 0.68 * cg], [0, 0.43 * cb, 1, 0.62 * cb]]),
        startAngle: 0, startAngle2: 360,
      });
    } else {
      // Bursts of hot sparks every few seconds (see burst()).
      const every = e.every ?? 6;
      this.bursts.push({ entity, every, timer: every * (0.3 + Math.random()) });
    }
  }

  /**
   * A pool of coloured light on the floor: an additive quad with a soft falloff, just above the
   * ground decals. Steady pools of the same colour share a material; pulsing ones own theirs.
   */
  private addGlow(entity: Entity, e: AmbientEmitter): void {
    const [r, g, b] = e.color ?? [0.4, 0.7, 1];
    const k = e.intensity ?? 1;
    const key = `${e.kind},${r},${g},${b},${k}`;
    let material = e.pulse ? undefined : this.glowMaterials.get(key);
    if (!material) {
      this.glowTexture ??= softGlow(this.app);
      material = new StandardMaterial();
      material.diffuse.set(0, 0, 0);
      material.emissive = new Color(r * k, g * k, b * k);
      // A sigil is a glowing pentagram in a double ring (a summoning circle); glows are soft pools.
      material.emissiveMap = e.kind === "sigil" ? (this.sigilTexture ??= pentagram(this.app)) : this.glowTexture;
      material.useLighting = false;
      material.useSkybox = false;
      material.useFog = true;
      material.blendType = BLEND_ADDITIVE;
      material.depthWrite = false;
      material.update();
      if (e.pulse) this.pulses.push({ material, rate: e.pulse, base: k, phase: Math.random() * 6.28 });
      else this.glowMaterials.set(key, material);
    }
    const [sx, sz] = e.size ?? [4, 4];
    entity.setPosition(e.x, e.y ?? 0.035, e.z);
    entity.setLocalScale(sx, 1, sz);
    entity.addComponent("render", { type: "plane", material, castShadows: false, receiveShadows: false });
  }

  /**
   * A flock of crows circling high over an area: flat dark silhouettes (one shared material) wheeling
   * at different radii and heights, wings flapping (their width pulses). Only near the hero.
   */
  private addFlock(entity: Entity, e: AmbientEmitter): void {
    this.birdMaterial ??= birdMaterial(this.app);
    const [sx] = e.size ?? [16, 16];
    const count = Math.max(2, Math.round(4 * (e.intensity ?? 1)));
    const birds = [];
    for (let i = 0; i < count; i++) {
      const bird = new Entity("crow");
      bird.addComponent("render", { type: "plane", material: this.birdMaterial, castShadows: true, receiveShadows: false });
      entity.addChild(bird);
      birds.push({ entity: bird, angle: Math.random() * Math.PI * 2, speed: 0.35 + Math.random() * 0.25, radius: Math.min(7, sx * (0.12 + Math.random() * 0.15)), height: (e.y ?? 6.5) + Math.random() * 2, flap: Math.random() * 10 });
    }
    this.flocks.push({ entity, homeX: e.x, homeZ: e.z, birds });
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
    this.time += dt;
    for (const p of this.pulses) {
      // Alarm beacon: a sharp rise and a slower fall each cycle.
      const t = (this.time * p.rate + p.phase / 6.28) % 1;
      const level = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * Math.PI)), 2);
      p.material.emissiveIntensity = p.base * level;
      p.material.update();
    }
    for (const f of this.flickers) {
      // Fire light: two beating frequencies plus a random crackle.
      const t = this.time + f.phase;
      f.material.emissiveIntensity = f.base * (0.75 + 0.15 * Math.sin(t * 13) + 0.1 * Math.sin(t * 31.7) + (Math.random() - 0.5) * 0.12);
      f.material.update();
    }
    for (const flock of this.flocks) {
      if (!flock.entity.enabled) continue;
      // Scavengers: the flock drifts after the fight (slowly, on a leash from its home), so it
      // wheels over the hero's view.
      const c = flock.entity.getPosition();
      const k = Math.min(1, dt * 0.35), leash = 22;
      const tx = Math.max(flock.homeX - leash, Math.min(flock.homeX + leash, focus.x + 3));
      const tz = Math.max(flock.homeZ - leash, Math.min(flock.homeZ + leash, focus.z + 4));
      flock.entity.setPosition(c.x + (tx - c.x) * k, c.y, c.z + (tz - c.z) * k);
      for (const b of flock.birds) {
        b.angle += b.speed * dt;
        b.flap += dt * 9;
        const x = Math.cos(b.angle) * b.radius, z = Math.sin(b.angle) * b.radius;
        b.entity.setLocalPosition(x, b.height + Math.sin(b.flap * 0.3) * 0.4, z);
        // Heading along the circle; wings beat, with a glide now and then.
        b.entity.setLocalEulerAngles(0, (-b.angle * 180) / Math.PI, 0);
        const beat = Math.sin(b.flap) > -0.2 || Math.sin(b.flap * 0.21) > 0.6 ? 0.55 + 0.45 * Math.abs(Math.sin(b.flap)) : 1;
        b.entity.setLocalScale(1.05 * beat, 1, 0.5);
      }
    }
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

/** A leaf / paper scrap: a pointed oval with a soft edge (the particles' alpha sprite). */
function leafTexture(app: AppBase): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(16, 2);
  g.quadraticCurveTo(30, 14, 16, 30);
  g.quadraticCurveTo(2, 14, 16, 2);
  g.fill();
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_SRGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}

/** A crow seen from above: dark wings spread in a shallow V, head and tail (alpha cut-out). */
function birdMaterial(app: AppBase): StandardMaterial {
  const w = 64, h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  // Wings (across x), body along the middle.
  g.moveTo(2, 18); g.quadraticCurveTo(18, 6, 30, 13); g.lineTo(32, 6); g.lineTo(34, 13);
  g.quadraticCurveTo(46, 6, 62, 18); g.quadraticCurveTo(46, 14, 35, 19); g.lineTo(36, 28); g.lineTo(32, 25); g.lineTo(28, 28);
  g.lineTo(29, 19); g.quadraticCurveTo(18, 14, 2, 18);
  g.fill();
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_SRGBA8, mipmaps: true });
  texture.setSource(canvas);
  const m = new StandardMaterial();
  m.diffuse.set(0.03, 0.03, 0.035);
  m.opacityMap = texture;
  m.opacityMapChannel = "a";
  m.alphaTest = 0.5;
  m.cull = 0;
  m.update();
  return m;
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

/** Opaque white-to-black radial falloff for additive light pools (emissive map). */
export function softGlow(app: AppBase): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgb(255,255,255)");
  g.addColorStop(0.35, "rgb(150,150,150)");
  g.addColorStop(0.7, "rgb(40,40,40)");
  g.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_SRGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}

/** A pentagram inside a double ring, glowing lines on black (emissive map for additive sigils). */
export function pentagram(app: AppBase): Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const c = size / 2;
  const glowLine = (width: number, draw: () => void) => {
    // A soft halo under a hot core, so the lines read as molten channels.
    for (const [w, colour] of [[width * 3.2, "rgba(255,120,30,0.28)"], [width * 1.8, "rgba(255,150,50,0.6)"], [width, "rgb(255,220,150)"]] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = colour;
      ctx.lineJoin = "round";
      ctx.beginPath();
      draw();
      ctx.stroke();
    }
  };
  const outer = size * 0.46, inner = size * 0.41;
  glowLine(9, () => ctx.arc(c, c, outer, 0, Math.PI * 2));
  glowLine(5, () => ctx.arc(c, c, inner, 0, Math.PI * 2));
  glowLine(7, () => {
    for (let i = 0; i <= 5; i++) {
      // Star points every 144 degrees, one pointing up the screen (north).
      const a = -Math.PI / 2 + i * ((Math.PI * 4) / 5);
      const x = c + Math.cos(a) * inner, y = c + Math.sin(a) * inner;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  });
  const texture = new Texture(app.graphicsDevice, { format: PIXELFORMAT_SRGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}
