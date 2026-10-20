import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Post-processing for «Чотири стіни» (adapted from «Розшук»): ambient
 * occlusion, bloom, a colour grade per mood, and `despair` — what a breaking
 * mind does to the picture: colour drains out, the edges close in like a
 * tunnel, the frame pinches in time with the heartbeat. Three quality presets so slow
 * phones can drop the expensive passes.
 */

export type Quality = "low" | "medium" | "high";
export type Mood = "day" | "rain" | "fog" | "snow" | "night" | "indoor" | "home" | "blackout" | "dusk";

interface Grade {
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  grain: number;
  /** Bloom: strength, threshold. */
  bloom: [number, number];
}

const GRADES: Record<Mood, Grade> = {
  day: { lift: [0, 0.005, 0.02], gamma: [1, 1, 1], gain: [1.05, 1.0, 0.95], saturation: 1.12, contrast: 1.06, vignette: 0.28, grain: 0.03, bloom: [0.35, 1.6] },
  rain: { lift: [0.02, 0.035, 0.05], gamma: [1, 1.02, 1.05], gain: [0.95, 1.0, 1.05], saturation: 0.78, contrast: 1.06, vignette: 0.38, grain: 0.035, bloom: [0.45, 1.3] },
  fog: { lift: [0.05, 0.05, 0.055], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 0.72, contrast: 0.92, vignette: 0.3, grain: 0.03, bloom: [0.4, 1.4] },
  snow: { lift: [0.02, 0.03, 0.06], gamma: [1, 1, 1.03], gain: [0.98, 1.02, 1.08], saturation: 0.85, contrast: 1.05, vignette: 0.32, grain: 0.03, bloom: [0.4, 1.5] },
  night: { lift: [0.0, 0.02, 0.07], gamma: [1, 1, 1.1], gain: [1.12, 1.0, 0.88], saturation: 1.05, contrast: 1.12, vignette: 0.48, grain: 0.05, bloom: [0.95, 0.85] },
  indoor: { lift: [0.02, 0.03, 0.0], gamma: [1, 1.02, 1], gain: [1.02, 1.04, 0.95], saturation: 0.95, contrast: 1.05, vignette: 0.32, grain: 0.035, bloom: [0.4, 1.4] },
  home: { lift: [0.03, 0.012, 0.0], gamma: [1, 1, 0.98], gain: [1.08, 1.0, 0.88], saturation: 1.08, contrast: 1.05, vignette: 0.42, grain: 0.04, bloom: [0.6, 1.1] },
  dusk: { lift: [0.02, 0.0, 0.04], gamma: [1, 0.98, 1.02], gain: [1.1, 0.95, 0.9], saturation: 0.95, contrast: 1.08, vignette: 0.45, grain: 0.045, bloom: [0.8, 0.95] },
  blackout: { lift: [0.02, 0.0, 0.0], gamma: [1, 0.98, 0.92], gain: [1.12, 0.95, 0.78], saturation: 0.9, contrast: 1.12, vignette: 0.6, grain: 0.06, bloom: [1.0, 0.75] },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    lift: { value: new THREE.Vector3() },
    gammaV: { value: new THREE.Vector3(1, 1, 1) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0.3 },
    grain: { value: 0.03 },
    danger: { value: 0 },
    despair: { value: 0 },
    flash: { value: 0 },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 lift; uniform vec3 gammaV; uniform vec3 gain;
    uniform float saturation; uniform float contrast; uniform float vignette; uniform float grain;
    uniform float danger; uniform float despair; uniform float flash; uniform float time; uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      // the walls pinch in with every heartbeat
      float beat = pow(abs(sin(time * 0.05)), 12.0);
      float r2 = dot(d, d);
      vec2 uv = vUv - d * despair * (0.035 + beat * 0.025) * (1.0 - r2 * 2.0);
      d = uv - 0.5;
      float ca = danger * 0.005 + despair * 0.004;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + d * ca).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - d * ca).b;
      c = gain * (c + lift * (1.0 - c));
      c = pow(max(c, 0.0), 1.0 / gammaV);
      c = (c - 0.5) * contrast + 0.5;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation * (1.0 - despair * 0.8));
      c = mix(c, c * vec3(0.92, 0.96, 1.06), despair * 0.5);
      c = mix(c, c * vec3(1.18, 0.82, 0.8), danger * 0.45);
      float v = smoothstep(0.86, 0.22, length(d * vec2(1.0, 1.12)));
      c *= mix(1.0, v, clamp(vignette + danger * 0.3, 0.0, 1.0));
      float tunnel = smoothstep(0.62 - despair * 0.32, 0.18, length(d * vec2(1.0, 0.8)));
      c *= mix(1.0, tunnel, despair * 0.85);
      c = mix(c, vec3(1.0, 0.97, 0.9), flash);
      float n = fract(sin(dot(vUv * resolution + time, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

/** GTAO that ignores see-through things (vision cones, rings, beams, light pools). */
class SolidAOPass extends GTAOPass {
  overrideVisibility(): void {
    super.overrideVisibility();
    this.scene.traverse((o) => {
      // glow sprites never occlude anything
      if ((o as THREE.Sprite).isSprite && o.visible) { o.visible = false; return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      const mat = m.material as THREE.Material | THREE.Material[];
      const see = Array.isArray(mat) ? false : mat.transparent || mat.blending === THREE.AdditiveBlending;
      if (see || m.userData.noAO) m.visible = false;
    });
  }
}

const QKEY = "stiny-gfx-v1";

export function defaultQuality(): Quality {
  try {
    const q = localStorage.getItem(QKEY);
    if (q === "low" || q === "medium" || q === "high") return q;
  } catch { /* storage blocked */ }
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return coarse ? "medium" : "high";
}

export function saveQuality(q: Quality): void {
  try { localStorage.setItem(QKEY, q); } catch { /* storage blocked */ }
}

export class Post {
  readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private ao: SolidAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade = new ShaderPass(GradeShader);
  private target: Grade = GRADES.home;
  private w = 1;
  private h = 1;
  quality: Quality;
  /** 0..1, set by the game every frame: alert / chase. */
  danger = 0;
  private dangerNow = 0;
  /** 0..1, how bad the head is. */
  despair = 0;
  private despairNow = 0;
  /** Explosion flash, decays by itself. */
  flash = 0;
  /** Multiplies the mood's bloom strength (1 = as graded); a game can tame a bright scene. */
  bloomScale = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: Quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.build();
    this.applyGrade(GRADES.home, 1);
  }

  get dpr(): number {
    const cap = this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1.25;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  private build(): void {
    this.composer?.dispose();
    const samples = this.quality === "low" ? 0 : 4;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    this.bloom = null;
    if (this.quality !== "low") {
      const ao = new SolidAOPass(this.scene, this.camera, 1, 1);
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.25, samples: this.quality === "high" ? 16 : 8 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: this.quality === "high" ? 16 : 8 });
      ao.blendIntensity = 0.95;
      this.composer.addPass(ao);
      this.ao = ao;
      const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.45, 1.0);
      this.composer.addPass(bloom);
      this.bloom = bloom;
    }
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.setSize(this.w, this.h);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    saveQuality(q);
    this.build();
    this.applyGrade(this.target, 1);
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    // AO at half resolution unless on high
    const k = this.quality === "high" ? 1 : 0.5;
    this.ao?.setSize(Math.max(1, Math.round(w * this.dpr * k)), Math.max(1, Math.round(h * this.dpr * k)));
    this.bloom?.setSize(Math.round(w * this.dpr * 0.5), Math.round(h * this.dpr * 0.5));
    this.grade.uniforms.resolution.value.set(w * this.dpr, h * this.dpr);
  }

  setMood(m: Mood, instant = false): void {
    this.target = GRADES[m];
    if (instant) this.applyGrade(this.target, 1);
  }

  private applyGrade(g: Grade, k: number): void {
    const u = this.grade.uniforms;
    (u.lift.value as THREE.Vector3).lerp(new THREE.Vector3(...g.lift), k);
    (u.gammaV.value as THREE.Vector3).lerp(new THREE.Vector3(...g.gamma), k);
    (u.gain.value as THREE.Vector3).lerp(new THREE.Vector3(...g.gain), k);
    u.saturation.value += (g.saturation - u.saturation.value) * k;
    u.contrast.value += (g.contrast - u.contrast.value) * k;
    u.vignette.value += (g.vignette - u.vignette.value) * k;
    u.grain.value += (g.grain - u.grain.value) * k;
    if (this.bloom) {
      this.bloom.strength += (g.bloom[0] * this.bloomScale - this.bloom.strength) * k;
      this.bloom.threshold += (g.bloom[1] - this.bloom.threshold) * k;
    }
  }

  render(dt: number): void {
    this.applyGrade(this.target, Math.min(1, dt * 3));
    this.dangerNow += (this.danger - this.dangerNow) * Math.min(1, dt * 6);
    this.grade.uniforms.danger.value = this.dangerNow;
    this.despairNow += (this.despair - this.despairNow) * Math.min(1, dt * 0.8);
    this.grade.uniforms.despair.value = this.despairNow;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.grade.uniforms.flash.value = this.flash;
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt * 60) % 1005.3096;
    this.composer.render(dt);
  }
}

/** Unlit material brighter than white, so bloom picks it up. */
export function glowMat(color: number, k = 3): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color });
  m.color.multiplyScalar(k);
  return m;
}

/** Soft additive pool of light on the ground under a lamp. */
let poolTex: THREE.CanvasTexture | null = null;
export function lightPoolMaterial(color: number, opacity = 0.55): THREE.MeshBasicMaterial {
  if (!poolTex) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    poolTex = new THREE.CanvasTexture(cv);
    poolTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
