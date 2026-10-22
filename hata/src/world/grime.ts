import * as THREE from "three";

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

const NOISE = /* glsl */ `
float gh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float gn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(gh(i),gh(i+vec3(1,0,0)),f.x),mix(gh(i+vec3(0,1,0)),gh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gh(i+vec3(0,0,1)),gh(i+vec3(1,0,1)),f.x),mix(gh(i+vec3(0,1,1)),gh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float gfbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*gn(p); p*=2.03; a*=0.5; } return s; }
`;

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
        uniform sampler2D gMask; uniform vec3 gMO, gMU, gMV, gNO; uniform vec2 gMS;
        ${NOISE}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec2 muv = vec2(dot(vGW - gMO, gMU) / gMS.x, dot(vGW - gMO, gMV) / gMS.y);
        vec3 gp = vGW + gNO;
        vec4 mk = texture2D(gMask, clamp(muv, 0.0, 1.0));
        float left = mk.r;
        float up = clamp(vGN.y, 0.0, 1.0);
        float side = 1.0 - abs(vGN.y);
        float n1 = gfbm(gp * gScale);
        float n2 = gfbm(gp * gScale * 4.7 + 13.1);
        float n3 = gn(gp * gScale * 13.0 + 3.7);
        if (gPaintK > 0.0) {
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, gPaint * clamp(0.45 + lum * 2.2, 0.0, 1.25), gPaintK);
        }
        float g = 0.0, moss = 0.0;
        if (gPeel > 0.5) {
          // old paint on bare wood: cracked, curling flakes that show the wood
          float crack = smoothstep(0.64, 0.7, gn(gp * vec3(30.0, 9.0, 30.0) + n2 * 2.0)) * (0.35 + 0.65 * smoothstep(0.35, 0.65, n1));
          float flake = left * (1.0 - crack * 0.85);
          vec3 oldC = gOldPaint * (0.75 + 0.35 * n2);
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.9, oldC, flake);
          diffuseColor.rgb = mix(diffuseColor.rgb, gFresh * (0.92 + 0.12 * n3), mk.b);
          g = left * 0.25 * (1.0 - mk.b);
        } else {
          // a film everywhere, heavy blotches, streaks from the top, mud near the ground
          float blot = smoothstep(0.38, 0.62, n1);
          g = gFilm + blot * 0.8 + n2 * 0.25;
          float st = gn(vec3(gp.x * 7.0 + gp.z * 7.0, gp.y * 0.3, 0.0));
          st = smoothstep(0.4, 0.9, st) * smoothstep(-0.8, 2.2, gp.y);
          g += st * gStreaks * side;
          g += gSplash * side * (1.0 - smoothstep(0.0, 1.1, gp.y)) * (0.7 + 0.6 * n2);
          // muddy prints and spills on floors
          g += gDust * up * smoothstep(0.62, 0.7, gn(gp * 2.2 + 31.0)) * 0.8;
          g = clamp(g * gAmount, 0.0, 1.0) * left;
          moss = gMoss * up * smoothstep(0.38, 0.85, gfbm(gp * gScale * 1.1 + 7.0)) * (0.35 + 0.65 * smoothstep(0.2, 0.8, n3)) * left;
        }
        vec3 gc = mix(gColor, gColor2, smoothstep(0.3, 0.7, n2)) * (0.55 + 0.5 * n3) * (1.15 - 0.45 * smoothstep(0.45, 0.75, n1));
        gc = mix(gc, vec3(0.27, 0.22, 0.16) * (0.75 + 0.5 * n2), gDust * up * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, gc, g * 0.94);
        vec3 mossC = mix(vec3(0.09, 0.12, 0.04), vec3(0.2, 0.25, 0.08), n2) * (0.7 + 0.5 * n3);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC, clamp(moss, 0.0, 1.0));
        float wetK = mk.g;
        diffuseColor.rgb *= 1.0 - wetK * 0.06;
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
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.05) * smoothstep(0.04, 0.3, gPeel > 0.5 ? (left * 0.4 + (1.0 - mk.b) * 0.6) : grimeK) * gHighlight * (0.35 + 0.25 * sin(gTime * 6.0));`,
      );
  };
  mat.customProgramCacheKey = () => "grime3";
  return mat;
}
