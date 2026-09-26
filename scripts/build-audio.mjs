// Builds the game's sounds from the CC0 sources in assets-src/audio/ (git-ignored, see
// assets-src/SOURCES.md) into small mono mp3 files in public/audio/, plus public/audio/sounds.json
// ({ id: variant count }) that AudioManager reads.
//
// Each sound id has one or more variants (played at random); each variant is a mix of layers: a
// source file, optionally cut (start / dur), pitched (rate), delayed, and scaled. Every variant is
// trimmed, faded and peak-normalised; music is loudness-normalised instead.
//
// Usage: FFMPEG=/path/to/ffmpeg node scripts/build-audio.mjs   (ffmpeg with libmp3lame; the
// ffmpeg-static npm package works). REPO_ROOT overrides the repository root.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.REPO_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets-src/audio");
const OUT = join(ROOT, "public/audio");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

const K = {
  impact: "kenney-impact-sounds",
  scifi: "kenney-sci-fi-sounds",
  rpg: "kenney-rpg-audio",
  ui: "kenney-interface-sounds",
  digital: "kenney-digital-audio",
};
const kenney = (pack, name, extra = {}) => ({ src: `${K[pack]}/${name}.ogg`, ...extra });
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const pad = (i) => String(i).padStart(3, "0");

/** A single-layer variant per shot onset (seconds, from an onset scan of the recording). */
const cuts = (src, onsets, dur, extra = {}) => onsets.map((t) => [{ src, start: Math.max(0, t - 0.02), dur, ...extra }]);
const one = (layer) => [layer];

/** Enemy voices: groan (idle, throttled), attack (wind-up), hit (hurt), death. */
const zombie = (n) => ({ src: `zombies/zombie-${n}.wav` });
const monster = (n, rate = 1) => ({ src: `monsters/${n < 9 ? "Monster" : "monster"}-${n}.wav`, rate });

