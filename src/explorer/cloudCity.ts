import { Rng } from '../sim/rng';
import type { Planet } from '../sim/types';
import type { Building, Collider, Layout, PlacedLandmark } from './layout';
import { WORLD_SIZE, type TerrainData } from './terrain';

/**
 * Gas and ice giants have no surface, so Explorer visits a floating
 * platform complex in the upper cloud deck: a central hub ringed by satellite
 * platforms joined by sky-bridges. Walkable areas are the decks and bridges;
 * everything else drops away into the cloud sea.
 */
export interface Deck {
  x: number;
  z: number;
  r: number;
}

export interface CloudCity {
  layout: Layout;
  terrain: TerrainData;
  decks: Deck[];
  bridges: { a: [number, number]; b: [number, number]; w: number }[];
}

const CLOUD_LEVEL = -70;

export function generateCloudCity(planet: Planet): CloudCity {
  const rng = new Rng(planet.seed + 404);
  const decks: Deck[] = [{ x: 0, z: 0, r: 62 }];
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const d = rng.range(130, 175);
    decks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: rng.range(26, 40) });
  }
  const bridges = decks.slice(1).map((dk) => ({ a: [0, 0] as [number, number], b: [dk.x, dk.z] as [number, number], w: 7 }));
  // a ring walkway between neighbouring satellites
  for (let i = 1; i < decks.length; i++) {
    const j = i === decks.length - 1 ? 1 : i + 1;
    if (rng.chance(0.6)) bridges.push({ a: [decks[i].x, decks[i].z], b: [decks[j].x, decks[j].z], w: 5 });
  }
  const onDeck = (x: number, z: number, margin = 0) => {
    for (const d of decks) if ((x - d.x) ** 2 + (z - d.z) ** 2 <= (d.r - margin) ** 2) return true;
    for (const b of bridges) {
      const [ax, az] = b.a;
      const [bx, bz] = b.b;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + dx * t;
      const pz = az + dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 <= (b.w / 2 - margin) ** 2) return true;
    }
    return false;
  };

  // buildings: towers on the hub, domes and masts on the satellites
  const buildings: Building[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = rng.range(28, 48);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = rng.range(22, 70);
    buildings.push({ x, z, w: rng.range(8, 12), d: rng.range(8, 12), h, rot: 0, kind: h > 50 ? 'tower' : 'block', role: 'work', tone: rng.next(), door: [x * 0.7, z * 0.7] });
  }
  for (const dk of decks.slice(1)) {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(dk.r * 0.3, dk.r * 0.65);
      const x = dk.x + Math.cos(a) * r;
      const z = dk.z + Math.sin(a) * r;
      const size = rng.range(9, 14);
      buildings.push({ x, z, w: size, d: size, h: size * 0.75, rot: -a, kind: 'dome', role: 'home', tone: rng.next(), door: [dk.x, dk.z] });
    }
  }
  const sat = decks.slice(1);
  const landmarks: PlacedLandmark[] = [
    { id: `${planet.id}:cloud:spire`, name: 'Storm Spire', kind: 'spire', description: 'The hub mast: anchor cables plunge from here into the storms below.', x: 0, z: 0, radius: 12 },
    { id: `${planet.id}:cloud:obs`, name: 'Ring Observatory', kind: 'observatory', description: `Telescopes trained on ${planet.name}'s rings and moons.`, x: sat[0].x, z: sat[0].z, radius: 10 },
    { id: `${planet.id}:cloud:port`, name: 'Skyport', kind: 'spaceport', description: 'Gas haulers dock here to load refined fuel.', x: sat[1 % sat.length].x, z: sat[1 % sat.length].z, radius: 20 },
  ];
  for (let k = buildings.length - 1; k >= 0; k--) {
    const b = buildings[k];
    if (landmarks.some((l) => Math.hypot(l.x - b.x, l.z - b.z) < l.radius + Math.max(b.w, b.d) / 2 + 2)) buildings.splice(k, 1);
  }
  const colliders: Collider[] = buildings.map((b) => (b.kind === 'dome' ? { type: 'circle', x: b.x, z: b.z, hw: b.w / 2, hd: 0 } : { type: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }));
  for (const l of landmarks) if (l.kind !== 'spaceport') colliders.push({ type: 'circle', x: l.x, z: l.z, hw: l.radius * 0.5, hd: 0 });
  const nodes: [number, number][] = decks.map((d) => [d.x, d.z]);
  const edges: [number, number][] = bridges.map((b) => [nodes.findIndex((n) => n[0] === b.a[0] && n[1] === b.a[1]), nodes.findIndex((n) => n[0] === b.b[0] && n[1] === b.b[1])]);
  const adj: number[][] = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const layout: Layout = {
    style: 'cloud',
    radius: 0,
    buildings,
    landmarks,
    streets: bridges,
    plazas: decks,
    lights: decks.flatMap((d) => [0, 1, 2, 3].map((k) => [d.x + Math.cos(k * 1.57) * d.r * 0.92, d.z + Math.sin(k * 1.57) * d.r * 0.92] as [number, number])),
    colliders,
    graph: { nodes, edges, adj },
    spawn: { x: 0, z: decks[0].r - 8, yaw: Math.PI },
    homes: buildings.map((b, i) => (b.role === 'home' ? i : -1)).filter((i) => i >= 0),
    works: buildings.map((b, i) => (b.role === 'work' ? i : -1)).filter((i) => i >= 0),
    parks: decks.slice(1).map((d) => [d.x, d.z] as [number, number]),
  };
  const res = 16;
  const heights = new Float32Array((res + 1) * (res + 1));
  for (let j = 0; j <= res; j++)
    for (let i = 0; i <= res; i++) {
      const x = -WORLD_SIZE / 2 + (i / res) * WORLD_SIZE;
      const z = -WORLD_SIZE / 2 + (j / res) * WORLD_SIZE;
      heights[j * (res + 1) + i] = onDeck(x, z) ? 0 : CLOUD_LEVEL;
    }
  const terrain: TerrainData = {
    size: WORLD_SIZE,
    res,
    heights,
    look: { amplitude: 0, roughness: 0, water: null, low: '#5a6878', mid: '#7a8898', high: '#9aa8b8', cliff: '#4a5868', sand: '#8a98a8', vegetation: 'none', density: 0, grassColor: '#6a7888' },
    waterLevel: null,
    flatRadius: 0,
    flatHeight: 0,
    seed: planet.seed + 404,
    height: (x, z) => (onDeck(x, z) ? 0 : CLOUD_LEVEL),
    slope: () => 0,
    walkable: (x, z) => onDeck(x, z, 0.9),
  };
  return { layout, terrain, decks, bridges };
}

export const CLOUD_SEA_LEVEL = CLOUD_LEVEL;
