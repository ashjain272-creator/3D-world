import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, BuildingKind, Layout, PlacedLandmark } from './layout';
import type { TerrainData } from './terrain';

/** Shared 0..1 night factor, driven by the sky each frame. */
export const nightUniform = { value: 0 };

/**
 * A standard material whose vertical faces show procedurally lit windows,
 * computed in world space so any instance scale gets correctly sized floors.
 */
function windowMaterial(opts: { floor: number; col: number; lit: [number, number, number]; density: number; glass: [number, number, number]; roughness?: number; metalness?: number; accent?: THREE.Color; ribbon?: boolean }) {
  const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0.2 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.uniforms.uAccent = { value: opts.accent ?? new THREE.Color(0, 0, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vWPos = wp.xyz;
        vec3 n = objectNormal;
        #ifdef USE_INSTANCING
          n = mat3(instanceMatrix) * n;
        #endif
        vWNorm = normalize(mat3(modelMatrix) * n);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uAccent;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (abs(vWNorm.y) < 0.5) {
          float hc = abs(vWNorm.x) > 0.5 ? vWPos.z : vWPos.x;
          vec2 cell = vec2(hc / ${opts.col.toFixed(2)}, (vWPos.y - 0.6) / ${opts.floor.toFixed(2)});
          vec2 f = fract(cell);
          float win = step(${opts.ribbon ? '0.07' : '0.18'}, f.x) * step(f.x, ${opts.ribbon ? '0.93' : '0.82'}) * step(${opts.ribbon ? '0.22' : '0.28'}, f.y) * step(f.y, ${opts.ribbon ? '0.86' : '0.78'}) * step(1.0, cell.y);
          float r = h21(vec2(floor(cell.x / ${opts.ribbon ? '3.0' : '1.0'}), floor(cell.y)) + floor(vWPos.xz / 40.0));
          float lit = step(1.0 - ${opts.density.toFixed(2)} * (0.35 + 0.65 * uNight), r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${opts.glass.map((v) => v.toFixed(3)).join(',')}), win * 0.65);
          vec3 litCol = mix(vec3(${opts.lit.map((v) => v.toFixed(3)).join(',')}), vec3(1.0, 0.78, 0.52), step(0.72, fract(r * 7.13)));
          totalEmissiveRadiance += litCol * win * lit * (0.06 + uNight * 0.85) * (0.6 + 0.4 * fract(r * 3.7));
          // thin luminous accent bands every few storeys (only when an accent colour is set)
          float band = smoothstep(13.15, 13.5, abs(mod(vWPos.y - 0.6, 27.2) - 13.6));
          totalEmissiveRadiance += uAccent * band * step(8.0, vWPos.y) * (0.35 + uNight * 1.6);
          // subtle vertical shading: darker at street level, brighter at the top
          diffuseColor.rgb *= 0.82 + 0.18 * clamp(vWPos.y / 80.0, 0.0, 1.0);
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
      futuristic: windowMaterial({ floor: 3.4, col: 1.7, lit: [0.85, 0.92, 1.0], density: 0.5, glass: [0.16, 0.24, 0.34], metalness: 0.12, roughness: 0.42, accent: new THREE.Color(civColor), ribbon: true }),
      frontier: windowMaterial({ floor: 3.0, col: 3.2, lit: [1.0, 0.72, 0.38], density: 0.5, glass: [0.12, 0.1, 0.08], roughness: 0.95, metalness: 0 }),
      plain: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }),
      roof: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      dome: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }),
      leaf: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      bark: new THREE.MeshStandardMaterial({ color: '#6a5242', roughness: 1 }),
      glow: new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color(civColor), emissiveIntensity: 1 }),
      warm: new THREE.MeshStandardMaterial({ color: '#2a1a0a', emissive: new THREE.Color('#ffb060'), emissiveIntensity: 1 }),
    }),
    [civColor],
  );
  useFrame(() => {
    mats.glow.emissiveIntensity = 0.4 + nightUniform.value * 2.2;
    mats.warm.emissiveIntensity = 0.15 + nightUniform.value * 2.4;
  });
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const groups = useMemo(() => buildGroups(layout.buildings, y0, layout.style), [layout, y0]);
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
  const lineGeo = useMemo(() => {
    if (layout.style !== 'futuristic') return null;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of layout.streets) {
      const dx = s.b[0] - s.a[0];
      const dz = s.b[1] - s.a[1];
      for (const off of [-s.w / 2 + 0.4, s.w / 2 - 0.4]) {
        const g = new THREE.PlaneGeometry(Math.hypot(dx, dz), 0.25);
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
  }, [streetGeo, lineGeo]);

  const lamps = useMemo(() => {
    const poles = layout.lights.map(([x, z]) => ({ m: mat(x + 3, y0, z + 3, 0.18, layout.style === 'futuristic' ? 7 : 4.5, 0.18) }));
    const bulbs = layout.lights.map(([x, z]) => ({ m: mat(x + 3, y0 + (layout.style === 'futuristic' ? 7.2 : 4.7), z + 3, 0.7, 0.7, 0.7) }));
    return { poles, bulbs };
  }, [layout, y0]);

  const streetColor = layout.style === 'futuristic' ? '#2a2f38' : layout.style === 'organic' ? '#8a7a5a' : '#9a8566';

  return (
    <group>
      {streetGeo && (
        <mesh geometry={streetGeo} receiveShadow>
          <meshStandardMaterial color={streetColor} roughness={layout.style === 'futuristic' ? 0.5 : 1} metalness={layout.style === 'futuristic' ? 0.3 : 0} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
      {lineGeo && <mesh geometry={lineGeo} material={mats.glow} />}
      {/* Futuristic */}
      <Instanced items={groups.box} geometry={unitBox} material={layout.style === 'frontier' ? mats.frontier : mats.futuristic} castShadow={shadows} receiveShadow />
      <Instanced items={groups.caps} geometry={unitBox} material={mats.glow} />
      <Instanced items={groups.antenna} geometry={unitCyl} material={mats.plain} />
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

function buildGroups(buildings: Building[], y0: number, style: Layout['style']) {
  const g = {
    box: [] as { m: THREE.Matrix4; c?: THREE.Color }[],
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
  };
  const futTones = ['#a9b6c8', '#d4dbe4', '#8794a8', '#e8edf2', '#9aa9bc', '#b8c4d4', '#6f7c90'];
  const stone = ['#b8a88c', '#a8987a', '#c8b89a', '#9a8a70', '#8a6a4a'];
  const roofs = ['#7a3a2a', '#5a4a3a', '#8a5a3a', '#4a3a2e'];
  const domeTones = ['#e6d6b4', '#d4c6a2', '#bccaa4', '#e0c8a8', '#c8b490', '#d8dcc0'];
  for (const b of buildings) {
    const kind: BuildingKind = b.kind;
    const tone = (arr: string[]) => new THREE.Color(arr[Math.floor(b.tone * arr.length) % arr.length]);
    switch (kind) {
      case 'tower':
      case 'block':
      case 'slab': {
        g.box.push({ m: mat(b.x, y0, b.z, b.w, b.h, b.d), c: tone(futTones) });
        if (b.kind === 'tower') {
          g.caps.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 0.7, 0.6, b.d * 0.7) });
          if (b.h > 80) g.antenna.push({ m: mat(b.x, y0 + b.h, b.z, 0.5, 12, 0.5) });
        } else if (b.kind === 'slab') {
          g.box.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 0.6, b.h * 0.35, b.d * 0.6), c: tone(futTones) });
        }
        break;
      }
      case 'house':
      case 'hall': {
        const w = b.rot ? b.d : b.w;
        const d = b.rot ? b.w : b.d;
        g.box.push({ m: mat(b.x, y0, b.z, w, b.h, d), c: tone(stone) });
        g.roofs.push({ m: mat(b.x, y0 + b.h, b.z, b.w * 1.08, b.h * 0.55, b.d, b.rot), c: tone(roofs) });
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
        g.lanterns.push({ m: mat(b.door[0] + (b.x - b.door[0]) * 0.55, y0 + 1.2, b.door[1] + (b.z - b.door[1]) * 0.55, 0.5, 0.5, 0.5) });
        break;
      case 'treehouse': {
        g.trunks.push({ m: mat(b.x, y0, b.z, 3.2, b.h, 3.2) });
        g.platforms.push({ m: mat(b.x, y0 + b.h * 0.55, b.z, b.w, 0.6, b.w), c: new THREE.Color('#8a6a4a') });
        g.pods.push({ m: mat(b.x, y0 + b.h * 0.55 + 2.2, b.z, b.w * 0.55, 4, b.w * 0.55), c: tone(domeTones) });
        g.canopies.push({ m: mat(b.x, y0 + b.h + 2, b.z, b.w * 1.9, b.w * 1.2, b.w * 1.9), c: new THREE.Color('#3f7a3a').offsetHSL(b.tone * 0.06 - 0.03, 0, b.tone * 0.08 - 0.04) });
        g.lanterns.push({ m: mat(b.x + 2, y0 + b.h * 0.55 + 0.8, b.z, 0.45, 0.45, 0.45) });
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
      <Html center position={[0, l.kind === 'spire' ? 150 : 26, 0]} distanceFactor={90} style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
        <div className="poi-label">
          <i />
          {l.name}
        </div>
      </Html>
    </group>
  );
}
