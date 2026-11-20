import * as THREE from 'three';
import type { Rng } from '../sim/rng';
import type { Collider, Layout } from './layout';
import type { TerrainData } from './terrain';

/**
 * Hand-placed-feeling points of interest in the wilds, built from simple
 * blocks: stepped desert temples, wells, oases, ruins and mesas; standing
 * stones and ruined watchtowers in temperate lands; cairns in the mountains;
 * igloos and ice spires on frozen worlds.
 */
export type StructMat = 'sandstone' | 'stone' | 'wood' | 'cloth' | 'ice' | 'snow' | 'gold' | 'metal' | 'glow' | 'glowCold' | 'bone' | 'dark';
export type StructShape = 'box' | 'cyl' | 'cone' | 'pyramid' | 'hemi' | 'arc';

export interface StructPiece {
  shape: StructShape;
  mat: StructMat;
  m: THREE.Matrix4;
  c: THREE.Color;
  x: number;
  z: number;
}

export interface StructureData {
  pieces: StructPiece[];
  /** Small ponds (oases): centre, radius, surface height. */
  ponds: { x: number; z: number; r: number; y: number }[];
  colliders: Collider[];
  /** Areas kept clear of trees and rocks. */
  footprints: { x: number; z: number; r: number; kind?: string }[];
  /** Palm positions requested by oases. */
  palms: { x: number; z: number }[];
  /** Smoke plume sources (campfires, hearths). */
  smoke: { x: number; y: number; z: number; s?: number }[];
}

