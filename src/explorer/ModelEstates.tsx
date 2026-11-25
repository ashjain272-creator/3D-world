import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GEOMETRY } from '../demo/model/kit';
import { makeModelMats, modelShadows } from '../demo/model/materials';
import { nightUniform } from './City';
import { type LodItem, type LodLevel, TiledInstances } from './lod';
import type { Estates } from './modelEstates';

/**
 * Draws the model estates with the demo's own shapes and materials, in tiles that follow the
 * city's draw distance (near tiles from the street, everything from high up). The demo's
 * dusk/day switch becomes the game's clock: windows, pools and lamps brighten as night falls.
 */
export function ModelEstates({ data, y0, quality }: { data: Estates; y0: number; quality: 'low' | 'medium' | 'high' }) {
  const mats = useMemo(() => makeModelMats(), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const sets = useMemo(() => {
    const shadows = quality === 'high';
    const far = quality === 'low' ? 0.6 : 1;
    const out: { key: string; items: LodItem[]; levels: LodLevel[] }[] = [];
    for (const e of data.estates) {
      const offset = new THREE.Matrix4().makeTranslation(e.site.x, y0, e.site.z);
      for (const g of e.kit.groupList()) {
        // tall pieces (tower bodies, fins, the spire) keep the skyline from the street; small
        // pieces (windows, trees, people, cars) draw nearer
        const tall: LodItem[] = [];
        const low: LodItem[] = [];
        for (const it of g.items) {
          const m = offset.clone().multiply(it.m);
          const top = m.elements[13] + Math.abs(m.elements[5]);
          (top > y0 + 30 ? tall : low).push({ m, c: it.c, x: m.elements[12], z: m.elements[14] });
        }
        const s = modelShadows(g.mat);
        for (const [items, size] of [
          [tall, 't'],
          [low, 'b'],
        ] as const) {
          if (!items.length) continue;
          out.push({
            key: `estate-${e.site.kind}-${g.shape}-${g.mat}-${size}`,
            items,
            levels: [{ geometry: GEOMETRY[g.shape], material: mats[g.mat], maxDist: 1100 * far, castShadow: s.cast && shadows, receiveShadow: s.receive && quality !== 'low', groundScale: size === 't' ? 0.85 : 0.5 }],
          });
        }
      }
    }
    return out;
  }, [data, mats, y0, quality]);
  useFrame(() => {
    const n = nightUniform.value;
    // the demo's day and dusk settings, blended by the game's night
    (mats.window as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + n * 1.58;
    (mats.water as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + n * 0.75;
    (mats.glow as THREE.MeshBasicMaterial).color.setScalar(0.9 + n * 0.7);
  });
  return (
    <group>
      {sets.map((s) => (
        <TiledInstances key={s.key} items={s.items} levels={s.levels} tileSize={240} name={s.key} />
      ))}
    </group>
  );
}
