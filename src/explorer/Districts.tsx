import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TiledInstances, type LodLevel } from './lod';
import { foliageMaterial, texturedMaterial } from './env';
import { frondsGeo, palmTrunkGeo } from './flora';
import { nightUniform } from './City';
import type { DMat, DPiece, DShape, DistrictData } from './districts';

const archGeo = (() => {
  // semicircular head: half a cylinder lying along z, flat side down, radius 0.5, apex at y = 1
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 2, 1);
  return g;
})();

const SHAPES: Record<DShape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18).translate(0, 0.5, 0),
  oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0),
  hemi: new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  gable: (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.55, 0);
    s.lineTo(0.55, 0);
    s.lineTo(0, 1);
    s.lineTo(-0.55, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: false }).translate(0, 0, -0.55);
  })(),
  arch: archGeo,
  palmTrunk: palmTrunkGeo(0),
  fronds: frondsGeo(0),
};

type Quality = 'low' | 'medium' | 'high';

/** Mansions, souk, mall, mosque, temple and boulevard palms of a futuristic city. */
export function Districts({ data, quality }: { data: DistrictData; quality: Quality }) {
  const shadows = quality === 'high';
  const mats = useMemo<Record<DMat, THREE.Material>>(
    () => ({
      plaster: texturedMaterial('plaster', { color: '#ffffff', roughness: 0.85 }),
      stone: texturedMaterial('paving', { color: '#ffffff', roughness: 0.9 }),
      marble: texturedMaterial('tiles', { color: '#ffffff', roughness: 0.35 }),
      roof: texturedMaterial('tiles', { color: '#ffffff', roughness: 0.85 }),
      wood: texturedMaterial('wood', { color: '#ffffff', roughness: 0.8 }),
      cloth: texturedMaterial('cloth', { color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }),
      bark: texturedMaterial('bark', { color: '#ffffff', roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.6 }),
      // gold leaf: without an environment map a fully metallic surface reads brown, so keep it
      // partly dielectric with a warm glow of its own
      gold: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.45, emissive: new THREE.Color('#6a4a10'), emissiveIntensity: 0.35 }),
      // window glass: dark and reflective by day, warm interior light after dark
      glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.55, emissive: new THREE.Color('#ffb868'), emissiveIntensity: 0 }),
      // pools and fountains glow turquoise from underwater lights at night
      water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0.15, emissive: new THREE.Color('#2ab8e0'), emissiveIntensity: 0.12 }),
      leaf: foliageMaterial({ flat: true, double: true, sway: 0.06 }),
      lawn: texturedMaterial('cloth', { color: '#ffffff', roughness: 1 }),
      glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      dark: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    const n = nightUniform.value;
    (mats.glass as THREE.MeshStandardMaterial).emissiveIntensity = n * 0.9;
    (mats.water as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + n * 1.1;
  });
  const groups = useMemo(() => {
    const g = new Map<string, DPiece[]>();
    for (const p of data.pieces) {
      const k = `${p.shape}|${p.mat}|${p.small ? 's' : 'b'}`;
      const list = g.get(k);
      if (list) list.push(p);
      else g.set(k, [p]);
    }
    const far = quality === 'low' ? 0.6 : 1;
    return [...g.entries()].map(([k, list]) => {
      const [shape, mat, size] = k.split('|') as [DShape, DMat, string];
      const small = size === 's';
      return {
        k,
        items: list,
        levels: [{ geometry: SHAPES[shape], material: mats[mat], maxDist: (small ? 240 : 1100) * far, castShadow: shadows && !small, receiveShadow: true }] as LodLevel[],
      };
    });
  }, [data, mats, shadows, quality]);
  return (
    <group>
      {groups.map((g) => (
        <TiledInstances key={g.k} items={g.items} levels={g.levels} tileSize={90} name={`district-${g.k}`} />
      ))}
    </group>
  );
}