export function generateStructures(t: TerrainData, layout: Layout, rng: Rng): StructureData {
  const out: StructureData = { pieces: [], ponds: [], colliders: [], footprints: [], palms: [], smoke: [] };
  if (layout.style !== 'wild') return out;
  const kind = t.look.vegetation;
  const snow = t.look.snow ?? 0;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const add = (shape: StructShape, mat: StructMat, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string | THREE.Color, ry = 0, rx = 0, rz = 0) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    out.pieces.push({ shape, mat, m, c: typeof color === 'string' ? new THREE.Color(color) : color, x, z });
  };
  const box = (x: number, z: number, hw: number, hd: number) => out.colliders.push({ type: 'box', x, z, hw, hd });
  const circ = (x: number, z: number, r: number) => out.colliders.push({ type: 'circle', x, z, hw: r, hd: 0 });
  const vary = (hex: string, l = 0.06) => new THREE.Color(hex).offsetHSL(rng.range(-0.01, 0.01), 0, rng.range(-l, l));
  /** Find a reasonably flat, dry spot away from the spawn, landmarks and other structures. */
  const site = (r: number, minDist = 60, maxDist = 290, kind = ''): { x: number; z: number; y: number } | null => {
    for (let k = 0; k < 80; k++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(minDist, maxDist);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < r + 25) continue;
      if (layout.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.radius + r + 10)) continue;
      if (out.footprints.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + r + 12)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 8; i++) {
        const h = t.height(x + Math.cos(i * 0.785) * r, z + Math.sin(i * 0.785) * r);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      if (hi - lo > Math.max(2.5, r * 0.18)) continue;
      if (t.waterLevel !== null && lo < t.waterLevel + 1) continue;
      out.footprints.push({ x, z, r, kind });
      return { x, z, y: lo };
    }
    return null;
  };

  const temple = () => {
    const s = site(20, 55, 150, 'temple');
    if (!s) return;
    const ry = rng.range(0, Math.PI * 2);
    const rot = (lx: number, lz: number) => [s.x + lx * Math.cos(ry) - lz * Math.sin(ry), s.z + lx * Math.sin(ry) + lz * Math.cos(ry)] as const;
    const tiers = 5;
    let y = s.y - 1;
    for (let k = 0; k < tiers; k++) {
      const w = 26 - k * 4.4;
      const h = 3.2;
      add('box', 'sandstone', s.x, y, s.z, w, h + (k === 0 ? 1 : 0), w, vary(k % 2 ? '#d8b47a' : '#cfa86c', 0.03), ry);
      // terracotta band along the top edge of each tier
      add('box', 'sandstone', s.x, y + h - 0.35 + (k === 0 ? 1 : 0), s.z, w + 0.3, 0.45, w + 0.3, vary('#b8643a', 0.04), ry);
      y += h + (k === 0 ? 1 : 0);
    }
    // stair ramp up the front, entrance, shrine and corner pillars
    const [fx, fz] = rot(0, 14);
    add('box', 'sandstone', fx, s.y - 1, fz, 6, 5, 12, vary('#c89e62', 0.03), ry, -0.62);
    const [ex, ez] = rot(0, 13.1);
    add('box', 'stone', ex, s.y, ez, 3.4, 4.6, 0.6, '#2a1e16', ry);
    add('box', 'sandstone', s.x, y, s.z, 5, 4, 5, vary('#e0c08a', 0.02), ry);
    add('pyramid', 'gold', s.x, y + 4, s.z, 5.6, 3.5, 5.6, '#d8a844', ry);
    for (const [cx, cz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]] as const) {
      const [px, pz] = rot(cx, cz);
      add('box', 'sandstone', px, s.y - 1, pz, 2.4, 9 + rng.range(0, 2), 2.4, vary('#d4ae74', 0.03), ry);
      add('pyramid', 'sandstone', px, s.y + 8.4, pz, 3, 2.2, 3, vary('#b8643a', 0.03), ry);
    }
    circ(s.x, s.z, 14);
  };

  const well = () => {
    const s = site(4, 22, 70, 'well');
    if (!s) return;
    add('cyl', 'sandstone', s.x, s.y - 0.4, s.z, 3.2, 1.5, 3.2, vary('#cfae7c'));
    add('cyl', 'stone', s.x, s.y + 0.6, s.z, 2.5, 0.52, 2.5, '#1a2a34');
    for (const side of [-1, 1]) add('box', 'wood', s.x + side * 1.3, s.y, s.z, 0.25, 3.2, 0.25, '#6a4a30');
    add('box', 'wood', s.x, s.y + 3.1, s.z, 3, 0.2, 0.2, '#5a3e28');
    add('pyramid', 'cloth', s.x, s.y + 3.2, s.z, 3.6, 1.2, 2.4, vary('#a8442e', 0.04));
    add('box', 'wood', s.x + 0.4, s.y + 1.9, s.z, 0.5, 0.5, 0.5, '#7a5a3a');
    circ(s.x, s.z, 1.8);
  };

  const ruins = (mat: StructMat, tone: string) => {
    const s = site(14, 35, 120, 'ruins');
    if (!s) return;
    const ry = rng.range(0, Math.PI * 2);
    const rot = (lx: number, lz: number) => [s.x + lx * Math.cos(ry) - lz * Math.sin(ry), s.z + lx * Math.sin(ry) + lz * Math.cos(ry)] as const;
    // broken walls of a rectangular enclosure
    for (let side = 0; side < 4; side++) {
      const segs = 4;
      for (let k = 0; k < segs; k++) {
        if (rng.chance(0.3)) continue;
        const along = -9 + (k + 0.5) * (18 / segs);
        const [lx, lz] = side === 0 ? [along, -9] : side === 1 ? [9, along] : side === 2 ? [along, 9] : [-9, along];
        const [px, pz] = rot(lx, lz);
        const h = rng.range(1, 4.5);
        add('box', mat, px, s.y - 0.3, pz, side % 2 ? 1.2 : 4.6, h, side % 2 ? 4.6 : 1.2, vary(tone), ry);
        box(px, pz, side % 2 ? 0.8 : 2.3, side % 2 ? 2.3 : 0.8);
      }
    }
    // columns, some standing, some fallen
    for (let k = 0; k < 6; k++) {
      const [px, pz] = rot(-5 + (k % 3) * 5, k < 3 ? -3 : 3);
      if (rng.chance(0.35)) add('cyl', mat, px + rng.range(-1, 1), s.y + 0.5, pz + 2, 1.1, rng.range(3, 6), 1.1, vary(tone), ry + rng.range(-0.5, 0.5), Math.PI / 2);
      else {
        const h = rng.range(2, 6.5);
        add('cyl', mat, px, s.y - 0.2, pz, 1.1, h, 1.1, vary(tone));
        if (rng.chance(0.6)) add('box', mat, px, s.y - 0.2 + h, pz, 1.6, 0.5, 1.6, vary(tone));
        circ(px, pz, 0.6);
      }
    }
  };

  const oasis = () => {
    const s = site(16, 45, 160, 'oasis');
    if (!s) return;
    const r = rng.range(7, 11);
    out.ponds.push({ x: s.x, z: s.z, r, y: s.y + 0.15 });
    add('cyl', 'stone', s.x, s.y - 0.3, s.z, r * 2 + 1.5, 0.5, r * 2 + 1.5, '#b89a6a');
    const n = 5 + Math.floor(rng.next() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      out.palms.push({ x: s.x + Math.cos(a) * (r + rng.range(1.5, 4)), z: s.z + Math.sin(a) * (r + rng.range(1.5, 4)) });
    }
    // a small camp: tent and crates
    const a = rng.range(0, 6.28);
    const tx = s.x + Math.cos(a) * (r + 7);
    const tz = s.z + Math.sin(a) * (r + 7);
    add('pyramid', 'cloth', tx, t.height(tx, tz) - 0.1, tz, 5, 3.2, 4, vary(rng.pick(['#c8b48a', '#a8442e', '#3a6a8a'])), a);
    add('box', 'wood', tx + 3, t.height(tx, tz), tz + 1, 0.9, 0.9, 0.9, '#7a5a3a', a);
    add('box', 'wood', tx + 3.2, t.height(tx, tz) + 0.9, tz + 1.1, 0.7, 0.7, 0.7, '#8a6a44', a + 0.4);
    circ(tx, tz, 2.4);
  };

  const mesa = () => {
    const s = site(26, 160, 330, 'mesa');
    if (!s) return;
    const layers = 4 + Math.floor(rng.next() * 3);
    let y = s.y - 2;
    let w = rng.range(22, 34);
    const ry = rng.range(0, 6.28);
    const bands = ['#c2763e', '#d29a5a', '#b45a32', '#dcae72', '#a8502e'];
    for (let k = 0; k < layers; k++) {
      const h = rng.range(4, 8);
      add('cyl', 'sandstone', s.x + rng.range(-1, 1), y, s.z + rng.range(-1, 1), w, h, w * rng.range(0.7, 1), vary(bands[k % bands.length], 0.03), ry + k * 0.3);
      y += h;
      w *= rng.range(0.82, 0.96);
    }
    circ(s.x, s.z, w * 0.5);
  };

  const arch = () => {
    const s = site(10, 80, 300, 'arch');
    if (!s) return;
    const ry = rng.range(0, 6.28);
    const tone = '#c8804a';
    for (const side of [-1, 1]) {
      const px = s.x + Math.cos(ry) * side * 6;
      const pz = s.z + Math.sin(ry) * side * 6;
      add('cyl', 'sandstone', px, s.y - 0.5, pz, 4, 12, 3.4, vary(tone), ry);
      circ(px, pz, 1.8);
    }
    add('box', 'sandstone', s.x, s.y + 10.5, s.z, 16, 3, 3.4, vary('#b8703e'), ry);
  };

  const stoneCircle = () => {
    const s = site(11, 30, 110, 'stones');
    if (!s) return;
    const n = 9 + Math.floor(rng.next() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = s.x + Math.cos(a) * 9;
      const pz = s.z + Math.sin(a) * 9;
      if (rng.chance(0.15)) {
        add('box', 'stone', px, t.height(px, pz) + 0.4, pz, 1.4, 4, 0.9, vary('#8a8a84'), a, Math.PI / 2 - 0.1);
        continue;
      }
      add('box', 'stone', px, t.height(px, pz) - 0.4, pz, rng.range(1.2, 1.8), rng.range(3.5, 5.5), rng.range(0.8, 1.1), vary('#8e8e88'), a + Math.PI / 2, rng.range(-0.08, 0.08));
      circ(px, pz, 0.8);
    }
    add('box', 'stone', s.x, s.y - 0.2, s.z, 3, 0.9, 1.6, vary('#7a7a74'), rng.range(0, 6));
  };

  const tower = () => {
    const s = site(6, 30, 130, 'tower');
    if (!s) return;
    const tone = snow > 0.4 ? '#9a9aa0' : '#8a8274';
    const h = rng.range(9, 15);
    // ring of wall blocks with a ragged top, stair-step gaps and a doorway
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = s.x + Math.cos(a) * 4;
      const pz = s.z + Math.sin(a) * 4;
      if (k === 0) {
        add('box', 'stone', px, s.y + 3, pz, 1.9, h - 3 - rng.range(0, 3), 1.2, vary(tone), -a + Math.PI / 2);
        continue;
      }
      add('box', 'stone', px, s.y - 0.4, pz, 1.9, h * rng.range(0.55, 1), 1.2, vary(tone), -a + Math.PI / 2);
    }
    circ(s.x, s.z, 4.6);
  };

  const cairns = () => {
    for (let c = 0; c < 4; c++) {
      const s = site(2, 40, 300, 'cairn');
      if (!s) return;
      let y = s.y - 0.1;
      for (let k = 0; k < 5; k++) {
        const r = 1.1 - k * 0.17;
        add('hemi', 'stone', s.x + rng.range(-0.1, 0.1), y, s.z + rng.range(-0.1, 0.1), r * 2, r * 1.2, r * 2, vary('#8a8680', 0.1), rng.range(0, 6));
        y += r * 0.55;
      }
      circ(s.x, s.z, 1);
    }
  };

  const igloo = () => {
    const s = site(6, 25, 90, 'igloo');
    if (!s) return;
    add('hemi', 'snow', s.x, s.y - 0.3, s.z, 7, 7, 7, '#eef4f8');
    const a = rng.range(0, 6.28);
    const ex = s.x + Math.cos(a) * 3.4;
    const ez = s.z + Math.sin(a) * 3.4;
    add('cyl', 'snow', ex, s.y - 0.3, ez, 2.2, 1.8, 2.2, '#e6eef4', 0, 0, 0);
    add('box', 'stone', s.x + Math.cos(a) * 4.5, s.y - 0.3, s.z + Math.sin(a) * 4.5, 1.2, 1.5, 0.3, '#1a2430', -a + Math.PI / 2);
    circ(s.x, s.z, 3.5);
  };

  const iceSpires = () => {
    const s = site(10, 60, 320, 'spires');
    if (!s) return;
    const n = 5 + Math.floor(rng.next() * 5);
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, 6.28);
      const r = k ? rng.range(2, 8) : 0;
      const px = s.x + Math.cos(a) * r;
      const pz = s.z + Math.sin(a) * r;
      const h = rng.range(8, k ? 18 : 28);
      add('cone', 'ice', px, s.y - 1, pz, rng.range(2.5, 4.5), h, rng.range(2.5, 4.5), vary('#a8dcf4', 0.08), rng.range(0, 6), rng.range(-0.12, 0.12), rng.range(-0.12, 0.12));
      circ(px, pz, 1.4);
    }
  };


  /** A cluster of flat-roofed mud-brick houses around a small square with a well and a market stall. */
  const village = () => {
    const s = site(26, 30, 110, 'village');
    if (!s) return;
    const n = 5 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const d = rng.range(13, 19);
      const hx = s.x + Math.cos(a) * d;
      const hz = s.z + Math.sin(a) * d;
      const hy = t.height(hx, hz) - 0.4;
      const w = rng.range(5, 7.5);
      const dp = rng.range(5, 7);
      const h = rng.range(3.2, 4.4);
      const ry = -a + Math.PI / 2;
      const wall = vary(rng.pick(['#e6c08e', '#efcfa0', '#dcb080', '#f4dab0', '#e8c49a']), 0.03);
      add('box', 'sandstone', hx, hy, hz, w, h, dp, wall, ry);
      add('box', 'sandstone', hx, hy + h, hz, w + 0.3, 0.55, dp + 0.3, wall.clone().offsetHSL(0, 0, -0.06), ry);
      if (rng.chance(0.5)) add('box', 'sandstone', hx + Math.cos(ry) * w * 0.15, hy + h + 0.55, hz - Math.sin(ry) * w * 0.15, w * 0.55, h * 0.7, dp * 0.6, wall.clone().offsetHSL(0, 0, 0.03), ry);
      // door and windows face the square
      const fx = hx - Math.cos(a) * (dp / 2 + 0.02);
      const fz = hz - Math.sin(a) * (dp / 2 + 0.02);
      add('box', 'dark', fx, hy + 0.4, fz, 1.3, 2.2, 0.15, '#2a1a10', ry);
      add('box', 'cloth', fx - Math.cos(a) * 0.9, hy + 2.7, fz - Math.sin(a) * 0.9, 2.6, 0.08, 1.8, vary(rng.pick(['#b8442e', '#2e6a8a', '#d8a030', '#6a8a3a', '#e8e0d0'])), ry, -0.25);
      for (const side of [-1, 1]) add('box', 'dark', fx + Math.cos(ry) * side * w * 0.3, hy + 2.2, fz - Math.sin(ry) * side * w * 0.3, 0.7, 0.7, 0.12, '#24180e', ry);
      // roof beams poking out of the wall (vigas)
      for (let v = 0; v < 4; v++) add('cyl', 'wood', hx + Math.cos(ry) * (v - 1.5) * w * 0.22 - Math.cos(a) * dp * 0.5, hy + h - 0.3, hz - Math.sin(ry) * (v - 1.5) * w * 0.22 - Math.sin(a) * dp * 0.5, 0.22, 0.9, 0.22, '#5a3e28', ry, Math.PI / 2);
      // pots by the door
      for (let p = 0; p < 2 + Math.floor(rng.next() * 3); p++) add('cyl', 'sandstone', fx - Math.cos(a) * 0.8 + Math.cos(ry) * rng.range(1, 2.4), hy + 0.4, fz - Math.sin(a) * 0.8 - Math.sin(ry) * rng.range(1, 2.4), rng.range(0.5, 0.8), rng.range(0.6, 1), rng.range(0.5, 0.8), vary('#a8583a', 0.06));
      box(hx, hz, Math.max(w, dp) / 2, Math.max(w, dp) / 2);
    }
    // the square: a well and a market stall
    add('cyl', 'sandstone', s.x, s.y - 0.4, s.z, 3, 1.4, 3, vary('#cfae7c'));
    add('cyl', 'dark', s.x, s.y + 0.55, s.z, 2.4, 0.5, 2.4, '#1a2a34');
    circ(s.x, s.z, 1.6);
    const mx = s.x + 5;
    const mz = s.z + 2;
    for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) add('cyl', 'wood', mx + px, s.y - 0.2, mz + pz, 0.18, 2.8, 0.18, '#6a4a30');
    add('box', 'cloth', mx, s.y + 2.6, mz, 3.8, 0.08, 3, vary('#c8502e', 0.04), 0, 0.12);
    add('box', 'wood', mx, s.y + 0.4, mz, 3, 0.9, 1.4, '#7a5a3a');
    for (let k = 0; k < 6; k++) add('hemi', 'cloth', mx - 1.2 + k * 0.48, s.y + 1.3, mz, 0.45, 0.35, 0.45, vary(rng.pick(['#e8b030', '#c84a2a', '#6a9a3a', '#e8e0c0'])));
    circ(mx, mz, 1.8);
    // a domed clay bread oven, still smoking
    const ox = s.x - 5;
    const oz = s.z - 3;
    add('hemi', 'sandstone', ox, s.y - 0.2, oz, 2.6, 2.4, 2.6, vary('#c89868', 0.04));
    add('box', 'dark', ox + 1.25, s.y + 0.1, oz, 0.12, 0.7, 0.8, '#1e120a');
    add('box', 'glow', ox + 1.27, s.y + 0.15, oz, 0.06, 0.4, 0.55, '#ff9a40');
    out.smoke.push({ x: ox, y: s.y + 1.1, z: oz, s: 0.9 });
    circ(ox, oz, 1.4);
  };

  /** The bleached skeleton of something enormous, half swallowed by the sand. */
  const skeleton = () => {
    const s = site(16, 40, 150, 'skeleton');
    if (!s) return;
    const ry = rng.range(0, Math.PI * 2);
    const dx = Math.cos(ry);
    const dz = Math.sin(ry);
    const bone = '#e6dac0';
    for (let k = 0; k < 14; k++) {
      const along = -13 + k * 2;
      const px = s.x + dx * along;
      const pz = s.z + dz * along;
      const y = t.height(px, pz);
      add('hemi', 'bone', px, y - 0.3, pz, 1.4 - Math.abs(k - 6) * 0.06, 1.1, 1.4, vary(bone, 0.04), -ry);
      if (k > 2 && k < 11) {
        const r = 3.6 - Math.abs(k - 6.5) * 0.35;
        add('arc', 'bone', px, y - 0.6, pz, r * 2, r * 2.2, r * 2, vary(bone, 0.04), -ry + Math.PI / 2);
      }
    }
    const hx = s.x + dx * 16;
    const hz = s.z + dz * 16;
    const hy = t.height(hx, hz);
    add('box', 'bone', hx, hy - 0.4, hz, 4.2, 2.4, 3, vary(bone, 0.03), -ry, 0, 0.15);
    add('cone', 'bone', hx + dx * 2.6, hy + 0.2, hz + dz * 2.6, 1.6, 3.4, 1.6, vary(bone, 0.03), 0, Math.sin(ry) * 1.2, -Math.cos(ry) * 1.2);
    add('box', 'dark', hx + dz * 1.3, hy + 1.1, hz - dx * 1.3, 0.9, 0.7, 0.5, '#2a2018', -ry);
    add('box', 'dark', hx - dz * 1.3, hy + 1.1, hz + dx * 1.3, 0.9, 0.7, 0.5, '#2a2018', -ry);
    circ(s.x, s.z, 4);
    circ(hx, hz, 2.5);
  };

  /** Sandstone hoodoos: banded pillars with balanced cap rocks. */
  const hoodoos = () => {
    const s = site(12, 50, 230, 'hoodoos');
    if (!s) return;
    const bands = ['#c8783e', '#dca064', '#b85a32', '#e8bc80'];
    const n = 3 + Math.floor(rng.next() * 4);
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, 6.28);
      const r = k ? rng.range(3, 9) : 0;
      const px = s.x + Math.cos(a) * r;
      const pz = s.z + Math.sin(a) * r;
      let y = t.height(px, pz) - 0.5;
      let w = rng.range(2.4, 3.6);
      const segs = 3 + Math.floor(rng.next() * 3);
      for (let j = 0; j < segs; j++) {
        const hh = rng.range(1.8, 3.2);
        add('cyl', 'sandstone', px, y, pz, w, hh, w * rng.range(0.85, 1), vary(bands[(j + k) % bands.length], 0.03), rng.range(0, 6));
        y += hh;
        w *= rng.range(0.78, 0.95);
      }
      add('hemi', 'stone', px, y - 0.2, pz, w * 2.2, 1.6, w * 2, vary('#7a4a30'), rng.range(0, 6));
      circ(px, pz, 1.4);
    }
  };

  /** A pair of obelisks with gilded tips, flanking an old road. */
  const obelisks = () => {
    const s = site(8, 35, 160, 'obelisks');
    if (!s) return;
    const ry = rng.range(0, 6.28);
    for (const side of [-1, 1]) {
      const px = s.x + Math.cos(ry) * side * 5;
      const pz = s.z + Math.sin(ry) * side * 5;
      const y = t.height(px, pz) - 0.3;
      add('box', 'sandstone', px, y, pz, 2.4, 1, 2.4, vary('#c89a64'), ry);
      add('box', 'sandstone', px, y + 1, pz, 1.4, 11, 1.4, vary('#d8b07a', 0.03), ry);
      add('pyramid', 'gold', px, y + 12, pz, 1.4, 1.6, 1.4, '#d8a844', ry);
      circ(px, pz, 1.3);
    }
  };

  /** A prefab research station: modules, a radio mast, a dish, solar panels and lit windows. */
  const outpost = () => {
    const s = site(16, 28, 110, 'outpost');
    if (!s) return;
    const ry = rng.range(0, Math.PI * 2);
    const rot = (lx: number, lz: number) => [s.x + lx * Math.cos(ry) - lz * Math.sin(ry), s.z + lx * Math.sin(ry) + lz * Math.cos(ry)] as const;
    const orange = '#d8642a';
    // two modules on stilts joined by a tube
    for (const [lx, w] of [[-4.5, 9], [5.5, 6]] as const) {
      const [px, pz] = rot(lx, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const [qx, qz] = rot(lx + sx * (w / 2 - 0.4), sz * 2);
        add('cyl', 'metal', qx, s.y - 0.5, qz, 0.25, 1.6, 0.25, '#5a5e64');
      }
      add('box', 'metal', px, s.y + 1, pz, w, 3.2, 4.6, vary(lx < 0 ? orange : '#e8e4dc', 0.02), ry);
      add('box', 'snow', px, s.y + 4.2, pz, w + 0.3, 0.35, 4.9, '#eef4f8', ry);
      // a strip of lit windows down one side
      const [wx, wz] = rot(lx, 2.32);
      add('box', 'glow', wx, s.y + 2.3, wz, w * 0.7, 0.7, 0.08, '#ffc890', ry);
      box(px, pz, w / 2 + 0.3, 2.6);
    }
    const [tx, tz] = rot(1.1, 0);
    add('cyl', 'metal', tx, s.y + 2.4, tz, 1.4, 2.4, 1.4, '#9aa0a8', ry, 0, Math.PI / 2);
    // radio mast with crossbars and a red beacon
    const [mx, mz] = rot(-10, -5);
    add('cyl', 'metal', mx, s.y - 0.5, mz, 0.3, 16, 0.3, '#c8ccd0');
    for (let k = 1; k < 5; k++) add('box', 'metal', mx, s.y - 0.5 + k * 3.2, mz, 2.2 - k * 0.3, 0.12, 0.12, '#c8ccd0', ry);
    add('hemi', 'glow', mx, s.y + 15.5, mz, 0.7, 0.6, 0.7, '#ff3a2a');
    circ(mx, mz, 0.6);
    // tilted dish
    const [dx, dz] = rot(10, -4);
    add('cyl', 'metal', dx, s.y - 0.5, dz, 0.4, 3, 0.4, '#8a9096');
    add('hemi', 'metal', dx, s.y + 3, dz, 4, 1.2, 4, '#e8ecf0', ry, 0.9, 0);
    circ(dx, dz, 1);
    // solar panels and fuel tanks
    for (let k = 0; k < 3; k++) {
      const [px, pz] = rot(-3 + k * 3.4, -7);
      add('box', 'metal', px, s.y + 1.1, pz, 2.8, 0.1, 1.8, '#1e3a6a', ry, -0.5);
      add('cyl', 'metal', px, s.y - 0.3, pz, 0.12, 1.3, 0.12, '#5a5e64');
    }
    for (let k = 0; k < 2; k++) {
      const [px, pz] = rot(8 + k * 2.2, 4);
      add('cyl', 'metal', px, s.y + 0.9, pz, 1.8, 3.6, 1.8, vary('#c8b040', 0.04), ry, 0, Math.PI / 2);
      circ(px, pz, 1.2);
    }
    for (let k = 0; k < 4; k++) {
      const [px, pz] = rot(-9 + k * 1.1, 4 + (k % 2) * 0.8);
      add('box', 'wood', px, s.y - 0.1, pz, 1, 0.9, 1, '#7a5a3a', ry + k);
    }
  };

  /** Three or four igloos around a campfire, with a sled. */
  const iglooVillage = () => {
    const s = site(14, 28, 110, 'igloo-village');
    if (!s) return;
    const n = 3 + Math.floor(rng.next() * 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const ix = s.x + Math.cos(a) * 9;
      const iz = s.z + Math.sin(a) * 9;
      const iy = t.height(ix, iz) - 0.3;
      const size = rng.range(5.5, 7.5);
      add('hemi', 'snow', ix, iy, iz, size, size, size, '#eef4f8');
      // entrance tunnel facing the fire, with a warm glow inside
      const ex = ix - Math.cos(a) * size * 0.45;
      const ez = iz - Math.sin(a) * size * 0.45;
      add('hemi', 'snow', ex, iy, ez, 2.6, 2.4, 2.6, '#e6eef4');
      add('box', 'glow', ix - Math.cos(a) * size * 0.62, iy + 0.1, iz - Math.sin(a) * size * 0.62, 1.1, 1.1, 0.12, '#ffae5a', -a + Math.PI / 2);
      circ(ix, iz, size * 0.48);
    }
    // campfire: ring of stones, logs and a glowing flame
    for (let k = 0; k < 8; k++) add('hemi', 'stone', s.x + Math.cos(k * 0.785) * 1.3, s.y - 0.05, s.z + Math.sin(k * 0.785) * 1.3, 0.6, 0.45, 0.6, vary('#5a5a5a', 0.08));
    for (let k = 0; k < 3; k++) add('cyl', 'wood', s.x, s.y + 0.2, s.z, 0.25, 1.8, 0.25, '#4a3020', k * 1.05, Math.PI / 2 - 0.3);
    add('cone', 'glow', s.x, s.y + 0.1, s.z, 1.1, 1.8, 1.1, '#ff8a2a');
    add('cone', 'glow', s.x + 0.2, s.y + 0.1, s.z - 0.1, 0.6, 2.4, 0.6, '#ffd060');
    out.smoke.push({ x: s.x, y: s.y + 2.2, z: s.z, s: 1.6 });
    circ(s.x, s.z, 1.6);
    // sled
    const sx = s.x + 4;
    const sz = s.z - 4;
    add('box', 'wood', sx, s.y + 0.35, sz, 1.2, 0.15, 3, '#7a5a3a', 0.4);
    for (const side of [-1, 1]) add('box', 'wood', sx + side * 0.55, s.y, sz, 0.08, 0.35, 3.2, '#5a3e28', 0.4);
  };

  /** A natural arch of blue glacial ice. */
  const iceArch = () => {
    const s = site(14, 40, 220, 'ice-arch');
    if (!s) return;
    const ry = rng.range(0, 6.28);
    add('arc', 'ice', s.x, s.y - 2, s.z, 26, 22, 26, vary('#9fd4f0', 0.05), ry);
    add('cone', 'ice', s.x + Math.cos(ry) * 11, s.y - 1, s.z - Math.sin(ry) * 11, 5, 9, 5, vary('#a8dcf4', 0.05));
    add('cone', 'ice', s.x - Math.cos(ry) * 11, s.y - 1, s.z + Math.sin(ry) * 11, 5, 8, 5, vary('#a8dcf4', 0.05));
    circ(s.x + Math.cos(ry) * 12, s.z - Math.sin(ry) * 12, 2.5);
    circ(s.x - Math.cos(ry) * 12, s.z + Math.sin(ry) * 12, 2.5);
  };

  /** A snow mound with a dark cave mouth fringed with icicles and a cold blue glow inside. */
  const iceCave = () => {
    const s = site(18, 40, 200, 'ice-cave');
    if (!s) return;
    const a = rng.range(0, 6.28);
    add('hemi', 'snow', s.x, s.y - 3, s.z, 34, 18, 30, '#e8eef4', a);
    const mx = s.x + Math.cos(a) * 14.2;
    const mz = s.z - Math.sin(a) * 14.2;
    add('hemi', 'dark', mx, s.y - 0.5, mz, 9, 9, 3, '#0e1622', a + Math.PI / 2);
    add('hemi', 'glowCold', mx - Math.cos(a) * 0.3, s.y - 0.3, mz + Math.sin(a) * 0.3, 5, 4, 1.4, '#3a9ad8', a + Math.PI / 2);
    for (let k = 0; k < 9; k++) {
      const off = -3.6 + k * 0.9;
      add('cone', 'ice', mx + Math.sin(a) * off, s.y + 4.1 - Math.abs(off) * 0.45, mz + Math.cos(a) * off, 0.5, rng.range(1, 2.4), 0.5, vary('#c8ecff', 0.05), 0, Math.PI);
    }
    circ(s.x, s.z, 15);
  };

  if (kind === 'cactus' || (t.look.sand && kind === 'none' && snow < 0.2 && t.look.mid.startsWith('#d'))) {
    village();
    temple();
    oasis();
    skeleton();
    obelisks();
    hoodoos();
    ruins('sandstone', '#d0aa72');
    mesa();
    mesa();
    arch();
    well();
  } else if (snow >= 0.45) {
    outpost();
    iglooVillage();
    iceCave();
    iceArch();
    iceSpires();
    iceSpires();
    igloo();
    ruins('stone', '#8a8e96');
    tower();
  } else if (kind === 'conifer' && t.look.amplitude > 40) {
    cairns();
    tower();
    if (rng.chance(0.5)) stoneCircle();
  } else if (kind === 'broadleaf' || kind === 'conifer' || kind === 'sparse') {
    stoneCircle();
    tower();
    if (rng.chance(0.6)) ruins('stone', '#8e887a');
  } else if (kind === 'jungle') {
    ruins('stone', '#7a8270');
    if (rng.chance(0.7)) temple();
  }
  return out;
}
