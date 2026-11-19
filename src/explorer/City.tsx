import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, BuildingKind, Layout, PlacedLandmark } from './layout';
import { TiledInstances } from './lod';
import { Rng } from '../sim/rng';
import { cityPalette } from './palette';
import { blobGeo, skirtGeo } from './flora';
import type { TerrainData } from './terrain';
import { BUMP_GLSL, NOISE_GLSL, detail, env, foliageMaterial, texturedMaterial } from './env';

/** Shared 0..1 night factor, driven by the sky each frame. */
export const nightUniform = { value: 0 };

/**
 * A standard material whose vertical faces show procedurally lit windows,
 * computed in world space so any instance scale gets correctly sized floors.
 */
function windowMaterial(opts: { style: 'glass' | 'timber'; floor: number; col: number; lit: [number, number, number]; density: number; glass: [number, number, number]; roughness?: number; metalness?: number; accent?: THREE.Color }) {
  const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0.2 });
  const F = opts.floor.toFixed(2);
  const C = opts.col.toFixed(2);
  const v3 = (v: [number, number, number]) => `vec3(${v.map((x) => x.toFixed(3)).join(',')})`;
  const glassBody = /* glsl */ `
    float variant = floor(bh * 3.0);
    float colW = ${C} * (variant < 0.5 ? 2.6 : variant < 1.5 ? 1.0 : 0.78);
    float base = 4.4;
    vec2 cell = vec2(hc / colW + 0.5, (hy - base) / ${F});
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    float mx = variant < 0.5 ? 0.025 : variant < 1.5 ? 0.13 : 0.2;
    float body = step(base, hy) * step(hy, topH - 1.1);
    float win = step(mx, f.x) * step(f.x, 1.0 - mx) * step(0.3, f.y) * step(f.y, 0.93) * body;
    // ground floor: plinth, tall shopfront glazing, luminous canopy line
    vec2 sc = vec2(hc / 3.6 + 0.5, hy);
    float shop = step(0.05, fract(sc.x)) * step(fract(sc.x), 0.95) * step(0.75, hy) * step(hy, 3.5);
    // occupancy is decided per apartment (groups of 2-3 windows on a floor), and each
    // building has its own character: offices go dark at night, homes light up
    float apt = eh21(vec2(floor(id.x / (2.0 + floor(bh * 2.0))), id.y) + bh * 91.0);
    float r = eh21(id + bh * 91.0);
    float residential = step(0.35, fract(bh * 13.7));
    float occ = mix(0.42, mix(0.12, 0.42, residential), uNight);
    float lit = step(1.0 - occ, apt);
    float blind = step(0.55, fract(apt * 5.3)) * step(0.5 + 0.3 * fract(apt * 9.1), f.y);
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
    vec3 tint = mix(${v3(opts.glass)}, ${v3(opts.glass)} * vec3(1.25, 1.05, 0.8), step(0.66, fract(bh * 7.7)));
    vec3 skyRef = mix(uSky * 0.55, uSky * 1.1, f.y) * (0.15 + 0.85 * uDay);
    vec3 glassCol = mix(tint, skyRef, 0.22 + 0.55 * fr);
    // wall: floor slabs, piers, parapet, plinth, soft grime towards the street
    diffuseColor.rgb *= 1.0 - 0.2 * step(f.y, 0.07) * body;
    if (variant > 1.5) diffuseColor.rgb *= 0.86 + 0.14 * step(0.5, fract(cell.x * 0.5));
    diffuseColor.rgb *= 0.9 + 0.1 * evn(vec2(hc * 0.7, hy * 0.25) + bh * 40.0);
    diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 14.0, hy));
    diffuseColor.rgb *= 1.0 - 0.25 * step(topH - 0.55, hy);
    diffuseColor.rgb *= 1.0 - 0.5 * step(hy, 0.7);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, win);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(tint * 1.3, skyRef, 0.2 + 0.4 * fr), shop);
    roughnessFactor = mix(roughnessFactor, 0.1, max(win, shop));
    // depth cues: the lintel shades the top of each pane, the sill catches light
    float lintel = smoothstep(0.93, 0.8, f.y);
    float jamb = smoothstep(mx, mx + 0.07, f.x);
    fRelief = mix(1.0, 0.5 + 0.5 * lintel * (0.75 + 0.25 * jamb), win);
    fRelief *= 1.0 + 0.22 * step(0.255, f.y) * step(f.y, 0.3) * body * step(mx, f.x) * step(f.x, 1.0 - mx);
    fRelief = mix(fRelief, 0.55 + 0.45 * smoothstep(3.5, 2.6, hy), shop);
    // interior light colour: mostly warm lamps, some cool office light, the odd flickering screen
    float kindL = fract(apt * 7.13);
    vec3 litCol = kindL < 0.62 ? vec3(1.0, 0.7, 0.42) : kindL < 0.86 ? vec3(1.0, 0.86, 0.68) : kindL < 0.95 ? vec3(0.78, 0.88, 1.0) : vec3(0.45, 0.62, 1.0) * (0.7 + 0.3 * sin(uTime * 7.0 + apt * 40.0));
    // a room is brightest near the ceiling light and falls off towards the sill
    float room = 0.45 + 0.55 * smoothstep(0.3, 0.9, f.y) * (1.0 - 0.6 * abs(f.x - 0.5));
    totalEmissiveRadiance += litCol * win * lit * (0.02 + uNight * 0.55) * room * (1.0 - 0.7 * blind) * (0.55 + 0.45 * fract(apt * 3.7));
    float open = step(0.3, eh21(vec2(floor(sc.x), bh * 13.0)));
    totalEmissiveRadiance += vec3(1.0, 0.82, 0.6) * shop * open * (0.04 + uNight * 0.5) * (0.7 + 0.3 * evn(vec2(hc * 1.3, hy * 2.0)));
    // civic accent: a light line above the shopfronts and one under the parapet
    float line = step(3.75, hy) * step(hy, 4.0) + step(topH - 1.0, hy) * step(hy, topH - 0.72) * step(20.0, topH);
    totalEmissiveRadiance += uAccent * line * (0.15 + uNight * 0.55);
  `;
  const timberBody = /* glsl */ `
    float base = 0.9;
    vec2 cell = vec2(hc / ${C} + 0.5, (hy - base) / ${F});
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    float fits = step(base, hy) * step((id.y + 1.0) * ${F} + base, topH - 0.2);
    float timbered = step(0.45, bh);
    // plaster speckle, or stone courses on masonry buildings
    float sp = evn(vec2(hc, hy) * 3.0 + bh * 50.0);
    float course = step(fract(hy / 0.55), 0.09);
    float joint = step(fract(hc / 1.15 + 0.5 * mod(floor(hy / 0.55), 2.0)), 0.07);
    diffuseColor.rgb *= mix(1.0 - 0.22 * max(course, joint), 1.0, timbered) * (0.9 + 0.14 * sp);
    // half-timber frame
    float frame = max(step(f.y, 0.06), max(step(f.x, 0.035), step(0.965, f.x))) * step(base, hy);
    float brace = step(abs(f.x - f.y * 0.9 - 0.02), 0.03) * step(f.x, 0.3) * step(0.5, eh21(id + bh));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.14, 0.1), max(frame, brace) * timbered * 0.92);
    // windows with frames, a cross bar and painted shutters
    float inX = step(0.32, f.x) * step(f.x, 0.68);
    float inY = step(0.36, f.y) * step(f.y, 0.8);
    float hasWin = step(0.22, eh21(id * 1.7 + bh * 17.0)) * fits;
    float outer = step(0.29, f.x) * step(f.x, 0.71) * step(0.33, f.y) * step(f.y, 0.83) * hasWin;
    float win = inX * inY * hasWin;
    float bar = max(step(abs(f.x - 0.5), 0.012), step(abs(f.y - 0.6), 0.014));
    float shut = (step(0.18, f.x) * step(f.x, 0.29) + step(0.71, f.x) * step(f.x, 0.82)) * step(0.34, f.y) * step(f.y, 0.82) * hasWin;
    vec3 paint = mix(vec3(0.2, 0.34, 0.42), mix(vec3(0.45, 0.2, 0.16), vec3(0.24, 0.38, 0.24), step(0.5, fract(bh * 9.1))), step(0.33, fract(bh * 5.3)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.27, 0.19), outer);
    diffuseColor.rgb = mix(diffuseColor.rgb, paint * (0.85 + 0.3 * step(0.5, fract(f.y * 14.0))), shut);
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(${v3(opts.glass)}, uSky * 0.7 * (0.15 + 0.85 * uDay), 0.2 + 0.5 * fr), win * (1.0 - bar));
    roughnessFactor = mix(roughnessFactor, 0.2, win * (1.0 - bar));
    fRelief = mix(1.0, 0.55 + 0.45 * smoothstep(0.8, 0.66, f.y), win);
    fRelief *= 1.0 + 0.2 * step(0.3, f.y) * step(f.y, 0.335) * step(0.27, f.x) * step(f.x, 0.73) * hasWin;
    // beams and shutters stand proud: light upper edge, shadow line beneath
    fRelief *= 1.0 - 0.3 * step(0.06, f.y) * step(f.y, 0.085) * timbered * step(base, hy);
    // stone footing and a dark eave line
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.37) * (0.8 + 0.3 * sp) * (1.0 - 0.3 * max(course, joint)), step(hy, base));
    diffuseColor.rgb *= 1.0 - 0.35 * step(topH - 0.3, hy);
    diffuseColor.rgb *= mix(0.9, 1.12, smoothstep(0.0, 5.0, hy));
    float r = eh21(id + bh * 91.0);
    float lit = step(1.0 - ${opts.density.toFixed(2)} * (0.15 + 0.55 * uNight), r);
    float flick = 0.88 + 0.12 * sin(uTime * (3.0 + r * 4.0) + r * 30.0) * sin(uTime * 1.7 + r * 11.0);
    totalEmissiveRadiance += ${v3(opts.lit)} * win * (1.0 - bar) * lit * (0.02 + uNight * 0.65) * flick * (0.45 + 0.55 * smoothstep(0.36, 0.8, f.y)) * (0.6 + 0.4 * fract(r * 3.7));
  `;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.uniforms.uTime = env.uTime;
    shader.uniforms.uSky = env.uSky;
    shader.uniforms.uDay = env.uDay;
    shader.uniforms.uAccent = { value: opts.accent ?? new THREE.Color(0, 0, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying vec4 vInst;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        vec4 org = vec4(0.0, 0.0, 0.0, 1.0);
        float sy = 1.0;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          org = instanceMatrix * org;
          sy = length(instanceMatrix[1].xyz);
        #endif
        wp = modelMatrix * wp;
        vWPos = wp.xyz;
        vInst = vec4((modelMatrix * org).xyz, sy);
        vec3 n = objectNormal;
        #ifdef USE_INSTANCING
          n = mat3(instanceMatrix) * n;
        #endif
        vWNorm = normalize(mat3(modelMatrix) * n);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uTime;\nuniform float uDay;\nuniform vec3 uSky;\nuniform vec3 uAccent;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying vec4 vInst;\n${NOISE_GLSL}\n${BUMP_GLSL}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float fRelief = 1.0;`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `diffuseColor.rgb *= fRelief;
        #include <lights_physical_fragment>`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float hy = vWPos.y - vInst.y;
          float topH = vInst.w;
          float bh = eh21(floor(vInst.xz * 0.37) + 3.1);
          if (abs(vWNorm.y) < 0.5) {
            float hc = abs(vWNorm.x) > 0.5 ? vWPos.z - vInst.z : vWPos.x - vInst.x;
            ${opts.style === 'glass' ? glassBody : timberBody}
          } else {
            // roofs: dark membrane with gravel speckle
            diffuseColor.rgb = diffuseColor.rgb * 0.42 * (0.85 + 0.3 * evn(vWPos.xz * 2.5));
            fRelief = 1.0;
          }
        }`,
      );
  };
  return m;
}

/** Ground surface with procedural wear: asphalt mottling, or cobbles for old towns. */
function surfaceMaterial(color: string, roughness: number, cobbles: boolean) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}\n${BUMP_GLSL}\nfloat streetH(vec2 q) { ${cobbles ? 'vec2 c = q / 0.55; c.x += 0.5 * mod(floor(c.y), 2.0); vec2 cf = fract(c) - 0.5; return (1.0 - smoothstep(0.3, 0.5, max(abs(cf.x), abs(cf.y)))) + 0.2 * evn(q * 9.0);' : 'return evn(q * 9.0) * 0.6 + evn(q * 23.0) * 0.4;'} }`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float n = efbm(vWPos.xz * 0.35) * 0.6 + evn(vWPos.xz * 6.0) * 0.25;
        diffuseColor.rgb *= 0.8 + 0.4 * n;
        float fw = max(length(fwidth(vWPos.xz)), 1e-4);
        float e = max(0.015, fw);
        vec2 sg = vec2(0.0);
        if (${detail.level >= 2 ? 'efade(fw) > 0.02' : 'false'}) {
          float sh0 = streetH(vWPos.xz);
          sg = vec2(streetH(vWPos.xz + vec2(e, 0.0)) - sh0, streetH(vWPos.xz + vec2(0.0, e)) - sh0) / e;
        }
        ${
          cobbles
            ? `vec2 c = vWPos.xz / 0.55; c.x += 0.5 * mod(floor(c.y), 2.0);
        vec2 cf = fract(c);
        float gap = max(step(cf.x, 0.1), step(cf.y, 0.12));
        diffuseColor.rgb *= (1.0 - 0.3 * gap) * (0.88 + 0.24 * eh21(floor(c)));`
            : `roughnessFactor = mix(roughnessFactor, 0.25, smoothstep(0.62, 0.75, efbm(vWPos.xz * 0.08 + 9.0)));`
        }
        normal = ebumpW(normal, sg, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), ${cobbles ? '0.035' : '0.012'} * efade(fw));
      }`,
    );
  };
  return m;
}

/** Height helper for banners (stable per building). */
function rngH(b: Building, lo: number, hi: number): number {
  return lo + (((b.tone * 3571) % 1) + 1) % 1 * (hi - lo);
}

/** Emissive sign panels: lit in their instance colour, much brighter at night. */
function signMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
        totalEmissiveRadiance += vColor.rgb * (0.25 + uNight * 1.3);
      #endif`,
    );
  };
  return m;
}

