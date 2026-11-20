import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { env } from './env';

/**
 * Low-poly human figure, about 1.8 m tall, feet at y = 0, facing +z.
 * Every vertex carries a part id (shirt, trousers, skin, hair, shoes) so one
 * geometry can be dressed per person, and a limb id so the vertex shader can
 * swing arms and legs in a walk cycle.
 */
export const PART = { shirt: 0, pants: 1, skin: 2, hair: 3, shoes: 4 } as const;
export const LIMB = { none: 0, legL: 1, legR: 2, armL: 3, armR: 4, longHair: 5 } as const;

function tag(g: THREE.BufferGeometry, part: number, limb: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  geo.deleteAttribute('uv');
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
  geo.setAttribute('aLimb', new THREE.Float32BufferAttribute(new Array(n).fill(limb), 1));
  return geo;
}

let cached: THREE.BufferGeometry | null = null;
let cachedLow: THREE.BufferGeometry | null = null;

/** Full-detail figure (named people, the player, crowd up close). `low` drops segments for distant crowds. */
export function humanoidGeometry(low = false): THREE.BufferGeometry {
  if (low && cachedLow) return cachedLow;
  if (!low && cached) return cached;
  const seg = low ? 5 : 8;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = side < 0 ? LIMB.legL : LIMB.legR;
    const arm = side < 0 ? LIMB.armL : LIMB.armR;
    // leg: thigh to ankle, slightly tapered, plus a shoe
    parts.push(tag(new THREE.CylinderGeometry(0.085, 0.105, 0.86, seg).translate(side * 0.105, 0.52, 0), PART.pants, leg));
    parts.push(tag(new THREE.BoxGeometry(0.12, 0.09, 0.26).translate(side * 0.105, 0.045, 0.04), PART.shoes, leg));
    // arm: sleeve from the shoulder, forearm, and a hand
    parts.push(tag(new THREE.CylinderGeometry(0.058, 0.05, 0.3, seg).translate(side * 0.245, 1.32, 0), PART.shirt, arm));
    parts.push(tag(new THREE.CylinderGeometry(0.046, 0.04, 0.27, seg).translate(side * 0.252, 1.04, 0.01), PART.skin, arm));
    parts.push(tag(new THREE.SphereGeometry(0.048, seg, 4).scale(0.8, 1.1, 0.6).translate(side * 0.255, 0.88, 0.015), PART.skin, arm));
  }
  // hips and torso (tapered, slightly flattened front to back), shoulders, neck
  parts.push(tag(new THREE.BoxGeometry(0.34, 0.16, 0.21).translate(0, 0.98, 0), PART.pants, LIMB.none));
  parts.push(tag(new THREE.CylinderGeometry(0.2, 0.165, 0.5, seg).scale(1, 1, 0.62).translate(0, 1.27, 0), PART.shirt, LIMB.none));
  parts.push(tag(new THREE.SphereGeometry(0.2, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.35, 0.62).translate(0, 1.51, 0), PART.shirt, LIMB.none));
  parts.push(tag(new THREE.CylinderGeometry(0.052, 0.06, 0.12, seg).translate(0, 1.6, 0), PART.skin, LIMB.none));
  // head with a nose, hair cap and an optional long-hair fall at the back
  parts.push(tag(new THREE.SphereGeometry(0.115, seg + 2, seg).scale(0.92, 1.1, 1).translate(0, 1.76, 0.005), PART.skin, LIMB.none));
  parts.push(tag(new THREE.ConeGeometry(0.018, 0.045, 4).rotateX(Math.PI / 2).translate(0, 1.75, 0.12), PART.skin, LIMB.none));
  parts.push(tag(new THREE.SphereGeometry(0.122, seg + 2, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.95, 1.05, 1.05).translate(0, 1.775, -0.012), PART.hair, LIMB.none));
  parts.push(tag(new THREE.BoxGeometry(0.2, 0.26, 0.05).translate(0, 1.64, -0.1), PART.hair, LIMB.longHair));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  if (low) cachedLow = g;
  else cached = g;
  return g;
}

const VERT_HEAD = /* glsl */ `
attribute float aPart;
attribute float aLimb;
uniform float uTime;
#ifdef USE_INSTANCING
  attribute vec3 iShirt;
  attribute vec3 iPants;
  attribute vec3 iSkin;
  attribute vec4 iHair;
  attribute vec2 iWalk;
#else
  uniform vec3 uShirt;
  uniform vec3 uPants;
  uniform vec3 uSkin;
  uniform vec4 uHair;
  uniform vec2 uWalk;
#endif
varying vec3 vPartCol;
varying float vPart;
`;

