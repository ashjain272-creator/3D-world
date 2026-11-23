import { Rng, clamp } from '../sim/rng';
import type { ArchitectureStyle, Landmark, Settlement } from '../sim/types';

export type BuildingKind =
  | 'tower' | 'block' | 'slab' | 'dome' | 'treehouse' | 'pod' | 'house' | 'hall' | 'windmill' | 'silo'
  // futuristic districts
  | 'supertall' | 'villa' | 'shop' | 'mall' | 'mosque' | 'temple' | 'church' | 'park' | 'stadium' | 'arena' | 'oldhouse' | 'mosqueSmall';

/** Districts of a futuristic city (see `futuristic`). */
export type District = 'downtown' | 'mixed' | 'souk' | 'villas' | 'marina';

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  kind: BuildingKind;
  role: 'home' | 'work' | 'civic';
  tone: number; // 0..1 colour variation
  door: [number, number];
  /** District the building stands in (futuristic cities only). */
  district?: District;
  /** Garden plot around a villa (centre and size), which may span two street blocks. */
  plot?: { x: number; z: number; w: number; d: number; rot?: number };
}

export interface PlacedLandmark {
  id: string;
  name: string;
  kind: Landmark['kind'] | 'monolith' | 'overlook' | 'grove';
  description: string;
  x: number;
  z: number;
  radius: number;
}

export interface Collider {
  type: 'box' | 'circle';
  x: number;
  z: number;
  hw: number; // half width or radius
  hd: number;
  /** Optional top height: anything standing above it (e.g. on a highway deck) is not blocked. */
  top?: number;
}

export interface StreetGraph {
  nodes: [number, number][];
  edges: [number, number][];
  adj: number[][];
}

export interface Layout {
  style: ArchitectureStyle | 'wild' | 'cloud';
  radius: number;
  buildings: Building[];
  landmarks: PlacedLandmark[];
  streets: { a: [number, number]; b: [number, number]; w: number }[];
  plazas: { x: number; z: number; r: number }[];
  lights: [number, number][];
  colliders: Collider[];
  graph: StreetGraph;
  spawn: { x: number; z: number; yaw: number };
  homes: number[];
  works: number[];
  parks: [number, number][];
  /** Coastal-corridor structure of futuristic cities (bands, water, nodes); see `futuristic`. */
  features?: CityFeatures;
}

export interface CityFeatures {
  shoreZ: number;
  coastRoadZ: number;
  spineZ: number;
  arterialZ: number;
  /** Creek, canals and the marina canal as polylines of a given width. */
  waters: { kind: 'creek' | 'canal' | 'marina'; pts: [number, number][]; w: number }[];
  /** Elliptical lakes (Downtown, the lake towers), optionally with an island. */
  lakes: { x: number; z: number; rx: number; rz: number; island?: number }[];
  downtown: { x: number; z: number; a: number; b: number; x0: number; x1: number; z0: number; z1: number } | null;
  metro: { z: number; x0: number; x1: number; stations: number[] };
  estates: { x: number; z: number; w: number; d: number; gate: [number, number]; core: { x: number; z: number; rx: number; rz: number } | null; bulbs: [number, number][] }[];
  jbr: { x0: number; x1: number; z0: number; z1: number } | null;
  jlt: { x: number; z: number; s: number }[];
  compounds: { x: number; z: number; w: number; d: number }[];
  /** Centres of roundabouts at collector crossings. */
  roundabouts: [number, number][];
  /** The capital's airport, inland behind the city. */
  airport?: AirportPlan;
}

/**
 * The shape of a mall in its entrance frame (local +z towards the door): its width across the
 * front, its depth, and the hollow entrance rotunda (diameter and centre). Shared by the builder
 * and the colliders so you can walk in through the rotunda's doorway.
 */
export function mallGeometry(b: Pick<Building, 'x' | 'z' | 'w' | 'd' | 'door'>) {
  const alongX = Math.abs(b.door[0] - b.x) > Math.abs(b.door[1] - b.z);
  const W = alongX ? b.d : b.w;
  const D = alongX ? b.w : b.d;
  const big = W >= 60;
  const rd = big ? Math.min(30, W * 0.22) : Math.min(14, W * 0.55);
  const rz = D / 2 - rd * 0.15;
  const anchorW = big ? Math.min(26, W * 0.2) : 0;
  const coreW = W - anchorW * 2;
  // the concourse under the glass vault, and the passage from the rotunda into it
  const vd = Math.min(14, D * 0.32);
  const rBack = rz - rd / 2;
  const pass = 2.4;
  const ry = Math.atan2(b.door[0] - b.x, b.door[1] - b.z);
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const toWorld = (lx: number, lz: number): [number, number] => [b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos];
  return { W, D, big, rd, rz, alongX, toWorld, anchorW, coreW, vd, rBack, pass };
}

function mallColliders(b: Building): Collider[] {
  const g = mallGeometry(b);
  const out: Collider[] = [];
  const box = (lx: number, lz: number, w: number, d: number) => {
    const [x, z] = g.toWorld(lx, lz);
    out.push({ type: 'box', x, z, hw: (g.alongX ? d : w) / 2, hd: (g.alongX ? w : d) / 2 });
  };
  const { W, D, rd, rz, vd, rBack, pass, coreW } = g;
  // the block behind the concourse, the anchors at its ends, the wings either side of the rotunda,
  // and the short walls either side of the passage from the rotunda into the concourse
  box(0, (-D / 2 - vd / 2) / 2, W, D / 2 - vd / 2);
  if (g.anchorW > 0) for (const s of [-1, 1]) box(s * (coreW / 2 + g.anchorW / 2), (D / 2 - vd / 2) / 2, g.anchorW, D / 2 + vd / 2);
  else for (const s of [-1, 1]) box(s * (coreW / 2 + 0.3), 0, 0.6, vd);
  for (const s of [-1, 1]) box(s * (rd / 2 + (coreW / 2 - rd / 2) / 2), (vd / 2 + D / 2) / 2, coreW / 2 - rd / 2, D / 2 - vd / 2);
  if (rBack > vd / 2 + 0.2) for (const s of [-1, 1]) box(s * (pass + (rd / 2 - pass) / 2), (vd / 2 + rBack) / 2, rd / 2 - pass, rBack - vd / 2);
  // the rotunda's glass wall as a ring of posts, open at the doorway and at the passage
  const n = Math.ceil((Math.PI * rd) / 1.1);
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const lx = (Math.sin(t) * rd) / 2;
    const lz = rz + (Math.cos(t) * rd) / 2;
    if (Math.abs(lx) < pass) continue;
    // posts inside the concourse or the wings are covered by those
    if (lz < vd / 2) continue;
    const [x, z] = g.toWorld(lx, lz);
    out.push({ type: 'circle', x, z, hw: 0.45, hd: 0 });
  }
  return out;
}

export interface ARect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export type AircraftKind = 'narrow' | 'wide' | 'quad';
/**
 * The international airport of a futuristic capital, inland behind the city: the landside
 * forecourt and car parks, the terminal, a long airside concourse with its gates, the apron, a
 * parallel taxiway and the runway, with the tower, hangars, cargo, fire station and fuel farm.
 * Every distance is in metres from the city centre; the runway runs along x.
 */
export interface AirportPlan {
  /** x of the access road and the middle of the terminal. */
  xa: number;
  rect: ARect;
  curbZ: number;
  term: ARect;
  conc: ARect;
  apronZ1: number;
  taxiZ: number;
  runZ: number;
  runX0: number;
  runX1: number;
  runW: number;
  tower: { x: number; z: number };
  hangars: ARect[];
  cargo: ARect;
  fire: ARect;
  fuel: ARect;
  parks: ARect[];
  gates: { x: number; kind: AircraftKind }[];
  /** +1 when the hangars are east of the concourse, -1 when west. */
  side: number;
}

export const AIRCRAFT: Record<AircraftKind, { len: number; span: number; d: number; belly: number; fin: number }> = {
  narrow: { len: 38, span: 35, d: 3.95, belly: 1.5, fin: 7.4 },
  wide: { len: 63, span: 61, d: 6.2, belly: 2.6, fin: 11 },
  quad: { len: 68, span: 66, d: 6.5, belly: 2.8, fin: 12 },
};

/** The flattened rectangle the airport needs (futuristic capitals only). */
export function airportRect(s: Settlement): ARect | undefined {
  if (s.style !== 'futuristic' || s.kind !== 'capital') return undefined;
  const R = settlementRadius(s);
  return { x0: -770, x1: 770, z0: R - 10, z1: R + 345 };
}

export function airportPlan(R: number, xa: number): AirportPlan {
  const side = xa <= 0 ? 1 : -1;
  const conc = { x0: xa - 250, x1: xa + 250, z0: R + 128, z1: R + 148 };
  const gates: AirportPlan['gates'] = [];
  const pattern: AircraftKind[] = ['wide', 'narrow', 'narrow', 'quad', 'narrow', 'wide', 'narrow', 'narrow', 'wide', 'narrow'];
  let x = conc.x0 + 10;
  for (const kind of pattern) {
    const sp = AIRCRAFT[kind].span;
    if (x + sp > conc.x1 - 10) break;
    gates.push({ x: x + sp / 2, kind });
    x += sp + 9;
  }
  const hx = side > 0 ? conc.x1 + 30 : conc.x0 - 30 - 150;
  const hangars = [
    { x0: hx, x1: hx + 70, z0: R + 150, z1: R + 212 },
    { x0: hx + 80, x1: hx + 150, z0: R + 150, z1: R + 212 },
  ];
  const cx = side > 0 ? conc.x0 - 30 - 110 : conc.x1 + 30;
  const cargo = { x0: cx, x1: cx + 110, z0: R + 128, z1: R + 158 };
  const fx = side > 0 ? cargo.x0 - 70 : cargo.x1 + 25;
  return {
    xa,
    rect: { x0: -770, x1: 770, z0: R - 10, z1: R + 345 },
    curbZ: R + 48,
    term: { x0: xa - 120, x1: xa + 120, z0: R + 62, z1: R + 108 },
    conc,
    apronZ1: R + 228,
    taxiZ: R + 246,
    runZ: R + 292,
    runX0: -650,
    runX1: 650,
    runW: 45,
    tower: { x: xa + side * 165, z: R + 118 },
    hangars,
    cargo,
    fire: { x0: fx, x1: fx + 45, z0: R + 180, z1: R + 222 },
    fuel: { x0: xa + side * 230 - 30, x1: xa + side * 230 + 30, z0: R + 14, z1: R + 44 },
    parks: [
      { x0: xa - 205, x1: xa - 40, z0: R + 8, z1: R + 38 },
      { x0: xa + 40, x1: xa + 205, z0: R + 8, z1: R + 38 },
    ].filter((p) => !(p.x0 < xa + side * 230 + 32 && p.x1 > xa + side * 230 - 32)),
    gates,
    side,
  };
}

