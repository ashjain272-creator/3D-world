import { type Kit, rng } from './kit';
import { type P2, edges, WHITE } from './buildings';
import { person } from './site';

/**
 * A Dubai-style downtown in the manner of a sales model: a supertall needle on a Y-shaped plan
 * with spiralling setbacks, a lit lake with a fountain, a vast mall, an arcaded souk of domes,
 * clusters of glass towers with lit floors and blue light strips, sand-coloured "old town"
 * courtyard blocks with pools, a ring boulevard of palms, and a highway with an elevated metro.
 * Everything stands on the ground at y = 0; x from -680 to 680, z from -560 to 560.
 */

const COOL = ['#8fb8e8', '#a8c8f0', '#c0d8f5', '#7aa6e0', '#b8d0f0'];
const WARM = ['#ffc56e', '#ffd08a', '#ffdba6', '#ffb95c', '#ffe7c2'];
const DIM = '#1c3352';
const SAND = ['#e6cfa6', '#dcc196', '#ead7b4', '#d8b98a'];

function pick<T>(a: T[], r: () => number) {
  return a[Math.floor(r() * a.length)];
}

type Rect = { x: number; z: number; w: number; d: number };

export function buildDowntown(k: Kit) {
  const r = rng(21);
  const keep: Rect[] = [];
  // the ground: pale paving with lawns laid over it
  k.add('box', 'paving', 0, 0, 0, 1360, 0.2, 1120, '#d9d4c9');
  // ── the supertall and its park
  k.add('cyl', 'lawn', 0, 0.2, -60, 230, 0.1, 230, '#5a8c40');
  k.add('cyl', 'paving', 0, 0.2, -60, 120, 0.14, 120, '#e8e3d8');
  for (let q = 0; q < 6; q++) {
    const a = (q / 6) * Math.PI * 2;
    k.add('box', 'paving', Math.sin(a) * 85, 0.2, -60 + Math.cos(a) * 85, 4, 0.13, 60, '#e8e3d8', a);
    k.add('box', 'water', Math.sin(a) * 75, 0.25, -60 + Math.cos(a) * 75, 3, 0.2, 40, '#43c3e6', a + 0.3);
  }
  for (let q = 0; q < 36; q++) {
    const a = (q / 36) * Math.PI * 2;
    palm(k, Math.sin(a) * 105, 0.3, -60 + Math.cos(a) * 105, 11 + r() * 3, r);
  }
  supertall(k, 0, -60, r);
  keep.push({ x: 0, z: -60, w: 240, d: 240 });
  // ── the lake with its fountain, promenades and a boardwalk
  lake(k, r);
  keep.push({ x: 40, z: 110, w: 460, d: 160 });
  // ── the mall beside the lake, and the souk across it
  mall(k, 320, 10, r);
  keep.push({ x: 320, z: 10, w: 300, d: 230 });
  souk(k, 40, 215, r);
  keep.push({ x: 40, z: 215, w: 260, d: 60 });
  // ── glass towers round the core
  const spots: [number, number, number][] = [
    [-180, -230, 72], [-90, -260, 60], [10, -270, 84], [110, -250, 66], [210, -230, 78], [300, -200, 56],
    [-280, -150, 48], [-300, -40, 64], [-280, 70, 52], [-200, 30, 70], [-190, -110, 58],
    [180, -110, 76], [190, -10, 64], [470, -170, 50], [500, -60, 44], [470, 180, 40],
    [-420, -260, 46], [-460, -120, 38], [380, -280, 62], [-380, 40, 42],
  ];
  const plans: Plan[] = ['rect', 'chamfer', 'round', 'rect', 'chamfer', 'slim'];
  spots.forEach(([x, z, floors], i) => {
    const plan = plans[i % plans.length];
    const w = plan === 'slim' ? 22 : 30 + r() * 10;
    const d = plan === 'slim' ? 22 : 26 + r() * 10;
    glassTower(k, { x, z, w, d, floors, plan, seed: rng(500 + i), twist: i === 4 ? 0.017 : 0, setbacks: i % 3 === 1, glow: i % 2 ? '#7ab8ff' : '#b49bff', crown: (['spire', 'slope', 'helipad', 'crownRing'] as const)[i % 4] });
    keep.push({ x, z, w: w + 16, d: d + 16 });
  });
  // the tower beside the lake with a curved crown, and a pair of linked towers
  glassTower(k, { x: 190, z: 95, w: 34, d: 28, floors: 72, plan: 'chamfer', seed: rng(900), glow: '#ffd27a', crown: 'slope', setbacks: true });
  keep.push({ x: 190, z: 95, w: 50, d: 44 });
  // ── old town: sand-coloured courtyard blocks in a street grid, south and west
  oldTown(k, keep, r);
  // ── roads: the ring boulevard, the highway with its elevated metro, streets
  ring(k, r);
  highway(k, r);
  // people along the lake promenade
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2;
    person(k, 40 + Math.cos(a) * (200 + r() * 6), 0.3, 110 + Math.sin(a) * (70 + r() * 6), r);
  }
}

