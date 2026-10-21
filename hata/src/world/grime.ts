import * as THREE from "three";

/**
 * Grime as a material layer, not a texture swap: any MeshStandardMaterial can
 * be patched so that procedural dirt (world-space fbm, run-off streaks under
 * eaves, splash near the ground, moss on surfaces that face the sky) is mixed
 * over its own albedo and roughness. Cleaned areas are subtracted by a shared
 * list of "clean zones" — in the game these become per-surface mask textures
 * painted by the tool; for now zones are boxes with a soft edge and a wet
 * sheen that dries out.
 */

export interface GrimeOptions {
  /** 0..1 overall dirt. */
  amount: number;
  color?: THREE.ColorRepresentation;
  /** Vertical run-off streaks (walls). */
  streaks?: number;
  /** Moss on upward faces (roofs, paving). */
  moss?: number;
  /** Feature size, metres. */
  scale?: number;
  /** Dark splash band near the ground, metres above y=0. */
  splash?: number;
  /** Treat as floor dust: footprints-ish patches, lighter grey-brown. */
  dust?: number;
}

const MAX_ZONES = 8;

export const grimeGlobals = {
  zonesMin: { value: Array.from({ length: MAX_ZONES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  zonesMax: { value: Array.from({ length: MAX_ZONES }, () => new THREE.Vector4(-1, -1, -1, 0)) },
  zoneCount: { value: 0 },
};

/** A cleaned box; `wet` 0..1 adds a fresh-wash sheen. `wobble` roughens the edge (metres). */
export function addCleanZone(min: THREE.Vector3Like, max: THREE.Vector3Like, wet = 0.6, wobble = 0.12): void {
  const i = grimeGlobals.zoneCount.value;
  if (i >= MAX_ZONES) return;
  grimeGlobals.zonesMin.value[i].set(min.x, min.y, min.z, wet);
  grimeGlobals.zonesMax.value[i].set(max.x, max.y, max.z, wobble);
  grimeGlobals.zoneCount.value = i + 1;
}

const NOISE = /* glsl */ `
float gh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float gn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(gh(i),gh(i+vec3(1,0,0)),f.x),mix(gh(i+vec3(0,1,0)),gh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(gh(i+vec3(0,0,1)),gh(i+vec3(1,0,1)),f.x),mix(gh(i+vec3(0,1,1)),gh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float gfbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*gn(p); p*=2.03; a*=0.5; } return s; }
`;

export function applyGrime(mat: THREE.MeshStandardMaterial, o: GrimeOptions): THREE.MeshStandardMaterial {
  const u = {
    gAmount: { value: o.amount },
    gColor: { value: new THREE.Color(o.color ?? 0x4a3a28) },
    gStreaks: { value: o.streaks ?? 0 },
    gMoss: { value: o.moss ?? 0 },
    gScale: { value: 1 / (o.scale ?? 1.2) },
    gSplash: { value: o.splash ?? 0 },
    gDust: { value: o.dust ?? 0 },
  };
  mat.userData.grime = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, {
      gZoneMin: grimeGlobals.zonesMin,
      gZoneMax: grimeGlobals.zonesMax,
      gZoneCount: grimeGlobals.zoneCount,
    });
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
        uniform float gAmount, gStreaks, gMoss, gScale, gSplash, gDust;
        uniform vec3 gColor;
        uniform vec4 gZoneMin[${MAX_ZONES}]; uniform vec4 gZoneMax[${MAX_ZONES}]; uniform int gZoneCount;
        ${NOISE}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 gp = vGW;
        float up = clamp(vGN.y, 0.0, 1.0);
        float side = 1.0 - abs(vGN.y);
        float n1 = gfbm(gp * gScale);
        float n2 = gfbm(gp * gScale * 4.7 + 13.1);
        float g = smoothstep(0.32, 0.72, n1) * 0.75 + n2 * 0.35;
        // run-off: thin vertical streaks that fade downwards
        float st = gn(vec3(gp.x * 9.0 + gp.z * 9.0, gp.y * 0.35, 0.0));
        st = smoothstep(0.45, 0.95, st) * smoothstep(-0.5, 2.5, gp.y);
        g += st * gStreaks * side;
        // splash band near the ground
        g += gSplash * side * (1.0 - smoothstep(0.0, 0.9, gp.y)) * (0.6 + 0.6 * n2);
        g *= gAmount;
        float zoneClean = 0.0; float wet = 0.0;
        for (int i = 0; i < ${MAX_ZONES}; i++) {
          if (i >= gZoneCount) break;
          vec3 mn = gZoneMin[i].xyz; vec3 mx = gZoneMax[i].xyz;
          float wob = gZoneMax[i].w * (gn(gp * 3.1) - 0.5) * 2.0;
          vec3 dIn = min(gp - mn, mx - gp) + wob;
          float inside = smoothstep(0.0, 0.12, min(min(dIn.x, dIn.y), dIn.z));
          zoneClean = max(zoneClean, inside);
          wet = max(wet, inside * gZoneMin[i].w * (0.7 + 0.3 * n2));
        }
        g *= 1.0 - zoneClean;
        g = clamp(g, 0.0, 1.0);
        vec3 gc = gColor * (0.65 + 0.7 * n2);
        // dust on floors is lighter and greyer
        gc = mix(gc, vec3(0.42, 0.38, 0.33) * (0.8 + 0.4 * n2), gDust * up);
        diffuseColor.rgb = mix(diffuseColor.rgb, gc, g * 0.88);
        // moss on faces that look at the sky
        float moss = gMoss * up * smoothstep(0.45, 0.75, gfbm(gp * gScale * 1.6 + 7.0)) * (1.0 - zoneClean);
        vec3 mossC = mix(vec3(0.16, 0.22, 0.07), vec3(0.32, 0.4, 0.12), n2);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC, clamp(moss, 0.0, 1.0));
        diffuseColor.rgb *= 1.0 - wet * 0.22;
        float grimeK = g; float mossK = moss; float wetK = wet;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 1.0, grimeK * 0.6 + mossK * 0.5);
        roughnessFactor = mix(roughnessFactor, 0.18, wetK);`,
      );
  };
  mat.customProgramCacheKey = () => `grime${MAX_ZONES}`;
  return mat;
}
