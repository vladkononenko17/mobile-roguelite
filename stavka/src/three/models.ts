import * as THREE from "three";
import { outline } from "../../../rozshuk/src/three/models.ts";
import { glow, toon } from "./fx.ts";

/**
 * Low-poly models for «Ставка», built from primitives in code (no downloads):
 * what flies at Ukraine, what shoots it down, what Ukraine sends back, and
 * what it hits. Flying things point their nose along +X so `rotation.y =
 * heading` (heading measured from east, counter-clockwise, north up) aims them.
 */

const INK = 0.035;
type M = THREE.Material;

function mk(geo: THREE.BufferGeometry, m: M, ink = INK): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (ink > 0) outline(mesh, ink);
  return mesh;
}
function put<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
const box = (w: number, h: number, d: number, m: M, ink = INK) => mk(new THREE.BoxGeometry(w, h, d), m, ink);
/** A cylinder lying along X. */
function rod(r1: number, r2: number, len: number, m: M, seg = 8, ink = INK): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.rotateZ(-Math.PI / 2);
  return mk(g, m, ink);
}
/** A cone pointing +X. */
function noseCone(r: number, len: number, m: M, seg = 8): THREE.Mesh {
  const g = new THREE.ConeGeometry(r, len, seg);
  g.rotateZ(-Math.PI / 2);
  return mk(g, m, 0.02);
}
const cyl = (r1: number, r2: number, h: number, m: M, seg = 8, ink = INK) => mk(new THREE.CylinderGeometry(r1, r2, h, seg), m, ink);
function flat(points: [number, number][], thick: number, m: M, ink = INK): THREE.Mesh {
  const s = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -thick / 2, 0);
  return mk(g, m, ink);
}

// ================================================================ what flies at us

export function shahed(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0x7d8088), dark = toon(0x2a2b30);
  put(flat([[1.55, 0], [-0.6, -1.25], [-0.45, 0], [-0.6, 1.25]], 0.1, body), 0, 0, 0, g);
  put(rod(0.17, 0.15, 2.2, body, 6), 0.1, 0.08, 0, g);
  put(noseCone(0.17, 0.5, body, 6), 1.45, 0.08, 0, g);
  put(box(0.42, 0.42, 0.05, dark, 0), -0.5, 0.2, -1.2, g);
  put(box(0.42, 0.42, 0.05, dark, 0), -0.5, 0.2, 1.2, g);
  put(box(0.06, 0.9, 0.08, dark, 0), -1.05, 0.08, 0, g).name = "prop";
  return g;
}
export function kh101(color = 0xd9dbe0): THREE.Group {
  const g = new THREE.Group();
  const body = toon(color), dark = toon(0x3a3c44);
  put(rod(0.2, 0.2, 4.2, body, 8), 0, 0, 0, g);
  put(noseCone(0.2, 0.8, body), 2.5, 0, 0, g);
  put(flat([[0.4, 0], [-0.2, -1.1], [-0.45, -1.1], [-0.3, 0], [-0.45, 1.1], [-0.2, 1.1]], 0.05, dark), 0.2, -0.05, 0, g);
  put(flat([[-1.6, 0], [-2.1, -0.5], [-2.1, 0.5]], 0.05, dark), 0, 0, 0, g);
  put(box(0.5, 0.45, 0.05, dark, 0), -1.9, 0.25, 0, g);
  return g;
}
export function kalibr(): THREE.Group {
  const g = kh101(0xaeb7c0);
  g.scale.set(0.85, 1, 1);
  return g;
}
export function iskander(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0x6f7a5c), dark = toon(0x2e3326);
  put(rod(0.42, 0.42, 3.6, body, 10), 0, 0, 0, g);
  put(noseCone(0.42, 1.4, body, 10), 2.5, 0, 0, g);
  for (let i = 0; i < 4; i++) {
    const f = box(0.7, 0.04, 0.55, dark, 0);
    const a = (i * Math.PI) / 2;
    f.position.set(-1.6, Math.sin(a) * 0.5, Math.cos(a) * 0.5);
    f.rotation.x = a;
    g.add(f);
  }
  return g;
}
export function kinzhal(): THREE.Group {
  const g = iskander();
  g.scale.set(1.25, 0.75, 0.75);
  return g;
}

// ================================================================ what we send

