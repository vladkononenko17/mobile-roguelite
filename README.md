# Neon Hollow: Dustline

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
