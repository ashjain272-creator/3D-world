import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import type { Collider, Layout } from './layout';
import { inFlat, type TerrainData } from './terrain';
import { generateStructures, type StructureData } from './structures';

/** One instance of a part: transform, colour, and position for tiling. */
export interface PartItem {
  m: THREE.Matrix4;
  c: THREE.Color;
  x: number;
  z: number;
}

/**
 * Part keys map to a geometry + material in Landscape (see PART_SPECS).
 * Trees are assembled from several parts so shapes vary per tree.
 */
export type PartKey =
  | 'trunk0' | 'trunk1' | 'trunk2'
  | 'palmTrunk0' | 'palmTrunk1'
  | 'blob0' | 'blob1' | 'blob2' | 'blob3'
  | 'skirt0' | 'skirt1'
  | 'fronds0' | 'fronds1'
  | 'cactus' | 'barrel' | 'pad'
  | 'bush0' | 'bush1' | 'dryshrub' | 'fern' | 'reed'
  | 'rock0' | 'rock1' | 'rock2'
  | 'log' | 'crystal0' | 'crystal1' | 'lily';

export interface VegetationData {
  parts: Partial<Record<PartKey, PartItem[]>>;
  structures: StructureData;
  /** Trunk cylinders, large rocks and structures block movement. */
  colliders: Collider[];
  /** Snow cover 0..1 (cold worlds): tints the tops of foliage white. */
  snow: number;
  /** Where small features ended up (diagnostics and tests). */
  poi: { mushrooms: [number, number][]; lilies: [number, number][] };
}

type Arche = 'oak' | 'birch' | 'poplar' | 'acacia' | 'spruce' | 'pine' | 'fir' | 'giant' | 'palm' | 'shrubtree' | 'dead' | 'saguaro' | 'barrelcl' | 'pear';

/** Tree mixes by vegetation kind: [archetype, weight]. */
const MIX: Record<string, [Arche, number][]> = {
  broadleaf: [['oak', 5], ['birch', 2], ['poplar', 1.4], ['acacia', 0.6], ['shrubtree', 1.2], ['pine', 0.6]],
  conifer: [['spruce', 5], ['fir', 2.5], ['pine', 2], ['birch', 0.8], ['dead', 0.3]],
  jungle: [['giant', 4], ['palm', 2.5], ['oak', 1], ['shrubtree', 1.5]],
  sparse: [['shrubtree', 3], ['pine', 1.5], ['dead', 1.5], ['fir', 1]],
  cactus: [['saguaro', 3], ['barrelcl', 2.5], ['pear', 2], ['dead', 0.6]],
};
const COAST_MIX: [Arche, number][] = [['palm', 3], ['oak', 2], ['shrubtree', 1.5], ['acacia', 1]];

function pick<T>(rng: Rng, list: [T, number][]): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rng.next() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

