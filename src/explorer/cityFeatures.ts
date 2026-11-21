import * as THREE from 'three';
import type { Building, CityFeatures, Layout } from './layout';
import { type Add, type DistrictData, archWindow, fountain, frame, hashRand, lounger, minaret, palm, roundTree } from './districts';

/**
 * The coastal-corridor structure of futuristic cities, drawn from `layout.features`: the sea and
 * the beach, the creek and canals with their quays, bridges, dhows and abras, the marina with its
 * yachts, the lakes, the beachfront podium wall, the lake-tower plinths, the metro on its viaduct
 * along the spine, gated estates with gatehouses and golf or lake cores, and walled worship
 * compounds. Also the old town's courtyard houses and the neighbourhood mosques.
 */
export function cityFeatures(out: DistrictData, layout: Layout, y0: number, warm: boolean) {
  const f = layout.features!;
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  const r = hashRand(layout.radius * 7.3 + f.shoreZ);
  const R = layout.radius;
  out.sea = f.shoreZ;
  beach(add, f, R, r, layout, warm);
  for (const w of f.waters) water(out, add, w, layout, r, warm);
  for (const l of f.lakes) lake(out, add, l, r, l === f.lakes[0] && !!f.downtown, warm);
  if (f.jbr) jbr(add, f.jbr, f, r, warm);
  for (const c of f.jlt) {
    // the cluster plinth: a podium of shops and parking under three towers
    add('box', 'stone', c.x, 0, c.z, c.s, 5.5, c.s, '#cfd4da');
    add('box', 'glow', c.x, 0.4, c.z - c.s / 2 - 0.05, c.s - 2, 2.4, 0.1, '#fff2dc');
    for (const s of [-1, 1]) add('box', 'leaf', c.x + s * (c.s / 2 - 1.2), 5.5, c.z, 1.6, 0.8, c.s - 2, '#4f7a34');
  }
  metro(add, f, r);
  for (const e of f.estates) estate(out, add, e, r, warm);
  for (const c of f.compounds) compound(add, c);
  for (const [x, z] of f.roundabouts ?? []) roundabout(add, x, z, r, warm);
}

/** A roundabout: an asphalt circle over the crossing, a kerbed planted island, a palm or a fountain. */
function roundabout(add: Add, x: number, z: number, r: (k: number) => number, warm: boolean) {
  const k = Math.abs(x * 3.1 + z * 7.7);
  add('cyl', 'stone', x, 0, z, 26, 0.075, 26, '#454b54');
  // the white give-way ring painted around the island
  add('ring', 'paint', x, 0.08, z, 21, 0.02, 21, '#e8e8e2');
  add('cyl', 'stone', x, 0, z, 15, 0.35, 15, '#c9c3b5');
  add('cyl', 'lawn', x, 0.35, z, 13.6, 0.1, 13.6, '#5e9a48');
  if (r(k) < 0.4) {
    fountain(add, x, z, 5, true);
  } else if (warm) {
    for (let q = 0; q < 3; q++) palm(add, x + Math.cos(q * 2.1) * 2.6, z + Math.sin(q * 2.1) * 2.6, 7 + r(k + q) * 3, r, k + q * 5, 0.45);
  } else {
    roundTree(add, x, z, 6, '#4f7f3c', r, k);
  }
  for (let q = 0; q < 10; q++) add('sphere', 'leaf', x + Math.cos(q * 0.63) * 5.4, 0.45, z + Math.sin(q * 0.63) * 5.4, 1.4, 0.8, 1.4, q % 2 ? '#c84a7a' : '#4f8a3a');
}

// ───────────────────────── Sea and beach ─────────────────────────

