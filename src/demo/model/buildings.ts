import type { Kit } from './kit';

/** Colours of the scale-model palette: matte white board, warm-white walls, charcoal accents. */
export const WHITE = '#f6f4ef';
export const WALL = '#e6e2da';
export const CHARCOAL = '#3b3e44';
export const DARK = '#141b26';

const WARM = ['#ffc56e', '#ffd08a', '#ffdba6', '#ffb95c', '#ffe7c2', '#ffcb7a'];

/** The colour of one window's light: most rooms lit warm, some dark. */
export function windowLight(r: () => number, lit = 0.86): string {
  if (r() > lit) return DARK;
  return WARM[Math.floor(r() * WARM.length)];
}

type P2 = [number, number];

/** Outline of a cross-shaped plan (a w × d0 bar crossed by a w0 × d bar), counter-clockwise. */
function crossPlan(w: number, d: number, w0: number, d0: number): P2[] {
  const a = w / 2,
    b = d / 2,
    c = w0 / 2,
    e = d0 / 2;
  return [
    [a, -e],
    [a, e],
    [c, e],
    [c, b],
    [-c, b],
    [-c, e],
    [-a, e],
    [-a, -e],
    [-c, -e],
    [-c, -b],
    [c, -b],
    [c, -e],
  ];
}

interface Edge {
  mx: number;
  mz: number;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
  L: number;
  yaw: number;
}

function edges(pts: P2[], ox: number, oz: number): Edge[] {
  // outward normals: the plan is counter-clockwise seen from above with +z towards the viewer
  const area = pts.reduce((s, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const sign = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dx = (q[0] - p[0]) / L;
    const dz = (q[1] - p[1]) / L;
    return { mx: ox + (p[0] + q[0]) / 2, mz: oz + (p[1] + q[1]) / 2, dx, dz, nx: dz * sign, nz: -dx * sign, L, yaw: Math.atan2(-dz, dx) };
  });
}

export interface TowerOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  w0: number;
  d0: number;
  floors: number;
  seed: () => number;
  lit?: number;
}

/**
 * A residential tower in the scale-model style: a cross-shaped plan; on every floor a crisp white
 * slab edge, a row of individually lit windows in white frames, glass-railed balconies across the
 * middle of the long faces; white fins rising the full height, charcoal accent strips, a double
 * height lit lobby, and a crown with a lit band, a set-back penthouse and a pergola.
 */
