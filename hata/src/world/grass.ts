import * as THREE from "three";
import { rng } from "./geo";

/**
 * Lawn grass: one InstancedMesh of tapered, curved blades. Each blade's
 * height lives in its instance matrix, so mowing is just shrinking matrices
 * in a cell. The vertex shader bends blades with wind and leans their normals
 * towards the sky so a lawn shades like a soft surface rather than a forest
 * of cards. Colour runs from a dark root to a sunlit tip with per-blade
 * variation (aVar) and dry straw-coloured blades mixed in.
 */

export interface LawnOptions {
  isLawn: (x: number, z: number) => boolean;
  /** Returns 0 = uncut (tall), 1 = freshly mowed. */
  mowed: (x: number, z: number) => number;
  /** Mowing direction of the lane at (x, z): lighter or darker stripe. */
  stripe?: (x: number, z: number) => boolean;
  bounds: [number, number, number, number]; // x0, x1, z0, z1
  density: number; // blades per m²
  seed?: number;
  tall?: [number, number];
  cut?: [number, number];
}

function bladeGeometry(): THREE.BufferGeometry {
  const seg = 4;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const v = i / seg;
    const w = 0.5 * (1 - v * 0.92);
    const bend = v * v * 0.35;
    pos.push(-w, v, bend, w, v, bend);
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildLawn(o: LawnOptions): THREE.InstancedMesh {
  const r = rng(o.seed ?? 7);
  const [x0, x1, z0, z1] = o.bounds;
  const area = (x1 - x0) * (z1 - z0);
  const n = Math.floor(area * o.density);
  const tall = o.tall ?? [0.22, 0.5];
  const cut = o.cut ?? [0.05, 0.08];

  const geo = bladeGeometry();
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, vertexColors: false });
  const uTime = { value: 0 };
  mat.userData.time = uTime;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 aVar; varying vec3 vVar; varying float vH; uniform float uTime;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.65));`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vVar = aVar; vH = uv.y;
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float wv = sin(uTime * 1.7 + ip.x * 0.6 + ip.z * 0.35) * 0.5 + sin(uTime * 2.9 + ip.x * 1.7) * 0.25;
        transformed.z += wv * 0.18 * uv.y * uv.y;
        transformed.x += wv * 0.07 * uv.y * uv.y;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vVar; varying float vH;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 root = vec3(0.05, 0.09, 0.025);
        vec3 tip = mix(vec3(0.33, 0.47, 0.13), vec3(0.47, 0.55, 0.18), vVar.x);
        tip = mix(tip, vec3(0.62, 0.55, 0.30), vVar.y);  // dry blades
        tip *= 0.85 + 0.3 * vVar.z;
        diffuseColor.rgb = mix(root, tip, smoothstep(0.0, 0.9, vH));`,
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  const vars = new Float32Array(n * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (!o.isLawn(x, z)) continue;
    const mw = o.mowed(x, z);
    // clumping: taller near clump centres
    const clump = 0.6 + 0.4 * Math.sin(x * 1.3 + Math.sin(z * 0.9) * 2) * Math.cos(z * 1.1);
    const hTall = tall[0] + (tall[1] - tall[0]) * (0.4 * r() + 0.6 * clump);
    const hCut = cut[0] + (cut[1] - cut[0]) * r();
    const h = hTall + (hCut - hTall) * mw;
    const w = 0.012 + r() * 0.012;
    e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    p.set(x, 0, z);
    s.set(w, h, h * 0.7);
    m.compose(p, q, s);
    mesh.setMatrixAt(k, m);
    // mowed grass is lighter (cut tips) and evener in colour
    vars[k * 3] = mw > 0.5 ? (o.stripe ? (o.stripe(x, z) ? 0.9 : 0.3) + r() * 0.1 : 0.85 + r() * 0.15) : r();
    vars[k * 3 + 1] = mw > 0.5 ? 0 : (r() < 0.12 ? 0.6 + r() * 0.4 : 0);
    vars[k * 3 + 2] = r();
    k++;
  }
  mesh.count = k;
  geo.setAttribute("aVar", new THREE.InstancedBufferAttribute(vars, 3));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