function beach(add: Add, f: CityFeatures, R: number, r: (k: number) => number, layout: Layout, warm: boolean) {
  const half = Math.sqrt(Math.max(0, R * R - f.coastRoadZ * f.coastRoadZ)) + 120;
  const top = f.coastRoadZ - 6;
  const edge = f.shoreZ - 3;
  // a flat sand terrace from the coastal road to the water's edge, then a shelving slope underwater
  add('box', 'stone', 0, -0.25, (top + edge) / 2, half * 2, 0.32, top - edge, '#e8d6b0');
  add('box', 'stone', 0, -0.9, edge - 6, half * 2, 0.3, 12.4, '#d6c49c', 0, -0.09);
  // the beach is split into public stretches and hotel frontages in front of the resorts
  const hotels = layout.buildings.filter((b) => b.kind === 'slab' && b.z < f.coastRoadZ + 36 && b.z > f.coastRoadZ);
  // props stay on the sand, seaward of the coastal road
  const z0 = edge + 2;
  let k = 0;
  for (let x = -half + 30; x < half - 30; x += 7) {
    const resort = hotels.some((h) => Math.abs(h.x - x) < 26);
    const pub = !resort && Math.floor((x + half) / 80) % 2 === 0;
    if (!resort && !pub) continue;
    if (layout.features!.waters.some((w) => w.pts.some(([px, pz]) => Math.abs(px - x) < w.w && pz < f.coastRoadZ))) continue;
    if (resort) {
      // neat rows of white parasols and loungers in front of the hotel
      for (const dz of [0, Math.min(6, Math.max(0, top - 6 - z0))]) {
        add('cyl', 'metal', x, 0, z0 + dz, 0.08, 2.4, 0.08, '#d8d8d8');
        add('cone', 'cloth', x, 2.2, z0 + dz, 3, 0.6, 3, '#f4f2ea');
        lounger(add, x - 1, z0 + dz + 1.6, 0);
        lounger(add, x + 1, z0 + dz + 1.6, 0);
      }
    } else if (r(k) < 0.55) {
      // a public beach: bright umbrellas scattered, towels, the odd palm and a lifeguard tower
      const ux = x + (r(k + 1) - 0.5) * 4;
      const uz = z0 + r(k + 2) * Math.max(0, top - 4 - z0 - 2);
      add('cyl', 'metal', ux, 0, uz, 0.07, 2.2, 0.07, '#d0d0d0');
      add('cone', 'cloth', ux, 2, uz, 2.6, 0.55, 2.6, ['#e8402e', '#2e8ae8', '#f2b81e', '#3ab85a', '#f4f2ee'][Math.floor(r(k + 3) * 5)]);
      add('box', 'cloth', ux + 1.4, 0.06, uz + 1, 0.9, 0.02, 1.8, ['#e8402e', '#2e8ae8', '#f2b81e', '#c84aa0'][Math.floor(r(k + 4) * 4)]);
    }
    if (pub && Math.floor((x + half) / 7) % 11 === 0) {
      for (const s of [-1, 1]) for (const t of [-1, 1]) add('box', 'wood', x + s * 0.8, 0, Math.min(z0 + 6, top - 3) + t * 0.8, 0.15, 3, 0.15, '#c8a070');
      add('box', 'wood', x, 3, Math.min(z0 + 6, top - 3), 2.2, 0.15, 2.2, '#c8a070');
      add('box', 'plaster', x, 3.15, Math.min(z0 + 6, top - 3), 1.6, 1.4, 1.6, '#f4f4f0');
      add('box', 'cloth', x, 4.55, Math.min(z0 + 6, top - 3), 2.2, 0.15, 2.2, '#e8402e');
    }
    if (warm && Math.floor((x + half) / 7) % 6 === 0) palm(add, x, top - 3.5, 6 + r(k + 5) * 3, r, k + 6);
    k += 7;
  }
}

// ───────────────────────── Creek, canals, marina ─────────────────────────

