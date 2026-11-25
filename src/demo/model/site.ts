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
    { x: -70, z: -50, w: 26, d: 22, w0: 14, d0: 12, floors: 30, crown: 'pergola' as const },
    { x: -2, z: -64, w: 28, d: 22, w0: 15, d0: 12, floors: 34, crown: 'frame' as const },
    { x: 70, z: -52, w: 28, d: 24, w0: 15, d0: 12, floors: 38, crown: 'stepped' as const },
    { x: 34, z: -84, w: 20, d: 14, w0: 10, d0: 9, floors: 18, crown: 'pergola' as const },
  ];
  for (const t of towers) {
    tower(k, { ...t, seed: rng(t.floors * 13 + t.x) });
    k.solid(t.x, t.z, t.w, t.d0);
    k.solid(t.x, t.z, t.w0, t.d);
    keep.push({ x: t.x, z: t.z, w: t.w + 4, d: t.d + 4 });
  }
  podium(k, 0, -29, 150, 10, r);
  k.solid(0, -29, 150, 10);
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
  // cabanas along the far side, towels on the loungers, a pool bar
  for (let a = -18; a <= 18; a += 9) {
    for (const [q, w] of [[-1.6, 0.12], [1.6, 0.12]] as const) k.add('box', 'white', px + a + q, base, pz - 14.2, w, 2.6, w, WHITE);
    k.add('box', 'white', px + a, base + 2.6, pz - 14.2, 3.6, 0.12, 2.6, WHITE);
    for (const q of [-1.6, 1.6]) k.add('box', 'railing', px + a + q, base + 0.3, pz - 14.2, 0.04, 2.2, 2.4, '#ffffff');
    k.add('box', 'white', px + a, base, pz - 14.2, 2.4, 0.5, 1.6, '#f2ede3');
  }
  for (let a = -20; a <= 20; a += 3.4) for (const s of [-1, 1]) if (r() < 0.5) k.add('box', 'figure', px + a, base + 0.48, pz + s * 12.2, 0.7, 0.04, 1.2, ['#e8605a', '#4aa3d8', '#f2c94c', '#ffffff'][Math.floor(r() * 4)]);
  k.add('box', 'charcoal', px + 30, base, pz - 8, 6, 1.1, 1.6, '#3b3e44');
  k.add('box', 'white', px + 30, base + 2.8, pz - 8, 8, 0.25, 4, WHITE);
  for (const q of [-3.6, 3.6]) k.add('box', 'white', px + 30 + q, base, pz - 8, 0.2, 2.8, 0.2, WHITE);
  keep.push({ x: px, z: pz, w: 76, d: 32 });
  // a tennis court, a play area and a pavilion in the lawns
  const tc = { x: 105, z: -78 };
  k.add('box', 'court', tc.x, base, tc.z, 18, 0.06, 36, '#2f6a8a');
  k.add('box', 'court', tc.x, base, tc.z, 11, 0.08, 24, '#3a85b0');
  for (const [w, d, ox, oz] of [[11, 0.1, 0, 12], [11, 0.1, 0, -12], [0.1, 24, 5.5, 0], [0.1, 24, -5.5, 0], [0.1, 24, 4.1, 0], [0.1, 24, -4.1, 0], [8.2, 0.1, 0, 6.4], [8.2, 0.1, 0, -6.4], [0.1, 12.8, 0, 0]] as const) k.add('box', 'paint', tc.x + ox, base + 0.09, tc.z + oz, w, 0.02, d, '#ffffff');
  k.add('box', 'railing', tc.x, base, tc.z, 12, 1.0, 0.05, '#ffffff');
  for (const [w, d, ox, oz] of [[18, 0.06, 0, 18], [18, 0.06, 0, -18], [0.06, 36, 9, 0], [0.06, 36, -9, 0]] as const) k.add('box', 'railing', tc.x + ox, base, tc.z + oz, w, 3, d, '#cfd8dc');
  keep.push({ x: tc.x, z: tc.z, w: 20, d: 38 });
  const pg = { x: -105, z: -78 };
  k.add('box', 'court', pg.x, base, pg.z, 20, 0.06, 16, '#d85a3a');
  k.add('box', 'white', pg.x - 4, base, pg.z, 4, 3, 4, '#f2c94c');
  k.add('cone', 'white', pg.x - 4, base + 3, pg.z, 5, 2, 5, '#e8605a');
  k.add('box', 'white', pg.x - 4, base + 1, pg.z + 3.5, 1.2, 0.2, 4, '#4aa3d8', 0, -0.45);
  for (const q of [-2, 2]) k.add('box', 'metal', pg.x + 5 + q, base, pg.z - 3, 0.12, 2.6, 0.12, '#9aa0a6');
  k.add('box', 'metal', pg.x + 5, base + 2.5, pg.z - 3, 4.2, 0.12, 0.12, '#9aa0a6');
  k.add('cyl', 'white', pg.x + 4, base, pg.z + 4, 3, 0.4, 3, '#4aa3d8');
  keep.push({ x: pg.x, z: pg.z, w: 22, d: 18 });
  // the entrance plaza on the boulevard: gate pillars, a gatehouse, a round fountain, flagpoles
  const ez = 72;
  k.add('box', 'paving', -118, base, ez, 26, 0.12, 18, '#dcd6ca');
  for (const s of [-1, 1]) {
    k.add('box', 'stone', -128, base, ez + s * 7, 1.6, 3.4, 1.6, '#cdbfa6');
    k.add('box', 'glow', -128, base + 3.4, ez + s * 7, 0.9, 0.3, 0.9, '#fff0d0');
  }
  k.add('box', 'white', -118, base, ez - 11, 6, 3.2, 4, WHITE);
  k.solid(-118, ez - 11, 6, 4);
  k.add('box', 'window', -118, base + 0.4, ez - 11, 6.2, 2.2, 3, '#ffe2ae');
  k.add('cyl', 'white', -114, base, ez, 9, 0.6, 9, WHITE);
  k.add('cyl', 'water', -114, base + 0.3, ez, 8, 0.35, 8, '#43c3e6');
  k.add('cyl', 'white', -114, base, ez, 1.2, 1.6, 1.2, WHITE);
  k.add('cone', 'glow', -114, base + 1.6, ez, 0.4, 2.4, 0.4, '#e6f6ff');
  for (let q = 0; q < 3; q++) {
    k.add('cyl', 'metal', -108, base, ez - 4 + q * 4, 0.12, 9, 0.12, '#d0d4d8');
    k.add('box', 'figure', -108, base + 7.6, ez - 4 + q * 4 + 0.8, 0.04, 1.1, 1.6, ['#c8102e', '#ffffff', '#00732f'][q]);
  }
  keep.push({ x: -118, z: ez, w: 28, d: 26 });
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
    k.solid(m.x, m.z, m.w, m.d + 3);
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
    {
      const long = p.w > p.d;
      const len = long ? p.w : p.d;
      for (let a = -len / 2 + 9; a < len / 2 - 4; a += 18) {
        // a bench beside the path, a tall lamp opposite, people strolling
        const bx = p.x + (long ? a : -p.d / 2 - 0.9);
        const bz = p.z + (long ? -p.d / 2 - 0.9 : a);
        k.add('box', 'stone', bx, base, bz, long ? 1.8 : 0.5, 0.45, long ? 0.5 : 1.8, '#d8cfbd');
        k.add('box', 'trunk', bx, base + 0.45, bz, long ? 1.8 : 0.5, 0.06, long ? 0.5 : 1.8, '#8a6a4a');
        const lx = p.x + (long ? a + 4 : p.d / 2 + 1.2);
        const lz = p.z + (long ? p.d / 2 + 1.2 : a + 4);
        k.add('cyl', 'charcoal', lx, base, lz, 0.14, 4.2, 0.14, '#2e3034');
        k.add('sphere', 'glow', lx, base + 4.3, lz, 0.45, 0.45, 0.45, '#ffe8c0');
      }
      for (let i = 0; i < len / 14; i++) {
        const a = -len / 2 + r() * len;
        person(k, p.x + (long ? a : (r() - 0.5) * p.d * 0.7), base + 0.1, p.z + (long ? (r() - 0.5) * p.d * 0.7 : a), r);
      }
    }
    const long = p.w > p.d;
    const len = long ? p.w : p.d;
    for (let a = -len / 2 + 4; a < len / 2; a += 9) {
      const bx = p.x + (long ? a : p.d / 2 + 0.6);
      const bz = p.z + (long ? p.d / 2 + 0.6 : a);
      k.add('cyl', 'charcoal', bx, base, bz, 0.22, 0.8, 0.22, '#2e3034');
      k.add('box', 'glow', bx, base + 0.62, bz, 0.26, 0.12, 0.26, '#ffe2b0');
    }
  }
  // people on the pool deck and round the plaza
  for (let i = 0; i < 40; i++) person(k, px + (r() - 0.5) * 66, base + 0.12, pz + (r() < 0.5 ? -1 : 1) * (10 + r() * 4), r);
  for (let i = 0; i < 8; i++) person(k, -122 + r() * 10, base + 0.12, 64 + r() * 16, r);
  // a drop-off loop with parked cars by the podium
  k.add('box', 'asphalt', -40, base, -18, 40, 0.08, 7, '#4a4e54');
  for (let a = -16; a <= 16; a += 5.5) car(k, -40 + a, -18, 0, r);
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
    if (r() < 0.12) cypress(k, x, base, z, 9 + r() * 4, r);
    else tree(k, x, base, z, 5.5 + r() * 4.5, r);
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

