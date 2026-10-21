import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/**
 * Asset loading for «Хата з краю». Everything comes from Poly Haven (CC0):
 * PBR texture sets in public/hata/ph/textures/<id>/{diff,nor,rough,arm}.jpg,
 * glTF models in public/hata/ph/models/<id>/ and HDRIs in public/hata/ph/hdris/.
 */

const BASE = `${import.meta.env.BASE_URL}hata/ph/`;

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const texCache = new Map<string, Promise<THREE.Texture>>();
const modelCache = new Map<string, Promise<GLTF>>();

let maxAniso = 4;
export function setAnisotropy(n: number): void {
  maxAniso = n;
}

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${srgb}`;
  let p = texCache.get(key);
  if (!p) {
    p = texLoader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = maxAniso;
      return t;
    });
    texCache.set(key, p);
  }
  return p;
}

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** Packed AO (r), roughness (g), metalness (b). */
  arm: THREE.Texture;
}

const pbrCache = new Map<string, Promise<PbrSet>>();

/** Loads a Poly Haven texture set once; callers clone() to change repeat. */
export function pbr(id: string): Promise<PbrSet> {
  let p = pbrCache.get(id);
  if (!p) {
    const dir = `${BASE}textures/${id}/`;
    p = Promise.all([
      loadTex(`${dir}diff.jpg`, true),
      loadTex(`${dir}nor.jpg`, false),
      loadTex(`${dir}arm.jpg`, false),
    ]).then(([map, normalMap, arm]) => ({ map, normalMap, arm }));
    pbrCache.set(id, p);
  }
  return p;
}

export interface MatOptions {
  /** Texture repeats per metre (world-space UVs are in metres). */
  scale?: number;
  color?: THREE.ColorRepresentation;
  roughness?: number;
  normalScale?: number;
  metalness?: number;
  side?: THREE.Side;
}

/** A MeshStandardMaterial built from a texture set. UVs are expected in metres. */
export async function pbrMaterial(id: string, opt: MatOptions = {}): Promise<THREE.MeshStandardMaterial> {
  const set = await pbr(id);
  const s = opt.scale ?? 0.5;
  const tex = (t: THREE.Texture): THREE.Texture => {
    const c = t.clone();
    c.repeat.set(s, s);
    c.needsUpdate = true;
    return c;
  };
  const arm = tex(set.arm);
  const m = new THREE.MeshStandardMaterial({
    map: tex(set.map),
    normalMap: tex(set.normalMap),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    roughness: opt.roughness ?? 1,
    metalness: opt.metalness ?? 1,
    side: opt.side ?? THREE.FrontSide,
  });
  m.aoMapIntensity = 0.8;
  if (opt.color) m.color.set(opt.color);
  const ns = opt.normalScale ?? 1;
  m.normalScale.set(ns, ns);
  return m;
}

export function model(id: string): Promise<GLTF> {
  let p = modelCache.get(id);
  if (!p) {
    p = gltfLoader.loadAsync(`${BASE}models/${id}/${id}_1k.gltf`);
    modelCache.set(id, p);
  }
  return p;
}

/** A fresh copy of a model's scene, casting and receiving shadows. */
export async function instance(id: string): Promise<THREE.Object3D> {
  const g = await model(id);
  const o = g.scene.clone(true);
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return o;
}

export async function hdri(renderer: THREE.WebGLRenderer, id: string): Promise<{ env: THREE.Texture; background: THREE.Texture }> {
  const loader = new RGBELoader();
  const ext = id.includes("puresky") ? "hdr" : "hdr";
  const tex = await loader.loadAsync(`${BASE}hdris/${id}.${ext}`);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  return { env, background: tex };
}