export function tower(k: Kit, o: TowerOpts) {
  const { x, z, w, d, w0, d0, floors, seed: r } = o;
  const fh = 3.2;
  const H = floors * fh;
  const lit = o.lit ?? 0.86;
  // the body behind the facade: pale wall that shows as frames between the windows
  k.add('box', 'wall', x, 0, z, w - 0.5, H, d0 - 0.5, WALL);
  k.add('box', 'wall', x, 0, z, w0 - 0.5, H, d - 0.5, WALL);
  for (const e of edges(crossPlan(w, d, w0, d0), x, z)) {
    const nb = Math.max(1, Math.round(e.L / 1.75));
    const bw = e.L / nb;
    const at = (a: number, o2: number): P2 => [e.mx + e.dx * a + e.nx * o2, e.mz + e.dz * a + e.nz * o2];
    const accent = e.L > 6 && r() < 0.5 ? Math.floor(r() * nb) : -1;
    const balconies = e.L > 9;
    const b0 = Math.floor(nb * 0.3);
    const b1 = Math.ceil(nb * 0.7);
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      if (f === 1) continue; // the lobby is two storeys high
      for (let b = 0; b < nb; b++) {
        const a = -e.L / 2 + bw * (b + 0.5);
        const [px, pz] = at(a, -0.2);
        if (b === accent && f > 1) k.add('box', 'charcoal', px, y, pz, bw + 0.02, fh, 0.12, CHARCOAL, e.yaw);
        else if (f === 0) k.add('box', 'window', px, 0.15, pz, bw - 0.22, fh * 2 - 0.9, 0.1, '#ffe6bc', e.yaw);
        else k.add('box', 'window', px, y + 0.4, pz, bw - 0.36, fh - 0.85, 0.1, windowLight(r, lit), e.yaw);
      }
      // the slab edge: a crisp white band at every floor
      if (f > 0) {
        const [sx, sz] = at(0, 0.15);
        k.add('box', 'white', sx, y - 0.34, sz, e.L + 0.5, 0.34, 0.75, WHITE, e.yaw);
      }
      // balconies across the middle of the long faces: a slab, a glass railing, a white handrail
      if (balconies && f > 1 && f < floors - 1) {
        const a0 = -e.L / 2 + b0 * bw;
        const a1 = -e.L / 2 + b1 * bw;
        const len = a1 - a0;
        const [cx, cz] = at((a0 + a1) / 2, 0.85);
        k.add('box', 'white', cx, y - 0.32, cz, len, 0.3, 1.7, WHITE, e.yaw);
        const [rx, rz] = at((a0 + a1) / 2, 1.65);
        k.add('box', 'railing', rx, y - 0.02, rz, len, 1.0, 0.05, '#d8ecf2', e.yaw);
        k.add('box', 'white', rx, y + 0.98, rz, len, 0.07, 0.09, WHITE, e.yaw);
        for (const s of [a0, a1]) {
          const [qx, qz] = at(s, 0.85);
          k.add('box', 'white', qx, y - 0.02, qz, 0.18, fh - 0.3, 1.7, WHITE, e.yaw);
        }
      }
    }
    // white fins the full height, every three bays and at the corners
    const fins: number[] = [];
    for (let b = 0; b < nb; b += 3) fins.push(b);
    fins.push(nb);
    for (const b of fins) {
      const [fx, fz] = at(-e.L / 2 + b * bw, 0.25);
      k.add('box', 'white', fx, 0, fz, 0.42, H + 0.6, 0.9, WHITE, e.yaw);
    }
    // the crown: a deep white band with a lit groove
    const [cx, cz] = at(0, 0.3);
    k.add('box', 'white', cx, H, cz, e.L + 0.9, 1.6, 1.2, WHITE, e.yaw);
    const [gx, gz] = at(0, 0.92);
    k.add('box', 'glow', gx, H + 0.62, gz, e.L + 0.4, 0.12, 0.05, '#fff1d6', e.yaw);
    // the lobby canopy on the longest faces
    if (e.L > 12) {
      const [qx, qz] = at(0, 1.6);
      k.add('box', 'white', qx, fh * 2 - 0.4, qz, Math.min(10, e.L * 0.5), 0.3, 3.2, WHITE, e.yaw);
      k.add('box', 'glow', qx, fh * 2 - 0.44, qz, Math.min(10, e.L * 0.5) - 0.6, 0.04, 2.6, '#fff1d6', e.yaw);
    }
  }
  // the roof: a slab, a set-back penthouse with a lit glass band, plant, and a white pergola
  k.add('box', 'white', x, H, z, w - 0.6, 0.6, d0 - 0.6, WHITE);
  k.add('box', 'white', x, H, z, w0 - 0.6, 0.6, d - 0.6, WHITE);
  k.add('box', 'charcoal', x, H + 0.6, z, w0 * 0.75, 3.6, d0 * 0.6, CHARCOAL);
  k.add('box', 'window', x, H + 1.0, z, w0 * 0.75 + 0.1, 2.2, d0 * 0.6 + 0.1, '#ffe2ae');
  k.add('box', 'white', x, H + 4.2, z, w0 * 0.75 + 1.2, 0.5, d0 * 0.6 + 1.2, WHITE);
  k.add('box', 'wall', x + w * 0.3, H + 0.6, z, 4, 2.2, 3, WALL);
  for (let q = -3; q <= 3; q++) k.add('box', 'white', x - w * 0.28 + q * 0.9, H + 3.4, z, 0.18, 0.18, d0 * 0.55, WHITE);
  for (const s of [-1, 1]) k.add('box', 'white', x - w * 0.28, H + 0.6, z + s * d0 * 0.27, 6.2, 2.8, 0.2, WHITE);
}

export interface MidOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  seed: () => number;
  lit?: number;
}

/**
 * A mid-rise block of terraced apartments (the low buildings in front of the towers): deep white
 * floor slabs projecting as terraces with glass railings on the long faces, lit window walls set
 * back behind them, solid white ends, charcoal frames, and a set-back top floor with a pergola.
 */
