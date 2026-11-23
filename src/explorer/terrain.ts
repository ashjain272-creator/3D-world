import { createNoise2D } from 'simplex-noise';
import { Rng, clamp, hashInts } from '../sim/rng';
import type { Biome, Planet } from '../sim/types';

export const WORLD_SIZE = 720;
export const TERRAIN_RES = 144;

export interface BiomeLook {
  amplitude: number;
  roughness: number;
  water: number | null; // water level height or null
  low: string;
  mid: string;
  high: string;
  cliff: string;
  sand: string;
  vegetation: 'conifer' | 'broadleaf' | 'jungle' | 'cactus' | 'sparse' | 'none';
  density: number;
  grassColor: string;
  /** Snow cover 0..1: flat ground whitens and foliage gets snow on top. */
  snow?: number;
  /** Lakes are frozen over (walkable ice). */
  frozen?: boolean;
}

const LOOKS: Record<Biome, BiomeLook> = {
  grassland: { amplitude: 14, roughness: 0.5, water: -2.5, low: '#5d8a3e', mid: '#6f9848', high: '#8a8f5c', cliff: '#7a6f60', sand: '#c8b98a', vegetation: 'broadleaf', density: 0.45, grassColor: '#79a24a' },
  forest: { amplitude: 22, roughness: 0.55, water: -3, low: '#3f6b33', mid: '#4b7a3a', high: '#6b7356', cliff: '#6e665c', sand: '#bfae80', vegetation: 'conifer', density: 1, grassColor: '#4f7f3a' },
  jungle: { amplitude: 26, roughness: 0.6, water: -2, low: '#2f6a2c', mid: '#3a7d33', high: '#56703e', cliff: '#5a5a48', sand: '#b8a874', vegetation: 'jungle', density: 1.1, grassColor: '#3d8a33' },
  coast: { amplitude: 12, roughness: 0.45, water: 0.5, low: '#c9b98a', mid: '#7a9a50', high: '#6f8a4a', cliff: '#8a7a68', sand: '#ddc995', vegetation: 'broadleaf', density: 0.4, grassColor: '#86a654' },
  desert: { amplitude: 18, roughness: 0.38, water: null, low: '#d8aa6a', mid: '#e2ba80', high: '#c88c56', cliff: '#a8643e', sand: '#e8c890', vegetation: 'cactus', density: 0.32, grassColor: '#b8a060' },
  tundra: { amplitude: 14, roughness: 0.5, water: -3, low: '#8a9078', mid: '#9aa088', high: '#c8ccbe', cliff: '#6e6a64', sand: '#b0aa94', vegetation: 'sparse', density: 0.3, grassColor: '#8f9a74', snow: 0.45 },
  ice: { amplitude: 34, roughness: 0.6, water: -4, low: '#d4e2ee', mid: '#e8f0f6', high: '#ffffff', cliff: '#6e7e90', sand: '#dfe8f0', vegetation: 'sparse', density: 0.15, grassColor: '#4f6a5a', snow: 1, frozen: true },
  mountain: { amplitude: 60, roughness: 0.62, water: -6, low: '#5f7346', mid: '#7a7a68', high: '#c8c8c8', cliff: '#6a645c', sand: '#a89a80', vegetation: 'conifer', density: 0.5, grassColor: '#62774a' },
  volcanic: { amplitude: 30, roughness: 0.6, water: null, low: '#2a2422', mid: '#3a302c', high: '#4a3c34', cliff: '#1e1a18', sand: '#3c3430', vegetation: 'none', density: 0, grassColor: '#3a302c' },
  wasteland: { amplitude: 16, roughness: 0.5, water: null, low: '#8a7a64', mid: '#9a8a70', high: '#a8987c', cliff: '#6e6050', sand: '#b0a088', vegetation: 'sparse', density: 0.1, grassColor: '#9a8a70' },
  ocean: { amplitude: 8, roughness: 0.4, water: 2, low: '#c9b98a', mid: '#a0a070', high: '#7a8a5a', cliff: '#8a7a68', sand: '#ddc995', vegetation: 'broadleaf', density: 0.25, grassColor: '#8aa060' },
};

