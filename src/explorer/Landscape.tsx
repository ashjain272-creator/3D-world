import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import { TiledInstances } from './lod';
import type { VegetationData } from './vegetation';
import type { Layout } from './layout';
import { mixHex, type TerrainData } from './terrain';

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
    if (water.current) {
      const m = water.current.material as THREE.MeshStandardMaterial;
      m.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.6) * 0.03;
      water.current.position.y = (t.waterLevel ?? 0) + Math.sin(clock.elapsedTime * 0.4) * 0.08;
    }
  });
  return (
    <group>
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} flatShading={false} />
      </mesh>
      {t.waterLevel !== null && (
        <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, t.waterLevel, 0]} receiveShadow>
          <planeGeometry args={[t.size * 1.6, t.size * 1.6, 1, 1]} />
          <meshStandardMaterial color={waterColor} transparent opacity={0.85} roughness={0.12} metalness={0.35} />
        </mesh>
      )}
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
    const leaf = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const stone = new THREE.MeshStandardMaterial({ color: cliff, roughness: 1, flatShading: true });
    const trunkHi = kind === 'cactus' ? new THREE.CapsuleGeometry(0.45, 0.6, 4, 8) : new THREE.CylinderGeometry(0.18, 0.3, 1, 6);
    const trunkLo = kind === 'cactus' ? new THREE.CapsuleGeometry(0.45, 0.6, 1, 4) : new THREE.CylinderGeometry(0.18, 0.3, 1, 3);
    const canopyHi = kind === 'conifer' ? new THREE.ConeGeometry(1, 1, 7) : kind === 'jungle' ? new THREE.SphereGeometry(1, 8, 5) : new THREE.IcosahedronGeometry(1, 1);
    const canopyLo = kind === 'conifer' ? new THREE.ConeGeometry(1, 1, 4) : kind === 'jungle' ? new THREE.SphereGeometry(1, 5, 3) : new THREE.IcosahedronGeometry(1, 0);
    return {
      trunk: [
        { geometry: trunkHi, material: bark, maxDist: 200 * far, castShadow: shadows },
        { geometry: trunkLo, material: bark, maxDist: 380 * far },
      ],
      canopy: [
        { geometry: canopyHi, material: leaf, maxDist: 230 * far, castShadow: shadows },
        { geometry: canopyLo, material: leaf, maxDist: 520 * far },
      ],
      rock: [
        { geometry: new THREE.DodecahedronGeometry(1, 0), material: stone, maxDist: 170 * far, castShadow: shadows, receiveShadow: true },
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
    },
    [levels],
  );
  return (
    <group>
      {data.trunks.length > 0 && <TiledInstances items={data.trunks} levels={levels.trunk} name="trunks" />}
      {data.trunks.length > 0 && kind !== 'cactus' && <TiledInstances items={data.canopies} levels={levels.canopy} name="canopies" />}
      <TiledInstances items={data.rocks} levels={levels.rock} name="rocks" />
    </group>
  );
}