// ───────────────────────────── the supertall ─────────────────────────────

/**
 * A Y-shaped supertall: three wings round a hexagonal core, setting back one wing at a time as
 * it climbs so the setbacks spiral; every floor's windows lit cool white, silver fins on the
 * wings, blue light at the wing ends, and a spire.
 */
function supertall(k: Kit, x: number, z: number, r: () => number) {
  const fh = 4;
  const tiers = 24;
  const perTier = 6;
  const wings = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  const len = [44, 44, 44];
  const wide = 17;
  let y = 0;
  for (let t = 0; t < tiers; t++) {
    if (t > 2) len[t % 3] = Math.max(6, len[t % 3] - 5.2);
    const wscale = t < 18 ? 1 : 1 - (t - 17) * 0.09;
    const ww = wide * wscale;
    const h = perTier * fh;
    // the core and the three wings of this tier, in silver glass
    k.add('oct', 'glass', x, y, z, 26 * wscale, h, 26 * wscale, '#8fa4b8', Math.PI / 8);
    wings.forEach((a, i) => {
      const L = len[i];
      if (L < 7) return;
      const cx = x + Math.cos(a) * L * 0.5;
      const cz = z - Math.sin(a) * L * 0.5;
      k.add('box', 'glass', cx, y, cz, L, h, ww, '#8fa4b8', a);
      // the rounded wing end
      k.add('cyl', 'glass', x + Math.cos(a) * L, y, z - Math.sin(a) * L, ww, h, ww, '#8fa4b8');
      const dx = Math.cos(a);
      const dz = -Math.sin(a);
      const nx = -dz;
      const nz = dx;
      for (let f = 0; f < perTier; f++) {
        const fy = y + f * fh;
        for (const s of [-1, 1]) {
          // the long sides: lit window strips and a silver floor line
          const nseg = Math.max(1, Math.round(L / 4.4));
          for (let q = 0; q < nseg; q++) {
            const a2 = 6 + ((L - 6) * (q + 0.5)) / nseg;
            k.add('box', 'window', x + dx * a2 + nx * s * (ww / 2 + 0.06), fy + 0.6, z + dz * a2 + nz * s * (ww / 2 + 0.06), (L - 6) / nseg - 0.5, fh - 1.1, 0.1, r() < 0.82 ? pick(COOL, r) : DIM, a);
          }
          k.add('box', 'white', x + dx * (L / 2 + 3) + nx * s * (ww / 2 + 0.12), fy, z + dz * (L / 2 + 3) + nz * s * (ww / 2 + 0.12), L - 6, 0.3, 0.3, '#e6eef6', a);
        }
        // the wing end, lit blue
        if (f % 2 === 0) k.add('box', 'glow', x + dx * (L + ww / 2 + 0.05), fy + 0.8, z + dz * (L + ww / 2 + 0.05), 0.1, fh - 1.4, ww * 0.35, '#5f8fd0', a);
      }
      // silver fins up the wing sides
      for (const s of [-1, 1])
        for (let q = 0; q < L - 6; q += 8) k.add('box', 'white', x + dx * (6 + q) + nx * s * (ww / 2 + 0.25), y, z + dz * (6 + q) + nz * s * (ww / 2 + 0.25), 0.4, h, 0.5, '#dfe8f0', a);
    });
    // a silver ring at each setback
    k.add('oct', 'white', x, y + h - 0.6, z, 27 * wscale, 0.6, 27 * wscale, '#e6eef6', Math.PI / 8);
    y += h;
  }
  // the spire, tapering in stages, with lights
  let sw = 9;
  for (let q = 0; q < 8; q++) {
    k.add('cyl', 'white', x, y, z, sw, 26, sw, '#9fb0c2');
    k.add('cyl', 'glow', x, y + 24, z, sw + 0.3, 0.3, sw + 0.3, '#6f94c4');
    y += 26;
    sw *= 0.78;
  }
  k.add('cone', 'metal', x, y, z, 1.6, 40, 1.6, '#d8dee6');
  k.add('sphere', 'glow', x, y + 40, z, 2, 2, 2, '#ff4040');
  // a base pavilion, lit
  for (const a of wings) k.add('box', 'window', x + Math.cos(a) * 60, 0.2, z - Math.sin(a) * 60, 30, 6, 14, '#ffe2ae', a);
}

// ───────────────────────────── glass towers ─────────────────────────────