export function biomeLook(b: Biome, planet: Planet): BiomeLook {
  const base = { ...LOOKS[b] };
  // Arctic and cold worlds frost the palette; desert worlds dry it.
  const temp = planet.baseTemperature + planet.environment.temperatureOffset;
  if (temp < -10 && b !== 'ice') {
    base.mid = '#d8e2ea';
    base.high = '#f4f8fb';
    base.low = mixHex(base.low, '#dfe8ef', 0.6);
    // evergreen foliage stays dark green under its snow; lakes freeze instead of vanishing
    base.grassColor = mixHex(base.grassColor, '#3f5a48', 0.5);
    base.snow = 1;
    base.frozen = base.water !== null;
    if (base.vegetation === 'broadleaf' || base.vegetation === 'jungle') base.vegetation = 'conifer';
  }
  if (planet.type === 'volcanic' || planet.type === 'barren') base.water = null;
  return base;
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

export interface TerrainData {
  size: number;
  res: number;
  heights: Float32Array; // (res+1)^2
  look: BiomeLook;
  waterLevel: number | null;
  flatRadius: number;
  /** Coastal cities: the sea lies at z below this. */
  coastZ?: number;
  /** Flattened rectangles beyond the city (an airfield). */
  flats?: FlatRect[];
  flatHeight: number;
  seed: number;
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  /** Optional walkable mask (floating platforms): moves onto false points are refused. */
  walkable?: (x: number, z: number) => boolean;
}

/**
 * Generate a local heightfield for a region. Deterministic per planet+region.
 * A circular zone around the origin is flattened for settlements.
 */
export interface FlatRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** True where (x, z) lies on one of the terrain's flattened rectangles (an airfield), with a margin. */
export function inFlat(t: Pick<TerrainData, 'flats'>, x: number, z: number, pad = 0): boolean {
  return !!t.flats?.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad);
}

