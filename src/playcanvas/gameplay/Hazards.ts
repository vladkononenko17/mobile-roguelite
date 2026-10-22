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
  /** Inner disc that grows to the full size as the countdown runs out (rings only). */
  fill: Entity | null;
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

/** A straight, visible, dodgeable bolt (casters, flyers, bosses). */
interface Bolt {
  entity: Entity;
  shadow: Entity;
  position: Vec3;
  dirX: number;
  dirZ: number;
  speed: number;
  radius: number;
  damage: number;
  range: number;
  travelled: number;
}

/** A delayed strike: a filling ring, then an impact (meteor from the sky / eruption from below). */
interface Strike {
  /** The countdown ring; null while the strike is free. */
  marker: Marker | null;
  orb: Entity | null;
  x: number;
  z: number;
  radius: number;
  damage: number;
  kind: "meteor" | "eruption";
  /** Fire zone left behind (seconds, damage per second); 0 = none. */
  burn: number;
  burnDps: number;
}

/** Burning ground: damages the player per second while inside. */
interface Zone {
  entity: Entity;
  x: number;
  z: number;
  radius: number;
  dps: number;
  life: number;
  total: number;
}

/** A summoning portal: a ring that opens, then calls `onDone` (the spawn). */
interface Portal {
  entity: Entity;
  life: number;
  total: number;
  radius: number;
  onDone: (() => void) | null;
}

const RINGS = 48;
const BOLTS = 48;
const STRIKES = 40;
const ZONES = 20;
const TARS = 10;
const PORTALS = 8;

/**
 * Enemy hazards readable from the top-down camera. Every damaging attack is telegraphed:
 * - rings (a slam, a landing zone): a red outline with an inner disc that grows to the full size
 *   exactly when it hits, so the timing reads at a glance;
 * - lanes (a charge);
 * - lobbed projectiles (their landing ring shows the whole flight);
 * - bolts: slow glowing orbs flying straight, with a shadow on the ground - dodge sideways;
 * - strikes: meteors / eruptions - a filling ring, then the impact, optionally leaving fire;
 * - fire zones: burning ground, damage per second while standing in it;
 * - tar: brimstone pools that slow the hero while he stands in them (playerInTar);
 * - portals: a summoning circle that opens before a demon steps out.
 * Pooled; flat unlit meshes, one draw each.
 */