type Plan = 'rect' | 'chamfer' | 'round' | 'slim';

interface GlassOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  plan: Plan;
  seed: () => number;
  twist?: number;
  setbacks?: boolean;
  glow: string;
  crown: 'spire' | 'slope' | 'helipad' | 'crownRing';
}

function planPts(plan: Plan, w: number, d: number): P2[] {
  const a = w / 2;
  const b = d / 2;
  if (plan === 'round') {
    const out: P2[] = [];
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2;
      out.push([Math.cos(t) * a, Math.sin(t) * b]);
    }
    return out;
  }
  if (plan === 'chamfer') {
    const c = Math.min(a, b) * 0.35;
    return [[a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b]];
  }
  return [[a, -b], [a, b], [-a, b], [-a, -b]];
}

/**
 * A glass tower: on every floor a band of windows lit in cool whites (a few dark or warm), a
 * crisp white floor line and slim mullions; blue or violet light strips up the corners; set
 * backs or a twist on some; and a crown (a spire, a sloping top, a helipad, or a lit ring).
 */
function glassTower(k: Kit, o: GlassOpts) {
  const { x, z, floors, seed: r } = o;
  const fh = 3.8;
  const twist = o.twist ?? 0;
  const scaleAt = (f: number) => (o.setbacks ? (f < floors * 0.55 ? 1 : f < floors * 0.8 ? 0.84 : 0.68) : 1);
  let runStart = 0;
  for (let f = 0; f <= floors; f++) {
    const s = scaleAt(f);
    // the glass core, one piece per run of identical floors (one per floor when twisting)
    if (f === floors || scaleAt(runStart) !== s || twist) {
      const s0 = scaleAt(runStart);
      const h = (f - runStart) * fh || fh;
      const rot = twist * runStart;
      if (o.plan === 'round') k.add('cyl', 'glass', x, runStart * fh, z, o.w * s0 - 0.6, h, o.d * s0 - 0.6, '#5d7a96');
      else {
        k.add('box', 'glass', x, runStart * fh, z, o.w * s0 - 0.6, h, o.d * s0 - (o.plan === 'chamfer' ? 6 : 0.6), '#5d7a96', rot);
        if (o.plan === 'chamfer') k.add('box', 'glass', x, runStart * fh, z, o.w * s0 - 6, h, o.d * s0 - 0.6, '#5d7a96', rot);
      }
      runStart = f;
    }
    if (f === floors) break;
    const rot = twist * f;
    const pts = planPts(o.plan, o.w * s, o.d * s).map(([px, pz]) => [px * Math.cos(rot) + pz * Math.sin(rot), -px * Math.sin(rot) + pz * Math.cos(rot)] as P2);
    const y = f * fh;
    for (const e of edges(pts, x, z)) {
      const nseg = Math.max(1, Math.round(e.L / 4));
      const sl = e.L / nseg;
      for (let q = 0; q < nseg; q++) {
        const a = -e.L / 2 + sl * (q + 0.5);
        const lit = r() < 0.6 ? (r() < 0.15 ? pick(WARM, r) : pick(COOL, r)) : DIM;
        k.add('box', 'window', e.mx + e.dx * a + e.nx * 0.05, y + 0.5, e.mz + e.dz * a + e.nz * 0.05, sl - 0.4, fh - 0.95, 0.1, lit, e.yaw);
      }
      k.add('box', 'white', e.mx + e.nx * 0.12, y, e.mz + e.nz * 0.12, e.L + 0.1, 0.24, 0.3, '#eef2f6', e.yaw);
    }
  }
  // mullions and the light strips up the corners (on the base plan, untwisted, unset)
  if (!twist) {
    const pts = planPts(o.plan, o.w * scaleAt(0), o.d * scaleAt(0));
    const H0 = (o.setbacks ? Math.ceil(floors * 0.55) : floors) * fh;
    for (const e of edges(pts, x, z)) {
      const nseg = Math.max(1, Math.round(e.L / 4));
      for (let q = 1; q < nseg; q++) {
        const a = -e.L / 2 + (e.L * q) / nseg;
        k.add('box', 'white', e.mx + e.dx * a + e.nx * 0.14, 0, e.mz + e.dz * a + e.nz * 0.14, 0.14, H0, 0.2, '#e6edf4', e.yaw);
      }
      k.add('box', 'glow', e.mx + e.dx * (e.L / 2) + e.nx * 0.2, 0, e.mz + e.dz * (e.L / 2) + e.nz * 0.2, 0.25, H0, 0.25, o.glow, e.yaw);
    }
  }
  // the lobby, lit
  k.add('box', 'window', x, 0, z, o.w + 0.4, fh * 1.6, o.d + 0.4, '#ffe6bc');
  // the crown
  const H = floors * fh;
  const st = scaleAt(floors - 1);
  const cw = o.w * st;
  const cd = o.d * st;
  if (o.crown === 'spire') {
    k.add('box', 'white', x, H, z, cw * 0.6, 6, cd * 0.6, '#eef2f6', twist * floors);
    k.add('cone', 'metal', x, H + 6, z, 2.2, 34, 2.2, '#d8dee6');
    k.add('sphere', 'glow', x, H + 40, z, 1.2, 1.2, 1.2, '#ff4040');
  } else if (o.crown === 'slope') {
    for (let q = 0; q < 6; q++) k.add('box', 'glass', x, H + q * 3, z - (q * cd) / 14, cw - 0.6, 3, cd * (1 - q / 7), '#5d7a96');
    k.add('box', 'glow', x, H + 18, z - cd * 0.4, cw, 0.3, 0.5, o.glow);
  } else if (o.crown === 'helipad') {
    k.add('box', 'white', x, H, z, cw * 0.7, 4, cd * 0.7, '#eef2f6');
    k.add('cyl', 'charcoal', x, H + 4, z, cw * 0.65, 0.5, cw * 0.65, '#3b3e44');
    k.add('cyl', 'glow', x, H + 4.5, z, cw * 0.64, 0.05, cw * 0.64, '#7cff9a');
    k.add('cyl', 'charcoal', x, H + 4.5, z, cw * 0.6, 0.08, cw * 0.6, '#3b3e44');
  } else {
    for (let q = 0; q < 3; q++) k.add(o.plan === 'round' ? 'cyl' : 'box', 'white', x, H + q * 3.2, z, cw - q * 2, 0.5, cd - q * 2, '#eef2f6', twist * floors);
    k.add(o.plan === 'round' ? 'cyl' : 'box', 'glow', x, H + 9.8, z, cw - 6, 0.3, cd - 6, o.glow, twist * floors);
  }
}