/** Walls of the airport's buildings and its parked aircraft, for the walker. */
export function airportColliders(a: AirportPlan, R: number): Collider[] {
  const out: Collider[] = [];
  const box = (r: ARect) => out.push({ type: 'box', x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, hw: (r.x1 - r.x0) / 2, hd: (r.z1 - r.z0) / 2 });
  box(a.term);
  box(a.conc);
  box(a.cargo);
  box(a.fire);
  for (const p of a.parks) box({ x0: p.x0 + 4, x1: p.x1 - 4, z0: p.z0 + 2, z1: p.z1 - 2 });
  // hangars: back and side walls; the doors facing the apron stand open
  for (const h of a.hangars) {
    box({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z0 + 1 });
    box({ x0: h.x0, x1: h.x0 + 1, z0: h.z0, z1: h.z1 });
    box({ x0: h.x1 - 1, x1: h.x1, z0: h.z0, z1: h.z1 });
  }
  out.push({ type: 'circle', x: a.tower.x, z: a.tower.z, hw: 9, hd: 0 });
  for (let k = 0; k < 4; k++) out.push({ type: 'circle', x: a.fuel.x0 + 8 + (k % 2) * 44, z: a.fuel.z0 + 8 + Math.floor(k / 2) * 14, hw: 6, hd: 0 });
  // the parked aircraft: fuselage and engines
  for (const g of a.gates) {
    const p = AIRCRAFT[g.kind];
    const nose = a.conc.z1 + 7;
    out.push({ type: 'box', x: g.x, z: nose + p.len / 2, hw: p.d / 2, hd: p.len / 2, top: p.belly + p.d });
  }
  void R;
  return out;
}

export function settlementRadius(s: Settlement): number {
  // futuristic cities are laid out in districts (downtown, villa estates, souk, mixed), which need room
  if (s.style === 'futuristic') return s.kind === 'capital' ? 520 : s.kind === 'city' ? 380 : s.kind === 'town' ? 150 : 95;
  return s.kind === 'capital' ? 175 : s.kind === 'city' ? 145 : s.kind === 'town' ? 110 : 75;
}

function buildingCount(s: Settlement): number {
  const base = s.kind === 'capital' ? 150 : s.kind === 'city' ? 105 : s.kind === 'town' ? 60 : 26;
  return Math.round(base * clamp(0.75 + s.infrastructure / 20, 0.75, 1.25));
}

function makeGraph(nodes: [number, number][], edges: [number, number][]): StreetGraph {
  const adj: number[][] = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return { nodes, edges, adj };
}