function useInstances(ref: React.RefObject<THREE.InstancedMesh>, items: { m: THREE.Matrix4; c?: THREE.Color }[]) {
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, items]);
}

function Instanced({ items, geometry, material, castShadow, receiveShadow }: { items: { m: THREE.Matrix4; c?: THREE.Color }[]; geometry: THREE.BufferGeometry; material: THREE.Material; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, items);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} key={items.length} />;
}

const q0 = new THREE.Quaternion();
function mat(x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0): THREE.Matrix4 {
  const q = rot ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot) : q0;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0);
const taperCyl = new THREE.CylinderGeometry(0.32, 0.5, 1, 12).translate(0, 0.5, 0);
const hemi = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const ball = new THREE.SphereGeometry(0.5, 16, 12);
const ico = new THREE.IcosahedronGeometry(0.5, 1);
const spireGeo = new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0);
const roofGeo = (() => {
  // gable roof prism, base 1×1, height 1
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0);
  s.lineTo(0.55, 0);
  s.lineTo(0, 1);
  s.lineTo(-0.55, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: false });
  g.translate(0, 0, -0.55);
  return g;
})();

export function City({ layout, t, quality, civColor }: { layout: Layout; t: TerrainData; quality: 'low' | 'medium' | 'high'; civColor: string }) {
  const y0 = t.flatHeight;
  const shadows = quality === 'high';
  const mats = useMemo(
    () => ({
      futuristic: windowMaterial({ style: 'glass', floor: 3.4, col: 1.7, lit: [0.85, 0.92, 1.0], density: 0.55, glass: [0.1, 0.17, 0.26], metalness: 0.12, roughness: 0.5, accent: new THREE.Color(civColor) }),
      frontier: windowMaterial({ style: 'timber', floor: 3.0, col: 3.2, lit: [1.0, 0.72, 0.38], density: 0.6, glass: [0.1, 0.11, 0.13], roughness: 0.95, metalness: 0 }),
      plain: texturedMaterial('plaster', { roughness: 0.8, metalness: 0.05 }),
      pave: texturedMaterial('paving', { color: layout.style === 'futuristic' ? '#8b939d' : layout.style === 'organic' ? '#6f7f4c' : '#a39478', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
      far: new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, emissive: new THREE.Color('#9fb4d8'), emissiveIntensity: 0.1 }),
      roof: texturedMaterial('tiles', { roughness: 0.85 }),
      dome: texturedMaterial('plaster', { roughness: 0.7, metalness: 0.02 }),
      leaf: foliageMaterial(),
      bark: texturedMaterial('bark', { color: '#7a5e4a', roughness: 1 }),
      sign: signMaterial(),
      street: surfaceMaterial(layout.style === 'futuristic' ? '#454b54' : layout.style === 'cloud' ? '#4a525e' : layout.style === 'organic' ? '#8a7a5a' : '#8f7c60', layout.style === 'futuristic' || layout.style === 'cloud' ? 0.55 : 1, layout.style === 'frontier' || layout.style === 'organic'),
      glow: new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color(civColor), emissiveIntensity: 1 }),
      warm: new THREE.MeshStandardMaterial({ color: '#2a1a0a', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 1 }),
    }),
    [civColor, layout.style],
  );
  // Building LOD: lit-window shader up close, a flat material far away, culled beyond.
  const boxLevels = useMemo(
    () => [
      { geometry: unitBox, material: layout.style === 'frontier' ? mats.frontier : mats.futuristic, maxDist: quality === 'low' ? 260 : 420, castShadow: shadows, receiveShadow: true },
      { geometry: unitBox, material: mats.far, maxDist: quality === 'low' ? 700 : 1400 },
    ],
    [layout.style, mats, quality, shadows],
  );
  const detailLevels = useMemo(
    () => ({
      box: [{ geometry: unitBox, material: mats.plain, maxDist: quality === 'low' ? 140 : 260, castShadow: shadows, receiveShadow: true }],
      round: [{ geometry: unitCyl, material: mats.plain, maxDist: quality === 'low' ? 140 : 260, castShadow: shadows }],
    }),
    [mats, quality, shadows],
  );
  useFrame(() => {
    mats.far.emissiveIntensity = 0.04 + nightUniform.value * 0.35;
    mats.glow.emissiveIntensity = 0.25 + nightUniform.value * 0.45;
    mats.warm.emissiveIntensity = 0.15 + nightUniform.value * 2.4;
  });
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const groups = useMemo(() => buildGroups(layout.buildings, y0, layout.style, civColor), [layout, y0, civColor]);
  const streetGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of layout.streets) {
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      const g = new THREE.PlaneGeometry(len + s.w * 0.5, s.w);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(dz, dx));
      g.translate((s.a[0] + s.b[0]) / 2, y0 + 0.06, (s.a[1] + s.b[1]) / 2);
      parts.push(g);
    }
    for (const p of layout.plazas) {
      const g = new THREE.CircleGeometry(p.r, 48);
      g.rotateX(-Math.PI / 2);
      g.translate(p.x, y0 + 0.08, p.z);
      parts.push(g);
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [layout, y0]);
  // Pavements either side of each street, and painted centre dashes.
  const paveGeo = useMemo(() => {
    if (layout.style === 'cloud' || layout.style === 'wild' || !layout.streets.length) return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of layout.streets) {
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const g = new THREE.PlaneGeometry(Math.hypot(dx, dz) + s.w * 0.5 + 4, s.w + (layout.style === 'organic' ? 2.4 : 5));
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(dz, dx));
      g.translate((s.a[0] + s.b[0]) / 2, y0 + 0.03, (s.a[1] + s.b[1]) / 2);
      parts.push(g);
    }
    return mergeGeometries(parts);
  }, [layout, y0]);
  const dashGeo = useMemo(() => {
    if (layout.style !== 'futuristic') return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of layout.streets) {
      if (s.w < 7) continue;
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      const ang = -Math.atan2(dz, dx);
      for (let t0 = 6; t0 < len - 6; t0 += 7) {
        const g = new THREE.PlaneGeometry(2.6, 0.2);
        g.rotateX(-Math.PI / 2);
        g.rotateY(ang);
        const k = t0 / len;
        g.translate(s.a[0] + dx * k, y0 + 0.09, s.a[1] + dz * k);
        parts.push(g);
      }
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [layout, y0]);
  // Street furniture: trees in planters, benches, bollards.
  const furniture = useMemo(() => {
    const out = {
      trunks: [] as { m: THREE.Matrix4 }[],
      leaves: [] as { m: THREE.Matrix4; c: THREE.Color; v: number }[],
      boxes: [] as { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[],
      /** Small self-lit pieces: traffic-light lamps, adverts. */
      lit: [] as { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[],
    };
    if (layout.style === 'cloud' || layout.style === 'wild') return out;
    const rng = new Rng(Math.round(layout.radius * 31) + layout.buildings.length * 7 + 3);
    const blocked = (x: number, z: number) => layout.colliders.some((c) => Math.abs(c.x - x) < c.hw + 1.4 && Math.abs(c.z - z) < (c.type === 'circle' ? c.hw : c.hd) + 1.4) || layout.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.radius + 2);
    const green = layout.style === 'futuristic' ? '#4f8f4a' : layout.style === 'organic' ? '#3f7a3a' : '#5a8a3e';
    for (const s of layout.streets) {
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz);
      if (len < 24) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const ang = -Math.atan2(dz, dx);
      const off = s.w / 2 + (layout.style === 'organic' ? 0.9 : 1.7);
      let side = rng.chance(0.5) ? 1 : -1;
      for (let d = 9 + rng.range(0, 6); d < len - 8; d += layout.style === 'frontier' ? 26 : 15) {
        side = -side;
        const x = s.a[0] + (dx / len) * d + nx * off * side;
        const z = s.a[1] + (dz / len) * d + nz * off * side;
        if (blocked(x, z)) continue;
        const roll = rng.next();
        if (roll < 0.62) {
          // five street-tree species with their own silhouettes and hues; a few in blossom or autumn colour
          const species = Math.floor(rng.next() * 5);
          const base = new THREE.Color(green).offsetHSL([0, -0.04, 0.05, -0.02, 0.03][species], [0, 0.08, -0.06, -0.1, 0.04][species], [0, 0.05, -0.08, -0.02, 0.02][species]);
          const accentRoll = rng.next();
          if (accentRoll < 0.07) base.set('#e8a6bc');
          else if (accentRoll < 0.11) base.set('#f2ece0');
          else if (accentRoll < 0.15) base.set(rng.pick(['#c4823a', '#b8502e', '#d4a840']));
          const leafC = () => base.clone().offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.06, 0.06), rng.range(-0.06, 0.05));
          const lv = () => Math.floor(rng.next() * 4);
          const ry = rng.range(0, 6.28);
          const h = species === 1 ? rng.range(2.2, 3) : species === 3 ? rng.range(4, 5.2) : rng.range(2.8, 4.2);
          out.trunks.push({ m: mat(x, y0, z, species === 1 ? 0.4 : 0.55, h + (species === 2 ? 0 : 1), species === 1 ? 0.4 : 0.55, ry) });
          if (species === 0) {
            // round, layered crown
            const n = 3 + Math.floor(rng.next() * 3);
            for (let k = 0; k < n; k++) {
              const a = ry + (k / n) * 6.28;
              const rr = k === 0 ? 0 : rng.range(0.8, 1.3);
              const sz = k === 0 ? rng.range(1.6, 2) : rng.range(1, 1.35);
              out.leaves.push({ m: mat(x + Math.cos(a) * rr, y0 + h + 1.2 + (k ? rng.range(-0.5, 0.8) : 0), z + Math.sin(a) * rr, sz, sz * 0.85, sz, rng.range(0, 6)), c: leafC(), v: lv() });
            }
          } else if (species === 1) {
            // columnar
            out.leaves.push({ m: mat(x, y0 + h + 2.4, z, 1.05, 3, 1.05, ry), c: leafC(), v: lv() });
            out.leaves.push({ m: mat(x + 0.2, y0 + h + 0.9, z, 0.95, 1.5, 0.95, ry + 1), c: leafC(), v: lv() });
          } else if (species === 2) {
            // ornamental cone
            out.leaves.push({ m: mat(x, y0 + h + 1.6, z, 1.6, 3.6, 1.6, ry), c: leafC(), v: 4 });
            out.leaves.push({ m: mat(x, y0 + h + 3.2, z, 1.1, 2.4, 1.1, ry + 0.7), c: leafC(), v: 4 });
          } else if (species === 3) {
            // umbrella: wide, flat, high crown
            for (let k = 0; k < 3; k++) {
              const a = ry + k * 2.1;
              out.leaves.push({ m: mat(x + Math.cos(a) * 1.1, y0 + h + 0.8 + rng.range(-0.2, 0.3), z + Math.sin(a) * 1.1, 1.8, 0.75, 1.6, a), c: leafC(), v: lv() });
            }
          } else {
            // loose, multi-lobed
            for (let k = 0; k < 4; k++) {
              const a = rng.range(0, 6.28);
              out.leaves.push({ m: mat(x + Math.cos(a) * rng.range(0.4, 1.4), y0 + h + rng.range(0.6, 2.2), z + Math.sin(a) * rng.range(0.4, 1.4), rng.range(0.8, 1.3), rng.range(0.7, 1.1), rng.range(0.8, 1.3), rng.range(0, 6)), c: leafC(), v: lv() });
            }
          }
          if (layout.style === 'futuristic') out.boxes.push({ m: mat(x, y0, z, 1.9, 0.45, 1.9), c: new THREE.Color('#aab2bc'), x, z });
        } else if (roll < 0.82) {
          // bench: seat, back and two legs
          const wood = new THREE.Color(layout.style === 'futuristic' ? '#c8d0d8' : '#7a5a3c');
          const bx = x - nx * side * 0.5;
          const bz = z - nz * side * 0.5;
          out.boxes.push({ m: mat(bx, y0 + 0.42, bz, 2, 0.1, 0.55, ang), c: wood, x: bx, z: bz });
          out.boxes.push({ m: mat(bx + nx * side * 0.28, y0 + 0.5, bz + nz * side * 0.28, 2, 0.5, 0.08, ang), c: wood, x: bx, z: bz });
          out.boxes.push({ m: mat(bx, y0, bz, 1.7, 0.42, 0.12, ang), c: new THREE.Color('#3a4048'), x: bx, z: bz });
        } else if (layout.style === 'futuristic') {
          out.boxes.push({ m: mat(x - nx * side * 1.2, y0, z - nz * side * 1.2, 0.28, 0.9, 0.28), c: new THREE.Color('#d4dbe4'), x, z });
        } else {
          // planter tub with a shrub
          out.boxes.push({ m: mat(x, y0, z, 1.1, 0.7, 1.1, rng.range(0, 1)), c: new THREE.Color('#8a6a44'), x, z });
          out.leaves.push({ m: mat(x, y0 + 1.15, z, 0.78, 0.62, 0.78), c: new THREE.Color(green).offsetHSL(0, 0, rng.range(-0.05, 0.08)), v: Math.floor(rng.next() * 4) });
        }
      }
    }
    // ── intersections: zebra crossings, traffic lights, manholes; along kerbs: bins, hydrants, bus shelters
    if (layout.style === 'futuristic' || layout.style === 'frontier') {
      const B = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, rot = 0, lit = false) => (lit ? out.lit : out.boxes).push({ m: mat(x, y, z, sx, sy, sz, rot), c: new THREE.Color(c), x, z });
      layout.graph.nodes.forEach(([nxp, nzp], ni) => {
        const deg = layout.graph.adj[ni]?.length ?? 0;
        if (deg < 3) return;
        const futur = layout.style === 'futuristic';
        for (const nb of layout.graph.adj[ni]) {
          const [bx, bz] = layout.graph.nodes[nb];
          const dl = Math.hypot(bx - nxp, bz - nzp) || 1;
          const ux = (bx - nxp) / dl;
          const uz = (bz - nzp) / dl;
          const ang = Math.atan2(ux, uz);
          const st = layout.streets.find((s) => (s.a[0] === nxp && s.a[1] === nzp && s.b[0] === bx && s.b[1] === bz) || (s.b[0] === nxp && s.b[1] === nzp && s.a[0] === bx && s.a[1] === bz));
          const w = st?.w ?? 8;
          if (futur) {
            // zebra stripes across the road, a little way out from the junction
            const cx = nxp + ux * (w / 2 + 2.2);
            const cz = nzp + uz * (w / 2 + 2.2);
            for (let k = -Math.floor(w / 1.4) / 2; k <= Math.floor(w / 1.4) / 2; k++) B(cx - uz * k * 1.2, y0 + 0.07, cz + ux * k * 1.2, 0.55, 0.02, 3, '#e8ecf0', ang);
          }
          // a traffic light on the right-hand corner facing this approach
          if (rng.chance(futur ? 0.8 : 0.35)) {
            const px = nxp + ux * (w / 2 + 3.5) + uz * (w / 2 + 1.2);
            const pz = nzp + uz * (w / 2 + 3.5) - ux * (w / 2 + 1.2);
            B(px, y0, pz, 0.16, futur ? 4.4 : 3.2, 0.16, futur ? '#3a3e44' : '#2a2a2a');
            B(px, y0 + (futur ? 3.4 : 2.3), pz, 0.38, 1.1, 0.32, '#1a1c1e', ang);
            const state = rng.next();
            B(px - ux * 0.17, y0 + (futur ? 4.25 : 3.15), pz - uz * 0.17, 0.24, 0.24, 0.06, state < 0.45 ? '#ff2a20' : '#3a1210', ang, true);
            B(px - ux * 0.17, y0 + (futur ? 3.95 : 2.85), pz - uz * 0.17, 0.24, 0.24, 0.06, state >= 0.45 && state < 0.55 ? '#ffb020' : '#3a2a10', ang, true);
            B(px - ux * 0.17, y0 + (futur ? 3.65 : 2.55), pz - uz * 0.17, 0.24, 0.24, 0.06, state >= 0.55 ? '#20e070' : '#103a1e', ang, true);
          }
        }
        // manhole cover in the junction
        if (futur && rng.chance(0.6)) B(nxp + rng.range(-2, 2), y0 + 0.075, nzp + rng.range(-2, 2), 0.9, 0.02, 0.9, '#2a2c30', rng.range(0, 1));
      });
      for (const s of layout.streets) {
        const dx = s.b[0] - s.a[0];
        const dz = s.b[1] - s.a[1];
        const len = Math.hypot(dx, dz);
        if (len < 20) continue;
        const nx = -dz / len;
        const nz = dx / len;
        const ang = Math.atan2(dx, dz);
        for (const side of [1, -1]) {
          const off = s.w / 2 + 0.9;
          const at = (k: number) => [s.a[0] + (dx / len) * len * k + nx * off * side, s.a[1] + (dz / len) * len * k + nz * off * side] as const;
          if (rng.chance(0.5)) {
            const [x, z] = at(rng.range(0.25, 0.4));
            if (!blocked(x, z)) B(x, y0, z, 0.55, 0.95, 0.55, layout.style === 'futuristic' ? '#2f4a3a' : '#5a4632');
          }
          if (rng.chance(0.3)) {
            const [x, z] = at(rng.range(0.6, 0.75));
            if (!blocked(x, z)) {
              B(x, y0, z, 0.32, 0.75, 0.32, '#c8281e');
              B(x, y0 + 0.75, z, 0.4, 0.12, 0.4, '#a81e16');
            }
          }
          if (layout.style === 'futuristic' && s.w >= 10 && rng.chance(0.4)) {
            // bus shelter: back panel, roof, bench and a lit advert
            const [x, z] = at(0.5);
            const bx = x + nx * side * 1.4;
            const bz = z + nz * side * 1.4;
            if (!blocked(bx, bz)) {
              B(bx + nx * side * 0.7, y0, bz + nz * side * 0.7, 3.6, 2.5, 0.08, '#9ab4c4', ang + Math.PI / 2);
              B(bx, y0 + 2.5, bz, 4, 0.12, 1.8, '#d4dbe4', ang + Math.PI / 2);
              B(bx + nx * side * 0.4, y0 + 0.45, bz + nz * side * 0.4, 3, 0.08, 0.5, '#5a6068', ang + Math.PI / 2);
              B(bx + (dx / len) * 1.9, y0 + 0.4, bz + (dz / len) * 1.9, 1.2, 1.9, 0.12, '#e8f0ff', ang, true);
            }
          }
        }
      }
    }
    return out;
  }, [layout, y0]);
  const leafSets = useMemo(() => [0, 1, 2, 3, 4].map((v) => furniture.leaves.filter((l) => l.v === v)), [furniture]);
  const furnitureLevels = useMemo(() => [{ geometry: unitBox, material: mats.plain, maxDist: 170, castShadow: shadows, receiveShadow: true }], [mats, shadows]);
  const lineGeo = useMemo(() => {
    if (layout.style !== 'futuristic') return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of layout.streets) {
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      for (const off of [-s.w / 2 + 0.4, s.w / 2 - 0.4]) {
        const g = new THREE.PlaneGeometry(Math.hypot(dx, dz), 0.12);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 0, off);
        g.rotateY(-Math.atan2(dz, dx));
        g.translate((s.a[0] + s.b[0]) / 2, y0 + 0.1, (s.a[1] + s.b[1]) / 2);
        parts.push(g);
      }
    }
    return parts.length ? mergeGeometries(parts) : null;
  }, [layout, y0]);
  useEffect(() => () => {
    streetGeo?.dispose();
    lineGeo?.dispose();
    paveGeo?.dispose();
    dashGeo?.dispose();
  }, [streetGeo, lineGeo, paveGeo, dashGeo]);

  const lamps = useMemo(() => {
    const poles = layout.lights.map(([x, z]) => ({ m: mat(x + 3, y0, z + 3, 0.18, layout.style === 'futuristic' ? 7 : 4.5, 0.18) }));
    const bulbs = layout.lights.map(([x, z]) => ({ m: mat(x + 3, y0 + (layout.style === 'futuristic' ? 7.2 : 4.7), z + 3, 0.7, 0.7, 0.7) }));
    return { poles, bulbs };
  }, [layout, y0]);


  return (
    <group>
      {paveGeo && (
        <mesh geometry={paveGeo} receiveShadow material={mats.pave} />
      )}
      {streetGeo && (
        <mesh geometry={streetGeo} receiveShadow material={mats.street}>
        </mesh>
      )}
      {dashGeo && (
        <mesh geometry={dashGeo}>
          <meshStandardMaterial color="#d9dee4" roughness={0.8} polygonOffset polygonOffsetFactor={-4} />
        </mesh>
      )}
      <Instanced items={furniture.trunks} geometry={taperCyl} material={mats.bark} castShadow={shadows} />
      {leafSets.map((items, v) => (
        <Instanced key={v} items={items} geometry={v === 4 ? skirtGeo(v) : blobGeo(v, 1)} material={mats.leaf} castShadow={shadows} />
      ))}
      <LightPools lights={layout.lights} y={y0} style={layout.style} />
      <Instanced items={groups.signs} geometry={unitBox} material={mats.sign} />
      {layout.style === 'futuristic' && <SkyTraffic streets={layout.streets} y={y0} quality={quality} civColor={civColor} />}
      <ContactShadows buildings={layout.buildings} y={y0} />
      <TiledInstances items={furniture.boxes} levels={furnitureLevels} tileSize={90} name="furniture" />
      <Instanced items={furniture.lit} geometry={unitBox} material={mats.sign} />
      {lineGeo && <mesh geometry={lineGeo} material={mats.glow} />}
      {/* Futuristic */}
      <TiledInstances items={groups.box} levels={boxLevels} tileSize={90} name="buildings" />
      <Instanced items={groups.caps} geometry={unitBox} material={mats.glow} />
      <Instanced items={groups.antenna} geometry={unitCyl} material={mats.plain} />
      <Instanced items={groups.glowBits} geometry={unitBox} material={mats.glow} />
      <TiledInstances items={groups.details} levels={detailLevels.box} tileSize={90} name="details" />
      <TiledInstances items={groups.rounds} levels={detailLevels.round} tileSize={90} name="rounds" />
      {/* Frontier */}
      <Instanced items={groups.roofs} geometry={roofGeo} material={mats.roof} castShadow={shadows} />
      <Instanced items={groups.towers} geometry={taperCyl} material={mats.plain} castShadow={shadows} />
      <Instanced items={groups.silos} geometry={unitCyl} material={mats.plain} castShadow={shadows} />
      <Instanced items={groups.siloCaps} geometry={hemi} material={mats.roof} />
      {groups.windmills.map((w, i) => (
        <WindmillBlades key={i} x={w[0]} y={w[1]} z={w[2]} rot={w[3]} />
      ))}
      {/* Organic */}
      <Instanced items={groups.domes} geometry={hemi} material={mats.dome} castShadow={shadows} receiveShadow />
      <Instanced items={groups.spires} geometry={spireGeo} material={mats.plain} castShadow={shadows} />
      <Instanced items={groups.trunks} geometry={taperCyl} material={mats.bark} castShadow={shadows} />
      <Instanced items={groups.platforms} geometry={unitCyl} material={mats.plain} castShadow={shadows} />
      <Instanced items={groups.canopies} geometry={ico} material={mats.leaf} castShadow={shadows} />
      <Instanced items={groups.pods} geometry={ball} material={mats.dome} castShadow={shadows} />
      <Instanced items={groups.lanterns} geometry={ball} material={mats.warm} />
      {/* Street lights */}
      <Instanced items={lamps.poles} geometry={unitCyl} material={mats.plain} />
      <Instanced items={lamps.bulbs} geometry={ball} material={layout.style === 'futuristic' ? mats.glow : mats.warm} />
      {layout.landmarks.map((l) => (
        <LandmarkModel key={l.id} l={l} y={t.height(l.x, l.z)} style={layout.style} civColor={civColor} shadows={shadows} />
      ))}
    </group>
  );
}

