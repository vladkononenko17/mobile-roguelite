import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Draw-call diet: every static mesh under `root` is baked into one mesh per
 * material (per shadow setting). A wall with an outside, an inside and trim,
 * a box with six face materials — dozens of draws become a handful.
 *
 * The originals stay in place but invisible: the crosshair, the colliders and
 * the cleanable surfaces keep pointing at them, and the dirt shader works in
 * world space, so the merged copy looks identical.
 *
 * Skipped: instanced meshes, anything under a node with `userData.dynamic`,
 * mirrored meshes and geometry without normals or UVs.
 */
export function mergeStatic(root: THREE.Object3D, into: THREE.Object3D = root): number {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; order: number }>();
  const done: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (o.userData.dynamic || !o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && mergeable(m)) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const g = m.geometry;
      const groups = Array.isArray(m.material) && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.getAttribute("position").count, materialIndex: 0 }];
      for (const gr of groups) {
        const mat = mats[gr.materialIndex ?? 0];
        if (!mat || (mat as THREE.Material & { visible: boolean }).visible === false) continue;
        const piece = slice(g, gr.start, gr.count);
        piece.applyMatrix4(m.matrixWorld);
        const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}`;
        let b = buckets.get(key);
        if (!b) { b = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [], order: m.renderOrder }; buckets.set(key, b); }
        b.geos.push(piece);
      }
      done.push(m);
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  const inv = new THREE.Matrix4().copy(into.matrixWorld).invert();
  let made = 0;
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.applyMatrix4(inv);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.renderOrder = b.order;
    mesh.name = "merged";
    mesh.userData.dynamic = true; // never merge twice
    into.add(mesh);
    made++;
  }
  // keep the originals for raycasts and surfaces, but don't draw them
  for (const m of done) m.visible = false;
  return made;
}

function mergeable(m: THREE.Mesh): boolean {
  const g = m.geometry;
  if (!g.getAttribute("position") || !g.getAttribute("normal") || !g.getAttribute("uv")) return false;
  if (g.morphAttributes.position || (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  if (mats.some((x) => (x as THREE.MeshStandardMaterial).vertexColors)) return false;
  if (m.matrixWorld.determinant() < 0) return false;
  return true;
}

/** Triangles [start, start+count) of a geometry as a non-indexed position/normal/uv geometry. */
function slice(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const P = g.getAttribute("position"), N = g.getAttribute("normal"), U = g.getAttribute("uv");
  const idx = g.index;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const v = idx ? idx.getX(start + i) : start + i;
    pos[i * 3] = P.getX(v); pos[i * 3 + 1] = P.getY(v); pos[i * 3 + 2] = P.getZ(v);
    nor[i * 3] = N.getX(v); nor[i * 3 + 1] = N.getY(v); nor[i * 3 + 2] = N.getZ(v);
    uv[i * 2] = U.getX(v); uv[i * 2 + 1] = U.getY(v);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}