const CLOTHES = ['#f4f4f2', '#1e2a3a', '#c8102e', '#4aa3d8', '#2f4f3f', '#e8a030', '#6a4a8a', '#d8d2c4'];

/** A scale-model figure: a body in coloured clothes and a head. */
export function person(k: Kit, x: number, y: number, z: number, r: () => number) {
  const h = 1.55 + r() * 0.3;
  k.add('cyl', 'figure', x, y, z, 0.42, h * 0.82, 0.32, CLOTHES[Math.floor(r() * CLOTHES.length)], r() * 6);
  k.add('sphere', 'figure', x, y + h * 0.9, z, 0.26, 0.3, 0.26, ['#e8c4a0', '#c89870', '#8a5a3a', '#f0d0b0'][Math.floor(r() * 4)]);
}

/** A model tree: a slim trunk and a round, slightly lumpy canopy of foam-green blobs. */
export function tree(k: Kit, x: number, y: number, z: number, h: number, r: () => number) {
  const col = LEAVES[Math.floor(r() * LEAVES.length)];
  k.add('cyl', 'trunk', x, y, z, 0.28, h * 0.45, 0.28, '#5b4636');
  const s = h * 0.62;
  k.add('sphere', 'leaf', x, y + h * 0.62, z, s, s * 0.9, s, col);
  k.add('sphere', 'leaf', x + (r() - 0.5) * s * 0.5, y + h * 0.78, z + (r() - 0.5) * s * 0.5, s * 0.62, s * 0.58, s * 0.62, col);
}

