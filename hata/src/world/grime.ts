import * as THREE from "three";
import { noiseTexture } from "./noisetex";

/**
 * Grime as a material layer: any MeshStandardMaterial can be patched so that
 * procedural dirt (a film, blotches, run-off streaks, mud splash near the
 * ground, moss on faces that look at the sky) is mixed over its albedo and
 * roughness. How much of it is left is read from the surface's mask texture
 * (see clean/surface.ts): R = dirt left, G = wetness, B = fresh paint.
 * Materials without a mask use a 1×1 "fully dirty" one.
 *
 * Two global switches: `highlight` paints what is left in pulsing orange so
 * the last spots are easy to find, and `time` drives the pulse.
 */

export interface GrimeOptions {
  /** 0..1 overall dirt strength. */
  amount: number;
  color?: THREE.ColorRepresentation;
  /** Second dirt tone (soot / algae), mixed in by noise. */
  color2?: THREE.ColorRepresentation;
  /** Vertical run-off streaks (walls). */
  streaks?: number;
  /** Moss on upward faces (roofs, paving). */
  moss?: number;
  /** Feature size, metres. */
  scale?: number;
  /** Dark splash band near the ground. */
  splash?: number;
  /** Floor dust: lighter, greyer, with muddy prints. */
  dust?: number;
  /** A uniform film of dirt under the blotches (0..1). */
  film?: number;
  /** Repaint the albedo: keep the texture's light/dark detail, replace its hue. */
  paint?: THREE.ColorRepresentation;
  paintStrength?: number;
  /** Glass: dirt also makes it opaque. */
  glass?: boolean;
  /** Peeling-paint mode: R = old paint left, B = fresh paint. */
  peel?: { old: THREE.ColorRepresentation; fresh: THREE.ColorRepresentation };
}

export interface MaskBinding {
  tex: THREE.Texture;
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  size: THREE.Vector2;
  /** Added to the world position for the dirt pattern, so it moves with a moving object. */
  offset?: THREE.Vector3;
}

export const grimeGlobals = {
  highlight: { value: 0 },
  time: { value: 0 },
};

const DIRTY = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export const defaultMask = (): MaskBinding => ({
  tex: DIRTY,
  origin: new THREE.Vector3(),
  u: new THREE.Vector3(1, 0, 0),
  v: new THREE.Vector3(0, 1, 0),
  size: new THREE.Vector2(1, 1),
});