/** Closest node index in the street graph. */
export function nearestNode(g: StreetGraph, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    // nodes left without streets (inside parks and estates) cannot be routed through
    if (g.adj[i] && g.adj[i].length === 0) continue;
    const d = (g.nodes[i][0] - x) ** 2 + (g.nodes[i][1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Shortest path between two points via the street network (Dijkstra). */
export function routeBetween(g: StreetGraph, from: [number, number], to: [number, number]): [number, number][] {
  if (!g.nodes.length) return [to];
  const s = nearestNode(g, from[0], from[1]);
  const t = nearestNode(g, to[0], to[1]);
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[s] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    let ud = Infinity;
    for (let i = 0; i < n; i++)
      if (!done[i] && dist[i] < ud) {
        ud = dist[i];
        u = i;
      }
    if (u < 0 || u === t) break;
    done[u] = 1;
    for (const v of g.adj[u]) {
      const w = Math.hypot(g.nodes[u][0] - g.nodes[v][0], g.nodes[u][1] - g.nodes[v][1]);
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  const path: [number, number][] = [];
  for (let v = t; v !== -1; v = prev[v]) path.unshift(g.nodes[v]);
  path.push(to);
  return path;
}

function landmarkRadius(kind: string): number {
  return kind === 'spire' ? 12 : kind === 'spaceport' ? 22 : kind === 'garden' ? 16 : kind === 'market' ? 14 : 10;
}

// ───────────────────────── Futuristic: dense grid of towers ─────────────────────────

/** Where the sea begins for a coastal (futuristic) city: everything at z below this is water. */
export function coastLine(s: Settlement): number | undefined {
  return s.style === 'futuristic' ? -0.76 * settlementRadius(s) : undefined;
}

/** Distance from (px, pz) to a polyline. */
export function distToPolyline(pts: [number, number][], px: number, pz: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    best = Math.min(best, Math.hypot(px - (ax + dx * t), pz - (az + dz * t)));
  }
  return best;
}

type Zone = 'beach' | 'old' | 'coast' | 'wall' | 'downtown' | 'canal' | 'mixed' | 'marina' | 'jbr' | 'jlt' | 'estate' | 'outer';

/**
 * Futuristic cities are laid out like Dubai, following the research in
 * reports/Dubai urban layout patterns.md:
 * - a ribbon city in bands parallel to the coast (the sea lies towards -z): beach, coastal road,
 *   a low villa belt, the spine highway with its metro, an inland mixed band, a second arterial
 *   and an outer band of gated estates and a sports city;
 * - tower nodes along the spine rather than a continuous wall: the old town and its creek at the
 *   -x end, a tower wall on both spine frontages, Downtown (a boulevard ring round a lake with the
 *   signature supertall and the mall), a mid-rise gap with a second mall, and the Marina at the +x
 *   end (a canal of towers, the beachfront podium wall, lake towers across the spine);
 * - water as structure: the creek runs inland from the sea through the old town into the canal
 *   district, whose canal turns back to the sea along the edge of Downtown;
 * - amenities by catchment: daily mosques spread by walking distance, Friday mosques at district
 *   centres, churches and temples in two walled compounds at opposite ends of the city, malls on
 *   the spine, parks from a city park on the creek down to pockets in the villa belt.
 */
function futuristic(s: Settlement, rng: Rng): Layout {
  const R = settlementRadius(s);
  const sp = 36;
  const n = Math.floor(R / sp) + 1;
  const big = s.kind === 'capital' || s.kind === 'city';
  const k = R / 300;
  const snap = (v: number) => Math.round(v / sp) * sp;
  const chord = (z: number) => Math.sqrt(Math.max(0, R * R - z * z));

  // ── bands, parallel to the coast
  const shoreZ = -0.76 * R;
  const coastRoadZ = Math.ceil((shoreZ + 12) / sp) * sp;
  const spineZ = snap(-0.36 * R);
  const arterialZ = Math.max(snap(0.36 * R), spineZ + 4 * sp);
  const canalZ = arterialZ - sp;
  // ── nodes along the coast
  const dX0 = snap(-0.36 * R);
  const dX1 = snap(0.24 * R);
  const dZ0 = spineZ + sp;
  const dZ1 = canalZ - sp;
  const hasDowntown = big && dZ1 - dZ0 >= 2 * sp;
  const oldTownX = dX0;
  const returnX = dX1;
  const marinaX = dX1 + 2 * sp;

  // ── water: the creek from the sea into the canal, the canal back to the sea, the marina canal
  const waters: CityFeatures['waters'] = [];
  const canalStartX = oldTownX - 20 * k;
  if (big) {
    const creek: [number, number][] = (
      [
        [-180, -250],
        [-182, -205],
        [-205, -150],
        [-196, -90],
        [-214, -30],
        [-198, 30],
      ] as [number, number][]
    ).map(([x, z]) => [x * k, z * k] as [number, number]);
    creek.push([canalStartX, canalZ]);
    waters.push({ kind: 'creek', pts: creek, w: 30 * Math.max(0.8, k) });
    waters.push({
      kind: 'canal',
      pts: [
        [canalStartX, canalZ],
        [returnX, canalZ],
        [returnX, shoreZ - 14],
      ],
      w: 16,
    });
  }
  const marinaZ = coastRoadZ + sp;
  const marinaEdge = chord(marinaZ) - 18;
  const hasMarina = big && marinaEdge - marinaX > 40;
  if (hasMarina)
    waters.push({
      kind: 'marina',
      pts: [
        [marinaX, marinaZ],
        [marinaEdge, marinaZ],
        [marinaEdge, shoreZ - 14],
      ],
      w: 18,
    });
  const nearWater = (x: number, z: number, pad: number) => waters.some((w) => (w.kind !== 'canal' || pad > 0) && distToPolyline(w.pts, x, z) < w.w / 2 + pad);
  const creekX = (z: number) => {
    // the creek's x at a given z (it runs roughly north-south)
    const c = waters.find((w) => w.kind === 'creek');
    if (!c) return -Infinity;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [ax, az] = c.pts[i];
      const [bx, bz] = c.pts[i + 1];
      if ((z - az) * (z - bz) <= 0) return ax + ((bx - ax) * (z - az)) / (bz - az || 1);
    }
    return c.pts[c.pts.length - 1][0];
  };

  const zoneOf = (cx: number, cz: number): Zone => {
    if (cz < coastRoadZ) return 'beach';
    if (cz > arterialZ) return 'outer';
    if (cx < oldTownX) return cz < canalZ ? 'old' : 'canal';
    if (cz < spineZ) {
      if (hasMarina && cx > marinaX) return cz < marinaZ ? 'jbr' : 'marina';
      // the tower wall faces the spine from the sea side only on the strip next to the old town
      if (cz > spineZ - sp && cx > oldTownX && cx < oldTownX + 3 * sp) return 'wall';
      return 'coast';
    }
    if (big && cx > marinaX) return cz < dZ1 ? 'jlt' : 'estate';
    if (cz < spineZ + sp && cx < returnX) return 'wall';
    if (hasDowntown && cx > dX0 && cx < dX1 && cz < dZ1) return 'downtown';
    if (cz >= canalZ - sp && cx < returnX) return 'canal';
    return 'mixed';
  };
  const districtOf = (z: Zone): District =>
    z === 'old' ? 'souk' : z === 'coast' || z === 'estate' || z === 'outer' ? 'villas' : z === 'marina' || z === 'jbr' || z === 'jlt' ? 'marina' : z === 'mixed' ? 'mixed' : 'downtown';
  const cellOk = (i: number, j: number) => {
    const x = (i + 0.5) * sp;
    const z = (j + 0.5) * sp;
    return Math.hypot(x, z) <= R - 10 && zoneOf(x, z) !== 'beach';
  };

  // ── closed rectangles (venues, Downtown, parks, compounds, estates) and their inner streets
  const claimed = new Set<string>();
  const closedV = new Set<string>(); // vertical street segment at x = i*sp between z = j*sp and (j+1)*sp
  const closedH = new Set<string>(); // horizontal street segment at z = j*sp between x = i*sp and (i+1)*sp
  const closeRect = (i: number, j: number, wi: number, wj: number) => {
    for (let a = 0; a < wi; a++) for (let c = 0; c < wj; c++) claimed.add(`${i + a},${j + c}`);
    for (let a = 1; a < wi; a++) for (let c = 0; c < wj; c++) closedV.add(`${i + a},${j + c}`);
    for (let a = 0; a < wi; a++) for (let c = 1; c < wj; c++) closedH.add(`${i + a},${j + c}`);
  };
  const rectFree = (i: number, j: number, wi: number, wj: number, zones: Zone[], margin = 10, pad = 14) => {
    for (let a = 0; a < wi; a++)
      for (let c = 0; c < wj; c++) {
        const x = (i + a + 0.5) * sp;
        const z = (j + c + 0.5) * sp;
        if (claimed.has(`${i + a},${j + c}`) || !zones.includes(zoneOf(x, z)) || Math.hypot(x, z) > R - margin || nearWater(x, z, pad)) return false;
      }
    return true;
  };

  const buildings: Building[] = [];
  const add = (b: Omit<Building, 'rot' | 'tone' | 'role'> & Partial<Pick<Building, 'rot' | 'tone' | 'role'>>) => {
    buildings.push({ rot: 0, tone: rng.next(), role: 'home', ...b });
    return buildings.length - 1;
  };
  const door = (cx: number, cz: number): [number, number] => [cx, cz - sp / 2 + 0.01];

  // sports venues in the outer band (a sports city), falling back to the mixed band
  const venuePlan: [BuildingKind, number, number][] = s.kind === 'capital' ? [['stadium', 5, 4], ['arena', 4, 4]] : s.kind === 'city' ? [['arena', 4, 4]] : [];
  const placed: { x: number; z: number }[] = [];
  for (const [kind, wi0, wj0] of venuePlan) {
    let best = null as [number, number, number, number] | null;
    let bestScore = -Infinity;
    // a venue lies wholly in the outer band, or wholly inside it, never across the arterial
    for (const zones of [['outer'], ['mixed', 'estate', 'jlt']] as Zone[][]) {
      for (const [wi, wj] of [[wi0, wj0], [wj0, wi0]])
        for (let i = -n; i <= n - wi; i++)
          for (let j = -n; j <= n - wj; j++) {
            if (!rectFree(i, j, wi, wj, zones, 2)) continue;
            const cx = (i + wi / 2) * sp;
            const cz = (j + wj / 2) * sp;
            const apart = placed.length ? Math.min(...placed.map((p) => Math.hypot(p.x - cx, p.z - cz))) : R;
            const score = Math.min(apart, R) - Math.abs(cx) * 0.4 + rng.range(0, 10);
            if (score > bestScore) {
              bestScore = score;
              best = [i, j, wi, wj];
            }
          }
      if (best) break;
    }
    if (!best) continue;
    const [i, j, wi, wj] = best as [number, number, number, number];
    closeRect(i, j, wi, wj);
    const cx = (i + wi / 2) * sp;
    const cz = (j + wj / 2) * sp;
    placed.push({ x: cx, z: cz });
    const wide = wi >= wj;
    const vdoor: [number, number] = wide ? [cx, cz - (wj * sp) / 2] : [cx - Math.sign(cx || 1) * (wi * sp) / 2, cz];
    add({ x: cx, z: cz, w: wi * sp - 10, d: wj * sp - 10, h: kind === 'stadium' ? 38 : 31, kind, role: 'civic', door: vdoor, district: 'mixed' });
  }

  // Downtown: a boulevard ring round a lake, the signature supertall on the lake's edge, the mall
  // on the other edge, towers at the corners of the superblock
  const extraStreets: Layout['streets'] = [];
  const extraNodes: [number, number][] = [];
  const extraEdges: [number, number, number][] = []; // [extraNodeIndex | -1 - gridIndexKey, ...] resolved later
  const pendingLinks: { from: [number, number]; to: [number, number]; w: number }[] = [];
  let downtownF: CityFeatures['downtown'] = null;
  const lakes: CityFeatures['lakes'] = [];
  let signature = false;
  let plaza = { x: 0, z: 0, r: 30 };
  if (hasDowntown) {
    const i0 = Math.round(dX0 / sp);
    const j0 = Math.round(dZ0 / sp);
    const wi = Math.round((dX1 - dX0) / sp);
    const wj = Math.round((dZ1 - dZ0) / sp);
    closeRect(i0, j0, wi, wj);
    const W = dX1 - dX0;
    const D = dZ1 - dZ0;
    const cx = (dX0 + dX1) / 2;
    const cz = (dZ0 + dZ1) / 2;
    const a = W / 2 - 22;
    const b = D / 2 - 18;
    const lake = { x: cx, z: cz, rx: Math.max(18, Math.min(a - 34, a * 0.5)), rz: Math.max(12, Math.min(b - 16, b * 0.5)) };
    lakes.push({ ...lake, island: 14 });
    downtownF = { x: cx, z: cz, a, b, x0: dX0, x1: dX1, z0: dZ0, z1: dZ1 };
    plaza = { x: cx, z: cz, r: lake.rx };
    // the ring boulevard, joined to the surrounding streets at four points
    const segs = 24;
    const ring: [number, number][] = [];
    for (let q = 0; q < segs; q++) {
      const t = (q / segs) * Math.PI * 2;
      ring.push([cx + Math.cos(t) * a, cz + Math.sin(t) * b]);
    }
    for (let q = 0; q < segs; q++) pendingLinks.push({ from: ring[q], to: ring[(q + 1) % segs], w: 12 });
    pendingLinks.push({ from: ring[0], to: [dX1, snap(cz)], w: 12 });
    pendingLinks.push({ from: ring[segs / 2], to: [dX0, snap(cz)], w: 12 });
    pendingLinks.push({ from: ring[(segs * 3) / 4], to: [snap(cx), dZ0], w: 12 });
    pendingLinks.push({ from: ring[segs / 4], to: [snap(cx), dZ1], w: 12 });
    // the signature supertall west of the lake, the mall east of it
    const sigH = s.kind === 'capital' ? rng.range(230, 260) : rng.range(170, 200);
    add({ x: cx - lake.rx - 13, z: cz, w: 20, d: 20, h: sigH, kind: 'supertall', role: 'work', door: [cx - lake.rx - 13, cz - 12], district: 'downtown' });
    signature = true;
    add({ x: cx + lake.rx + 23, z: cz, w: 34, d: 46, h: 15, kind: 'mall', role: 'work', door: [cx + lake.rx + 4, cz], district: 'downtown' });
    // a wall of towers on both sides of the ring boulevard, the inner ones facing the lake, like
    // the towers around the Burj lake; gaps where the boulevard's four links leave the ring
    const ringTowers = (ra: number, rb: number, gaps: number[], hMin: number, hMax: number, size: number) => {
      const per = Math.PI * Math.sqrt((ra * ra + rb * rb) / 2) * 2;
      const m = Math.floor(per / 30);
      for (let q = 0; q < m; q++) {
        const t = (q / m) * Math.PI * 2 + 0.13;
        if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(t - g), Math.cos(t - g))) < 0.3)) continue;
        const tx = cx + Math.cos(t) * ra;
        const tz = cz + Math.sin(t) * rb;
        if (tx < dX0 + 9 || tx > dX1 - 9 || tz < dZ0 + 9 || tz > dZ1 - 9) continue;
        if (buildings.some((o) => Math.abs(o.x - tx) < (o.w + size) / 2 + 3 && Math.abs(o.z - tz) < (o.d + size) / 2 + 3)) continue;
        const h = rng.range(hMin, hMax);
        add({ x: tx, z: tz, w: size, d: size, h, kind: h > 100 ? 'supertall' : 'tower', role: 'work', door: [tx, tz - size / 2 - 1], district: 'downtown' });
      }
    };
    if (a > 90) {
      ringTowers((a + lake.rx) / 2 + 2, (b + lake.rz) / 2 + 2, [0, Math.PI], 55, 125, 13);
      ringTowers(a + 15, b + 14, [0, Math.PI / 2, Math.PI, -Math.PI / 2], 45, 105, 13);
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const tx = cx + sx * (W / 2 - 12);
        const tz = cz + sz * (D / 2 - 12);
        const h = rng.range(80, 140);
        add({ x: tx, z: tz, w: 15, d: 15, h, kind: h > 100 ? 'supertall' : 'tower', role: 'work', door: [tx, tz - 9], district: 'downtown' });
      }
  }

  // two walled worship compounds of churches and temples, at opposite ends of the city
  const compounds: CityFeatures['compounds'] = [];
  const addCompound = (i: number, j: number, wi: number, wj: number, kinds: BuildingKind[]) => {
    closeRect(i, j, wi, wj);
    let q = 0;
    for (let a = 0; a < wi; a++)
      for (let c = 0; c < wj; c++) {
        const x = (i + a + 0.5) * sp;
        const z = (j + c + 0.5) * sp;
        add({ x, z, w: 23, d: 23, h: kinds[q % kinds.length] === 'church' ? 14 : 10, kind: kinds[q % kinds.length], role: 'civic', door: door(x, z), district: districtOf(zoneOf(x, z)) });
        q++;
      }
    compounds.push({ x: (i + wi / 2) * sp, z: (j + wj / 2) * sp, w: wi * sp - 6, d: wj * sp - 6 });
  };
  if (big) {
    const i = Math.round(oldTownX / sp) - 1;
    const j = Math.round(dZ0 / sp);
    if (rectFree(i, j, 1, 2, ['mixed', 'wall', 'old', 'canal'], 10, 4)) addCompound(i, j, 1, 2, ['church', 'temple']);
    let best: [number, number] | null = null;
    let bd = -1;
    for (let a = -n; a < n; a++)
      for (let c = -n; c < n; c++) {
        if (!rectFree(a, c, 2, 1, ['mixed', 'outer', 'estate', 'jlt'])) continue;
        const d = compounds.length ? Math.hypot((a + 1) * sp - compounds[0].x, (c + 0.5) * sp - compounds[0].z) : 0;
        if (d > bd) {
          bd = d;
          best = [a, c];
        }
      }
    if (best) addCompound(best[0], best[1], 2, 1, ['temple', 'church']);
  }

  // parks: a city park on the creek bank, a linear park along the return canal, pockets later
  const parkB = (i: number, j: number, wi: number, wj: number) => {
    closeRect(i, j, wi, wj);
    const x = (i + wi / 2) * sp;
    const z = (j + wj / 2) * sp;
    add({ x, z, w: wi * sp - 10, d: wj * sp - 10, h: 0.1, kind: 'park', role: 'civic', door: [x, j * sp + 0.01], district: districtOf(zoneOf(x, z)) });
  };
  if (big) {
    let best: [number, number] | null = null;
    let bz = -Infinity;
    for (let a = -n; a < n; a++)
      for (let c = -n; c < n; c++) if (rectFree(a, c, 2, 2, ['old']) && c > bz) {
        bz = c;
        best = [a, c];
      }
    if (best) parkB(best[0], best[1], 2, 2);
    const li = Math.round(returnX / sp) - 1;
    const lj = Math.round(coastRoadZ / sp);
    const rows = Math.round((spineZ - coastRoadZ) / sp);
    if (rows >= 2 && rectFree(li, lj, 1, rows, ['coast', 'wall'])) parkB(li, lj, 1, rows);
  }

  // Friday mosques: the grand mosque in the old town by the souk, one in the villa belt, one inland
  const fridayAt = (tx: number, tz: number, zones: Zone[]) => {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let a = -n; a < n; a++)
      for (let c = -n; c < n; c++) {
        if (!rectFree(a, c, 1, 1, zones, 10, 4)) continue;
        const d = Math.hypot((a + 0.5) * sp - tx, (c + 0.5) * sp - tz);
        if (d < bd) {
          bd = d;
          best = [a, c];
        }
      }
    if (!best) return;
    claimed.add(`${best[0]},${best[1]}`);
    const x = (best[0] + 0.5) * sp;
    const z = (best[1] + 0.5) * sp;
    add({ x, z, w: 25, d: 25, h: 12, kind: 'mosque', role: 'civic', door: door(x, z), district: districtOf(zoneOf(x, z)) });
  };
  if (big) fridayAt(creekX(coastRoadZ + 2 * sp) - 45, coastRoadZ + 2 * sp, ['old']);
  fridayAt(0, coastRoadZ + 1.5 * sp, ['coast']);
  fridayAt(0.45 * R, (spineZ + arterialZ) / 2, ['mixed', 'estate', 'outer']);

  // the mall in the gap, against the spine
  {
    const i = Math.round(returnX / sp);
    const j = Math.round(spineZ / sp);
    // a flagship mall on three by two blocks facing the spine, falling back to smaller sites
    const zones: Zone[] = ['mixed', 'wall', 'canal', 'jlt'];
    const sites: [number, number, number, number][] = [[i - 1, j, 3, 2], [i, j, 3, 2], [i - 2, j, 3, 2], [i - 1, j, 2, 2], [i, j, 2, 1], [i, j, 1, 1]];
    const site = sites.find(([a, c, wi, wj]) => rectFree(a, c, wi, wj, zones, 10, 4));
    if (site) {
      const [a, c, wi, wj] = site;
      closeRect(a, c, wi, wj);
      const x = (a + wi / 2) * sp;
      const z = (c + wj / 2) * sp;
      const w = wi * sp - 10;
      const d = wj * sp - (wj > 1 ? 31 : 10);
      // the front sits back from the spine to leave room for the forecourt and drop-off
      const zc = wj > 1 ? c * sp + wj * sp - 4 - d / 2 : z;
      add({ x, z: zc, w, d, h: 15, kind: 'mall', role: 'work', door: [x, zc - d / 2 - 1], district: 'mixed' });
    }
  }

  // gated estates in the outer band: rectangles of free cells, each with its own road and core
  const estates: CityFeatures['estates'] = [];
  const estateVillas: number[] = [];
  for (let c = -n; c < n; c++)
    for (let a = -n; a < n; a++) {
      if (!rectFree(a, c, 1, 1, ['outer', 'estate'])) continue;
      let wi = 1;
      while (wi < 4 && rectFree(a + wi, c, 1, 1, ['outer', 'estate'])) wi++;
      let wj = 1;
      while (wj < 3 && rectFree(a, c + wj, wi, 1, ['outer', 'estate'])) wj++;
      // an estate needs at least two rows of blocks: a lane with a row of houses on each side
      if (wi < 2 || wj < 2) continue;
      closeRect(a, c, wi, wj);
      buildEstate(a, c, wi, wj);
    }

  function buildEstate(i: number, j: number, wi: number, wj: number) {
    const X0 = i * sp + 5;
    const X1 = (i + wi) * sp - 5;
    const Z0 = j * sp + 5;
    const Z1 = (j + wj) * sp - 5;
    const cx = (X0 + X1) / 2;
    const cz = (Z0 + Z1) / 2;
    const gx = Math.min(Math.max(snap(cx), i * sp + sp), (i + wi - 1) * sp);
    const gate: [number, number] = [gx, j * sp];
    const tier = rng.next();
    const frontage = tier < 0.3 ? 20 : tier < 0.85 ? 24 : 30;
    const depth = 26;
    const plots: { x: number; z: number; f: number; ry: number; road: [number, number] }[] = [];
    // the whole plot (all four corners) must lie inside the estate and the city
    const plotInside = (x: number, z: number, f: number, ry: number) => {
      const fx = Math.sin(ry);
      const fz = Math.cos(ry);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = x + fz * a * (f / 2) + fx * b * (depth / 2);
        const pz = z - fx * a * (f / 2) + fz * b * (depth / 2);
        if (px < X0 - 1 || px > X1 + 1 || pz < Z0 - 1 || pz > Z1 + 1 || Math.hypot(px, pz) > R - 2) return false;
      }
      return true;
    };
    const free = (x: number, z: number, r: number) => plots.every((p) => Math.hypot(p.x - x, p.z - z) > r + p.f / 2 - 1);
    // lay plots along a road path, on one or both sides
    const along = (path: [number, number][], sides: number[], f: number, avoid: (x: number, z: number) => boolean) => {
      for (let q = 0; q < path.length - 1; q++) {
        const [ax, az] = path[q];
        const [bx, bz] = path[q + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / len;
        const tz = (bz - az) / len;
        for (let d = f / 2; d <= len - f / 2 + 0.1; d += f) {
          const rx = ax + tx * d;
          const rz = az + tz * d;
          for (const s2 of sides) {
            const nx = -tz * s2;
            const nz = tx * s2;
            const px = rx + nx * (5 + depth / 2);
            const pz = rz + nz * (5 + depth / 2);
            const ry = Math.atan2(rx - px, rz - pz);
            if (!plotInside(px, pz, f, ry) || !free(px, pz, f / 2) || avoid(px, pz)) continue;
            plots.push({ x: px, z: pz, f, ry, road: [rx, rz] });
          }
        }
      }
    };
    const pathStreets = (path: [number, number][], w: number, closed = false) => {
      const m = closed ? path.length : path.length - 1;
      for (let q = 0; q < m; q++) pendingLinks.push({ from: path[q], to: path[(q + 1) % path.length], w });
    };
    let core: CityFeatures['estates'][number]['core'] = null;
    const bulbs: [number, number][] = [];
    const W = X1 - X0;
    const D = Z1 - Z0;
    if (D >= 90 && W >= 90) {
      // a loop road round a golf or lake core; houses outside face the loop, premium houses inside
      // back onto the core
      const ax = W / 2 - 28;
      const az = D / 2 - 28;
      const loop: [number, number][] = [];
      const m = 28;
      for (let q = 0; q < m; q++) {
        const t = (q / m) * Math.PI * 2;
        const c = Math.cos(t);
        const s2 = Math.sin(t);
        // a superellipse: straighter sides, rounder corners
        loop.push([cx + Math.sign(c) * Math.pow(Math.abs(c), 0.6) * ax, cz + Math.sign(s2) * Math.pow(Math.abs(s2), 0.6) * az]);
      }
      core = { x: cx, z: cz, rx: Math.max(10, ax - 24), rz: Math.max(8, az - 24) };
      const inCore = (x: number, z: number) => ((x - cx) / (core!.rx + 9)) ** 2 + ((z - cz) / (core!.rz + 9)) ** 2 < 1;
      pathStreets(loop, 8, true);
      along([...loop, loop[0]], [1], frontage, inCore);
      along([...loop, loop[0]], [-1], 30, inCore);
      // access road from the gate to the nearest point of the loop
      const entry = loop.reduce((p, q) => (Math.hypot(q[0] - gate[0], q[1] - gate[1]) < Math.hypot(p[0] - gate[0], p[1] - gate[1]) ? q : p));
      pendingLinks.push({ from: gate, to: entry, w: 10 });
    } else {
      // a lane along the long axis with turning bulbs at the ends; the core is a lake park at one end
      const lane: [number, number][] = W >= D ? [[X0 + 12, cz], [X1 - 12, cz]] : [[cx, Z0 + 12], [cx, Z1 - 12]];
      const coreEnd = rng.chance(0.5) ? 0 : 1;
      const len = Math.hypot(lane[1][0] - lane[0][0], lane[1][1] - lane[0][1]);
      const ce = lane[coreEnd];
      const other = lane[1 - coreEnd];
      const cdx = (other[0] - ce[0]) / len;
      const cdz = (other[1] - ce[1]) / len;
      const coreLen = Math.max(18, len * 0.16);
      core = { x: ce[0] + cdx * coreLen * 0.5, z: ce[1] + cdz * coreLen * 0.5, rx: W >= D ? coreLen * 0.6 : (W - 10) / 2, rz: W >= D ? (D - 10) / 2 : coreLen * 0.6 };
      const inCore = (x: number, z: number) => Math.abs(x - core!.x) < core!.rx + 8 && Math.abs(z - core!.z) < core!.rz + 8;
      const laneRoad: [number, number][] = [[ce[0] + cdx * coreLen, ce[1] + cdz * coreLen], other];
      pathStreets(laneRoad, 8);
      bulbs.push(other);
      along(laneRoad, [1, -1], frontage, inCore);
      // the gate road joins the lane
      const entry = laneRoad.reduce((p, q) => (Math.hypot(q[0] - gate[0], q[1] - gate[1]) < Math.hypot(p[0] - gate[0], p[1] - gate[1]) ? q : p));
      pendingLinks.push({ from: gate, to: entry, w: 10 });
    }
    for (const p of plots) {
      const hw = Math.min(p.f - 9, rng.range(10.5, 12.5) + (p.f > 26 ? 6 : 0));
      const hd = rng.range(9.5, 11.5);
      // house at the back of the plot, a little to one side
      const back = depth / 2 - hd / 2 - 2.5;
      const side = (rng.chance(0.5) ? 1 : -1) * Math.max(0, p.f / 2 - hw / 2 - 2.5) * 0.6;
      const fx = Math.sin(p.ry);
      const fz = Math.cos(p.ry);
      const x = p.x - fx * back + fz * side;
      const z = p.z - fz * back - fx * side;
      const idx = add({ x, z, w: hw, d: hd, h: rng.range(7.5, p.f > 26 ? 11 : 9.5), kind: 'villa', door: p.road, district: 'villas', plot: { x: p.x, z: p.z, w: p.f - 1, d: depth, rot: p.ry } });
      estateVillas.push(idx);
    }
    estates.push({ x: cx, z: cz, w: W, d: D, gate, core, bulbs });
  }

  // ── fill every remaining cell by its zone
  const jltCells: [number, number][] = [];
  const jbrCells: [number, number][] = [];
  const cellBuildings = new Map<string, number[]>();
  const coastCells: string[] = [];
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++) {
      if (!cellOk(i, j) || claimed.has(`${i},${j}`)) continue;
      const cx = (i + 0.5) * sp;
      const cz = (j + 0.5) * sp;
      const zone = zoneOf(cx, cz);
      const district = districtOf(zone);
      const key = `${i},${j}`;
      const list: number[] = [];
      cellBuildings.set(key, list);
      const push = (b: Parameters<typeof add>[0]) => list.push(add(b));
      if (nearWater(cx, cz, zone === 'old' ? 13 : 4)) {
        // the creek bank: souk terraces facing the water near the mouth, otherwise left open
        if (zone === 'old' && !nearWater(cx, cz, 2) && cz < coastRoadZ + 3 * sp) {
          const n3 = 2;
          for (let l = 0; l < n3; l++) push({ x: cx - 7 + l * 14, z: cz, w: 12.4, d: 12, h: rng.range(6.5, 10), kind: 'shop', role: rng.chance(0.8) ? 'work' : 'home', door: door(cx - 7 + l * 14, cz), district });
        }
        continue;
      }
      switch (zone) {
        case 'old': {
          const nearCreek = distToPolyline(waters.find((w) => w.kind === 'creek')?.pts ?? [[1e9, 1e9], [1e9, 1e9]], cx, cz);
          if (nearCreek < 46 && cz < coastRoadZ + 3 * sp) {
            // the souks: arcaded shophouse terraces near the creek mouth
            const n3 = rng.chance(0.6) ? 3 : 2;
            const lw = 26 / n3;
            for (let l = 0; l < n3; l++) push({ x: cx - 13 + lw * (l + 0.5), z: cz - 3, w: lw - 0.6, d: rng.range(12, 14), h: rng.range(6.5, 11), kind: 'shop', role: rng.chance(0.75) ? 'work' : 'home', door: [cx - 13 + lw * (l + 0.5), cz - sp / 2 + 0.01], district });
          } else if (cx > oldTownX - sp && cz > spineZ) {
            // a mid-rise collar of 1970s-90s blocks round the courtyard core
            push({ x: cx, z: cz, w: rng.range(18, 24), d: rng.range(16, 22), h: rng.range(10, 20), kind: 'block', role: rng.chance(0.6) ? 'work' : 'home', door: door(cx, cz), district: 'souk' });
          } else {
            // courtyard houses on 13 m plots, four to a block, separated by narrow sikka lanes
            for (const ox of [-6.8, 6.8]) for (const oz of [-6.8, 6.8]) push({ x: cx + ox, z: cz + oz, w: 12, d: 12, h: rng.range(4.5, 8), kind: 'oldhouse', door: [cx + ox, cz + oz + Math.sign(oz) * 6.5], district });
            extraStreets.push({ a: [cx, cz - sp / 2 + 4], b: [cx, cz + sp / 2 - 4], w: 1.8 });
            extraStreets.push({ a: [cx - sp / 2 + 4, cz], b: [cx + sp / 2 - 4, cz], w: 1.8 });
          }
          break;
        }
        case 'coast': {
          // along the return canal the villa belt gives way to a linear canal-side park
          const canal = waters.find((w) => w.kind === 'canal');
          if (canal && distToPolyline(canal.pts, cx, cz) < canal.w / 2 + 14) {
            const sx = Math.sign(cx - returnX) || 1;
            push({ x: cx + sx * 4, z: cz, w: sp - 18, d: sp - 10, h: 0.1, kind: 'park', role: 'civic', door: door(cx, cz), district });
            break;
          }
          // the Jumeirah belt: one walled villa per block; resort hotels on some beach-row blocks
          // resort hotels on every fourth block of the beach row, private beaches in front
          if (cz < coastRoadZ + sp && ((i % 4) + 4) % 4 === 1) {
            push({ x: cx, z: cz, w: 22, d: 14, h: rng.range(28, 42), kind: 'slab', role: 'work', door: [cx, cz + sp / 2], district: 'mixed' });
            break;
          }
          const w = rng.range(10.5, 12.5);
          const d = rng.range(9.5, 11.5);
          const side = rng.chance(0.5) ? 1 : -1;
          // the plot faces the street on its inland side, so the garden looks towards the sea
          push({ x: cx + side * 2.8, z: cz - 1.5, w, d, h: rng.range(7.5, 9.5), kind: 'villa', door: [cx, cz + sp / 2 - 0.01], district, plot: { x: cx, z: cz, w: sp - 12, d: sp - 12 } });
          coastCells.push(key);
          break;
        }
        case 'wall': {
          // the spine wall: towers on both frontages of the highway
          const h = rng.range(45, 85);
          push({ x: cx, z: cz, w: rng.range(16, 22), d: rng.range(16, 22), h, kind: h > 60 ? 'tower' : 'slab', role: 'work', door: [cx, cz + (cz < spineZ ? -sp / 2 : sp / 2)], district });
          break;
        }
        case 'canal': {
          const h = rng.range(35, 72);
          push({ x: cx, z: cz, w: rng.range(14, 20), d: rng.range(14, 20), h, kind: h > 55 ? 'tower' : rng.chance(0.5) ? 'slab' : 'block', role: rng.chance(0.6) ? 'work' : 'home', door: door(cx, cz), district });
          break;
        }
        case 'marina': {
          const h = rng.range(55, 110);
          push({ x: cx, z: cz, w: rng.range(15, 19), d: rng.range(15, 19), h, kind: h > 88 ? 'supertall' : 'tower', role: 'home', door: door(cx, cz), district });
          break;
        }
        case 'jbr': {
          // the beachfront wall: slab towers in pairs on a continuous podium
          for (const ox of [-7.5, 7.5]) push({ x: cx + ox, z: cz + 2, w: 10, d: 15, h: rng.range(40, 56), kind: 'slab', role: 'home', door: [cx + ox, cz - sp / 2 + 0.01], district });
          jbrCells.push([cx, cz]);
          break;
        }
        case 'jlt':
          jltCells.push([cx, cz]);
          break;
        case 'mixed': {
          // the mid-rise gap; low sheds towards the arterial
          if (cz > canalZ - sp && rng.chance(0.3)) {
            push({ x: cx, z: cz, w: 24, d: 22, h: rng.range(6, 9), kind: 'block', role: 'work', door: door(cx, cz), district });
            break;
          }
          const lots = rng.chance(0.5) ? 1 : 2;
          for (let l = 0; l < lots; l++) {
            const x = cx + (lots === 1 ? 0 : (l === 0 ? -1 : 1) * 6.5);
            push({ x, z: cz, w: lots === 1 ? rng.range(16, 22) : rng.range(9, 12), d: rng.range(15, 21), h: rng.range(10, 28), kind: rng.chance(0.4) ? 'slab' : 'block', role: rng.chance(0.55) ? 'home' : 'work', door: door(x, cz), district });
          }
          break;
        }
        case 'estate':
        case 'outer': {
          // a lone plot left over from the estates
          const w = rng.range(10.5, 12.5);
          const d = rng.range(9.5, 11.5);
          push({ x: cx + (rng.chance(0.5) ? 2.8 : -2.8), z: cz + 1.5, w, d, h: rng.range(7.5, 9.5), kind: 'villa', door: door(cx, cz), district: 'villas', plot: { x: cx, z: cz, w: sp - 12, d: sp - 12 } });
          break;
        }
        default:
          break;
      }
    }

  // lake towers across the spine from the Marina: two lakes, the rest clusters of three towers
  const jlt: CityFeatures['jlt'] = [];
  if (jltCells.length >= 3) {
    const mx = jltCells.reduce((s2, c) => s2 + c[0], 0) / jltCells.length;
    const mz = jltCells.reduce((s2, c) => s2 + c[1], 0) / jltCells.length;
    const byCentre = [...jltCells].sort((p, q) => Math.hypot(p[0] - mx, p[1] - mz) - Math.hypot(q[0] - mx, q[1] - mz));
    const lakeCells = byCentre.slice(0, Math.min(2, Math.floor(jltCells.length / 3)));
    for (const [x, z] of lakeCells) lakes.push({ x, z, rx: 14, rz: 13 });
    for (const [x, z] of jltCells) {
      if (lakeCells.some((c) => c[0] === x && c[1] === z)) continue;
      jlt.push({ x, z, s: 26 });
      for (let q = 0; q < 3; q++) {
        const t = (q / 3) * Math.PI * 2 + 0.5;
        add({ x: x + Math.cos(t) * 8, z: z + Math.sin(t) * 8, w: 9, d: 9, h: rng.range(45, 88), kind: 'tower', role: rng.chance(0.5) ? 'work' : 'home', door: [x, z - sp / 2 + 0.01], district: 'marina' });
      }
    }
  }
  const jbr: CityFeatures['jbr'] = jbrCells.length ? { x0: Math.min(...jbrCells.map((c) => c[0])) - sp / 2 + 4, x1: Math.max(...jbrCells.map((c) => c[0])) + sp / 2 - 4, z0: coastRoadZ + 4, z1: coastRoadZ + sp - 4 } : null;

  // pocket parks in the villa belt, about one in six blocks, spread out
  const removed = new Set<number>();
  const parkSpots: [number, number][] = buildings.filter((b) => b.kind === 'park').map((b) => [b.x, b.z]);
  for (const key of coastCells) {
    const [i, j] = key.split(',').map(Number);
    const x = (i + 0.5) * sp;
    const z = (j + 0.5) * sp;
    if (parkSpots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 130)) continue;
    for (const b of cellBuildings.get(key) ?? []) removed.add(b);
    add({ x, z, w: sp - 10, d: sp - 10, h: 0.1, kind: 'park', role: 'civic', door: door(x, z), district: 'villas' });
    parkSpots.push([x, z]);
  }

  // daily mosques by walking catchment: any home farther than the catchment from a mosque gets one
  const mosques: [number, number][] = buildings.filter((b) => b.kind === 'mosque').map((b) => [b.x, b.z]);
  type Cand = { x: number; z: number; drop: number[]; door: [number, number]; size: number; reach: number; district: District; plot?: Building['plot'] };
  const cands: Cand[] = [];
  for (const [key, list] of cellBuildings) {
    const live = list.filter((b) => !removed.has(b));
    if (!live.length) continue;
    const kind = buildings[live[0]].kind;
    if (kind !== 'villa' && kind !== 'oldhouse' && kind !== 'block') continue;
    const [i, j] = key.split(',').map(Number);
    const x = (i + 0.5) * sp;
    const z = (j + 0.5) * sp;
    const b0 = buildings[live[0]];
    cands.push({ x, z, drop: live, door: kind === 'villa' ? b0.door : door(x, z), size: 20, reach: kind === 'oldhouse' ? 65 : 95, district: b0.district ?? 'villas', plot: kind === 'villa' ? b0.plot : undefined });
  }
  for (const idx of estateVillas) {
    const b = buildings[idx];
    cands.push({ x: b.plot!.x, z: b.plot!.z, drop: [idx], door: b.door, size: Math.min(18, b.plot!.w - 4), reach: 95, district: 'villas', plot: b.plot });
  }
  rng.shuffle(cands);
  for (const c of cands) {
    if (mosques.some(([mx, mz]) => Math.hypot(mx - c.x, mz - c.z) < c.reach)) continue;
    for (const d of c.drop) removed.add(d);
    add({ x: c.x, z: c.z, w: c.size, d: c.size, h: 9, kind: 'mosqueSmall', role: 'civic', door: c.door, district: c.district, plot: c.plot });
    mosques.push([c.x, c.z]);
  }
  const kept = buildings.filter((_, q) => !removed.has(q));

  // ── the airport (capitals): its access road leaves the inland expressway along a street line
  // clear of anything taller than a house, so the deck can pass over on its pillars
  let airport: AirportPlan | undefined;
  if (s.kind === 'capital') {
    const inlandZ = arterialZ - sp;
    const cands: number[] = [];
    for (let i = 0; i <= 8; i++) for (const sg of i === 0 ? [1] : [1, -1]) cands.push(sg * i * sp);
    cands.sort((a, b) => (Math.round(a / sp) % 4 === 0 ? 0 : 1) - (Math.round(b / sp) % 4 === 0 ? 0 : 1) || Math.abs(a) - Math.abs(b));
    const clear = (x: number) =>
      kept.every((b) => {
        const hw = (b.plot?.w ?? b.w) / 2;
        const hd = (b.plot?.d ?? b.d) / 2;
        const bx = b.plot?.x ?? b.x;
        const bz = b.plot?.z ?? b.z;
        if (Math.abs(bx - x) > hw + 7.5 || bz + hd < inlandZ - 8 || bz - hd > R + 10) return true;
        // houses pass under the deck; anything with a tower, minaret or stand does not
        return b.h < 10 && (b.kind === 'villa' || b.kind === 'oldhouse' || b.kind === 'shop' || b.kind === 'park');
      }) && lakes.every((l) => Math.abs(l.x - x) > l.rx + 10 || l.z + l.rz < inlandZ || l.z - l.rz > R);
    const xa = cands.find(clear);
    if (xa !== undefined) airport = airportPlan(R, xa);
  }

  // ── streets: the grid, minus closed rectangles, the sea, the canals; plus ring, estate roads, lanes
  const nodes: [number, number][] = [];
  const idx = new Map<string, number>();
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const x = i * sp;
      const z = j * sp;
      if (Math.hypot(x, z) > R + sp * 0.3 || z < coastRoadZ - 1) continue;
      idx.set(`${i},${j}`, nodes.length);
      nodes.push([x, z]);
    }
  const onCanal = (ax: number, az: number, bx: number, bz: number) =>
    waters.some((w) => w.kind !== 'creek' && w.pts.slice(0, -1).some(([px, pz], q) => {
      const [qx, qz] = w.pts[q + 1];
      // a street lying along a canal leg (rather than crossing it) is replaced by the water
      if (Math.abs(az - bz) < 1 && Math.abs(pz - qz) < 1 && Math.abs(az - pz) < 1) return Math.max(ax, bx) > Math.min(px, qx) + 1 && Math.min(ax, bx) < Math.max(px, qx) - 1;
      if (Math.abs(ax - bx) < 1 && Math.abs(px - qx) < 1 && Math.abs(ax - px) < 1) return Math.max(az, bz) > Math.min(pz, qz) + 1 && Math.min(az, bz) < Math.max(pz, qz) - 1;
      return false;
    }));
  const edges: [number, number][] = [];
  const streets: Layout['streets'] = [];
  // road hierarchy: boulevards (spine, coastal road, arterial), collectors every fourth grid line,
  // local streets between them; villa quarters get lanes only, no through cross-streets
  const majorV = (x: number) => Math.round(x / sp) % 4 === 0;
  const majorH = (z: number) => z === spineZ || z === coastRoadZ || z === arterialZ || (z > arterialZ && Math.round(z / sp) % 4 === 0);
  const widthOf = (ax: number, az: number, bz: number) =>
    az === bz ? (az === spineZ ? 16 : az === coastRoadZ ? 12 : az === arterialZ ? 14 : majorH(az) ? 11 : 7) : majorV(ax) ? 11 : 7;
  const villaZone = (z: Zone) => z === 'coast' || z === 'outer' || z === 'estate';
  const roundabouts: [number, number][] = [];
  for (const [key, a] of idx) {
    const [i, j] = key.split(',').map(Number);
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      if (di === 0 && closedV.has(`${i},${j}`)) continue;
      if (dj === 0 && closedH.has(`${i},${j}`)) continue;
      const b = idx.get(`${i + di},${j + dj}`);
      if (b === undefined) continue;
      const [ax, az] = nodes[a];
      const [bx, bz] = nodes[b];
      if (onCanal(ax, az, bx, bz)) continue;
      if (ax === bx && !majorV(ax)) {
        const zm = (az + bz) / 2;
        if (villaZone(zoneOf(ax - sp / 2, zm)) && villaZone(zoneOf(ax + sp / 2, zm))) continue;
      }
      edges.push([a, b]);
      const oldLane = ax < oldTownX && bx <= oldTownX && az < canalZ && bz < canalZ && az > coastRoadZ && bz > coastRoadZ;
      streets.push({ a: nodes[a], b: nodes[b], w: oldLane ? 6 : widthOf(ax, az, bz) });
    }
  }
  // extra links (ring, estate roads): snap their ends to existing nodes where they meet them
  const nodeAt = (p: [number, number]) => {
    for (let q = 0; q < nodes.length; q++) if (Math.abs(nodes[q][0] - p[0]) < 0.5 && Math.abs(nodes[q][1] - p[1]) < 0.5) return q;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  for (const l of pendingLinks) {
    const a = nodeAt(l.from);
    const b = nodeAt(l.to);
    if (a === b) continue;
    edges.push([a, b]);
    streets.push({ a: nodes[a], b: nodes[b], w: l.w });
  }
  streets.push(...extraStreets);
  void extraNodes;
  void extraEdges;
  void signature;

  const graph = makeGraph(nodes, edges);
  // roundabouts where two collectors cross (never under the spine expressway or beside Downtown)
  for (let q = 0; q < nodes.length; q++) {
    const [x, z] = nodes[q];
    if (airport && Math.abs(x - airport.xa) < 1) continue;
    if (graph.adj[q].length !== 4 || !(majorV(x) || majorH(z)) || z === spineZ || z === coastRoadZ || z === arterialZ - sp) continue;
    // only where wide roads meet: at least two of the four arms are collectors or boulevards
    if (streets.filter((st) => st.w >= 11 && ((st.a[0] === x && st.a[1] === z) || (st.b[0] === x && st.b[1] === z))).length < 2) continue;
    if (roundabouts.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 140)) continue;
    if (downtownF && x > downtownF.x0 - sp && x < downtownF.x1 + sp && z > downtownF.z0 - sp && z < downtownF.z1 + sp) continue;
    if (nearWater(x, z, 14) || Math.hypot(x, z) > R - 20) continue;
    roundabouts.push([x, z]);
  }
  // no traffic lights on roundabouts
  const lights: [number, number][] = nodes.filter(([x, z], q) => graph.adj[q].length > 0 && rng.chance(0.85) && !roundabouts.some(([rx, rz]) => rx === x && rz === z));
  const chordSpine = chord(spineZ);
  const features: CityFeatures = {
    shoreZ,
    coastRoadZ,
    spineZ,
    arterialZ,
    waters,
    lakes,
    downtown: downtownF,
    metro: { z: spineZ + 4, x0: -chordSpine + 10, x1: chordSpine - 10, stations: [-0.6, -0.2, 0.2, 0.6].map((f) => Math.round(f * chordSpine)) },
    estates,
    jbr,
    jlt,
    compounds,
    roundabouts,
    airport,
  };
  const avoid = (x: number, z: number) => z < coastRoadZ + 8 || nearWater(x, z, 16) || lakes.some((l) => ((x - l.x) / (l.rx + 10)) ** 2 + ((z - l.z) / (l.rz + 10)) ** 2 < 1);
  const out = finish('futuristic', s, rng, R, kept, streets, graph, [plaza], lights, sp, avoid);
  if (airport) out.colliders.push(...airportColliders(airport, R));
  return { ...out, features };
}

