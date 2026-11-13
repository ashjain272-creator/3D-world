import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import { TiledInstances } from './lod';
import type { VegetationData } from './vegetation';
import type { Layout } from './layout';
import { mixHex, type TerrainData } from './terrain';
import { NOISE_GLSL, env, foliageMaterial } from './env';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function TerrainMesh({ t, layout, waterColor }: { t: TerrainData; layout: Layout; waterColor: string }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(t.size, t.size, t.res, t.res);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const low = new THREE.Color(t.look.low);
    const mid = new THREE.Color(t.look.mid);
    const high = new THREE.Color(t.look.high);
    const cliff = new THREE.Color(t.look.cliff);
    const sand = new THREE.Color(t.look.sand);
    const cityGround = new THREE.Color(
      layout.style === 'futuristic' ? '#5a6068' : layout.style === 'organic' ? mixHex(t.look.grassColor, '#6a8a4a', 0.4) : mixHex(t.look.sand, '#a08a68', 0.5),
    );
    const rng = new Rng(t.seed);
    const n2 = createNoise2D(() => rng.next());
    const dry = new THREE.Color(t.look.sand).lerp(new THREE.Color(t.look.mid), 0.4);
    const lush = new THREE.Color(t.look.grassColor).offsetHSL(0, 0.05, -0.06);
    const maxH = Math.max(...t.heights);
    const minH = Math.min(...t.heights);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // PlaneGeometry rows run from +z to -z after rotation; sample the analytic height
      const h = t.height(x, z);
      pos.setY(i, h);
      const s = t.slope(x, z);
      const rel = (h - minH) / Math.max(1, maxH - minH);
      if (rel < 0.35) c.copy(low).lerp(mid, rel / 0.35);
      else c.copy(mid).lerp(high, Math.min(1, (rel - 0.35) / 0.5));
      // large soft patches of lusher and drier ground, plus fine speckle
      const patch = n2(x / 70, z / 70) * 0.6 + n2(x / 18, z / 18) * 0.25;
      if (patch > 0.15) c.lerp(lush, Math.min(0.5, (patch - 0.15) * 0.9));
      else if (patch < -0.2) c.lerp(dry, Math.min(0.45, (-0.2 - patch) * 0.8));
      if (t.waterLevel !== null && h < t.waterLevel + 1.6) c.lerp(sand, Math.min(1, (t.waterLevel + 1.6 - h) / 1.6));
      if (s > 0.55) c.lerp(cliff, Math.min(1, (s - 0.55) * 2));
      const d = Math.hypot(x, z);
      if (layout.radius > 0 && d < layout.radius + 8) c.lerp(cityGround, Math.min(1, (layout.radius + 8 - d) / 20) * 0.8);
      const j = (rng.next() - 0.5) * 0.04 + n2(x / 4, z / 4) * 0.015;
      colors[i * 3] = c.r + j;
      colors[i * 3 + 1] = c.g + j;
      colors[i * 3 + 2] = c.b + j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [t, layout]);
  useEffect(() => () => geo.dispose(), [geo]);
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = (t.waterLevel ?? 0) + Math.sin(clock.elapsedTime * 0.4) * 0.08;
  });
  // Ground: vertex colours broken up by procedural detail so it never reads as flat paint.
  const groundMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}`).replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float broad = efbm(vWPos.xz * 0.045);
          float fine = evn(vWPos.xz * 1.7) * 0.6 + evn(vWPos.xz * 7.0) * 0.4;
          diffuseColor.rgb *= 0.78 + 0.3 * broad + 0.16 * fine;
          // faint warm/cool drift so large fields are not one hue
          diffuseColor.rgb *= mix(vec3(1.05, 1.0, 0.92), vec3(0.94, 1.0, 1.04), efbm(vWPos.xz * 0.012 + 31.0));
        }`,
      );
    };
    return m;
  }, []);
  // Water: moving ripples in the normal, sky reflection at grazing angles.
  const waterMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: waterColor, transparent: true, opacity: 0.86, roughness: 0.08, metalness: 0.1 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = env.uTime;
      shader.uniforms.uSky = env.uSky;
      shader.uniforms.uDay = env.uDay;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uDay;\nuniform vec3 uSky;\n${NOISE_GLSL}`)
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 p = vWPos.xz;
            vec2 gr = vec2(cos(p.x * 0.33 + uTime * 1.1), cos(p.y * 0.41 + uTime * 0.9)) * 0.05;
            gr += vec2(cos(p.x * 1.3 - p.y * 0.7 + uTime * 1.7), cos(p.y * 1.5 + p.x * 0.6 - uTime * 1.4)) * 0.04;
            gr += (vec2(evn(p * 2.2 + uTime * 0.6), evn(p * 2.2 - uTime * 0.5 + 40.0)) - 0.5) * 0.09;
            normal = normalize((viewMatrix * vec4(normalize(vec3(-gr.x, 1.0, -gr.y)), 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float fr = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 3.0);
            vec3 skyc = uSky * (0.12 + 0.88 * uDay);
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.75 + 0.35 * efbm(vWPos.xz * 0.05 + uTime * 0.02)), skyc, 0.15 + 0.7 * fr);
            diffuseColor.a = mix(0.7, 0.97, fr);
          }`,
        );
    };
    return m;
  }, [waterColor]);
  // Hazy far ridgelines so the horizon has depth.
  const ridges = useMemo(() => {
    const make = (radius: number, baseH: number, amp: number, seedOff: number) => {
      const seg = 160;
      const pos: number[] = [];
      const idx: number[] = [];
      const bottom = t.flatHeight - 40;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = Math.sin(a * 5 + seedOff) * 0.35 + Math.sin(a * 11 + seedOff * 2.3) * 0.3 + Math.sin(a * 23 + seedOff * 0.7) * 0.2 + Math.sin(a * 47 + seedOff) * 0.12;
        const top = t.flatHeight + baseH + amp * (0.55 + 0.45 * n);
        pos.push(Math.cos(a) * radius, bottom, Math.sin(a) * radius, Math.cos(a) * radius * 0.96, top, Math.sin(a) * radius * 0.96);
        if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const k = 0.5 + t.look.amplitude / 30;
    return [make(t.size * 0.95, 20, 70 * k, (t.seed % 97) * 0.13), make(t.size * 1.2, 40, 130 * k, (t.seed % 89) * 0.21 + 2)];
  }, [t]);
  useEffect(() => () => ridges.forEach((g) => g.dispose()), [ridges]);
  useEffect(() => () => { groundMat.dispose(); waterMat.dispose(); }, [groundMat, waterMat]);
  return (
    <group>
      <mesh geometry={geo} receiveShadow material={groundMat} />
      {t.waterLevel !== null && (
        <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, t.waterLevel, 0]} receiveShadow material={waterMat}>
          <planeGeometry args={[t.size * 1.6, t.size * 1.6, 1, 1]} />
        </mesh>
      )}
      {ridges.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={i === 0 ? mixHex(t.look.high, t.look.cliff, 0.5) : mixHex(t.look.high, '#9fb0c4', 0.5)} roughness={1} side={THREE.DoubleSide} flatShading />
        </mesh>
      ))}
      {/* distant ground ring so the horizon never shows the void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Math.min(...[t.flatHeight - 30]), 0]}>
        <ringGeometry args={[t.size * 0.7, t.size * 4, 32, 1]} />
        <meshStandardMaterial color={t.look.high} roughness={1} />
      </mesh>
    </group>
  );
}

/** Instanced vegetation and rocks with tiled LOD (two detail levels plus distance culling). */
export function Vegetation({ data, kind, cliff, quality }: { data: VegetationData; kind: TerrainData['look']['vegetation']; cliff: string; quality: 'low' | 'medium' | 'high' }) {
  const shadows = quality === 'high';
  const far = quality === 'low' ? 0.65 : 1;
  const levels = useMemo(() => {
    const bark = new THREE.MeshStandardMaterial({ color: kind === 'cactus' ? '#5f8a4a' : '#5a4636', roughness: 1 });
    const leaf = foliageMaterial();
    const blade = foliageMaterial({ tip: true, flat: false });
    const petal = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.06 });
    const stone = new THREE.MeshStandardMaterial({ color: cliff, roughness: 1, flatShading: true });
    const trunkHi = kind === 'cactus' ? new THREE.CapsuleGeometry(0.45, 0.6, 4, 8) : new THREE.CylinderGeometry(0.16, 0.34, 1, 7);
    const trunkLo = kind === 'cactus' ? new THREE.CapsuleGeometry(0.45, 0.6, 1, 4) : new THREE.CylinderGeometry(0.18, 0.3, 1, 3);
    const canopyHi = kind === 'conifer' ? new THREE.ConeGeometry(1, 1, 7) : kind === 'jungle' ? new THREE.SphereGeometry(1, 8, 5) : new THREE.IcosahedronGeometry(1, 1);
    const canopyLo = kind === 'conifer' ? new THREE.ConeGeometry(1, 1, 4) : kind === 'jungle' ? new THREE.SphereGeometry(1, 5, 3) : new THREE.IcosahedronGeometry(1, 0);
    // skirts for conifers, blobs for everything else
    const extraGeo = kind === 'conifer' ? new THREE.ConeGeometry(1, 1, 7) : kind === 'jungle' ? new THREE.SphereGeometry(1, 7, 4) : new THREE.IcosahedronGeometry(1, 1);
    // a tuft: seven tapered blades fanned out from one root
    const tuft = mergeGeometries(
      Array.from({ length: 7 }, (_, k) => {
        const g = new THREE.ConeGeometry(0.07, 1, 3, 1, true).translate(0, 0.5, 0);
        g.rotateZ(0.18 + (k % 3) * 0.16);
        g.rotateY((k / 7) * Math.PI * 2);
        g.translate(Math.cos(k * 2.4) * 0.16, 0, Math.sin(k * 2.4) * 0.16);
        return g;
      }),
    );
    return {
      extra: [{ geometry: extraGeo, material: leaf, maxDist: 150 * far, castShadow: shadows }],
      bush: [
        { geometry: new THREE.IcosahedronGeometry(1, 1), material: leaf, maxDist: 110 * far, castShadow: shadows },
        { geometry: new THREE.IcosahedronGeometry(1, 0), material: leaf, maxDist: 240 * far },
      ],
      grass: [{ geometry: tuft, material: blade, maxDist: 85 }],
      flower: [{ geometry: new THREE.IcosahedronGeometry(1, 0), material: petal, maxDist: 70 }],
      trunk: [
        { geometry: trunkHi, material: bark, maxDist: 200 * far, castShadow: shadows },
        { geometry: trunkLo, material: bark, maxDist: 380 * far },
      ],
      canopy: [
        { geometry: canopyHi, material: leaf, maxDist: 230 * far, castShadow: shadows },
        { geometry: canopyLo, material: leaf, maxDist: 520 * far },
      ],
      rock: [
        { geometry: rockGeo(), material: stone, maxDist: 170 * far, castShadow: shadows, receiveShadow: true },
        { geometry: new THREE.TetrahedronGeometry(1, 0), material: stone, maxDist: 300 * far },
      ],
    };
  }, [kind, cliff, shadows, far]);
  useEffect(
    () => () => {
      for (const set of Object.values(levels)) for (const l of set) l.geometry.dispose();
      levels.trunk[0].material.dispose();
      levels.canopy[0].material.dispose();
      levels.rock[0].material.dispose();
      levels.grass[0].material.dispose();
      levels.flower[0].material.dispose();
    },
    [levels],
  );
  return (
    <group>
      {data.trunks.length > 0 && <TiledInstances items={data.trunks} levels={levels.trunk} name="trunks" />}
      {data.trunks.length > 0 && kind !== 'cactus' && <TiledInstances items={data.canopies} levels={levels.canopy} name="canopies" />}
      {kind !== 'cactus' && data.canopyExtra.length > 0 && <TiledInstances items={data.canopyExtra} levels={levels.extra} tileSize={90} name="canopy-extra" />}
      {data.bushes.length > 0 && <TiledInstances items={data.bushes} levels={levels.bush} tileSize={90} name="bushes" />}
      {data.grass.length > 0 && <TiledInstances items={data.grass} levels={levels.grass} tileSize={45} name="grass" />}
      {data.flowers.length > 0 && <TiledInstances items={data.flowers} levels={levels.flower} tileSize={45} name="flowers" />}
      <TiledInstances items={data.rocks} levels={levels.rock} name="rocks" />
    </group>
  );
}

/** A lumpy boulder: an icosphere with its vertices pushed around deterministically. */
function rockGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + 0.34 * Math.abs(Math.sin(x * 5.1 + y * 3.7 + z * 4.3));
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}