function water(out: DistrictData, add: Add, w: CityFeatures['waters'][number], layout: Layout, r: (k: number) => number, warm: boolean) {
  const pts = w.pts;
  const quay = w.kind === 'creek' ? '#c8b48c' : '#d8d4cc';
  for (let q = 0; q < pts.length - 1; q++) {
    const [ax, az] = pts[q];
    const [bx, bz] = pts[q + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    // a box's local z runs along (sin t, cos t) after a turn t about y
    const t = Math.atan2(bx - ax, bz - az);
    const nx = Math.cos(t);
    const nz = -Math.sin(t);
    add('box', 'water', mx, 0.02, mz, w.w, 0.12, len + 0.2, '#3a8aa8', t);
    for (const s of [-1, 1]) {
      // quay walls, and on canals a paved promenade with railings and lamps
      add('box', 'stone', mx + nx * s * (w.w / 2 + 0.3), 0, mz + nz * s * (w.w / 2 + 0.3), 0.6, 0.45, len + 0.6, quay, t);
      if (w.kind !== 'creek') {
        add('box', 'stone', mx + nx * s * (w.w / 2 + 2.6), 0.02, mz + nz * s * (w.w / 2 + 2.6), 4, 0.14, len, '#e2dccf', t);
        add('box', 'metal', mx + nx * s * (w.w / 2 + 0.75), 0.45, mz + nz * s * (w.w / 2 + 0.75), 0.06, 0.9, len, '#c8ccd2', t);
        for (let d = 6; d < len - 4; d += 14) {
          const px = ax + ((bx - ax) * d) / len + nx * s * (w.w / 2 + 3.6);
          const pz = az + ((bz - az) * d) / len + nz * s * (w.w / 2 + 3.6);
          add('cyl', 'metal', px, 0, pz, 0.12, 4, 0.12, '#2a2e34');
          add('sphere', 'glow', px, 4.1, pz, 0.35, 0.35, 0.35, '#ffe2b0');
          if (warm && Math.round(d / 14) % 2 === 0) palm(add, px + nx * s * 1.2, pz + nz * s * 1.2, 5.5 + r(q * 31 + d) * 2.5, r, q * 17 + d);
        }
      }
    }
    // boats: dhows moored along the creek, yachts in the marina
    for (let d = 10; d < len - 10; d += w.kind === 'marina' ? 12 : 22) {
      const s = Math.round(d / 11) % 2 ? 1 : -1;
      const off = w.w / 2 - (w.kind === 'marina' ? 3 : 3.5);
      const px = ax + ((bx - ax) * d) / len + nx * s * off;
      const pz = az + ((bz - az) * d) / len + nz * s * off;
      if (w.kind === 'creek') dhow(add, px, pz, t, r, q * 13 + d);
      else if (w.kind === 'marina') yacht(add, px, pz, t, r, q * 13 + d);
    }
    if (w.kind === 'marina') {
      // pontoons along one bank
      for (let d = 8; d < len - 8; d += 12) {
        const px = ax + ((bx - ax) * d) / len + nx * (w.w / 2 - 1);
        const pz = az + ((bz - az) * d) / len + nz * (w.w / 2 - 1);
        add('box', 'wood', px, 0.12, pz, 2, 0.15, 1.2, '#a07a52', t);
      }
    }
  }
  for (let q = 1; q < pts.length - 1; q++) add('cyl', 'water', pts[q][0], 0.02, pts[q][1], w.w, 0.12, w.w, '#3a8aa8');
  // bridges where streets cross the water
  for (const st of layout.streets) {
    if (st.w < 3) continue;
    for (let q = 0; q < pts.length - 1; q++) {
      const hit = segHit(st.a, st.b, pts[q], pts[q + 1]);
      if (!hit) continue;
      const t = Math.atan2(st.b[0] - st.a[0], st.b[1] - st.a[1]);
      const span = w.w + 6;
      add('box', 'stone', hit[0], 0.2, hit[1], st.w + 1.2, 0.5, span, '#c8ccd2', t);
      add('box', 'stone', hit[0], 0.65, hit[1], st.w - 0.4, 0.06, span, '#5a5e66', t);
      for (const s of [-1, 1]) {
        const px = hit[0] + Math.cos(t) * s * (st.w / 2 + 0.4);
        const pz = hit[1] - Math.sin(t) * s * (st.w / 2 + 0.4);
        add('box', 'metal', px, 0.7, pz, 0.15, 1, span, '#e8ebef', t);
      }
    }
  }
  if (w.kind === 'creek') {
    // abra (water-taxi) piers on both banks near the mouth, with boats waiting
    for (const q of [1, 2]) {
      if (q >= pts.length - 1) break;
      const [ax, az] = pts[q];
      const [bx, bz] = pts[q + 1];
      const t = Math.atan2(bx - ax, bz - az);
      const nx = Math.cos(t);
      const nz = -Math.sin(t);
      for (const s of [-1, 1]) {
        const px = ax + nx * s * (w.w / 2 - 2.5);
        const pz = az + nz * s * (w.w / 2 - 2.5);
        add('box', 'wood', px, 0.15, pz, 5, 0.2, 9, '#8a6440', t);
        add('box', 'cloth', px, 2.8, pz, 5.4, 0.12, 9.4, '#f2efe6', t);
        for (const c of [-1, 1]) for (const e of [-1, 1]) add('box', 'wood', px + nx * c * 2.4 + Math.sin(t) * e * 4.4, 0, pz + nz * c * 2.4 + Math.cos(t) * e * 4.4, 0.18, 2.8, 0.18, '#6a4a30');
        abra(add, px - nx * s * 4.5, pz - nz * s * 4.5, t, r, q * 7 + s);
      }
    }
  }
  void out;
}

/** Where segment a-b crosses segment c-d, or null. */
function segHit(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): [number, number] | null {
  const r1x = b[0] - a[0];
  const r1z = b[1] - a[1];
  const r2x = d[0] - c[0];
  const r2z = d[1] - c[1];
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c[0] - a[0]) * r2z - (c[1] - a[1]) * r2x) / den;
  const u = ((c[0] - a[0]) * r1z - (c[1] - a[1]) * r1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r1x * t, a[1] + r1z * t];
}

