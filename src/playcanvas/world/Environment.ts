import {
  ADDRESS_CLAMP_TO_EDGE,
  Color,
  Entity,
  EnvLighting,
  FloatPacking,
  FOG_LINEAR,
  PIXELFORMAT_RGBA16F,
  SHADOW_PCF5,
  Texture,
  type AppBase,
} from "playcanvas";
import { LIGHTING } from "../config";

type RGB = readonly [number, number, number];

function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  // Direction *towards* the light. Azimuth 0 = +Z (towards the camera), 90 = +X.
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

function aimLight(entity: Entity, elevationDeg: number, azimuthDeg: number): void {
  // Directional lights shine along their local -Y. Point -Y away from the light source.
  const [x, y, z] = sunDirection(elevationDeg, azimuthDeg);
  entity.lookAt(-x, -y, -z);
  entity.rotateLocal(90, 0, 0);
}

/**
 * Builds a tiny HDR sky cubemap on the CPU (gradient + sun) and prefilters it into an env atlas.
 * This gives PBR metals something to reflect and a directional ambient term without shipping
 * an HDRI. Replace with a real HDR once the art direction is locked.
 */
function createEnvironmentAtlas(app: AppBase): Texture {
  const size = 32;
  const { zenith, horizon, ground, intensity } = LIGHTING.environment;
  const sun = sunDirection(LIGHTING.sun.elevationDeg, LIGHTING.sun.azimuthDeg);
  const sunColor = LIGHTING.sun.color;
  const faces: Uint16Array[] = [];
  const mix = (a: RGB, b: RGB, t: number, i: number) => a[i] + (b[i] - a[i]) * t;

  for (let face = 0; face < 6; face++) {
    const data = new Uint16Array(size * size * 4);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const u = ((px + 0.5) / size) * 2 - 1;
        const v = ((py + 0.5) / size) * 2 - 1;
        // Cubemap face orientation per the GL spec: +X, -X, +Y, -Y, +Z, -Z.
        let x = 0, y = 0, z = 0;
        if (face === 0) { x = 1; y = -v; z = -u; }
        else if (face === 1) { x = -1; y = -v; z = u; }
        else if (face === 2) { x = u; y = 1; z = v; }
        else if (face === 3) { x = u; y = -1; z = -v; }
        else if (face === 4) { x = u; y = -v; z = 1; }
        else { x = -u; y = -v; z = -1; }
        const len = Math.hypot(x, y, z);
        x /= len; y /= len; z /= len;

        const sunDot = Math.max(0, x * sun[0] + y * sun[1] + z * sun[2]);
        const glow = Math.pow(sunDot, 64) * 6 + Math.pow(sunDot, 6) * 0.35;
        const offset = (py * size + px) * 4;
        for (let c = 0; c < 3; c++) {
          const sky = y >= 0 ? mix(horizon, zenith, Math.pow(y, 0.6), c) : mix(horizon, ground, Math.min(1, -y * 4), c);
          data[offset + c] = FloatPacking.float2Half((sky + glow * sunColor[c]) * intensity);
        }
        data[offset + 3] = FloatPacking.float2Half(1);
      }
    }
    faces.push(data);
  }

  const cubemap = new Texture(app.graphicsDevice, {
    name: "procedural-sky",
    cubemap: true,
    width: size,
    height: size,
    format: PIXELFORMAT_RGBA16F,
    mipmaps: false,
    addressU: ADDRESS_CLAMP_TO_EDGE,
    addressV: ADDRESS_CLAMP_TO_EDGE,
    // Half-float data; the typings only list Uint8Array but the engine uploads any typed array.
    levels: [faces as unknown as Uint8Array[]],
  });
  const lightingSource = EnvLighting.generateLightingSource(cubemap, { size: 64 });
  const atlas = EnvLighting.generateAtlas(lightingSource, { size: 256 });
  lightingSource.destroy();
  cubemap.destroy();
  return atlas;
}

/** Sun (soft PCF5 shadows), bounce fill, rim, image-based ambient and distance fog. */
export function createLighting(app: AppBase): { sun: Entity } {
  const scene = app.scene;
  scene.envAtlas = createEnvironmentAtlas(app);
  scene.skyboxIntensity = 1;
  scene.exposure = LIGHTING.exposure;

  const [r, g, b] = LIGHTING.clearColor;
  scene.fog.type = FOG_LINEAR;
  scene.fog.color = new Color(r, g, b);
  scene.fog.start = LIGHTING.fogStart;
  scene.fog.end = LIGHTING.fogEnd;

  const s = LIGHTING.sun;
  const sun = new Entity("Sun");
  sun.addComponent("light", {
    type: "directional",
    color: new Color(s.color[0], s.color[1], s.color[2]),
    intensity: s.intensity,
    castShadows: true,
    shadowType: SHADOW_PCF5,
    shadowResolution: s.shadowResolution,
    shadowDistance: s.shadowDistance,
    shadowBias: s.shadowBias,
    normalOffsetBias: s.normalOffsetBias,
    shadowIntensity: s.shadowIntensity,
  });
  aimLight(sun, s.elevationDeg, s.azimuthDeg);
  app.root.addChild(sun);

  const f = LIGHTING.fill;
  const fill = new Entity("Fill");
  fill.addComponent("light", {
    type: "directional",
    color: new Color(f.color[0], f.color[1], f.color[2]),
    intensity: f.intensity,
    castShadows: false,
  });
  aimLight(fill, f.elevationDeg, f.azimuthDeg);
  app.root.addChild(fill);

  const rimConfig = LIGHTING.rim;
  const rim = new Entity("Rim");
  rim.addComponent("light", {
    type: "directional",
    color: new Color(rimConfig.color[0], rimConfig.color[1], rimConfig.color[2]),
    intensity: rimConfig.intensity,
    castShadows: false,
  });
  aimLight(rim, rimConfig.elevationDeg, rimConfig.azimuthDeg);
  app.root.addChild(rim);

  return { sun };
}