export class Hazards {
  private readonly root = new Entity("Hazards");
  private readonly rings: Marker[] = [];
  private readonly lanes: Marker[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly strikes: Strike[] = [];
  private readonly zones: Zone[] = [];
  private readonly portals: Portal[] = [];
  private readonly tars: { entity: Entity; x: number; z: number; radius: number; life: number; total: number }[] = [];
  /** Whether the player stood in tar at the last update. */
  playerInTar = false;
  private readonly tmp = new Vec3();
  private time = 0;
  /** Called when a projectile lands / a strike hits: damages the player if inside `radius`. */
  onImpact: (position: Vec3, radius: number, damage: number) => void = () => {};
  /** Called when a bolt reaches the player (within its radius). */
  onBoltHit: (damage: number, dirX: number, dirZ: number) => void = () => {};
  /** Called each frame the player stands in fire: damage for this frame. */
  onBurn: (damage: number) => void = () => {};
  /** Visual hook for impacts (explosion / fire pillar). */
  onBlast: (position: Vec3, radius: number, kind: "meteor" | "eruption" | "bolt") => void = () => {};

  constructor(app: AppBase) {
    app.root.addChild(this.root);
    const ring = flat(new Color(0.95, 0.12, 0.08), 0.35);
    // Additive (opacity has no effect): colours are kept low so stacked telegraphs never white out.
    const fill = flat(new Color(0.42, 0.1, 0.03), 1, true);
    const lane = flat(new Color(0.95, 0.12, 0.08), 0.3);
    const blob = flat(new Color(0.55, 0.95, 0.25), 1, true);
    const bolt = flat(new Color(1.6, 0.6, 0.15), 1, true);
    const shadow = flat(new Color(0.9, 0.25, 0.05), 0.5, true);
    const orb = flat(new Color(1.8, 0.8, 0.25), 1, true);
    const fire = flat(new Color(0.5, 0.16, 0.02), 1, true);
    const portal = flat(new Color(0.9, 0.08, 0.2), 0.8, true);
    for (let i = 0; i < RINGS; i++) {
      const m = this.marker("ring", "cylinder", ring);
      const f = new Entity("ring-fill");
      f.addComponent("render", { type: "cylinder", castShadows: false, receiveShadows: false, material: fill });
      f.setLocalPosition(0, 0.5, 0);
      m.entity.addChild(f);
      m.fill = f;
      this.rings.push(m);
    }
    for (let i = 0; i < 4; i++) this.lanes.push(this.marker("lane", "box", lane));
    for (let i = 0; i < 8; i++) {
      const entity = new Entity("projectile");
      entity.addComponent("render", { type: "sphere", castShadows: false, material: blob });
      entity.enabled = false;
      this.root.addChild(entity);
      this.projectiles.push({ entity, marker: this.rings[0], from: new Vec3(), to: new Vec3(), time: 0, flight: 1, damage: 0, radius: 1 });
    }
    for (let i = 0; i < BOLTS; i++) {
      const entity = new Entity("bolt");
      entity.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false, material: bolt });
      const s = new Entity("bolt-shadow");
      s.addComponent("render", { type: "cylinder", castShadows: false, receiveShadows: false, material: shadow });
      entity.enabled = s.enabled = false;
      this.root.addChild(entity);
      this.root.addChild(s);
      this.bolts.push({ entity, shadow: s, position: new Vec3(), dirX: 0, dirZ: 1, speed: 6, radius: 0.3, damage: 0, range: 10, travelled: 0 });
    }
    for (let i = 0; i < STRIKES; i++) {
      const o = new Entity("meteor");
      o.addComponent("render", { type: "sphere", castShadows: false, receiveShadows: false, material: orb });
      o.enabled = false;
      this.root.addChild(o);
      this.strikes.push({ marker: null, orb: o, x: 0, z: 0, radius: 1, damage: 0, kind: "meteor", burn: 0, burnDps: 0 });
    }
    for (let i = 0; i < ZONES; i++) {
      const entity = new Entity("fire-zone");
      entity.addComponent("render", { type: "cylinder", castShadows: false, receiveShadows: false, material: fire });
      entity.enabled = false;
      this.root.addChild(entity);
      this.zones.push({ entity, x: 0, z: 0, radius: 1, dps: 0, life: 0, total: 1 });
    }
    // Tar: opaque dark ooze with a sickly violet sheen (not additive: it reads as a floor you sink in).
    const tar = flat(new Color(0.16, 0.05, 0.2), 0.85);
    for (let i = 0; i < TARS; i++) {
      const entity = new Entity("tar");
      entity.addComponent("render", { type: "cylinder", castShadows: false, receiveShadows: false, material: tar });
      entity.enabled = false;
      this.root.addChild(entity);
      this.tars.push({ entity, x: 0, z: 0, radius: 1, life: 0, total: 1 });
    }
    for (let i = 0; i < PORTALS; i++) {
      const entity = new Entity("portal");
      entity.addComponent("render", { type: "torus", castShadows: false, receiveShadows: false, material: portal });
      entity.enabled = false;
      this.root.addChild(entity);
      this.portals.push({ entity, life: 0, total: 1, radius: 1, onDone: null });
    }
  }

  private marker(name: string, type: string, material: StandardMaterial): Marker {
    const entity = new Entity(name);
    entity.addComponent("render", { type, castShadows: false, receiveShadows: false, material });
    entity.enabled = false;
    this.root.addChild(entity);
    return { entity, fill: null, life: 0, total: 1, size: 1 };
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
    m.fill?.setLocalScale(0.001, 1, 0.001);
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

  /** Fires a straight bolt from `from` along the unit direction (dx, dz). */
  bolt(from: Vec3, dx: number, dz: number, speed: number, radius: number, damage: number, range: number): void {
    const b = this.free(this.bolts);
    if (!b) return;
    b.position.set(from.x, Math.max(0.9, Math.min(1.4, from.y)), from.z);
    b.dirX = dx;
    b.dirZ = dz;
    b.speed = speed;
    b.radius = radius;
    b.damage = damage;
    b.range = range;
    b.travelled = 0;
    b.entity.enabled = b.shadow.enabled = true;
    b.entity.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);
    b.shadow.setLocalScale(radius * 1.8, 0.01, radius * 1.8);
  }

  /**
   * A meteor (an orb falls from the sky onto the ring) or an eruption (the ground bursts): a filling
   * ring for `delay` seconds, then the hit; `burn` seconds of fire (at `burnDps`) may stay behind.
   */
  strike(x: number, z: number, radius: number, delay: number, damage: number, kind: "meteor" | "eruption", burn = 0, burnDps = 0): void {
    const s = this.strikes.find((k) => !k.marker);
    if (!s) return;
    const marker = this.ring(x, z, radius, delay);
    if (!marker) return;
    Object.assign(s, { marker, x, z, radius, damage, kind, burn, burnDps });
    if (s.orb) {
      s.orb.enabled = kind === "meteor";
      s.orb.setLocalScale(radius * 0.7, radius * 0.7, radius * 0.7);
    }
  }

  /** Burning ground at (x, z) for `seconds`. */
  fire(x: number, z: number, radius: number, seconds: number, dps: number): void {
    const f = this.free(this.zones);
    if (!f) return;
    Object.assign(f, { x, z, radius, dps, life: seconds, total: seconds });
    f.entity.enabled = true;
    f.entity.setPosition(x, 0.04, z);
    f.entity.setLocalScale(radius * 2, 0.01, radius * 2);
  }

  /** A brimstone tar pool at (x, z) for `seconds`: the hero is slowed inside it. */
  tar(x: number, z: number, radius: number, seconds: number): void {
    const t = this.free(this.tars);
    if (!t) return;
    Object.assign(t, { x, z, radius, life: seconds, total: seconds });
    t.entity.enabled = true;
    t.entity.setPosition(x, 0.03, z);
  }

  /** A summoning portal that opens over `seconds`, then calls `onDone`. */
  portal(x: number, z: number, radius: number, seconds: number, onDone: () => void): void {
    const p = this.free(this.portals);
    if (!p) {
      onDone();
      return;
    }
    Object.assign(p, { life: seconds, total: seconds, radius, onDone });
    p.entity.enabled = true;
    p.entity.setPosition(x, 0.08, z);
  }

  update(dt: number, player?: Vec3, playerRadius = 0.35): void {
    this.time += dt;
    for (const m of [...this.rings, ...this.lanes]) {
      if (!m.entity.enabled) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.entity.enabled = false;
        continue;
      }
      if (m.fill) {
        const k = Math.max(0.001, 1 - m.life / m.total);
        m.fill.setLocalScale(k, 1, k);
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
    for (const b of this.bolts) {
      if (!b.entity.enabled) continue;
      const step = b.speed * dt;
      b.position.x += b.dirX * step;
      b.position.z += b.dirZ * step;
      b.travelled += step;
      const pulse = 1 + Math.sin(this.time * 25 + b.travelled) * 0.12;
      b.entity.setLocalScale(b.radius * 1.5 * pulse, b.radius * 1.5 * pulse, b.radius * 1.5 * pulse);
      b.entity.setPosition(b.position);
      b.shadow.setPosition(b.position.x, 0.04, b.position.z);
      let done = b.travelled >= b.range;
      if (!done && player && Math.hypot(player.x - b.position.x, player.z - b.position.z) < b.radius + playerRadius) {
        this.onBoltHit(b.damage, b.dirX, b.dirZ);
        done = true;
      }
      if (done) {
        b.entity.enabled = b.shadow.enabled = false;
        this.onBlast(b.position, b.radius, "bolt");
      }
    }
    for (const s of this.strikes) {
      if (!s.marker) continue;
      const m = s.marker;
      const left = m.entity.enabled ? m.life : 0;
      if (s.orb?.enabled) {
        // Falls along a slanted path onto the ring, arriving exactly when it fills.
        const k = Math.max(0, left / m.total);
        s.orb.setPosition(s.x + k * 3, 0.3 + k * 16, s.z - k * 5);
      }
      if (left > 0) continue;
      if (s.orb) s.orb.enabled = false;
      s.marker = null;
      this.tmp.set(s.x, 0.1, s.z);
      this.onImpact(this.tmp, s.radius, s.damage);
      this.onBlast(this.tmp, s.radius, s.kind);
      if (s.burn > 0) this.fire(s.x, s.z, s.radius * 0.85, s.burn, s.burnDps);
    }
    for (const f of this.zones) {
      if (!f.entity.enabled) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.entity.enabled = false;
        continue;
      }
      // Flicker, fading out over the last second.
      const k = Math.min(1, f.life) * (0.9 + Math.sin(this.time * 18 + f.x) * 0.1);
      f.entity.setLocalScale(f.radius * 2 * (0.94 + 0.06 * k), 0.01, f.radius * 2 * (0.94 + 0.06 * k));
      if (player && Math.hypot(player.x - f.x, player.z - f.z) < f.radius) this.onBurn(f.dps * dt);
    }
    this.playerInTar = false;
    for (const t of this.tars) {
      if (!t.entity.enabled) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.entity.enabled = false;
        continue;
      }
      // Spreads out over the first half second, shrinks away over the last one.
      const k = Math.min(1, (t.total - t.life) * 2, t.life);
      t.entity.setLocalScale(t.radius * 2 * k, 0.01, t.radius * 2 * k);
      if (player && Math.hypot(player.x - t.x, player.z - t.z) < t.radius * k) this.playerInTar = true;
    }
    for (const p of this.portals) {
      if (!p.entity.enabled) continue;
      p.life -= dt;
      const k = 1 - Math.max(0, p.life) / p.total;
      const r = p.radius * (0.3 + 0.7 * k);
      p.entity.setLocalScale(r * 2, 0.3, r * 2);
      p.entity.setEulerAngles(0, this.time * 120, 0);
      if (p.life <= 0) {
        p.entity.enabled = false;
        const done = p.onDone;
        p.onDone = null;
        done?.();
      }
    }
  }

  /** Removes everything (between levels). */
  reset(): void {
    for (const m of [...this.rings, ...this.lanes]) m.entity.enabled = false;
    for (const p of this.projectiles) p.entity.enabled = false;
    for (const b of this.bolts) b.entity.enabled = b.shadow.enabled = false;
    for (const t of this.tars) t.entity.enabled = false;
    this.playerInTar = false;
    for (const s of this.strikes) {
      if (s.orb) s.orb.enabled = false;
      s.marker = null;
    }
    for (const f of this.zones) f.entity.enabled = false;
    for (const p of this.portals) {
      p.entity.enabled = false;
      p.onDone = null;
    }
  }
}
