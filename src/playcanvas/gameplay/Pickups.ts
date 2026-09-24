import {
  BLEND_ADDITIVE, BLEND_NORMAL, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance, PIXELFORMAT_RGBA8, StandardMaterial, Texture, Vec3,
  type AppBase, type GraphicsDevice,
} from "playcanvas";
import { DROPS, PLAYER_COMBAT, UPGRADES, type UpgradeId } from "./config";
import { badgeCanvas, CATEGORY_COLORS, type UpgradeCategory } from "../ui/UpgradeIcons";

/** Pickup kinds. "cash" is the run currency (spent between levels). */
export type PickupKind = "cash" | "health" | "upgrade";

interface Pickup {
  entity: Entity;
  /** The cash bundle (enabled only for cash). */
  cash: Entity;
  /** Box primitive for health. */
  box: Entity;
  /** Upgrade token: glow halo + icon badge, tilted to face the camera. */
  token: Entity;
  badge: Entity;
  glow: Entity;
  /** The upgrade an upgrade pickup grants (shown on its badge). */
  upgrade: UpgradeId | null;
  /** Second bar of the health plus sign (enabled only for health). */
  bar: Entity;
  kind: PickupKind;
  value: number;
  position: Vec3;
  life: number;
  /** Seconds since it dropped (spawn pop). */
  age: number;
  /** Seconds left of the collect animation (> 0 while flying into the hero; already counted). */
  collecting: number;
  spin: number;
  active: boolean;
}

function material(color: Color, glow: number): StandardMaterial {
  const m = new StandardMaterial();
  m.diffuse.copy(color);
  m.emissive.set(color.r * glow, color.g * glow, color.b * glow);
  m.gloss = 0.6;
  m.update();
  return m;
}

const BOX_LOOK: Record<"health", { size: [number, number, number]; material: () => StandardMaterial }> = {
  // A flat red plus sign (the second bar is a child); red so it never reads as green cash.
  health: { size: [0.36, 0.12, 0.12], material: () => material(new Color(0.95, 0.22, 0.2), 0.5) },
};

type Box = [[number, number, number], [number, number, number], [number, number, number]];

/** Boxes of the cash bundle: [min xyz, max xyz, rgb]. Metres, ~0.4 m long before CASH_SCALE. */
const CASH_BOXES: Box[] = [
  // Stack of dark green notes.
  [[-0.2, 0, -0.1], [0.2, 0.09, 0.1], [0.13, 0.3, 0.15]],
  // Lighter green top note.
  [[-0.19, 0.09, -0.092], [0.19, 0.1, 0.092], [0.42, 0.68, 0.37]],
  // Darker print at both ends of the top note.
  [[0.1, 0.1, -0.045], [0.155, 0.104, 0.045], [0.2, 0.42, 0.22]],
  [[-0.155, 0.1, -0.045], [-0.1, 0.104, 0.045], [0.2, 0.42, 0.22]],
  // Beige paper band around the middle.
  [[-0.045, -0.006, -0.106], [0.045, 0.108, 0.106], [0.93, 0.83, 0.52]],
];

