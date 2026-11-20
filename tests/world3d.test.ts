import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateLayout, groundWildLayout, lineOfSight, settlementRadius, wildLayout, type Building, type Layout } from '../src/explorer/layout';
import { generateTerrain, type TerrainData } from '../src/explorer/terrain';
import { generateVegetation } from '../src/explorer/vegetation';
import { deckSampler, generateHighways, sampleRoad } from '../src/explorer/roadNetwork';
import { FUT_SPACING, VILLA_STYLES, generateDistricts, villaStyle } from '../src/explorer/districts';
import type { Biome, World } from '../src/sim/types';
import { freshWorld } from './helpers';

const DESERT_KINDS = new Set(['village', 'temple', 'oasis', 'skeleton', 'obelisks', 'hoodoos', 'ruins', 'mesa', 'arch', 'well']);
const FROZEN_KINDS = new Set(['outpost', 'igloo-village', 'ice-cave', 'ice-arch', 'spires', 'igloo', 'ruins', 'tower']);

/** The wild (unsettled) explorer scene for the first region of each requested biome. */
function wildScenes(w: World, biomes: Biome[]): { biome: Biome; t: TerrainData; layout: Layout }[] {
  const out: { biome: Biome; t: TerrainData; layout: Layout }[] = [];
  for (const biome of biomes) {
    for (const p of Object.values(w.planets)) {
      const r = p.regions.find((x) => x.biome === biome && !Object.values(w.settlements).some((s) => s.planetId === p.id && s.regionIndex === x.index));
      if (!r) continue;
      const t = generateTerrain(p, r.index, r.biome, 0);
      out.push({ biome, t, layout: groundWildLayout(wildLayout(p.id, r.index, t.seed, r.name), t) });
      break;
    }
  }
  return out;
}

describe('explorer wilds: vegetation and structures', () => {
  const w = freshWorld();
  const scenes = wildScenes(w, ['forest', 'grassland', 'jungle', 'desert', 'tundra', 'mountain']);

  it('finds wild scenes for most biomes in a fresh universe', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic', () => {
    for (const s of scenes) {
      const a = generateVegetation(s.t, s.layout, 'medium');
      const b = generateVegetation(s.t, s.layout, 'medium');
      expect(Object.keys(a.parts).sort()).toEqual(Object.keys(b.parts).sort());
      for (const k of Object.keys(a.parts) as (keyof typeof a.parts)[]) {
        expect(a.parts[k]!.length).toBe(b.parts[k]!.length);
        if (a.parts[k]!.length) expect(a.parts[k]![0].m.elements).toEqual(b.parts[k]![0].m.elements);
      }
      expect(a.structures.footprints).toEqual(b.structures.footprints);
    }
  });

  it('builds structures that suit the biome', () => {
    for (const s of scenes) {
      const v = generateVegetation(s.t, s.layout, 'medium');
      const kinds = v.structures.footprints.map((f) => f.kind ?? '');
      for (const k of kinds) expect(k.length).toBeGreaterThan(0);
      if (s.t.look.vegetation === 'cactus') for (const k of kinds) expect(DESERT_KINDS.has(k)).toBe(true);
      if ((s.t.look.snow ?? 0) >= 0.45) {
        for (const k of kinds) expect(FROZEN_KINDS.has(k)).toBe(true);
        // a campfire in the igloo village smokes
        if (kinds.includes('igloo-village')) expect(v.structures.smoke.length).toBeGreaterThan(0);
      }
      // every collider of a structure sits inside one of the footprints (nothing stray in the open)
      for (const c of v.structures.colliders) expect(v.structures.footprints.some((f) => Math.hypot(f.x - c.x, f.z - c.z) <= f.r + 16)).toBe(true);
    }
  });

  it('puts the spawn point and landmarks on dry ground', () => {
    for (const s of scenes) {
      if (s.t.waterLevel === null) continue;
      expect(s.t.height(s.layout.spawn.x, s.layout.spawn.z)).toBeGreaterThan(s.t.waterLevel + 1);
      for (const l of s.layout.landmarks) expect(s.t.height(l.x, l.z)).toBeGreaterThan(s.t.waterLevel + 1);
      const mono = s.layout.landmarks.find((l) => l.kind === 'monolith')!;
      expect(s.layout.colliders.some((c) => c.x === mono.x && c.z === mono.z)).toBe(true);
    }
  });

  it('keeps the spawn point clear of structures and trees', () => {
    for (const s of scenes) {
      const v = generateVegetation(s.t, s.layout, 'medium');
      for (const f of v.structures.footprints) expect(Math.hypot(f.x - s.layout.spawn.x, f.z - s.layout.spawn.z)).toBeGreaterThan(f.r + 20);
      // no tree or rock collider overlaps the player at spawn
      for (const c of v.colliders) {
        const d = c.type === 'circle' ? Math.hypot(c.x - s.layout.spawn.x, c.z - s.layout.spawn.z) - c.hw : Math.max(Math.abs(c.x - s.layout.spawn.x) - c.hw, Math.abs(c.z - s.layout.spawn.z) - c.hd);
        expect(d).toBeGreaterThan(0.6);
      }
    }
  });
});

