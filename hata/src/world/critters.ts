import * as THREE from "three";
import { BEDS } from "./scenery";

/**
 * A little life in the picture: butterflies over the flower beds and a few
 * birds circling high up. Each kind is one instanced draw; the wings flap in
 * the vertex shader, the paths are a handful of sines on the CPU.
 */

/** Two wings hinged along the body (z axis), flat in xz; u runs across both wings. */
function wingGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [-1, 0, -0.5, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.5, 0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5];
  const uv = [0, 1, 0.5, 1, 0.5, 0, 0, 0, 0.5, 1, 1, 1, 1, 0, 0.5, 0];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(Array.from({ length: 8 }, () => [0, 1, 0]).flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

function flap(mat: THREE.Material, time: { value: number }, speed: number, amp: number): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPhase; uniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `float fa = (sin(uTime * ${speed.toFixed(2)} + aPhase * 6.283) * 0.5 + 0.5) * ${amp.toFixed(2)};
        float ax = abs(position.x);
        vec3 transformed = vec3(sign(position.x) * ax * cos(fa), ax * sin(fa), position.z);`,
      );
  };
}

function butterflyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const x = c.getContext("2d")!;
  const looks = [["#ff8a1e", "#3a1a08"], ["#f6f2e8", "#5a5a5a"], ["#4aa0ff", "#10203a"], ["#ffd23a", "#3a2a08"]];
  // four wing styles in four horizontal bands, each a pair mirrored around the middle
  for (let k = 0; k < 4; k++) {
    const y0 = k * 16;
    for (const side of [-1, 1]) {
      x.save();
      x.translate(64, y0 + 8);
      x.scale(side, 1);
      x.fillStyle = looks[k][1];
      x.beginPath();
      x.ellipse(-26, -2, 30, 7, -0.25, 0, Math.PI * 2);
      x.ellipse(-20, 4, 18, 5, 0.3, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = looks[k][0];
      x.beginPath();
      x.ellipse(-26, -2, 26, 5, -0.25, 0, Math.PI * 2);
      x.ellipse(-20, 4, 15, 3.5, 0.3, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.8)";
      x.beginPath();
      x.arc(-44, -4, 2, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A swallow-like silhouette: swept wings, body, head and a forked tail (head toward v = 0). */
function birdTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const x = c.getContext("2d")!;
  const grad = x.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "#3a3036");
  grad.addColorStop(1, "#1c171b");
  x.fillStyle = grad;
  for (const side of [-1, 1]) {
    x.save();
    x.translate(128, 0);
    x.scale(side, 1);
    // wing: leading edge curves forward, tip swept back, trailing edge with feathers
    x.beginPath();
    x.moveTo(6, 78);
    x.bezierCurveTo(40, 92, 90, 84, 124, 50);
    x.lineTo(118, 40);
    for (let k = 0; k < 6; k++) x.lineTo(104 - k * 17, 46 - k * 1.5 + (k % 2) * 6);
    x.lineTo(6, 60);
    x.closePath();
    x.fill();
    x.restore();
  }
  // body and head
  x.beginPath();
  x.ellipse(128, 70, 9, 34, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.arc(128, 108, 9, 0, Math.PI * 2);
  x.fill();
  // forked tail
  x.beginPath();
  x.moveTo(121, 42); x.lineTo(112, 4); x.lineTo(128, 30); x.lineTo(144, 4); x.lineTo(135, 42);
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Flyer { home: THREE.Vector3; r: number; speed: number; phase: number; y: number }

export class Critters {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private butterflies: THREE.InstancedMesh;
  private birds: THREE.InstancedMesh;
  private bf: Flyer[] = [];
  private bd: Flyer[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  constructor() {
    const wing = wingGeometry();
    // butterflies: one band of the texture each (v offset per instance via a uv trick: 4 meshes would be 4 draws)
    const bfTex = butterflyTexture();
    // a little self-light so the colours read against the low sun
    const bfMat = new THREE.MeshLambertMaterial({ map: bfTex, emissiveMap: bfTex, emissive: 0x8a8a8a, alphaTest: 0.5, side: THREE.DoubleSide });
    flap(bfMat, this.time, 22, 1.25);
    const bfGeo = wing.clone();
    const n = 9;
    const phase = new Float32Array(n), band = new Float32Array(n);
    for (let i = 0; i < n; i++) { phase[i] = Math.random(); band[i] = i % 4; }
    bfGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    bfGeo.setAttribute("aBand", new THREE.InstancedBufferAttribute(band, 1));
    const prev = bfMat.onBeforeCompile;
    bfMat.onBeforeCompile = (sh, r) => {
      prev.call(bfMat, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aBand;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vec2(vMapUv.x, (vMapUv.y + 3.0 - aBand) * 0.25);\nvEmissiveMapUv = vMapUv;");
    };
    this.butterflies = new THREE.InstancedMesh(bfGeo, bfMat, n);
    this.butterflies.frustumCulled = false;
    for (let i = 0; i < n; i++) {
      const [x0, x1, z0, z1] = BEDS[i % BEDS.length];
      this.bf.push({
        home: new THREE.Vector3(x0 + Math.random() * (x1 - x0), 0, z0 + Math.random() * (z1 - z0)),
        r: 0.6 + Math.random() * 1.2, speed: 0.35 + Math.random() * 0.3, phase: Math.random() * 10, y: 0.5 + Math.random() * 0.6,
      });
    }
    // birds: dark silhouettes gliding in wide circles, slow wing beats
    const birdMat = new THREE.MeshBasicMaterial({ map: birdTexture(), alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
    flap(birdMat, this.time, 5, 0.7);
    const birdGeo = wing.clone();
    const nb = 6;
    const bp = new Float32Array(nb);
    for (let i = 0; i < nb; i++) bp[i] = Math.random();
    birdGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(bp, 1));
    this.birds = new THREE.InstancedMesh(birdGeo, birdMat, nb);
    this.birds.frustumCulled = false;
    for (let i = 0; i < nb; i++) {
      this.bd.push({ home: new THREE.Vector3((i % 3) * 3 - 3, 0, Math.floor(i / 3) * 4 - 2), r: 30 + i * 3, speed: 0.06 + Math.random() * 0.02, phase: i * 0.4, y: 32 + Math.random() * 10 });
    }
    this.group.add(this.butterflies, this.birds);
  }

  update(t: number): void {
    this.time.value = t;
    this.bf.forEach((f, i) => {
      const a = t * f.speed + f.phase;
      // a wandering loop over the bed, dipping toward the flowers
      this.p.set(f.home.x + Math.sin(a) * f.r, f.y + Math.sin(a * 3.1) * 0.2 + Math.max(0, Math.sin(a * 0.7)) * 0.5, f.home.z + Math.sin(a * 1.7) * f.r * 0.5);
      // keep out of the house: the front beds are right under its wall
      if (Math.abs(this.p.x) < 7.6 && this.p.z < 5.7 && this.p.z > -5.7) this.p.z = 5.7 + (5.7 - this.p.z) * 0.4;
      const vx = Math.cos(a) * f.r, vz = Math.cos(a * 1.7) * f.r * 0.85;
      this.e.set(Math.sin(a * 5) * 0.2, Math.atan2(vx, vz), 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(0.11);
      this.m.compose(this.p, this.q, this.s);
      this.butterflies.setMatrixAt(i, this.m);
    });
    this.butterflies.instanceMatrix.needsUpdate = true;
    this.bd.forEach((b, i) => {
      const a = t * b.speed + b.phase;
      this.p.set(b.home.x + Math.cos(a) * b.r, b.y + Math.sin(a * 2) * 2, b.home.z + Math.sin(a) * b.r);
      this.e.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0.25);
      this.q.setFromEuler(this.e);
      this.s.set(0.55, 0.55, 0.55);
      this.m.compose(this.p, this.q, this.s);
      this.birds.setMatrixAt(i, this.m);
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