const VERT_POSE = /* glsl */ `
#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  vec3 shirtC = iShirt; vec3 pantsC = iPants; vec3 skinC = iSkin; vec4 hairC = iHair; vec2 walk = iWalk;
#else
  vec3 shirtC = uShirt; vec3 pantsC = uPants; vec3 skinC = uSkin; vec4 hairC = uHair; vec2 walk = uWalk;
#endif
// walk.x: phase offset, walk.y: stride cadence (0 standing)
float hPh = uTime * walk.y + walk.x;
float hAmp = clamp(walk.y / 7.0, 0.0, 1.0);
float hSw = sin(hPh) * 0.62 * hAmp;
float hAng = 0.0;
float hPivot = 0.0;
if (aLimb > 0.5 && aLimb < 1.5) { hAng = hSw; hPivot = 0.95; }
else if (aLimb > 1.5 && aLimb < 2.5) { hAng = -hSw; hPivot = 0.95; }
else if (aLimb > 2.5 && aLimb < 3.5) { hAng = -hSw * 0.85; hPivot = 1.46; }
else if (aLimb > 3.5 && aLimb < 4.5) { hAng = hSw * 0.85; hPivot = 1.46; }
// idle people breathe and sway a little
hAng += (1.0 - hAmp) * sin(uTime * 1.3 + walk.x) * 0.03 * step(2.5, aLimb) * step(aLimb, 4.5);
{
  float c = cos(hAng), s = sin(hAng);
  objectNormal = vec3(objectNormal.x, c * objectNormal.y - s * objectNormal.z, s * objectNormal.y + c * objectNormal.z);
}
vPart = aPart;
vPartCol = aPart < 0.5 ? shirtC : aPart < 1.5 ? pantsC : aPart < 2.5 ? skinC : aPart < 3.5 ? hairC.rgb : vec3(0.12, 0.1, 0.09);
`;

const VERT_MOVE = /* glsl */ `
#include <begin_vertex>
{
  float c = cos(hAng), s = sin(hAng);
  vec3 q = transformed - vec3(0.0, hPivot, 0.0);
  transformed = vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z) + vec3(0.0, hPivot, 0.0);
  // short hair: the long fall at the back folds away inside the head
  if (aLimb > 4.5 && hairC.w < 0.5) transformed = vec3(0.0, 1.72, -0.02);
  // a soft bob with each step
  transformed.y += abs(sin(hPh)) * 0.035 * hAmp;
}
`;

function dress(m: THREE.MeshStandardMaterial, uniforms?: Record<string, THREE.IUniform>) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = env.uTime;
    if (uniforms) Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <beginnormal_vertex>', VERT_POSE)
      .replace('#include <begin_vertex>', VERT_MOVE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPartCol;\nvarying float vPart;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vPartCol;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // cloth reads matte, skin and hair a touch glossier
        roughnessFactor = vPart > 1.5 && vPart < 3.5 ? 0.55 : 0.85;`,
      );
  };
}

/** Material for an InstancedMesh of figures dressed through instanced attributes (see `dressCrowd`). */
export function humanoidInstancedMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  dress(m);
  return m;
}

export interface Outfit {
  shirt: THREE.Color;
  pants: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  longHair: boolean;
}

/** Material for one figure; returns setters for its walk cadence. */
export function humanoidMaterial(o: Outfit): { material: THREE.MeshStandardMaterial; walk: THREE.Vector2 } {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  const walk = new THREE.Vector2(0, 0);
  dress(m, {
    uShirt: { value: o.shirt },
    uPants: { value: o.pants },
    uSkin: { value: o.skin },
    uHair: { value: new THREE.Vector4(o.hair.r, o.hair.g, o.hair.b, o.longHair ? 1 : 0) },
    uWalk: { value: walk },
  });
  return { material: m, walk };
}

export const SKIN_TONES = ['#f3d2b8', '#eac0a0', '#dba67f', '#c68863', '#a86d48', '#8d5a36', '#6b4027', '#4e2e1c'];
export const HAIR_COLORS = ['#1c1410', '#2e1e14', '#4a3020', '#6b4428', '#8a5a30', '#b88a4a', '#d8c08a', '#8a8a88', '#d0d0cc', '#3a1c14'];
export const PANTS_COLORS = ['#1e2a44', '#2a2a2e', '#3a4a6a', '#5a5040', '#4a4a50', '#6a5a44', '#2e3a2a', '#c8b898'];

/** Deterministic outfit from a seed, with an optional shirt colour (e.g. by occupation). */
export function outfitFor(seed: number, shirt?: string): Outfit {
  const r = (k: number) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const shirtC = shirt ? new THREE.Color(shirt).offsetHSL((r(1) - 0.5) * 0.04, (r(2) - 0.5) * 0.15, (r(3) - 0.5) * 0.12) : new THREE.Color().setHSL(r(1), 0.15 + r(2) * 0.45, 0.25 + r(3) * 0.4);
  return {
    shirt: shirtC,
    pants: new THREE.Color(PANTS_COLORS[Math.floor(r(4) * PANTS_COLORS.length)]),
    skin: new THREE.Color(SKIN_TONES[Math.floor(r(5) * SKIN_TONES.length)]),
    hair: new THREE.Color(HAIR_COLORS[Math.floor(r(6) * HAIR_COLORS.length)]),
    longHair: r(7) < 0.42,
  };
}
