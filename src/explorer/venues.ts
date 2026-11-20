import * as THREE from 'three';
import type { Building } from './layout';
import type { DMat, DShape, DistrictData } from './districts';

/**
 * Sports venues for futuristic cities, at real sizes:
 * - a Premier League football stadium: a 105 x 68 m pitch with full markings, goals and nets,
 *   corner flags, dugouts and LED boards, four two-tier stands with corner fills, executive
 *   boxes, tunnels, a cantilevered roof with trusses and floodlight strips, corner screens,
 *   a finned facade with stair towers and a fan plaza;
 * - an NBA arena: a 28.65 x 15.24 m hardwood court with NBA markings, hoops with stanchions,
 *   backboards and shot clocks, a three-tier bowl with ribbon boards and suites, a centre-hung
 *   scoreboard, a catwalk, all inside a glazed elliptical shell under a glass skylight roof.
 * Seats are drawn with the 'crowd' material, which fills each row with fans procedurally.
 */

type Add = (shape: DShape, mat: DMat, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string | THREE.Color, rot?: number, rx?: number, rz?: number) => void;

function hashRand(seed: number) {
  return (k: number) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
}

const TEAM_COLS = ['#c8102e', '#034694', '#6cabdd', '#fdb913', '#132257', '#7a263a', '#00a650', '#f47a20'];

/** A straight run of tiered seating along local +x, rising away from the field towards -z. */
function stand(add: Add, cx: number, cz: number, len: number, rows: number, rowD: number, rowH: number, y0: number, rot: number, seat: string, aisleEvery = 9) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // local (along, back) -> world, with "back" pointing away from the field
  const P = (along: number, back: number): [number, number] => [cx + along * c - back * s, cz - along * s - back * c];
  for (let r = 0; r < rows; r++) {
    const [x, z] = P(0, r * rowD + rowD / 2);
    // the riser and the tread: one box per row, the crowd shader paints the fans on top
    add('box', 'crowd', x, y0, z, len, y0 + (r + 1) * rowH - y0, rowD, seat, rot);
  }
  // aisles: stairs cut through the rows
  const n = Math.max(1, Math.floor(len / aisleEvery));
  for (let k = 1; k < n; k++) {
    const along = -len / 2 + (k * len) / n;
    for (let r = 0; r < rows; r += 1) {
      const [x, z] = P(along, r * rowD + rowD / 2);
      add('box', 'stone', x, y0, z, 1.1, (r + 1) * rowH + 0.02, rowD + 0.02, '#9aa0a8', rot);
    }
  }
  // the front wall and a rail at the top
  const [fx, fz] = P(0, -0.15);
  add('box', 'stone', fx, Math.max(0, y0 - 1.2), fz, len, 1.2 + 1.0, 0.3, '#3a3e46', rot);
  const [tx, tz] = P(0, rows * rowD + 0.2);
  add('box', 'metal', tx, y0 + rows * rowH, tz, len, 1.1, 0.12, '#c8ccd2', rot);
}

// ───────────────────────── Football stadium ─────────────────────────