export function liutyi(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0xe6e1d3), dark = toon(0x33363d);
  put(rod(0.15, 0.11, 2.3, body, 6), 0, 0, 0, g);
  put(noseCone(0.15, 0.45, body, 6), 1.35, 0, 0, g);
  put(box(0.4, 0.06, 3.0, body), 0.25, 0.05, 0, g);
  put(box(0.24, 0.05, 1.0, dark, 0), -1.05, 0.05, 0, g);
  put(box(0.26, 0.38, 0.05, dark, 0), -1.05, 0.22, 0.45, g);
  put(box(0.26, 0.38, 0.05, dark, 0), -1.05, 0.22, -0.45, g);
  put(box(0.05, 0.7, 0.08, dark, 0), -1.25, 0, 0, g).name = "prop";
  return g;
}
export function neptune(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0x9aa49a), dark = toon(0x2f3a44);
  put(rod(0.22, 0.22, 3.4, body, 8), 0, 0, 0, g);
  put(noseCone(0.22, 0.7, body), 2.05, 0, 0, g);
  put(flat([[0.3, 0], [-0.1, -0.9], [-0.3, -0.9], [-0.2, 0], [-0.3, 0.9], [-0.1, 0.9]], 0.05, dark), 0, -0.05, 0, g);
  for (const s of [-1, 1]) put(box(0.45, 0.04, 0.4, dark, 0), -1.55, 0, s * 0.3, g);
  put(box(0.45, 0.4, 0.04, dark, 0), -1.55, 0.25, 0, g);
  return g;
}
export function flamingo(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0xe9e4dc), red = toon(0xd2452f), dark = toon(0x2f3338);
  put(rod(0.32, 0.3, 5.2, body, 10), 0, 0, 0, g);
  put(noseCone(0.32, 1.0, red, 10), 3.1, 0, 0, g);
  put(box(0.8, 0.06, 4.2, body), 0.4, 0.18, 0, g);
  put(box(0.5, 0.05, 1.4, dark, 0), -2.4, 0, 0, g);
  put(box(0.5, 0.7, 0.05, dark, 0), -2.4, 0.4, 0, g);
  put(rod(0.22, 0.22, 1.2, dark, 8), -1.6, 0.45, 0, g);
  return g;
}
export function storm(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0x8f9aa4), dark = toon(0x30363d);
  const b = box(4.0, 0.42, 0.6, body);
  g.add(b);
  put(noseCone(0.32, 0.8, body, 4), 2.4, 0, 0, g).rotation.x = Math.PI / 4;
  put(box(0.7, 0.04, 2.3, dark, 0), 0.2, -0.2, 0, g);
  put(box(0.4, 0.5, 0.04, dark, 0), -1.8, 0.35, 0, g);
  return g;
}
export function atacms(): THREE.Group {
  const g = new THREE.Group();
  const body = toon(0xe8e8e2), dark = toon(0x3a3d40);
  put(rod(0.3, 0.3, 3.2, body, 10), 0, 0, 0, g);
  put(noseCone(0.3, 1.0, body, 10), 2.1, 0, 0, g);
  for (let i = 0; i < 4; i++) { const f = box(0.5, 0.04, 0.4, dark, 0); const a = (i * Math.PI) / 2 + Math.PI / 4; f.position.set(-1.4, Math.sin(a) * 0.35, Math.cos(a) * 0.35); f.rotation.x = a; g.add(f); }
  return g;
}
export function decoy(): THREE.Group {
  const g = liutyi();
  g.scale.setScalar(0.75);
  return g;
}

// ================================================================ interceptors

export function samMissile(): THREE.Group {
  const g = new THREE.Group();
  put(rod(0.12, 0.12, 1.5, toon(0xf2f2ee), 6, 0.02), 0, 0, 0, g);
  put(noseCone(0.12, 0.35, toon(0xf2f2ee), 6), 0.92, 0, 0, g);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), glow(0xffc070, 3));
  flame.geometry.rotateZ(Math.PI / 2);
  put(flame, -1.15, 0, 0, g);
  return g;
}
export function interceptorDrone(): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0x2d3036);
  put(rod(0.1, 0.08, 0.9, m, 6, 0.02), 0, 0, 0, g);
  put(box(0.08, 0.04, 1.1, m, 0), 0.05, 0, 0, g).rotation.y = Math.PI / 4;
  put(box(0.08, 0.04, 1.1, m, 0), 0.05, 0, 0, g).rotation.y = -Math.PI / 4;
  return g;
}

// ================================================================ our air defence on the ground