// ───────────────────────────── the lake ─────────────────────────────

function lake(k: Kit, r: () => number) {
  const cx = 40;
  const cz = 110;
  // a promenade edge, then the water: a long basin with rounded lobes
  for (const [shape, x, z, w, d] of [
    ['box', cx, cz, 320, 120],
    ['cyl', cx - 160, cz - 10, 150, 150],
    ['cyl', cx + 160, cz + 10, 130, 130],
  ] as const) {
    k.add(shape, 'paving', x, 0.2, z, w + 14, 0.2, d + 14, '#ece7dc');
    k.add(shape, 'white', x, 0.2, z, w + 2, 0.45, d + 2, '#f4f1ea');
  }
  for (const [shape, x, z, w, d] of [
    ['box', cx, cz, 320, 120],
    ['cyl', cx - 160, cz - 10, 150, 150],
    ['cyl', cx + 160, cz + 10, 130, 130],
  ] as const)
    k.add(shape, 'water', x, 0.3, z, w, 0.45, d, '#36b4ff');
  // the fountain: arcs of jets lit white and blue, rings of light in the water
  for (let q = 0; q < 70; q++) {
    const t = q / 69;
    const a = Math.PI * (0.15 + t * 0.7);
    const fx = cx + Math.cos(a) * 140;
    const fz = cz + 40 - Math.sin(a) * 60;
    const h = 8 + Math.abs(Math.sin(t * Math.PI * 4)) * 30;
    k.add('cone', 'glow', fx, 0.75, fz, 1.1, h, 1.1, q % 3 ? '#e8f6ff' : '#9fd4ff');
  }
  for (let q = 0; q < 40; q++) k.add('cyl', 'glow', cx - 130 + q * 6.5, 0.76, cz + 10 + Math.sin(q * 0.6) * 12, 1.6, 0.04, 1.6, '#7ad8ff');
  // a boardwalk across, with lamps; palms round the promenade
  k.add('box', 'trunk', cx - 40, 0.6, cz, 6, 0.4, 130, '#a07a52');
  for (let q = -60; q <= 60; q += 10) k.add('sphere', 'glow', cx - 43, 2.4, cz + q, 0.5, 0.5, 0.5, '#ffe2b0');
  for (let q = 0; q < 50; q++) {
    const a = (q / 50) * Math.PI * 2;
    palm(k, cx + Math.cos(a) * 236, 0.4, cz + Math.sin(a) * 82, 10 + r() * 3, r);
  }
}

// ───────────────────────────── the mall ─────────────────────────────

/**
 * The mall: a vast four-storey block of cream panels with lit glass bands, glazed entrance halls,
 * a roof of long barrel skylights, and a multi-storey car park beside it.
 */
