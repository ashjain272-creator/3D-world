import { type Kit, rng } from './kit';
import { midrise, podium, tower, WHITE } from './buildings';

/** A footprint that trees and paths keep clear of. */
interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

const LEAVES = ['#3f6f2e', '#4a7d34', '#567f3a', '#33612a', '#5f8a3e', '#41753a', '#6c8f45'];

/**
 * The demo block, laid out like a developer's sales model: four towers behind a podium arcade, a
 * pool deck in the middle, a row of terraced mid-rise blocks in front, lawns full of trees, paths
 * with bollard lights, and a boulevard with a planted median and cars curving round two sides.
 * Site: x from -130 to 130, z from -100 to 100 (+z is the front). Ground at y = 0.
 */
export function buildSite(k: Kit, outside?: Kit) {
  const r = rng(7);
  const keep: Rect[] = [];
  const base = 0.25;
  // the site: a lawn plate with a white kerb
  k.add('box', 'lawn', 0, 0, 0, 262, base, 202, '#5a8c40');
  for (const [x, z, w, d] of [
    [0, -101, 264, 2],
    [0, 101, 264, 2],
    [-131, 0, 2, 202],
    [131, 0, 2, 202],
  ])
    k.add('box', 'paving', x, 0, z, w, base + 0.12, d, '#e4e1da');
  // towers behind a podium arcade
  const towers = [
    { x: -70, z: -50, w: 26, d: 22, w0: 14, d0: 12, floors: 30 },
    { x: -2, z: -64, w: 28, d: 22, w0: 15, d0: 12, floors: 34 },
    { x: 70, z: -52, w: 28, d: 24, w0: 15, d0: 12, floors: 38 },
    { x: 34, z: -84, w: 20, d: 14, w0: 10, d0: 9, floors: 18 },
  ];
  for (const t of towers) {
    tower(k, { ...t, seed: rng(t.floors * 13 + t.x) });
    keep.push({ x: t.x, z: t.z, w: t.w + 4, d: t.d + 4 });
  }
  podium(k, 0, -29, 150, 10, r);
  keep.push({ x: 0, z: -29, w: 152, d: 12 });
  // the pool deck: paving, a glowing pool with white coping, loungers, umbrellas, a cabana
  const px = 4;
  const pz = -6;
  k.add('box', 'paving', px, base, pz, 74, 0.12, 30, '#dedad2');
  k.add('box', 'white', px, base, pz, 49, 0.3, 19, WHITE);
  k.add('box', 'water', px, base + 0.05, pz, 47, 0.3, 17, '#43c3e6');
  k.add('box', 'water', px + 30, base + 0.05, pz + 3, 8, 0.3, 8, '#5fd0ee');
  for (let a = -20; a <= 20; a += 3.4) {
    for (const s of [-1, 1]) {
      k.add('box', 'white', px + a, base + 0.12, pz + s * 12.2, 0.8, 0.35, 2, '#fbfaf7');
      if (Math.round(a / 3.4) % 2 === 0) {
        k.add('cyl', 'metal', px + a + 1.7, base, pz + s * 12.8, 0.08, 2.3, 0.08, '#bbbbbb');
        k.add('cone', 'white', px + a + 1.7, base + 2.1, pz + s * 12.8, 2.6, 0.5, 2.6, '#f4efe4');
      }
    }
  }
  k.add('box', 'white', px - 31, base, pz, 6, 3, 8, WHITE);
  k.add('box', 'window', px - 31, base + 0.2, pz, 6.2, 2.4, 6, '#ffe2ae');
  keep.push({ x: px, z: pz, w: 76, d: 32 });
  // terraced mid-rise blocks in front, and two on the east side
  const mids = [
    { x: -88, z: 42, w: 26, d: 18, floors: 5 },
    { x: -44, z: 50, w: 22, d: 17, floors: 4 },
    { x: 2, z: 44, w: 28, d: 18, floors: 5 },
    { x: 48, z: 52, w: 22, d: 16, floors: 4 },
    { x: 92, z: 40, w: 24, d: 18, floors: 5 },
    { x: 105, z: 2, w: 22, d: 18, floors: 4 },
    { x: -100, z: -2, w: 22, d: 16, floors: 3 },
  ];
  for (const m of mids) {
    midrise(k, { ...m, seed: rng(m.x * 7 + m.z) });
    keep.push({ x: m.x, z: m.z, w: m.w + 6, d: m.d + 8 });
  }
  // paths: a loop round the pool deck, an entrance spine, walks between the blocks; bollard lights
  const paths: Rect[] = [
    { x: px, z: pz - 18, w: 96, d: 3.2 },
    { x: px, z: pz + 18, w: 96, d: 3.2 },
    { x: px - 46, z: pz, w: 3.2, d: 39 },
    { x: px + 46, z: pz, w: 3.2, d: 39 },
    { x: -22, z: 52, w: 3.2, d: 94 },
    { x: 25, z: 72, w: 230, d: 3.2 },
    { x: 70, z: 30, w: 3.2, d: 50 },
    { x: -66, z: 30, w: 3.2, d: 50 },
  ];
  for (const p of paths) {
    k.add('box', 'paving', p.x, base, p.z, p.w, 0.1, p.d, '#ebe7df');
    const long = p.w > p.d;
    const len = long ? p.w : p.d;
    for (let a = -len / 2 + 4; a < len / 2; a += 9) {
      const bx = p.x + (long ? a : p.d / 2 + 0.6);
      const bz = p.z + (long ? p.d / 2 + 0.6 : a);
      k.add('cyl', 'charcoal', bx, base, bz, 0.22, 0.8, 0.22, '#2e3034');
      k.add('box', 'glow', bx, base + 0.62, bz, 0.26, 0.12, 0.26, '#ffe2b0');
    }
  }
  // hedges along the site edge
  for (const [x, z, w, d] of [
    [0, -98, 250, 1.4],
    [0, 98, 250, 1.4],
    [-128, 0, 1.4, 190],
    [128, 0, 1.4, 190],
  ])
    k.add('box', 'leaf', x, base, z, w, 1.1, d, '#3f7a34');
  // trees everywhere the buildings, deck and paths leave room
  const clear = (x: number, z: number, m: number) =>
    keep.every((q) => Math.abs(x - q.x) > q.w / 2 + m || Math.abs(z - q.z) > q.d / 2 + m) && paths.every((q) => Math.abs(x - q.x) > q.w / 2 + 1.8 || Math.abs(z - q.z) > q.d / 2 + 1.8);
  let placed = 0;
  for (let i = 0; i < 6000 && placed < 560; i++) {
    const x = -124 + r() * 248;
    const z = -94 + r() * 188;
    if (!clear(x, z, 2)) continue;
    tree(k, x, base, z, 5.5 + r() * 4.5, r);
    keep.push({ x, z, w: 3.6, d: 3.6 });
    placed++;
  }
  // the boulevard: the stretch on the model table, and its continuation out into the city
  const curve: [number, number][] = [[-152, -138], [-152, 92]];
  for (let q = 1; q <= 8; q++) {
    const a = Math.PI + (q / 8) * (Math.PI / 2);
    curve.push([-122 + Math.cos(a) * 30, 92 - Math.sin(a) * 30]);
  }
  curve.push([173, 122]);
  boulevard(k, curve, r);
  if (outside) {
    boulevard(outside, [[-152, -460], [-152, -138]], r);
    boulevard(outside, [[173, 122], [460, 122]], r);
  }
}

