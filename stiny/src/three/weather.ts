import * as THREE from "three";

/**
 * Rain for «Чотири стіни»: streaks falling past the fifth floor into the
 * courtyard, and drops on the window glass — beads that come and go, and
 * runners that slide down leaving a trail. All procedural, no textures.
 *
 * The glass works in world metres (x, y on the back wall), so every pane
 * shares one pattern and drops keep their size up close in the window view.
 */
export function rainGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 },
      rain: { value: 0 },
      tint: { value: new THREE.Color(0xbfd8ea) },
      bright: { value: 1 },
      opacity: { value: 0.18 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float rain; uniform vec3 tint; uniform float bright; uniform float opacity;
      varying vec3 vW;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

      // beads that sit on the glass, appear and slowly dry
      float beads(vec2 uv, float scale, float density, out vec2 n) {
        vec2 g = uv * scale;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        vec2 c = (vec2(h21(id), h21(id + 1.7)) - 0.5) * 0.55;
        float rad = 0.12 + 0.2 * h21(id + 3.1);
        float on = step(h21(id + 7.7), density);
        float life = fract(time * (0.04 + 0.05 * h21(id + 5.3)) + h21(id + 1.3));
        float fade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.7, life);
        vec2 q = (f - c) / rad;
        float d = length(q * vec2(1.0, 0.85));
        float m = smoothstep(1.0, 0.7, d) * on * fade;
        n = q * m;
        return m;
      }

      // drops that run down in columns, each leaving a thin wet trail of tiny beads
      float runners(vec2 uv, float density, out vec2 n) {
        float cols = 7.0;
        float gx = uv.x * cols;
        float id = floor(gx);
        float r = h21(vec2(id, 2.3));
        float speed = 0.18 + r * 0.32;
        float period = 1.4 + r * 1.6;
        float ph = (uv.y + time * speed + r * 17.0) / period;
        float cycle = floor(ph);
        float y = fract(ph);
        float on = step(h21(vec2(id, cycle)), density);
        float x = fract(gx) - 0.5 + sin(uv.y * 9.0 + id * 3.0) * 0.06 + sin(uv.y * 23.0 + id) * 0.02;
        // head at y = 0.5 of the cycle, in metres
        float dy = (y - 0.5) * period;
        vec2 q = vec2(x / cols / 0.012, dy / 0.016);
        float head = smoothstep(1.0, 0.65, length(q)) * on;
        // trail above the head (later in the cycle = higher on the glass)
        float above = smoothstep(0.5, 0.52, y) * smoothstep(0.95, 0.55, y);
        float tw = smoothstep(0.03, 0.0, abs(x) - 0.02);
        float dots = step(0.55, fract(uv.y * 38.0 + r * 9.0)) * smoothstep(0.2, 0.08, abs(fract(uv.y * 38.0 + r * 9.0) - 0.78));
        float trail = above * tw * (0.25 + dots * 0.6) * on;
        n = q * head;
        return max(head, trail);
      }

      void main() {
        vec2 uv = vW.xy;
        vec2 n1, n2, n3;
        float b1 = beads(uv, 34.0, 0.62 * rain, n1);
        float b2 = beads(uv + 3.7, 70.0, 0.5 * rain, n2);
        float rn = runners(uv, 0.55 * rain, n3);
        float m = clamp(b1 + b2 * 0.8 + rn, 0.0, 1.0);
        vec2 n = n1 + n2 + n3;
        vec3 base = tint * bright;
        // a drop is a tiny lens: the sky shows in its lower half, its top edge is dark
        float lower = clamp(0.5 + n.y * -0.6, 0.0, 1.0);
        vec3 col = mix(base, base * 1.5 + vec3(0.12, 0.14, 0.16) * bright, m * lower);
        col = mix(col, vec3(0.04, 0.05, 0.07), m * smoothstep(0.35, 0.95, n.y) * 0.65);
        // a hot pin of light near the top-left of every drop
        float spec = smoothstep(0.35, 0.0, length(n - vec2(-0.35, 0.45))) * m;
        col += vec3(1.0) * spec * 0.6 * (0.4 + bright);
        // rain fogs the glass a little
        float a = opacity + rain * 0.08;
        a = max(a, m * 0.72);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

/** Streaks of rain falling through a box (x0..x1, y0..y1, z0..z1). */
export class RainField {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private speed: Float32Array;
  private box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  private readonly n: number;
  private readonly mat: THREE.LineBasicMaterial;

  constructor(n: number, box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) {
    this.n = n;
    this.box = box;
    this.pos = new Float32Array(n * 6);
    this.speed = new Float32Array(n);
    for (let i = 0; i < n; i++) this.spawn(i, box.y0 + Math.random() * (box.y1 - box.y0));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xb8c8dc, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.userData.noAO = true;
  }

  private spawn(i: number, y: number): void {
    const b = this.box;
    const x = b.x0 + Math.random() * (b.x1 - b.x0);
    const z = b.z0 + Math.random() * (b.z1 - b.z0);
    const len = 0.35 + Math.random() * 0.4;
    this.speed[i] = 11 + Math.random() * 5;
    const p = this.pos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.06; p[i * 6 + 4] = y + len; p[i * 6 + 5] = z;
  }

  /** `k` 0..1 how hard it rains; `light` scales how visible the streaks are. */
  update(dt: number, k: number, light: number): void {
    this.lines.visible = k > 0.01;
    if (!this.lines.visible) return;
    this.mat.opacity = 0.42 * k * (0.35 + 0.65 * light);
    const p = this.pos;
    const b = this.box;
    const active = Math.floor(this.n * Math.min(1, k));
    for (let i = 0; i < this.n; i++) {
      if (i >= active) { p[i * 6 + 1] = p[i * 6 + 4] = -999; continue; }
      const dy = this.speed[i] * dt;
      p[i * 6 + 1] -= dy;
      p[i * 6 + 4] -= dy;
      p[i * 6] -= dy * 0.005; p[i * 6 + 3] -= dy * 0.005;
      if (p[i * 6 + 1] < b.y0) this.spawn(i, b.y1 - Math.random() * 2);
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
