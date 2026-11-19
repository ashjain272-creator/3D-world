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
export type StructMat = 'sandstone' | 'stone' | 'wood' | 'cloth' | 'ice' | 'snow' | 'gold';
export type StructShape = 'box' | 'cyl' | 'cone' | 'pyramid' | 'hemi';

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
  footprints: { x: number; z: number; r: number }[];
  /** Palm positions requested by oases. */
  palms: { x: number; z: number }[];
}

export function generateStructures(t: TerrainData, layout: Layout, rng: Rng): StructureData {
  const out: StructureData = { pieces: [], ponds: [], colliders: [], footprints: [], palms: [] };
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
  const site = (r: number, minDist = 60, maxDist = 290): { x: number; z: number; y: number } | null => {
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
      out.footprints.push({ x, z, r });
      return { x, z, y: lo };
    }
    return null;
  };

  const temple = () => {
    const s = site(20, 55, 150);
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
    const s = site(4, 22, 70);
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
    const s = site(14, 35, 120);
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
    const s = site(16, 45, 160);
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
    const s = site(26, 160, 330);
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
    const s = site(10, 80, 300);
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
    const s = site(11, 30, 110);
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
    const s = site(6, 30, 130);
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
      const s = site(2, 40, 300);
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
    const s = site(6, 25, 90);
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
    const s = site(10, 60, 320);
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

  if (kind === 'cactus' || (t.look.sand && kind === 'none' && snow < 0.2 && t.look.mid.startsWith('#d'))) {
    temple();
    well();
    oasis();
    ruins('sandstone', '#d0aa72');
    mesa();
    mesa();
    arch();
    if (rng.chance(0.6)) well();
  } else if (snow >= 0.5) {
    igloo();
    iceSpires();
    iceSpires();
    if (rng.chance(0.6)) tower();
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