/** A model tree: a slim trunk and a round, slightly lumpy canopy of foam-green blobs. */
export function tree(k: Kit, x: number, y: number, z: number, h: number, r: () => number) {
  const col = LEAVES[Math.floor(r() * LEAVES.length)];
  k.add('cyl', 'trunk', x, y, z, 0.28, h * 0.45, 0.28, '#5b4636');
  const s = h * 0.62;
  k.add('sphere', 'leaf', x, y + h * 0.62, z, s, s * 0.9, s, col);
  k.add('sphere', 'leaf', x + (r() - 0.5) * s * 0.5, y + h * 0.78, z + (r() - 0.5) * s * 0.5, s * 0.62, s * 0.58, s * 0.62, col);
}

/**
 * The boulevard along the west side, curving round the front: two carriageways with lane marks,
 * a planted median with trees, white kerbs, tree-lined pavements, street lamps and cars.
 */
function boulevard(k: Kit, pts: [number, number][], r: () => number) {
  let carLane = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const nx = dz;
    const nz = -dx;
    const yaw = Math.atan2(-dz, dx);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const off = (o: number, a = 0): [number, number] => [mx + dx * a + nx * o, mz + dz * a + nz * o];
    k.add('box', 'asphalt', mx, 0, mz, L + 1, 0.06, 23, '#3c4046', yaw);
    for (const s of [-1, 1]) {
      const [kx, kz] = off(s * 11.6);
      k.add('box', 'white', kx, 0, kz, L + 1, 0.22, 0.35, WHITE, yaw);
      const [wx, wz] = off(s * 14);
      k.add('box', 'paving', wx, 0, wz, L + 1, 0.2, 4.5, '#d9d5cc', yaw);
      const [ex, ez] = off(s * 1.6);
      k.add('box', 'white', ex, 0, ez, L + 1, 0.22, 0.3, WHITE, yaw);
    }
    k.add('box', 'lawn', mx, 0, mz, L + 1, 0.2, 3, '#5a8c40', yaw);
    // dashed lane lines and a yellow edge line
    for (let a = -L / 2 + 2; a < L / 2 - 1; a += 7)
      for (const s of [-1, 1]) {
        const [lx, lz] = off(s * 6.6, a);
        k.add('box', 'paint', lx, 0.06, lz, 3, 0.02, 0.16, '#f2f2f2', yaw);
      }
    for (const s of [-1, 1]) {
      const [yx, yz] = off(s * 10.9);
      k.add('box', 'paint', yx, 0.06, yz, L, 0.02, 0.14, '#e8c040', yaw);
    }
    // trees on the median and both pavements; lamps between them
    for (let a = -L / 2 + 4; a < L / 2; a += 9) {
      const [tx, tz] = off(0, a);
      tree(k, tx, 0.2, tz, 6 + r() * 2, r);
      for (const s of [-1, 1]) {
        const [px, pz] = off(s * 15.2, a);
        tree(k, px, 0.2, pz, 6.5 + r() * 2.5, r);
      }
    }
    for (let a = -L / 2 + 8; a < L / 2; a += 18)
      for (const s of [-1, 1]) {
        const [lx, lz] = off(s * 12.4, a);
        k.add('cyl', 'metal', lx, 0.2, lz, 0.2, 8, 0.2, '#9aa0a6');
        const [hx, hz] = off(s * 10.6, a);
        k.add('box', 'metal', (lx + hx) / 2, 8, (lz + hz) / 2, 0.18, 0.18, 2, '#9aa0a6', yaw);
        k.add('box', 'glow', hx, 7.75, hz, 0.7, 0.18, 0.4, '#fff0d0', yaw);
      }
    // cars in both directions
    for (let a = -L / 2 + 3; a < L / 2 - 3; a += 6 + r() * 26) {
      const s = carLane++ % 2 ? 1 : -1;
      const lane = s * (r() < 0.5 ? 4 : 8.6);
      const [cx, cz] = off(lane, a);
      car(k, cx, cz, yaw + (s > 0 ? Math.PI : 0), r);
    }
  }
}