/** Deterministic vegetation, rocks and structures for a region (pure; shared by rendering and collision). */
export function generateVegetation(t: TerrainData, layout: Layout, quality: 'low' | 'medium' | 'high'): VegetationData {
  const kind = t.look.vegetation;
  const rng = new Rng(t.seed + 5);
  // floating platforms carry no plants or boulders
  if (layout.style === 'cloud') return { parts: {}, structures: { pieces: [], ponds: [], colliders: [], footprints: [], palms: [], smoke: [] }, colliders: [], snow: 0, poi: { mushrooms: [], lilies: [] } };
  const noise = createNoise2D(() => rng.next());
  const parts: Partial<Record<PartKey, PartItem[]>> = {};
  const poi: VegetationData['poi'] = { mushrooms: [], lilies: [] };
  const colliders: Collider[] = [];
  const snow = t.look.snow ?? 0;
  const put = (key: PartKey, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: THREE.Color, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    (parts[key] ??= []).push({ m, c, x, z });
  };

  // Structures first, so plants keep clear of them.
  const structures = generateStructures(t, layout, rng);
  colliders.push(...structures.colliders);
  const blockedByStructure = (x: number, z: number, r: number) => structures.footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r);

  const base = new THREE.Color(t.look.grassColor);
  const coast = t.waterLevel !== null && t.look.sand && kind === 'broadleaf' && t.look.density < 0.42;
  const SNOW_MIX: [Arche, number][] = [['spruce', 5], ['fir', 3.5], ['dead', 1], ['birch', 0.4]];
  const mix = snow >= 0.45 && kind !== 'none' ? SNOW_MIX : coast ? COAST_MIX : MIX[kind];
  const barkBrown = ['#5e4636', '#6e5240', '#4f3c30', '#76604c'];
  const leafFor = (arche: Arche): THREE.Color => {
    const c = base.clone();
    // archetype hue identity: birch & poplar yellow-green, pines blue-green, acacia olive
    if (arche === 'birch' || arche === 'poplar') c.offsetHSL(-0.04, 0.1, 0.06);
    else if (arche === 'spruce' || arche === 'fir' || arche === 'pine') c.offsetHSL(0.05, -0.08, -0.08);
    else if (arche === 'acacia') c.offsetHSL(-0.06, -0.12, -0.02);
    else if (arche === 'giant') c.offsetHSL(0.01, 0.06, -0.04);
    else if (arche === 'palm') c.offsetHSL(-0.02, 0.12, 0.02);
    else if (arche === 'saguaro' || arche === 'barrelcl' || arche === 'pear') return new THREE.Color('#5f8a52').offsetHSL(rng.range(-0.04, 0.03), rng.range(-0.12, 0.05), rng.range(-0.08, 0.06));
    // rare seasonal accents for colour rhythm
    if ((arche === 'oak' || arche === 'birch') && rng.chance(0.07) && snow < 0.3) c.set(rng.pick(['#b8762e', '#c4923a', '#a85a36', '#d0a040']));
    if (arche === 'giant' && rng.chance(0.05)) c.set(rng.pick(['#d86a8a', '#e09a5a']));
    return c.offsetHSL(rng.range(-0.025, 0.025), rng.range(-0.08, 0.08), rng.range(-0.07, 0.05));
  };
  const blob = () => (`blob${Math.floor(rng.next() * 4)}` as PartKey);
  const trunk = () => (`trunk${Math.floor(rng.next() * 3)}` as PartKey);

  /** Place one tree of the given archetype at (x, h, z) with scale s. */
  const tree = (arche: Arche, x: number, h: number, z: number, s: number) => {
    const ry = rng.range(0, Math.PI * 2);
    const leaf = leafFor(arche);
    const bark = new THREE.Color(rng.pick(barkBrown));
    const L = (dl = 0) => leaf.clone().offsetHSL(rng.range(-0.015, 0.015), 0, dl + rng.range(-0.03, 0.03));
    const crown = (cx: number, cy: number, cz: number, r: number, n: number, squash = 0.8, spread = 0.75) => {
      put(blob(), x + cx, cy, z + cz, r * rng.range(0.9, 1.15), r * squash * rng.range(0.85, 1.1), r * rng.range(0.9, 1.15), L(0), rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
      for (let k = 0; k < n; k++) {
        const a = ry + (k / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const rr = r * rng.range(0.5, 0.75);
        put(blob(), x + cx + Math.cos(a) * r * spread, cy + rng.range(-0.45, 0.35) * r, z + cz + Math.sin(a) * r * spread, rr * rng.range(0.9, 1.2), rr * squash, rr * rng.range(0.9, 1.2), L(rng.range(-0.06, 0.05)), rng.range(0, 6), rng.range(0, 6), 0);
      }
    };
    switch (arche) {
      case 'oak': {
        const th = rng.range(2.6, 3.8) * s;
        put(trunk(), x, h, z, 1.25 * s, th + 1.2 * s, 1.25 * s, bark, 0, ry);
        // two boughs splitting off the trunk
        for (let k = 0; k < 2; k++) put(trunk(), x, h + th * 0.75, z, 0.55 * s, 2.4 * s, 0.55 * s, bark, rng.range(0.5, 0.8) * (k ? 1 : -1), ry + k * 1.4, 0);
        crown(0, h + th + 1.6 * s, 0, 2.5 * s, 3 + Math.floor(rng.next() * 3));
        colliders.push({ type: 'circle', x, z, hw: 0.45 * s, hd: 0 });
        break;
      }
      case 'birch': {
        const th = rng.range(4.5, 6) * s;
        put(trunk(), x, h, z, 0.6 * s, th + 1.5 * s, 0.6 * s, new THREE.Color('#e6e2d6').offsetHSL(0, 0, rng.range(-0.08, 0.02)), 0, ry);
        for (let k = 0; k < 3; k++) put(blob(), x + rng.range(-0.7, 0.7) * s, h + th - 0.6 * s + k * 1.3 * s, z + rng.range(-0.7, 0.7) * s, (1.5 - k * 0.25) * s, 1.3 * s, (1.4 - k * 0.25) * s, L(0.02 * k), rng.range(0, 6), rng.range(0, 6), 0);
        colliders.push({ type: 'circle', x, z, hw: 0.25 * s, hd: 0 });
        break;
      }
      case 'poplar': {
        const th = rng.range(1.5, 2.2) * s;
        put(trunk(), x, h, z, 0.8 * s, th + 2 * s, 0.8 * s, bark, 0, ry);
        put(blob(), x, h + th + 3.6 * s, z, 1.5 * s, 4.4 * s, 1.5 * s, L(0), 0, ry, 0);
        put(blob(), x + 0.4 * s, h + th + 1.9 * s, z, 1.3 * s, 2.4 * s, 1.3 * s, L(-0.04), 0, ry + 2, 0);
        colliders.push({ type: 'circle', x, z, hw: 0.3 * s, hd: 0 });
        break;
      }
      case 'acacia': {
        const th = rng.range(3.5, 4.8) * s;
        put(trunk(), x, h, z, 0.8 * s, th, 0.8 * s, bark, 0.12, ry);
        for (let k = 0; k < 3; k++) {
          const a = ry + k * 2.1;
          put(blob(), x + Math.cos(a) * 1.6 * s, h + th + rng.range(0, 0.6) * s, z + Math.sin(a) * 1.6 * s, 2.4 * s, 0.7 * s, 2.2 * s, L(rng.range(-0.04, 0.04)), 0, a, 0);
        }
        colliders.push({ type: 'circle', x, z, hw: 0.3 * s, hd: 0 });
        break;
      }
      case 'spruce':
      case 'fir': {
        const narrow = arche === 'fir' ? 0.72 : 1;
        const tiers = 4 + Math.floor(rng.next() * 3);
        const th = 1.6 * s;
        put(trunk(), x, h, z, 0.75 * s, th + tiers * 1.5 * s, 0.75 * s, bark, 0, ry);
        let y = h + th;
        for (let k = 0; k < tiers; k++) {
          const f = 1 - k / (tiers + 0.6);
          const r = (2.8 * f + 0.5) * s * narrow;
          const hh = (2.6 - k * 0.12) * s;
          put(`skirt${(k + Math.floor(rng.next() * 2)) % 2}` as PartKey, x, y + hh / 2, z, r, hh, r, L(-0.05 + k * 0.025), 0, ry + k * 0.7, rng.range(-0.04, 0.04));
          y += hh * 0.58;
        }
        colliders.push({ type: 'circle', x, z, hw: 0.35 * s, hd: 0 });
        break;
      }
      case 'pine': {
        const th = rng.range(5.5, 7.5) * s;
        put(trunk(), x, h, z, 0.75 * s, th + 1.5 * s, 0.75 * s, new THREE.Color('#7a5a44'), rng.range(-0.06, 0.06), ry);
        crown(0, h + th + 0.8 * s, 0, 1.7 * s, 3, 0.55, 0.9);
        colliders.push({ type: 'circle', x, z, hw: 0.3 * s, hd: 0 });
        break;
      }
      case 'giant': {
        const th = rng.range(8, 12) * s;
        put(trunk(), x, h, z, 1.6 * s, th + 1 * s, 1.6 * s, bark, 0, ry);
        crown(0, h + th + 1.2 * s, 0, 3.6 * s, 4, 0.5, 0.85);
        crown(rng.range(-1, 1) * s, h + th * 0.62, rng.range(-1, 1) * s, 2.2 * s, 2, 0.5, 0.9);
        colliders.push({ type: 'circle', x, z, hw: 0.6 * s, hd: 0 });
        break;
      }
      case 'palm': {
        const th = rng.range(6, 9) * s;
        const v = Math.floor(rng.next() * 2);
        put(`palmTrunk${v}` as PartKey, x, h, z, 2.2 * s, th, 2.2 * s, new THREE.Color('#8a7256').offsetHSL(0, 0, rng.range(-0.06, 0.04)), 0, ry);
        const lean = (0.18 + v * 0.1) * 2.2 * s;
        put(`fronds${Math.floor(rng.next() * 2)}` as PartKey, x + Math.cos(-ry) * lean * 1.0, h + th, z + Math.sin(-ry) * lean * 1.0, 4 * s, 4 * s, 4 * s, L(0), 0, rng.range(0, 6), 0);
        colliders.push({ type: 'circle', x, z, hw: 0.3 * s, hd: 0 });
        break;
      }
      case 'shrubtree': {
        const th = rng.range(1, 1.8) * s;
        put(trunk(), x, h, z, 0.7 * s, th + 0.8 * s, 0.7 * s, bark, 0, ry);
        crown(0, h + th + 1 * s, 0, 1.5 * s, 2 + Math.floor(rng.next() * 2), 0.8, 0.8);
        colliders.push({ type: 'circle', x, z, hw: 0.25 * s, hd: 0 });
        break;
      }
      case 'dead': {
        const th = rng.range(3, 5) * s;
        const grey = new THREE.Color('#8a7e70').offsetHSL(0, 0, rng.range(-0.1, 0.05));
        put(trunk(), x, h, z, 0.7 * s, th, 0.7 * s, grey, rng.range(-0.1, 0.1), ry);
        for (let k = 0; k < 3; k++) put(trunk(), x, h + th * rng.range(0.45, 0.85), z, 0.28 * s, rng.range(1.2, 2.2) * s, 0.28 * s, grey, rng.range(0.6, 1.1) * (k % 2 ? 1 : -1), ry + k * 2.1, 0);
        colliders.push({ type: 'circle', x, z, hw: 0.25 * s, hd: 0 });
        break;
      }
      case 'saguaro': {
        const th = rng.range(3.2, 5.5) * s;
        const c = leafFor('saguaro');
        put('cactus', x, h, z, 1.3 * s, th, 1.3 * s, c, 0, ry);
        const arms = Math.floor(rng.next() * 3.4);
        for (let k = 0; k < arms; k++) {
          const a = ry + k * 2.3 + rng.range(-0.3, 0.3);
          const ay = h + th * rng.range(0.35, 0.6);
          const ox = Math.cos(a) * 0.75 * s;
          const oz = Math.sin(a) * 0.75 * s;
          put('cactus', x + ox * 0.6, ay, z + oz * 0.6, 0.75 * s, 0.9 * s, 0.75 * s, c, Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4);
          put('cactus', x + ox * 1.25, ay + 0.2 * s, z + oz * 1.25, 0.8 * s, th * rng.range(0.35, 0.5), 0.8 * s, c, 0, a, 0);
        }
        colliders.push({ type: 'circle', x, z, hw: 0.55 * s, hd: 0 });
        break;
      }
      case 'barrelcl': {
        const n = 1 + Math.floor(rng.next() * 4);
        for (let k = 0; k < n; k++) {
          const bs = rng.range(0.7, 1.4) * s;
          put('barrel', x + rng.range(-1, 1) * s, h - 0.1, z + rng.range(-1, 1) * s, bs, bs * rng.range(0.9, 1.4), bs, leafFor('barrelcl'), 0, rng.range(0, 6), 0);
        }
        colliders.push({ type: 'circle', x, z, hw: 0.8 * s, hd: 0 });
        break;
      }
      case 'pear': {
        const c = leafFor('pear');
        const n = 4 + Math.floor(rng.next() * 5);
        for (let k = 0; k < n; k++) {
          const a = rng.range(0, 6.28);
          const r = rng.range(0, 0.9) * s;
          put('pad', x + Math.cos(a) * r, h + rng.range(0.3, 1.6) * s, z + Math.sin(a) * r, 0.55 * s, 0.6 * s, 0.14 * s, c.clone().offsetHSL(0, 0, rng.range(-0.05, 0.05)), rng.range(-0.4, 0.4), a, rng.range(-0.5, 0.5));
        }
        break;
      }
    }
  };

  // ── Trees: density follows two octaves of noise (forests, groves, clearings),
  // with a minimum spacing grid so crowns do not merge into a uniform carpet.
  const max = Math.round((quality === 'high' ? 1700 : quality === 'medium' ? 1000 : 480) * Math.min(1.25, t.look.density + (layout.style === 'wild' ? 0.3 : 0)));
  const cell = 4;
  const occupied = new Set<number>();
  const keyAt = (x: number, z: number) => Math.floor(x / cell) * 4096 + Math.floor(z / cell);
  const near = (x: number, z: number, r: number) => {
    const rc = Math.ceil(r / cell);
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let i = -rc; i <= rc; i++) for (let j = -rc; j <= rc; j++) if (occupied.has((cx + i) * 4096 + (cz + j))) return true;
    return false;
  };
  let placed = 0;
  const tries = !mix ? 0 : max * (kind === 'cactus' ? 9 : 6);
  for (let i = 0; i < tries && placed < max; i++) {
    const x = rng.range(-t.size * 0.47, t.size * 0.47);
    const z = rng.range(-t.size * 0.47, t.size * 0.47);
    const d = Math.hypot(x, z);
    const inCity = (layout.radius > 0 && d < layout.radius + 10) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12);
    if (inCity && !(layout.style === 'organic' && rng.chance(0.08))) continue;
    if (layout.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.hw + 4)) continue;
    if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 18) continue;
    if (layout.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.radius + (layout.style === 'wild' ? 6 : 4))) continue;
    if (blockedByStructure(x, z, 3)) continue;
    const h = t.height(x, z);
    if (t.waterLevel !== null && h < t.waterLevel + 0.8) continue;
    if (t.slope(x, z) > 0.7) continue;
    const field = noise(x / 160, z / 160) * 0.65 + noise(x / 45 + 30, z / 45 - 12) * 0.35;
    const want = Math.max(0, field + 0.15 + t.look.density * 0.45);
    if (rng.next() > want * want * 1.6) continue;
    const s = rng.range(0.75, 1.3) * (rng.chance(0.1) ? 1.4 : 1) * (field < 0 ? 0.85 : 1);
    if (near(x, z, s > 1.2 ? 4.5 : 3)) continue;
    occupied.add(keyAt(x, z));
    // near water on coasts and in jungles, palms dominate
    const wet = t.waterLevel !== null && h < t.waterLevel + 3.5;
    const arche: Arche = wet && (kind === 'jungle' || coast) && rng.chance(0.7) ? 'palm' : pick(rng, mix!);
    tree(arche, x, h, z, s);
    placed++;
  }

  // ── Oasis palms requested by structures.
  for (const p of structures.palms) {
    const h = t.height(p.x, p.z);
    tree('palm', p.x, h, p.z, rng.range(0.85, 1.2));
  }

  // ── Undergrowth: bushes in clumps, ferns in jungle/forest, reeds along shores, dry shrubs in deserts.
  const placeable = (x: number, z: number, minAboveWater = 0.5): number | null => {
    if ((layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12)) return null;
    if (blockedByStructure(x, z, 1)) return null;
    const h = t.height(x, z);
    if (t.waterLevel !== null && h < t.waterLevel + minAboveWater) return null;
    if (t.slope(x, z) > 0.75) return null;
    return h;
  };
  const green = kind === 'conifer' || kind === 'broadleaf' || kind === 'jungle' || kind === 'sparse';
  const bushN = Math.round((quality === 'high' ? 1300 : quality === 'medium' ? 750 : 280) * Math.min(1, t.look.density + 0.35));
  for (let i = 0; i < bushN * 2 && green; i++) {
    const x = rng.range(-t.size * 0.47, t.size * 0.47);
    const z = rng.range(-t.size * 0.47, t.size * 0.47);
    if (noise(x / 60 - 7, z / 60 + 3) < -0.1 && rng.chance(0.75)) continue;
    const h = placeable(x, z);
    if (h === null) continue;
    const s = rng.range(0.5, 1.4);
    const c = base.clone().offsetHSL(rng.range(-0.06, 0.04), rng.range(-0.15, 0.05), rng.range(-0.14, 0.02));
    if (snow > 0.4) c.lerp(new THREE.Color('#dfe6ec'), 0.35);
    if ((kind === 'jungle' || kind === 'conifer') && rng.chance(0.35)) put('fern', x, h, z, s * 1.5, s * 1.2, s * 1.5, c.clone().offsetHSL(0.02, 0.05, -0.04), 0, rng.range(0, 6), 0);
    else put(rng.chance(0.5) ? 'bush0' : 'bush1', x, h + s * 0.3, z, s * rng.range(1, 1.6), s * rng.range(0.6, 0.9), s * rng.range(1, 1.6), c, rng.range(-0.2, 0.2), rng.range(0, 6), 0);
  }
  if (t.waterLevel !== null && green && snow < 0.5) {
    // reeds where the bank meets the water
    for (let i = 0; i < 9000 && (parts.reed?.length ?? 0) < (quality === 'low' ? 150 : 600); i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = t.height(x, z);
      if (h < t.waterLevel - 0.6 || h > t.waterLevel + 0.9) continue;
      if ((layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12)) continue;
      const s = rng.range(0.9, 1.8);
      put('reed', x, Math.max(h, t.waterLevel - 0.4), z, s, s * rng.range(1.2, 2), s, new THREE.Color('#6f8a3e').offsetHSL(rng.range(-0.04, 0.04), 0, rng.range(-0.06, 0.06)), 0, rng.range(0, 6), 0);
    }
  }
  if (kind === 'cactus') {
    // sage-green desert shrubs, some in bloom
    for (let i = 0; i < (quality === 'low' ? 160 : 420); i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = placeable(x, z);
      if (h === null || t.slope(x, z) > 0.4) continue;
      const s = rng.range(0.5, 1.2);
      const bloom = rng.chance(0.22);
      const c = bloom ? new THREE.Color(rng.pick(['#c88ad8', '#e8c040', '#e87858', '#f0e0f0'])) : new THREE.Color('#8a9a6a').offsetHSL(rng.range(-0.03, 0.03), rng.range(-0.1, 0.05), rng.range(-0.08, 0.06));
      put(rng.chance(0.5) ? 'bush0' : 'bush1', x, h + s * 0.25, z, s * rng.range(1, 1.5), s * 0.6, s * rng.range(1, 1.5), c, 0, rng.range(0, 6), 0);
    }
  }
  if (kind === 'cactus' || kind === 'sparse' || kind === 'none') {
    // dry shrubs and tumbleweed
    const n = kind === 'none' ? 0 : quality === 'low' ? 200 : 520;
    for (let i = 0; i < n; i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = placeable(x, z);
      if (h === null) continue;
      const s = rng.range(0.4, 1.1);
      put('dryshrub', x, h + s * 0.35, z, s, s * 0.7, s, new THREE.Color(kind === 'cactus' ? '#9a8452' : '#7d7a5a').offsetHSL(rng.range(-0.03, 0.03), 0, rng.range(-0.08, 0.06)), rng.range(0, 6), rng.range(0, 6), 0);
    }
  }
  if (t.waterLevel !== null && green && snow < 0.4 && !t.look.frozen) {
    // lily pads in calm shallows, a few in flower
    for (let i = 0; i < 12000 && (parts.lily?.length ?? 0) < (quality === 'low' ? 80 : 260); i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = t.height(x, z);
      if (h > t.waterLevel - 0.4 || h < t.waterLevel - 2.5) continue;
      if (noise(x / 25 + 90, z / 25) < 0.15) continue;
      const s = rng.range(0.35, 0.8);
      poi.lilies.push([x, z]);
      put('lily', x, t.waterLevel + 0.04, z, s, 1, s, new THREE.Color('#4f7f3a').offsetHSL(rng.range(-0.03, 0.04), 0, rng.range(-0.08, 0.06)), 0, rng.range(0, 6), 0);
      if (rng.chance(0.18)) put('dryshrub', x + s * 0.3, t.waterLevel + 0.12, z, 0.16, 0.12, 0.16, new THREE.Color(rng.pick(['#f6f0f4', '#f0a8c8', '#f4e070'])), 0, 0, 0);
    }
  }
  if (kind === 'conifer' || kind === 'broadleaf' || kind === 'jungle') {
    // fallen logs and stumps in woodland
    for (let i = 0; i < (quality === 'low' ? 25 : 70); i++) {
      const x = rng.range(-t.size * 0.45, t.size * 0.45);
      const z = rng.range(-t.size * 0.45, t.size * 0.45);
      const h = placeable(x, z, 1);
      if (h === null || noise(x / 160, z / 160) < 0) continue;
      const bark = new THREE.Color(rng.pick(barkBrown)).offsetHSL(0, -0.05, -0.04);
      if (rng.chance(0.6)) {
        const len = rng.range(3, 7);
        put('log', x, h + 0.3, z, len, 0.32, 0.32, bark, 0, rng.range(0, 6), 0);
        colliders.push({ type: 'circle', x, z, hw: 0.6, hd: 0 });
      } else put(trunk(), x, h - 0.1, z, 1.3, 0.6, 1.3, bark, 0, rng.range(0, 6), 0);
    }
  }

  // ── Small things: mushroom rings in damp woods, pebble scatters along shores
  if ((kind === 'conifer' || kind === 'broadleaf' || kind === 'jungle') && snow < 0.4) {
    for (let i = 0; i < (quality === 'low' ? 30 : 110); i++) {
      const x = rng.range(-t.size * 0.45, t.size * 0.45);
      const z = rng.range(-t.size * 0.45, t.size * 0.45);
      const h = placeable(x, z);
      if (h === null || noise(x / 160, z / 160) < 0.05) continue;
      const cap = new THREE.Color(rng.pick(['#b8322a', '#c89a5a', '#8a5a3a', '#e8dcc8']));
      poi.mushrooms.push([x, z]);
      const n = 3 + Math.floor(rng.next() * 6);
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, 6.28);
        const r = rng.range(0, 1.3);
        const s = rng.range(1.1, 2.1);
        const mx = x + Math.cos(a) * r;
        const mz = z + Math.sin(a) * r;
        const my = t.height(mx, mz);
        put(trunk(), mx, my, mz, 0.18 * s, 0.32 * s, 0.18 * s, new THREE.Color('#ece4d4'), 0, 0, 0);
        put(blob(), mx, my + 0.33 * s, mz, 0.2 * s, 0.09 * s, 0.2 * s, cap.clone().offsetHSL(0, 0, rng.range(-0.05, 0.05)), 0, rng.range(0, 6), 0);
      }
    }
  }
  if (t.waterLevel !== null && !t.look.frozen) {
    for (let i = 0; i < 9000 && (parts.rock2?.length ?? 0) < (quality === 'low' ? 100 : 380); i++) {
      const x = rng.range(-t.size * 0.47, t.size * 0.47);
      const z = rng.range(-t.size * 0.47, t.size * 0.47);
      const h = t.height(x, z);
      if (h < t.waterLevel - 0.3 || h > t.waterLevel + 1.6) continue;
      if ((layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12)) continue;
      const s = rng.range(0.08, 0.3);
      put('rock2', x, h - s * 0.3, z, s * 1.3, s * 0.7, s, new THREE.Color(t.look.cliff).offsetHSL(rng.range(-0.03, 0.03), -0.05, rng.range(-0.1, 0.15)), 0, rng.range(0, 6), 0);
    }
  }

  // ── Rocks: clustered, three shapes, mossy tint in green places, frosted when cold.
  const stoneBase = new THREE.Color(t.look.cliff);
  const rockCount = quality === 'low' ? 140 : 360;
  for (let i = 0; i < rockCount; i++) {
    let x = rng.range(-t.size * 0.48, t.size * 0.48);
    let z = rng.range(-t.size * 0.48, t.size * 0.48);
    if ((layout.radius > 0 && Math.hypot(x, z) < layout.radius + 6) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12)) continue;
    if (blockedByStructure(x, z, 2)) continue;
    if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 14) continue;
    const cluster = rng.chance(0.4) ? 2 + Math.floor(rng.next() * 4) : 1;
    for (let k = 0; k < cluster; k++) {
      if (k) {
        x += rng.range(-3, 3);
        z += rng.range(-3, 3);
      }
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 14) continue;
      const slope = t.slope(x, z);
      const s = rng.range(0.35, k ? 1.4 : 2.8) * (slope > 0.4 ? 1.3 : 1);
      const c = stoneBase.clone().offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.05, 0.05), rng.range(-0.1, 0.08));
      if (green && rng.chance(0.3) && snow < 0.3) c.lerp(base, 0.3);
      if (snow > 0.3) c.lerp(new THREE.Color('#4e5662'), 0.45 * snow);
      const lowest = Math.min(t.height(x, z), t.height(x + s, z), t.height(x - s, z), t.height(x, z + s), t.height(x, z - s));
      put(`rock${Math.floor(rng.next() * 3)}` as PartKey, x, lowest - s * (0.15 + Math.min(0.4, slope * 0.35)), z, s * rng.range(0.9, 1.3), s * rng.range(0.55, 1), s * rng.range(0.9, 1.3), c, rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3));
      if (s > 1.3) colliders.push({ type: 'circle', x, z, hw: s * 0.8, hd: 0 });
    }
  }

  // ── Ice crystals on frozen worlds.
  if (snow > 0.5) {
    for (let i = 0; i < (quality === 'low' ? 30 : 80); i++) {
      const x = rng.range(-t.size * 0.45, t.size * 0.45);
      const z = rng.range(-t.size * 0.45, t.size * 0.45);
      if ((layout.radius > 0 && Math.hypot(x, z) < layout.radius + 10) || (t.coastZ !== undefined && z < t.coastZ + 6) || inFlat(t, x, z, 12)) continue;
      if (blockedByStructure(x, z, 3) || Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < 20 || t.slope(x, z) > 0.45) continue;
      const n = 3 + Math.floor(rng.next() * 6);
      const big = rng.range(1, 3.2);
      for (let k = 0; k < n; k++) {
        const s = big * rng.range(0.35, 1);
        const a = rng.range(0, 6.28);
        const r = k ? rng.range(0.4, 1.6) * big : 0;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        put(`crystal${k % 2}` as PartKey, cx, t.height(cx, cz) - 0.5 * s, cz, s, s * rng.range(1.6, 3.4), s, new THREE.Color('#b8e4ff').offsetHSL(rng.range(-0.03, 0.04), 0, rng.range(-0.1, 0.08)), rng.range(-0.45, 0.45), rng.range(0, 6), rng.range(-0.45, 0.45));
      }
      colliders.push({ type: 'circle', x, z, hw: big * 0.8, hd: 0 });
    }
  }

  return { parts, structures, colliders, snow, poi };
}