const SOUNDS = {
  // Weapons (The Free Firearm Sound Library, CC0; Kenney lasers).
  shot_pistol: { variants: cuts("firearms/X_39P.wav", [1.41, 6.45, 10.66], 0.5), fade: 0.3 },
  shot_rifle: { variants: cuts("firearms/C_28P.wav", [0.61, 3.26, 6.02, 9.16], 0.38), fade: 0.25 },
  shot_shotgun: { variants: [...cuts("firearms/O_21P.wav", [0.43, 3.46], 0.85), ...cuts("firearms/H_21P.wav", [0.47, 3.07], 0.85)], fade: 0.5 },
  shot_plasma: { variants: [0, 2, 4].map((i) => one(kenney("scifi", `laserSmall_${pad(i)}`))), fade: 0.1 },
  shot_hellfire: {
    variants: [0.58, 5.67].map((t, i) => [
      { src: "firearms/W_29P.wav", start: t - 0.02, dur: 0.9, rate: 0.9 },
      kenney("scifi", `laserLarge_${pad(i)}`, { rate: 0.7, volume: 0.6 }),
    ]),
    fade: 0.5,
  },
  reload: { variants: [[kenney("rpg", "metalLatch"), kenney("rpg", "metalClick", { delay: 0.32 })]] },

  // Hero (Kenney impact sounds). Footsteps per ground: sand, concrete / asphalt, station decks, grass, Hell stone.
  step_sand: { variants: range(5, (i) => one(kenney("impact", `footstep_snow_${pad(i)}`))) },
  step_concrete: { variants: range(5, (i) => one(kenney("impact", `footstep_concrete_${pad(i)}`))) },
  step_metal: { variants: range(5, (i) => one(kenney("impact", `impactPlate_light_${pad(i)}`, { dur: 0.25 }))), filter: "lowpass=f=2600", fade: 0.12 },
  step_grass: { variants: range(5, (i) => one(kenney("impact", `footstep_grass_${pad(i)}`, { dur: 0.4 }))), fade: 0.15 },
  step_stone: { variants: range(5, (i) => one(kenney("impact", `footstep_concrete_${pad(i)}`, { rate: 0.8 }))) },
  hurt: { variants: range(3, (i) => one(kenney("impact", `impactPunch_medium_${pad(i)}`))) },
  die: { variants: [[kenney("impact", "impactPunch_heavy_001"), kenney("scifi", "lowFrequency_explosion_001", { volume: 0.5 })]], fade: 0.8 },

  // Pickups and UI (Kenney).
  cash: { variants: [one(kenney("rpg", "handleCoins")), one(kenney("rpg", "handleCoins2"))] },
  heal: { variants: [one(kenney("digital", "powerUp2"))] },
  upgrade: { variants: [one(kenney("ui", "confirmation_002"))] },
  levelup: { variants: [one(kenney("digital", "powerUp11"))] },
  ui: { variants: [one(kenney("ui", "select_002"))] },

  // Zone seals opening: station doors, wasteland barricades, Hell seals.
  gate_space: { variants: [one(kenney("scifi", "doorOpen_000"))] },
  gate_wood: { variants: [[kenney("impact", "impactPlank_medium_000"), kenney("rpg", "creak1", { delay: 0.12 })]] },
  gate_hell: { variants: [one(kenney("scifi", "lowFrequency_explosion_000", { rate: 0.85 }))], fade: 0.8 },

  // World: blasts (mech deaths, splash), boss slams, the bloater's bile burst.
  explosion: { variants: range(3, (i) => one(kenney("scifi", `explosionCrunch_${pad(i)}`))) },
  slam: { variants: [0, 1].map((i) => one(kenney("scifi", `lowFrequency_explosion_${pad(i)}`, { dur: 1.2 }))), fade: 0.6 },
  pop: {
    variants: [3, 4].map((i) => [kenney("scifi", "slime_000", { rate: 0.8 }), kenney("scifi", `explosionCrunch_${pad(i)}`, { rate: 0.75, volume: 0.7 })]),
    fade: 0.3,
  },

  // Enemy voices (Zombies Sound Pack and Monster Sound Pack, CC0; Kenney for machines).
  zombie_groan: { variants: [16, 17, 18, 21, 12, 15].map((n) => one(zombie(n))) },
  zombie_attack: { variants: [4, 10, 7, 6].map((n) => one(zombie(n))) },
  zombie_hit: { variants: [24, 11, 5, 13, 3].map((n) => one(zombie(n))) },
  zombie_death: { variants: [1, 8, 19, 20, 23, 9].map((n) => one(zombie(n))) },
  demon_groan: { variants: [1, 2, 3].map((n) => one(monster(n, 0.85))) },
  demon_attack: { variants: [4, 7, 8, 16].map((n) => one(monster(n, 0.85))) },
  demon_hit: { variants: [9, 10, 18].map((n) => one(monster(n, 0.9))) },
  demon_death: { variants: [11, 14, 15, 12].map((n) => one(monster(n, 0.8))) },
  alien_groan: { variants: [5, 6, 13, 17].map((n) => one(monster(n, 1.4))) },
  alien_attack: { variants: [4, 8].map((n) => one(monster(n, 1.45))) },
  alien_hit: { variants: [9, 10].map((n) => [monster(n, 1.5), kenney("scifi", "slime_000", { dur: 0.25, rate: 1.3, volume: 0.5 })]), fade: 0.1 },
  alien_death: { variants: [11, 14].map((n) => [monster(n, 1.3), kenney("scifi", "slime_000", { rate: 1.1, volume: 0.7 })]) },
  hound_groan: { variants: [5, 6].map((n) => one(monster(n, 1.2))) },
  hound_attack: { variants: [7, 8].map((n) => one(monster(n, 1.25))) },
  hound_hit: { variants: [one(monster(18, 1.3))] },
  hound_death: { variants: [one(monster(12, 1.2))] },
  mech_groan: { variants: [0, 1].map((i) => one(kenney("scifi", `forceField_${pad(i)}`, { rate: 0.7 }))), fade: 0.3 },
  mech_attack: { variants: [0, 1].map((i) => one(kenney("scifi", `laserRetro_${pad(i)}`, { rate: 0.8 }))) },
  mech_hit: { variants: range(3, (i) => one(kenney("scifi", `impactMetal_${pad(i)}`, { dur: 0.3 }))), fade: 0.15 },
  mech_death: { variants: [[kenney("scifi", "explosionCrunch_004"), kenney("scifi", "impactMetal_003", { delay: 0.1, volume: 0.6 })]] },

  // Boss roars (on arrival and phase changes), per voice.
  roar_zombie: { variants: [one({ ...zombie(17), rate: 0.7 }), one({ ...zombie(16), rate: 0.72 })], fade: 0.5 },
  roar_demon: { variants: [one(monster(2, 0.62)), one(monster(1, 0.6))], fade: 0.4 },
  roar_alien: { variants: [one(monster(3, 0.9)), one(monster(13, 0.85))], fade: 0.3 },
  roar_mech: { variants: [[kenney("scifi", "forceField_002", { rate: 0.5 }), kenney("scifi", "lowFrequency_explosion_001", { volume: 0.7, dur: 1.4 })]], fade: 0.6 },
};

