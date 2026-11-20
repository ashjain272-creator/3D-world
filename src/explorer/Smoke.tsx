import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { env } from './env';

export interface SmokeSource {
  x: number;
  y: number;
  z: number;
  /** Plume scale: 1 for a chimney, larger for a campfire. */
  s?: number;
}

/**
 * Thin smoke plumes rising from chimneys and campfires. Each plume is a
 * handful of soft points whose whole life (rise, drift with the wind, swell
 * and fade) runs in the vertex shader, so the CPU never touches them.
 */
export function Smoke({ sources, perSource = 12 }: { sources: SmokeSource[]; perSource?: number }) {
  const geo = useMemo(() => {
    if (!sources.length) return null;
    const n = sources.length * perSource;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n * 2);
    sources.forEach((src, i) => {
      for (let k = 0; k < perSource; k++) {
        const j = i * perSource + k;
        pos.set([src.x, src.y, src.z], j * 3);
        // life offset spreads the puffs evenly along the plume; second value is the plume scale
        seed[j * 2] = k / perSource + ((i * 0.37) % 1) / perSource;
        seed[j * 2 + 1] = src.s ?? 1;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return g;
  }, [sources, perSource]);
  useEffect(() => () => geo?.dispose(), [geo]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: true,
        // shared uniforms are referenced, not cloned, so the plumes follow the clock and the sky
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: env.uTime, uWind: env.uWind, uDay: env.uDay, uSky: env.uSky, uScale: { value: 560 } },
        vertexShader: /* glsl */ `
          attribute vec2 aSeed;
          uniform float uTime;
          uniform float uWind;
          uniform float uScale;
          varying float vA;
          #include <fog_pars_vertex>
          void main() {
            float id = position.x * 0.13 + position.z * 0.07;
            float life = fract(uTime * 0.09 + aSeed.x);
            float s = aSeed.y;
            vec3 p = position;
            p.y += life * 7.0 * s;
            // wind leans the plume; a slow curl keeps it from looking straight
            p.x += life * life * 1.8 * s * (0.4 + min(uWind, 1.5)) + sin(uTime * 0.6 + life * 5.0 + id) * 0.5 * life * s;
            p.z += life * life * 0.8 * s * (0.4 + min(uWind, 1.5)) + cos(uTime * 0.5 + life * 4.0 + id) * 0.5 * life * s;
            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = clamp(uScale * (0.4 + life * 1.6) * s / -mvPosition.z, 2.0, 160.0);
            vA = smoothstep(0.0, 0.12, life) * (1.0 - life) * (1.0 - life);
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          uniform float uDay;
          uniform vec3 uSky;
          varying float vA;
          #include <fog_pars_fragment>
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float a = smoothstep(0.5, 0.0, d) * vA * 0.42;
            if (a < 0.004) discard;
            // grey smoke lit by the sky by day; a dim blue-grey at night
            vec3 col = mix(vec3(0.34, 0.36, 0.42), mix(vec3(0.4, 0.39, 0.38), uSky, 0.15), uDay);
            col *= 0.9 + 0.2 * (0.5 - c.y);
            gl_FragColor = vec4(col, a);
            #include <fog_fragment>
          }`,
      }),
    [],
  );
  if (!geo) return null;
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}
