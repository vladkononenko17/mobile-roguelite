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
- **Dual SMGs:** both arms pushed out almost straight, one gun in front of each shoulder, the elbows
  bent about 20° and pointing down (never out or up). Both arms may open to 98.5% of their length, as
  for the one-handed pistol, and the second gun is not pulled in for shorter arms.
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
4. In the game, add `?arsenal=1` to the link: a TEST panel (top left) switches to any gun mid-level
   (also Q / E), switches hero (the page reloads into the same map with the same gun), and has god
   mode and frozen enemies.

## 5. Long-gun stance, recoil and reload (`config.ts` `AIM_STANCE`, `RECOIL`, `RELOAD`)

These match how Battlefield, Call of Duty and GTA V heroes handle rifles, SMGs and shotguns:
- **Shouldered:** the butt plate (`BUTTS`, measured per model) sits in the right shoulder pocket, about
  7 cm from the shoulder joint. The gun is raised to cheek height, level, with the head upright behind
  it. Long guns never take the old run-and-shoot clip's hunched pose.
- **Bladed when standing:** the hips turn 24° gun-side back, the chest turns 55% of that back toward
  the target, and the spine leans 7° into the gun. The head nods 9° and leans 8° onto the stock (cheek
  weld). All of it fades out at a run, where the gun drops to a low ready.
- **Support hand on the handguard:** on the middle of the handguard (or on the pump), in front of the
  magazine, never on the barrel. Moving every grip 5–6 cm forward put the MP5 hand 7 cm from the
  muzzle, so the grips are now hand-placed per gun. Shorter arms scale the reach back by
  (reach / 0.94)², so the Medic still gets there.
- **Recoil:** every shot kicks the gun back into the shoulder (4.5 cm) and flips the muzzle (7°),
  decaying in about 60 ms. Per shot, a shotgun kicks about 1, a pistol about 0.45 and an automatic
  rifle about 0.35.
- **Reload:**
  - the gun tips down 14° and rolls 28° onto its side;
  - the support hand goes from its grip to the magazine, down to the belt for a fresh magazine, back
    into the well, and home to the grip;
  - one-handed pistols bring the free hand in for the reload too.