function truck(color: number, len = 2.4): THREE.Group {
  const g = new THREE.Group();
  const m = toon(color), dark = toon(0x22261e);
  put(box(len, 0.45, 1.0, m), 0, 0.45, 0, g);
  put(box(0.7, 0.6, 0.95, m), len / 2 + 0.25, 0.55, 0, g);
  for (const x of [-len / 2 + 0.3, 0, len / 2 + 0.2]) for (const z of [-0.5, 0.5]) put(cyl(0.22, 0.22, 0.18, dark, 8, 0), x, 0.22, z, g).rotation.x = Math.PI / 2;
  return g;
}
export function patriot(): THREE.Group {
  const g = truck(0x5d6b45, 2.6);
  const can = box(2.2, 0.75, 0.95, toon(0x3f4a30));
  can.position.set(-0.2, 1.15, 0);
  can.rotation.z = 0.55;
  g.add(can);
  const radar = new THREE.Group();
  put(box(1.6, 0.5, 1.1, toon(0x5d6b45)), 0, 0.3, 0, radar);
  const face = box(0.15, 1.3, 1.25, toon(0x6b7a50));
  face.position.set(0.5, 1.15, 0);
  face.rotation.z = -0.35;
  radar.add(face);
  put(radar, 0, 0, 2.4, g);
  return g;
}
export function samp(): THREE.Group {
  const g = truck(0x8a8a70, 2.6);
  for (let i = 0; i < 4; i++) { const c = rod(0.18, 0.18, 2.2, toon(0x6a6a55), 8); c.position.set(-0.1, 1.25 + (i >> 1) * 0.38, (i % 2 ? 0.2 : -0.2)); c.rotation.z = 1.2; g.add(c); }
  return g;
}
export function irist(): THREE.Group {
  const g = truck(0x6a6f5a, 2.4);
  const rack = box(1.9, 0.6, 0.9, toon(0x4a4f40));
  rack.position.set(-0.3, 1.15, 0);
  rack.rotation.z = 0.25;
  g.add(rack);
  return g;
}
export function nasams(): THREE.Group {
  const g = new THREE.Group();
  put(box(2.2, 0.35, 1.4, toon(0x6f7563)), 0, 0.2, 0, g);
  for (let i = 0; i < 6; i++) { const c = box(1.8, 0.22, 0.22, toon(0x4c5244)); c.position.set(0, 0.6 + Math.floor(i / 3) * 0.26, -0.3 + (i % 3) * 0.3); c.rotation.z = 0.3; g.add(c); }
  return g;
}
export function gepard(): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0x5c6a3e), dark = toon(0x262a1e);
  put(box(2.6, 0.55, 1.3, m), 0, 0.42, 0, g);
  put(box(2.6, 0.3, 1.5, dark, 0), 0, 0.15, 0, g);
  const tur = put(box(1.1, 0.6, 1.0, m), -0.1, 1.0, 0, g);
  for (const z of [-0.65, 0.65]) put(rod(0.06, 0.06, 1.6, dark, 6, 0), 0.75, 0.05, z, tur);
  put(cyl(0.35, 0.35, 0.08, dark, 10, 0), -0.4, 0.5, 0, tur);
  return g;
}
export function mobile(): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0x8a8f78), dark = toon(0x222222);
  put(box(1.8, 0.4, 0.9, m), 0, 0.42, 0, g);
  put(box(0.7, 0.42, 0.85, m), 0.5, 0.82, 0, g);
  for (const x of [-0.6, 0.6]) for (const z of [-0.45, 0.45]) put(cyl(0.2, 0.2, 0.16, dark, 8, 0), x, 0.2, z, g).rotation.x = Math.PI / 2;
  const gun = put(rod(0.04, 0.04, 0.9, dark, 6, 0), -0.4, 1.0, 0, g);
  gun.rotation.z = 0.6;
  return g;
}
export function adModel(kind: string): THREE.Group {
  switch (kind) {
    case "patriot": return patriot();
    case "samp": return samp();
    case "irist": return irist();
    case "nasams": return nasams();
    case "gepard": return gepard();
    default: return mobile();
  }
}

// ================================================================ enemy assets

