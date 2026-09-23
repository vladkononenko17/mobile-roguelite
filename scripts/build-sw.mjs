import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// The PlayCanvas prototype is a separate page; keep its engine out of the Phaser game's offline cache.
const files = (await readdir('dist/assets')).filter(file => !file.startsWith('playcanvas'));
const html = await readFile('dist/index.html', 'utf8');
const version = createHash('sha256').update(html + files.join(',')).digest('hex').slice(0, 12);
const assets = ['.', 'index.html', 'manifest.webmanifest', 'icon.svg', ...files.map(file => `assets/${file}`)];
const template = await readFile('public/sw.js', 'utf8');
await writeFile('dist/sw.js', template.replace('__BUILD_VERSION__', version).replace('/* PRECACHE */ []', JSON.stringify(assets)));
console.log(`Service worker: ${version}, ${assets.length} cached assets`);
