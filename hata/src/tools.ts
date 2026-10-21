import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { instance, pbrMaterial } from "./assets";

/** Tools modelled in Blender (hata/blender/tools.py → public/hata/models/tools.glb). */
let toolsGltf: Promise<THREE.Object3D> | null = null;
export async function blenderTool(name: "washer" | "mower" | "blower" | "glove_grip"): Promise<THREE.Object3D> {
  toolsGltf ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}hata/models/tools.glb`).then((g) => g.scene);
  const root = (await toolsGltf).getObjectByName(name);
  if (!root) throw new Error(`tool ${name} missing in tools.glb`);
  const o = root.clone(true);
  o.position.set(0, 0, 0);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
  });
  return o;
}

/**
 * First-person tools held in front of the camera: the pressure washer lance
 * (with its spray), the push mower and the metal detector. They are children
 * of the camera, so they always draw in the same screen spot; they render
 * after the world with depth cleared so they never clip into walls.
 */

const plasticYellow = (): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({ color: 0xf2b316, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
const plasticBlack = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0x1d2022, roughness: 0.55 });
const steel = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 1, roughness: 0.28 });

function glove(): THREE.Group {
  const g = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.6 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.9 });
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 6, 12), rubber);
  palm.scale.set(1, 1, 0.7);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0145, 0.045, 4, 8), rubber);
    f.position.set(-0.035 + i * 0.023, 0.03 - Math.abs(i - 1.5) * 0.006, 0.04);
    f.rotation.x = Math.PI / 2 - 0.4;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.04, 4, 8), rubber);
  thumb.position.set(0.05, 0.02, 0.0);
  thumb.rotation.z = -0.9;
  g.add(thumb);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 14), cuff);
  sleeve.position.set(0, -0.2, -0.05);
  sleeve.rotation.x = 0.25;
  g.add(sleeve);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  return g;
}

export async function washerLance(): Promise<{ group: THREE.Group; nozzleWorld: () => THREE.Vector3 }> {
  const g = new THREE.Group();
  const yel = plasticYellow(), blk = plasticBlack(), st = steel();
  // grip + trigger housing
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.26), yel);
  body.position.set(0, 0, 0);
  g.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), blk);
  grip.position.set(0, -0.11, 0.07);
  grip.rotation.x = 0.35;
  g.add(grip);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.025), blk);
  trig.position.set(0, -0.07, 0.0);
  g.add(trig);
  // lance
  const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 12), st);
  lance.rotation.x = Math.PI / 2;
  lance.position.set(0, 0.02, -0.55);
  g.add(lance);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.08, 12), blk);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.02, -1.0);
  g.add(nozzle);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.02, -1.05);
  g.add(tip);
  // hose
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.04, 0.13), new THREE.Vector3(0.02, -0.2, 0.3), new THREE.Vector3(0.1, -0.5, 0.35)]), 20, 0.014, 8),
    blk,
  );
  g.add(hose);
  const right = glove();
  right.position.set(0.01, -0.1, 0.08);
  right.rotation.set(0.5, 0, 0.1);
  g.add(right);
  const left = glove();
  left.position.set(0, -0.02, -0.42);
  left.rotation.set(1.3, 0, -0.3);
  left.scale.set(-1, 1, 1);
  g.add(left);
  return { group: g, nozzleWorld: () => tip.getWorldPosition(new THREE.Vector3()) };
}

/** Spray: a cone of stretched droplets from the nozzle to the hit point, plus a splash. */
export function spray(from: THREE.Vector3, to: THREE.Vector3, n = 700): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, depthWrite: false });
  const drop = new THREE.SphereGeometry(1, 6, 4);
  const mesh = new THREE.InstancedMesh(drop, mat, n);
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), 0.8);
    const spreadR = t * len * 0.035;
    const a = Math.random() * Math.PI * 2;
    p.copy(from).addScaledVector(dir, t * len);
    const off = new THREE.Vector3(Math.cos(a) * spreadR, Math.sin(a) * spreadR, 0).applyQuaternion(q);
    p.add(off);
    const r = 0.002 + Math.random() * 0.004;
    s.set(r, r, r * (6 + Math.random() * 10));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  g.add(mesh);
  // splash: droplets bouncing off the surface
  const back = dir.clone().negate();
  const splash = new THREE.InstancedMesh(drop, mat, 260);
  for (let i = 0; i < 260; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().add(back.clone().multiplyScalar(0.9)).normalize();
    const d = Math.random() * 0.35;
    p.copy(to).addScaledVector(v, d);
    const r = 0.003 + Math.random() * 0.006;
    s.set(r, r, r * 3);
    m.compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v), s);
    splash.setMatrixAt(i, m);
  }
  g.add(splash);
  // mist
  const mist = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
  mist.position.copy(to).addScaledVector(back, 0.08);
  mist.scale.set(1.3, 1.3, 0.5);
  g.add(mist);
  return g;
}

export async function pushMower(): Promise<THREE.Group> {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xb8261c, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.35, metalness: 0.2 });
  const blk = plasticBlack();
  const st = steel();
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-0.27, -0.3);
  deckShape.lineTo(0.27, -0.3);
  deckShape.quadraticCurveTo(0.32, 0, 0.27, 0.3);
  deckShape.lineTo(-0.27, 0.3);
  deckShape.quadraticCurveTo(-0.32, 0, -0.27, -0.3);
  const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 4 }), red);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.1, 0);
  g.add(deck);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.2, 24), blk);
  engine.position.set(0, 0.35, 0.02);
  g.add(engine);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), red);
  cap.position.set(0.07, 0.47, -0.05);
  g.add(cap);
  for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.26], [0.3, 0.26]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), blk);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.1, z);
    g.add(w);
  }
  // handle: a loop from the back of the deck up to the player's hands
  const pts = [new THREE.Vector3(-0.24, 0.22, 0.3), new THREE.Vector3(-0.26, 0.7, 0.75), new THREE.Vector3(-0.26, 1.0, 1.05), new THREE.Vector3(0, 1.02, 1.08), new THREE.Vector3(0.26, 1.0, 1.05), new THREE.Vector3(0.26, 0.7, 0.75), new THREE.Vector3(0.24, 0.22, 0.3)];
  const handle = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.014, 10), st);
  g.add(handle);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 14), blk);
  foam.rotation.z = Math.PI / 2;
  foam.position.set(0, 1.02, 1.08);
  g.add(foam);
  // grass bag
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.32), new THREE.MeshStandardMaterial({ color: 0x3e4a3a, roughness: 0.95 }));
  bag.position.set(0, 0.28, 0.52);
  bag.rotation.x = 0.35;
  g.add(bag);
  for (const s of [-1, 1]) {
    const gl = glove();
    gl.position.set(s * 0.13, 1.03, 1.1);
    gl.rotation.set(-1.2, 0, s * 0.2);
    g.add(gl);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}

export async function detector(): Promise<THREE.Object3D> {
  const o = await instance("metal_detector");
  const g = new THREE.Group();
  g.add(o);
  const gl = glove();
  gl.position.set(0.42, 0.12, 0.0);
  gl.rotation.set(0, 0, Math.PI / 2);
  g.add(gl);
  return g;
}

export async function rake(): Promise<THREE.Object3D> {
  return instance("plastic_broom");
}

export { pbrMaterial };
