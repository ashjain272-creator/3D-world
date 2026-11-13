import * as THREE from 'three';

/**
 * Uniforms shared by environment shaders (foliage wind, water, clouds,
 * facades). SkyWeather writes them once per frame.
 */
export const env = {
  uTime: { value: 0 },
  uSky: { value: new THREE.Color('#8fb4e0') },
  uSun: { value: new THREE.Color('#fff4e0') },
  uCover: { value: 0.35 },
  uDay: { value: 1 },
  uWind: { value: 1 },
};

const NOISE_GLSL = /* glsl */ `
float eh21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float evn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(eh21(i), eh21(i+vec2(1,0)), u.x), mix(eh21(i+vec2(0,1)), eh21(i+vec2(1,1)), u.x), u.y); }
float efbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<4;i++){ v += a*evn(p); p = p*2.03 + 17.0; a *= 0.5; } return v; }
`;
export { NOISE_GLSL };

/**
 * Leaf / grass material: instances sway in the wind and are shaded darker
 * underneath, which gives canopies volume without textures.
 * `tip`: geometry spans y 0..1 and bends from the root (grass); otherwise it
 * is a blob centred on the origin (canopy).
 */
export function foliageMaterial(opts: { tip?: boolean; sway?: number; roughness?: number; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.9, flatShading: opts.flat ?? true, side: opts.tip ? THREE.DoubleSide : THREE.FrontSide });
  const sway = (opts.sway ?? (opts.tip ? 0.28 : 0.05)).toFixed(3);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = env.uTime;
    shader.uniforms.uWind = env.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        #if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor.rgb *= ${opts.tip ? '0.55 + 0.6 * position.y' : '0.66 + 0.46 * smoothstep(-0.9, 0.9, position.y)'};
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          float sw = sin(uTime * 1.4 + ph) + 0.5 * sin(uTime * 2.7 + ph * 1.7);
          float k = ${opts.tip ? 'position.y * position.y' : '(position.y + 1.0) * 0.5'};
          transformed.x += sw * ${sway} * k * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * ${sway} * 0.6 * k * uWind;
        #endif`,
      );
  };
  return m;
}