function dhow(add: Add, x: number, z: number, t: number, r: (k: number) => number, k: number) {
  const hull = ['#8a5a30', '#7a4a28', '#9a6a3a'][Math.floor(r(k) * 3)];
  add('box', 'wood', x, 0.1, z, 3.2, 1.4, 11, hull, t);
  add('box', 'wood', x, 1.5, z - Math.cos(t) * 0, 3.4, 0.2, 11.4, '#5a3a20', t);
  add('box', 'wood', x + Math.sin(t) * -3, 1.7, z + Math.cos(t) * -3, 3, 1.6, 3.4, '#a07a52', t);
  add('cyl', 'wood', x + Math.sin(t) * 1.5, 1.6, z + Math.cos(t) * 1.5, 0.16, 6, 0.16, '#5a3a20');
  for (let q = 0; q < 4; q++) add('box', 'cloth', x + Math.sin(t) * (2 - q * 1.2), 1.7, z + Math.cos(t) * (2 - q * 1.2), 2.6, 0.6, 1, ['#e8402e', '#2e6a8a', '#d8a030', '#e8e0d0'][Math.floor(r(k + q) * 4)], t);
}

function abra(add: Add, x: number, z: number, t: number, r: (k: number) => number, k: number) {
  add('box', 'wood', x, 0.1, z, 2.2, 0.8, 8, '#9a6a3a', t);
  add('box', 'wood', x, 0.9, z, 2.3, 0.08, 7, '#6a4428', t);
  add('box', 'cloth', x, 2.2, z, 2.4, 0.1, 6.5, r(k) < 0.5 ? '#2e6a8a' : '#c8502e', t);
  for (const e of [-2.8, 0, 2.8]) add('box', 'wood', x + Math.sin(t) * e, 0.9, z + Math.cos(t) * e, 0.1, 1.3, 0.1, '#5a3a20');
}

function yacht(add: Add, x: number, z: number, t: number, r: (k: number) => number, k: number) {
  const L = 9 + r(k) * 8;
  add('box', 'plaster', x, 0.05, z, 3.4, 1.4, L, '#f4f6f8', t);
  add('cone', 'plaster', x + Math.sin(t) * (L / 2 + 1.2), 0.05, z + Math.cos(t) * (L / 2 + 1.2), 3.4, 1.4, 2.6, '#f4f6f8', t, Math.PI / 2);
  add('box', 'plaster', x - Math.sin(t) * 1, 1.45, z - Math.cos(t) * 1, 2.8, 1.3, L * 0.5, '#e8ebef', t);
  add('box', 'glass', x - Math.sin(t) * 1, 1.75, z - Math.cos(t) * 1, 2.9, 0.6, L * 0.48, '#2a3a4a', t);
  if (L > 13) add('box', 'plaster', x - Math.sin(t) * 1.6, 2.75, z - Math.cos(t) * 1.6, 2.2, 1, L * 0.3, '#f4f6f8', t);
  add('box', 'dark', x, 0.05, z, 3.45, 0.3, L, '#1e2a3a', t);
}

// ───────────────────────── Lakes ─────────────────────────

function lake(out: DistrictData, add: Add, l: CityFeatures['lakes'][number], r: (k: number) => number, downtown: boolean, warm: boolean) {
  add('cyl', 'stone', l.x, 0, l.z, l.rx * 2 + 3, 0.4, l.rz * 2 + 3, downtown ? '#e6e0d4' : '#cfc8bc');
  add('cyl', 'water', l.x, 0.08, l.z, l.rx * 2, 0.2, l.rz * 2, downtown ? '#2a7aa8' : '#3a8aa8');
  out.lights.push([l.x, l.z]);
  if (l.island) {
    add('cyl', 'stone', l.x, 0, l.z, l.island * 2, 0.5, l.island * 2, '#e2dccf');
    add('cyl', 'lawn', l.x, 0.5, l.z, l.island * 2 - 3, 0.1, l.island * 2 - 3, '#5f9a40');
  }
  if (downtown) {
    // the dancing fountain: rows of jets across the lake, a boardwalk along one shore
    for (let q = 0; q < 22; q++) {
      const t = (q / 22) * Math.PI * 2;
      const fx = l.x + Math.cos(t) * (l.rx - 4);
      const fz = l.z + Math.sin(t) * (l.rz - 3);
      if (l.island && Math.hypot(fx - l.x, fz - l.z) < l.island + 2) continue;
      add('cone', 'beam', fx, 0.2, fz, 1.2, 4 + r(q) * 6, 1.2, '#e8f6ff');
      add('cyl', 'glow', fx, 0.25, fz, 0.5, 0.06, 0.5, '#bfe8ff');
    }
    add('box', 'wood', l.x, 0.2, l.z + l.rz + 2.5, l.rx * 1.2, 0.2, 3.5, '#a07a52');
  } else {
    for (let q = 0; q < 5; q++) {
      const t = r(q + 3) * Math.PI * 2;
      add('cone', 'leaf', l.x + Math.cos(t) * l.rx * 0.95, 0, l.z + Math.sin(t) * l.rz * 0.95, 0.6, 1.6, 0.6, '#5a7a3a');
    }
  }
  if (warm) for (let q = 0; q < 6; q++) {
    const t = (q / 6) * Math.PI * 2 + 0.3;
    palm(add, l.x + Math.cos(t) * (l.rx + 4), l.z + Math.sin(t) * (l.rz + 4), 6 + r(q + 9) * 2, r, q + 40);
  }
}