/** Background loops per chapter and the boss theme (loudness-normalised, looped by AudioManager). */
const MUSIC = {
  music_wasteland: { src: "music/wasteland.ogg", bitrate: "48k" }, // Juhani Junkala - Post Apocalyptic Wastelands (CC0)
  music_station: { src: "music/station.mp3", bitrate: "48k" }, // Ambience Pack 1 - Infestation in the Control Room (CC0)
  music_hell: { src: "music/hell.mp3", bitrate: "48k" }, // Ambience Pack 1 - The Depths of Hell (CC0)
  music_boss: { src: "music/boss.wav", bitrate: "56k" }, // Juhani Junkala - Epic Boss Battle (CC0)
};

const SR = 44100;

function buildVariant(layers, sound) {
  const args = ["-v", "error", "-y"];
  const chains = [];
  layers.forEach((l, i) => {
    if (l.start) args.push("-ss", String(l.start));
    if (l.dur) args.push("-t", String(l.dur / (l.rate ?? 1)));
    args.push("-i", join(SRC, l.src));
    const f = [`aformat=channel_layouts=mono`, `aresample=${SR}`];
    if (l.rate && l.rate !== 1) f.push(`asetrate=${Math.round(SR * l.rate)}`, `aresample=${SR}`);
    if (l.volume) f.push(`volume=${l.volume}`);
    if (l.delay) f.push(`adelay=${Math.round(l.delay * 1000)}`);
    chains.push(`[${i}:a]${f.join(",")}[l${i}]`);
  });
  const mix = layers.length > 1 ? `${layers.map((_, i) => `[l${i}]`).join("")}amix=inputs=${layers.length}:normalize=0` : "[l0]anull";
  const post = ["silenceremove=start_periods=1:start_threshold=-50dB"];
  if (sound.filter) post.push(sound.filter);
  // Fade the tail (reverb of the recordings) so cut shots end cleanly.
  if (sound.fade) post.push("areverse", `afade=t=in:d=${sound.fade}`, "areverse");
  post.push("silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse");
  chains.push(`${mix},${post.join(",")}[pre]`);
  args.push("-filter_complex", chains.join(";"), "-map", "[pre]", "-f", "wav", "-");
  return execFileSync(FFMPEG, args, { maxBuffer: 64 << 20 });
}

/** Peak level of a wav buffer in dBFS (volumedetect reports on stderr). */
function detectPeak(wav) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", "-", "-af", "volumedetect", "-f", "null", "-"], { input: wav, maxBuffer: 64 << 20 });
  const m = /max_volume: (-?[\d.]+) dB/.exec(String(r.stderr));
  return m ? Number(m[1]) : 0;
}

function encode(wav, file, bitrate, extraFilter) {
  const r = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", "-", ...(extraFilter ? ["-af", extraFilter] : []), "-ac", "1", "-ar", String(SR), "-c:a", "libmp3lame", "-b:a", bitrate, file], {
    input: wav,
    maxBuffer: 64 << 20,
  });
  if (r.status !== 0) throw new Error(`${file}: ${r.stderr}`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const counts = {};
let total = 0;
for (const [id, sound] of Object.entries(SOUNDS)) {
  sound.variants.forEach((layers, i) => {
    const wav = buildVariant(layers, sound);
    const peak = detectPeak(wav);
    const file = join(OUT, `${id}-${i}.mp3`);
    encode(wav, file, "56k", `volume=${(-1 - peak).toFixed(2)}dB`);
    total += statSync(file).size;
  });
  counts[id] = sound.variants.length;
}
for (const [id, m] of Object.entries(MUSIC)) {
  const file = join(OUT, `${id}.mp3`);
  const r = spawnSync(FFMPEG, ["-v", "error", "-y", "-i", join(SRC, m.src), "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-ac", "1", "-ar", String(SR), "-c:a", "libmp3lame", "-b:a", m.bitrate, file]);
  if (r.status !== 0) throw new Error(`${file}: ${r.stderr}`);
  counts[id] = 1;
  total += statSync(file).size;
}
writeFileSync(join(OUT, "sounds.json"), JSON.stringify(counts));
console.log(`${Object.keys(counts).length} sounds, ${Object.values(counts).reduce((a, b) => a + b, 0)} files, ${(total / 1024).toFixed(0)} KB`);