describe('explorer road network', () => {
  const w = freshWorld();
  const city = Object.values(w.settlements).find((s) => generateLayout(s).style === 'futuristic')!;
  const layout = generateLayout(city);
  const p = w.planets[city.planetId];
  const t = generateTerrain(p, city.regionIndex, p.regions[city.regionIndex].biome, settlementRadius(city) + 20);
  const hw = generateHighways(layout, t)!;

  it('only futuristic cities get highways', () => {
    const other = Object.values(w.settlements).find((s) => generateLayout(s).style !== 'futuristic')!;
    const op = w.planets[other.planetId];
    const ot = generateTerrain(op, other.regionIndex, op.regions[other.regionIndex].biome, settlementRadius(other) + 20);
    expect(generateHighways(generateLayout(other), ot)).toBeNull();
    expect(hw).not.toBeNull();
  });

  it('stacks a ring road, two expressways and ramps on pillars', () => {
    const count = (k: string) => hw.roads.filter((r) => r.kind === k).length;
    expect(count('ring')).toBe(1);
    expect(count('express')).toBe(2);
    expect(count('ramp')).toBe(4);
    expect(hw.pillars.length).toBeGreaterThan(10);
    const ring = hw.roads.find((r) => r.kind === 'ring')!;
    expect(ring.closed).toBe(true);
    // expressways run on different levels so they can cross
    const [e1, e2] = hw.roads.filter((r) => r.kind === 'express');
    const mid = (r: typeof e1) => r.pts[Math.floor(r.pts.length / 2)].y;
    expect(Math.abs(mid(e1) - mid(e2))).toBeGreaterThan(4);
    // every pillar collider knows how tall it is, so walkers on a deck pass over it
    for (const c of hw.colliders) expect(c.top!).toBeGreaterThan(t.height(c.x, c.z) + 2);
  });

  it('samples positions along a road and wraps closed loops', () => {
    const ring = hw.roads.find((r) => r.kind === 'ring')!;
    const total = ring.dist[ring.dist.length - 1];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    sampleRoad(ring, 5, a);
    sampleRoad(ring, total + 5, b);
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
    const ramp = hw.roads.find((r) => r.kind === 'ramp')!;
    sampleRoad(ramp, -50, a);
    expect(a.distanceTo(ramp.pts[0])).toBeLessThan(1e-6);
  });

  it('gives walkers a deck surface and a median barrier', () => {
    const decks = deckSampler(hw.roads);
    const e = hw.roads.find((r) => r.kind === 'express')!;
    const i = Math.floor(e.pts.length / 2);
    const a = e.pts[i];
    const b = e.pts[i + 1];
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const h = (a.y + b.y) / 2;
    // standing on the deck: the surface is under the feet
    expect(decks.surface(cx + 0.01, cz + 0.01, h)).toBeCloseTo(h, 0);
    // walking at street level underneath: the deck overhead is not a floor
    expect(decks.surface(cx, cz, t.flatHeight)).toBeNull();
    // the central barrier blocks on a two-way deck, the lanes beside it do not
    expect(decks.blocked(cx, cz, h)).toBe(true);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const sx = cx + (-dz / len) * 3;
    const sz = cz + (dx / len) * 3;
    expect(decks.blocked(sx, sz, h)).toBe(false);
    expect(decks.surface(sx, sz, h)).not.toBeNull();
    // beyond the barriers there is no deck
    const ox = cx + (-dz / len) * (e.width / 2 + 2);
    const oz = cz + (dx / len) * (e.width / 2 + 2);
    expect(decks.surface(ox, oz, h)).toBeNull();
  });
});

