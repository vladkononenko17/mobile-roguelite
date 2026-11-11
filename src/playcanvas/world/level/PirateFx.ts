import {
  ADDRESS_CLAMP_TO_EDGE,
  ADDRESS_REPEAT,
  BLEND_ADDITIVE,
  BLEND_NORMAL,
  Color,
  Entity,
  FILTER_LINEAR,
  FILTER_LINEAR_MIPMAP_LINEAR,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
  Vec2,
  type AppBase,
  type MeshInstance,
  type RenderComponent,
} from "playcanvas";
import { createPatchMask } from "../Ground";

/**
 * The Black Tide's sea and breeze (all procedural, a handful of draw calls near the hero):
 * - breaking waves: white crests that roll in towards a shoreline, swell, and wash out in foam;
 * - glints: a sparkle layer drifting over the sea against the swell;
 * - cloud shadows: soft dark blots sailing across the ground with the wind;
 * - sway: palms, flags and banners lean and flutter in the breeze (taken out of the static batch).
 */

/** A beach edge: a line from (x0, z0) to (x1, z1) on the sea's surface; the sea lies on its `sea` side (unit vector). */
export interface Shoreline { x0: number; z0: number; x1: number; z1: number; sea: [number, number]; y: number }

/** The wind blows towards +x, a little south: palms lean east, cloud shadows drift that way. */
const WIND: [number, number] = [0.93, 0.36];

interface Wave { entity: Entity; mesh: MeshInstance; line: Shoreline; along: number; t: number; period: number; reach: number; width: number }
interface Swayer { entity: Entity; amp: number; speed: number; phase: number; flutter: boolean; yaw: number }
interface Cloud { entity: Entity; x: number; z: number; size: number }

const fx = {
  waves: [] as Wave[],
  swayers: [] as Swayer[],
  clouds: [] as Cloud[],
  glints: [] as StandardMaterial[],
  glintOffset: new Vec2(),
  time: 0,
};

function canvasTexture(app: AppBase, canvas: HTMLCanvasElement, repeat: boolean): Texture {
  const t = new Texture(app.graphicsDevice, {
    format: PIXELFORMAT_RGBA8, mipmaps: true, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR,
    addressU: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE, addressV: repeat ? ADDRESS_REPEAT : ADDRESS_CLAMP_TO_EDGE,
  });
  t.setSource(canvas);
  return t;
}

/** A wave crest: a bright curling line with foam trailing behind it (towards the sea), soft at the ends. */
function crestTexture(app: AppBase): Texture {
  const w = 256, h = 64;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.35, "rgba(235,250,248,0.35)");
  grad.addColorStop(0.62, "rgba(255,255,255,1)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Foam flecks behind the crest.
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h * 0.55, 1 + Math.random() * 2.2, 0, Math.PI * 2); g.fill();
  }
  // Fade both ends.
  g.globalCompositeOperation = "destination-in";
  const ends = g.createLinearGradient(0, 0, w, 0);
  ends.addColorStop(0, "rgba(0,0,0,0)");
  ends.addColorStop(0.18, "rgba(0,0,0,1)");
  ends.addColorStop(0.82, "rgba(0,0,0,1)");
  ends.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = ends;
  g.fillRect(0, 0, w, h);
  return canvasTexture(app, c, false);
}

/** Sea sparkle: scattered sun glints and short light streaks on transparent black (additive). */
function glintTexture(app: AppBase): Texture {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * n, y = Math.random() * n, l = 3 + Math.random() * 10, a = 0.25 + Math.random() * 0.55;
    g.strokeStyle = `rgba(255,250,225,${a})`;
    g.lineWidth = 1 + Math.random() * 1.3;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { g.beginPath(); g.moveTo(x + ox - l, y + oy); g.lineTo(x + ox + l, y + oy); g.stroke(); }
  }
  return canvasTexture(app, c, true);
}

/** Builds the waves along `shorelines` and the glint layers over `seas` (rectangles at their sea level). */
export function buildSeaFx(app: AppBase, root: Entity, shorelines: Shoreline[], seas: { x: number; z: number; w: number; d: number; y: number }[]): void {
  fx.waves = [];
  fx.glints = [];
  fx.swayers = [];
  fx.clouds = [];
  const crest = crestTexture(app);
  const m = new StandardMaterial();
  m.diffuse.set(0, 0, 0);
  m.emissive = new Color(0.95, 1, 1);
  m.emissiveMap = crest;
  m.opacityMap = crest;
  m.opacityMapChannel = "a";
  m.useLighting = false;
  m.blendType = BLEND_NORMAL;
  m.depthWrite = false;
  m.update();
  for (const line of shorelines) {
    const len = Math.hypot(line.x1 - line.x0, line.z1 - line.z0);
    const count = Math.max(1, Math.round(len / 13));
    for (let i = 0; i < count; i++) {
      const e = new Entity("wave");
      e.addComponent("render", { type: "plane", material: m, castShadows: false, receiveShadows: false });
      root.addChild(e);
      const mesh = (e.render as RenderComponent).meshInstances[0];
      const period = 4.5 + Math.random() * 2.5;
      fx.waves.push({ entity: e, mesh, line, along: (i + 0.5) / count + (Math.random() - 0.5) * 0.4 / count, t: Math.random() * period, period, reach: 14 + Math.random() * 8, width: Math.min(len / count + 6, 18) });
    }
  }
  const glint = glintTexture(app);
  for (const s of seas) {
    const gm = new StandardMaterial();
    gm.diffuse.set(0, 0, 0);
    gm.emissive = new Color(0.9, 0.9, 0.8);
    gm.emissiveMap = glint;
    gm.emissiveMapTiling = new Vec2(s.w / 11, s.d / 11);
    gm.useLighting = false;
    gm.blendType = BLEND_ADDITIVE;
    gm.useFog = false; // additive: fog would add its colour over the whole quad
    gm.depthWrite = false;
    gm.update();
    const e = new Entity("glints");
    e.addComponent("render", { type: "plane", material: gm, castShadows: false, receiveShadows: false });
    e.setLocalScale(s.w, 1, s.d);
    e.setLocalPosition(s.x, s.y + 0.02, s.z);
    root.addChild(e);
    fx.glints.push(gm);
  }
  // Cloud shadows: a few soft blots that follow the hero's neighbourhood, drifting with the wind.
  const cm = new StandardMaterial();
  cm.diffuse.set(0, 0, 0);
  cm.emissive = new Color(0.02, 0.04, 0.08);
  cm.useLighting = false;
  cm.opacity = 0.2;
  cm.opacityMap = createPatchMask(app, 91);
  cm.opacityMapChannel = "a";
  cm.blendType = BLEND_NORMAL;
  cm.depthWrite = false;
  cm.update();
  for (let i = 0; i < 4; i++) {
    const e = new Entity("cloud-shadow");
    e.addComponent("render", { type: "plane", material: cm, castShadows: false, receiveShadows: false });
    const size = 16 + Math.random() * 14;
    e.setLocalScale(size, 1, size * 0.7);
    root.addChild(e);
    fx.clouds.push({ entity: e, x: (Math.random() - 0.5) * 60, z: (Math.random() - 0.5) * 60, size });
  }
}

