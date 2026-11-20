import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, resample, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
let total = 0;
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  await doc.transform(resample(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(f, doc);
  total += fs.statSync(f).size;
  console.log(f.split('/').pop(), (fs.statSync(f).size / 1e6).toFixed(2), 'MB');
}
console.log('total', (total / 1e6).toFixed(1), 'MB');