describe('line of sight', () => {
  const b: Building = { x: 0, z: 0, w: 10, d: 10, h: 20, rot: 0, kind: 'block', role: 'work', tone: 0.5, door: [0, 5] };
  const flat = () => 0;
  it('is blocked by a building in between', () => {
    expect(lineOfSight([b], flat, -20, 2, 0, 20, 2, 0)).toBe(false);
  });
  it('is clear beside or above the building', () => {
    expect(lineOfSight([b], flat, -20, 2, 12, 20, 2, 12)).toBe(true);
    expect(lineOfSight([b], flat, -20, 40, 0, 20, 40, 0)).toBe(true);
    expect(lineOfSight([], flat, -20, 2, 0, 20, 2, 0)).toBe(true);
  });
});

describe('futuristic districts', () => {
  const w = freshWorld();
  const cities = Object.values(w.settlements).filter((s) => generateLayout(s).style === 'futuristic');

  it('zones large futuristic cities into downtown, villas, souk and mixed districts', () => {
    const big = cities.filter((s) => s.kind === 'capital' || s.kind === 'city');
    expect(big.length).toBeGreaterThan(0);
    for (const s of big) {
      const l = generateLayout(s);
      const kinds = new Set(l.buildings.map((b) => b.kind));
      for (const k of ['villa', 'shop', 'mosque']) expect(kinds.has(k as never)).toBe(true);
      // every building knows its district, and the kinds match the district
      for (const b of l.buildings) {
        expect(b.district).toBeDefined();
        if (b.kind === 'villa') expect(b.district).toBe('villas');
        if (b.kind === 'shop') expect(b.district).toBe('souk');
        if (b.kind === 'supertall') expect(b.district).toBe('downtown');
      }
      // at most one each of the whole-block landmarks
      for (const k of ['mall', 'mosque', 'temple']) expect(l.buildings.filter((b) => b.kind === k).length).toBeLessThanOrEqual(1);
    }
  });

  it('builds every villa style, a souk, worship sites and pools deterministically', () => {
    const s = cities.find((c) => c.kind === 'capital') ?? cities[0];
    const l = generateLayout(s);
    const a = generateDistricts(l, 0, true);
    const b = generateDistricts(l, 0, true);
    expect(a.pieces.length).toBe(b.pieces.length);
    expect(a.pieces[10].m.elements).toEqual(b.pieces[10].m.elements);
    expect(a.pieces.length).toBeGreaterThan(500);
    // pools and fountains are lit at night
    expect(a.lights.length).toBeGreaterThanOrEqual(l.buildings.filter((x) => x.kind === 'villa').length);
    // palms only on warm worlds
    expect(a.pieces.some((p) => p.shape === 'fronds')).toBe(true);
    expect(generateDistricts(l, 0, false).pieces.some((p) => p.shape === 'fronds')).toBe(false);
    // villa pieces stay inside their plot (the street block)
    for (const v of l.buildings.filter((x) => x.kind === 'villa')) {
      const px = Math.floor(v.x / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2;
      const pz = Math.floor(v.z / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2;
      const own = a.pieces.filter((p) => Math.abs(p.x - px) < FUT_SPACING / 2 && Math.abs(p.z - pz) < FUT_SPACING / 2);
      for (const p of own) expect(Math.max(Math.abs(p.x - px), Math.abs(p.z - pz))).toBeLessThan(12.2);
    }
  });

  it('spreads mansions over all five styles across the universe', () => {
    const styles = new Set<string>();
    for (const s of cities) for (const b of generateLayout(s).buildings) if (b.kind === 'villa') styles.add(villaStyle(b));
    expect(styles).toEqual(new Set(VILLA_STYLES));
  });

  it('leaves other styles alone', () => {
    const other = Object.values(w.settlements).find((s) => generateLayout(s).style !== 'futuristic')!;
    expect(generateDistricts(generateLayout(other), 0, true).pieces.length).toBe(0);
  });
});
