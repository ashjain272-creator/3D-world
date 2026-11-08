import { describe, expect, it } from 'vitest';
import { generateUniverse } from '../src/sim/generate/universe';
import { hasSurface } from '../src/sim/generate/cosmos';
import { stripVolatile } from './helpers';

describe('universe generation', () => {
  const { world, report } = generateUniverse('generation-test');

  it('meets the minimum content targets', () => {
    expect(world.galaxy.name.length).toBeGreaterThan(0);
    expect(report.systems).toBeGreaterThanOrEqual(3);
    expect(report.planets).toBeGreaterThanOrEqual(5);
    expect(report.civilizations).toBeGreaterThanOrEqual(2);
    expect(report.settlements).toBeGreaterThan(report.civilizations);
    expect(report.inhabitants).toBeGreaterThanOrEqual(50);
    const types = new Set(Object.values(world.planets).map((p) => p.type));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  it('gives every star and planet meaningful attributes', () => {
    for (const s of Object.values(world.systems)) {
      expect(s.star.name).toBeTruthy();
      expect('OBAFGKM').toContain(s.star.spectralClass);
      expect(s.star.temperature).toBeGreaterThan(2000);
      expect(s.star.age).toBeGreaterThan(0);
      expect(s.planetIds.length).toBeGreaterThan(0);
    }
    for (const p of Object.values(world.planets)) {
      expect(p.gravity).toBeGreaterThan(0);
      expect(p.climate).toBeTruthy();
      expect(p.atmosphere.composition).toBeTruthy();
      expect(world.systems[p.systemId].planetIds).toContain(p.id);
      if (hasSurface(p.type)) expect(p.regions.length).toBeGreaterThan(0);
    }
  });

  it('builds connected, consistent civilisations', () => {
    const civs = Object.values(world.civs);
    const homeworlds = new Map<string, number>();
    for (const c of civs) {
      homeworlds.set(c.homeworldId, (homeworlds.get(c.homeworldId) ?? 0) + 1);
      expect(c.culture.traditions.length).toBeGreaterThan(0);
      expect(c.background.length).toBeGreaterThan(40);
      expect(c.government.leaderId).toBeTruthy();
      const leader = world.characters[c.government.leaderId!];
      expect(leader.civId).toBe(c.id);
      expect(c.tech.known.length).toBeGreaterThan(3);
      for (const sid of c.settlementIds) {
        const s = world.settlements[sid];
        expect(s.civId).toBe(c.id);
        expect(world.planets[s.planetId].regions[s.regionIndex].ownerCivId).toBe(c.id);
        expect(world.planets[s.planetId].civIds).toContain(c.id);
      }
    }
    // at least one planet hosts multiple civilisations
    expect([...homeworlds.values()].some((n) => n >= 2)).toBe(true);
    // distinct cultures
    expect(new Set(civs.map((c) => c.culture.architecture)).size).toBe(civs.length);
  });

  it('creates individuals with full inner lives', () => {
    for (const ch of Object.values(world.characters)) {
      expect(world.civs[ch.civId]).toBeDefined();
      expect(world.settlements[ch.settlementId]).toBeDefined();
      expect(ch.givenName).toBeTruthy();
      expect(Object.keys(ch.skills).length).toBe(10);
      expect(ch.memories.length).toBeGreaterThan(0);
      for (const [id, r] of Object.entries(ch.relationships)) {
        expect(world.characters[id]).toBeDefined();
        expect(r.affinity).toBeGreaterThanOrEqual(-100);
        expect(r.affinity).toBeLessThanOrEqual(100);
      }
    }
    const withRels = Object.values(world.characters).filter((c) => Object.keys(c.relationships).length > 0);
    expect(withRels.length / Object.keys(world.characters).length).toBeGreaterThan(0.6);
  });

  it('writes a founding chronicle', () => {
    expect(world.events.some((e) => e.category === 'founding' && e.importance === 5)).toBe(true);
    expect(world.events.every((e) => e.cause.length > 0)).toBe(true);
  });

  it('is reproducible from a seed', () => {
    const again = generateUniverse('generation-test').world;
    expect(stripVolatile(again)).toBe(stripVolatile(world));
  });

  it('differs for a different seed', () => {
    const other = generateUniverse('another-seed').world;
    expect(other.galaxy.name + Object.values(other.civs).map((c) => c.name).join()).not.toBe(world.galaxy.name + Object.values(world.civs).map((c) => c.name).join());
  });
});
