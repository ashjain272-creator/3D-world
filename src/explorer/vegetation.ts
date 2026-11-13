import * as THREE from 'three';
import { Rng } from '../sim/rng';
import type { Collider, Layout } from './layout';
import type { TerrainData } from './terrain';

export interface VegetationData {
  trunks: { m: THREE.Matrix4; x: number; z: number }[];
  canopies: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  rocks: { m: THREE.Matrix4; x: number; z: number }[];
  /** Secondary canopy masses drawn only near the camera (layered crowns, tiers, fronds). */
  canopyExtra: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  bushes: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  grass: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  flowers: { m: THREE.Matrix4; c: THREE.Color; x: number; z: number }[];
  /** Trunk cylinders and large rocks block movement. */
  colliders: Collider[];
}

/** Deterministic vegetation scatter for a region (pure; shared by rendering and collision). */
export function generateVegetation(t: TerrainData, layout: Layout, quality: 'low' | 'medium' | 'high'): VegetationData {
  const kind = t.look.vegetation;
  const rng = new Rng(t.seed + 5);
  const max = Math.round((quality === 'high' ? 2600 : quality === 'medium' ? 1500 : 700) * Math.min(1.2, t.look.density + (layout.style === 'wild' ? 0.3 : 0)));
  const out: VegetationData = { trunks: [], canopies: [], rocks: [], colliders: [], canopyExtra: [], bushes: [], grass: [], flowers: [] };
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
    const s = rng.range(0.7, 1.5) * (rng.chance(0.12) ? 1.45 : 1);
    q.setFromAxisAngle(up, rng.range(0, Math.PI * 2));
    const trunkH = kind === 'jungle' ? 7 * s : kind === 'cactus' ? 3.2 * s : kind === 'conifer' ? 2.2 * s : kind === 'sparse' ? 1.8 * s : 3.4 * s;
    m.compose(new THREE.Vector3(x, h + trunkH / 2, z), q, new THREE.Vector3(s, trunkH, s));
    out.trunks.push({ m: m.clone(), x, z });
    const cy = h + trunkH + (kind === 'conifer' ? 3.2 * s : kind === 'jungle' ? 1 * s : kind === 'cactus' ? 0 : 1.6 * s);
    const cs = kind === 'conifer' ? new THREE.Vector3(2.6 * s, 7 * s, 2.6 * s) : kind === 'jungle' ? new THREE.Vector3(5 * s, 1.8 * s, 5 * s) : kind === 'cactus' ? new THREE.Vector3(0.001, 0.001, 0.001) : new THREE.Vector3(3.4 * s, 3 * s, 3.4 * s);
    m.compose(new THREE.Vector3(x, cy, z), q, cs);
    const leaf = base.clone().offsetHSL(rng.range(-0.04, 0.04), rng.range(-0.1, 0.1), rng.range(-0.1, 0.06));
    out.canopies.push({ m: m.clone(), c: leaf, x, z });
    // Layered crown, visible up close.
    const extra = (ex: number, ey: number, ez: number, sx: number, sy: number, sz: number, dl: number) => {
      m.compose(new THREE.Vector3(x + ex, ey, z + ez), q, new THREE.Vector3(sx, sy, sz));
      out.canopyExtra.push({ m: m.clone(), c: leaf.clone().offsetHSL(rng.range(-0.02, 0.02), 0, dl), x, z });
    };
    if (kind === 'conifer') {
      // skirts of branches down the trunk
      extra(0, h + trunkH + 0.6 * s, 0, 3.5 * s, 3 * s, 3.5 * s, -0.04);
      extra(0, h + trunkH + 2.4 * s, 0, 2.9 * s, 3 * s, 2.9 * s, -0.02);
      extra(0, h + trunkH + 4.3 * s, 0, 2.1 * s, 2.8 * s, 2.1 * s, 0.02);
    } else if (kind === 'jungle') {
      extra(0, cy + 1.3 * s, 0, 3.2 * s, 1.4 * s, 3.2 * s, 0.05);
      const a = rng.range(0, 6.28);
      extra(Math.cos(a) * 2.2 * s, cy - 1.4 * s, Math.sin(a) * 2.2 * s, 2.6 * s, 1.1 * s, 2.6 * s, -0.05);
      extra(Math.cos(a + 2.6) * 1.8 * s, cy - 2.6 * s, Math.sin(a + 2.6) * 1.8 * s, 2 * s, 0.9 * s, 2 * s, -0.08);
    } else if (kind !== 'cactus') {
      const n = kind === 'sparse' ? 1 : 3;
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, 6.28);
        const r = rng.range(1.1, 1.9) * s;
        const bs = rng.range(1.7, 2.5) * s;
        extra(Math.cos(a) * r, cy + rng.range(-1.1, 1.3) * s, Math.sin(a) * r, bs, bs * 0.85, bs, rng.range(-0.06, 0.06));
      }
    } else if (rng.chance(0.6)) {
      // cactus arm
      m.compose(new THREE.Vector3(x + 0.65 * s, h + trunkH * 0.62, z), q, new THREE.Vector3(0.55 * s, trunkH * 0.42, 0.55 * s));
      out.trunks.push({ m: m.clone(), x, z });
    }
    out.colliders.push({ type: 'circle', x, z, hw: (kind === 'cactus' ? 0.5 : 0.35) * s, hd: 0 });
  }
  // Undergrowth: bushes, grass tufts and flowers. Purely visual, no colliders.
  const green = kind === 'conifer' || kind === 'broadleaf' || kind === 'jungle' || kind === 'sparse';
  const placeable = (x: number, z: number): number | null => {
    if (layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) return null;
    const h = t.height(x, z);
    if (t.waterLevel !== null && h < t.waterLevel + 0.5) return null;
    if (t.slope(x, z) > 0.75) return null;
    return h;
  };
  if (green || kind === 'cactus') {
    const bushN = Math.round((quality === 'high' ? 1400 : quality === 'medium' ? 800 : 300) * Math.min(1, t.look.density + 0.35));
    for (let i = 0; i < bushN; i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = placeable(x, z);
      if (h === null) continue;
      const s = rng.range(0.6, 1.5);
      q.setFromAxisAngle(up, rng.range(0, 6.28));
      m.compose(new THREE.Vector3(x, h + s * 0.35, z), q, new THREE.Vector3(s * rng.range(1, 1.5), s * 0.75, s * rng.range(1, 1.5)));
      out.bushes.push({ m: m.clone(), c: base.clone().offsetHSL(rng.range(-0.05, 0.03), rng.range(-0.15, 0.05), rng.range(-0.14, 0.02)), x, z });
    }
  }
  if (green && quality !== 'low') {
    const grassN = Math.round((quality === 'high' ? 42000 : 20000) * Math.min(1, t.look.density + 0.45));
    const petals = ['#f4e36a', '#f2f2f2', '#e88ab0', '#b79af2', '#f0a05a'];
    for (let i = 0; i < grassN; i++) {
      const x = rng.range(-t.size * 0.46, t.size * 0.46);
      const z = rng.range(-t.size * 0.46, t.size * 0.46);
      const h = placeable(x, z);
      if (h === null) continue;
      const s = rng.range(0.4, 0.95) * (kind === 'jungle' ? 1.5 : 1);
      q.setFromAxisAngle(up, rng.range(0, 6.28));
      m.compose(new THREE.Vector3(x, h - 0.05, z), q, new THREE.Vector3(s, s * rng.range(0.8, 1.5), s));
      out.grass.push({ m: m.clone(), c: base.clone().offsetHSL(rng.range(-0.03, 0.05), rng.range(-0.1, 0.1), rng.range(-0.04, 0.12)), x, z });
      if (kind !== 'sparse' && rng.chance(0.045)) {
        const fs = rng.range(0.12, 0.2);
        m.compose(new THREE.Vector3(x + rng.range(-0.3, 0.3), h + s * 0.55, z + rng.range(-0.3, 0.3)), q, new THREE.Vector3(fs, fs * 0.7, fs));
        out.flowers.push({ m: m.clone(), c: new THREE.Color(rng.pick(petals)), x, z });
      }
    }
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