// ───────────────────────── Beachfront wall, metro ─────────────────────────

function jbr(add: Add, j: NonNullable<CityFeatures['jbr']>, f: CityFeatures, r: (k: number) => number, warm: boolean) {
  const cx = (j.x0 + j.x1) / 2;
  const cz = (j.z0 + j.z1) / 2;
  const L = j.x1 - j.x0;
  const D = j.z1 - j.z0;
  // a continuous two-level podium: shops and cafes on the street facing the sea, parking above
  add('box', 'plaster', cx, 0, cz, L, 9, D, '#e2d8c6');
  add('box', 'glass', cx, 0.3, j.z0 - 0.05, L - 2, 3.6, 0.12, '#6f8ea6');
  add('box', 'glow', cx, 4.1, j.z0 - 0.08, L - 2, 0.35, 0.1, '#ffd890');
  for (let x = j.x0 + 4; x < j.x1 - 4; x += 8) add('cone', 'cloth', x, 2.6, j.z0 - 3, 3.4, 0.7, 3.4, ['#f2efe6', '#e8402e', '#2e6a8a'][Math.floor(r(x) * 3)]);
  add('box', 'stone', cx, 0.02, j.z0 - 3.5, L, 0.14, 7, '#e8dfcc');
  add('box', 'leaf', cx, 9, cz, L - 4, 0.6, D - 6, '#5f8a3c');
  if (warm) for (let x = j.x0 + 6; x < j.x1; x += 12) palm(add, x, j.z0 - 6.5, 6 + r(x + 1) * 2, r, Math.round(x));
  void f;
}

function metro(add: Add, f: CityFeatures, r: (k: number) => number) {
  const m = f.metro;
  const y = 6;
  const L = m.x1 - m.x0;
  const cx = (m.x0 + m.x1) / 2;
  // the viaduct: a deck on piers, rails and a lit guideway edge
  add('box', 'plaster', cx, y - 1, m.z, L, 1, 4.6, '#e6e9ed');
  for (const s of [-1, 1]) {
    add('box', 'metal', cx, y, m.z + s * 0.8, L, 0.14, 0.12, '#8a8f96');
    add('box', 'glow', cx, y - 0.7, m.z + s * 2.32, L, 0.12, 0.05, '#bfe0ff');
  }
  for (let x = m.x0 + 6; x < m.x1; x += 22) {
    add('box', 'plaster', x, 0, m.z, 1.4, y - 1, 1.6, '#d8dce2');
    add('box', 'plaster', x, y - 1.6, m.z, 1.6, 0.6, 4.4, '#d8dce2');
  }
  // stations: platforms under a glass canopy, a footbridge over the boulevard on each side
  for (const sx of m.stations) {
    add('box', 'stone', sx, y - 0.2, m.z, 30, 0.5, 9, '#e8ebef');
    add('box', 'glass', sx, y + 3.2, m.z, 30, 0.2, 9.6, '#9ec4d8');
    for (const s of [-1, 1]) for (const e of [-13, 0, 13]) add('cyl', 'metal', sx + e, y + 0.3, m.z + s * 4.2, 0.2, 2.9, 0.2, '#e8ebef');
    add('box', 'glow', sx, y + 3.05, m.z, 28, 0.08, 1, '#ffffff');
    for (const s of [-1, 1]) {
      // footbridges across the boulevard to stair towers on its pavements
      const edge = f.spineZ + s * 11;
      const mid = (m.z + s * 4.5 + edge) / 2;
      const len = Math.abs(edge - (m.z + s * 4.5));
      add('box', 'glass', sx + 8, y - 0.2, mid, 3.2, 3, len, '#9ec4d8');
      add('box', 'plaster', sx + 8, y - 0.4, mid, 3.4, 0.3, len, '#e8ebef');
      add('box', 'plaster', sx + 8, 0, edge + s * 1.5, 4, y + 2.6, 3, '#e2e6ea');
      add('box', 'glow', sx + 8, y + 1.4, edge + s * 3.05, 2.6, 0.8, 0.1, '#e8402e');
    }
  }
  // two trains on the line
  for (const [t0, dir] of [[0.27, 1], [0.71, -1]] as const) {
    const x0 = m.x0 + L * t0;
    for (let c = 0; c < 5; c++) {
      const x = x0 + dir * c * 12.4;
      add('box', 'metal', x, y + 0.2, m.z + dir * 0.0, 12, 3, 2.9, '#e8ebef');
      add('box', 'glass', x, y + 1.3, m.z, 11.6, 1.1, 2.95, '#2a3a4a');
      add('box', 'glow', x, y + 2.95, m.z, 11.4, 0.08, 2.4, '#bfe0ff');
    }
    add('box', 'glow', x0 - dir * 6.1, y + 0.9, m.z, 0.1, 1.2, 2.2, '#ffffff');
  }
  void r;
}