function mall(k: Kit, x: number, z: number, r: () => number) {
  const W = 260;
  const D = 180;
  const H = 30;
  k.add('box', 'sand', x, 0.2, z, W, H, D, '#ece3d2');
  for (const y of [5, 13, 21]) {
    k.add('box', 'window', x, y, z, W + 0.3, 3.4, D + 0.3, '#ffe0b0');
    k.add('box', 'white', x, y + 3.4, z, W + 1, 0.6, D + 1, WHITE);
  }
  // vertical panels over the glass bands
  for (let a = -W / 2; a <= W / 2; a += 6) for (const s of [-1, 1]) k.add('box', 'sand', x + a, 0.2, z + s * (D / 2 + 0.3), 1.2, H, 0.6, '#f2ebdd');
  for (let a = -D / 2; a <= D / 2; a += 6) for (const s of [-1, 1]) k.add('box', 'sand', x + s * (W / 2 + 0.3), 0.2, z + a, 0.6, H, 1.2, '#f2ebdd');
  // glazed entrance halls with canopies
  for (const [ex, ez, w, d] of [
    [x - W / 2 - 8, z, 16, 40],
    [x, z + D / 2 + 8, 50, 16],
    [x + W / 2 + 8, z - 40, 16, 34],
  ]) {
    k.add('box', 'window', ex, 0.2, ez, w, 18, d, '#ffe6bc');
    k.add('box', 'white', ex, 18.2, ez, w + 4, 1, d + 4, WHITE);
    k.add('box', 'glow', ex, 18, ez, w + 2, 0.15, d + 2, '#fff1d6');
  }
  // the roof: barrel skylights and plant
  k.add('box', 'white', x, H + 0.2, z, W + 2, 0.8, D + 2, '#f4f1ea');
  for (let a = -D / 2 + 20; a < D / 2 - 10; a += 28) {
    k.add('box', 'glass', x, H + 1, z + a, W - 40, 3, 10, '#8fb6d0');
    k.add('box', 'glow', x, H + 4, z + a, W - 42, 0.2, 1, '#e6f2ff');
  }
  k.add('hemi', 'glass', x - 60, H + 1, z, 40, 24, 40, '#8fb6d0');
  // the car park
  for (let lv = 0; lv < 4; lv++) {
    k.add('box', 'white', x + 10, 0.2 + lv * 3.4, z - D / 2 - 40, 200, 0.4, 50, '#e8e6e0');
    for (let a = -95; a <= 95; a += 2.8) if (r() < 0.6) k.add('box', 'car', x + 10 + a, 0.6 + lv * 3.4, z - D / 2 - 40 + (r() < 0.5 ? -12 : 12), 1.8, 1.2, 4.2, pick(['#f4f4f4', '#1a1a1a', '#8a9098', '#b0202a', '#1e3c6e'], r));
    k.add('box', 'glow', x + 10, 3.2 + lv * 3.4, z - D / 2 - 15, 200, 0.1, 0.2, '#fff0d0');
  }
  for (let a = -96; a <= 96; a += 12) for (const s of [-1, 1]) k.add('box', 'white', x + 10 + a, 0.2, z - D / 2 - 40 + s * 24, 0.8, 13.6, 0.8, '#e8e6e0');
}

// ───────────────────────────── the souk ─────────────────────────────

/** A two-storey souk across the lake: sand walls, arcades of arches, domes, wind towers, lanterns. */
function souk(k: Kit, x: number, z: number, r: () => number) {
  const W = 230;
  const D = 34;
  k.add('box', 'sand', x, 0.2, z, W, 12, D, '#e2c79c');
  k.add('box', 'sand', x, 12.2, z, W - 12, 0.8, D - 6, '#d9bc8e');
  for (let a = -W / 2 + 4; a < W / 2 - 2; a += 5) {
    for (const [y, h] of [
      [1, 4.2],
      [7, 3],
    ] as const) {
      k.add('box', 'window', x + a, y, z - D / 2 - 0.06, 2.6, h, 0.1, r() < 0.85 ? pick(WARM, r) : DIM);
      k.add('hemi', 'window', x + a, y + h, z - D / 2 - 0.06, 2.6, 2.4, 0.1, '#ffd08a');
    }
    // crenellations along the parapet
    k.add('box', 'sand', x + a, 12.2, z - D / 2 + 0.4, 1.6, 1.4, 0.8, '#e2c79c');
  }
  for (let q = 0; q < 7; q++) {
    const dx = x - W / 2 + 20 + q * ((W - 40) / 6);
    k.add('oct', 'sand', dx, 12.2, z, 12, 3, 12, '#e2c79c');
    k.add('hemi', 'sand', dx, 15.2, z, 11, 14, 11, '#eadbbd');
    k.add('cone', 'gold', dx, 22, z, 0.6, 3, 0.6, '#d8b25a');
  }
  for (const s of [-1, 1]) {
    k.add('box', 'sand', x + s * (W / 2 - 6), 0.2, z, 10, 24, 10, '#dcc196');
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) k.add('box', 'charcoal', x + s * (W / 2 - 6) + Math.sin(a) * 5.05, 18, z + Math.cos(a) * 5.05, 4, 5, 0.1, '#3a2c20', a);
  }
}