export function midrise(k: Kit, o: MidOpts) {
  const { x, z, w, d, floors, seed: r } = o;
  const fh = 3.3;
  const lit = o.lit ?? 0.86;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    const top = f === floors - 1;
    const ww = top ? w - 6 : w;
    const dd = top ? d - 4 : d;
    // the window wall, set back, lit room by room; solid white ends
    k.add('box', 'wall', x, y, z, ww - 1, fh, dd - 4, WALL);
    const nb = Math.round((ww - 2) / 2.2);
    const bw = (ww - 2) / nb;
    for (const s of [-1, 1]) {
      for (let b = 0; b < nb; b++) {
        const px = x - (ww - 2) / 2 + bw * (b + 0.5);
        k.add('box', 'window', px, y + 0.25, z + s * (dd / 2 - 1.95), bw - 0.25, fh - 0.75, 0.1, windowLight(r, lit));
      }
      // terraces: the slab projects, with a glass railing and a white handrail
      k.add('box', 'white', x, y + fh - 0.42, z + s * (dd / 2 - 0.3), ww + 0.4, 0.42, 3.8, WHITE);
      if (!top) {
        k.add('box', 'railing', x, y + fh, z + s * (dd / 2 + 1.5), ww - 0.4, 1.0, 0.05, '#d8ecf2');
        k.add('box', 'white', x, y + fh + 1.0, z + s * (dd / 2 + 1.5), ww - 0.4, 0.07, 0.09, WHITE);
      }
      // charcoal frames dividing the units
      for (let q = -1; q <= 1; q += 2) k.add('box', 'charcoal', x + q * ww * 0.18, y, z + s * (dd / 2 - 1.2), 0.4, fh - 0.42, 2.2, CHARCOAL);
      // solid white ends
      k.add('box', 'white', x + s * (ww / 2 - 0.4), y, z, 0.9, fh, dd - 0.6, WHITE);
      // a few windows in the ends
      if (f % 2 === 0) k.add('box', 'window', x + s * (ww / 2 + 0.06), y + 0.6, z, 0.1, fh - 1.4, 1.4, windowLight(r, lit));
    }
  }
  // the roof: a white cap with a charcoal fascia, a pergola over the top-floor terrace
  const H = floors * fh;
  k.add('box', 'charcoal', x, H - 0.1, z, w - 5.4, 0.55, d - 3.4, CHARCOAL);
  k.add('box', 'white', x, H + 0.45, z, w - 5.8, 0.15, d - 3.8, '#ecebe7');
  for (let q = 0; q < 6; q++) k.add('box', 'white', x + w / 2 - 2.6, H - 0.4, z - d / 2 + 3 + q * ((d - 6) / 5), 2.4, 0.16, 0.16, WHITE);
  k.add('box', 'railing', x, H - fh + fh, z + d / 2 + 1.5, w - 0.4, 1.0, 0.05, '#d8ecf2');
}

/**
 * A two-storey podium (clubhouse, lobbies, shops): a lit glass ground floor behind white columns,
 * a white upper band with a strip of windows, and a planted roof.
 */
export function podium(k: Kit, x: number, z: number, w: number, d: number, r: () => number) {
  k.add('box', 'window', x, 0, z, w - 1.2, 4.2, d - 1.2, '#ffe2ae');
  k.add('box', 'white', x, 4.2, z, w, 0.5, d, WHITE);
  k.add('box', 'wall', x, 4.7, z, w - 0.4, 3.3, d - 0.4, WALL);
  for (let a = -w / 2 + 1; a < w / 2 - 0.5; a += 2.2) {
    for (const s of [-1, 1]) k.add('box', 'window', x + a + 1.1, 5.2, z + s * (d / 2 - 0.15), 1.7, 2.2, 0.1, windowLight(r, 0.8));
  }
  for (let a = -w / 2 + 0.3; a <= w / 2; a += 4.4) for (const s of [-1, 1]) k.add('box', 'white', x + a, 0, z + s * (d / 2 - 0.3), 0.5, 4.2, 0.5, WHITE);
  k.add('box', 'white', x, 8, z, w + 0.4, 0.6, d + 0.4, WHITE);
  k.add('box', 'lawn', x, 8.6, z, w - 2, 0.15, d - 2, '#5a8c40');
}