// ───────────────────────── Gated estates, compounds ─────────────────────────

function estate(out: DistrictData, add: Add, e: CityFeatures['estates'][number], r: (k: number) => number, warm: boolean) {
  const [gx, gz] = e.gate;
  // a low perimeter wall with a hedge, broken at the gate
  const x0 = e.x - e.w / 2 - 1;
  const x1 = e.x + e.w / 2 + 1;
  const z0 = e.z - e.d / 2 - 1;
  const z1 = e.z + e.d / 2 + 1;
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) return;
    const t = Math.atan2(bx - ax, bz - az);
    add('box', 'plaster', (ax + bx) / 2, 0, (az + bz) / 2, 0.4, 1.8, len, '#e6dccb', t);
    add('box', 'leaf', (ax + bx) / 2, 1.8, (az + bz) / 2, 0.7, 0.6, len, '#3a6a2e', t);
  };
  wall(x0, z0, gx - 6, z0);
  wall(gx + 6, z0, x1, z0);
  wall(x1, z0, x1, z1);
  wall(x1, z1, x0, z1);
  wall(x0, z1, x0, z0);
  // the gatehouse, boom barriers, gate piers with lamps and the community sign
  add('box', 'plaster', gx, 0, gz + 8, 4, 3.2, 3.4, '#ece4d4');
  add('box', 'glass', gx, 1, gz + 6.25, 3.2, 1.4, 0.1, '#6f8ea6');
  add('box', 'roof', gx, 3.2, gz + 8, 5.2, 0.4, 4.6, '#7a5a3a');
  add('box', 'plaster', gx, 5.2, gz + 4.5, 12, 0.4, 3, '#f4f0e6');
  for (const s of [-1, 1]) {
    add('box', 'stone', gx + s * 6, 0, gz + 4.5, 1.2, 5.6, 1.2, '#d8ccb4');
    add('sphere', 'glow', gx + s * 6, 5.8, gz + 4.5, 0.4, 0.4, 0.4, '#ffe2b0');
    add('box', 'plaster', gx + s * 2.6, 0.9, gz + 3, 4.2, 0.12, 0.12, s > 0 ? '#e8402e' : '#f4f4f0');
  }
  add('box', 'stone', gx - 12, 0, gz + 1.5, 7, 2, 1, '#cfc4ae');
  add('box', 'glow', gx - 12, 0.9, gz + 0.95, 5.6, 0.8, 0.1, '#f2d24a');
  if (warm) for (const s of [-1, 1]) palm(add, gx + s * 9, gz + 6, 7, r, 3 + s);
  // the core: a golf course with bunkers and a pond in loop estates, a lake park in lane estates
  if (e.core) {
    const c = e.core;
    if (Math.min(c.rx, c.rz) > 14) {
      add('cyl', 'lawn', c.x, 0.02, c.z, c.rx * 2, 0.14, c.rz * 2, '#6aaa48');
      add('cyl', 'lawn', c.x - c.rx * 0.2, 0.04, c.z, c.rx * 1.3, 0.14, c.rz * 0.7, '#7cbc58', 0.3);
      add('cyl', 'water', c.x + c.rx * 0.35, 0.06, c.z + c.rz * 0.2, c.rx * 0.6, 0.14, c.rz * 0.55, '#3a8aa8');
      for (const [bx, bz] of [[-0.55, -0.4], [0.1, 0.55], [-0.2, -0.65]] as const) add('cyl', 'stone', c.x + bx * c.rx, 0.05, c.z + bz * c.rz, 5, 0.14, 3.2, '#ead8a8');
      add('cyl', 'lawn', c.x - c.rx * 0.6, 0.07, c.z + c.rz * 0.1, 7, 0.14, 7, '#8ad060');
      add('cyl', 'metal', c.x - c.rx * 0.6, 0, c.z + c.rz * 0.1, 0.06, 2.2, 0.06, '#e8e8e8');
      add('box', 'cloth', c.x - c.rx * 0.6 + 0.3, 1.8, c.z + c.rz * 0.1, 0.6, 0.4, 0.02, '#e8402e');
      out.lights.push([c.x + c.rx * 0.35, c.z + c.rz * 0.2]);
      for (let q = 0; q < 10; q++) {
        const t = (q / 10) * Math.PI * 2;
        roundTree(add, c.x + Math.cos(t) * c.rx * 0.9, c.z + Math.sin(t) * c.rz * 0.9, 4.5 + r(q) * 2, '#4f7a34', r, q * 5);
      }
    } else {
      add('box', 'lawn', c.x, 0.02, c.z, c.rx * 2, 0.14, c.rz * 2, '#64a044');
      add('cyl', 'water', c.x, 0.06, c.z, Math.min(c.rx, c.rz) * 1.3, 0.14, Math.min(c.rx, c.rz) * 1.1, '#3a8aa8');
      fountain(add, c.x, c.z, 2.4, false);
      out.lights.push([c.x, c.z]);
      for (let q = 0; q < 6; q++) {
        const t = (q / 6) * Math.PI * 2;
        const px = c.x + Math.cos(t) * c.rx * 0.8;
        const pz = c.z + Math.sin(t) * c.rz * 0.8;
        if (warm && q % 2 === 0) palm(add, px, pz, 6, r, q + 20);
        else roundTree(add, px, pz, 5, '#4f7a34', r, q + 30);
      }
    }
  }
  for (const [bx, bz] of e.bulbs) add('cyl', 'dark', bx, 0.05, bz, 18, 0.08, 18, '#3a3e44');
}