// ───────────────────────────── old town ─────────────────────────────

/**
 * Old town: a grid of streets lined with palms and lamps, filled with sand-coloured courtyard
 * blocks of five to nine floors: arched windows lit warm, crenellated parapets, wind towers and
 * roof pergolas, a pool and palms in each courtyard.
 */
function oldTown(k: Kit, keep: Rect[], r: () => number) {
  const free = (x: number, z: number, w: number, d: number) => keep.every((q) => Math.abs(x - q.x) > (q.w + w) / 2 + 6 || Math.abs(z - q.z) > (q.d + d) / 2 + 6);
  const inRing = (x: number, z: number) => ((x - 0) / 470) ** 2 + ((z - 30) / 370) ** 2;
  const cell = 62;
  for (let gx = -640 + cell / 2; gx < 660; gx += cell)
    for (let gz = -420 + cell / 2; gz < 540; gz += cell) {
      const e = inRing(gx, gz);
      if (e > 0.82 && e < 1.25) continue; // the ring boulevard runs here
      const w = 40 + r() * 6;
      const d = 38 + r() * 6;
      if (!free(gx, gz, w, d)) continue;
      // south and west of the core: old town; elsewhere, smaller glass mid-rises
      if (gz > 120 || gx < -330) courtyardBlock(k, gx, gz, w, d, 5 + Math.floor(r() * 5), r);
      else if (r() < 0.7) glassTower(k, { x: gx, z: gz, w: 26, d: 24, floors: 14 + Math.floor(r() * 16), plan: r() < 0.5 ? 'rect' : 'chamfer', seed: rng(Math.round(gx * 3 + gz)), glow: '#7ab8ff', crown: 'crownRing' });
      keep.push({ x: gx, z: gz, w, d });
      // the streets along this cell's south and east sides, with lane marks and the odd car
      k.add('box', 'asphalt', gx, 0.21, gz + cell / 2, cell + 9, 0.05, 9, '#3c4046');
      k.add('box', 'asphalt', gx + cell / 2, 0.21, gz, 9, 0.05, cell + 9, '#3c4046');
      for (let a = -cell / 2 + 4; a < cell / 2; a += 12) {
        k.add('box', 'paint', gx + a, 0.27, gz + cell / 2, 3, 0.02, 0.15, '#f2f2f2');
        k.add('box', 'paint', gx + cell / 2, 0.27, gz + a, 0.15, 0.02, 3, '#f2f2f2');
      }
      if (r() < 0.5) car(k, gx + (r() - 0.5) * cell, gz + cell / 2 + (r() < 0.5 ? -2.2 : 2.2), r() < 0.5 ? 0 : Math.PI, r);
      if (r() < 0.5) car(k, gx + cell / 2 + (r() < 0.5 ? -2.2 : 2.2), gz + (r() - 0.5) * cell, Math.PI / 2, r);
      // street palms and lamps along the block edges
      for (let a = -cell / 2 + 6; a < cell / 2; a += 12) {
        palm(k, gx + a, 0.2, gz + cell / 2 - 4, 8 + r() * 2, r);
        k.add('cyl', 'metal', gx + a + 6, 0.2, gz + cell / 2 - 4, 0.15, 6, 0.15, '#9aa0a6');
        k.add('sphere', 'glow', gx + a + 6, 6.3, gz + cell / 2 - 4, 0.5, 0.5, 0.5, '#ffe2b0');
      }
    }
}

