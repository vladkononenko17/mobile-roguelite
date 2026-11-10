# Hero hold standard

How a hero must look holding a gun: body proportions, sleeves, and where the hands sit on each weapon
class. It was written after playtesters said the Drifter's support hand "looks hypertrophied, bigger than
the other hand". The cause was his puffer sleeve: 14 cm across at the wrist, so the cuff and the hand
read as one swollen fist. The numbers are real-world adult proportions, checked against the built
models. `tests/hero-proportions.test.mjs` enforces the static ones and `node scripts/measure-heroes.mjs`
prints them.

## 1. Body and hands (bind pose, `scripts/measure-heroes.mjs`)

| Measure | Real adult (1.75 m) | Rule for a hero |
| --- | --- | --- |
| Hand length (wrist to middle fingertip) | 18–19 cm (0.108 × height) | 0.095–0.12 × height |
| Left vs right (every measure) | equal | within 5% |
| Wrist radius, sleeve included | 2.7 cm bare | ≤ 3.8 cm (tight or elastic cuff) |
| Forearm radius, sleeve included | 4.5 cm bare | ≤ 6.0 cm |
| Upper-arm radius, sleeve included | 5 cm bare | ≤ 9.5 cm (a parka is allowed bulk here) |

Why: from the top-down game camera the hand is a few pixels wide. Anything around the wrist that is as
wide as the hand merges with it and reads as a huge hand. A puffy upper arm reads as a coat; a puffy
cuff reads as a deformity.

Puffer garments (`scripts/build-heroes.mjs` `PUFF`) therefore taper:
- full puff on the body;
- 35% of it at the shoulder, falling to 20% at the forearm;
- 5% at the cuff, which is also drawn in to 3.4 cm over the last 9 cm (an elastic cuff);
- on the arms the puff pushes straight out only, never along the arm and over the hand.

## 2. Guns against hands (life-size weapons, `weapons.glb`)

| Class | Gun length | Length / hand length |
| --- | --- | --- |
| Pistol, hand cannon | 17–21 cm | 0.9–1.3 |
| SMG (MP5) | 54 cm | 2.6–3.3 |
| Rifle, shotgun | 71–88 cm | 3.5–4.7 |

Guns are never scaled per hero. A smaller hero gets a smaller hand, not a bigger gun.

## 3. Where the hands go (runtime, `WeaponHands` with the grips in `config.ts` `WEAPONS`)

- **Firing hand:** the palm on the back of the grip, its centre about 5–7 cm from the grip axis. The
  index finger rests along the trigger guard and the other fingers wrap the front strap. The wrist is
  straight in line with the barrel.
- **Pistol support hand:** cups the firing hand from below and to the side. The palm centres are
  10–14 cm apart (they were 15–16 cm, two separate fists, before the pistol support radius went from
  4.5 cm to 2.6 cm). The support fingers sit under the trigger guard.
- **SMG and rifle support hand:** under the handguard, palm up and fingers round it. The palm centre is
  ≤ 8 cm from its grip mark, and the elbow points down, not out.
- **Both hands the same size on screen:** same bone scale, no sleeve swelling over either hand (§1).
  The hand nearer the camera will look a little larger; that is perspective and fine.
- **Palm offset per hero** (`avatarHero(..., palm)` in `config.ts`): the Survivor's hands are chunky, and
  the slimmer CC0 avatar hands need the palm surface nearer the bone. The Drifter uses 0.6, which closes
  a 1–2 cm air gap between his palms and the grips.

## 4. Checking a hero

1. Run `node scripts/measure-heroes.mjs` and check that every value is inside §1, both sides equal.
2. Run `npm test`. The proportions test covers §1 and §2 for every built hero.
3. Render pistol, SMG and rifle holds from the side and from the game camera (pitch ~70°), and compare
   with the Survivor.