/** One mesh for the whole bundle (vertex colours), so a bundle is a single draw call. */
function cashMesh(device: GraphicsDevice): Mesh {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  // Faces: normal axis, sign, and the two in-plane axes (ordered for counter-clockwise winding).
  const faces: [number, number, number, number][] = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]];
  for (const [min, max, rgb] of CASH_BOXES) {
    for (const [axis, sign, u, v] of faces) {
      const base = positions.length / 3;
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const p = [0, 0, 0];
        p[axis] = sign > 0 ? max[axis] : min[axis];
        p[u] = a ? max[u] : min[u];
        p[v] = b ? max[v] : min[v];
        positions.push(...p);
        const n = [0, 0, 0];
        n[axis] = sign;
        normals.push(...n);
        colors.push(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255), 255);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const mesh = new Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors32(colors);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/** Spawn pop length (0 -> small overshoot -> 1), collect animation length, cash bundle scale. */
const POP = 0.3;
const COLLECT = 0.18;
const CASH_SCALE = 1.15;
/** Tilt that turns a flat badge (normal +Y) toward the gameplay camera (52 deg pitch). */
const BADGE_TILT = 38;
const BADGE_SIZE = 0.72;

/**
 * Drops on the ground: cash (run currency), small heals and rare upgrades. Pooled; they pop in, bob
 * and spin (readable from the top-down camera), fly to the hero within the magnet radius, blink before
 * they expire, and shrink into the hero when collected. Cash is a stylised bundle of green notes with
 * a paper band (one merged mesh, one shared material); an upgrade is a glowing round badge with its
 * icon (canvas texture per upgrade, additive halo per category), much rarer; health is a red cross.
 */
export class Pickups {
  private readonly items: Pickup[] = [];
  private readonly root = new Entity("Pickups");
  private readonly materials = new Map<"health", StandardMaterial>();
  /** Upgrade badge materials per upgrade (icon texture), glow materials per category. */
  private readonly badgeMaterials = new Map<UpgradeId, StandardMaterial>();
  private readonly glowMaterials = new Map<UpgradeCategory, StandardMaterial>();

  /** Called when the hero collects one (`upgrade`: the upgrade an upgrade pickup grants). */
  onCollect: (kind: PickupKind, value: number, upgrade: UpgradeId | null) => void = () => {};

  constructor(private readonly app: AppBase) {
    app.root.addChild(this.root);
    const mesh = cashMesh(app.graphicsDevice);
    const cashMaterial = new StandardMaterial();
    cashMaterial.diffuseVertexColor = true;
    cashMaterial.emissiveVertexColor = true;
    cashMaterial.emissiveIntensity = 0.3;
    cashMaterial.gloss = 0.35;
    cashMaterial.update();
    for (let i = 0; i < DROPS.pool; i++) {
      const entity = new Entity("pickup");
      const cash = new Entity("cash");
      cash.addComponent("render", { meshInstances: [new MeshInstance(mesh, cashMaterial)], castShadows: false });
      cash.setLocalScale(CASH_SCALE, CASH_SCALE, CASH_SCALE);
      const box = new Entity("box");
      box.addComponent("render", { type: "box", castShadows: false });
      const bar = new Entity("cross");
      bar.addComponent("render", { type: "box", castShadows: false });
      bar.setLocalScale(0.3, 1, 3);
      box.addChild(bar);
      const token = new Entity("upgrade-token");
      token.setLocalEulerAngles(BADGE_TILT, 0, 0);
      const glow = new Entity("glow");
      glow.addComponent("render", { type: "plane", castShadows: false, receiveShadows: false });
      glow.setLocalPosition(0, -0.01, 0);
      const badge = new Entity("badge");
      badge.addComponent("render", { type: "plane", castShadows: false, receiveShadows: false });
      badge.setLocalScale(BADGE_SIZE, 1, BADGE_SIZE);
      token.addChild(glow);
      token.addChild(badge);
      entity.addChild(cash);
      entity.addChild(box);
      entity.addChild(token);
      entity.enabled = false;
      this.root.addChild(entity);
      this.items.push({ entity, cash, box, bar, token, badge, glow, upgrade: null, kind: "cash", value: 0, position: new Vec3(), life: 0, age: 0, collecting: 0, spin: 0, active: false });
    }
  }

  private boxMaterial(kind: "health"): StandardMaterial {
    let m = this.materials.get(kind);
    if (!m) this.materials.set(kind, (m = BOX_LOOK[kind].material()));
    return m;
  }

  /** Unlit, alpha-blended, double-sided material on a canvas texture. */
  private canvasMaterial(canvas: HTMLCanvasElement, additive: boolean, color = "#ffffff"): StandardMaterial {
    const texture = new Texture(this.app.graphicsDevice, { format: PIXELFORMAT_RGBA8, mipmaps: true });
    texture.setSource(canvas);
    const m = new StandardMaterial();
    m.useLighting = false;
    m.useFog = false;
    m.diffuse.set(0, 0, 0);
    m.emissive = new Color().fromString(color);
    m.emissiveMap = texture;
    m.opacityMap = texture;
    m.opacityMapChannel = "a";
    m.blendType = additive ? BLEND_ADDITIVE : BLEND_NORMAL;
    m.depthWrite = false;
    m.cull = CULLFACE_NONE;
    m.update();
    return m;
  }

  private badgeMaterial(id: UpgradeId): StandardMaterial {
    let m = this.badgeMaterials.get(id);
    if (!m) {
      const def = UPGRADES.find((u) => u.id === id)!;
      this.badgeMaterials.set(id, (m = this.canvasMaterial(badgeCanvas(def.icon, def.category), false)));
    }
    return m;
  }

  private glowMaterial(category: UpgradeCategory): StandardMaterial {
    let m = this.glowMaterials.get(category);
    if (!m) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.55, "rgba(255,255,255,0.3)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      this.glowMaterials.set(category, (m = this.canvasMaterial(canvas, true, CATEGORY_COLORS[category])));
    }
    return m;
  }

  /** Drops a pickup; an upgrade pickup shows (and grants) `upgrade`. */
  drop(kind: PickupKind, x: number, z: number, value = 1, upgrade: UpgradeId | null = null): void {
    const p = this.items.find((i) => !i.active) ?? this.items.reduce((a, b) => (a.life < b.life ? a : b));
    p.kind = kind;
    p.value = value;
    p.active = true;
    p.life = DROPS.lifetime;
    p.age = 0;
    p.collecting = 0;
    p.spin = Math.random() * 360;
    // A little scatter so several drops do not overlap.
    p.position.set(x + (Math.random() - 0.5) * 0.8, 0, z + (Math.random() - 0.5) * 0.8);
    p.upgrade = kind === "upgrade" ? upgrade ?? UPGRADES[0].id : null;
    p.cash.enabled = kind === "cash";
    p.box.enabled = kind === "health";
    p.token.enabled = kind === "upgrade";
    if (p.upgrade) {
      const def = UPGRADES.find((u) => u.id === p.upgrade)!;
      p.badge.render!.meshInstances[0].material = this.badgeMaterial(def.id);
      p.glow.render!.meshInstances[0].material = this.glowMaterial(def.category);
    } else if (kind === "health") {
      const look = BOX_LOOK[kind];
      p.box.render!.meshInstances[0].material = this.boxMaterial(kind);
      p.box.setLocalScale(look.size[0], look.size[1], look.size[2]);
      p.bar.enabled = kind === "health";
      if (p.bar.enabled) p.bar.render!.meshInstances[0].material = this.boxMaterial(kind);
    }
    p.entity.setLocalScale(0, 0, 0);
    p.entity.enabled = true;
  }

  /** `vacuum`: everything flies to the hero (end of a level). */
  update(dt: number, player: Vec3, scale: number, vacuum = false): void {
    const magnet = vacuum ? 1000 : PLAYER_COMBAT.magnetRadius, grab = PLAYER_COMBAT.pickupRadius;
    for (const p of this.items) {
      if (!p.active) continue;
      // Collected: shrink while flying up into the hero's chest (purely visual; already counted).
      if (p.collecting > 0) {
        p.collecting -= dt;
        if (p.collecting <= 0) {
          this.remove(p);
          continue;
        }
        const k = 1 - Math.exp(-25 * dt);
        p.position.x += (player.x - p.position.x) * k;
        p.position.z += (player.z - p.position.z) * k;
        const s = p.collecting / COLLECT;
        p.entity.setPosition(p.position.x, (0.3 + (1 - s) * 0.7) * scale, p.position.z);
        p.entity.setLocalScale(s, s, s);
        continue;
      }
      p.life -= dt;
      p.age += dt;
      if (p.life <= 0) {
        this.remove(p);
        continue;
      }
      const dx = player.x - p.position.x, dz = player.z - p.position.z;
      const d = Math.hypot(dx, dz);
      if (d < grab) {
        this.onCollect(p.kind, p.value, p.upgrade);
        p.collecting = COLLECT;
        p.entity.enabled = true;
        continue;
      }
      if (d < magnet) {
        const step = Math.min(d, PLAYER_COMBAT.magnetSpeed * dt * (vacuum ? 2.5 : 1 + (magnet - d) / magnet));
        p.position.x += (dx / d) * step;
        p.position.z += (dz / d) * step;
      }
      const cash = p.kind === "cash", token = p.kind === "upgrade";
      p.spin += dt * (cash ? 70 : 140);
      if (token) {
        // Floats higher, bobs, sways (a full spin would hide the icon) and its halo breathes.
        const t = p.age;
        p.entity.setPosition(p.position.x, (0.6 + Math.sin(t * 3) * 0.08) * scale, p.position.z);
        p.entity.setEulerAngles(0, Math.sin(t * 1.6) * 28, 0);
        const halo = BADGE_SIZE * (1.45 + Math.sin(t * 5) * 0.12);
        p.glow.setLocalScale(halo, 1, halo);
      } else {
        const bob = (cash ? 0.28 : 0.35) + Math.sin(p.spin * (cash ? 0.1 : 0.05)) * 0.06;
        p.entity.setPosition(p.position.x, bob * scale, p.position.z);
        // Cash tilts a little so its green face shows to the high camera.
        if (cash) p.entity.setEulerAngles(18, p.spin, 0);
        else p.entity.setEulerAngles(0, p.spin, 0);
      }
      // Spawn pop with a small overshoot.
      const t = Math.min(1, p.age / POP);
      const pop = t < 1 ? Math.sin(t * Math.PI * 0.5) * (1 + 0.3 * Math.sin(t * Math.PI)) : 1;
      p.entity.setLocalScale(pop, pop, pop);
      // Blink during the last three seconds.
      p.entity.enabled = p.life > 3 || Math.floor(p.life * 6) % 2 === 0;
    }
  }

  private remove(p: Pickup): void {
    p.active = false;
    p.upgrade = null;
    p.collecting = 0;
    p.entity.enabled = false;
  }

  clear(): void {
    for (const p of this.items) if (p.active) this.remove(p);
  }
}