function compound(add: Add, c: CityFeatures['compounds'][number]) {
  const x0 = c.x - c.w / 2;
  const x1 = c.x + c.w / 2;
  const z0 = c.z - c.d / 2;
  const z1 = c.z + c.d / 2;
  for (const [ax, az, bx, bz] of [[x0, z0, c.x - 3, z0], [c.x + 3, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const t = Math.atan2(bx - ax, bz - az);
    add('box', 'plaster', (ax + bx) / 2, 0, (az + bz) / 2, 0.5, 2.6, len, '#e8e0d0', t);
    add('box', 'stone', (ax + bx) / 2, 2.6, (az + bz) / 2, 0.7, 0.2, len, '#cfc4ae', t);
  }
  add('arch', 'plaster', c.x, 2.6, z0, 6.5, 2, 0.6, '#e8e0d0');
  for (const s of [-1, 1]) add('box', 'plaster', c.x + s * 3.3, 0, z0, 0.9, 3.6, 0.9, '#e8e0d0');
  add('box', 'glow', c.x, 4.4, z0 - 0.4, 5, 0.6, 0.08, '#f2d24a');
}

// ───────────────────────── Old town houses, neighbourhood mosques ─────────────────────────

/** A courtyard house: four wings round an open court, a parapet, few street windows, often a wind tower. */
export function oldHouse(out: DistrictData, b: Building, y0: number) {
  const r = hashRand(b.tone * 1000 + b.x * 0.3 + b.z * 0.7);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const W = b.w;
  const D = b.d;
  const H = b.h;
  const col = new THREE.Color(['#dcc298', '#d4b488', '#e4cfa8', '#cfae84', '#e8d8b8'][Math.floor(r(1) * 5)]);
  const t = 2.6;
  add('box', 'plaster', 0, 0, D / 2 - t / 2, W, H, t, col);
  add('box', 'plaster', 0, 0, -D / 2 + t / 2, W, H * (r(2) < 0.5 ? 1 : 0.8), t, col);
  for (const s of [-1, 1]) add('box', 'plaster', s * (W / 2 - t / 2), 0, 0, t, H * 0.9, D - 2 * t, col);
  add('box', 'stone', 0, 0.02, 0, W - 2 * t, 0.12, D - 2 * t, '#cdb48a');
  if (r(3) < 0.5) roundTree(add, 0, 0, 3.5, '#5a7a3a', r, 4);
  // parapet with small crenellations along the street face, a carved door, two small windows
  for (let q = 0; q < Math.floor(W / 1.4); q++) add('box', 'plaster', -W / 2 + 0.7 + q * 1.4, H, D / 2 - 0.2, 0.5, 0.5, 0.35, col);
  add('box', 'wood', 0, 0, D / 2 + 0.02, 1.3, 2.3, 0.1, ['#6a4428', '#2e5a6a', '#7a3a2a'][Math.floor(r(5) * 3)]);
  for (const s of [-1, 1]) add('box', 'dark', s * W * 0.3, 2.6, D / 2 + 0.02, 0.6, 0.8, 0.06, '#2a1c12');
  // a wind tower (barjeel) on about half the houses
  if (r(6) < 0.55) {
    const tx = (r(7) - 0.5) * (W - 4);
    const tz = (r(8) - 0.5) * (D - 4);
    add('box', 'plaster', tx, H, tz, 2.6, 4.5, 2.6, col.clone().offsetHSL(0, 0, 0.03));
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      for (const o of [-0.55, 0, 0.55]) add('box', 'dark', tx + Math.sin(a) * 1.32 + Math.cos(a) * o, H + 2, tz + Math.cos(a) * 1.32 - Math.sin(a) * o, 0.22, 2.2, 0.08, '#3a2a1e', a);
    }
    add('box', 'plaster', tx, H + 4.5, tz, 3, 0.35, 3, col);
  }
  // a roof terrace awning on some
  if (r(9) < 0.3) add('box', 'cloth', 0, H - 0.5 + 2.2, -D / 2 + t / 2, W * 0.5, 0.06, t, ['#b8442e', '#2e6a8a', '#e8e0d0'][Math.floor(r(10) * 3)]);
}

/** A neighbourhood (daily) mosque: a walled forecourt, a prayer hall under a dome, one minaret. */
export function mosqueSmall(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + b.x * 0.9);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const S = b.w;
  const white = new THREE.Color(r(1) < 0.6 ? '#f6f4ee' : '#efe4cc');
  const domeC = ['#f6f4ee', '#3f9a9a', '#d8b25a', '#4a7aa8'][Math.floor(r(2) * 4)];
  const domeM = domeC === '#d8b25a' ? 'gold' : 'plaster';
  // forecourt wall and an arched gateway facing the street
  add('box', 'marble', 0, 0, 0, S + 2, 0.25, S + 2, '#ebe7de');
  for (const [lx, lz, sx, sz] of [[0, -S / 2 - 1, S + 2, 0.4], [-S / 2 - 1, 0, 0.4, S + 2], [S / 2 + 1, 0, 0.4, S + 2], [-S / 4 - 1.5, S / 2 + 1, S / 2 - 1, 0.4], [S / 4 + 1.5, S / 2 + 1, S / 2 - 1, 0.4]] as const) add('box', 'plaster', lx, 0, lz, sx, 2, sz, white);
  add('box', 'plaster', 0, 0, S / 2 + 1, 4, 3.4, 0.6, white);
  archWindow(add, 0, 0.2, S / 2 + 1.32, 2, 2.8, 'dark', '#2a2a2a');
  // the prayer hall with arched windows, a dome on a drum, a crescent finial
  const hw = S * 0.7;
  const hd = S * 0.5;
  const hz = -S * 0.12;
  add('box', 'plaster', 0, 0, hz, hw, 5.5, hd, white);
  for (let q = 0; q < 3; q++) archWindow(add, -hw / 2 + (hw / 3) * (q + 0.5), 1, hz + hd / 2 + 0.03, 1.1, 2.8, 'glass', '#6f8ea6');
  add('box', 'stone', 0, 5.5, hz, hw + 0.3, 0.3, hd + 0.3, '#e2dccd');
  add('cyl', 'plaster', 0, 5.8, hz, hd * 0.75, 1.2, hd * 0.75, white);
  add('hemi', domeM, 0, 7, hz, hd * 0.8, hd * 0.75, hd * 0.8, domeC);
  add('cone', 'gold', 0, 7 + hd * 0.35, hz, 0.4, 1.4, 0.4, '#d8b25a');
  // one minaret at a front corner
  minaret(add, (r(3) < 0.5 ? -1 : 1) * (S / 2 - 1.2), S / 2 - 1.2, 14 + r(4) * 6, white);
  fountain(add, 0, S * 0.3, 2.2, false);
  if (warm) palm(add, (r(3) < 0.5 ? 1 : -1) * (S / 2 - 2), S / 2 - 2.2, 5.5, r, 9);
}