// ───────────────────────── Organic: rings of domes and living trees ─────────────────────────

function organic(s: Settlement, rng: Rng): Layout {
  const R = settlementRadius(s);
  const rings: number[] = [];
  for (let r = 42; r < R; r += 30) rings.push(r);
  const spokes = 8;
  const nodes: [number, number][] = [[0, 0]];
  const edges: [number, number][] = [];
  const ringNode: number[][] = [];
  rings.forEach((r) => {
    const row: number[] = [];
    for (let k = 0; k < spokes * 2; k++) {
      const a = (k / (spokes * 2)) * Math.PI * 2;
      row.push(nodes.length);
      nodes.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    ringNode.push(row);
  });
  const streets: Layout['streets'] = [];
  ringNode.forEach((row, ri) => {
    row.forEach((a, k) => {
      const b = row[(k + 1) % row.length];
      edges.push([a, b]);
      streets.push({ a: nodes[a], b: nodes[b], w: 5 });
      if (k % 2 === 0) {
        const inner = ri === 0 ? 0 : ringNode[ri - 1][k];
        edges.push([inner, a]);
        streets.push({ a: nodes[inner], b: nodes[a], w: 6 });
      }
    });
  });
  const buildings: Building[] = [];
  const target = buildingCount(s);
  for (let ri = 0; ri < rings.length && buildings.length < target; ri++) {
    const r = rings[ri] + 14;
    if (r > R - 6) break;
    const count = Math.floor((2 * Math.PI * r) / 18);
    for (let k = 0; k < count && buildings.length < target; k++) {
      const a = (k / count) * Math.PI * 2 + rng.range(-0.05, 0.05);
      // keep spokes clear
      const spokeAngle = Math.round((a / (Math.PI * 2)) * spokes) * ((Math.PI * 2) / spokes);
      if (Math.abs(a - spokeAngle) < 0.09) continue;
      if (rng.chance(0.18)) continue;
      const rr = r + rng.range(-3, 3);
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      const roll = rng.next();
      const kind: BuildingKind = roll < 0.55 ? 'dome' : roll < 0.8 ? 'treehouse' : 'pod';
      const size = kind === 'treehouse' ? rng.range(9, 13) : kind === 'dome' ? rng.range(8, 14) : rng.range(6, 9);
      const h = kind === 'treehouse' ? rng.range(18, 30) : kind === 'dome' ? size * 0.75 : rng.range(6, 10);
      const door: [number, number] = [Math.cos(a) * rings[ri], Math.sin(a) * rings[ri]];
      buildings.push({ x, z, w: size, d: size, h, rot: -a, kind, role: rng.chance(0.65) ? 'home' : 'work', tone: rng.next(), door });
    }
  }
  const lights: [number, number][] = nodes.filter((_, i) => i % 2 === 0);
  return finish('organic', s, rng, R, buildings, streets, makeGraph(nodes, edges), [{ x: 0, z: 0, r: 26 }], lights, 30);
}

// ───────────────────────── Frontier: crossroads town of stone and timber ─────────────────────────

function frontier(s: Settlement, rng: Rng): Layout {
  const R = settlementRadius(s);
  const spacing = 30;
  const n = Math.floor(R / spacing);
  const nodes: [number, number][] = [];
  const idx = new Map<string, number>();
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      if (Math.abs(i) * spacing + Math.abs(j) * spacing * 0.6 > R + 10) continue;
      idx.set(`${i},${j}`, nodes.length);
      nodes.push([i * spacing + (j % 2) * 3, j * spacing + (i % 2) * 3]);
    }
  const edges: [number, number][] = [];
  const streets: Layout['streets'] = [];
  for (const [k, a] of idx) {
    const [i, j] = k.split(',').map(Number);
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      const b = idx.get(`${i + di},${j + dj}`);
      if (b !== undefined && (i === 0 || j === 0 || rng.chance(0.75))) {
        edges.push([a, b]);
        streets.push({ a: nodes[a], b: nodes[b], w: i === 0 || j === 0 ? 9 : 6 });
      }
    }
  }
  const buildings: Building[] = [];
  const target = buildingCount(s);
  for (const [a, b] of edges) {
    if (buildings.length >= target) break;
    const [ax, az] = nodes[a];
    const [bx, bz] = nodes[b];
    const horiz = Math.abs(bz - az) < 1;
    const len = Math.hypot(bx - ax, bz - az);
    const lots = Math.floor(len / 13);
    for (let l = 0; l < lots && buildings.length < target; l++) {
      for (const side of [-1, 1]) {
        if (rng.chance(0.25)) continue;
        const t = (l + 0.5) / lots;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const off = rng.range(9, 11);
        const x = horiz ? px : px + side * off;
        const z = horiz ? pz + side * off : pz;
        if (Math.hypot(x, z) < 22 || Math.hypot(x, z) > R - 6) continue;
        if (buildings.some((o) => Math.abs(o.x - x) < 10 && Math.abs(o.z - z) < 10)) continue;
        const roll = rng.next();
        const kind: BuildingKind = roll < 0.07 ? 'windmill' : roll < 0.13 ? 'silo' : roll < 0.25 ? 'hall' : 'house';
        const w = kind === 'hall' ? rng.range(10, 13) : rng.range(6.5, 9);
        const d = kind === 'hall' ? rng.range(12, 16) : rng.range(7, 10);
        const h = kind === 'windmill' ? 14 : kind === 'silo' ? rng.range(10, 14) : kind === 'hall' ? rng.range(6, 8) : rng.range(3.6, 5.5);
        buildings.push({ x, z, w, d, h, rot: horiz ? 0 : Math.PI / 2, kind, role: kind === 'house' ? 'home' : 'work', tone: rng.next(), door: [px, pz] });
      }
    }
  }
  const lights: [number, number][] = nodes.filter(() => rng.chance(0.6));
  return finish('frontier', s, rng, R, buildings, streets, makeGraph(nodes, edges), [{ x: 0, z: 0, r: 20 }], lights, spacing);
}