function buildGroups(buildings: Building[], y0: number, style: Layout['style'], civColor: string) {
  const pal = cityPalette(civColor, style);
  const g = {
    box: [] as { m: THREE.Matrix4; c?: THREE.Color; x: number; z: number }[],
    caps: [] as { m: THREE.Matrix4 }[],
    antenna: [] as { m: THREE.Matrix4 }[],
    roofs: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    towers: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    silos: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    siloCaps: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    windmills: [] as [number, number, number, number][],
    domes: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    trunks: [] as { m: THREE.Matrix4 }[],
    platforms: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    canopies: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    pods: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    lanterns: [] as { m: THREE.Matrix4 }[],
    spires: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
    /** Small coloured boxes: rooftop plant, cornices, doors, canopies, chimneys, crates. */
    details: [] as { m: THREE.Matrix4; c?: THREE.Color; x: number; z: number }[],
    /** Small cylinders: water tanks, vents, dome plinths. */
    rounds: [] as { m: THREE.Matrix4; c?: THREE.Color; x: number; z: number }[],
    glowBits: [] as { m: THREE.Matrix4 }[],
    signs: [] as { m: THREE.Matrix4; c: THREE.Color }[],
  };
  const det = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, rot = 0) => g.details.push({ m: mat(x, y, z, sx, sy, sz, rot), c: new THREE.Color(c), x, z });
  const rnd = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) => g.rounds.push({ m: mat(x, y, z, sx, sy, sz), c: new THREE.Color(c), x, z });
  /** Point on the facade nearest the building's door, and that facade's outward axis. */
  const front = (b: Building, w: number, d: number) => {
    const dx = b.door[0] - b.x;
    const dz = b.door[1] - b.z;
    const alongX = Math.abs(dx) > Math.abs(dz);
    const sx = alongX ? Math.sign(dx) || 1 : 0;
    const sz = alongX ? 0 : Math.sign(dz) || 1;
    return { x: b.x + (sx * w) / 2, z: b.z + (sz * d) / 2, sx, sz, alongX };
  };
  const futTones = pal.walls;
  const stone = style === 'frontier' ? pal.walls : pal.stone;
  const roofs = pal.roofs;
  const domeTones = pal.domes;
  const accent = (k: number) => pal.accents[Math.floor(k * pal.accents.length) % pal.accents.length];
  for (const b of buildings) {
    const kind: BuildingKind = b.kind;
    const tone = (arr: string[]) => new THREE.Color(arr[Math.floor(b.tone * arr.length) % arr.length]);
    switch (kind) {
      case 'tower':
      case 'block':
      case 'slab': {
        const col = tone(futTones);
        const u = (k: number) => (((b.tone * 9973 + k * 137.7) % 1) + 1) % 1; // stable per-building variation
        let roofY = y0 + b.h;
        let rw = b.w;
        let rd = b.d;
        if (b.kind === 'tower') {
          // stepped silhouette: podium, shaft, one or two set-backs, crown
          const h1 = b.h * (b.h > 60 ? 0.62 : 0.74);
          g.box.push({ m: mat(b.x, y0, b.z, b.w, h1, b.d), c: col, x: b.x, z: b.z });
          g.box.push({ m: mat(b.x, y0, b.z, b.w * 1.12, 7.5, b.d * 1.12), c: col.clone().multiplyScalar(0.82), x: b.x, z: b.z });
          const h2 = b.h > 60 ? b.h * 0.24 : b.h - h1;
          g.box.push({ m: mat(b.x, y0 + h1, b.z, b.w * 0.78, h2, b.d * 0.78), c: col, x: b.x, z: b.z });
          rw = b.w * 0.78;
          rd = b.d * 0.78;
          if (b.h > 60) {
            g.box.push({ m: mat(b.x, y0 + h1 + h2, b.z, b.w * 0.52, b.h - h1 - h2, b.d * 0.52), c: col, x: b.x, z: b.z });
            rw = b.w * 0.52;
            rd = b.d * 0.52;
          }
          g.caps.push({ m: mat(b.x, roofY, b.z, rw * 0.8, 0.5, rd * 0.8) });
          if (b.h > 80) {
            g.antenna.push({ m: mat(b.x, roofY, b.z, 0.5, 14, 0.5) });
            g.glowBits.push({ m: mat(b.x, roofY + 14, b.z, 0.9, 0.9, 0.9) });
          }
        } else {
          g.box.push({ m: mat(b.x, y0, b.z, b.w, b.h, b.d), c: col, x: b.x, z: b.z });
          if (b.kind === 'slab') {
            g.box.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 0.6, b.h * 0.35, b.d * 0.6), c: col, x: b.x, z: b.z });
            roofY = y0 + b.h * 1.35;
            rw = b.w * 0.6;
            rd = b.d * 0.6;
          }
          // cornice
          det(b.x, y0 + b.h - 0.35, b.z, b.w + 0.5, 0.45, b.d + 0.5, pal.trim);
        }
        // rooftop plant: units, a tank or a vent stack
        const units = b.kind === 'tower' ? 1 : 2 + Math.floor(u(1) * 2);
        for (let k = 0; k < units; k++) {
          const ux = b.x + (u(k + 2) - 0.5) * rw * 0.55;
          const uz = b.z + (u(k + 5) - 0.5) * rd * 0.55;
          if (u(k + 8) < 0.3) rnd(ux, roofY, uz, 2.2, 2.6, 2.2, '#8d949c');
          else det(ux, roofY, uz, 2 + u(k + 3) * 2.5, 1.2 + u(k + 4) * 1.4, 1.8 + u(k + 6) * 2, u(k) < 0.5 ? '#767e88' : '#9aa1a9');
        }
        // striped retail awnings in accent colours on the two street faces
        if (b.kind !== 'tower' || u(11) < 0.5) {
          for (const side of [-1, 1]) {
            if (u(12 + side) < 0.45) continue;
            const ax = u(14) < 0.5;
            const len = (ax ? b.w : b.d) * 0.7;
            const ox = ax ? 0 : (side * b.w) / 2 + side * 0.9;
            const oz = ax ? (side * b.d) / 2 + side * 0.9 : 0;
            det(b.x + ox, y0 + 3.15, b.z + oz, ax ? len : 1.8, 0.14, ax ? 1.8 : len, accent(u(15 + side)));
          }
        }
        // shop signs and vertical banners in accent colours, glowing after dark
        if (u(21) < 0.7) {
          const sx = u(22) < 0.5;
          const side = u(23) < 0.5 ? -1 : 1;
          const fx = sx ? b.x + (u(24) - 0.5) * b.w * 0.5 : b.x + (side * b.w) / 2 + side * 0.12;
          const fz = sx ? b.z + (side * b.d) / 2 + side * 0.12 : b.z + (u(24) - 0.5) * b.d * 0.5;
          g.signs.push({ m: mat(fx, y0 + 4.4, fz, sx ? 3.4 : 0.15, 0.9, sx ? 0.15 : 3.4), c: new THREE.Color(accent(u(25))) });
          if (b.h > 20 && u(26) < 0.6) g.signs.push({ m: mat(fx + (sx ? b.w * 0.3 : side * 0.6), y0 + 7, fz + (sx ? side * 0.6 : b.d * 0.3), sx ? 0.9 : 0.2, rngH(b, 6, 12), sx ? 0.2 : 0.9), c: new THREE.Color(accent(u(27))) });
        }
        // entrance: recessed doors under a lit canopy
        const fr = front(b, b.kind === 'tower' ? b.w * 1.12 : b.w, b.kind === 'tower' ? b.d * 1.12 : b.d);
        det(fr.x + fr.sx * 0.05, y0, fr.z + fr.sz * 0.05, fr.alongX ? 0.2 : 3.2, 3.1, fr.alongX ? 3.2 : 0.2, '#11161d');
        // shallow canopy, high enough that the follow camera passes beneath it
        det(fr.x + fr.sx * 0.7, y0 + 4.05, fr.z + fr.sz * 0.7, fr.alongX ? 1.4 : 5, 0.2, fr.alongX ? 5 : 1.4, '#c9d2dc');
        g.glowBits.push({ m: mat(fr.x + fr.sx * 0.7, y0 + 3.95, fr.z + fr.sz * 0.7, fr.alongX ? 1.1 : 4.4, 0.08, fr.alongX ? 4.4 : 1.1) });
        break;
      }
      case 'house':
      case 'hall': {
        const w = b.rot ? b.d : b.w;
        const d = b.rot ? b.w : b.d;
        g.box.push({ m: mat(b.x, y0, b.z, w, b.h, d), c: tone(stone), x: b.x, z: b.z });
        g.roofs.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 1.08, b.h * 0.55, b.d, b.rot), c: tone(roofs) });
        // chimney, door with lintel and step, and a few crates by the wall
        const u = (k: number) => (((b.tone * 9973 + k * 137.7) % 1) + 1) % 1;
        det(b.x + (u(1) - 0.5) * w * 0.5, y0 + b.h, b.z + (u(2) - 0.5) * d * 0.4, 0.9, b.h * 0.55 + 0.9, 0.9, '#6a4a3c');
        const fr = front(b, w, d);
        det(fr.x + fr.sx * 0.06, y0, fr.z + fr.sz * 0.06, fr.alongX ? 0.18 : 1.3, 2.2, fr.alongX ? 1.3 : 0.18, u(7) < 0.55 ? accent(u(8)) : '#4a3222');
        if (u(9) < 0.6) {
          // flower box under a front window
          const off = 2.2;
          const bx = fr.x + fr.sx * 0.35 + (fr.alongX ? 0 : off);
          const bz = fr.z + fr.sz * 0.35 + (fr.alongX ? off : 0);
          det(bx, y0 + 1.25, bz, fr.alongX ? 0.4 : 1.4, 0.3, fr.alongX ? 1.4 : 0.4, '#6e4a2e');
          rnd(bx, y0 + 1.5, bz, fr.alongX ? 0.45 : 1.3, 0.3, fr.alongX ? 1.3 : 0.45, accent(u(10)));
        }
        det(fr.x + fr.sx * 0.12, y0 + 2.2, fr.z + fr.sz * 0.12, fr.alongX ? 0.3 : 1.8, 0.22, fr.alongX ? 1.8 : 0.3, '#2e2018');
        det(fr.x + fr.sx * 0.5, y0, fr.z + fr.sz * 0.5, fr.alongX ? 1 : 1.9, 0.18, fr.alongX ? 1.9 : 1, '#8a8478');
        if (b.kind === 'hall') det(fr.x + fr.sx * 0.7, y0 + 2.9, fr.z + fr.sz * 0.7, fr.alongX ? 1.4 : w * 0.7, 0.16, fr.alongX ? d * 0.7 : 1.4, '#7a4a32');
        // picket fence around the yard, a barrel by the wall, and on farms a haystack or cart
        if (u(30) < 0.55) {
          const fw = w + 6;
          const fd = d + 6;
          const posts = Math.round((fw + fd) / 1.6);
          for (let k = 0; k < posts; k++) {
            const tt = (k / posts) * 2 * (fw + fd);
            let px: number, pz: number;
            if (tt < fw) [px, pz] = [b.x - fw / 2 + tt, b.z - fd / 2];
            else if (tt < fw + fd) [px, pz] = [b.x + fw / 2, b.z - fd / 2 + (tt - fw)];
            else if (tt < 2 * fw + fd) [px, pz] = [b.x + fw / 2 - (tt - fw - fd), b.z + fd / 2];
            else [px, pz] = [b.x - fw / 2, b.z + fd / 2 - (tt - 2 * fw - fd)];
            // leave a gap in front of the door
            if (Math.hypot(px - fr.x - fr.sx * 3, pz - fr.z - fr.sz * 3) < 2) continue;
            det(px, y0, pz, 0.14, 1.05, 0.14, '#d8d0c0');
          }
          det(b.x, y0 + 0.75, b.z - fd / 2, fw, 0.1, 0.06, '#d0c8b8');
          det(b.x, y0 + 0.75, b.z + fd / 2, fw, 0.1, 0.06, '#d0c8b8');
          det(b.x - fw / 2, y0 + 0.75, b.z, 0.06, 0.1, fd, '#d0c8b8');
          det(b.x + fw / 2, y0 + 0.75, b.z, 0.06, 0.1, fd, '#d0c8b8');
        }
        rnd(fr.x + fr.sx * 0.6 + (fr.alongX ? 0 : -1.8), y0, fr.z + fr.sz * 0.6 + (fr.alongX ? -1.8 : 0), 0.8, 1.1, 0.8, '#6a4a2e');
        if (b.kind === 'hall' && u(31) < 0.6) {
          g.domes.push({ m: mat(b.x + w * 0.5 + 3, y0, b.z + d * 0.3, 3.4, 3.2, 3.4), c: new THREE.Color('#c8a850').offsetHSL(0, 0, (u(32) - 0.5) * 0.1) });
          g.domes.push({ m: mat(b.x + w * 0.5 + 5.5, y0, b.z - d * 0.1, 2.6, 2.4, 2.6), c: new THREE.Color('#bc9a44') });
        }
        if (u(33) < 0.3) {
          // a cart: bed, shafts and two wheels
          const cx = fr.x + fr.sx * 4 + (fr.alongX ? 0 : 3.5);
          const cz = fr.z + fr.sz * 4 + (fr.alongX ? 3.5 : 0);
          const ry = fr.alongX ? 0 : Math.PI / 2;
          det(cx, y0 + 0.75, cz, 2.6, 0.5, 1.5, '#8a6440', ry);
          det(cx + (fr.alongX ? 0 : 1.8), y0 + 0.65, cz + (fr.alongX ? 1.8 : 0), fr.alongX ? 1.2 : 1.6, 0.08, fr.alongX ? 1.6 : 1.2, '#6a4a2e', ry);
          for (const sgn of [-1, 1]) {
            const wx = cx + (fr.alongX ? sgn * 0.85 : 0);
            const wz = cz + (fr.alongX ? 0 : sgn * 0.85);
            const wm = new THREE.Matrix4().compose(new THREE.Vector3(wx, y0 + 0.6, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler(fr.alongX ? 0 : Math.PI / 2, 0, fr.alongX ? Math.PI / 2 : 0)), new THREE.Vector3(1.2, 0.14, 1.2));
            wm.multiply(new THREE.Matrix4().makeTranslation(0, -0.5, 0));
            g.rounds.push({ m: wm, c: new THREE.Color('#4a3420'), x: wx, z: wz });
          }
        }
        if (u(3) > 0.45) {
          const cx = fr.x + fr.sx * 0.8 + (fr.alongX ? 0 : 2.2);
          const cz = fr.z + fr.sz * 0.8 + (fr.alongX ? 2.2 : 0);
          det(cx, y0, cz, 0.9, 0.9, 0.9, '#8a6a44', u(4));
          if (u(5) > 0.5) det(cx + 0.2, y0 + 0.9, cz - 0.1, 0.7, 0.7, 0.7, '#9a7a50', u(6) * 2);
          else rnd(cx + (fr.alongX ? 0 : 1.1), y0, cz + (fr.alongX ? 1.1 : 0), 0.8, 1.1, 0.8, '#6e5236');
        }
        break;
      }
      case 'windmill':
        g.towers.push({ m: mat(b.x, y0, b.z, 5, b.h, 5), c: tone(stone) });
        g.windmills.push([b.x, y0 + b.h - 1.5, b.z, b.rot]);
        break;
      case 'silo':
        g.silos.push({ m: mat(b.x, y0, b.z, b.w * 0.8, b.h, b.w * 0.8), c: tone(stone) });
        g.siloCaps.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 0.8, b.w * 0.6, b.w * 0.8), c: tone(roofs) });
        break;
      case 'dome': {
        const U = (k: number) => (((b.tone * 7919 + k * 101.3 + b.x * 0.013) % 1) + 1) % 1;
        const col = tone(domeTones).offsetHSL((U(1) - 0.5) * 0.04, (U(2) - 0.5) * 0.1, (U(3) - 0.5) * 0.08);
        const trimC = U(4) < 0.5 ? accent(U(5)) : '#8a7a62';
        const r0 = b.w / 2;
        const variant = Math.floor(U(6) * 6);
        let top = y0 + b.h;
        rnd(b.x, y0, b.z, b.w * 1.06, 0.5, b.w * 1.06, '#9c9484');
        if (variant === 0) {
          // classic low dome with a painted band
          g.domes.push({ m: mat(b.x, y0, b.z, b.w, b.h * 2, b.w), c: col });
          rnd(b.x, y0 + 0.5, b.z, b.w * 1.01, 0.35, b.w * 1.01, trimC);
        } else if (variant === 1) {
          // tall beehive
          g.domes.push({ m: mat(b.x, y0, b.z, b.w * 0.9, b.h * 3.2, b.w * 0.9), c: col });
          top = y0 + b.h * 1.6;
        } else if (variant === 2 || variant === 3) {
          // drum walls with a ring of windows, dome on top; variant 3 adds a spire
          const dh = b.h * 0.75;
          rnd(b.x, y0, b.z, b.w, dh, b.w, `#${col.clone().offsetHSL(0, -0.05, -0.06).getHexString()}`);
          rnd(b.x, y0 + dh - 0.25, b.z, b.w * 1.05, 0.3, b.w * 1.05, trimC);
          g.domes.push({ m: mat(b.x, y0 + dh, b.z, b.w * 0.98, b.h * 1.5, b.w * 0.98), c: col });
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + U(7);
            det(b.x + Math.cos(a) * r0 * 0.99, y0 + dh * 0.45, b.z + Math.sin(a) * r0 * 0.99, 0.12, 1.1, 0.8, '#2a2a30', -a);
            g.lanterns.push({ m: mat(b.x + Math.cos(a) * r0 * 0.96, y0 + dh * 0.45 + 0.5, b.z + Math.sin(a) * r0 * 0.96, 0.25, 0.4, 0.25) });
          }
          top = y0 + dh + b.h * 0.75;
          if (variant === 3) g.spires.push({ m: mat(b.x, top - 0.2, b.z, 1.1, 2.6, 1.1), c: new THREE.Color(U(8) < 0.5 ? '#d8a844' : accent(U(9))) });
        } else if (variant === 4) {
          // cluster: a main dome with one or two smaller rooms grown onto it
          g.domes.push({ m: mat(b.x, y0, b.z, b.w, b.h * 2, b.w), c: col });
          const n = 1 + Math.floor(U(10) * 2);
          for (let k = 0; k < n; k++) {
            const a = U(11 + k) * Math.PI * 2;
            const sw = b.w * (0.45 + U(13 + k) * 0.15);
            g.domes.push({ m: mat(b.x + Math.cos(a) * r0 * 0.9, y0, b.z + Math.sin(a) * r0 * 0.9, sw, sw * 1.3, sw), c: col.clone().offsetHSL(0, 0, (U(15 + k) - 0.5) * 0.1) });
          }
        } else {
          // two-tier: wide base dome, smaller dome stacked on a short collar
          g.domes.push({ m: mat(b.x, y0, b.z, b.w * 1.1, b.h * 1.4, b.w * 1.1), c: col });
          rnd(b.x, y0 + b.h * 0.62, b.z, b.w * 0.5, 0.9, b.w * 0.5, trimC);
          g.domes.push({ m: mat(b.x, y0 + b.h * 0.62 + 0.8, b.z, b.w * 0.55, b.h * 1.2, b.w * 0.55), c: col.clone().offsetHSL(0, 0.03, 0.04) });
          top = y0 + b.h * 1.2 + 0.8;
        }
        // crown: skylight or chimney pipe
        if (U(16) < 0.55) {
          rnd(b.x, top - 0.25, b.z, b.w * 0.2, 0.5, b.w * 0.2, '#7a6a52');
          g.lanterns.push({ m: mat(b.x, top + 0.25, b.z, 0.8, 0.45, 0.8) });
        } else rnd(b.x + r0 * 0.3, top - 1, b.z - r0 * 0.2, 0.5, 2.2, 0.5, '#5a4a3a');
        // door facing the path, coloured lintel, a lantern and maybe a little garden wall
        const dx = b.door[0] - b.x;
        const dz = b.door[1] - b.z;
        const dl = Math.hypot(dx, dz) || 1;
        const ang = Math.atan2(dx, dz);
        det(b.x + (dx / dl) * r0 * 0.94, y0, b.z + (dz / dl) * r0 * 0.94, 1.5, 2.3, 0.9, U(17) < 0.6 ? accent(U(18)) : '#5a3e28', ang);
        det(b.x + (dx / dl) * r0, y0 + 2.3, b.z + (dz / dl) * r0, 2, 0.3, 1.1, '#7a6a52', ang);
        g.lanterns.push({ m: mat(b.door[0] + (b.x - b.door[0]) * 0.55, y0 + 1.2, b.door[1] + (b.z - b.door[1]) * 0.55, 0.5, 0.5, 0.5) });
        if (U(19) < 0.45) {
          for (let k = 0; k < 7; k++) {
            const a = ang + Math.PI * 0.35 + k * 0.32;
            const wx = b.x + Math.sin(a) * (r0 + 2.2);
            const wz = b.z + Math.cos(a) * (r0 + 2.2);
            det(wx, y0, wz, 1.5, 0.7, 0.5, '#a89a80', a);
          }
        }
        break;
      }
      case 'treehouse': {
        g.trunks.push({ m: mat(b.x, y0, b.z, 3.2, b.h, 3.2) });
        g.platforms.push({ m: mat(b.x, y0 + b.h * 0.55, b.z, b.w, 0.6, b.w), c: new THREE.Color('#8a6a4a') });
        g.pods.push({ m: mat(b.x, y0 + b.h * 0.55 + 2.2, b.z, b.w * 0.55, 4, b.w * 0.55), c: tone(domeTones) });
        g.canopies.push({ m: mat(b.x, y0 + b.h + 2, b.z, b.w * 1.9, b.w * 1.2, b.w * 1.9), c: new THREE.Color('#3f7a3a').offsetHSL(b.tone * 0.06 - 0.03, 0, b.tone * 0.08 - 0.04) });
        for (let k = 0; k < 4; k++) {
          const a = k * 1.6 + b.tone * 6;
          const leafC = new THREE.Color('#3f7a3a').offsetHSL(((b.tone * 7 + k * 0.37) % 1) * 0.08 - 0.04, 0, ((b.tone * 3 + k * 0.61) % 1) * 0.14 - 0.07);
          g.canopies.push({ m: mat(b.x + Math.cos(a) * b.w * 0.75, y0 + b.h + 0.5 + (k % 2) * 2.2, b.z + Math.sin(a) * b.w * 0.75, b.w * 1.15, b.w * 0.85, b.w * 1.15), c: leafC });
        }
        g.lanterns.push({ m: mat(b.x + 2, y0 + b.h * 0.55 + 0.8, b.z, 0.45, 0.45, 0.45) });
        g.lanterns.push({ m: mat(b.x - 1.6, y0 + b.h * 0.55 + 0.8, b.z + 1.4, 0.4, 0.4, 0.4) });
        break;
      }
      case 'pod':
        g.trunks.push({ m: mat(b.x, y0, b.z, 1, 3, 1) });
        g.pods.push({ m: mat(b.x, y0 + 3 + b.h / 2, b.z, b.w, b.h, b.w), c: tone(domeTones) });
        g.lanterns.push({ m: mat(b.x, y0 + 2.5, b.z + b.w / 2, 0.4, 0.4, 0.4) });
        break;
    }
  }
  void style;
  return g;
}

