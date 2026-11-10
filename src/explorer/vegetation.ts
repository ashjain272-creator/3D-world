import * as THREE from 'three';
import { Rng } from '../sim/rng';
import type { Collider, Layout } from './layout';
import type { TerrainData } from './terrain';

export interface VegetationData {
  trunks: { m: THREE.Matrix4; x: number; z: number }[];
  canopies: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  rocks: { m: THREE.Matrix4; x: number; z: number }[];
  /** Trunk cylinders and large rocks block movement. */
  colliders: Collider[];
}

/** Deterministic vegetation scatter for a region (pure; shared by rendering and collision). */
export function generateVegetation(t: TerrainData, layout: Layout, quality: 'low' | 'medium' | 'high'): VegetationData {
  const kind = t.look.vegetation;
  const rng = new Rng(t.seed + 5);
  const max = Math.round((quality === 'high' ? 2600 : quality === 'medium' ? 1500 : 700) * Math.min(1.2, t.look.density + (layout.style === 'wild' ? 0.3 : 0)));
  const out: VegetationData = { trunks: [], canopies: [], rocks: [], colliders: [] };
  if (kind === 'none') {
    // ice and lava fields still get rocks below
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const base = new THREE.Color(t.look.grassColor);
  const tries = kind === 'none' ? 0 : max * 4;
  for (let i = 0; i < tries && out.trunks.length < max; i++) {
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
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    const trunkH = kind === 'jungle' ? 7 * s : kind === 'cactus' ? 3.2 * s : kind === 'conifer' ? 2.2 * s : 3 * s;
    m.compose(new THREE.Vector3(x, h + trunkH / 2, z), q, new THREE.Vector3(s, trunkH, s));
    out.trunks.push({ m: m.clone(), x, z });
    const cy = h + trunkH + (kind === 'conifer' ? 3.2 * s : kind === 'jungle' ? 1 * s : kind === 'cactus' ? 0 : 1.6 * s);
    const cs = kind === 'conifer' ? new THREE.Vector3(2.6 * s, 7 * s, 2.6 * s) : kind === 'jungle' ? new THREE.Vector3(5 * s, 1.8 * s, 5 * s) : kind === 'cactus' ? new THREE.Vector3(0.001, 0.001, 0.001) : new THREE.Vector3(3.4 * s, 3 * s, 3.4 * s);
    m.compose(new THREE.Vector3(x, cy, z), q, cs);
    out.canopies.push({ m: m.clone(), c: base.clone().offsetHSL(rng.range(-0.04, 0.04), rng.range(-0.1, 0.1), rng.range(-0.1, 0.06)), x, z });
    out.colliders.push({ type: 'circle', x, z, hw: (kind === 'cactus' ? 0.5 : 0.35) * s, hd: 0 });
  }
  const rockCount = quality === 'low' ? 120 : 320;
  for (let i = 0; i < rockCount; i++) {
    const x = rng.range(-t.size * 0.48, t.size * 0.48);
    const z = rng.range(-t.size * 0.48, t.size * 0.48);
    if (layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) continue;
    const s = rng.range(0.4, 2.6) * (t.slope(x, z) > 0.4 ? 1.6 : 1);
    q.setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)));
    m.compose(new THREE.Vector3(x, t.height(x, z) + s * 0.2, z), q, new THREE.Vector3(s, s * rng.range(0.5, 1), s));
    out.rocks.push({ m: m.clone(), x, z });
    if (s > 1.3) out.colliders.push({ type: 'circle', x, z, hw: s * 0.8, hd: 0 });
  }
  return out;
}