function finish(
  style: ArchitectureStyle,
  s: Settlement,
  rng: Rng,
  R: number,
  buildings: Building[],
  streets: Layout['streets'],
  graph: StreetGraph,
  plazas: Layout['plazas'],
  lights: [number, number][],
  spacing: number,
  avoid?: (x: number, z: number) => boolean,
): Layout {
  // Landmarks replace buildings at notable positions.
  const landmarks: PlacedLandmark[] = [];
  s.landmarks.forEach((lm, i) => {
    // the first landmark stands at the centre of the main plaza
    let x = style === 'frontier' ? 0 : plazas[0]?.x ?? 0,
      z = style === 'frontier' ? 0 : plazas[0]?.z ?? 0;
    const radius = landmarkRadius(lm.kind);
    // stadiums, arenas and other whole-block landmarks are kept: a landmark that would land on one
    // looks for another spot instead
    const big = buildings.filter((b) => b.kind === 'stadium' || b.kind === 'arena' || b.kind === 'mosque' || b.kind === 'temple' || b.kind === 'church' || b.kind === 'mall');
    const onBig = (x: number, z: number) => big.some((b) => Math.abs(b.x - x) < b.w / 2 + radius + 4 && Math.abs(b.z - z) < b.d / 2 + radius + 4);
    if (i > 0 || style === 'frontier') {
      for (let tries = 0; tries < 30; tries++) {
        const a = rng.range(0, Math.PI * 2);
        const r = i === 0 ? 0 : R * rng.range(0.35, 0.7);
        x = Math.round((Math.cos(a) * r) / spacing) * spacing + spacing / 2;
        z = Math.round((Math.sin(a) * r) / spacing) * spacing + spacing / 2;
        if (i === 0) {
          x = 0;
          z = 0;
        }
        if (!onBig(x, z) && !(avoid && avoid(x, z))) break;
      }
    }
    for (let k = buildings.length - 1; k >= 0; k--) {
      const b = buildings[k];
      if (b.kind === 'stadium' || b.kind === 'arena') continue;
      if (Math.hypot(b.x - x, b.z - z) < radius + Math.max(b.w, b.d) / 2 + 3) buildings.splice(k, 1);
    }
    landmarks.push({ id: lm.id, name: lm.name, kind: lm.kind, description: lm.description, x, z, radius });
  });
  const colliders: Collider[] = buildings.filter((b) => b.kind !== 'park' && b.kind !== 'mall').map((b) =>
    b.kind === 'dome' || b.kind === 'treehouse' || b.kind === 'pod' || b.kind === 'silo' || b.kind === 'windmill'
      ? { type: 'circle', x: b.x, z: b.z, hw: (b.kind === 'treehouse' ? 2.4 : Math.max(b.w, b.d) / 2) * 0.95, hd: 0 }
      : b.plot?.rot !== undefined
        ? { type: 'circle', x: b.x, z: b.z, hw: Math.min(b.w, b.d) / 2, hd: 0 }
        : { type: 'box', x: b.x, z: b.z, hw: (b.rot ? b.d : b.w) / 2, hd: (b.rot ? b.w : b.d) / 2 },
  );
  for (const b of buildings) if (b.kind === 'mall') colliders.push(...mallColliders(b));
  for (const l of landmarks) if (l.kind !== 'market' && l.kind !== 'garden') colliders.push({ type: 'circle', x: l.x, z: l.z, hw: l.radius * 0.55, hd: 0 });
  const homes = buildings.map((b, i) => (b.role === 'home' ? i : -1)).filter((i) => i >= 0);
  const works = buildings.map((b, i) => (b.role !== 'home' ? i : -1)).filter((i) => i >= 0);
  const parks: [number, number][] = [];
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(R * 0.2, R * 0.95);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (colliders.every((c) => Math.hypot(c.x - x, c.z - z) > 10)) parks.push([x, z]);
  }
  const spawnR = R + 18;
  return {
    style,
    radius: R,
    buildings,
    landmarks,
    streets,
    plazas,
    lights,
    colliders,
    graph,
    spawn: { x: 0, z: spawnR, yaw: 0 },
    homes: homes.length ? homes : [0],
    works: works.length ? works : homes.length ? homes : [0],
    parks,
  };
}