/** A slim columnar tree. */
function cypress(k: Kit, x: number, y: number, z: number, h: number, r: () => number) {
  k.add('cyl', 'trunk', x, y, z, 0.22, h * 0.15, 0.22, '#5b4636');
  k.add('sphere', 'leaf', x, y + h * 0.55, z, 1.7, h * 0.85, 1.7, LEAVES[Math.floor(r() * 3) + 3]);
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
    // a zebra crossing at the start of each long stretch
    if (L > 60)
      for (let q = -9; q <= 9; q += 1.6) {
        const [zx, zz] = off(q, -L / 2 + 12);
        k.add('box', 'paint', zx, 0.065, zz, 4, 0.02, 0.8, '#f2f2f2', yaw);
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
export function buildPlinth(k: Kit, x0 = -185, x1 = 175, z0 = -140, z1 = 165) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const W = x1 - x0;
  const D = z1 - z0;
  k.add('box', 'plinth', cx, -30, cz, W + 8, 30, D + 8, '#111214');
  const rim = Math.max(4, W / 90);
  for (const [x, z, w, d] of [
    [cx, z0 - rim / 2, W + 2 * rim, rim],
    [cx, z1 + rim / 2, W + 2 * rim, rim],
    [x0 - rim / 2, cz, rim, D + 2 * rim],
    [x1 + rim / 2, cz, rim, D + 2 * rim],
  ])
    k.add('box', 'plinth', x, -0.5, z, w, 3.2 * (rim / 4), d, '#16171a');
  k.add('box', 'lawn', cx, -0.3, cz, W, 0.3, D, '#c9c4b8');
}
