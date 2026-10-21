import * as THREE from "three";
import { rng } from "./geo";

/**
 * Fallen leaves: a small painted atlas (four leaf shapes in autumn colours,
 * with veins) drawn once on a canvas, and an InstancedMesh of slightly curled
 * quads. The same mesh type is used for leaves on the lawn, on the deck, in
 * the gutter and floating on the pool, and later for the leaf-blower physics.
 */

let atlas: THREE.CanvasTexture | null = null;

function leafAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S * 2;
  const g = c.getContext("2d")!;
  const cols = [["#c2561e", "#e08a2c"], ["#d9a12a", "#f0c64a"], ["#8c3a1c", "#b5532a"], ["#9a8a3a", "#c2ac4a"]];
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * S, oy = Math.floor(i / 2) * S;
    g.save();
    g.translate(ox + S / 2, oy + S / 2);
    const grad = g.createLinearGradient(0, -S * 0.45, 0, S * 0.45);
    grad.addColorStop(0, cols[i][1]);
    grad.addColorStop(1, cols[i][0]);
    g.fillStyle = grad;
    g.beginPath();
    if (i === 0) {
      // maple-ish: five lobes
      for (let k = 0; k <= 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = (k % 2 === 0 ? 0.44 : 0.2) * S;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.95;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
    } else {
      const w = i === 3 ? 0.16 : 0.24;
      g.moveTo(0, -S * 0.45);
      g.bezierCurveTo(S * w, -S * 0.3, S * w, S * 0.25, 0, S * 0.42);
      g.bezierCurveTo(-S * w, S * 0.25, -S * w, -S * 0.3, 0, -S * 0.45);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60,25,8,0.45)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -S * 0.42);
    g.lineTo(0, S * 0.44);
    for (let k = -3; k <= 3; k++) {
      g.moveTo(0, k * S * 0.09);
      g.lineTo(S * 0.15, k * S * 0.09 - S * 0.08);
      g.moveTo(0, k * S * 0.09);
      g.lineTo(-S * 0.15, k * S * 0.09 - S * 0.08);
    }
    g.stroke();
    // blotches
    for (let k = 0; k < 6; k++) {
      g.fillStyle = `rgba(70,35,10,${0.08 + Math.random() * 0.12})`;
      g.beginPath();
      g.arc((Math.random() - 0.5) * S * 0.3, (Math.random() - 0.5) * S * 0.6, 6 + Math.random() * 14, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function leafGeometry(): THREE.BufferGeometry {
  // a 3×3 grid, curled up along its length and edges
  const g = new THREE.PlaneGeometry(1, 1, 2, 2);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, (x * x) * 0.35 + (y * y) * 0.2);
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export interface LeafScatter {
  count: number;
  /** Returns a position for leaf i (or null to skip). */
  place: (r: () => number) => THREE.Vector3 | null;
  size?: [number, number];
  /** Tilt randomness, radians. */
  tilt?: number;
  seed?: number;
}

export function buildLeaves(o: LeafScatter): THREE.InstancedMesh {
  const tex = leafAtlas();
  const geo = leafGeometry();
  const tile = new Float32Array(o.count);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aTile;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vMapUv = vMapUv * 0.5 + vec2(mod(aTile, 2.0), floor(aTile / 2.0)) * 0.5;`,
      );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, o.count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const r = rng(o.seed ?? 11);
  const [s0, s1] = o.size ?? [0.07, 0.13];
  const tilt = o.tilt ?? 0.35;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < o.count; i++) {
    const p = o.place(r);
    if (!p) continue;
    e.set((r() - 0.5) * tilt, r() * Math.PI * 2, (r() - 0.5) * tilt);
    q.setFromEuler(e);
    const sz = s0 + (s1 - s0) * r();
    s.set(sz, sz, sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
    tile[k] = Math.floor(r() * 4);
    k++;
  }
  mesh.count = k;
  geo.setAttribute("aTile", new THREE.InstancedBufferAttribute(tile, 1));
  return mesh;
}