function courtyardBlock(k: Kit, x: number, z: number, w: number, d: number, floors: number, r: () => number) {
  const fh = 3.4;
  const H = floors * fh;
  const col = pick(SAND, r);
  const t = 10; // wing depth round the courtyard
  for (const [cx, cz, bw, bd] of [
    [x, z - d / 2 + t / 2, w, t],
    [x, z + d / 2 - t / 2, w, t],
    [x - w / 2 + t / 2, z, t, d - 2 * t],
    [x + w / 2 - t / 2, z, t, d - 2 * t],
  ])
    k.add('box', 'sand', cx, 0.2, cz, bw, H, bd, col);
  // arched windows on the outer faces, lit warm
  for (let f = 1; f < floors; f++) {
    const y = 0.2 + f * fh + 0.5;
    for (const [nx, nz, L, yaw] of [
      [0, 1, w, 0],
      [0, -1, w, Math.PI],
      [1, 0, d, Math.PI / 2],
      [-1, 0, d, -Math.PI / 2],
    ] as const) {
      const n = Math.floor(L / 4);
      for (let q = 0; q < n; q++) {
        const a = -L / 2 + (L / n) * (q + 0.5);
        const wx = x + nx * (w / 2 + 0.06) + (nz !== 0 ? a : 0);
        const wz = z + nz * (d / 2 + 0.06) + (nx !== 0 ? a : 0);
        const c = r() < 0.8 ? pick(WARM, r) : DIM;
        k.add('box', 'window', wx, y, wz, 1.4, 1.8, 0.1, c, yaw);
        k.add('hemi', 'window', wx, y + 1.8, wz, 1.4, 1.4, 0.1, c, yaw);
      }
    }
    // a string course at every other floor
    if (f % 2 === 0) k.add('box', 'sand', x, 0.2 + f * fh, z, w + 0.6, 0.3, d + 0.6, '#f0e2c6');
  }
  // the ground floor: shopfronts lit behind an arcade
  k.add('box', 'window', x, 0.2, z, w + 0.2, fh - 0.4, d + 0.2, '#ffd59a');
  for (let a = -w / 2; a <= w / 2; a += 4) for (const s of [-1, 1]) k.add('box', 'sand', x + a, 0.2, z + s * (d / 2 + 0.3), 0.8, fh, 0.8, col);
  // parapet with crenellations, a wind tower and a roof pergola
  k.add('box', 'sand', x, H + 0.2, z, w + 0.4, 0.8, d + 0.4, col);
  for (let a = -w / 2; a < w / 2; a += 1.8) for (const s of [-1, 1]) k.add('box', 'sand', x + a, H + 1, z + s * (d / 2), 0.9, 0.8, 0.5, col);
  if (r() < 0.6) {
    const tx = x + (r() - 0.5) * (w - 12);
    k.add('box', 'sand', tx, H + 0.2, z - d / 2 + 5, 4, 8, 4, col);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) k.add('box', 'charcoal', tx + Math.sin(a) * 2.03, H + 5, z - d / 2 + 5 + Math.cos(a) * 2.03, 2.4, 2.6, 0.1, '#3a2c20', a);
  }
  for (let q = 0; q < 5; q++) k.add('box', 'trunk', x + w / 2 - 4, H + 3.2, z - 4 + q * 2, 6, 0.15, 0.2, '#8a6a4a');
  // the courtyard: lawn, a lit pool and palms
  k.add('box', 'lawn', x, 0.2, z, w - 2 * t, 0.15, d - 2 * t, '#5a8c40');
  k.add('box', 'water', x, 0.3, z, (w - 2 * t) * 0.55, 0.2, (d - 2 * t) * 0.4, '#43c3e6');
  for (const s of [-1, 1]) palm(k, x + s * (w / 2 - t - 3), 0.3, z, 7, r);
}

// ───────────────────────────── roads ─────────────────────────────

function ring(k: Kit, r: () => number) {
  const n = 72;
  const rx = 470;
  const rz = 370;
  const cz = 30;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const ax = Math.cos(a0) * rx;
    const az = cz + Math.sin(a0) * rz;
    const bx = Math.cos(a1) * rx;
    const bz = cz + Math.sin(a1) * rz;
    const L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const yaw = Math.atan2(-dz, dx);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const nx = dz;
    const nz = -dx;
    k.add('box', 'asphalt', mx, 0.22, mz, L + 1, 0.06, 30, '#3c4046', yaw);
    k.add('box', 'lawn', mx, 0.22, mz, L + 1, 0.2, 4, '#5a8c40', yaw);
    for (const s of [-1, 1]) {
      k.add('box', 'white', mx + nx * s * 15.2, 0.22, mz + nz * s * 15.2, L + 1, 0.25, 0.4, WHITE, yaw);
      k.add('box', 'paint', mx + nx * s * 8.5, 0.29, mz + nz * s * 8.5, L * 0.5, 0.02, 0.15, '#f2f2f2', yaw);
      if (r() < 0.8) car(k, mx + nx * s * (r() < 0.5 ? 5.5 : 11.5), mz + nz * s * (r() < 0.5 ? 5.5 : 11.5), yaw + (s > 0 ? Math.PI : 0), r);
    }
    palm(k, mx, 0.4, mz, 10 + r() * 2, r);
    if (i % 2 === 0)
      for (const s of [-1, 1]) {
        k.add('cyl', 'metal', mx + nx * s * 16.5, 0.2, mz + nz * s * 16.5, 0.2, 9, 0.2, '#9aa0a6');
        k.add('box', 'glow', mx + nx * s * 15, 9, mz + nz * s * 15, 0.8, 0.2, 0.5, '#fff0d0', yaw);
      }
  }
}