export function tu95(): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0xb7bcc2), dark = toon(0x3a3e44);
  put(rod(0.4, 0.3, 6.5, m, 8), 0, 0, 0, g);
  put(noseCone(0.4, 0.8, m), 3.6, 0, 0, g);
  put(flat([[0.6, 0], [-1.2, -3.6], [-1.7, -3.6], [-0.6, 0], [-1.7, 3.6], [-1.2, 3.6]], 0.08, m), 0.4, 0, 0, g);
  put(flat([[-2.5, 0], [-3.2, -1.3], [-3.5, -1.3], [-3.2, 0], [-3.5, 1.3], [-3.2, 1.3]], 0.06, m), 0, 0.1, 0, g);
  put(box(0.8, 0.9, 0.06, m, 0), -3.1, 0.5, 0, g);
  for (const z of [-2.4, -1.2, 1.2, 2.4]) put(cyl(0.45, 0.45, 0.03, dark, 10, 0), Math.abs(z) > 2 ? -0.5 : 0.25, 0.05, z, g).rotation.z = Math.PI / 2;
  return g;
}
export function su34(): THREE.Group {
  const g = new THREE.Group();
  const m = toon(0x8c96a0);
  put(rod(0.3, 0.2, 3.4, m, 6), 0, 0, 0, g);
  put(noseCone(0.3, 0.8, m, 6), 2.1, 0, 0, g);
  put(flat([[0.5, 0], [-0.9, -1.6], [-1.3, -1.6], [-1.0, 0], [-1.3, 1.6], [-0.9, 1.6]], 0.06, m), 0, 0, 0, g);
  for (const z of [-0.35, 0.35]) put(box(0.5, 0.6, 0.04, m, 0), -1.4, 0.4, z, g);
  return g;
}
export function warship(): THREE.Group {
  const g = new THREE.Group();
  const hull = toon(0x58616c), deck = toon(0x8a939c);
  put(flat([[2.6, 0], [1.8, -0.55], [-2.4, -0.55], [-2.4, 0.55], [1.8, 0.55]], 0.5, hull), 0, 0.2, 0, g);
  put(box(1.6, 0.6, 0.8, deck), -0.3, 0.75, 0, g);
  put(box(0.6, 0.9, 0.5, deck), -0.2, 1.4, 0, g);
  put(box(0.5, 0.25, 0.6, toon(0x3a4048)), 1.3, 0.55, 0, g);
  return g;
}

/** Ground targets in Russia and occupied land; `kind` from TargetKind. */
export function targetModel(kind: string, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const pad = (w: number, d: number, c = 0x8f8a7c) => put(box(w, 0.08, d, toon(c), 0), 0, 0.04, 0, g);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  switch (kind) {
    case "refinery": {
      pad(9, 7);
      for (let i = 0; i < 6; i++) put(cyl(0.85, 0.85, 0.9, toon(0xe8e4da), 14), (i % 3) * 2 - 2.5, 0.5, Math.floor(i / 3) * 2 - 2, g);
      for (let i = 0; i < 3; i++) put(cyl(0.3, 0.42, 3.2 + i * 0.8, toon(0x7a7f87), 8), 2.6 + i * 0.8, (3.2 + i * 0.8) / 2, 1.6, g);
      put(cyl(0.14, 0.2, 5, toon(0xb8432f), 6), -3.5, 2.5, 2.4, g);
      const flare = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), glow(0xffa030, 3));
      flare.name = "flare";
      put(flare, -3.5, 5.4, 2.4, g);
      put(box(2.6, 1.2, 1.4, toon(0xcfc6b2)), 0.2, 0.6, 2.3, g);
      break;
    }
    case "depot": {
      pad(9, 8, 0x7f7a62);
      for (let i = 0; i < 8; i++) {
        const b = mk(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 10, 1, false, 0, Math.PI), toon(0x6c7350));
        b.rotation.set(0, 0, Math.PI / 2);
        b.rotation.x = Math.PI / 2;
        put(b, (i % 4) * 2 - 3, 0.05, Math.floor(i / 4) * 3 - 1.5, g);
      }
      break;
    }
    case "factory": {
      pad(9, 6);
      for (let i = 0; i < 3; i++) {
        put(box(2.4, 1.3, 4.0, toon(0xc5b49a)), i * 2.6 - 2.6, 0.65, 0, g);
        for (let k = 0; k < 4; k++) { const t = mk(new THREE.CylinderGeometry(0.01, 0.55, 0.6, 3), toon(0x8e8a80), 0.01); t.rotation.set(Math.PI / 2, 0, 0); put(t, i * 2.6 - 2.6, 1.55, k - 1.5, g); }
      }
      put(cyl(0.2, 0.26, 3.2, toon(0x9a4a3a), 6), 3.6, 1.6, 2.2, g);
      break;
    }
    case "radar": {
      pad(5, 5, 0x7f7a62);
      put(cyl(0.12, 0.18, 3, toon(0x6a6f60), 6), 0, 1.5, 0, g);
      const dish = mk(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), toon(0xd8d8d0), 0.02);
      dish.rotation.x = -1.0;
      dish.name = "dish";
      put(dish, 0, 3.1, 0, g);
      for (let i = 0; i < 3; i++) put(truck(0x5f6648, 1.6), -2 + i * 2, 0, 2.2, g).scale.setScalar(0.7);
      break;
    }
    case "airbase": {
      put(box(11, 0.06, 1.4, toon(0x5f5e5a), 0), 0, 0.04, 0, g);
      put(box(4, 0.06, 2.6, toon(0x6d6c66), 0), 1.5, 0.04, 2.2, g);
      for (let i = 0; i < 3; i++) { const p = tu95(); p.scale.setScalar(0.42); p.rotation.y = Math.PI / 2; put(p, -0.2 + i * 1.6, 0.45, 2.3, g); }
      for (let i = 0; i < 3; i++) { const p = su34(); p.scale.setScalar(0.38); p.rotation.y = -Math.PI / 2; put(p, -3.8 + i * 1.1, 0.35, -1.6, g); }
      break;
    }
    case "port": {
      put(box(8, 0.5, 2, toon(0x8a8a82)), 0, 0.25, 1.8, g);
      for (let i = 0; i < 3; i++) { const sh = warship(); sh.scale.setScalar(0.55); put(sh, -2.5 + i * 2.5, 0, -0.4, g); }
      for (let i = 0; i < 2; i++) put(box(0.3, 2.4, 0.3, toon(0xd08a30)), -3 + i * 6, 1.2, 2.2, g);
      break;
    }
    case "bridge": {
      const deck = toon(0x9a9a92);
      put(box(12, 0.25, 0.9, deck), 0, 1.0, 0, g);
      for (let i = 0; i < 9; i++) put(box(0.3, 1.0, 0.6, toon(0x77776f)), -5.6 + i * 1.4, 0.45, 0, g);
      const arch = mk(new THREE.TorusGeometry(1.4, 0.08, 4, 16, Math.PI), toon(0xb8b8b0), 0.01);
      put(arch, 0, 1.1, 0, g);
      g.rotation.y = 0.9;
      break;
    }
    case "rail": {
      pad(10, 4, 0x7a7466);
      for (let k = 0; k < 4; k++) {
        put(box(10, 0.05, 0.12, toon(0x4a4640), 0), 0, 0.1, -1.4 + k * 0.9, g);
        for (let i = 0; i < 5; i++) if (r() < 0.75) put(box(1.4, 0.55, 0.55, toon([0x7a3a2a, 0x3d5a6a, 0x6a6a5a][i % 3])), -4 + i * 1.8, 0.38, -1.4 + k * 0.9, g);
      }
      break;
    }
    case "launchers": {
      pad(7, 5, 0x7f7a62);
      for (let i = 0; i < 4; i++) {
        const t = truck(0x5d6b45, 2.4);
        const m = iskander();
        m.scale.setScalar(0.38);
        m.rotation.z = 0.6;
        put(m, -0.2, 1.3, 0, t);
        t.scale.setScalar(0.75);
        put(t, (i % 2) * 3 - 1.5, 0, Math.floor(i / 2) * 2.2 - 1.1, g);
      }
      break;
    }
  }
  return g;
}

