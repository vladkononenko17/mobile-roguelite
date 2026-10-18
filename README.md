# Neon Hollow: Dustline

> This repo also hosts a second game, **«Не клюёт»** (Russian-language fishing rage-management roguelite) at `/fishing/` — see [its section below](#не-клюёт-fishing).

A mobile-first comic-wasteland action roguelite inspired by the tactile weapon loop of arcade survival shooters. The game runs directly in the browser and is designed for portrait play on iPhone.

## Vertical slice

- Phaser 3 + TypeScript + Vite architecture
- Touch joystick, keyboard movement, hold-to-fire and optional one-thumb AUTO mode
- R-12 rifle with magazine, reload, recoil, spread, and critical hits
- Raider, ranged spitter, brute elite, and a boss encounter
- Ninety-second enemy rush; defeat the Foreman to complete the contract
- Three starting rifle modules (damage, extended magazine, critical chance)
- Scrap XP and three-choice field modifications
- Original procedural inked sprites, four-frame hero walk, muzzle flash, halftone UI, damage numbers, and camera shake
- Physics and weapon timers freeze during pause, upgrade selection, and results
- Installable PWA and automatic GitHub Pages deployment

## Controls

- **Mobile:** left joystick to move; hold **FIRE** for assisted aiming, drag it to aim manually, tap **RELOAD**
- **One-thumb:** toggle **AUTO** to shoot automatically while moving
- **Desktop:** WASD or arrow keys, Space to fire, R to reload
- **Pause:** top-right button, P, or Escape

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Node 22.18+ is required. `npm test` runs 17 simulation and scene-lifecycle regression tests. The scene tests use physics/UI doubles; they do not replace real-browser checks or device performance testing.

GitHub Actions runs the tests, checks TypeScript, builds Vite, and publishes only `dist/`. Fonts are self-hosted. The service worker precaches versioned build assets and limits cache cleanup to Neon Hollow caches. Offline play requires one complete online load.

## Modules

- `src/game/GameScene.ts`: combat, enemy behavior and scene lifecycle
- `src/game/Weapon.ts`: independently tested weapon simulation
- `src/game/TextureFactory.ts`, `World.ts`: original procedural art
- `src/game/config.ts`, `types.ts`, `math.ts`: tuning and shared rules
- `src/main.ts`, `styles.css`: DOM HUD, touch controls and menus
- `scripts/build-sw.mjs`: cache manifest generated from the production build

Version 0.1's Canvas implementation remains recoverable in Git history. Full rooms, multiple weapons, loot inventories, persistent progression, sound, and a production sprite atlas are not included in this vertical slice.

The current art is an original code-drawn comic wasteland treatment used to validate feel and performance. The next production pass will replace it with a cohesive animated sprite atlas while keeping the same gameplay systems.

## «Не клюёт» (fishing)

A second vertical slice in the same repo and toolchain (TypeScript + Vite, DOM HUD in the same comic-ink style). The world is real-time 3D rendered with Three.js, since Phaser is 2D-only. Served at `/mobile-roguelite/fishing/`.

You fish next to your friend Tolik. He keeps landing fish, you don't, and every one of his catches fills your **rage** bar. At 100 you snap the rod over your knee and jump into the river. Survive three days (Sat → Mon) without a meltdown.

- **Own rod:** the bobber dips — tap **ПОДСЕЧЬ** inside the bite window, then stop the marker in the green zone. Early strikes and missed bites cost rage; your own fish calms you down.
- **Beer:** big relief, but each can makes you drunker (screen sway, smaller bite window); the fifth can puts you to sleep while Tolik keeps fishing.
- **Cigarette:** slow relief over six seconds, limited pack.
- **TikTok:** swipe videos (most calm you, fishing bloggers make it worse) — the scene is hidden, so listen for the bell.
- **Steal:** hold **СТЫРИТЬ** while Tolik is distracted (phone, stretching, in the bushes). If he turns round mid-steal you get caught.
- Between days pick one of three shop perks; rage halves overnight; Tolik gets luckier each day.

Rules live in `fishing/src/sim.ts` (pure, no Phaser) and are covered by `tests/fishing.test.mjs`, including a bot balance check. 3D models are original low-poly geometry built in code with flat shading and an ink outline (`fishing/src/three/models.ts`, scene in `fishing/src/Scene3D.ts`); all audio is generated at runtime, so there are no third-party assets to license: sound effects and river/bird/cricket ambience are synthesized with WebAudio (`sfx.ts`), the background music is a generative Karplus–Strong guitar that speeds up and adds a pulse and heartbeat as rage rises (`music.ts`), and voice lines (Tolik, the hero, a CoD-style announcer calling bites and critical rage) use the device's built-in Russian speech synthesis (`voice.ts`; silent on devices without a Russian voice). Sounds, music and voices can each be switched off in the pause menu.

**Better voices (ElevenLabs).** All 60 spoken lines live in `fishing/src/lines.ts`. Record them once (≈1,100 characters, fits the free tier) and commit the result:

```bash
ELEVENLABS_API_KEY=sk_... npm run voices        # writes public/fishing/voice/*.mp3 + manifest.json
npm run voices -- --list                          # lines and character count
VOICE_TOLIK=<id> npm run voices -- --force        # re-record with your own voice picks
```

The game plays a recording when one exists and falls back to device speech otherwise. The API key is only used by the script and never ships with the game. For playtesting in the browser console: `__fishing.sim.rage = 95`.

Desktop keys: Space strike · 1 beer · 2 smoke · 3 TikTok/next · X close phone · hold 4 steal · P pause.
