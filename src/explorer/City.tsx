import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, BuildingKind, Layout, PlacedLandmark } from './layout';
import { TiledInstances } from './lod';
import { Rng } from '../sim/rng';
import { cityPalette } from './palette';
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
    float r = eh21(id + bh * 91.0);
    float lit = step(1.0 - ${opts.density.toFixed(2)} * (0.3 + 0.7 * uNight), r);
    float blind = step(0.62, fract(r * 5.3)) * step(0.58, f.y);
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
    vec3 litCol = mix(${v3(opts.lit)}, vec3(1.0, 0.8, 0.55), step(0.7, fract(r * 7.13)));
    totalEmissiveRadiance += litCol * win * lit * (0.04 + uNight * 0.9) * (1.0 - 0.65 * blind) * (0.55 + 0.45 * fract(r * 3.7));
    float open = step(0.3, eh21(vec2(floor(sc.x), bh * 13.0)));
    totalEmissiveRadiance += vec3(1.0, 0.82, 0.6) * shop * open * (0.04 + uNight * 0.5) * (0.7 + 0.3 * evn(vec2(hc * 1.3, hy * 2.0)));
    // civic accent: a light line above the shopfronts and one under the parapet
    float line = step(3.75, hy) * step(hy, 4.0) + step(topH - 1.0, hy) * step(hy, topH - 0.72) * step(20.0, topH);
    totalEmissiveRadiance += uAccent * line * (0.25 + uNight * 1.5);
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
    float lit = step(1.0 - ${opts.density.toFixed(2)} * (0.2 + 0.8 * uNight), r);
    totalEmissiveRadiance += ${v3(opts.lit)} * win * (1.0 - bar) * lit * (0.03 + uNight * 1.0) * (0.6 + 0.4 * fract(r * 3.7));
  `;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
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
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uDay;\nuniform vec3 uSky;\nuniform vec3 uAccent;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nvarying vec4 vInst;\n${NOISE_GLSL}\n${BUMP_GLSL}`)
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
    mats.glow.emissiveIntensity = 0.3 + nightUniform.value * 1.1;
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
      leaves: [] as { m: THREE.Matrix4; c: THREE.Color }[],
      boxes: [] as { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[],
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
          const h = rng.range(3.2, 5);
          out.trunks.push({ m: mat(x, y0, z, 0.5, h, 0.5) });
          const base = new THREE.Color(green);
          for (let k = 0; k < 3; k++) {
            const a = rng.range(0, 6.28);
            const r = k === 0 ? 0 : rng.range(0.7, 1.2);
            const sz = k === 0 ? rng.range(3, 3.8) : rng.range(2, 2.7);
            out.leaves.push({ m: mat(x + Math.cos(a) * r, y0 + h + (k === 0 ? 0.6 : rng.range(-0.4, 1.2)), z + Math.sin(a) * r, sz, sz * 0.85, sz), c: base.clone().offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.08, 0.08), rng.range(-0.07, 0.07)) });
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
          out.leaves.push({ m: mat(x, y0 + 1.15, z, 1.5, 1.2, 1.5), c: new THREE.Color(green).offsetHSL(0, 0, rng.range(-0.05, 0.08)) });
        }
      }
    }
    return out;
  }, [layout, y0]);
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
      <Instanced items={furniture.leaves} geometry={ico} material={mats.leaf} castShadow={shadows} />
      <TiledInstances items={furniture.boxes} levels={furnitureLevels} tileSize={90} name="furniture" />
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
    /** Small coloured boxes: rooftop plant, cornices, doors, canopies, chimneys, crates. */
    details: [] as { m: THREE.Matrix4; c?: THREE.Color; x: number; z: number }[],
    /** Small cylinders: water tanks, vents, dome plinths. */
    rounds: [] as { m: THREE.Matrix4; c?: THREE.Color; x: number; z: number }[],
    glowBits: [] as { m: THREE.Matrix4 }[],
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
      case 'dome':
        g.domes.push({ m: mat(b.x, y0, b.z, b.w, b.h * 2, b.w), c: tone(domeTones) });
        {
          // stone plinth, an oculus light at the crown and a wooden door facing the path
          rnd(b.x, y0, b.z, b.w * 1.05, 0.55, b.w * 1.05, '#9c9484');
          rnd(b.x, y0 + b.h - 0.15, b.z, b.w * 0.22, 0.5, b.w * 0.22, '#7a6a52');
          g.lanterns.push({ m: mat(b.x, y0 + b.h + 0.3, b.z, 0.9, 0.5, 0.9) });
          const dx = b.door[0] - b.x;
          const dz = b.door[1] - b.z;
          const dl = Math.hypot(dx, dz) || 1;
          const ang = Math.atan2(dx, dz);
          det(b.x + (dx / dl) * b.w * 0.47, y0, b.z + (dz / dl) * b.w * 0.47, 1.5, 2.3, 0.9, '#5a3e28', ang);
          det(b.x + (dx / dl) * b.w * 0.5, y0 + 2.3, b.z + (dz / dl) * b.w * 0.5, 2, 0.3, 1.1, '#7a6a52', ang);
        }
        g.lanterns.push({ m: mat(b.door[0] + (b.x - b.door[0]) * 0.55, y0 + 1.2, b.door[1] + (b.z - b.door[1]) * 0.55, 0.5, 0.5, 0.5) });
        break;
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