export function generateTerrain(planet: Planet, regionIndex: number, biome: Biome, flatRadius: number, coastZ?: number, flats?: FlatRect[]): TerrainData {
  const seed = hashInts(planet.seed, regionIndex, 77);
  const rng = new Rng(seed);
  const n2 = createNoise2D(() => rng.next());
  const look = biomeLook(biome, planet);
  // big district cities need more room before the framing mountains begin; the grid grows with
  // the area so detail per metre stays the same
  // an airfield behind the city needs more room still
  const size = flats?.length ? Math.max(1640, Math.ceil((Math.max(...flats.map((r) => Math.max(Math.abs(r.x0), Math.abs(r.x1), Math.abs(r.z0), Math.abs(r.z1)))) + 330) / 0.47 / 2 / 20) * 40) : flatRadius > 450 ? 1640 : flatRadius > 300 ? 1200 : flatRadius > 240 ? 960 : WORLD_SIZE;
  // the grid grows with the map, but beyond the city the ground is countryside and mountains: cap it
  // so a large map (an airport behind the capital) does not double the terrain's triangles
  const res = Math.min(352, Math.round((TERRAIN_RES * size) / WORLD_SIZE));
  const heights = new Float32Array((res + 1) * (res + 1));
  const ridged = biome === 'mountain' || biome === 'volcanic';
  const dunes = biome === 'desert';
  const raw = (x: number, z: number) => {
    let a = 1,
      f = 1 / 260,
      s = 0,
      norm = 0;
    for (let o = 0; o < 5; o++) {
      let v = n2(x * f, z * f);
      if (ridged && o < 3) v = 1 - Math.abs(v) * 2;
      s += v * a;
      norm += a;
      a *= look.roughness;
      f *= 2.1;
    }
    let h = (s / norm) * look.amplitude;
    if (dunes) {
      // transverse dunes: asymmetric crests (gentle windward slope, steep slip face) that
      // meander and break up, with small ripples on top and rocky outcrops poking through
      const warp = n2(x / 140, z / 140) * 90;
      const ph = (x * 0.8 + z * 0.35 + warp) / 34;
      const saw = ph - Math.floor(ph);
      const crest = saw < 0.7 ? saw / 0.7 : (1 - saw) / 0.3;
      const strength = 0.55 + 0.45 * n2(x / 210 + 9, z / 210 - 4);
      const c2 = crest * crest * (3 - 2 * crest);
      h = h * 0.45 + c2 * 6.5 * Math.max(0, strength) + Math.sin((x + z * 0.4) / 9 + warp * 0.05) * 0.4;
      // outcrops: ridged rock that rises out of the sand in a few places
      const rock = 1 - Math.abs(n2(x / 75 - 30, z / 75 + 12)) * 2;
      // flat-topped buttes rather than spikes
      if (rock > 0.6) h += Math.min((rock - 0.6) * 60, 8 + 4 * n2(x / 40, z / 40));
      // playa: flat, cracked clay basins
      const basin = n2(x / 180 + 50, z / 180 - 50);
      if (basin > 0.45) h = h * (1 - Math.min(1, (basin - 0.45) * 5)) + (basin - 0.45) * -6;
    }
    if (biome === 'ice' || biome === 'tundra') {
      // wind-sculpted snow drifts
      h += Math.pow(Math.max(0, n2(x / 60 + 3, z / 22)), 2) * 3;
    }
    // Edge mountains frame the playable area.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (size / 2);
    if (edge > 0.72) h += Math.pow((edge - 0.72) / 0.28, 2) * look.amplitude * 1.6 + 8;
    return h;
  };
  // Settlement plateau height = average around centre, kept above water.
  let flatHeight = 0;
  for (let i = 0; i < 16; i++) flatHeight += raw(Math.cos(i) * flatRadius * 0.5, Math.sin(i) * flatRadius * 0.5);
  flatHeight /= 16;
  if (look.water !== null) flatHeight = Math.max(flatHeight, look.water + 2.5);
  const shaped = (x: number, z: number) => {
    const h = raw(x, z);
    if (flatRadius <= 0) return h;
    const d = Math.sqrt(x * x + z * z);
    let t = clamp((d - flatRadius) / 70, 0, 1);
    let nearFlat = Infinity;
    if (flats)
      for (const r of flats) {
        const dx = Math.max(r.x0 - x, 0, x - r.x1);
        const dz = Math.max(r.z0 - z, 0, z - r.z1);
        nearFlat = Math.min(nearFlat, Math.hypot(dx, dz));
        t = Math.min(t, clamp(Math.hypot(dx, dz) / 70, 0, 1));
      }
    const s = t * t * (3 - 2 * t);
    let land = flatHeight + (h - flatHeight) * s;
    // around an airfield the ground stays above the water table, so no lake opens beside the runway
    if (nearFlat < 500 && look.water !== null) land = Math.max(land, look.water + 1.2 + Math.max(0, 1 - nearFlat / 260) * (flatHeight - look.water - 1.2));
    if (coastZ === undefined) return land;
    // a coastal city: the ground shelves away beyond the shoreline under a sea that reaches the horizon
    const c = clamp((coastZ + 4 - z) / 14, 0, 1);
    const sea = flatHeight - 4 - Math.max(0, coastZ - z) * 0.02;
    return land + (Math.min(land, sea) - land) * c * c * (3 - 2 * c);
  };
  const step = size / res;
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      heights[j * (res + 1) + i] = shaped(-size / 2 + i * step, -size / 2 + j * step);
    }
  }
  const height = (x: number, z: number) => {
    const fx = clamp((x + size / 2) / step, 0, res - 0.001);
    const fz = clamp((z + size / 2) / step, 0, res - 0.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const r = res + 1;
    const h00 = heights[j * r + i];
    const h10 = heights[j * r + i + 1];
    const h01 = heights[(j + 1) * r + i];
    const h11 = heights[(j + 1) * r + i + 1];
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  };
  const slope = (x: number, z: number) => {
    const e = 2;
    const dx = height(x + e, z) - height(x - e, z);
    const dz = height(x, z + e) - height(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  };
  return { size, res, heights, look, waterLevel: look.water, flatRadius, flatHeight, seed, height, slope, coastZ, flats };
}
