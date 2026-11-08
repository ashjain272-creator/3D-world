import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
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

interface TreeSet {
  trunk: THREE.Matrix4[];
  canopy: THREE.Matrix4[];
  canopyColors: THREE.Color[];
}

/** Instanced vegetation and rocks, scattered by noise, slope, water and settlement. */
export function Vegetation({ t, layout, quality }: { t: TerrainData; layout: Layout; quality: 'low' | 'medium' | 'high' }) {
  const kind = t.look.vegetation;
  const data = useMemo(() => {
    const rng = new Rng(t.seed + 5);
    const max = Math.round((quality === 'high' ? 2600 : quality === 'medium' ? 1500 : 700) * Math.min(1.2, t.look.density + (layout.style === 'wild' ? 0.3 : 0)));
    const set: TreeSet = { trunk: [], canopy: [], canopyColors: [] };
    const rocks: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const base = new THREE.Color(t.look.grassColor);
    const tries = max * 4;
    for (let i = 0; i < tries && set.trunk.length < max; i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const d = Math.hypot(x, z);
      const inCity = layout.radius > 0 && d < layout.radius + 10;
      if (inCity && !(layout.style === 'organic' && rng.chance(0.08))) continue;
      if (layout.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.hw + 4)) continue;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 22) continue;
      if (layout.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.radius + (layout.style === 'wild' ? 6 : 4))) continue;
      const h = t.height(x, z);
      if (t.waterLevel !== null && h < t.waterLevel + 0.8) continue;
      if (t.slope(x, z) > 0.7) continue;
      const clump = Math.sin(x * 0.021 + t.seed) * Math.cos(z * 0.017 - t.seed) + 0.3;
      if (rng.next() > clump + t.look.density * 0.5) continue;
      const s = rng.range(0.7, 1.5);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2));
      const trunkH = kind === 'jungle' ? 7 * s : kind === 'cactus' ? 3.2 * s : kind === 'conifer' ? 2.2 * s : 3 * s;
      m.compose(new THREE.Vector3(x, h + trunkH / 2, z), q, new THREE.Vector3(s, trunkH, s));
      set.trunk.push(m.clone());
      const cy = h + trunkH + (kind === 'conifer' ? 3.2 * s : kind === 'jungle' ? 1 * s : kind === 'cactus' ? 0 : 1.6 * s);
      const cs = kind === 'conifer' ? new THREE.Vector3(2.6 * s, 7 * s, 2.6 * s) : kind === 'jungle' ? new THREE.Vector3(5 * s, 1.8 * s, 5 * s) : kind === 'cactus' ? new THREE.Vector3(0.001, 0.001, 0.001) : new THREE.Vector3(3.4 * s, 3 * s, 3.4 * s);
      m.compose(new THREE.Vector3(x, cy, z), q, cs);
      set.canopy.push(m.clone());
      const col = base.clone().offsetHSL(rng.range(-0.04, 0.04), rng.range(-0.1, 0.1), rng.range(-0.1, 0.06));
      set.canopyColors.push(col);
    }
    const rockCount = quality === 'low' ? 120 : 320;
    for (let i = 0; i < rockCount; i++) {
      const x = rng.range(-t.size * 0.48, t.size * 0.48);
      const z = rng.range(-t.size * 0.48, t.size * 0.48);
      if (layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) continue;
      const s = rng.range(0.4, 2.6) * (t.slope(x, z) > 0.4 ? 1.6 : 1);
      q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
      m.compose(new THREE.Vector3(x, t.height(x, z) + s * 0.2, z), q, new THREE.Vector3(s, s * rng.range(0.5, 1), s));
      rocks.push(m.clone());
    }
    return { set, rocks };
  }, [t, layout, quality, kind]);

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    data.set.trunk.forEach((m, i) => trunkRef.current?.setMatrixAt(i, m));
    data.set.canopy.forEach((m, i) => {
      canopyRef.current?.setMatrixAt(i, m);
      canopyRef.current?.setColorAt(i, data.set.canopyColors[i]);
    });
    data.rocks.forEach((m, i) => rockRef.current?.setMatrixAt(i, m));
    for (const r of [trunkRef, canopyRef, rockRef]) {
      if (r.current) {
        r.current.instanceMatrix.needsUpdate = true;
        if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
        r.current.computeBoundingSphere();
      }
    }
  }, [data]);
  const n = data.set.trunk.length;
  const shadows = quality === 'high';
  return (
    <group>
      {n > 0 && (
        <>
          <instancedMesh ref={trunkRef} args={[undefined, undefined, n]} castShadow={shadows} key={`t${n}`}>
            {kind === 'cactus' ? <capsuleGeometry args={[0.45, 0.6, 4, 8]} /> : <cylinderGeometry args={[0.18, 0.3, 1, 6]} />}
            <meshStandardMaterial color={kind === 'cactus' ? '#5f8a4a' : '#5a4636'} roughness={1} />
          </instancedMesh>
          {kind !== 'cactus' && (
            <instancedMesh ref={canopyRef} args={[undefined, undefined, n]} castShadow={shadows} key={`c${n}`}>
              {kind === 'conifer' ? <coneGeometry args={[1, 1, 7]} /> : kind === 'jungle' ? <sphereGeometry args={[1, 8, 5]} /> : <icosahedronGeometry args={[1, 1]} />}
              <meshStandardMaterial roughness={0.9} flatShading />
            </instancedMesh>
          )}
        </>
      )}
      <instancedMesh ref={rockRef} args={[undefined, undefined, data.rocks.length]} castShadow={shadows} receiveShadow key={`r${data.rocks.length}`}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={t.look.cliff} roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}