export function footballStadium(out: DistrictData, add: Add, b: Building, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 17);
  // local frame from the caller: +z towards the main entrance; the pitch runs along the long axis
  const L = 105;
  const Wp = 68;
  // the entrance is always on a long side, so in the local frame the long axis is x
  const OW = Math.max(b.w, b.d) / 2;
  const OD = Math.min(b.w, b.d) / 2;
  const R0 = 0;
  const home = TEAM_COLS[Math.floor(r(1) * TEAM_COLS.length)];
  const away = TEAM_COLS[(Math.floor(r(1) * TEAM_COLS.length) + 3) % TEAM_COLS.length];
  const seat = home;
  // pitch-frame helpers: (u along the pitch, v across), turned by R0 into the local frame
  const cu = Math.cos(R0);
  const su = Math.sin(R0);
  const U = (u: number, v: number): [number, number] => [u * cu + v * su, -u * su + v * cu];
  const A = (shape: DShape, mat: DMat, u: number, y: number, v: number, sx: number, sy: number, sz: number, col: string | THREE.Color, rot = 0, rx = 0, rz = 0) => {
    const [x, z] = U(u, v);
    add(shape, mat, x, y, z, sx, sy, sz, col, rot + R0, rx, rz);
  };

  // ── pitch: run-offs, mowing stripes, markings
  A('box', 'stone', 0, 0, 0, L + 12, 0.1, Wp + 12, '#4a7a3a');
  const stripes = 18;
  for (let k = 0; k < stripes; k++) A('box', 'pitch', -L / 2 - 3 + (k + 0.5) * ((L + 6) / stripes), 0.06, 0, (L + 6) / stripes, 0.1, Wp + 6, k % 2 ? '#3f8a34' : '#4c9a3c');
  const line = '#f4f6f2';
  const lw = 0.12;
  const L2 = L / 2;
  const W2 = Wp / 2;
  A('box', 'plaster', 0, 0.12, W2, L, 0.03, lw, line);
  A('box', 'plaster', 0, 0.12, -W2, L, 0.03, lw, line);
  for (const s of [-1, 1]) A('box', 'plaster', s * L2, 0.12, 0, lw, 0.03, Wp, line);
  A('box', 'plaster', 0, 0.12, 0, lw, 0.03, Wp, line);
  A('ring', 'plaster', 0, 0.13, 0, 18.3, 1, 18.3, line);
  A('cyl', 'plaster', 0, 0.12, 0, 0.3, 0.03, 0.3, line);
  for (const s of [-1, 1]) {
    // penalty area 40.3 x 16.5, goal area 18.3 x 5.5, spot at 11, the D
    A('box', 'plaster', s * (L2 - 16.5), 0.12, 0, lw, 0.03, 40.3, line);
    for (const t of [-1, 1]) A('box', 'plaster', s * (L2 - 8.25), 0.12, t * 20.15, 16.5, 0.03, lw, line);
    A('box', 'plaster', s * (L2 - 5.5), 0.12, 0, lw, 0.03, 18.3, line);
    for (const t of [-1, 1]) A('box', 'plaster', s * (L2 - 2.75), 0.12, t * 9.15, 5.5, 0.03, lw, line);
    A('cyl', 'plaster', s * (L2 - 11), 0.12, 0, 0.3, 0.03, 0.3, line);
    A('dArc', 'plaster', s * (L2 - 11), 0.13, 0, 18.3, 1, 18.3, line, s > 0 ? Math.PI : 0);
    // goal: posts, crossbar, a net box behind, stanchions
    const gx = s * (L2 + 0.06);
    for (const t of [-1, 1]) A('box', 'plaster', gx, 0, t * 3.66, 0.12, 2.44, 0.12, '#ffffff');
    A('box', 'plaster', gx, 2.38, 0, 0.12, 0.12, 7.44, '#ffffff');
    A('box', 'net', gx + s * 1.1, 0, 0, 2.2, 2.44, 7.3, '#f2f2f2');
    for (const t of [-1, 1]) {
      // corner flags and arcs
      A('cyl', 'metal', s * L2, 0, t * W2, 0.05, 1.6, 0.05, '#e8e8e8');
      A('box', 'cloth', s * L2 + 0.2 * -s, 1.35, t * W2, 0.4, 0.28, 0.02, home);
    }
  }
  // players in two kits, a referee, and the ball
  const formation: [number, number][] = [[-49, 0], [-35, -20], [-36, -7], [-36, 7], [-35, 20], [-18, -14], [-20, 0], [-18, 14], [-6, -22], [-4, 0], [-6, 22]];
  formation.forEach(([u, v], k) => {
    for (const [side, kit] of [[1, home], [-1, away]] as const) {
      const pu = side * u + (r(30 + k + side) - 0.5) * 6;
      const pv = side * v + (r(40 + k + side) - 0.5) * 6;
      A('box', 'cloth', pu, 0.85, pv, 0.42, 0.65, 0.26, k === 0 ? '#2a2a2a' : kit);
      A('box', 'cloth', pu, 0.1, pv, 0.36, 0.75, 0.22, '#f4f4f0');
      A('sphere', 'plaster', pu, 1.7, pv, 0.24, 0.26, 0.24, ['#e8c4a0', '#b07850', '#7a4a2a'][Math.floor(r(50 + k + side) * 3)]);
    }
  });
  A('box', 'cloth', 6, 0.85, -4, 0.42, 0.65, 0.26, '#f2e400');
  A('sphere', 'plaster', 2, 0.11, 1.5, 0.22, 0.22, 0.22, '#ffffff');

  // ── pitchside: LED boards, dugouts, technical areas, tunnel, cameras
  const boardY = 0.06;
  const ring: [number, number, number, number][] = [
    [0, W2 + 5, L + 6, 0],
    [0, -W2 - 5, L + 6, 0],
    [L2 + 4.2, 0, Wp + 8, Math.PI / 2],
    [-L2 - 4.2, 0, Wp + 8, Math.PI / 2],
  ];
  const ads = ['#ff3a2a', '#2a8aff', '#ffd02a', '#2ae07a', '#ff2a9a', '#ffffff', '#8a2aff'];
  for (const [u, v, len, rot] of ring) {
    const segs = Math.round(len / 8);
    for (let k = 0; k < segs; k++) {
      const t = -len / 2 + (k + 0.5) * (len / segs);
      const [pu, pv] = rot ? [u, t] : [t, v];
      A('box', 'glow', pu, boardY, pv, rot ? 0.2 : len / segs - 0.15, 0.95, rot ? len / segs - 0.15 : 0.2, ads[(k + Math.floor(r(60) * 7)) % ads.length]);
    }
  }
  for (const s of [-1, 1]) {
    // dugouts with perspex roofs and team seats
    const du = s * 10;
    A('box', 'dark', du, 0, W2 + 3.2, 12, 0.3, 2.2, '#2a2e34');
    for (let k = 0; k < 10; k++) A('box', 'cloth', du - 5.4 + k * 1.2, 0.3, W2 + 3.8, 0.9, 0.6, 0.7, s > 0 ? home : away);
    A('box', 'glass', du, 2.1, W2 + 3.2, 12.2, 0.08, 2.4, '#a8c8d8', 0, -0.12);
    for (const e of [-6, 6]) A('box', 'glass', du + e, 0.3, W2 + 3.2, 0.06, 1.8, 2.2, '#a8c8d8');
    A('box', 'plaster', du, 0.13, W2 + 1.6, 10, 0.02, 0.08, line);
  }
  // players' tunnel, fourth official, TV gantry cameras
  A('box', 'dark', 0, 0, W2 + 6.6, 4.5, 3, 1.6, '#1e2228');
  A('box', 'cloth', 0, 3, W2 + 5.8, 5, 0.1, 2.4, home);
  for (const u of [-30, 0, 30]) A('box', 'metal', u, 0.3, -W2 - 6, 0.6, 1.3, 0.9, '#2a2a2a');

  // ── stands: lower and upper tiers on all four sides, corner fills, boxes between the tiers
  // depths chosen so the four stands, boxes and back walls fit inside the facade
  const sideFront = W2 + 6.5;
  const endFront = L2 + 6.5;
  const rowD = 0.75;
  const lowerRows = 16;
  const upperRows = 13;
  const rowH = 0.45;
  const upperRowH = 0.62;
  const upperY = lowerRows * rowH + 3.6;
  const stands: { off: number; len: number; rot: number; main: boolean }[] = [
    { off: sideFront, len: L + 10, rot: Math.PI, main: true },
    { off: sideFront, len: L + 10, rot: 0, main: false },
    { off: endFront, len: Wp + 14, rot: Math.PI / 2, main: false },
    { off: endFront, len: Wp + 14, rot: -Math.PI / 2, main: false },
  ];
  for (const st of stands) {
    // the stand at offset `off` from the centre on the side the rotation points away from
    const ox = Math.sin(st.rot) * -st.off;
    const oz = Math.cos(st.rot) * -st.off;
    const sx = (u: number, back: number) => ox + u * Math.cos(st.rot) - back * Math.sin(st.rot);
    const sz = (u: number, back: number) => oz - u * Math.sin(st.rot) - back * Math.cos(st.rot);
    const toLocal = (px: number, pz: number) => U(px, pz);
    const add2 = (shape: DShape, mat: DMat, x: number, y: number, z: number, a: number, bb: number, c: number, col: string | THREE.Color, rot = 0, rx = 0, rz = 0) => {
      const [lx, lz] = toLocal(x, z);
      add(shape, mat, lx, y, lz, a, bb, c, col, rot + R0, rx, rz);
    };
    stand(add2, ox, oz, st.len, lowerRows, rowD, rowH, 1.2, st.rot, seat);
    // executive boxes: a glazed band between the tiers with lit interiors
    const backLow = lowerRows * rowD;
    add2('box', 'plaster', sx(0, backLow + 1.5), lowerRows * rowH + 1.2, sz(0, backLow + 1.5), st.len, 0.4, 4, '#d8dce2', st.rot);
    add2('box', 'glass', sx(0, backLow + 0.2), lowerRows * rowH + 1.6, sz(0, backLow + 0.2), st.len - 1, 2.2, 0.12, '#88a8c0', st.rot);
    for (let k = 0; k < Math.floor(st.len / 5); k++) add2('box', 'glow', sx(-st.len / 2 + 2.5 + k * 5, backLow + 1), lowerRows * rowH + 3.4, sz(-st.len / 2 + 2.5 + k * 5, backLow + 1), 3, 0.08, 1.4, '#ffe8c8', st.rot);
    // upper tier set back over the boxes, its front fascia an LED ribbon in club colours
    const upperBack = backLow + 3;
    stand((sh, m, x, y, z, a, bb, c, col, rot = 0, rx = 0, rz = 0) => add2(sh, m, x, y, z, a, bb, c, col, rot, rx, rz), sx(0, upperBack), sz(0, upperBack), st.len, upperRows, rowD, upperRowH, upperY, st.rot, seat);
    add2('box', 'glow', sx(0, upperBack - 0.3), upperY - 0.6, sz(0, upperBack - 0.3), st.len, 0.6, 0.12, st.main ? '#ffffff' : home, st.rot);
    // the back of the stand: a solid wall up to roof height
    const backAll = upperBack + upperRows * rowD;
    const top = upperY + upperRows * upperRowH;
    add2('box', 'plaster', sx(0, backAll + 0.6), 0, sz(0, backAll + 0.6), st.len + 2, top + 1.5, 1.2, '#c8ccd2', st.rot);
    // vomitories (tunnels into the lower tier)
    for (let k = 1; k < 5; k++) {
      const u = -st.len / 2 + (k * st.len) / 5;
      add2('box', 'dark', sx(u, 7), 1.2 + 7 * 0.6 * rowH / rowD, sz(u, 7), 2.4, 2.4, 2.2, '#16181c', st.rot);
    }
    // roof: a cantilevered slab with trusses and a translucent leading edge, floodlights along it
    // the roof floats well above the last row, carried on columns at the back
    const roofY = top + 7;
    const roofDepth = backAll + 6;
    add2('box', 'metal', sx(0, backAll - roofDepth / 2 + 1), roofY, sz(0, backAll - roofDepth / 2 + 1), st.len + 4, 0.6, roofDepth, '#dfe3e8', st.rot);
    add2('box', 'skylight', sx(0, backAll - roofDepth - 2), roofY + 0.1, sz(0, backAll - roofDepth - 2), st.len + 4, 0.25, 6, '#d8f0ff', st.rot);
    for (let k = 0; k <= Math.floor(st.len / 12); k++) {
      const u = -st.len / 2 + k * 12;
      add2('box', 'metal', sx(u, backAll - roofDepth / 2), roofY + 0.6, sz(u, backAll - roofDepth / 2), 0.5, 2.2, roofDepth + 4, '#b8bcc4', st.rot);
      add2('box', 'metal', sx(u, backAll + 0.6), 0, sz(u, backAll + 0.6), 0.9, roofY + 2.8, 0.9, '#b8bcc4', st.rot);
    }
    add2('box', 'glow', sx(0, backAll - roofDepth - 4.6), roofY - 0.2, sz(0, backAll - roofDepth - 4.6), st.len, 0.5, 0.6, '#f4faff', st.rot);
    // signage on the main stand roof fascia
    if (st.main) add2('box', 'glow', sx(0, backAll - roofDepth - 5), roofY + 0.5, sz(0, backAll - roofDepth - 5), 40, 2, 0.2, home, st.rot);
  }
  // corner fills with giant screens above
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const cu2 = s * (L2 + 18);
    const cv2 = t * (W2 + 18);
    const rot = Math.atan2(s, t);
    for (let k = 0; k < 18; k++) A('box', 'crowd', cu2 - s * (10 - k * 0.6) * 0.7, 1.2, cv2 - t * (10 - k * 0.6) * 0.7, 12, (k + 1) * rowH * 1.1, 0.9, seat, rot);
    A('box', 'plaster', cu2 + s * 4, 0, cv2 + t * 4, 16, 30, 6, '#c8ccd2', rot);
    A('box', 'dark', cu2 - s * 2, 24, cv2 - t * 2, 14, 7.5, 0.6, '#101216', rot);
    A('box', 'glow', cu2 - s * 2.35, 24.4, cv2 - t * 2.35, 13.2, 6.7, 0.1, '#1a4a9a', rot);
    A('box', 'glow', cu2 - s * 2.4, 26.9, cv2 - t * 2.4, 5, 1.6, 0.1, home, rot);
    A('box', 'glow', cu2 - s * 2.4, 25, cv2 - t * 2.4, 9, 1.2, 0.1, '#ffffff', rot);
  }

  // ── facade: finned cladding with a lit band, stair towers, entrances, a fan plaza
  const fh = upperY + upperRows * upperRowH + 8;
  for (const [u, v, len, rot] of [[0, OD - 0.5, OW * 2 - 8, 0], [0, -OD + 0.5, OW * 2 - 8, 0], [OW - 0.5, 0, OD * 2 - 8, Math.PI / 2], [-OW + 0.5, 0, OD * 2 - 8, Math.PI / 2]] as const) {
    A('box', 'glass', u, 0, v, rot ? 1 : len, 5, rot ? len : 1, '#6f8ea6');
    const fins = Math.floor(len / 3);
    for (let k = 0; k < fins; k++) {
      const t = -len / 2 + (k + 0.5) * (len / fins);
      const [pu, pv] = rot ? [u + Math.sign(u) * 0.8, t] : [t, v + Math.sign(v) * 0.8];
      A('box', 'metal', pu, 5, pv, rot ? 1.2 : 0.35, fh - 5, rot ? 0.35 : 1.2, k % 2 ? '#e6e9ee' : '#d4d8de');
    }
    A('box', 'glow', u + (rot ? Math.sign(u) * 1.4 : 0), fh - 3, v + (rot ? 0 : Math.sign(v) * 1.4), rot ? 0.2 : len, 0.8, rot ? len : 0.2, home);
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    A('cyl', 'plaster', s * (OW - 4), 0, t * (OD - 4), 8, fh + 2, 8, '#d4d8de');
    A('cyl', 'glass', s * (OW - 4), 2, t * (OD - 4), 8.3, fh - 4, 8.3, '#88a8c0');
  }
  // main entrance on the +z side: canopy, turnstiles, club crest
  A('box', 'plaster', 0, 6, OD + 1, 34, 0.6, 6, '#eef0f2');
  for (let k = 0; k < 12; k++) A('box', 'metal', -11 + k * 2, 0, OD + 2.5, 0.25, 1.1, 1.2, '#8a8f96');
  A('cyl', 'glow', 0, fh - 10, OD + 0.2, 7, 7, 0.3, home, 0, Math.PI / 2);
  A('cyl', 'glow', 0, fh - 9.4, OD + 0.3, 5, 5, 0.3, '#ffffff', 0, Math.PI / 2);
  // fan zone just outside the doors: flags, food stalls
  for (let k = 0; k < 6; k++) {
    const u = -15 + k * 6;
    A('cyl', 'metal', u, 0, OD + 4.2, 0.12, 9, 0.12, '#c8ccd2');
    A('box', 'cloth', u + 0.9, 7, OD + 4.2, 1.8, 1.2, 0.05, k % 2 ? home : '#ffffff');
  }
  out.lights.push([0, 0]);
  void warm;
}

