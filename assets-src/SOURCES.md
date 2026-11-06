# Source assets (not loaded by the game directly)

| Folder | Contents | Licence |
|---|---|---|
| `3dassets/` | CC0 models from 3dassets.dev (see its SOURCES.md) | CC0 1.0 |
| `3dassets/wasteland-props/` | Source GLBs of the 14 "FPS Survival Forest Outpost" props (container, fuel bowser, generator, sandbags, ...) used by the outpost kit | CC0 1.0 |
| `atomic-realm/` (git-ignored, local only) | Atomic Realm packs incl. the Post-Apocalyptic Starter Pack (also attached to the `models3` release). Built into `public/models/outpost/outpost-kit.glb` | Use in projects allowed; no redistribution of the raw files |
| `city-survival-lite/` (git-ignored, local only) | CitySurvivalLite GLBs (bench, tent, lamppost, cart, cardboard, red barrel), from the `models2` release | Use in projects allowed; no redistribution of the raw files |
| `flat-attachments/` | [Pichuliru "Flat Gun Attachments"](https://pichuliru.itch.io/flat-gun-attachments): 18 gun attachments (scopes, red dots, reflex, holographic, magnified, lasers, flashlights, foregrips, suppressors; East and West styles) as GLB/FBX/OBJ + .blend | CC0 1.0 |
| `fbx/MiniGun.fbx`, `fbx/GeneralTexture.png` | Minigun and its 1088x624 colour texture | no licence file supplied |
| `monsters-glb/` | Birb, Cactoro, Wizard, GreenBlob as GLB (converted from the supplied glTF; texture embedded). 9 clips each: Idle, Walk, Bite_Front, HitRecieve, Death, Jump, Dance, Yes, No. Authored large (1.9-3.6 m tall), to be scaled down in game | no licence file supplied |
| `monsters-fbx/` | Same creature family as FBX: Alien, Birb, Cactoro, GreenBlob, GreenSpikyBlob, Ninja, Wizard, plus their shared 32x32 palette `Atlas_Monsters.png` (extracted from the glTF). Alien, GreenSpikyBlob and Ninja exist only here | no licence file supplied |
| `shs-monsters/` (git-ignored, local only) | "SHS Monsters Pack" by Small Hearth Studios: alien grunt/leader/undercover, minotaur, orc, skeleton, skeleton mage/warrior, werewolf (OBJ + gradient palette) | Free use incl. commercial; raw files must not be redistributed, so they stay out of the repo. Attribution appreciated: "Assets created by Small Hearth Studios" |
| `zombies-lowpoly/` (git-ignored, local only; **no longer shipped**) | "Low-Poly Zombie Asset Pack" (`models3` release, `Low-Poly.Zombie.Asset.Pack.rar`): 10 zombie characters (male casual / farmer / policeman / scientist / sport, female casual / office / nurse / sport / ...) on one Unity humanoid rig (T/A-pose, no clips, ~1.5k triangles each) with a shared 1408x768 colour-swatch palette. Male casual, male farmer, female casual, female office, the scientist and the two sport bodies were built into `public/models/zombies/` by a script since removed. Replaced by the Quaternius "Zombie Apocalypse Kit" (CC0) bodies for licensing | no licence file supplied: removed from the game |
| `survivor-v3/` (git-ignored, local only) | "Zombie Apocalypse Survivor Male" by Codersan (Unity package plus the extracted FBX, texture and three Mixamo idles). Built into `public/models/survivor/survivor.glb` by `scripts/build-survivor.mjs` (FBX converted with FBX2glTF first) | Store asset: use in projects; raw files not redistributed |
| `molten-scifi/` (git-ignored, local only) | "Molten Maps SciFi Asset Pack" v1 by Moltenbolt (`space` release, `Molten.Maps.SciFi.Asset.Pack.2.zip`; GLBs from `Assets/gtlf` in `glb/`): 136 modular sci-fi pieces on one gradient atlas (4 m walls, floors, cryo tubes, generator, consoles, monitors, hydroponics, bunks). A few machines, consoles, monitors, bunks and tables are built into `public/models/facility/facility-kit.glb` by `scripts/build-facility-kit.mjs` (vertex-colour bake, darker and cooler grade, self-lit screens, translucent glass) for the Chapter 2 ORION station | CC0 1.0 (credit optional: Moltenbolt, www.moltenbolt.com) |

| `inferno-world/` (git-ignored, local only) | "Inferno World" (free version; `hell` release: `source.3.zip` GLBs, plus `Lava_01` / `lava_07` / `lava_9` 1K PBR lava sets, unused so far): basalt plateaus, crags and rocks, braziers, columns, the round ritual platform, giant bones / gears / axe, a knight statue, a tower, a lava well, gold. 37 models are built into `public/models/hell/hell-kit.glb` by `scripts/build-hell-kit.mjs` (placed at half their authored size); the pack's `Lava.png` becomes `public/textures/lava/lava-sea.webp` | free asset; raw files kept local like the other store packs |
| `shs-dungeon/` (git-ignored, local only) | "SHS Dungeon Pack" (free) by Small Hearth Studios (`hell` release, `SHS_.Dungeon.Pack.zip`): stone walls, pillars, archways, altars, thrones, cages, stocks, spike wheel, racks, chains, bone piles; FBX converted to `glb/` with FBX2glTF, plus the pack's `palette.png` (the FBX files point at a missing texture path, so the build samples the palette directly). 36 models are built into the hell kit | Free use incl. commercial; raw files must not be redistributed. Attribution appreciated: "Assets created by Small Hearth Studios" |
| `hell2/` (git-ignored, local only) | The `hell2` release. **Bestiary - Dungeon Monsters Kit (Standard)** by Quaternius: Imp, Puglin (Unreal-mannequin rigs, three colour variants each; QAL licence: free use, no redistribution of the raw assets). **3D Alien Monster** by Codersan (Mixamo rig, one texture; Unity package + `fbx.2.rar`). **Monster Pack Animated** by Quaternius (Dragon, Bat, Skeleton, Slime with clips; CC0). **Lowpoly alien buildings** (organic growths with textures; used static as flesh growths). Also in the release, unused: the cyber demon pack (20 low-poly demons, CC0), `LowPolyMeshAlien1Rigged.blend`, SHS Monsters Pack 2 (static OBJ). Built by `scripts/build-demons.mjs` (imp, puglin, fiend: Vanguard's Mixamo clips retargeted, demon posture, decimated, infernal skins in `public/models/demons/skins/`), `scripts/build-hell-creatures.mjs` (drake, hellbat, husk: swatch-baked infernal palettes) and `scripts/build-hell-kit.mjs` (flesh growths) | per pack, see left; raw files kept local |

Planned use: weapon attachments, minigun and monsters as later unlocks / modifications based on level success.

## Weapons (CC0 only)

`public/models/weapons/weapons.glb` holds only Pichuliru "Flat Guns East" (pichuliru.itch.io, CC0): the
10 guns merged by `scripts/build-weapons.mjs`, then `scripts/cc0-weapons.mjs` drops everything else and
adds the Plasma (from `Rifle_Battle_East`: gunmetal, cyan glow) and Hellfire (from `Sniper_Rifle_East`:
crimson iron, ember glow) rifles as static recolours. Removed for licensing: the "assetpack-free" guns
(assault rifle, pistol, shotgun, sniper, knife, grenade; licence unknown), the AR_2 / AR_3 rifles supplied
in chat (licence not stated) and the low poly axe. Shop pictures: `scripts/render-weapon-icons.mjs`.

## Meshy AI

The "Ironclad Vanguard", "Wasteland Brawler" and "Iron Shoulder Orc" characters (Meshy AI, meshy.ai) are no
longer in `public/`. The Vanguard's animation clips (Meshy's library) were retargeted onto the hero
(`scripts/build-survivor.mjs`) and the demons (`scripts/build-demons.mjs`) and stay in those GLBs; Meshy
output from the free plan is CC BY 4.0, so the credits name Meshy and disclose the AI generation.

## Hell flesh growths

"Lowpoly alien buildings" (hell2 release; smoke-th.itch.io/lowpoly-alien-buldings): a free download with no
licence text on its page. Credited to smoke_th; ask the author for written permission before a paid release,
or replace the five `flesh*` props of the hell kit.

## Kenney Graveyard Kit 5.0 and Nature Kit (CC0)

By Kenney (www.kenney.nl), Creative Commons Zero. Downloaded from https://kenney.nl/assets/graveyard-kit and https://kenney.nl/assets/nature-kit into `assets-src/kenney/` (git-ignored; re-download to rebuild). `scripts/build-hell-kit.mjs` bakes the used models into `public/models/hell/hell-kit.glb` with their own grades: crypts (with their roofs), gravestones, iron fences, obelisks, coffins, urns, candles, a stone altar and fire baskets (the abyss graveyard, the gate avenue, the ritual stones), charred dead pines, trunks, stumps and logs, and four tall rock spires (the wastes' badlands). The Inferno World gems (already in the `hell` release) are baked self-lit as lava crystals.

## Quaternius Zombie Apocalypse Kit (CC0), Majadroid LowPoly Apocalyptic Buildings (CC0)

Quaternius "Zombie Apocalypse Kit" (quaternius.com/packs/zombieapocalypsekit.html, CC0; `License.txt` kept; the glTF characters can be re-downloaded from the CC0 mirror github.com/series-ai/jam-ready-assets, `quaternius-zombie-apocalypse/`) in `assets-src/zombie-kit/` (git-ignored): the glTF zombies (Zombie_Basic, Zombie_Chubby, Zombie_Ribcage, Zombie_Arm) and the German Shepherd, built by `scripts/build-wasteland-creatures.mjs` into `public/models/infected/` (rotter, bloater, ripper, abomination, hound; used clips only, colour variants in `skins/`), the four survivors (Lis, Matt, Sam, Shaun) turned into infected by `scripts/build-zombified-survivors.mjs` (`public/models/infected/z*.glb`: Zombie_Basic's clips copied onto their shared rig, their weapons dropped; eight `zs_*` colour maps over the kit's shared swatch atlas - four kinds of rot for the horde, two station jumpsuits for the ORION crew, two drowned looks for the Black Tide), and the environment and vehicles (streets, containers, traffic lights, street lights, barriers, water tower, cars and trucks) baked into `public/models/outpost/outpost-kit.glb` by `scripts/build-outpost-kit.mjs` (graded towards the outpost's dusty colours).

Majadroid (Maik Hoffmann) "LowPoly Apocalyptic Buildings" (opengameart.org/content/3d-apocalyptic-building-city-cc0, CC0) in `assets-src/ruined-city/` (git-ignored; FBX converted with FBX2glTF into `glb/`): five of the seven skyscraper ruins (x0.4, simplified, their concrete / facade / rust textures kept at 512 px), the billboards, the rubble mounds and the fire stairs, in the outpost kit as the dead city's skyline. Kenney "Nature Kit" (CC0, `assets-src/kenney/nature`): trees, bushes, grass and a log, tinted olive.

"Raven" (opengameart.org/content/raven-0, CC0): ~590 polygons, rigged, a flight animation; `assets-src/raven/raven.blend` (git-ignored) exported with Blender's Python module by `scripts/export-raven.py`, then `scripts/build-raven.mjs` -> `public/models/raven/raven.glb` (the "fly" clip only, crow black, ~1 m span) for the Wasteland's raven fly-bys.

## Quaternius Ultimate Modular Sci-Fi Pack (CC0) and HallwayPACK (CC0)

Quaternius "Ultimate Modular Sci-Fi Pack" (quaternius.com, CC0; its public Google Drive folder, `License.txt` kept with the files): the FBX walls, columns, doors, floor tiles, props and details the ORION station uses, converted to GLB with FBX2glTF into `assets-src/quaternius-scifi/glb/` (git-ignored). Baked into `public/models/facility/facility-kit.glb` by `scripts/build-facility-kit.mjs`: fixed colours per material (off-white, graphite), the orange "Accent" paint as a runtime-tinted `accent` material (the sector's colour), light strips self-lit, low cutaway variants of the walls (clipped and capped), the busiest props simplified.

"HallwayPACK" spaceship modules (`Spaceship_Modules.zip`, `Spaceship_Exta_Modules.zip`; CC0, confirmed by the supplier) in `assets-src/hallwaypack/` (git-ignored): the `Hall_NoLight` and `Hall_NoLight_Window` halls are baked into the kit as the corridors between sectors, their atlas sampled into vertex colours and their roofs clipped off.

## Kenney Space Station Kit, Space Kit (CC0) and Quaternius Ultimate Space Kit (CC0)

Kenney "Space Station Kit" and "Space Kit" (www.kenney.nl, CC0) from https://kenney.nl/assets/space-station-kit and https://kenney.nl/assets/space-kit into `assets-src/kenney/` (git-ignored): containers, tables and barriers (x2.4) and spacecraft, rockets, hangars, meteors, craters, crystals, rover, dishes (x4), baked into `public/models/facility/facility-kit.glb` by `scripts/build-facility-kit.mjs`. ("Modular Space Kit" was downloaded too but not used: its rooms are too heavy for mobile.)

Quaternius "Ultimate Space Kit" (quaternius.com, CC0; its public Google Drive folder), glTF characters Enemy_ExtraSmall, Enemy_Small, Enemy_Flying, Enemy_Large and Mech_FinnTheFrog in `assets-src/quaternius-space/characters/` (git-ignored), built by `scripts/build-space-creatures.mjs` into `public/models/aliens/` (skitter, spitter, glub, alienBrute, mech) with hue-shifted skins in `public/models/aliens/skins/` (the gate creatures' dark violet `*_void` skins included).

## Audio (all CC0)

Raw packs in `assets-src/audio/` (git-ignored; re-download to rebuild). `scripts/build-audio.mjs` (needs an ffmpeg with libmp3lame, e.g. the `ffmpeg-static` npm package via `FFMPEG=`) cuts, layers, pitches, trims, fades and peak-normalises them into mono mp3 variants in `public/audio/` (plus `sounds.json`), ~4 MB in all, most of it music:

- Kenney "Impact Sounds", "Sci-fi Sounds", "RPG Audio", "Interface Sounds", "Digital Audio" (www.kenney.nl, CC0; `License.txt` kept): footsteps (sand, concrete, grass; plates for station decks, pitched-down concrete for Hell stone), hero hits, lasers (plasma rifle, the Hellfire rifle's layer, mech shots), explosions and slams, slime (alien hits, the bloater's burst), doors / barricades / seals, coins, power-ups, UI clicks, metal latch and click (reload).
- Freesound 819269, "Gunshot with silencer" by hotpin7 (CC0): short game-style suppressed Uzi shot; three pitch variants.
- "The Free Firearm Sound Library" (opengameart.org/content/the-free-firearm-sound-library, CC0): single shots cut from the AK-47 (rifle), Walther PPQ (pistol), Benelli Nova and Charles Daly (shotgun) and Tikka T3 (Hellfire, under a low laser) recordings.
- "Zombies Sound Pack" (opengameart.org, CC0, 24 wav): zombie groans, attacks, hits, deaths and the Abomination's roar (pitched down).
- "80 CC0 creature SFX" (opengameart.org/content/80-cc0-creature-sfx, CC0): runner shrieks, brute growls and roars, the bloater's gurgles, burps and spitting, dog barks and a howl for the hounds, pained grunts, alien and bug calls.
- "Zombie moans" by darsycho (opengameart.org/content/zombie-moans, CC0; seven moans cut from one take) and "Zombie pain" (opengameart.org/content/zombie-pain, offered under CC0): more walker groans, hits and deaths.
- "Monster Sound Pack, Volume 1" (opengameart.org/content/monster-sound-pack-volume-1, CC0): demon voices (pitched down), alien and hound voices (pitched up), boss roars.
- Music: Juhani Junkala "Post Apocalyptic Wastelands" (opengameart.org/content/horror-atmosphere) for the Wasteland, "Infestation in the Control Room" and "The Depths of Hell" from "Ambience Pack 1 - Sci Fi Horror" (opengameart.org/content/ambience-pack-1-sci-fi-horror) for ORION and Hell, Juhani Junkala "Epic Boss Battle" (opengameart.org/content/boss-battle-music) for bosses; loudness-normalised, mono.

## Quaternius Ultimate Monsters (CC0)

Quaternius "Ultimate Monsters" (quaternius.com/packs/ultimatemonsters.html, CC0; `License.txt` kept) in
`assets-src/ultimate-monsters/` (git-ignored; mirrored at github.com/series-ai/jam-ready-assets,
`quaternius-ultimate-monsters/`). `scripts/build-ultimate-monsters.mjs` builds ten of them into
`public/models/monsters/` and paints eight colour maps over the pack's shared 50-colour atlas
(`skins/um_*.webp`, each fits every model). Hell: the horned trident demon (imps, black for berserkers),
the skull brute (hellhounds, the hellbrute), the masked shaman (with the husks), the skull wraith (with the
hellbats) and the wyvern (with the drakes), in fire colours with ember eyes. ORION: a bee (skitters, void
for voidlings), a spiky floater (spitters), a squid (glubs, void for rift glubs), the tentacle-horned alien
(hulks, void for rift brutes) and a blob (test subjects). Mixed in as extra looks of existing enemies
(`ownSkins` keeps their own colour maps where a type has TYPE_SKINS).