const CAR_COLOURS = ['#f4f4f4', '#1a1a1a', '#8a9098', '#b0202a', '#1e3c6e', '#d8d2c4', '#2f4f3f', '#c8c8cc'];

function car(k: Kit, x: number, z: number, yaw: number, r: () => number) {
  const c = CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)];
  const fx = Math.cos(yaw);
  const fz = -Math.sin(yaw);
  k.add('box', 'car', x, 0.3, z, 4.4, 0.75, 1.85, c, yaw);
  k.add('box', 'carGlass', x - fx * 0.3, 1.05, z - fz * 0.3, 2.4, 0.62, 1.7, '#1b222a', yaw);
  k.add('box', 'car', x - fx * 0.3, 1.66, z - fz * 0.3, 2.2, 0.08, 1.6, c, yaw);
  for (const s of [-1, 1]) {
    const sx = -fz * s * 0.65;
    const sz = fx * s * 0.65;
    k.add('box', 'glow', x + fx * 2.21 + sx, 0.65, z + fz * 2.21 + sz, 0.05, 0.16, 0.36, '#fff6e0', yaw);
    k.add('box', 'glow', x - fx * 2.21 + sx, 0.7, z - fz * 2.21 + sz, 0.05, 0.14, 0.4, '#ff2a2a', yaw);
  }
  for (const a of [-1.4, 1.4]) for (const s of [-1, 1]) k.add('cyl', 'charcoal', x + fx * a - fz * s * 0.85, 0, z + fz * a + fx * s * 0.85, 0.66, 0.3, 0.66, '#1a1a1a');
}

/** The model table: a black lacquered frame round the site and a plinth beneath it. */
export function buildPlinth(k: Kit) {
  const x0 = -185;
  const x1 = 175;
  const z0 = -140;
  const z1 = 165;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const W = x1 - x0;
  const D = z1 - z0;
  k.add('box', 'plinth', cx, -30, cz, W + 8, 30, D + 8, '#111214');
  for (const [x, z, w, d] of [
    [cx, z0 - 2, W + 8, 4],
    [cx, z1 + 2, W + 8, 4],
    [x0 - 2, cz, 4, D + 8],
    [x1 + 2, cz, 4, D + 8],
  ])
    k.add('box', 'plinth', x, -0.5, z, w, 3.2, d, '#16171a');
  k.add('box', 'lawn', cx, -0.3, cz, W, 0.3, D, '#c9c4b8');
}