// ───────────────────────── NBA arena ─────────────────────────

export function nbaArena(add: Add, b: Building) {
  const r = hashRand(b.tone * 1000 + 19);
  const R0 = 0;
  const cu = Math.cos(R0);
  const su = Math.sin(R0);
  const U = (u: number, v: number): [number, number] => [u * cu + v * su, -u * su + v * cu];
  const A = (shape: DShape, mat: DMat, u: number, y: number, v: number, sx: number, sy: number, sz: number, col: string | THREE.Color, rot = 0, rx = 0, rz = 0) => {
    const [x, z] = U(u, v);
    add(shape, mat, x, y, z, sx, sy, sz, col, rot + R0, rx, rz);
  };
  const EW = Math.max(b.w, b.d) / 2 - 2;
  const ED = Math.min(b.w, b.d) / 2 - 2;
  const team = TEAM_COLS[Math.floor(r(1) * TEAM_COLS.length)];
  const team2 = TEAM_COLS[(Math.floor(r(1) * TEAM_COLS.length) + 4) % TEAM_COLS.length];
  const CL = 28.65;
  const CW = 15.24;
  const H = b.h;
  const line = '#ffffff';
  const lw = 0.08;

  // ── court: maple boards, the apron in team colour, every NBA line
  A('box', 'stone', 0, 0, 0, CL + 14, 0.12, CW + 12, '#2a2e34');
  A('box', 'court', 0, 0.06, 0, CL + 4, 0.12, CW + 4, team);
  A('box', 'court', 0, 0.08, 0, CL, 0.12, CW, '#d8a868');
  A('box', 'plaster', 0, 0.21, CW / 2, CL, 0.02, lw, line);
  A('box', 'plaster', 0, 0.21, -CW / 2, CL, 0.02, lw, line);
  for (const s of [-1, 1]) A('box', 'plaster', s * CL / 2, 0.21, 0, lw, 0.02, CW, line);
  A('box', 'plaster', 0, 0.21, 0, lw, 0.02, CW, line);
  A('ring', 'plaster', 0, 0.22, 0, 3.66, 1, 3.66, line);
  A('cyl', 'court', 0, 0.2, 0, 3.5, 0.03, 3.5, team);
  for (const s of [-1, 1]) {
    const hoop = s * (CL / 2 - 1.6);
    // painted key 4.88 wide, 5.79 deep, free-throw circle, restricted arc, three-point line
    A('box', 'court', s * (CL / 2 - 2.895), 0.2, 0, 5.79, 0.03, 4.88, team);
    for (const t of [-1, 1]) A('box', 'plaster', s * (CL / 2 - 2.895), 0.21, t * 2.44, 5.79, 0.02, lw, line);
    A('box', 'plaster', s * (CL / 2 - 5.79), 0.21, 0, lw, 0.02, 4.88, line);
    A('ring', 'plaster', s * (CL / 2 - 5.79), 0.22, 0, 3.66, 1, 3.66, line);
    A('dArc', 'plaster', hoop, 0.22, 0, 2.44, 1, 2.44, line, s > 0 ? Math.PI : 0);
    A('threeArc', 'plaster', hoop, 0.22, 0, 14.48, 1, 14.48, line, s > 0 ? Math.PI : 0);
    for (const t of [-1, 1]) A('box', 'plaster', s * (CL / 2 - 1.5), 0.21, t * 6.71, 3, 0.02, lw, line);
    // the basket: padded stanchion, arm, glass backboard with a red frame, rim, net, shot clock
    const bx = s * (CL / 2 + 1.8);
    A('box', 'cloth', bx, 0, 0, 1.6, 1.4, 1.4, '#16181c');
    A('box', 'metal', bx - s * 0.2, 1.4, 0, 0.35, 2.2, 0.35, '#3a3e44', 0, 0, s * 0.25);
    A('box', 'metal', s * (CL / 2 + 0.5), 3.3, 0, 1.8, 0.25, 0.25, '#3a3e44');
    A('box', 'glass', s * (CL / 2 - 1.22), 2.9, 0, 0.04, 1.07, 1.83, '#d8eef8');
    A('box', 'plaster', s * (CL / 2 - 1.24), 3.0, 0, 0.03, 0.45, 0.59, '#ff3a2a');
    A('ring', 'metal', hoop, 3.05, 0, 0.46, 1, 0.46, '#ff6a1a');
    A('cone', 'net', hoop, 3.05, 0, 0.44, 0.45, 0.44, '#f4f4f4', 0, Math.PI);
    A('box', 'glow', s * (CL / 2 - 1.2), 4.15, 0, 0.12, 0.35, 0.8, '#ff3a2a');
  }
  // scorer's table, benches, courtside seats
  A('box', 'dark', 0, 0, -CW / 2 - 2.2, 12, 0.9, 0.9, '#1a1c20');
  A('box', 'glow', 0, 0.1, -CW / 2 - 1.74, 11.8, 0.6, 0.04, team);
  for (const s of [-1, 1]) for (let k = 0; k < 12; k++) A('box', 'cloth', s * (3 + k * 0.62), 0, -CW / 2 - 3.6, 0.5, 0.9, 0.5, s > 0 ? team : team2);
  for (const t of [-1, 1]) for (let row = 0; row < 2; row++) for (let k = 0; k < 40; k++) {
    if (t < 0 && Math.abs(-CL / 2 + k * 0.72) < 11) continue;
    A('box', 'crowd', -14 + k * 0.72, 0.12, t * (CW / 2 + 1.6 + row * 0.9), 0.6, 0.9, 0.7, '#202228');
  }
  // players warming up / mid-play, referees
  for (let k = 0; k < 10; k++) {
    const u = (r(20 + k) - 0.5) * CL * 0.85;
    const v = (r(30 + k) - 0.5) * CW * 0.8;
    const kit = k < 5 ? team : '#f4f4f4';
    A('box', 'cloth', u, 0.95, v, 0.5, 0.75, 0.3, kit);
    A('box', 'cloth', u, 0.2, v, 0.42, 0.8, 0.26, k < 5 ? team : '#e8e8e8');
    A('sphere', 'plaster', u, 1.95, v, 0.26, 0.28, 0.26, ['#7a4a2a', '#b07850', '#e8c4a0'][Math.floor(r(40 + k) * 3)]);
  }
  A('sphere', 'plaster', 2, 2.4, 1, 0.24, 0.24, 0.24, '#e86a1a');

  // ── the bowl: three tiers around the court, ribbon boards, suites
  // lower bowl, club level and upper deck; each tier set back and raised over the one below
  const tiers: { rows: number; front: number; y: number; rowH: number }[] = [];
  {
    let front = 3.5;
    let y = 0.4;
    for (const [rows, rowH, gap, lift] of [[14, 0.36, 2, 3], [8, 0.5, 2.5, 3.2], [10, 0.56, 0, 0]] as const) {
      tiers.push({ rows, front, y, rowH });
      front += rows * 0.8 + gap;
      y += rows * rowH + lift;
    }
  }
  for (const [ti, tr] of tiers.entries()) {
    for (const [len, off, rot] of [[CL + 2 * tr.front, CW / 2 + tr.front, Math.PI], [CL + 2 * tr.front, CW / 2 + tr.front, 0], [CW + 2 * tr.front, CL / 2 + tr.front, Math.PI / 2], [CW + 2 * tr.front, CL / 2 + tr.front, -Math.PI / 2]] as const) {
      const ox = Math.sin(rot) * -off;
      const oz = Math.cos(rot) * -off;
      stand((sh, m, x, y, z, a, bb, c, col, rr = 0, rx = 0, rz = 0) => A(sh, m, x, y, z, a, bb, c, col, rr, rx, rz), ox, oz, len, tr.rows, 0.8, tr.rowH, tr.y, rot, ti === 1 ? team : '#2a2e3a', 7);
      // ribbon board along the front of the upper tiers
      if (ti > 0) {
        const fx = ox + Math.sin(rot) * 0.4;
        const fz = oz + Math.cos(rot) * 0.4;
        A('box', 'glow', fx, tr.y - 1.1, fz, rot === 0 || rot === Math.PI ? len : 0.15, 0.9, rot === 0 || rot === Math.PI ? 0.15 : len, ti === 1 ? '#ffffff' : team, 0);
      }
    }
    // corner sections, angled
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const d = tr.front + tr.rows * 0.4;
      for (let k = 0; k < tr.rows; k++) A('box', 'crowd', s * (CL / 2 + d * 0.7 + k * 0.4), tr.y, t * (CW / 2 + d * 0.7 + k * 0.4), 8 + k * 0.6, (k + 1) * tr.rowH, 0.9, ti === 1 ? team : '#2a2e3a', Math.atan2(s, t) + Math.PI / 2);
    }
  }
  // suites: a glazed, lit band between the second and third tier
  const suiteY = tiers[2].y - 3.2;
  for (const [len, off, rot] of [[CL + 2 * (tiers[2].front - 1), CW / 2 + tiers[2].front - 1, 0], [CL + 2 * (tiers[2].front - 1), -(CW / 2 + tiers[2].front - 1), 0], [CW + 2 * (tiers[2].front - 1), CL / 2 + tiers[2].front - 1, Math.PI / 2], [CW + 2 * (tiers[2].front - 1), -(CL / 2 + tiers[2].front - 1), Math.PI / 2]] as const) {
    const [u, v] = rot ? [off, 0] : [0, off];
    A('box', 'glass', u, suiteY, v, rot ? 0.12 : len, 2.6, rot ? len : 0.12, '#88a8c0');
    A('box', 'glow', u, suiteY + 2.5, v, rot ? 0.5 : len, 0.08, rot ? len : 0.5, '#ffe8c8');
  }
  // centre-hung scoreboard: four big screens, LED rings, a lower ring of small screens
  const sy = H - 13;
  A('box', 'dark', 0, sy, 0, 9, 6, 7, '#0c0e12');
  for (const [u, v, w, d] of [[0, 3.55, 8.6, 0.1], [0, -3.55, 8.6, 0.1], [4.55, 0, 0.1, 6.6], [-4.55, 0, 0.1, 6.6]] as const) {
    A('box', 'glow', u, sy + 0.4, v, w, 5.2, d, '#1a3a7a');
    A('box', 'glow', u * 1.002, sy + 3.4, v * 1.002, w * 0.4 || 0.1, 1, d * 0.4 || 0.1, team);
    A('box', 'glow', u * 1.003, sy + 1.6, v * 1.003, w ? w * 0.7 : 0.1, 1.2, d ? d * 0.7 : 0.1, '#ffffff');
  }
  A('cyl', 'glow', 0, sy - 0.4, 0, 11, 0.4, 9, team);
  A('cyl', 'glow', 0, sy + 6, 0, 10, 0.4, 8, '#ffffff');
  A('box', 'dark', 0, sy - 2.4, 0, 6, 2, 4.4, '#0c0e12');
  for (const [u, v, w, d] of [[0, 2.25, 5.8, 0.08], [0, -2.25, 5.8, 0.08], [3.05, 0, 0.08, 4.2], [-3.05, 0, 0.08, 4.2]] as const) A('box', 'glow', u, sy - 2.2, v, w, 1.6, d, '#2a6ad8');
  for (const s of [-1, 1]) for (const t of [-1, 1]) A('cyl', 'metal', s * 3.5, sy + 6, t * 2.6, 0.08, H - sy - 6, 0.08, '#8a8f96');

  // ── the building: a glazed elliptical drum, metal fins, a roof with a glass skylight
  const segs = 40;
  const shellH = H - 4;
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const x0 = Math.cos(a0) * EW;
    const z0 = Math.sin(a0) * ED;
    const x1 = Math.cos(a1) * EW;
    const z1 = Math.sin(a1) * ED;
    const len = Math.hypot(x1 - x0, z1 - z0);
    // box x along the segment: a turn of theta about y sends x to (cos theta, -sin theta)
    const ang = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    // the main entrance (on +v) is all glass, the rest is glass below and metal panels above
    const front = Math.sin((a0 + a1) / 2) > 0.85;
    A('box', 'glass', mx, 0, mz, len + 0.1, front ? shellH : 8, 0.4, '#7aa0b8', ang);
    if (!front) {
      A('box', 'metal', mx, 8, mz, len + 0.1, shellH - 8, 0.5, k % 2 ? '#d6dbe2' : '#c6ccd4', ang);
      A('box', 'glow', mx * 1.004, 13 + (k % 4) * 0.01, mz * 1.004, len + 0.1, 0.6, 0.2, team, ang);
    }
    A('box', 'metal', x0 * 1.01, 0, z0 * 1.01, 0.5, shellH + 1.4, 0.9, '#e8ebef', ang);
  }
  // the ceiling seen from the bowl (an elliptical slab), the roof outside with a lit rim and a
  // raised lantern of glass louvres over the court
  const cy = H - 4.5;
  A('cyl', 'metal', 0, cy, 0, EW * 2 - 0.6, 0.6, ED * 2 - 0.6, '#30343c');
  for (let k = 0; k < 9; k++) A('box', 'metal', -CL / 2 - 10 + k * ((CL + 20) / 8), cy - 1.6, 0, 0.6, 1.6, ED * 1.6, '#4a4e56');
  A('cyl', 'metal', 0, shellH, 0, EW * 2 + 1.2, 1.2, ED * 2 + 1.2, '#eceff3');
  A('cyl', 'glow', 0, shellH + 1.2, 0, EW * 2 + 1.4, 0.3, ED * 2 + 1.4, team);
  A('cyl', 'metal', 0, shellH + 1.2, 0, EW * 1.5, 2, ED * 1.5, '#e2e6eb');
  A('cyl', 'glass', 0, shellH + 3.2, 0, CL + 14, 3, CW + 14, '#9ec4d8');
  A('cyl', 'metal', 0, shellH + 6.2, 0, CL + 15, 0.5, CW + 15, '#eceff3');
  A('cyl', 'glow', 0, shellH + 3.4, 0, CL + 14.3, 0.25, CW + 14.3, '#ffffff');
  // catwalk and lighting rigs under the ceiling
  for (const s of [-1, 1]) {
    A('box', 'metal', 0, cy - 1.2, s * (CW / 2 + 6), CL + 16, 0.3, 1.2, '#5a5e66');
    for (let k = 0; k < 10; k++) A('box', 'glow', -CL / 2 - 6 + k * ((CL + 12) / 9), cy - 1.6, s * (CW / 2 + 6), 0.7, 0.4, 0.7, '#fff6e0');
  }
  // entrance plaza: canopy, team name sign, statue plinth, banners
  A('box', 'plaster', 0, 7, ED + 4, 30, 0.5, 8, '#f2f4f6');
  for (const s of [-1, 1]) A('cyl', 'metal', s * 13, 0, ED + 7.5, 0.6, 7, 0.6, '#d8dce2');
  A('box', 'glow', 0, 8.2, ED + 7.9, 22, 2.4, 0.3, '#ffffff');
  A('box', 'glow', 0, 8.6, ED + 8.1, 14, 1.4, 0.2, team);
  A('box', 'stone', 0, 0, ED + 16, 3, 2, 3, '#8a8f96');
  A('box', 'gold', 0, 2, ED + 16, 0.9, 2.6, 0.7, '#d8b25a');
  A('sphere', 'gold', 0, 4.9, ED + 16, 0.9, 0.9, 0.9, '#d8b25a');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const px = Math.cos(a) * (EW + 2);
    const pz = Math.sin(a) * (ED + 2);
    A('cyl', 'metal', px, 0, pz, 0.2, 14, 0.2, '#c8ccd2');
    A('box', 'cloth', px, 7, pz, 0.1, 6, 2, k % 2 ? team : team2, a);
  }
}