/**
 * Lets a placed model move in the wind: out of the static batch, leaning (palms, `amp` degrees) or
 * fluttering (flags and banners).
 */
export function sway(entity: Entity | null, amp: number, flutter = false): void {
  if (!entity) return;
  for (const r of entity.findComponents("render") as RenderComponent[]) r.batchGroupId = -1;
  fx.swayers.push({ entity, amp, speed: flutter ? 3.2 + Math.random() * 1.5 : 0.8 + Math.random() * 0.5, phase: Math.random() * 6, flutter, yaw: entity.getLocalEulerAngles().y });
}

export function updateSeaFx(dt: number, hero: { x: number; z: number }): void {
  fx.time += dt;
  const t = fx.time;
  // Waves: in from the sea, swelling, then washing out on the sand.
  for (const w of fx.waves) {
    w.t += dt;
    if (w.t > w.period) { w.t -= w.period; w.along = Math.min(0.97, Math.max(0.03, w.along + (Math.random() - 0.5) * 0.08)); }
    const k = w.t / w.period;
    const { line } = w;
    const px = line.x0 + (line.x1 - line.x0) * w.along, pz = line.z0 + (line.z1 - line.z0) * w.along;
    // Far from the hero: skip the work (the camera sees ~25 m).
    if (Math.abs(px - hero.x) > 45 || Math.abs(pz - hero.z) > 50) { w.entity.enabled = false; continue; }
    w.entity.enabled = true;
    const dist = w.reach * (1 - k) * (1 - k) - 1.2 * k;
    const x = px + line.sea[0] * dist, z = pz + line.sea[1] * dist;
    w.entity.setLocalPosition(x, line.y + 0.05, z);
    // The crest runs along the shore; its foam side faces the sea.
    w.entity.setLocalEulerAngles(0, (Math.atan2(line.sea[0], line.sea[1]) * 180) / Math.PI + 180, 0);
    const depth = 2.2 + 3.5 * k;
    w.entity.setLocalScale(w.width * (0.6 + 0.4 * k), 1, depth);
    const alpha = k < 0.2 ? k / 0.2 : k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1;
    w.mesh.setParameter("material_opacity", alpha * 0.85);
  }
  // Glints drift against the swell.
  fx.glintOffset.set((t * 0.013) % 1, (-t * 0.02) % 1);
  for (const m of fx.glints) {
    m.emissiveMapOffset = fx.glintOffset;
    m.emissiveIntensity = 0.75 + 0.25 * Math.sin(t * 1.7);
    m.update();
  }
  // Cloud shadows sail with the wind; one that drifts far from the hero comes round again upwind.
  for (const c of fx.clouds) {
    c.x += WIND[0] * dt * 2.2;
    c.z += WIND[1] * dt * 2.2;
    let rx = c.x - hero.x, rz = c.z - hero.z;
    if (rx > 40) rx -= 80; else if (rx < -40) rx += 80;
    if (rz > 45) rz -= 90; else if (rz < -45) rz += 90;
    c.x = hero.x + rx; c.z = hero.z + rz;
    c.entity.setLocalPosition(c.x, 0.03, c.z);
  }
  // Palms lean into gusts; flags flutter.
  const gust = 0.6 + 0.4 * Math.sin(t * 0.35) * Math.sin(t * 0.13 + 1);
  for (const s of fx.swayers) {
    if (!s.entity.enabled) continue;
    const p = s.entity.getPosition();
    if (Math.abs(p.x - hero.x) > 40 || Math.abs(p.z - hero.z) > 45) continue;
    if (s.flutter) {
      s.entity.setLocalEulerAngles(Math.sin(t * s.speed * 1.3 + s.phase) * s.amp * 0.4, s.yaw + Math.sin(t * s.speed + s.phase) * s.amp, Math.sin(t * s.speed * 0.7 + s.phase) * s.amp * 0.3);
    } else {
      const lean = s.amp * (0.5 * gust + 0.5 * gust * Math.sin(t * s.speed + s.phase));
      s.entity.setLocalEulerAngles(WIND[1] * -lean, s.yaw, WIND[0] * -lean);
    }
  }
}