function WindmillBlades({ x, y, z, rot }: { x: number; y: number; z: number; rot: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.8;
  });
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <group ref={ref} position={[0, 0, 2.8]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0]}>
            <boxGeometry args={[0.6, 11, 0.12]} />
            <meshStandardMaterial color="#d8c8a8" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function LandmarkModel({ l, y, style, civColor, shadows }: { l: PlacedLandmark; y: number; style: Layout['style']; civColor: string; shadows: boolean }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.3;
  });
  const glowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0f18', emissive: new THREE.Color(civColor), emissiveIntensity: 1.4 }), [civColor]);
  const stoneColor = style === 'futuristic' ? '#c9d2dc' : style === 'organic' ? '#d8ccb0' : '#b0a080';
  let body: JSX.Element;
  switch (l.kind) {
    case 'spire':
      body = (
        <group>
          <mesh castShadow={shadows} position={[0, 70, 0]}>
            <cylinderGeometry args={[0.6, 7, 140, 6]} />
            <meshStandardMaterial color="#d8e0ea" metalness={0.6} roughness={0.25} />
          </mesh>
          <group ref={spin}>
            {[30, 60, 95].map((h, i) => (
              <mesh key={h} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]} material={glowMat}>
                <torusGeometry args={[7 - i * 1.8, 0.35, 8, 48]} />
              </mesh>
            ))}
          </group>
          <mesh position={[0, 142, 0]} material={glowMat}>
            <sphereGeometry args={[1.4, 16, 16]} />
          </mesh>
        </group>
      );
      break;
    case 'observatory':
      body = (
        <group>
          <mesh castShadow={shadows} position={[0, 5, 0]}>
            <cylinderGeometry args={[8, 9, 10, 24]} />
            <meshStandardMaterial color={stoneColor} roughness={0.8} />
          </mesh>
          <mesh castShadow={shadows} position={[0, 10, 0]}>
            <sphereGeometry args={[8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#e8eef4" metalness={0.5} roughness={0.3} />
          </mesh>
          <group ref={spin} position={[12, 0, 0]}>
            <mesh position={[0, 6, 0]} rotation={[0.9, 0, 0]}>
              <cylinderGeometry args={[5, 0.4, 2, 24, 1, true]} />
              <meshStandardMaterial color="#c8d0d8" side={THREE.DoubleSide} metalness={0.4} />
            </mesh>
            <mesh position={[0, 2.5, 0]}>
              <cylinderGeometry args={[0.4, 0.6, 5, 8]} />
              <meshStandardMaterial color="#8a949e" />
            </mesh>
          </group>
        </group>
      );
      break;
    case 'market':
      body = (
        <group>
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(a) * 10, 0, Math.sin(a) * 10]} rotation={[0, -a, 0]}>
                <mesh position={[0, 1, 0]} castShadow={shadows}>
                  <boxGeometry args={[3, 2, 2.4]} />
                  <meshStandardMaterial color="#8a6a4a" />
                </mesh>
                <mesh position={[0, 3.2, 0]}>
                  <coneGeometry args={[2.4, 1.6, 4]} />
                  <meshStandardMaterial color={['#c84a3a', '#3a7ac8', '#d8b04a', '#4aa86a'][i % 4]} roughness={0.9} />
                </mesh>
              </group>
            );
          })}
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[3, 3.4, 0.4, 24]} />
            <meshStandardMaterial color={stoneColor} />
          </mesh>
        </group>
      );
      break;
    case 'archive':
      body = (
        <group>
          <mesh castShadow={shadows} position={[0, 7, 0]}>
            <boxGeometry args={[22, 14, 14]} />
            <meshStandardMaterial color={stoneColor} roughness={0.7} />
          </mesh>
          {Array.from({ length: 6 }).map((_, i) => (
            <mesh key={i} position={[-9 + i * 3.6, 6, 8]} castShadow={shadows}>
              <cylinderGeometry args={[0.6, 0.6, 12, 12]} />
              <meshStandardMaterial color="#eef0f2" />
            </mesh>
          ))}
          <mesh position={[0, 15, 2]}>
            <boxGeometry args={[24, 2, 18]} />
            <meshStandardMaterial color="#e0e4e8" />
          </mesh>
        </group>
      );
      break;
    case 'spaceport':
      body = (
        <group>
          {[-12, 12].map((x) => (
            <mesh key={x} position={[x, 0.5, 0]} receiveShadow>
              <cylinderGeometry args={[8, 8, 1, 32]} />
              <meshStandardMaterial color="#5a6270" metalness={0.4} />
            </mesh>
          ))}
          <mesh position={[-12, 14, 0]} castShadow={shadows}>
            <cylinderGeometry args={[2.2, 2.6, 26, 16]} />
            <meshStandardMaterial color="#eef2f6" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[-12, 30, 0]}>
            <coneGeometry args={[2.2, 6, 16]} />
            <meshStandardMaterial color="#d84a3a" />
          </mesh>
          <mesh position={[12, 1.2, 0]} material={glowMat}>
            <torusGeometry args={[6, 0.25, 8, 48]} />
          </mesh>
        </group>
      );
      break;
    case 'garden':
      body = (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, i * 1.6 + 0.8, 0]} receiveShadow castShadow={shadows}>
              <cylinderGeometry args={[14 - i * 4, 14.5 - i * 4, 1.6, 32]} />
              <meshStandardMaterial color={i % 2 ? '#5a8a3a' : '#c8b898'} roughness={1} />
            </mesh>
          ))}
          <mesh position={[0, 9, 0]} castShadow={shadows}>
            <icosahedronGeometry args={[4, 1]} />
            <meshStandardMaterial color="#4a8a3a" flatShading />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[0.5, 0.8, 4, 8]} />
            <meshStandardMaterial color="#6a5242" />
          </mesh>
        </group>
      );
      break;
    case 'temple':
      body = (
        <group>
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 6, 4, Math.sin(a) * 6]} castShadow={shadows}>
                <cylinderGeometry args={[0.5, 0.6, 8, 10]} />
                <meshStandardMaterial color={stoneColor} />
              </mesh>
            );
          })}
          <mesh position={[0, 8, 0]} castShadow={shadows}>
            <sphereGeometry args={[7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={style === 'organic' ? '#8aa86a' : '#c8b07a'} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[8, 8.5, 0.6, 32]} />
            <meshStandardMaterial color={stoneColor} />
          </mesh>
          <mesh position={[0, 2, 0]} material={glowMat}>
            <sphereGeometry args={[0.9, 16, 16]} />
          </mesh>
        </group>
      );
      break;
    case 'ruin':
      body = (
        <group>
          {Array.from({ length: 9 }).map((_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const h = 2 + ((i * 37) % 7);
            return (
              <mesh key={i} position={[Math.cos(a) * 8, h / 2, Math.sin(a) * 8]} rotation={[0, a, ((i % 3) - 1) * 0.08]} castShadow={shadows}>
                <boxGeometry args={[4.5, h, 1.2]} />
                <meshStandardMaterial color="#8a8070" roughness={1} />
              </mesh>
            );
          })}
        </group>
      );
      break;
    case 'monolith':
      body = (
        <group>
          <mesh position={[0, 9, 0]} rotation={[0, 0.4, 0.04]} castShadow={shadows}>
            <boxGeometry args={[3, 18, 1.4]} />
            <meshStandardMaterial color="#1e2026" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 9, 0.75]} rotation={[0, 0.4, 0.04]}>
            <planeGeometry args={[1.2, 14]} />
            <meshStandardMaterial color="#000" emissive="#6fd6ff" emissiveIntensity={0.6} transparent opacity={0.5} />
          </mesh>
        </group>
      );
      break;
    case 'overlook':
      body = (
        <group>
          <mesh position={[0, 1.5, 0]} castShadow={shadows}>
            <coneGeometry args={[2.5, 3, 6]} />
            <meshStandardMaterial color="#8a8070" flatShading />
          </mesh>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 6, 6]} />
            <meshStandardMaterial color="#5a4a3a" />
          </mesh>
          <mesh position={[1, 7, 0]}>
            <planeGeometry args={[2, 1.2]} />
            <meshStandardMaterial color="#6fd6ff" side={THREE.DoubleSide} emissive="#3d8bff" emissiveIntensity={0.4} />
          </mesh>
        </group>
      );
      break;
    case 'grove':
      body = (
        <group>
          {Array.from({ length: 7 }).map((_, i) => {
            const a = (i / 7) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(a) * 9, 0, Math.sin(a) * 9]}>
                <mesh position={[0, 7, 0]} castShadow={shadows}>
                  <cylinderGeometry args={[0.8, 1.6, 14, 8]} />
                  <meshStandardMaterial color="#5a4232" roughness={1} />
                </mesh>
                <mesh position={[0, 16, 0]} castShadow={shadows}>
                  <icosahedronGeometry args={[6, 1]} />
                  <meshStandardMaterial color="#2f6a3a" flatShading />
                </mesh>
              </group>
            );
          })}
        </group>
      );
      break;
    default:
      body = (
        <group>
          <mesh position={[0, 11, 0]} castShadow={shadows}>
            <cylinderGeometry args={[0.6, 2.2, 22, 4]} />
            <meshStandardMaterial color={stoneColor} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[7, 1.2, 7]} />
            <meshStandardMaterial color={stoneColor} />
          </mesh>
          <mesh position={[0, 22.5, 0]} material={glowMat}>
            <octahedronGeometry args={[1, 0]} />
          </mesh>
        </group>
      );
  }
  return (
    <group position={[l.x, y, l.z]}>
      {body}
      <Html center position={[0, l.kind === 'spire' ? 150 : 26, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
        <div className="poi-label">
          <i />
          {l.name}
        </div>
      </Html>
    </group>
  );
}

const poolGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
/** Warm pools of light on the ground beneath street lamps, fading in after dusk. */
function LightPools({ lights, y, style }: { lights: [number, number][]; y: number; style: Layout['style'] }) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uNight: nightUniform, uCol: { value: new THREE.Color(style === 'futuristic' ? '#bfe0ff' : '#ffb466') } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xz; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uNight; uniform vec3 uCol; varying vec2 vUv; void main(){ float d = length(vUv); float a = pow(max(0.0, 1.0 - d), 2.2); gl_FragColor = vec4(uCol * a * uNight * 0.55, 1.0); }',
    });
    return m;
  }, [style]);
  useEffect(() => () => mat.dispose(), [mat]);
  const items = useMemo(() => lights.map(([x, z]) => ({ m: mat4(x + 3, y + 0.12, z + 3, 7.5) })), [lights, y]);
  return <Instanced items={items} geometry={poolGeo} material={mat} />;
}

