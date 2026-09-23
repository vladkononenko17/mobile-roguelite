// Converts a single static FBX mesh plus a PBR texture set into a GLB (used for the low poly axe).
//
//   node scripts/fbx-to-glb.mjs <model.fbx> <texture folder> <out.glb> [unit scale, default 0.01]
//
// The texture folder holds Substance-style maps: *_Base_Color.png, *_Normal_OpenGL.png,
// *_Roughness.png, *_Metallic.png and optionally *_Mixed_AO.png. Roughness and metallic are packed
// into one glTF metal-rough map (G = roughness, B = metallic). The FBX is expected in centimetres
// (scale 0.01 -> metres); the model keeps its own origin and axes.
//
// Not part of the normal build. Needs (npm i --no-save): three, @gltf-transform/core@4, sharp.
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

const [fbxPath, textureDir, outFile, scaleArg] = process.argv.slice(2);
if (!fbxPath || !textureDir || !outFile) throw new Error("usage: node scripts/fbx-to-glb.mjs <model.fbx> <texture folder> <out.glb> [scale]");
const scale = Number(scaleArg ?? 0.01);

const bytes = fs.readFileSync(fbxPath);
const group = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
group.updateMatrixWorld(true);

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene(path.basename(fbxPath, ".fbx"));
const root = doc.createNode(path.basename(fbxPath, ".fbx"));
scene.addChild(root);

const file = (suffix) => fs.readdirSync(textureDir).find((f) => f.endsWith(suffix));
const texture = (name, image, mime = "image/png") => doc.createTexture(name).setImage(image).setMimeType(mime);
const material = doc.createMaterial(path.basename(fbxPath, ".fbx"));
const baseColor = file("_Base_Color.png");
if (baseColor) material.setBaseColorTexture(texture("baseColor", fs.readFileSync(path.join(textureDir, baseColor))));
const normal = file("_Normal_OpenGL.png");
if (normal) material.setNormalTexture(texture("normal", fs.readFileSync(path.join(textureDir, normal))));
const rough = file("_Roughness.png");
const metal = file("_Metallic.png");
if (rough || metal) {
  const read = async (f) => (f ? sharp(path.join(textureDir, f)).greyscale().raw().toBuffer({ resolveWithObject: true }) : null);
  const [r, m] = await Promise.all([read(rough), read(metal)]);
  const { width, height } = (r ?? m).info;
  const packed = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    packed[i * 3] = 255;
    packed[i * 3 + 1] = r ? r.data[i] : 255;
    packed[i * 3 + 2] = m ? m.data[i] : 0;
  }
  const png = await sharp(packed, { raw: { width, height, channels: 3 } }).png().toBuffer();
  material.setMetallicRoughnessTexture(texture("metalRough", png)).setMetallicFactor(1).setRoughnessFactor(1);
}
const ao = file("_Mixed_AO.png");
if (ao) material.setOcclusionTexture(texture("occlusion", fs.readFileSync(path.join(textureDir, ao))));

group.traverse((object) => {
  if (!object.isMesh) return;
  const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
  geometry.scale(scale, scale, scale);
  const accessor = (name, type) => {
    const attribute = geometry.getAttribute(name);
    return attribute ? doc.createAccessor().setType(type).setArray(new Float32Array(attribute.array)).setBuffer(buffer) : null;
  };
  const prim = doc.createPrimitive().setMaterial(material);
  prim.setAttribute("POSITION", accessor("position", "VEC3"));
  const normals = accessor("normal", "VEC3");
  if (normals) prim.setAttribute("NORMAL", normals);
  const uvs = accessor("uv", "VEC2");
  if (uvs) prim.setAttribute("TEXCOORD_0", uvs);
  if (geometry.index) prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
  root.addChild(doc.createNode(object.name).setMesh(doc.createMesh(object.name).addPrimitive(prim)));
});

await new NodeIO().write(outFile, doc);
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
