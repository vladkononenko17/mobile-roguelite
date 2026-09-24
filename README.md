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

## PlayCanvas 3D prototype (Phase 1)

The game is migrating from Phaser 2D to a PlayCanvas 3D presentation. The Phaser game above remains the gameplay reference and is unchanged; the 3D vertical slice lives separately:

- Page: `playcanvas.html` → `src/playcanvas/` (the Phaser game stays at `index.html` → `src/main.ts`)
- Run: `npm run dev:3d` (or `npm run dev` and open `/mobile-roguelite/playcanvas.html`)
- Controls: WASD / arrows to run, hold Shift to walk; on touch, drag anywhere (a light push walks). The **tune** button shows live sliders for camera pitch, distance, height, FOV, screen offset, follow smoothing, look-ahead and character scale; values persist per browser and **copy values** puts them on the clipboard.
- Characters (switch in the **tune** panel or with `?model=vanguard|brawler2k|brawler4k|orc`): Ironclad Vanguard (default; mesh, rig and all 17 animations untouched, textures resized to max 2048 WebP, 22.6 MB -> 5.4 MB; real `Idle_10` idle plus unused weapon clips for later), Wasteland Brawler with textures resized to 2048² (default; mesh, rig, animations and materials untouched), the original 4096² Wasteland Brawler, and the Iron Shoulder Orc. Files live in `public/models/`; the original brawler GLB is also attached to the `model` GitHub release.
- Tuning: `src/playcanvas/config.ts` (camera, movement, animation thresholds, lighting)

Modules: `Game.ts` (bootstrap), `player/PlayerController.ts`, `player/PlayerAnimationController.ts`, `player/CharacterLoader.ts`, `camera/CameraController.ts`, `input/*` (move-input sources; a mobile joystick plugs in as another `MoveInputSource`), `world/Environment.ts` (lights, IBL, fog), `world/Arena.ts` (placeholder props and procedural fallback ground), `world/Ground.ts` ("Damaged Road" PBR ground from `public/textures/road_damaged/`, plus a "Rocky Terrain" overlay from `public/textures/rocky_terrain/` covering the far third of the arena with a soft, irregular border; normal and roughness maps converted from the supplied EXRs), `world/ContactShadow.ts`, `ui/DebugPanel.ts`.

Level 1, "Dustline Outpost" (`world/level/OutpostLevel.ts`): a 48 x 80 m abandoned industrial compound fortified by survivors, built from the Atomic Realm packs. South to north: **entry** (road chicane, spike barricades, a taller fortified wall with a half-open plank gate, floodlit gate towers, an abandoned car), **main yard** (open combat space with a survivor camp, barricade line, stripped car and junk pile), **industrial depot** in the east (concrete yard, two-storey warehouse with a partly collapsed roof, stacked containers, fuel depot, storage corner), **infected ruins** in the west (scorched soil, roofless ruined house, flipped car, stake field, beached boat) and a **boss arena** in the north (open ~20 m ring, cover at the edges, floodlights, a beached ship hull as landmark). A modular road leads from the gate to a T junction; its arms dead-end in the ruins and exit (barricaded) through the east wall. The file holds layout data plus three helpers: `wallRun` (2 m wall modules along a line, with pattern, gaps, stacked rows and posts), `cluster` (composed prop groups rotated as one) and `place`. **DEV MAP VIEW** (tune panel "map view", the M key, or `?map=1`) frames the whole level from above; the gameplay camera is unchanged.

Environment kit (`world/props/ModelKit.ts`, model rules in `world/props/OutpostKit.ts`): `scripts/build-outpost-kit.mjs` merges 72 models into `public/models/outpost/outpost-kit.glb` (~2.8 MB, ~74k triangles): Atomic Realm Post-Apocalyptic Starter Pack, Gas Station, Interiors, Into The Wild, Ocean and Modular Roads (primary look), CitySurvivalLite and 3dassets.dev CC0 props (secondary). Every material except the road tiles is baked into vertex colours on one shared "palette" material (the Atomic Realm atlases are flat colours and linear gradients, which per-vertex sampling reproduces), so the whole kit is 4 materials and batches into a few draw calls per 12 m cell; heavy repeated meshes are simplified. `ModelKit` clones models, puts shadow casters and shadowless clutter in separate batch groups, and declares colliders from each model's footprint (box or circle, scaled with the instance; walk-over clutter has none). The older primitive kit (`world/kit/`) is kept but no longer used by the level. Ground (`world/Ground.ts`): stylized surfaces painted procedurally at load (sand, packed dirt, concrete slabs, scorched ash; no downloads, no normal maps), an opaque base, opaque pads and soft-edged patches placed by the level's ground spec.

Collision (`world/collision/`): kit prefabs declare 2D footprints with `kit.solid(parent, { kind: "box" | "circle", ... }, x, z)`, which tags the entity `solid`; `CollisionWorld.addStaticFrom(root)` registers every tagged entity (oriented boxes and circles on the X/Z plane, uniform-grid broadphase). The player is a circle (`PLAYER.colliderRadius` x character scale) that moves with sub-stepped move-and-slide, so diagonal moves into walls keep the along-wall motion. Pallets and rubble piles are walk-over. `DEBUG.DEBUG_COLLIDERS`, `?colliders=1` or the tune panel's "colliders" button shows the footprints.

Weapons (`player/WeaponHolder.ts`, `WEAPONS` in config): 17 hand-held weapons merged by `scripts/build-weapons.mjs` into `public/models/weapons/weapons.glb` (~2.9 MB): six from "assetpack-free" (assault rifle, shotgun, sniper rifle, pistol, knife, frag grenade; textures 2048 -> 512 WebP), ten "Flat Guns East" guns (flat colours baked into vertex colours on one material, one draw call each) and a low poly axe by Yevhen Ishchenko (FBX converted with `scripts/fbx-to-glb.mjs`, 512 PBR maps). The chosen weapon (tune panel "Weapon", or `?weapon=<id|none>`) is parented to the hero's `mixamorig:RightHand` bone with a per-weapon grip (position, rotation, roll). Guns switch on an upper-body animation layer (masked from `mixamorig:Spine` up) playing the aiming clip `Run_and_Shoot`, so the arms hold the gun forward while the legs keep idling, walking or running. Melee weapons have an attack: Space or the on-screen ATTACK button plays `Axe_Spin_Attack` (axe) or `Attack` (knife) once on a full-body action layer.

Performance notes: the scene is fill-rate bound (full-screen ground shading). Fill/rim lights only affect the hero (light mask), the ground skips image-based lighting, only a thin border strip of the rock layer is transparent, shadows are PCF3 at 1024, and a dynamic-resolution governor (`perf/ResolutionGovernor.ts`, `RENDER` in config) lowers the pixel ratio when fps drops. The stats line shows resolution, draw calls and triangles.

Texture library in `public/textures/` (1K PBR sets from the supplied `.blend.zip` files; colour JPG as supplied, EXR normal/roughness/metalness converted to 8-bit JPG, displacement not used): `road_damaged`, `rocky_terrain`, `rusty_metal_grid` (kit painted panels), plus `rusty_metal_04` (with metalness map), `worn_planks`, `broken_brick_wall` and `cracked_concrete` (not placed yet).

Known gaps: the GLBs have no real idle; `player/BreathingIdle.ts` generates a looping breathing idle from the static `restpose` A-pose (relaxed arms, chest and shoulder lift; tune in `IDLE` in `config.ts`) until a hand-made Idle clip exists, the 20 MB GLB and its 4096² metallic-roughness texture are not optimized yet.

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