export function generateLayout(s: Settlement): Layout {
  const rng = new Rng(s.layoutSeed);
  if (s.style === 'futuristic') return futuristic(s, rng);
  if (s.style === 'organic') return organic(s, rng);
  return frontier(s, rng);
}

/** Wilderness: no buildings, a few natural points of interest. */
export function wildLayout(planetId: string, regionIndex: number, seed: number, regionName: string): Layout {
  const rng = new Rng(seed + 31);
  const pois: PlacedLandmark[] = [
    { id: `${planetId}:${regionIndex}:monolith`, name: `Monolith of the ${regionName}`, kind: 'monolith', description: 'A weathered stone pillar carved by hands that predate every known civilisation.', x: rng.range(-160, 160), z: rng.range(-160, -60), radius: 8 },
    { id: `${planetId}:${regionIndex}:overlook`, name: `${regionName} Overlook`, kind: 'overlook', description: 'A high vantage point with a view across the whole region.', x: rng.range(-200, 200), z: rng.range(60, 200), radius: 6 },
    { id: `${planetId}:${regionIndex}:grove`, name: 'The Elder Grove', kind: 'grove', description: 'A circle of ancient trees, older than memory.', x: rng.range(80, 200) * (rng.chance(0.5) ? 1 : -1), z: rng.range(-60, 60), radius: 12 },
  ];
  return {
    style: 'wild',
    radius: 0,
    buildings: [],
    landmarks: pois,
    streets: [],
    plazas: [],
    lights: [],
    colliders: pois.filter((p) => p.kind === 'monolith').map((p) => ({ type: 'circle' as const, x: p.x, z: p.z, hw: 3, hd: 0 })),
    graph: { nodes: [], edges: [], adj: [] },
    spawn: { x: 0, z: 40, yaw: 0 },
    homes: [],
    works: [],
    parks: [],
  };
}

