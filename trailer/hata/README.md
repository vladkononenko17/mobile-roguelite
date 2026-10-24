# «Клін Клінич» — 18-second trailer

Everything here lives on the `trailer-hata` branch and is not part of the game
build or the Pages deploy. The only change to the game is a few extra test
hooks in `hata/src/game.ts` (free camera `cine`, `hands`, `finishAll`), next
to the existing offline test hooks; `main` is untouched.

## Pipeline

| Step | Script | What it does |
|---|---|---|
| 1 | `npx vite --port 5173` (repo root) | serves this branch of the game |
| 2 | `node capture.mjs [shot…]` | headless Chromium, upright 720×1280, renders the real game frame by frame in its offline "still" mode: each frame advances the game's own `update()` by a fixed step, then the WebGL canvas (or the whole screen with the HUD) is saved to `clips/<shot>/0001.jpg…` |
| 3 | `python3 audio.py` | original 140 BPM soundtrack and SFX synthesized from scratch (no samples) → `out/trailer.wav` |
| 4 | `node compose.mjs` | `compose.html` draws the 540 output frames at 1080×1920 (grade, push-ins, shake on hits, whip blurs, dirty→clean wipe, Rubik typography) and ffmpeg encodes both videos |

`shots.mjs` holds the shots, `edit.json` the cut list on the 140 BPM grid,
`calib.mjs` the helper used to time the "Фасад — чисто!" moment.
`STRIDE=8 node capture.mjs` makes a quick framing preview.

Capture is deterministic (fixed time step) but slow: the sandbox has no GPU,
so SwiftShader renders ~5–11 s per frame (552 frames ≈ 60 min).

## Output

* `out/klin-klinych-trailer-vertical.mp4` — 1080×1920, 30 fps, 540 frames, 18.000 s, H.264 + AAC 48 kHz stereo
* `out/klin-klinych-trailer-horizontal.mp4` — 1920×1080, the upright film centred over a blurred copy of itself (no separate landscape capture)
* `out/clips/*.mp4` — the 13 captured shots as they came out of the game

## What is shown (all real, in-engine)

| Time | Shot | Game mechanic |
|---|---|---|
| 0.0–3.0 | grass dolly, wall slide | the dirty starting house: grime/moss shader, tall unmown lawn, sunset lighting |
| 3.0–4.7 | washer on the facade | pressure washer (`washer`) brushing the facade's dirt mask, HUD money/target panel |
| 4.7–5.8 | drive pavers | washer on the driveway surface |
| 5.8–6.9 | side wall time-lapse (~21×) | the same washer, a whole stretch of wall cleaned |
| 6.9–7.9 | mower | mowing the lawn (`mower`), cut blades |
| 7.9–9.0 | roof | climbing on the roof and holding "Латати" on a missing tile: the tile is replaced |
| 9.0–10.1 | pool | the skimmer net (`net`) catching leaves in the green pool |
| 10.1–11.1 | sink | the dish-washing mini-game (sponge auto-scrub) |
| 11.1–12.4 | facade finished | the last patch is washed: "Фасад — чисто!", sparkles and pay-out |
| 12.4–13.7 | garage | buying the «Мийка 140 бар» upgrade in the shop; money drops |
| 13.7–15.0 | deck | washing the deck with the new washer |
| 15.0–18.0 | the clean house | the same camera move as the opening, on the finished house (all jobs done: washed, mown, leaves gone); wipe from dirty to clean; title card |

Set-up shortcuts used only for the camera, not new features: the free camera
and hidden hands for cinematic shots, washing most of the facade off camera
before the "finished" shot (`preclean`, the game's own brush), raising the
money to afford the upgrade, and finishing all jobs for the final reveal.

## Audio

Original, synthesized in `audio.py`: impact + muted groove + riser in the
hook, the drop on beat 7 (3.0 s), section accents on beats 16 and 26, an
arpeggio lift in the progression, a build and the final hit on beat 40
(17.14 s). SFX follow the cuts: washer hiss, mower engine, roof taps,
splash, tap and scrubbing, coins, the purchase, whooshes.

Font: Rubik (SIL Open Font License 1.1), the game's own typeface.
