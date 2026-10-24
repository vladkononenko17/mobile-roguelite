// The trailer's shots, in capture order (one game session: dirty → working →
// upgrade → clean). Every frame is a real render of the game; `frame(i, n)`
// advances the game's own simulation and/or places the camera.
//
// Modes: "canvas" = the 3D view only (cinematic shots), "page" = the screen
// with the game's HUD (gameplay shots). Frame rate: 30 fps.
//
// Helpers (window.tr) are injected once by capture.mjs from `lib` below.

export const W = 720, H = 1280;
export const FPS = 30;

/** Runs once in the page before the first shot. */
export const lib = () => {
  const L = (a, b, t) => a + (b - a) * t;
  window.tr = {
    L,
    ease: (t) => t * t * (3 - 2 * t),
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    /** Camera on a straight path p0→p1 looking from l0→l1 at time t (0..1). */
    path: (p0, p1, l0, l1, t, fov) => {
      window.__hata.cine(L(p0[0], p1[0], t), L(p0[1], p1[1], t), L(p0[2], p1[2], t), L(l0[0], l1[0], t), L(l0[1], l1[1], t), L(l0[2], l1[2], t), fov);
    },
    fov: (f) => { const c = window.__hata.camera; c.fov = f; c.updateProjectionMatrix(); },
    /** Look at a world point from the player's eye (sets yaw/pitch). */
    aimAt: (x, y, z) => {
      const p = window.__hata.player, c = window.__hata.camera;
      const dx = x - c.position.x, dy = y - c.position.y, dz = z - c.position.z;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    /** Game time advanced in small steps with the aim following f(τ) → [yaw, pitch]. */
    sprayFor: (sec, aim, hold = true) => {
      const n = Math.max(1, Math.round(sec * 30));
      for (let k = 0; k < n; k++) {
        const a = aim(k / n);
        if (a) { window.__hata.player.yaw = a[0]; window.__hata.player.pitch = a[1]; }
        window.__hata.simulate(1 / 30, hold);
      }
    },
    /** Washes a surface clean by hand-placed brush strokes, leaving a box (world x/y/z range) dirty. */
    preclean: (key, keep) => {
      const s = window.__hata.W.surfaces.find((q) => q.key === key);
      for (let a = 0; a <= s.w; a += 0.12) for (let b = 0; b <= s.h; b += 0.12) {
        const p = s.origin.clone().addScaledVector(s.u, a).addScaledVector(s.v, b);
        if (keep && p.x > keep[0] && p.x < keep[1] && p.y > keep[2] && p.y < keep[3] && p.z > keep[4] && p.z < keep[5]) continue;
        s.brush(p, 0.2, 1, "clean", 0);
      }
      s.tex.needsUpdate = true;
    },
  };
  window.__hata.camera.fov = 62;
};

const FPV = 74; // first-person field of view for an upright phone

export const shots = [
  // ── HOOK ─────────────────────────────────────────────────────────────────
  {
    // low through the tall grass toward the neglected house, rising
    name: "a1_grass", frames: 45,
    setup: () => { window.__hata.hands(false); window.__hata.teleport(-4.4, 16.5, 0, 0); },
    frame: (i, n) => {
      window.__hata.simulate(1 / 30, false);
      tr.path([-5.6, 0.38, 19.8], [-3.4, 1.2, 15.2], [-2.2, 1.5, 5], [-2.0, 2.1, 5], tr.io(i / (n - 1)), 56);
    },
  },
  {
    // sliding along the filthy front wall: streaks, moss, the grimy window
    name: "a2_wall", frames: 45,
    setup: () => { window.__hata.teleport(-3, 8, 0, 0); },
    frame: (i, n) => {
      window.__hata.simulate(1 / 30, false);
      const t = tr.ease(i / (n - 1));
      tr.path([-7.4, 1.3, 8.9], [-1.8, 1.8, 8.5], [-4.6, 1.9, 5.1], [1.0, 1.7, 5.1], t, 54);
    },
  },
  // ── CLEANING ─────────────────────────────────────────────────────────────
  {
    // first person: the washer cuts clean stripes through the grime (2× speed)
    name: "b1_wash", frames: 51, mode: "page",
    setup: () => {
      window.__hata.hands(true);
      window.__hata.setTool("washer");
      window.__hata.teleport(0.9, 7.05, 0, 0);
      tr.fov(74);
    },
    frame: (i, n) => {
      const t0 = i / n, t1 = (i + 1) / n;
      // two horizontal passes, stepping down
      tr.sprayFor(2 / 30, (k) => {
        const t = t0 + (t1 - t0) * k;
        const pass = Math.min(1, Math.floor(t * 2));
        const u = (t * 2) % 1;
        const x = pass === 0 ? -0.42 + 0.84 * u : 0.42 - 0.84 * u;
        return [x, 0.12 - pass * 0.16 - u * 0.05];
      });
    },
  },
  {
    // close on the oily pavers of the drive
    name: "b2_drive", frames: 36,
    setup: () => { window.__hata.teleport(10.3, 9.9, 0, -0.8); tr.fov(74); },
    frame: (i, n) => {
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(2 / 30, (k) => {
        const t = t0 + (t1 - t0) * k;
        return [Math.sin(t * Math.PI * 2.5) * 0.45, -0.95 + t * 0.35];
      });
    },
  },
  {
    // time-lapse from over the shoulder: a whole stretch of the side wall comes clean
    name: "b3_timelapse", frames: 33,
    setup: () => {
      window.__hata.hands(false);
      window.__hata.teleport(-9.0, 0.0, -Math.PI / 2, 0);
    },
    frame: (i, n) => {
      // 0.7 s of real washing per frame (≈ 21× speed), a raster over the wall
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(0.7, (k) => {
        const t = t0 + (t1 - t0) * k;
        const rows = 7, r = Math.min(rows - 1, Math.floor(t * rows)), u = (t * rows) % 1;
        const side = r % 2 === 0 ? u : 1 - u;
        return [-Math.PI / 2 + (side - 0.5) * 0.9, 0.42 - r * 0.13];
      });
      tr.path([-9.6, 1.75, 0.55], [-9.5, 1.75, 0.5], [-7.1, 1.55, 0.0], [-7.1, 1.55, 0.0], i / (n - 1), 58);
    },
  },
  // ── VARIETY ──────────────────────────────────────────────────────────────
  {
    // pushing the mower: a fresh lane next to the one already cut
    name: "c1_mow", frames: 33,
    setup: () => {
      window.__hata.hands(true);
      window.__hata.setTool("mower");
      // the previous lane, cut off camera
      window.__hata.teleport(-8.3, 21.5, 0, -0.3);
      window.__hata.simulate(4.5, true, [0, 1]);
      window.__hata.teleport(-9.1, 21.2, 0.05, -0.42);
      tr.fov(74);
    },
    frame: () => { window.__hata.simulate(1.3 / 30, true, [0, 1]); },
  },
  {
    // up on the roof: a missing tile is fixed
    name: "c2_roof", frames: 33, mode: "page",
    setup: () => {
      window.__hata.setTool("hands");
      const it = window.__hata.W.interactables.find((q) => q.id === "tile:0");
      const p = it.pos;
      window.tr.tile = [p.x, p.y, p.z];
      const back = p.z > 0 ? 1.1 : -1.1;
      window.__hata.teleport(p.x - 0.25, p.z + back, 0, 0, true);
      window.__hata.simulate(1 / 30, false);
      tr.aimAt(p.x, p.y, p.z);
      tr.fov(74);
    },
    frame: (i) => {
      const p = window.tr.tile;
      tr.aimAt(p[0], p[1], p[2]);
      window.__hata.simulate(1.6 / 30, i >= 4);
    },
  },
  {
    // fishing leaves out of the swampy pool
    name: "c3_pool", frames: 33,
    setup: () => {
      window.__hata.hands(true);
      window.__hata.setTool("net");
      window.__hata.teleport(-5.0, -9.4, 0, -0.55);
      tr.fov(74);
    },
    frame: (i, n) => {
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(1.5 / 30, (k) => { const t = t0 + (t1 - t0) * k; return [Math.sin(t * Math.PI * 1.6) * 0.5, -0.62]; });
    },
  },
  {
    // the dishes, one by one, in the kitchen sink
    name: "c4_dishes", frames: 33,
    setup: () => {
      window.__hata.hands(false);
      window.__hata.teleport(4.4, 3.4, 0, -0.2);
      window.__hata.enterDishes();
      window.__hata.simulate(0.8, false);
    },
    frame: () => { window.__hata.simulate(1.6 / 30, true); },
    after: () => { window.__hata.exitDishes(); window.__hata.hands(true); },
  },
  // ── PROGRESSION ──────────────────────────────────────────────────────────
  {
    // the last patch of the front wall goes: "Фасад — чисто!" and the pay-out
    name: "d1_done", frames: 39, mode: "page",
    setup: () => {
      window.__hata.setTool("washer");
      // the wall has been washed almost everywhere (as in the earlier shots)
      tr.preclean("facade:front", [-1.2, 0.3, 1.0, 2.07, 4.5, 6]);
      window.__hata.teleport(-0.45, 7.05, 0, 0);
      window.__hata.simulate(0.4, false);
      tr.fov(74);
    },
    frame: (i, n) => {
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(1.6 / 30, (k) => {
        const t = t0 + (t1 - t0) * k;
        const rows = 4, r = Math.min(rows - 1, Math.floor(t * rows)), u = (t * rows) % 1;
        const side = r % 2 === 0 ? u : 1 - u;
        return [(side - 0.5) * 0.6, 0.05 - r * 0.09];
      }, i < n - 8);
    },
  },
  {
    // the garage: a stronger washer for the money earned
    name: "d2_shop", frames: 39, mode: "page",
    setup: () => {
      window.__hata.save.money = Math.max(window.__hata.save.money, 2480);
      window.__hata.simulate(1 / 30, false);
      document.getElementById("b-shop").click();
    },
    frame: (i) => {
      if (i === 14) document.querySelector('[data-buy="washer"]')?.click();
      if (i === 31) document.getElementById("sh-x")?.click();
      window.__hata.simulate(1 / 30, false);
    },
  },
  {
    // the new washer: a wide, hard jet across the mossy deck (2× speed)
    name: "d3_pro", frames: 42, mode: "page",
    setup: () => {
      window.__hata.setTool("washer");
      window.__hata.teleport(4.8, -11.2, Math.PI, -0.42);
      window.__hata.simulate(0.2, false);
      tr.fov(74);
    },
    frame: (i, n) => {
      const t0 = i / n, t1 = (i + 1) / n;
      tr.sprayFor(2 / 30, (k) => { const t = t0 + (t1 - t0) * k; return [Math.PI + Math.sin(t * Math.PI * 2) * 0.5, -0.42 - t * 0.12]; });
    },
  },
  // ── REVEAL ───────────────────────────────────────────────────────────────
  {
    // the same move as the opening, on the finished house — then a slow push for the title
    name: "e1_clean", frames: 90,
    setup: () => {
      window.__hata.hands(false);
      window.__hata.finishAll();
      window.__hata.teleport(-4.4, 16.5, 0, 0);
      window.__hata.simulate(1.0, false);
    },
    frame: (i) => {
      window.__hata.simulate(1 / 30, false);
      if (i < 45) tr.path([-5.6, 0.38, 19.8], [-3.4, 1.2, 15.2], [-2.2, 1.5, 5], [-2.0, 2.1, 5], tr.io(i / 44), 56);
      else tr.path([-3.4, 1.2, 15.2], [-3.1, 1.35, 14.1], [-2.0, 2.1, 5], [-2.0, 2.25, 5], tr.ease((i - 45) / 44), 56);
    },
  },
];