/** Push a point out of colliders (player/NPC collision). */
export function resolveCollisions(colliders: Collider[], x: number, z: number, r: number): [number, number] {
  for (const c of colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.hw + r;
      if (d < min && d > 1e-6) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    } else {
      const dx = x - c.x;
      const dz = z - c.z;
      const px = c.hw + r - Math.abs(dx);
      const pz = c.hd + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) x += Math.sign(dx || 1) * px;
        else z += Math.sign(dz || 1) * pz;
      }
    }
  }
  return [x, z];
}

/** Uniform grid over colliders so per-frame collision checks only touch nearby shapes. */
export interface ColliderGrid {
  cell: number;
  cells: Map<number, Collider[]>;
  count: number;
}

export function buildColliderGrid(colliders: Collider[], cell = 16): ColliderGrid {
  const cells = new Map<number, Collider[]>();
  for (const c of colliders) {
    const r = Math.max(c.hw, c.hd);
    for (let gx = Math.floor((c.x - r) / cell); gx <= Math.floor((c.x + r) / cell); gx++) {
      for (let gz = Math.floor((c.z - r) / cell); gz <= Math.floor((c.z + r) / cell); gz++) {
        const k = gx * 65536 + gz;
        const list = cells.get(k);
        if (list) list.push(c);
        else cells.set(k, [c]);
      }
    }
  }
  return { cell, cells, count: colliders.length };
}

