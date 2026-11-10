import * as THREE from 'three';
import type { Planet, SpectralClass } from '../sim/types';

/**
 * Per-world sky palettes. Each planet type has its own daytime gradient
 * (thin atmospheres are dark, dusty ones amber, humid ones hazy green) and the
 * star's spectral class tints the horizon, sunlight and dusk glow.
 */
interface Palette {
  zenith: string;
  horizon: string;
  ground: string;
  dusk: string;
}

const BY_TYPE: Record<Planet['type'], Palette> = {
  terran: { zenith: '#2c66b8', horizon: '#b6d4ee', ground: '#5d6a74', dusk: '#ff8a52' },
  ocean: { zenith: '#2470c4', horizon: '#c2e2f6', ground: '#3d5a6e', dusk: '#ff9466' },
  desert: { zenith: '#5f80ae', horizon: '#efcfa2', ground: '#8a6a48', dusk: '#ff7038' },
  arctic: { zenith: '#3b77c6', horizon: '#e6f2fc', ground: '#b8c6d2', dusk: '#ffa2b4' },
  jungle: { zenith: '#3c80a0', horizon: '#cbe6cc', ground: '#3f5a40', dusk: '#ffb060' },
  volcanic: { zenith: '#3a201c', horizon: '#c06a3e', ground: '#2a1a16', dusk: '#ff5020' },
  barren: { zenith: '#04050a', horizon: '#262832', ground: '#1a1a1e', dusk: '#8a6a5a' },
  gas_giant: { zenith: '#5a4a6a', horizon: '#d8c0a0', ground: '#6a5a4a', dusk: '#ff9a60' },
  ice_giant: { zenith: '#2a6a8a', horizon: '#a8e0f0', ground: '#3a6a7a', dusk: '#8ad0ff' },
};

const STAR_TINT: Record<SpectralClass, string> = {
  O: '#9bb0ff',
  B: '#aabfff',
  A: '#d4dfff',
  F: '#fff8ee',
  G: '#fff1dc',
  K: '#ffc890',
  M: '#ff9a60',
};

export interface SkyColors {
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
}

export function skyPalette(planet: Planet, starClass: SpectralClass) {
  const p = BY_TYPE[planet.type];
  const tint = new THREE.Color(STAR_TINT[starClass]);
  const strength = starClass === 'M' || starClass === 'K' ? 0.35 : starClass === 'O' || starClass === 'B' ? 0.3 : 0.12;
  return {
    dayZenith: new THREE.Color(p.zenith).lerp(tint, strength * 0.5),
    dayHorizon: new THREE.Color(p.horizon).lerp(tint, strength),
    ground: new THREE.Color(p.ground),
    dusk: new THREE.Color(p.dusk).lerp(tint, strength * 0.6),
    sun: tint.clone(),
    nightZenith: new THREE.Color('#02040a'),
    nightHorizon: new THREE.Color('#0a1222').lerp(tint, 0.04),
  };
}

/** Blend the palette for a sun elevation (-1..1); writes into `out`. */
export function skyAt(pal: ReturnType<typeof skyPalette>, elev: number, out: SkyColors): SkyColors {
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.2);
  const dusk = Math.max(0, 1 - Math.abs(elev - 0.02) / 0.22);
  out.zenith.copy(pal.nightZenith).lerp(pal.dayZenith, day);
  out.horizon.copy(pal.nightHorizon).lerp(pal.dayHorizon, day).lerp(pal.dusk, dusk * 0.65);
  out.ground.copy(pal.ground).multiplyScalar(0.15 + day * 0.85);
  out.sun.copy(pal.sun).lerp(pal.dusk, dusk * 0.7);
  return out;
}

export const skyVertex = `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = normalize(wp.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // render at the far plane
}`;

export const skyFragment = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform float uDay;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = up >= 0.0 ? mix(uHorizon, uZenith, pow(up, 0.55)) : mix(uHorizon, uGround, pow(min(1.0, -up * 4.0), 0.6));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  // sun disc, inner glow and broad atmospheric scattering around the sun
  col += uSun * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s) * 6.0 + pow(s, 48.0) * 0.55 + pow(s, 6.0) * 0.18) * (0.25 + uDay * 0.75);
  // a faint horizon band brightens the skyline
  col += uHorizon * 0.12 * exp(-abs(up) * 18.0);
  gl_FragColor = vec4(col, 1.0);
}`;
