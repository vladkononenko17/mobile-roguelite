import * as THREE from "three";

export type ScreenMode = "off" | "lock" | "code" | "game" | "call" | "doc";

/**
 * The laptop screen as a live picture: code scrolling while you work, a little
 * platformer while you play, the therapist's video call, a journal page being
 * typed, a lock screen with the clock. Redrawn a few times a second.
 */
export class LaptopScreen {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private t = 0;
  private acc = 0;
  private mode: ScreenMode = "off";
  private lines: Array<{ indent: number; parts: Array<[number, string]> }> = [];
  private scroll = 0;
  /** 0..1: how much light the picture throws (for the light on the face). */
  glow = 0;
  private readonly W = 256;
  private readonly H = 160;

  constructor() {
    const cv = document.createElement("canvas");
    cv.width = this.W;
    cv.height = this.H;
    this.g = cv.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const palette = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#abb2bf", "#e06c75", "#56b6c2"];
    for (let i = 0; i < 60; i++) {
      const parts: Array<[number, string]> = [];
      let n = 1 + Math.floor(Math.random() * 4);
      while (n--) parts.push([8 + Math.random() * 40, palette[Math.floor(Math.random() * palette.length)]]);
      this.lines.push({ indent: [0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 6)], parts });
    }
    this.draw(0);
  }

  update(dt: number, mode: ScreenMode, clock: number): void {
    this.t += dt;
    this.acc += dt;
    if (mode !== this.mode) { this.mode = mode; this.acc = 1; }
    // a few frames a second is enough for a screen seen from across the room
    if (this.acc < (mode === "game" ? 1 / 12 : 1 / 6)) return;
    this.acc = 0;
    this.draw(clock);
    this.texture.needsUpdate = true;
  }

  private draw(clock: number): void {
    const { g, W, H } = this;
    const t = this.t;
    switch (this.mode) {
      case "off":
        g.fillStyle = "#07090c";
        g.fillRect(0, 0, W, H);
        this.glow = 0;
        return;
      case "lock": {
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, "#1d2a44");
        gr.addColorStop(1, "#3a2a48");
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        g.fillStyle = "rgba(255,255,255,.9)";
        g.font = "bold 44px sans-serif";
        g.textAlign = "center";
        const hh = String(Math.floor(clock / 60) % 24).padStart(2, "0");
        const mm = String(Math.floor(clock % 60)).padStart(2, "0");
        g.fillText(`${hh}:${mm}`, W / 2, H / 2 + 8);
        g.font = "12px sans-serif";
        g.fillStyle = "rgba(255,255,255,.6)";
        g.fillText("🔒", W / 2, H / 2 + 34);
        g.textAlign = "left";
        this.glow = 0.25;
        return;
      }
      case "code": {
        g.fillStyle = "#1e2127";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#16181d";
        g.fillRect(0, 0, 22, H);
        g.fillRect(0, 0, W, 12);
        g.fillStyle = "#2c313a";
        g.fillRect(24, 2, 50, 8);
        this.scroll += 0.35;
        const lh = 9;
        const first = Math.floor(this.scroll);
        for (let i = 0; i < 18; i++) {
          const li = this.lines[(first + i) % this.lines.length];
          const y = 16 + i * lh - (this.scroll % 1) * lh;
          g.fillStyle = "#4b5263";
          g.fillRect(6, y + 2, 10, 3);
          let x = 28 + li.indent * 10;
          for (const [w, c] of li.parts) { g.fillStyle = c; g.fillRect(x, y + 1, w, 4); x += w + 4; }
        }
        // the cursor blinks on the last line
        if (Math.floor(t * 2) % 2) { g.fillStyle = "#e5e5e5"; g.fillRect(120, H - 22, 2, 8); }
        this.glow = 0.55;
        return;
      }
      case "game": {
        // a little platformer: sky, hills scrolling, a hero jumping
        const gr = g.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, "#5ab0ff");
        gr.addColorStop(1, "#bfe6ff");
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
        const off = (t * 40) % 128;
        g.fillStyle = "#4caf50";
        for (let i = -1; i < 4; i++) { g.beginPath(); g.arc(i * 128 - off + 64, H - 20, 60, Math.PI, 0); g.fill(); }
        g.fillStyle = "#8d5a2b";
        g.fillRect(0, H - 22, W, 22);
        g.fillStyle = "#c98d4b";
        for (let i = -1; i < 18; i++) g.fillRect(i * 16 - (t * 80) % 16, H - 22, 14, 6);
        const coinX = W - ((t * 80) % (W + 40));
        g.fillStyle = "#ffd54a";
        g.beginPath(); g.arc(coinX, H - 60, 6, 0, Math.PI * 2); g.fill();
        const jump = Math.abs(Math.sin(t * 3.2)) * 34;
        g.fillStyle = "#e53935";
        g.fillRect(70, H - 42 - jump, 14, 20);
        g.fillStyle = "#ffcc80";
        g.fillRect(72, H - 50 - jump, 10, 8);
        this.glow = 0.8;
        return;
      }
      case "call": {
        g.fillStyle = "#2b2f36";
        g.fillRect(0, 0, W, H);
        // the therapist: a warm room behind her, she nods now and then
        g.fillStyle = "#4a3a32";
        g.fillRect(20, 10, W - 40, H - 34);
        g.fillStyle = "#6b8a6a";
        g.fillRect(W - 70, 18, 30, 60);
        const nod = Math.sin(t * 1.3) * 2;
        g.fillStyle = "#2a1e18";
        g.beginPath(); g.ellipse(W / 2, 58 + nod, 26, 30, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e0b090";
        g.beginPath(); g.ellipse(W / 2, 64 + nod, 18, 22, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#7a5aa0";
        g.beginPath(); g.ellipse(W / 2, H - 30, 46, 28, 0, Math.PI, 0); g.fill();
        // you, in the corner, with the beard
        g.fillStyle = "#15171b";
        g.fillRect(W - 62, H - 54, 50, 34);
        g.fillStyle = "#b08a70";
        g.beginPath(); g.arc(W - 37, H - 38, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e53935";
        g.beginPath(); g.arc(W / 2, H - 12, 6, 0, Math.PI * 2); g.fill();
        this.glow = 0.5;
        return;
      }
      case "doc": {
        g.fillStyle = "#3a3d44";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#f4f1ea";
        g.fillRect(40, 6, W - 80, H - 6);
        const typed = Math.floor(t * 9) % 120;
        g.fillStyle = "#555";
        for (let i = 0; i < 12; i++) {
          const len = Math.min(150, Math.max(0, typed * 4 - i * 150));
          if (len <= 0) break;
          g.fillRect(52, 18 + i * 11, len * (0.6 + ((i * 37) % 10) / 25), 3);
        }
        this.glow = 0.7;
        return;
      }
    }
  }
}