export function resolveCollisionsGrid(g: ColliderGrid, x: number, z: number, r: number, y?: number): [number, number] {
  const near: Collider[] = [];
  for (let gx = Math.floor((x - r) / g.cell); gx <= Math.floor((x + r) / g.cell); gx++) {
    for (let gz = Math.floor((z - r) / g.cell); gz <= Math.floor((z + r) / g.cell); gz++) {
      const list = g.cells.get(gx * 65536 + gz);
      if (list) for (const c of list) if (!near.includes(c) && !(y !== undefined && c.top !== undefined && y > c.top - 0.3)) near.push(c);
    }
  }
  return resolveCollisions(near, x, z, r);
}

/**
 * True when nothing in `buildings` blocks the straight line from a to b.
 * Footprints are boxes (or discs for rotated buildings) standing on `ground`.
 * Used to hide name labels of people standing behind a building.
 */
export function lineOfSight(buildings: Building[], ground: (x: number, z: number) => number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(len / 1.5));
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minZ = Math.min(az, bz);
  const maxZ = Math.max(az, bz);
  // only buildings whose bounds touch the segment's bounding box can block it
  const near = buildings.filter((b) => {
    const r = Math.max(b.w, b.d) * 0.75;
    return b.x + r > minX && b.x - r < maxX && b.z + r > minZ && b.z - r < maxZ;
  });
  if (!near.length) return true;
  const base = near.map((b) => ground(b.x, b.z));
  // skip the ends: a person standing in a doorway is not hidden by their own wall
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const x = ax + (bx - ax) * f;
    const z = az + (bz - az) * f;
    const y = ay + (by - ay) * f;
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      const inside = b.rot ? Math.hypot(x - b.x, z - b.z) < Math.min(b.w, b.d) / 2 : Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2;
      if (inside && y < base[k] + b.h) return false;
    }
  }
  return true;
}

/**
 * Move a wild layout's spawn point and landmarks onto dry, walkable ground: the
 * layout is generated without terrain, so a monolith could otherwise stand in a lake.
 */
export function groundWildLayout(l: Layout, t: { height: (x: number, z: number) => number; slope: (x: number, z: number) => number; waterLevel: number | null }): Layout {
  const dry = (x: number, z: number, maxSlope: number) => (t.waterLevel === null || t.height(x, z) > t.waterLevel + 1) && t.slope(x, z) < maxSlope;
  const nearest = (x0: number, z0: number, maxSlope: number, step: number): [number, number] => {
    if (dry(x0, z0, maxSlope)) return [x0, z0];
    for (let r = step; r < 300; r += step) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + r * 0.05;
        const x = x0 + Math.cos(a) * r;
        const z = z0 + Math.sin(a) * r;
        if (dry(x, z, maxSlope)) return [x, z];
      }
    }
    return [x0, z0];
  };
  const [sx, sz] = nearest(l.spawn.x, l.spawn.z, 0.45, 12);
  const landmarks = l.landmarks.map((p) => {
    // keep landmarks clear of the arrival point too
    const [x, z] = nearest(p.x, p.z, 0.6, 8);
    return { ...p, x, z };
  });
  const colliders = l.colliders.map((c) => {
    const m = l.landmarks.findIndex((p) => p.kind === 'monolith' && p.x === c.x && p.z === c.z);
    return m >= 0 ? { ...c, x: landmarks[m].x, z: landmarks[m].z } : c;
  });
  return { ...l, spawn: { ...l.spawn, x: sx, z: sz }, landmarks, colliders };
}
