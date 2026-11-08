import { describe, expect, it } from 'vitest';
import {
  changeEnvironment,
  createPlanet,
  diplomaticIntervention,
  discoverStarSystem,
  foundSettlement,
  grantTechnology,
  historicalIntervention,
  introduceCivilization,
  introduceDiscovery,
  setGovernment,
} from '../src/sim/interventions';
import { advance } from '../src/sim/engine';
import { hasSurface } from '../src/sim/generate/cosmos';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { civPopulation, getRelation } from '../src/sim/world';
import { freshWorld } from './helpers';

describe('creator interventions', () => {
  it('discovers a star system with planets', () => {
    const w = freshWorld();
    const n = Object.keys(w.systems).length;
    const r = discoverStarSystem(w);
    expect(r.ok).toBe(true);
    expect(Object.keys(w.systems).length).toBe(n + 1);
    expect(w.systems[r.createdId!].planetIds.length).toBeGreaterThanOrEqual(2);
    expect(w.events.at(-1)!.source).toBe('creator');
  });

  it('creates a planet of a requested type', () => {
    const w = freshWorld();
    const sys = Object.values(w.systems)[0];
    const r = createPlanet(w, sys.id, 'ocean');
    expect(r.ok).toBe(true);
    expect(w.planets[r.createdId!].type).toBe('ocean');
  });

  it('introduces a civilisation that the simulation then runs', () => {
    const w = freshWorld();
    const target = Object.values(w.planets).find((p) => hasSurface(p.type) && !p.civIds.length && p.habitability > 0)!;
    const r = introduceCivilization(w, target.id, { architecture: 'organic' });
    expect(r.ok).toBe(true);
    const civ = w.civs[r.createdId!];
    expect(civ.culture.architecture).toBe('organic');
    expect(Object.values(w.characters).filter((c) => c.civId === civ.id).length).toBeGreaterThan(10);
    for (const other of Object.values(w.civs)) if (other.id !== civ.id) expect(getRelation(w, civ.id, other.id)).toBeDefined();
    advance(w, 60 * MINUTES_PER_DAY);
    expect(civ.stats.length).toBeGreaterThan(0);
  });

  it('founds settlements and refuses occupied regions', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[0];
    const planet = w.planets[civ.homeworldId];
    const free = planet.regions.find((r) => !r.ownerCivId && r.biome !== 'ocean')!;
    const r = foundSettlement(w, civ.id, planet.id, free.index);
    expect(r.ok).toBe(true);
    expect(civ.settlementIds).toContain(r.createdId);
    const occupied = w.settlements[civ.settlementIds[0]];
    expect(foundSettlement(w, civ.id, planet.id, occupied.regionIndex).ok).toBe(false);
  });

  it('changes climate and disturbs the environment', () => {
    const w = freshWorld();
    const p = w.planets[Object.values(w.civs)[0].homeworldId];
    expect(changeEnvironment(w, p.id, { kind: 'temperature', delta: -6 }).ok).toBe(true);
    expect(p.environment.temperatureOffset).toBe(-6);
    expect(changeEnvironment(w, p.id, { kind: 'disturbance', name: 'crop blight' }).ok).toBe(true);
    expect(p.environment.climateYield).toBeLessThan(1);
    expect(changeEnvironment(w, p.id, { kind: 'restore' }).ok).toBe(true);
    expect(p.environment.climateYield).toBe(1);
  });

  it('grants technology with its prerequisites', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[1];
    const r = grantTechnology(w, civ.id, 'fusion');
    expect(r.ok).toBe(true);
    for (const t of ['fusion', 'fission', 'computing', 'electrification']) expect(civ.tech.known).toContain(t);
  });

  it('introduces a new discovery and civilisations respond by culture', () => {
    const w = freshWorld();
    const [a, b] = Object.values(w.civs);
    b.knownCivIds.push(a.id);
    b.culture.values = { progress: -1, collectivism: 0, rationalism: -1, militarism: 0, openness: -1 };
    const r = introduceDiscovery(w, a.id, { name: 'Gravitic Lensing', category: 'science', magnitude: 2 });
    expect(r.ok).toBe(true);
    const tech = w.customTechs.at(-1)!;
    expect(a.tech.known).toContain(tech.id);
    expect(b.conditions.unrest_tech).toBeGreaterThan(0);
    const responses = w.events.filter((e) => e.causeIds.includes(r.eventId!));
    expect(responses.length).toBeGreaterThan(0);
  });

  it('brokers alliances and severs them', () => {
    const w = freshWorld();
    const [a, b] = Object.values(w.civs);
    diplomaticIntervention(w, a.id, b.id, 'alliance');
    expect(getRelation(w, a.id, b.id)!.status).toBe('alliance');
    diplomaticIntervention(w, a.id, b.id, 'sever');
    expect(getRelation(w, a.id, b.id)!.treaties).toEqual([]);
  });

  it('a meteor strike devastates a settlement', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[0];
    const before = civPopulation(w, civ);
    const r = historicalIntervention(w, civ.id, 'meteor');
    expect(r.ok).toBe(true);
    expect(civPopulation(w, civ)).toBeLessThan(before);
  });

  it('a coup and a reform install new leadership', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[0];
    const old = civ.government.leaderId;
    historicalIntervention(w, civ.id, 'coup');
    expect(civ.government.leaderId).not.toBe(old);
    const type = civ.government.type === 'Commune' ? 'Republic' : 'Commune';
    expect(setGovernment(w, civ.id, type).ok).toBe(true);
    expect(civ.government.type).toBe(type);
  });
});