function mat4(x: number, y: number, z: number, s: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
}

const shadowTex = (() => {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 8, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Soft dark skirts where buildings meet the ground, so they sit in the street instead of floating on it. */
function ContactShadows({ buildings, y }: { buildings: Building[]; y: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: '#000000', polygonOffset: true, polygonOffsetFactor: -3 }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const items = useMemo(
    () =>
      buildings.map((b) => {
        const w = b.rot ? b.d : b.w;
        const d = b.rot ? b.w : b.d;
        return { m: new THREE.Matrix4().compose(new THREE.Vector3(b.x, y + 0.1, b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.kind === 'dome' ? 0 : 0), new THREE.Vector3(w * 1.55 + 3, 1, d * 1.55 + 3)) };
      }),
    [buildings, y],
  );
  if (!shadowTex) return null;
  return <Instanced items={items} geometry={shadowGeo} material={mat} />;
}

const carGeo = new THREE.CapsuleGeometry(0.7, 2.2, 3, 8).rotateX(Math.PI / 2);
const tailGeo = new THREE.SphereGeometry(0.28, 8, 6);
/** Flying traffic over futuristic cities: craft follow the street grid on three altitude lanes. */
function SkyTraffic({ streets, y, quality, civColor }: { streets: Layout['streets']; y: number; quality: 'low' | 'medium' | 'high'; civColor: string }) {
  const n = quality === 'high' ? 60 : quality === 'medium' ? 36 : 0;
  const body = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => {
    const rng = new Rng(streets.length * 31 + 7);
    // merge the grid into whole avenues: one straight line per distinct street row or column
    const avenues: Layout['streets'] = [];
    const seen = new Set<string>();
    let ext = 0;
    for (const s of streets) ext = Math.max(ext, Math.abs(s.a[0]), Math.abs(s.a[1]), Math.abs(s.b[0]), Math.abs(s.b[1]));
    for (const s of streets) {
      const vertical = Math.abs(s.b[0] - s.a[0]) < 1;
      const horizontal = Math.abs(s.b[1] - s.a[1]) < 1;
      if (!vertical && !horizontal) continue;
      const key = vertical ? `x${Math.round(s.a[0])}` : `z${Math.round(s.a[1])}`;
      if (seen.has(key)) continue;
      seen.add(key);
      avenues.push(vertical ? { a: [s.a[0], -ext - 40], b: [s.a[0], ext + 40], w: s.w } : { a: [-ext - 40, s.a[1]], b: [ext + 40, s.a[1]], w: s.w });
    }
    const long = avenues.length ? avenues : streets.filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 12);
    return long.length
      ? Array.from({ length: n }, () => ({ s: long[Math.floor(rng.next() * long.length)], t: rng.next(), dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(10, 22), lane: [14, 22, 31][Math.floor(rng.next() * 3)], off: rng.range(-1.5, 1.5), c: new THREE.Color(rng.pick(['#d8dde4', '#3a4048', '#c8402a', '#e8e0d0', civColor, '#2a5a8a'])) }))
      : [];
  }, [streets, n, civColor]);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.6 }), []);
  const lightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), []);
  useEffect(() => () => { bodyMat.dispose(); lightMat.dispose(); }, [bodyMat, lightMat]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);
  const colored = useRef(false);
  useFrame((_, dt) => {
    const b = body.current;
    const l = lights.current;
    if (!b || !l) return;
    if (!colored.current) {
      cars.forEach((c, i) => {
        b.setColorAt(i, c.c);
        l.setColorAt(i * 2, new THREE.Color('#fff4d8'));
        l.setColorAt(i * 2 + 1, new THREE.Color('#ff3a2a'));
      });
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (l.instanceColor) l.instanceColor.needsUpdate = true;
      colored.current = true;
    }
    cars.forEach((c, i) => {
      const dx = c.s.b[0] - c.s.a[0];
      const dz = c.s.b[1] - c.s.a[1];
      const len = Math.hypot(dx, dz);
      c.t += (c.dir * c.speed * Math.min(dt, 0.1)) / len;
      if (c.t > 1) c.t -= 1;
      if (c.t < 0) c.t += 1;
      const nx = -dz / len;
      const nz = dx / len;
      const x = c.s.a[0] + dx * c.t + nx * c.off * c.dir;
      const z = c.s.a[1] + dz * c.t + nz * c.off * c.dir;
      const yy = y + c.lane + Math.sin(c.t * 40 + i) * 0.15;
      const heading = Math.atan2(dx * c.dir, dz * c.dir);
      tmp.q.setFromAxisAngle(tmp.up, heading);
      tmp.v.set(x, yy, z);
      tmp.m.compose(tmp.v, tmp.q, tmp.one);
      b.setMatrixAt(i, tmp.m);
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      tmp.v.set(x + fx * 1.75, yy, z + fz * 1.75);
      tmp.m.compose(tmp.v, tmp.q, tmp.one);
      l.setMatrixAt(i * 2, tmp.m);
      tmp.v.set(x - fx * 1.75, yy, z - fz * 1.75);
      tmp.m.compose(tmp.v, tmp.q, tmp.one);
      l.setMatrixAt(i * 2 + 1, tmp.m);
    });
    b.instanceMatrix.needsUpdate = true;
    l.instanceMatrix.needsUpdate = true;
  });
  if (!cars.length) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[carGeo, bodyMat, cars.length]} frustumCulled={false} castShadow={quality === 'high'} />
      <instancedMesh ref={lights} args={[tailGeo, lightMat, cars.length * 2]} frustumCulled={false} />
    </group>
  );
}