function highway(k: Kit, r: () => number) {
  const z = -500;
  k.add('box', 'asphalt', 0, 0.22, z, 1360, 0.06, 56, '#383c42');
  k.add('box', 'white', 0, 0.22, z, 1360, 1.0, 1.2, '#e8e6e0');
  for (const s of [-1, 1]) {
    k.add('box', 'white', 0, 0.22, z + s * 28, 1360, 0.8, 0.6, '#e8e6e0');
    for (const lane of [6, 10.5, 15, 19.5, 24]) {
      for (let x = -670; x < 670; x += 12) k.add('box', 'paint', x, 0.29, z + s * (lane - 2.25), 4, 0.02, 0.15, '#f2f2f2');
      for (let x = -670; x < 670; x += 18 + r() * 40) car(k, x, z + s * lane, s > 0 ? Math.PI : 0, r);
    }
  }
  // overhead sign gantries
  for (const x of [-450, -150, 150, 450]) {
    for (const s of [-1, 1]) k.add('box', 'metal', x, 0.2, z + s * 29, 0.6, 9, 0.6, '#9aa0a6');
    k.add('box', 'metal', x, 8.6, z, 0.8, 0.8, 58, '#9aa0a6');
    for (const s of [-1, 1]) k.add('box', 'glow', x + 0.6, 6.4, z + s * 14, 0.1, 2.6, 18, '#2e8a4a');
  }
  // the elevated metro: piers, a deck, a train, and a station with a gold shell
  const mz = z + 46;
  for (let x = -660; x <= 660; x += 30) k.add('cyl', 'white', x, 0.2, mz, 2.2, 12, 2.2, '#e8e6e0');
  k.add('box', 'white', 0, 12, mz, 1360, 1.6, 9, '#eeece6');
  k.add('box', 'glow', 0, 12.1, mz + 4.6, 1360, 0.2, 0.1, '#7ab8ff');
  for (let c = 0; c < 5; c++) {
    k.add('box', 'white', -200 + c * 22, 13.6, mz - 2, 21, 3.4, 3, '#f4f4f4');
    k.add('box', 'window', -200 + c * 22, 14.8, mz - 3.55, 20, 1.3, 0.1, '#cfe6ff');
  }
  k.add('hemi', 'gold', 120, 12, mz, 90, 22, 22, '#d8b25a');
  k.add('box', 'window', 120, 13.6, mz, 80, 4, 18, '#ffe6bc');
}

// ───────────────────────────── small things ─────────────────────────────

/** A date palm: a tall trunk and a crown of drooping fronds. */
export function palm(k: Kit, x: number, y: number, z: number, h: number, r: () => number) {
  k.add('cyl', 'trunk', x, y, z, 0.55, h, 0.55, '#8a6a4a');
  const n = 9;
  const col = pick(['#4a7d34', '#567f3a', '#3f6f2e', '#5f8a3e'], r);
  for (let q = 0; q < n; q++) {
    const a = (q / n) * Math.PI * 2 + r() * 0.3;
    const tilt = 0.25 + r() * 0.35;
    k.add('box', 'leaf', x + Math.sin(a) * 1.9, y + h - Math.sin(tilt) * 1.9, z + Math.cos(a) * 1.9, 0.9, 0.12, 4.2, col, a, tilt);
  }
  k.add('sphere', 'leaf', x, y + h, z, 1.1, 0.8, 1.1, col);
}

const CAR_COLOURS = ['#f4f4f4', '#1a1a1a', '#8a9098', '#b0202a', '#1e3c6e', '#d8d2c4', '#2f4f3f', '#c8c8cc'];

/** A car pointing along local +x when yaw is 0, with head and tail lights. */
function car(k: Kit, x: number, z: number, yaw: number, r: () => number) {
  const c = pick(CAR_COLOURS, r);
  const fx = Math.cos(yaw);
  const fz = -Math.sin(yaw);
  k.add('box', 'car', x, 0.5, z, 4.4, 0.75, 1.85, c, yaw);
  k.add('box', 'carGlass', x - fx * 0.3, 1.25, z - fz * 0.3, 2.4, 0.6, 1.7, '#1b222a', yaw);
  k.add('box', 'glow', x + fx * 2.21, 0.85, z + fz * 2.21, 0.05, 0.16, 1.4, '#fff6e0', yaw);
  k.add('box', 'glow', x - fx * 2.21, 0.9, z - fz * 2.21, 0.05, 0.14, 1.5, '#ff2a2a', yaw);
}
