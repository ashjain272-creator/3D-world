import { Rng, clamp } from '../sim/rng';
import type { ArchitectureStyle, Landmark, Settlement } from '../sim/types';

export type BuildingKind = 'tower' | 'block' | 'slab' | 'dome' | 'treehouse' | 'pod' | 'house' | 'hall' | 'windmill' | 'silo';

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
}

export function settlementRadius(s: Settlement): number {
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

function futuristic(s: Settlement, rng: Rng): Layout {
  const R = settlementRadius(s);
  const spacing = 36;
  const n = Math.floor(R / spacing);
  const nodes: [number, number][] = [];
  const idx = new Map<string, number>();
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      if (Math.hypot(i, j) * spacing > R + spacing * 0.3) continue;
      idx.set(`${i},${j}`, nodes.length);
      nodes.push([i * spacing, j * spacing]);
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
      if (b !== undefined) {
        edges.push([a, b]);
        streets.push({ a: nodes[a], b: nodes[b], w: (i === 0 && di === 0) || (j === 0 && dj === 0) ? 12 : 8 });
      }
    }
  }
  const buildings: Building[] = [];
  const target = buildingCount(s);
  const cells: [number, number][] = [];
  for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) cells.push([i, j]);
  rng.shuffle(cells);
  const plaza = { x: 0, z: 0, r: 30 };
  for (const [i, j] of cells) {
    const cx = (i + 0.5) * spacing;
    const cz = (j + 0.5) * spacing;
    const dc = Math.hypot(cx, cz);
    if (dc > R - 10 || dc < plaza.r + 4) continue;
    if (buildings.length >= target) break;
    const centrality = 1 - dc / R;
    const lots = rng.chance(0.55) ? 1 : 2;
    for (let l = 0; l < lots; l++) {
      const w = lots === 1 ? rng.range(14, 22) : rng.range(9, 12);
      const d = lots === 1 ? rng.range(14, 22) : rng.range(14, 20);
      const ox = lots === 1 ? 0 : (l === 0 ? -1 : 1) * 6.5;
      const tall = Math.pow(centrality, 1.6);
      const h = rng.range(12, 26) + tall * rng.range(40, 120) * (s.kind === 'capital' ? 1 : 0.7);
      const kind: BuildingKind = h > 55 ? 'tower' : rng.chance(0.4) ? 'slab' : 'block';
      const x = cx + ox;
      const z = cz;
      buildings.push({ x, z, w, d, h, rot: 0, kind, role: centrality > 0.5 ? (rng.chance(0.7) ? 'work' : 'home') : rng.chance(0.65) ? 'home' : 'work', tone: rng.next(), door: [x, cz - spacing / 2 + 0.01] });
    }
  }
  const lights: [number, number][] = nodes.filter(() => rng.chance(0.85));
  return finish('futuristic', s, rng, R, buildings, streets, makeGraph(nodes, edges), [plaza], lights, spacing);
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
): Layout {
  // Landmarks replace buildings at notable positions.
  const landmarks: PlacedLandmark[] = [];
  s.landmarks.forEach((lm, i) => {
    let x = 0,
      z = 0;
    if (i > 0 || style === 'frontier') {
      const a = rng.range(0, Math.PI * 2);
      const r = i === 0 ? 0 : R * rng.range(0.35, 0.7);
      x = Math.round((Math.cos(a) * r) / spacing) * spacing + spacing / 2;
      z = Math.round((Math.sin(a) * r) / spacing) * spacing + spacing / 2;
      if (i === 0) {
        x = 0;
        z = 0;
      }
    }
    const radius = landmarkRadius(lm.kind);
    for (let k = buildings.length - 1; k >= 0; k--) {
      const b = buildings[k];
      if (Math.hypot(b.x - x, b.z - z) < radius + Math.max(b.w, b.d) / 2 + 3) buildings.splice(k, 1);
    }
    landmarks.push({ id: lm.id, name: lm.name, kind: lm.kind, description: lm.description, x, z, radius });
  });
  const colliders: Collider[] = buildings.map((b) =>
    b.kind === 'dome' || b.kind === 'treehouse' || b.kind === 'pod' || b.kind === 'silo' || b.kind === 'windmill'
      ? { type: 'circle', x: b.x, z: b.z, hw: (b.kind === 'treehouse' ? 2.4 : Math.max(b.w, b.d) / 2) * 0.95, hd: 0 }
      : { type: 'box', x: b.x, z: b.z, hw: (b.rot ? b.d : b.w) / 2, hd: (b.rot ? b.w : b.d) / 2 },
  );
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
