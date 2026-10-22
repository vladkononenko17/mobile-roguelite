import * as THREE from "three";

/**
 * The sky as a sunset: the panorama (clouds) on a big sphere around the
 * camera, tinted with a gradient — orange at the horizon, lilac-blue above —
 * and a warm glow around the sun. One cheap draw, replaces scene.background.
 */
export class SunsetSky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    tSky: { value: null as THREE.Texture | null },
    uRot: { value: 0 },
    uSun: { value: new THREE.Vector3(1, 0.1, 0) },
    uIntensity: { value: 1 },
    uWarm: { value: 1 },
  };

  constructor(tex: THREE.Texture, rotation: number) {
    this.uniforms.tSky.value = tex;
    this.uniforms.uRot.value = rotation;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // on the far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky; uniform float uRot; uniform vec3 uSun; uniform float uIntensity; uniform float uWarm;
        varying vec3 vDir;
        #include <common>
        void main() {
          vec3 d = normalize(vDir);
          // same turn as scene.backgroundRotation would give
          float c = cos(uRot), s = sin(uRot);
          vec3 r = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
          vec2 uv = vec2(atan(r.z, r.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
          vec3 sky = texture2D(tSky, uv).rgb;
          float h = clamp(d.y, 0.0, 1.0);
          // horizon orange → lilac → dusky blue at the top
          vec3 grad = mix(vec3(1.55, 0.78, 0.42), vec3(1.0, 0.78, 0.9), smoothstep(0.0, 0.25, h));
          grad = mix(grad, vec3(0.72, 0.78, 1.05), smoothstep(0.25, 0.8, h));
          float sunDot = max(dot(d, normalize(uSun)), 0.0);
          vec3 glow = vec3(1.6, 0.75, 0.3) * (pow(sunDot, 6.0) * 0.9 + pow(sunDot, 60.0) * 2.5);
          vec3 col = sky * mix(vec3(1.0), grad, uWarm) + glow * uWarm;
          // below the horizon: warm haze like the fog
          col = mix(col, vec3(0.86, 0.62, 0.45) * 0.9, smoothstep(0.0, -0.08, d.y));
          gl_FragColor = vec4(col * uIntensity, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  update(cam: THREE.Vector3, sunDir: THREE.Vector3, intensity: number): void {
    this.mesh.position.copy(cam);
    this.uniforms.uSun.value.copy(sunDir);
    this.uniforms.uIntensity.value = intensity;
  }
}
