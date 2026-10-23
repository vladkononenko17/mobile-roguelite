import * as THREE from "three";
import { atmos } from "./atmos";
import { rng } from "./geo";

/**
 * Procedural deciduous tree: a recursive branch skeleton built from tapered
 * cylinders (bark texture) and foliage made of instanced leaf cards clustered
 * at branch tips. Poly Haven's scanned trees are millions of triangles; this
 * is ~15–30k and reads as a real tree from the yard.
 */

export interface TreeOptions {
  seed: number;
  height: number;
  /** Leaf colour tint: green summer → autumn. */
  autumn?: number;
  leaves?: number;
  bark: THREE.Material;
  leafMat: THREE.Material;
}

let foliageTex: THREE.DataTexture | null = null;

export function foliageMaterial(autumn = 0): THREE.MeshStandardMaterial {
  if (!foliageTex) {
    // Leaves are painted twice: colour on an opaque green backdrop (so mipmaps
    // don't bleed black into the edges) and coverage as a white-on-black mask.
    const S = 128, N = S * 2;
    const col = document.createElement("canvas"), msk = document.createElement("canvas");
    col.width = col.height = msk.width = msk.height = N;
    const gc = col.getContext("2d")!, gm = msk.getContext("2d")!;
    gc.fillStyle = "hsl(98, 55%, 30%)";
    gc.fillRect(0, 0, N, N);
    gm.fillStyle = "#000";
    gm.fillRect(0, 0, N, N);
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * S + S / 2, oy = Math.floor(i / 2) * S + S / 2;
      // a twig with 5 leaves per tile
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.55 + (Math.random() - 0.5) * 0.3;
        const lx = ox + Math.cos(a) * S * 0.22, ly = oy + Math.sin(a) * S * 0.22 + S * 0.1;
        const l = 0.75 + Math.random() * 0.25;
        const hue = 88 + Math.random() * 28, sat = 55 + Math.random() * 20, lit = 30 + Math.random() * 16;
        for (const [g, fill] of [[gc, `hsl(${hue}, ${sat}%, ${lit}%)`], [gm, "#fff"]] as const) {
          g.save();
          g.translate(lx, ly);
          g.rotate(a + Math.PI / 2);
          g.fillStyle = fill;
          g.beginPath();
          g.ellipse(0, 0, S * 0.11 * l, S * 0.22 * l, 0, 0, Math.PI * 2);
          g.fill();
          if (g === gc) {
            // a lighter side and a vein, so a leaf reads as a leaf up close
            g.fillStyle = `hsla(${hue + 10}, ${sat}%, ${lit + 12}%, 0.55)`;
            g.beginPath();
            g.ellipse(S * 0.03 * l, 0, S * 0.06 * l, S * 0.18 * l, 0, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = "rgba(40,60,15,0.45)";
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(0, -S * 0.2 * l);
            g.lineTo(0, S * 0.2 * l);
            g.stroke();
          }
          g.restore();
        }
      }
    }
    const a = gc.getImageData(0, 0, N, N), b = gm.getImageData(0, 0, N, N);
    for (let i = 0; i < a.data.length; i += 4) a.data[i + 3] = b.data[i];
    // a DataTexture keeps the colour under transparent pixels (a canvas would zero it)
    foliageTex = new THREE.DataTexture(new Uint8Array(a.data.buffer.slice(0)), N, N);
    foliageTex.flipY = false;
    foliageTex.colorSpace = THREE.SRGBColorSpace;
    foliageTex.magFilter = THREE.LinearFilter;
    foliageTex.minFilter = THREE.LinearMipmapLinearFilter;
    foliageTex.generateMipmaps = true;
    foliageTex.needsUpdate = true;
  }
  // alpha-to-coverage: with MSAA the cut-out edges come out smooth instead of stair-stepped
  const m = new THREE.MeshStandardMaterial({ map: foliageTex, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.8 });
  m.color.setRGB(1, 1, 1).lerp(new THREE.Color(1.6, 0.95, 0.35), autumn);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = atmos.time;
    sh.uniforms.uSunDir = atmos.sunDir;
    sh.uniforms.uSunCol = atmos.sunColor;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aTile; uniform float uTime; varying vec3 vFW;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * 0.5 + vec2(mod(aTile, 2.0), floor(aTile / 2.0)) * 0.5;")
      // soften foliage shading: normals point away from the crown centre
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.5));")
      // wind: the crown sways slowly, single leaves flutter
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec3 fw = (modelMatrix * mvPosition).xyz;
        // cards right in front of the eye would cover the whole screen many
        // layers deep (very expensive on a phone): shrink them to nothing
        #ifdef USE_INSTANCING
          vec3 cardC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          fw = cardC + (fw - cardC) * smoothstep(0.7, 2.2, distance(cardC, cameraPosition));
        #endif
        float ph = uTime * 1.1 + fw.x * 0.3 + fw.z * 0.23;
        float lift = max(0.0, fw.y - 1.5);
        fw += vec3(sin(ph), 0.0, cos(ph * 0.83)) * 0.012 * lift
            + vec3(sin(uTime * 4.3 + fw.y * 3.1 + fw.x * 2.0), sin(uTime * 3.7 + fw.z * 2.7) * 0.6, cos(uTime * 3.9 + fw.x * 2.3)) * 0.02;
        vFW = fw;
        mvPosition = viewMatrix * vec4(fw, 1.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFW; uniform vec3 uSunDir, uSunCol;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // sunlight through the leaves when you look toward the sun
        float back = pow(max(dot(normalize(vFW - cameraPosition), uSunDir), 0.0), 4.0);
        totalEmissiveRadiance += uSunCol * diffuseColor.rgb * back * 1.6;`,
      );
  };
  return m;
}

export function buildTree(o: TreeOptions): THREE.Group {
  const r = rng(o.seed);
  const g = new THREE.Group();
  const branchGeos: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number): void => {
    const end = start.clone().addScaledVector(dir, len);
    const geo = new THREE.CylinderGeometry(rad * 0.68, rad, len, Math.max(5, 10 - depth * 2), 3);
    // gentle curvature
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / len + 0.5;
      p.setX(i, p.getX(i) + Math.sin(t * Math.PI) * len * 0.05);
    }
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    geo.applyMatrix4(new THREE.Matrix4().compose(start, q, new THREE.Vector3(1, 1, 1)));
    // bark UVs: around × along, in metres
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rad * 6.3, uv.getY(i) * len);
    branchGeos.push(geo);
    if (depth >= 4 || rad < 0.025) {
      tips.push(end);
      return;
    }
    const kids = depth === 0 ? 4 : 2 + Math.floor(r() * 2);
    for (let k = 0; k < kids; k++) {
      const yaw = (k / kids) * Math.PI * 2 + r() * 1.2;
      const pitch = (depth === 0 ? 0.55 : 0.45) + r() * 0.45;
      const nd = dir.clone().applyAxisAngle(new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), pitch).normalize();
      nd.y = Math.max(nd.y, 0.15);
      nd.normalize();
      const from = depth === 0 ? start.clone().lerp(end, 0.75 + r() * 0.25) : end;
      grow(from, nd, len * (0.62 + r() * 0.2), rad * 0.62, depth + 1);
      if (depth >= 2) tips.push(start.clone().lerp(end, 0.6));
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3((r() - 0.5) * 0.1, 1, (r() - 0.5) * 0.1).normalize(), o.height * 0.38, o.height * 0.035, 0);

  const merged = mergeGeos(branchGeos);
  const wood = new THREE.Mesh(merged, o.bark);
  wood.castShadow = wood.receiveShadow = true;
  g.add(wood);

  // Foliage: leaf cards in clusters around each tip.
  const per = Math.ceil((o.leaves ?? 2600) / tips.length);
  const card = new THREE.PlaneGeometry(1, 1);
  const n = tips.length * per;
  const leaves = new THREE.InstancedMesh(card, o.leafMat, n);
  const tile = new Float32Array(n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  const crownR = o.height * 0.13;
  for (const t of tips) {
    for (let i = 0; i < per; i++) {
      const a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1), d = Math.cbrt(r()) * crownR;
      p.set(t.x + Math.sin(b) * Math.cos(a) * d, t.y + Math.cos(b) * d * 0.7, t.z + Math.sin(b) * Math.sin(a) * d);
      e.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI);
      q.setFromEuler(e);
      const sz = 0.35 + r() * 0.3;
      s.set(sz, sz, sz);
      m.compose(p, q, s);
      leaves.setMatrixAt(k, m);
      tile[k] = Math.floor(r() * 4);
      k++;
    }
  }
  card.setAttribute("aTile", new THREE.InstancedBufferAttribute(tile, 1));
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  g.add(leaves);
  return g;
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.getAttribute("position").count;
    iCount += g.index!.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    const P = g.getAttribute("position"), N = g.getAttribute("normal"), U = g.getAttribute("uv");
    pos.set(P.array as Float32Array, vo * 3);
    nor.set(N.array as Float32Array, vo * 3);
    uv.set(U.array as Float32Array, vo * 2);
    const I = g.index!.array;
    for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    vo += P.count;
    io += I.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
