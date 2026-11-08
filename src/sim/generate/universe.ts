import { Rng, hashString } from '../rng';
import { galaxyName } from '../data/names';
import type { Planet, PlanetType, World } from '../types';
import { SCHEMA_VERSION, relationKey } from '../world';
import { generateGalaxy, generatePlanet, generateSystem, galaxyPosition } from './cosmos';
import { generateCivilization } from './society';

export interface GenerationReport {
  systems: number;
  planets: number;
  civilizations: number;
  settlements: number;
  inhabitants: number;
  chronicleEvents: number;
}

export function createEmptyWorld(seed: string): World {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    createdAtReal: 0,
    savedAtReal: 0,
    time: 8 * 60,
    epochYear: 0,
    rngState: hashString(seed),
    nextId: 0,
    galaxy: { name: '', seed: 0, arms: 3, radius: 520, twist: 3, coreColor: '#fff', armColor: '#88f' },
    systems: {},
    planets: {},
    civs: {},
    settlements: {},
    characters: {},
    relations: {},
    events: [],
    firstDiscoveries: {},
    customTechs: [],
    player: { discoveredLandmarkIds: [], visitedSettlementIds: [], conversations: 0, followedCharacterId: null },
    stats: { totalBirths: 0, totalDeaths: 0, ticks: 0 },
  };
}

/** Choose two regions on the planet that are far apart and habitable. */
function distantRegions(planet: Planet, rng: Rng): [number, number] {
  const good = planet.regions.filter((r) => r.fertility > 0.4 && r.biome !== 'ice' && r.biome !== 'ocean');
  const pool = good.length >= 2 ? good : planet.regions;
  let best: [number, number] = [pool[0].index, pool[pool.length - 1].index];
  let bestD = -1;
  for (let i = 0; i < 30; i++) {
    const a = rng.pick(pool);
    const b = rng.pick(pool);
    if (a === b) continue;
    const d = (a.lat - b.lat) ** 2 + (a.lon - b.lon) ** 2 + rng.range(0, 0.05);
    if (d > bestD) {
      bestD = d;
      best = [a.index, b.index];
    }
  }
  return best;
}

function bestRegion(planet: Planet): number {
  return [...planet.regions].sort((a, b) => b.fertility - a.fertility)[0].index;
}

/**
 * Deterministically generate a complete universe from a seed.
 * The same seed always yields an identical World (excluding real-time stamps).
 */
export function generateUniverse(seed: string): { world: World; report: GenerationReport } {
  const world = createEmptyWorld(seed);
  const rng = new Rng(seed);
  world.epochYear = 2800 + rng.int(0, 900);
  world.galaxy = generateGalaxy(rng, galaxyName(rng));

  // ── Home system: a sun-like star with a temperate world shared by two civilisations.
  const home = generateSystem(world, rng.fork('home'), { forcedClass: 'G', position: galaxyPosition(rng, world.galaxy, 220, 300) });
  const homeRng = rng.fork('home-planets');
  const hz = Math.sqrt(home.star.luminosity);
  generatePlanet(world, homeRng, home, { type: rng.chance(0.5) ? 'barren' : 'volcanic', orbit: +(hz * 0.45).toFixed(2), index: 0 });
  const homeworld = generatePlanet(world, homeRng, home, { type: 'terran', orbit: +(hz * 1.0).toFixed(2), inhabited: true, index: 1 });
  generatePlanet(world, homeRng, home, { type: 'arctic', orbit: +(hz * 1.6).toFixed(2), index: 2 });
  generatePlanet(world, homeRng, home, { type: 'gas_giant', orbit: +(hz * 4.2).toFixed(2), index: 3 });
  if (rng.chance(0.6)) generatePlanet(world, homeRng, home, { type: 'ice_giant', orbit: +(hz * 7.5).toFixed(2), index: 4 });

  // ── Neighbour system: an orange dwarf with a desert world.
  const near = generateSystem(world, rng.fork('near'), { forcedClass: 'K', position: galaxyPosition(rng, world.galaxy, 200, 340) });
  const nearRng = rng.fork('near-planets');
  const nhz = Math.sqrt(near.star.luminosity);
  generatePlanet(world, nearRng, near, { type: 'volcanic', orbit: +(nhz * 0.5).toFixed(2), index: 0 });
  const dunes = generatePlanet(world, nearRng, near, { type: 'desert', orbit: +(nhz * 0.95).toFixed(2), inhabited: true, index: 1 });
  generatePlanet(world, nearRng, near, { type: 'gas_giant', orbit: +(nhz * 3.5).toFixed(2), index: 2 });

  // ── Three further systems with colonisable worlds.
  const extraTypes: PlanetType[] = rng.shuffle<PlanetType>(['jungle', 'ocean', 'arctic']);
  for (let i = 0; i < 3; i++) {
    const sys = generateSystem(world, rng.fork(`sys${i}`));
    const pr = rng.fork(`sys${i}-planets`);
    const shz = Math.sqrt(sys.star.luminosity);
    const count = pr.int(2, 4);
    const habitableIndex = pr.int(0, Math.min(1, count - 1));
    for (let j = 0; j < count; j++) {
      if (j === habitableIndex) generatePlanet(world, pr, sys, { type: extraTypes[i], orbit: +(shz * (0.8 + j * 0.3)).toFixed(2), index: j, inhabited: true });
      else generatePlanet(world, pr, sys, { index: j });
    }
  }

  // ── Civilisations
  const [ra, rb] = distantRegions(homeworld, rng);
  const civA = generateCivilization(world, rng.fork('civA'), homeworld, ra, { architecture: 'futuristic', techLevel: 12, characters: 44, population: 3.4e6, settlements: 3 });
  const civB = generateCivilization(world, rng.fork('civB'), homeworld, rb, { architecture: 'organic', techLevel: 9, characters: 36, population: 1.6e6, settlements: 2 });
  const civC = generateCivilization(world, rng.fork('civC'), dunes, bestRegion(dunes), { architecture: 'frontier', techLevel: 8, characters: 32, population: 1.1e6, settlements: 3 });

  // ── Diplomatic relations between every pair
  const civs = [civA, civB, civC];
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const a = civs[i];
      const b = civs[j];
      const samePlanet = a.homeworldId === b.homeworldId;
      const opinion = samePlanet ? Math.round(rng.range(-25, 25)) : 0;
      world.relations[relationKey(a.id, b.id)] = {
        a: a.id,
        b: b.id,
        opinion,
        status: samePlanet ? (opinion > 15 ? 'cordial' : opinion < -15 ? 'tense' : 'neutral') : 'unknown',
        treaties: [],
        tradeVolume: 0,
        incidents: 0,
        history: [],
        contactAt: samePlanet ? -200 * 525600 : null,
      };
      if (samePlanet) {
        a.knownCivIds.push(b.id);
        b.knownCivIds.push(a.id);
      }
    }
  }

  world.events.sort((a, b) => a.t - b.t);
  world.rngState = rng.state;

  const report: GenerationReport = {
    systems: Object.keys(world.systems).length,
    planets: Object.keys(world.planets).length,
    civilizations: Object.keys(world.civs).length,
    settlements: Object.keys(world.settlements).length,
    inhabitants: Object.keys(world.characters).length,
    chronicleEvents: world.events.length,
  };
  return { world, report };
}

export function randomSeed(): string {
  const words = ['aurora', 'ember', 'tide', 'quartz', 'lumen', 'cinder', 'halo', 'nova', 'drift', 'vesper', 'onyx', 'solace', 'zephyr', 'atlas', 'echo'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(Math.random() * 90000 + 10000)}`;
}
