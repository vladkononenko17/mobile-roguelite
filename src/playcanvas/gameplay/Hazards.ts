import { BLEND_ADDITIVE, BLEND_NORMAL, Color, Entity, StandardMaterial, Vec3, type AppBase } from "playcanvas";

function flat(color: Color, opacity: number, additive = false): StandardMaterial {
  const material = new StandardMaterial();
  material.diffuse.set(0, 0, 0);
  material.emissive.copy(color);
  material.useLighting = false;
  material.opacity = opacity;
  material.blendType = additive ? BLEND_ADDITIVE : BLEND_NORMAL;
  material.depthWrite = false;
  material.update();
  return material;
}

interface Marker {
  entity: Entity;
  /** Seconds left; the marker pulses faster as it runs out. */
  life: number;
  total: number;
  size: number;
}

interface Projectile {
  entity: Entity;
  marker: Marker;
  from: Vec3;
  to: Vec3;
  time: number;
  flight: number;
  damage: number;
  radius: number;
}

/**
 * Enemy hazards readable from the top-down camera: red ground rings (a slam or a projectile's
 * landing zone), a red lane (a charge) and slow lobbed projectiles that damage everything under
 * their ring when they land. Pooled; flat unlit discs cost one draw each.
 */
export class Hazards {
  private readonly root = new Entity("Hazards");
  private readonly rings: Marker[] = [];
  private readonly lanes: Marker[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly tmp = new Vec3();
  /** Called when a projectile lands: damages the player if inside `radius`. */
  onImpact: (position: Vec3, radius: number, damage: number) => void = () => {};

  constructor(app: AppBase) {
    app.root.addChild(this.root);
    const ring = flat(new Color(0.95, 0.12, 0.08), 0.35);
    const lane = flat(new Color(0.95, 0.12, 0.08), 0.3);
    const blob = flat(new Color(0.55, 0.95, 0.25), 1, true);
    for (let i = 0; i < 10; i++) this.rings.push(this.marker("ring", "cylinder", ring));
    for (let i = 0; i < 3; i++) this.lanes.push(this.marker("lane", "box", lane));
    for (let i = 0; i < 8; i++) {
      const entity = new Entity("projectile");
      entity.addComponent("render", { type: "sphere", castShadows: false, material: blob });
      entity.enabled = false;
      this.root.addChild(entity);
      this.projectiles.push({ entity, marker: this.rings[0], from: new Vec3(), to: new Vec3(), time: 0, flight: 1, damage: 0, radius: 1 });
    }
  }

  private marker(name: string, type: string, material: StandardMaterial): Marker {
    const entity = new Entity(name);
    entity.addComponent("render", { type, castShadows: false, receiveShadows: false, material });
    entity.enabled = false;
    this.root.addChild(entity);
    return { entity, life: 0, total: 1, size: 1 };
  }

  private free<T extends { entity: Entity }>(pool: T[]): T | null {
    return pool.find((p) => !p.entity.enabled) ?? null;
  }

  /** A warning ring of `radius` at (x, z) for `seconds`. Returns it so it can be cleared early. */
  ring(x: number, z: number, radius: number, seconds: number): Marker | null {
    const m = this.free(this.rings);
    if (!m) return null;
    m.entity.enabled = true;
    m.entity.setPosition(x, 0.03, z);
    m.life = m.total = seconds;
    m.size = radius;
    m.entity.setLocalScale(radius * 2, 0.01, radius * 2);
    return m;
  }

  /** A warning lane from (x, z) along the unit direction (dx, dz), `length` long. */
  lane(x: number, z: number, dx: number, dz: number, length: number, width: number, seconds: number): Marker | null {
    const m = this.free(this.lanes);
    if (!m) return null;
    m.entity.enabled = true;
    m.entity.setPosition(x + dx * length * 0.5, 0.03, z + dz * length * 0.5);
    m.entity.setEulerAngles(0, (Math.atan2(dx, dz) * 180) / Math.PI, 0);
    m.life = m.total = seconds;
    m.size = width;
    m.entity.setLocalScale(width, 0.01, length);
    return m;
  }

  clear(marker: Marker | null): void {
    if (marker) marker.entity.enabled = false;
  }

  /** Lobs a slow projectile from `from` to land at (x, z); its landing ring shows the whole flight. */
  throw(from: Vec3, x: number, z: number, speed: number, radius: number, damage: number): void {
    const p = this.free(this.projectiles);
    if (!p) return;
    p.from.copy(from);
    p.to.set(x, 0.1, z);
    p.flight = Math.max(0.6, from.distance(p.to) / speed);
    p.time = 0;
    p.damage = damage;
    p.radius = radius;
    const marker = this.ring(x, z, radius, p.flight);
    if (!marker) return;
    p.marker = marker;
    p.entity.enabled = true;
    p.entity.setLocalScale(0.35, 0.35, 0.35);
    p.entity.setPosition(from);
  }

  update(dt: number): void {
    for (const m of [...this.rings, ...this.lanes]) {
      if (!m.entity.enabled) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.entity.enabled = false;
        continue;
      }
    }
    for (const p of this.projectiles) {
      if (!p.entity.enabled) continue;
      p.time += dt;
      const t = Math.min(1, p.time / p.flight);
      this.tmp.lerp(p.from, p.to, t);
      this.tmp.y += Math.sin(Math.PI * t) * Math.min(4, p.flight * 2.2);
      p.entity.setPosition(this.tmp);
      if (t >= 1) {
        p.entity.enabled = false;
        p.marker.entity.enabled = false;
        this.onImpact(p.to, p.radius, p.damage);
      }
    }
  }

  /** Removes everything (between levels). */
  reset(): void {
    for (const m of [...this.rings, ...this.lanes]) m.entity.enabled = false;
    for (const p of this.projectiles) p.entity.enabled = false;
  }
}
