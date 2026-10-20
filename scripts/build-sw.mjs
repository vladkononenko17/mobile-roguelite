import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = await readdir('dist/assets');
const voices = [
  ...(await readdir('dist/fishing/voice').catch(() => [])).map(f => `fishing/voice/${f}`),
  ...(await readdir('dist/rozshuk/voice').catch(() => [])).map(f => `rozshuk/voice/${f}`),
  ...(await readdir('dist/tikai/sfx').catch(() => [])).map(f => `tikai/sfx/${f}`),
  ...(await readdir('dist/tikai/models/racing').catch(() => [])).filter(f => f.endsWith('.glb')).map(f => `tikai/models/racing/${f}`),
  ...(await readdir('dist/tikai/models/plat').catch(() => [])).filter(f => f.endsWith('.glb')).map(f => `tikai/models/plat/${f}`),
  'tikai/models/racing/Textures/colormap.png', 'tikai/models/plat/Textures/colormap.png',
];
const html = await readFile('dist/index.html', 'utf8') + await readFile('dist/fishing/index.html', 'utf8') + await readFile('dist/rozshuk/index.html', 'utf8') + await readFile('dist/stiny/index.html', 'utf8') + await readFile('dist/tikai/index.html', 'utf8') + await readFile('dist/stavka/index.html', 'utf8') + await readFile('dist/zhirky/index.html', 'utf8');
const version = createHash('sha256').update(html + files.join(',')).digest('hex').slice(0, 12);
const assets = ['.', 'index.html', 'manifest.webmanifest', 'icon.svg', 'fishing/', 'fishing/index.html', 'fishing/manifest.webmanifest', 'fishing/icon.svg', 'rozshuk/', 'rozshuk/index.html', 'rozshuk/manifest.webmanifest', 'rozshuk/icon.svg', 'stiny/', 'stiny/index.html', 'stiny/manifest.webmanifest', 'stiny/icon.svg', 'tikai/', 'tikai/index.html', 'tikai/manifest.webmanifest', 'tikai/icon.svg', 'stavka/', 'stavka/index.html', 'stavka/manifest.webmanifest', 'stavka/icon.svg', 'zhirky/', 'zhirky/index.html', 'zhirky/manifest.webmanifest', 'zhirky/icon.svg', ...files.map(file => `assets/${file}`), ...voices];
const template = await readFile('public/sw.js', 'utf8');
await writeFile('dist/sw.js', template.replace('__BUILD_VERSION__', version).replace('/* PRECACHE */ []', JSON.stringify(assets)));
console.log(`Service worker: ${version}, ${assets.length} cached assets`);