// ================================================================ ours on the ground

export function powerPlant(): THREE.Group {
  const g = new THREE.Group();
  put(box(4, 0.08, 3.2, toon(0x8a8778), 0), 0, 0.04, 0, g);
  for (const x of [-1.1, 0.4]) put(cyl(0.55, 0.85, 2.2, toon(0xd8d4c8), 12), x, 1.1, -0.6, g);
  put(box(1.8, 1.0, 1.1, toon(0xb8ae98)), 0.6, 0.5, 0.9, g);
  put(cyl(0.12, 0.16, 3.2, toon(0xb04a3a), 6), 1.6, 1.6, -0.9, g);
  return g;
}
export function ourFactory(): THREE.Group {
  const g = new THREE.Group();
  put(box(3, 1.0, 1.8, toon(0xc5b49a)), 0, 0.5, 0, g);
  for (let k = 0; k < 4; k++) { const t = mk(new THREE.CylinderGeometry(0.01, 0.45, 0.45, 3), toon(0x8e8a80), 0.01); t.rotation.set(0, 0, Math.PI / 2); put(t, -1.1 + k * 0.72, 1.2, 0, g); }
  put(cyl(0.12, 0.15, 1.8, toon(0x9a4a3a), 6), 1.1, 0.9, 0.6, g);
  return g;
}
export function airstrip(): THREE.Group {
  const g = new THREE.Group();
  put(box(7, 0.06, 1.2, toon(0x6c6a62), 0), 0, 0.03, 0, g);
  for (let i = 0; i < 6; i++) put(box(0.4, 0.07, 0.08, toon(0xe8e4d8), 0), -2.8 + i * 1.1, 0.07, 0, g);
  return g;
}

/** Shared geometry for a city's blocks (instanced by the scene). */
export const blockGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const windowGeo = new THREE.BoxGeometry(1, 0.06, 1);