export function applyGrime(mat: THREE.MeshStandardMaterial, o: GrimeOptions, mask: MaskBinding = defaultMask()): THREE.MeshStandardMaterial {
  const u = {
    gAmount: { value: o.amount },
    gColor: { value: new THREE.Color(o.color ?? 0x3e3222) },
    gColor2: { value: new THREE.Color(o.color2 ?? 0x2a2f22) },
    gStreaks: { value: o.streaks ?? 0 },
    gMoss: { value: o.moss ?? 0 },
    gScale: { value: 1 / (o.scale ?? 1.2) },
    gSplash: { value: o.splash ?? 0 },
    gDust: { value: o.dust ?? 0 },
    gFilm: { value: o.film ?? 0 },
    gPaint: { value: new THREE.Color(o.paint ?? 0xffffff) },
    gPaintK: { value: o.paint === undefined ? 0 : (o.paintStrength ?? 1) },
    gGlass: { value: o.glass ? 1 : 0 },
    gPeel: { value: o.peel ? 1 : 0 },
    gOldPaint: { value: new THREE.Color(o.peel?.old ?? 0xffffff) },
    gFresh: { value: new THREE.Color(o.peel?.fresh ?? 0xffffff) },
    gMask: { value: mask.tex },
    gMO: { value: mask.origin },
    gMU: { value: mask.u },
    gMV: { value: mask.v },
    gMS: { value: mask.size },
    gNO: { value: mask.offset ?? new THREE.Vector3() },
    gNoise: { value: noiseTexture() },
    gHighlight: grimeGlobals.highlight,
    gTime: grimeGlobals.time,
  };
  mat.userData.grime = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGW; varying vec3 vGN;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 gwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gwp = instanceMatrix * gwp;
        #endif
        vGW = (modelMatrix * gwp).xyz;
        vGN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGW; varying vec3 vGN;
        uniform float gAmount, gStreaks, gMoss, gScale, gSplash, gDust, gFilm, gPaintK, gGlass, gPeel, gHighlight, gTime;
        uniform vec3 gColor, gColor2, gPaint, gOldPaint, gFresh;
        uniform sampler2D gMask, gNoise; uniform vec3 gMO, gMU, gMV, gNO; uniform vec2 gMS;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec2 muv = vec2(dot(vGW - gMO, gMU) / gMS.x, dot(vGW - gMO, gMV) / gMS.y);
        vec3 gp = vGW + gNO;
        vec4 mk = texture2D(gMask, clamp(muv, 0.0, 1.0));
        // planar world UVs: floors use xz, walls use their own horizontal axis and y
        vec2 wuv = abs(vGN.y) > 0.6 ? gp.xz : (abs(vGN.x) > abs(vGN.z) ? gp.zy : gp.xy);
        float n1 = texture2D(gNoise, wuv * gScale * 0.25).r;
        float n2 = texture2D(gNoise, wuv * gScale * 0.12 + 0.37).g;
        vec4 fine = texture2D(gNoise, wuv * 0.55 + 0.71);
        float n3 = fine.b;
        float spl = texture2D(gNoise, wuv * gScale * 0.6 + 0.13).a;
        // ragged, crisp edges where the tool has been: the smooth mask is cut by splatter noise
        float left = clamp((mk.r - 0.5) * 2.6 + (spl - 0.5) * 1.3 + (n3 - 0.5) * 0.5 + 0.5, 0.0, 1.0);
        left = smoothstep(0.25, 0.75, left);
        float up = clamp(vGN.y, 0.0, 1.0);
        float side = 1.0 - abs(vGN.y);
        if (gPaintK > 0.0) {
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, gPaint * clamp(0.45 + lum * 2.2, 0.0, 1.25), gPaintK);
        }
        float g = 0.0, moss = 0.0;
        if (gPeel > 0.5) {
          // old paint on bare wood: cracked, curling flakes that show the wood
          float crack = smoothstep(0.62, 0.7, texture2D(gNoise, wuv * vec2(1.4, 0.5)).b) * (0.35 + 0.65 * smoothstep(0.35, 0.65, n1));
          crack = max(crack, smoothstep(0.75, 0.85, fine.a));
          float flake = left * (1.0 - crack * 0.9);
          vec3 oldC = gOldPaint * (0.78 + 0.3 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.9, oldC, flake);
          float fresh = smoothstep(0.25, 0.75, clamp((mk.b - 0.5) * 2.6 - (spl - 0.5) * 1.0 + 0.5, 0.0, 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, gFresh * (0.92 + 0.12 * n3), fresh);
          g = left * 0.25 * (1.0 - fresh);
        } else {
          // a film everywhere, heavy blotches, streaks from the top, mud near the ground
          float blot = smoothstep(0.35, 0.65, n1);
          g = gFilm + blot * 0.75 + (n2 - 0.5) * 0.4 + (spl - 0.3) * 0.35;
          float st = texture2D(gNoise, vec2(wuv.x * 0.9, wuv.y * 0.05)).g;
          st = smoothstep(0.45, 0.8, st) * smoothstep(-0.8, 2.2, gp.y);
          g += st * gStreaks * side;
          g += gSplash * side * (1.0 - smoothstep(0.0, 1.1, gp.y)) * (0.6 + 0.8 * spl);
          // muddy prints and spills on floors
          g += gDust * up * smoothstep(0.6, 0.72, texture2D(gNoise, wuv * 0.35 + 0.5).r) * 0.8;
          g = clamp(g * gAmount, 0.0, 1.0) * left;
          moss = gMoss * up * smoothstep(0.35, 0.8, texture2D(gNoise, wuv * gScale * 0.18 + 0.61).r) * (0.35 + 0.65 * smoothstep(0.2, 0.8, n3)) * left;
        }
        vec3 gc = mix(gColor, gColor2, smoothstep(0.3, 0.7, n2)) * (0.55 + 0.5 * n3) * (1.15 - 0.45 * smoothstep(0.45, 0.75, n1)) * (0.85 + 0.3 * spl);
        gc = mix(gc, vec3(0.27, 0.22, 0.16) * (0.75 + 0.5 * n2), gDust * up * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, gc, g * 0.94);
        vec3 mossC = mix(vec3(0.09, 0.12, 0.04), vec3(0.2, 0.25, 0.08), n2) * (0.7 + 0.5 * n3);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC, clamp(moss, 0.0, 1.0));
        // fake ambient occlusion: walls darken where they meet the ground or
        // the floor, and indoors also under the ceiling (corners get depth)
        bool indoors = abs(vGW.x) < 7.0 && abs(vGW.z) < 5.0;
        float baseY = indoors ? 0.45 : 0.0;
        float ao = mix(0.6, 1.0, smoothstep(0.0, 0.6, vGW.y - baseY));
        if (indoors) ao *= mix(0.78, 1.0, smoothstep(0.0, 0.45, baseY + 2.75 - vGW.y));
        diffuseColor.rgb *= mix(1.0, ao, side);
        // freshly washed surfaces look wet for a while: darker and glossy
        float wetK = mk.g;
        diffuseColor.rgb *= 1.0 - wetK * 0.2;
        if (gGlass > 0.5) diffuseColor.a = mix(diffuseColor.a, 0.92, clamp(g * 1.2, 0.0, 1.0));
        float grimeK = clamp(g + moss, 0.0, 1.0);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, grimeK * 0.7);
        roughnessFactor = mix(roughnessFactor, 0.15, wetK);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (gHighlight > 0.0) {
          // dirty spots get moving orange hatching: easy to spot, and the
          // surface underneath stays readable (a flat glow washed everything out)
          float hk = smoothstep(0.04, 0.3, gPeel > 0.5 ? (left * 0.4 + (1.0 - mk.b) * 0.6) : grimeK);
          float hatch = smoothstep(0.35, 0.5, abs(fract((vGW.x + vGW.y + vGW.z) * 2.2 - gTime * 0.6) - 0.5) * 2.0);
          totalEmissiveRadiance += vec3(1.0, 0.45, 0.08) * hk * gHighlight * (0.06 + 0.3 * hatch);
        }`,
      );
  };
  mat.customProgramCacheKey = () => "grime6";
  return mat;
}
