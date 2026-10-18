#!/usr/bin/env node
// Pre-record every voice line of «Не клюёт» with ElevenLabs, once.
//
//   ELEVENLABS_API_KEY=sk_... npm run voices          # record missing lines
//   npm run voices -- --list                           # show lines + character count
//   npm run voices -- --force                          # re-record everything
//
// Optional: VOICE_HERO, VOICE_TOLIK, VOICE_ANNOUNCER (voice IDs from your
// ElevenLabs library) and ELEVEN_MODEL (default eleven_multilingual_v2).
// Files land in public/fishing/voice/ with a manifest the game reads; the key
// never ships with the game. Lines without a file fall back to device speech.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { allLines, spokenText } from '../fishing/src/lines.ts';

const OUT = new URL('../public/fishing/voice/', import.meta.url);
const args = new Set(process.argv.slice(2));
const lines = allLines();
const chars = lines.reduce((n, l) => n + spokenText(l.text).length, 0);

if (args.has('--list')) {
  for (const l of lines) console.log(`${l.key}  [${l.speaker}]  ${spokenText(l.text)}`);
  console.log(`\n${lines.length} lines, ${chars} characters`);
  process.exit(0);
}

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('Set ELEVENLABS_API_KEY first (ElevenLabs → Profile → API keys).');
  process.exit(1);
}

// Defaults are ElevenLabs premade voices; override with your own picks.
const VOICES = {
  hero: process.env.VOICE_HERO ?? 'TxGEqnHWrfWFTfGW9XjX', // Josh: young, expressive
  tolik: process.env.VOICE_TOLIK ?? 'VR6AewLTigWG4xSOukaG', // Arnold: gruff, smug
  announcer: process.env.VOICE_ANNOUNCER ?? 'pNInz6obpgDQGcFmaJgB', // Adam: deep, announcer
};
const SETTINGS = {
  hero: { stability: 0.3, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
  tolik: { stability: 0.4, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
  announcer: { stability: 0.35, similarity_boost: 0.85, style: 0.7, use_speaker_boost: true },
};
const MODEL = process.env.ELEVEN_MODEL ?? 'eleven_multilingual_v2';

await mkdir(OUT, { recursive: true });
let manifest = { files: {} };
try { manifest = JSON.parse(await readFile(new URL('manifest.json', OUT), 'utf8')); } catch { /* first run */ }

const exists = (f) => access(new URL(f, OUT)).then(() => true, () => false);
let made = 0;
for (const line of lines) {
  const file = `${line.key}.mp3`;
  if (!args.has('--force') && (await exists(file))) { manifest.files[line.key] = file; continue; }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[line.speaker]}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: spokenText(line.text), model_id: MODEL, voice_settings: SETTINGS[line.speaker] }),
  });
  if (!res.ok) {
    console.error(`✗ ${line.key} (${res.status}): ${(await res.text()).slice(0, 200)}`);
    if (res.status === 401 || res.status === 402) break;
    continue;
  }
  await writeFile(new URL(file, OUT), Buffer.from(await res.arrayBuffer()));
  manifest.files[line.key] = file;
  made += 1;
  console.log(`✓ [${line.speaker}] ${spokenText(line.text)}`);
}
manifest.generated = new Date().toISOString();
manifest.model = MODEL;
manifest.voices = VOICES;
await writeFile(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2));
console.log(`\nRecorded ${made} new line(s); ${Object.keys(manifest.files).length}/${lines.length} available.`);
