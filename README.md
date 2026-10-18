# Neon Hollow: Dustline

> This repo also hosts two more games: **«Не клюёт»** (fishing rage-management roguelite) at `/fishing/` — see [its section](#не-клюёт-fishing) — and **«Розшук»** (Ukrainian-language survival stealth roguelite) at `/rozshuk/` — see [its section](#розшук-rozshuk).

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

You fish next to your friend Tolik. He keeps landing fish, you don't, and every one of his catches fills your **rage** bar. At 100 you snap the rod over your knee and jump into the water. Catch the day's quota (in kg) on each of **ten locations** without a meltdown.

- **Locations:** dacha pond, river behind the garages, sand quarry with jet skis, a night on an island (mosquitoes, neighbours with a guitar), the warm power-plant outflow (three-eyed carp), Ashot's paid pond, winter ice fishing, a swamp, a nature reserve with the fishing inspector, and the regional championship final where you also have to out-fish Tolik. Each has its own look, hazards and Tolik's lines.
- **Methods:** *float* — tap when the bobber dips, stop the marker in the green; *feeder* — rod on a pod, keep the feeder topped up by recasting, then a tension fight; *spinning* — hold/release to retrieve the lure in steps, strike, fight; *ice jig* — tap in rhythm to keep the fish interested, strike on the nod. Fights: hold to pull, keep tension in the green, let go before the line snaps.
- **Hazards:** the wife calling, gopniks taking your beer, jet skis and water releases scaring fish, Ashot fining you for your own beer, Tolik buying fish and passing them off, cracking ice (three beers and you go through), leeches, the fishing inspector (no drinking or stealing while he's around), a chanting crowd, a blogger's drone.
- **Progress:** fish sell for money, stars pay a bonus; buy rods (telescopic, feeders, spinning rod, carbon), reels and baits/lures that unlock as you advance. Progress is saved on the device.
- **Coping:** beer (big relief, drunker), cigarettes (slow, also keep mosquitoes away and warm you on the ice), TikTok, and stealing from Tolik's keepnet while he isn't looking.

Rules live in `fishing/src/sim.ts` (pure, no Phaser) and are covered by `tests/fishing.test.mjs`, including a bot balance check. 3D models are original low-poly geometry built in code with flat shading and an ink outline (`fishing/src/three/models.ts`, scene in `fishing/src/Scene3D.ts`); all audio is generated at runtime, so there are no third-party assets to license: sound effects and river/bird/cricket ambience are synthesized with WebAudio (`sfx.ts`), the background music is a generative Karplus–Strong guitar that speeds up and adds a pulse and heartbeat as rage rises (`music.ts`), and voice lines (Tolik, the hero, a CoD-style announcer calling bites and critical rage) use the device's built-in Russian speech synthesis (`voice.ts`; silent on devices without a Russian voice). Sounds, music and voices can each be switched off in the pause menu.

**Better voices (ElevenLabs).** All 133 spoken lines live in `fishing/src/lines.ts`. Record them once (≈3,200 characters) and commit the result:

```bash
ELEVENLABS_API_KEY=sk_... npm run voices        # writes public/fishing/voice/*.mp3 + manifest.json
npm run voices -- --list                          # lines and character count
VOICE_TOLIK=<id> npm run voices -- --force        # re-record with your own voice picks
```

The shipped recordings (`public/fishing/voice/`, 133 lines, ~3.3 MB, trimmed and loudness-normalised) were made with ElevenLabs `eleven_v4` and inline direction tags: Tolik — *Alex, Calm Russian Analyst*; the hero — *Mikhail*; the announcer — *Nester Surovy*. The game plays a recording when one exists and falls back to device speech otherwise. The API key is only used by the script and never ships with the game. For playtesting in the browser console: `__fishing.sim.rage = 95`.

Desktop keys: Space strike/hold to reel · 1 beer · 2 smoke · 3 TikTok/next · X close phone · hold 4 steal · P pause.

## «Розшук» (rozshuk)

A third vertical slice in the same toolchain, in Ukrainian: a roguelite + survival + QTE game rendered in low-poly 3D with Three.js. Served at `/mobile-roguelite/rozshuk/`.

You are wanted by the draft office (ТЦК) and have to last **30 days** in your flat. The month is **15 levels** (two days each): a morning at home, then an outing (вилазка) — take out the trash, buy food, pick up a laptop charger, fetch a power station in a blackout, rescue a friend's cat from a raided market. After day 14 the story **forks**:

- **Кордон (illegal):** cheaper (~70 000 ₴) but harder — a guarded station, a raid on the night train, a village with dogs, a forest watched by a thermal drone, and a freezing river crossing.
- **Офіційно (legal):** a fixer arranges a job at a "critical" company, a deferment and a business trip — ~170 000 ₴ of remote work and visits to the bank, ЦНАП and even the draft office itself; with papers in hand a document check can be passed, and the border booth asks questions only the right papers answer.

- **Home (survival):** money, food stock, satiety, nerves and heat (розшук). Three actions a day: remote work (a ticket-closing timing minigame), eat, sleep, read the «Де бус?» chat to see patrol routes, call mum, push-ups, pet the cat. Random events (blackouts, scam calls, a parcel from mum, rising prices) and, at high heat, a knock on the door — hold your breath.
- **Outing (stealth):** patrols see in cones that turn yellow → red; standing still in a bush or doorway hides you; sprinting is loud; grannies on benches phone it in; vans unload officers; curfew brings police. Get caught and a QTE chain decides: wriggle free (mash), talk your way out (swipe), show your deferment (choice), then jump out of the van (mash). Fail and the run ends — «Бусифікація».
- **Roguelite:** per-run seeds shuffle bushes, objective spots and extra patrols (more with heat); pick one of three perks after every level (sneakers, black hoodie, a dog, parkour, a lawyer on speed dial…); finished runs bank experience that unlocks starting traits (IT guy, athlete, quiet one, mummy's boy, an MP's nephew).

Rules are pure TypeScript with no rendering imports — `rozshuk/src/outing.ts` (stealth simulation on ASCII maps from `maps.ts`), `qte.ts`, `run.ts` (the month, home actions, fork, endings) and `content.ts` (story, levels, perks, events) — covered by `tests/rozshuk.test.mjs`, including checks that every level is reachable and finishable and that a careful player can afford the legal path. All 3D is original low-poly geometry built in code (`rozshuk/src/three/models.ts`) with procedural canvas textures (panel-block facades with lit windows, pixel camo, garages with graffiti, the carpet on the wall), so there are no third-party assets to license; sound effects and the score are synthesized with WebAudio (on iPhones the page declares a media «playback» session so the silent switch does not mute it). Officers, babusias and the hero shout their lines through the device's Ukrainian speech synthesis (iOS «Lesya», Google uk-UA on Android) where one is installed; voices can be switched off in the pause menu. Static props are merged per material at load, so a level renders in roughly 100–300 draw calls. Post-processing (`rozshuk/src/three/post.ts`): ground-contact ambient occlusion (GTAO, half resolution on medium), bloom for things that emit light (lit panel-block windows, street lamps with light pools, door bulbs, shop signs and officers' torches at night, van beacons, the drone LED, the laptop and candle at home) and a per-mood colour grade (day, rain, fog, snow, night, indoors, home, blackout) with a red, slightly split edge during a chase. Graphics quality (low / medium / high) is switchable in the pause menu; phones default to medium.

Controls: drag anywhere in the lower part of the screen to walk, hold **БІГ** to sprint, **ПЕРЕЛІЗТИ** appears next to climbable fences. Desktop: WASD/arrows, Shift sprint, E vault, Space/arrows/1–4 in QTEs, P pause. Progress (the run in progress and meta experience) is saved on the device. For playtesting from the console: `__rozshuk.run`, `__rozshuk.sim`.
