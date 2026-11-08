import { Rng, clamp } from '../rng';
import { moonName, planetName, starName } from '../data/names';
import type {
  Biome,
  Galaxy,
  Moon,
  Planet,
  PlanetPalette,
  PlanetType,
  Region,
  ResourceProfile,
  SpectralClass,
  Star,
  StarSystem,
  World,
} from '../types';
import { newId } from '../world';

const SPECTRAL: Record<SpectralClass, { temp: [number, number]; mass: [number, number]; radius: [number, number]; color: string; weight: number }> = {
  O: { temp: [30000, 42000], mass: [16, 40], radius: [6.6, 12], color: '#9bb0ff', weight: 0.2 },
  B: { temp: [10000, 30000], mass: [2.1, 16], radius: [1.8, 6.6], color: '#aabfff', weight: 0.8 },
  A: { temp: [7500, 10000], mass: [1.4, 2.1], radius: [1.4, 1.8], color: '#cad7ff', weight: 1.5 },
  F: { temp: [6000, 7500], mass: [1.04, 1.4], radius: [1.15, 1.4], color: '#f8f7ff', weight: 3 },
  G: { temp: [5200, 6000], mass: [0.8, 1.04], radius: [0.96, 1.15], color: '#fff4ea', weight: 4 },
  K: { temp: [3700, 5200], mass: [0.45, 0.8], radius: [0.7, 0.96], color: '#ffd2a1', weight: 4 },
  M: { temp: [2400, 3700], mass: [0.08, 0.45], radius: [0.2, 0.7], color: '#ffb07a', weight: 3 },
};

export function generateGalaxy(rng: Rng, galaxyName: string): Galaxy {
  const palettes = [
    { core: '#ffe9c4', arm: '#7fb4ff' },
    { core: '#ffdcb0', arm: '#8fd0ff' },
    { core: '#fff1d6', arm: '#a49cff' },
  ];
  const p = rng.pick(palettes);
  return {
    name: galaxyName,
    seed: Math.floor(rng.next() * 1e9),
    arms: rng.int(2, 4),
    radius: 520,
    twist: rng.range(2.6, 3.6),
    coreColor: p.core,
    armColor: p.arm,
  };
}

export function generateStar(rng: Rng, forced?: SpectralClass): Star {
  const classes = Object.keys(SPECTRAL) as SpectralClass[];
  const cls = forced ?? rng.weighted(classes, (c) => SPECTRAL[c].weight);
  const d = SPECTRAL[cls];
  const f = rng.next();
  const temperature = Math.round(d.temp[0] + (d.temp[1] - d.temp[0]) * f);
  const mass = +(d.mass[0] + (d.mass[1] - d.mass[0]) * f).toFixed(2);
  const radius = +(d.radius[0] + (d.radius[1] - d.radius[0]) * f).toFixed(2);
  const luminosity = +(radius * radius * Math.pow(temperature / 5772, 4)).toFixed(3);
  const maxAge = Math.min(13, 10 / Math.pow(mass, 2.5));
  return {
    name: starName(rng),
    spectralClass: cls,
    radius,
    mass,
    temperature,
    luminosity,
    age: +rng.range(Math.min(0.5, maxAge * 0.2), maxAge * 0.85).toFixed(2),
    color: d.color,
  };
}

/** Place a system on a spiral arm. */
export function galaxyPosition(rng: Rng, g: Galaxy, minR = 120, maxR = 440): [number, number, number] {
  const arm = rng.int(0, g.arms - 1);
  const r = rng.range(minR, maxR);
  const theta = (arm / g.arms) * Math.PI * 2 + (r / g.radius) * g.twist + rng.normal(0, 0.12);
  return [Math.cos(theta) * r, rng.normal(0, 6), Math.sin(theta) * r];
}

export function generateSystem(
  world: World,
  rng: Rng,
  opts: { forcedClass?: SpectralClass; position?: [number, number, number]; origin?: StarSystem['origin'] } = {},
): StarSystem {
  const star = generateStar(rng, opts.forcedClass);
  // avoid name collisions
  const names = new Set(Object.values(world.systems).map((s) => s.star.name));
  while (names.has(star.name)) star.name = starName(rng);
  const sys: StarSystem = {
    id: newId(world, 's'),
    name: star.name,
    star,
    position: opts.position ?? galaxyPosition(rng, world.galaxy),
    planetIds: [],
    discoveredAt: world.time,
    origin: opts.origin ?? 'genesis',
  };
  world.systems[sys.id] = sys;
  return sys;
}

const PALETTES: Record<PlanetType, PlanetPalette[]> = {
  terran: [
    { deep: '#0b2a4a', shallow: '#1f5f8b', low: '#3f7d3a', mid: '#6b8f45', high: '#8a7a5a', peak: '#f2f4f7', atmosphere: '#7ab8ff' },
    { deep: '#0a2140', shallow: '#1d6a8f', low: '#2f6e4b', mid: '#7a9a50', high: '#7b6b55', peak: '#eef2f5', atmosphere: '#8cc8ff' },
  ],
  ocean: [{ deep: '#06203f', shallow: '#13608e', low: '#2a8a8a', mid: '#4f9a6a', high: '#8a9a7a', peak: '#e8f0f4', atmosphere: '#6fc2ff' }],
  desert: [
    { deep: '#3a2a1a', shallow: '#7a5a35', low: '#c99a5b', mid: '#d8b07a', high: '#a8744a', peak: '#efd9b5', atmosphere: '#f3c48d' },
    { deep: '#3b1f17', shallow: '#7b3f2a', low: '#c0623b', mid: '#d88a55', high: '#9a5236', peak: '#f0c9a0', atmosphere: '#ffb07a' },
  ],
  arctic: [{ deep: '#13324f', shallow: '#3b6d8f', low: '#a9c4d6', mid: '#d6e4ee', high: '#b3c3cf', peak: '#ffffff', atmosphere: '#bfe3ff' }],
  jungle: [{ deep: '#082c34', shallow: '#13626a', low: '#1f6a2a', mid: '#2f8a32', high: '#4f6a3a', peak: '#c9d6b0', atmosphere: '#9be3b0' }],
  volcanic: [{ deep: '#1a0a08', shallow: '#4a1408', low: '#2a2220', mid: '#3d302a', high: '#ff5a1f', peak: '#ffb347', atmosphere: '#ff7a4a' }],
  barren: [{ deep: '#2a2a2e', shallow: '#3e3d42', low: '#5d5a58', mid: '#7a756e', high: '#99928a', peak: '#c6c0b8', atmosphere: '#9a9aa8' }],
  gas_giant: [
    { deep: '#6a4a2a', shallow: '#a0703f', low: '#d8b07a', mid: '#e8d2a8', high: '#b88a5a', peak: '#f5e6c8', atmosphere: '#f0d6a0' },
    { deep: '#2a3a6a', shallow: '#4a6aa0', low: '#8aa8d8', mid: '#c8d8f0', high: '#6a88c0', peak: '#e8f0ff', atmosphere: '#a8c8ff' },
  ],
  ice_giant: [{ deep: '#13506a', shallow: '#1f7a9a', low: '#4fb0c8', mid: '#8ad8e8', high: '#3a90b0', peak: '#d0f4ff', atmosphere: '#8ae8ff' }],
};

const PLANET_INFO: Record<PlanetType, { climate: string[]; terrain: string[]; atmo: string; pressure: [number, number]; breathable: boolean }> = {
  terran: { climate: ['Temperate with distinct seasons', 'Mild maritime climate', 'Warm temperate'], terrain: ['Continents of plains, forests and mountain chains', 'Rolling hills, river valleys and broad coasts'], atmo: 'Nitrogen–oxygen', pressure: [0.8, 1.3], breathable: true },
  ocean: { climate: ['Humid oceanic with monsoon storms'], terrain: ['A global ocean broken by volcanic archipelagos'], atmo: 'Nitrogen–oxygen, water-rich', pressure: [1.0, 1.8], breathable: true },
  desert: { climate: ['Arid with scorching days and cold nights', 'Hot arid, rare violent storms'], terrain: ['Dune seas, mesas and dry canyons', 'Salt flats and wind-carved plateaus'], atmo: 'Thin nitrogen–CO₂', pressure: [0.4, 0.9], breathable: false },
  arctic: { climate: ['Frigid glacial with brief thaws'], terrain: ['Ice sheets, fjords and frozen tundra'], atmo: 'Cold nitrogen–oxygen', pressure: [0.7, 1.1], breathable: true },
  jungle: { climate: ['Hot and humid year-round'], terrain: ['Dense canopy, swamps and karst towers'], atmo: 'Dense oxygen-rich', pressure: [1.2, 2.0], breathable: true },
  volcanic: { climate: ['Hellish with ash winters'], terrain: ['Basalt plains, lava rivers and calderas'], atmo: 'Sulphurous CO₂', pressure: [2, 30], breathable: false },
  barren: { climate: ['Airless extremes'], terrain: ['Cratered regolith and ancient ridges'], atmo: 'Trace', pressure: [0, 0.02], breathable: false },
  gas_giant: { climate: ['Banded storms and jet streams'], terrain: ['No solid surface; deep cloud layers'], atmo: 'Hydrogen–helium', pressure: [100, 1000], breathable: false },
  ice_giant: { climate: ['Supersonic winds in frozen depths'], terrain: ['No solid surface; methane haze'], atmo: 'Hydrogen–helium–methane', pressure: [100, 1000], breathable: false },
};

const SURFACE_TYPES: PlanetType[] = ['terran', 'ocean', 'desert', 'arctic', 'jungle', 'volcanic', 'barren'];

export function isHabitableType(t: PlanetType): boolean {
  return t === 'terran' || t === 'ocean' || t === 'desert' || t === 'arctic' || t === 'jungle';
}

export function hasSurface(t: PlanetType): boolean {
  return t !== 'gas_giant' && t !== 'ice_giant';
}

function resourceProfile(rng: Rng, type: PlanetType): ResourceProfile {
  const base: Record<PlanetType, ResourceProfile> = {
    terran: { metals: 0.5, energy: 0.5, water: 0.7, organics: 0.8, exotics: 0.15 },
    ocean: { metals: 0.3, energy: 0.4, water: 1, organics: 0.7, exotics: 0.2 },
    desert: { metals: 0.7, energy: 0.8, water: 0.15, organics: 0.25, exotics: 0.35 },
    arctic: { metals: 0.5, energy: 0.4, water: 0.9, organics: 0.3, exotics: 0.3 },
    jungle: { metals: 0.35, energy: 0.4, water: 0.8, organics: 1, exotics: 0.25 },
    volcanic: { metals: 0.9, energy: 0.9, water: 0.05, organics: 0.05, exotics: 0.6 },
    barren: { metals: 0.75, energy: 0.3, water: 0.05, organics: 0, exotics: 0.4 },
    gas_giant: { metals: 0.1, energy: 0.9, water: 0.2, organics: 0, exotics: 0.5 },
    ice_giant: { metals: 0.1, energy: 0.7, water: 0.8, organics: 0, exotics: 0.45 },
  };
  const b = base[type];
  const j = (v: number) => +clamp(v + rng.normal(0, 0.12), 0, 1).toFixed(2);
  return { metals: j(b.metals), energy: j(b.energy), water: j(b.water), organics: j(b.organics), exotics: j(b.exotics) };
}

function biomeFor(type: PlanetType, lat: number, n: number): Biome {
  const a = Math.abs(lat);
  switch (type) {
    case 'terran':
      if (a > 0.82) return 'ice';
      if (a > 0.65) return 'tundra';
      if (n > 0.78) return 'mountain';
      if (n < 0.18) return 'coast';
      if (a < 0.2 && n > 0.45) return 'jungle';
      if (a < 0.35 && n < 0.32) return 'desert';
      return n > 0.5 ? 'forest' : 'grassland';
    case 'ocean':
      if (a > 0.85) return 'ice';
      return n > 0.62 ? (n > 0.85 ? 'mountain' : 'forest') : 'coast';
    case 'desert':
      if (n > 0.78) return 'mountain';
      if (a > 0.8) return 'tundra';
      if (n < 0.14) return 'coast';
      return n > 0.6 ? 'wasteland' : 'desert';
    case 'arctic':
      if (n > 0.72) return 'mountain';
      if (a < 0.3 && n < 0.35) return 'forest';
      return a < 0.5 ? 'tundra' : 'ice';
    case 'jungle':
      if (n > 0.82) return 'mountain';
      if (n < 0.2) return 'coast';
      return a > 0.7 ? 'forest' : 'jungle';
    case 'volcanic':
      return n > 0.5 ? 'volcanic' : 'wasteland';
    default:
      return n > 0.7 ? 'mountain' : 'wasteland';
  }
}

const FERTILITY: Record<Biome, number> = {
  ocean: 0.2, coast: 0.75, grassland: 0.9, forest: 0.7, jungle: 0.65, desert: 0.18, tundra: 0.3, ice: 0.06, mountain: 0.28, volcanic: 0.05, wasteland: 0.08,
};

const REGION_WORDS: Record<Biome, string[]> = {
  ocean: ['Deep', 'Abyss', 'Gulf'],
  coast: ['Coast', 'Shore', 'Bay', 'Strand', 'Delta'],
  grassland: ['Plains', 'Steppe', 'Meadows', 'Fields'],
  forest: ['Woods', 'Forest', 'Weald', 'Groves'],
  jungle: ['Canopy', 'Jungle', 'Mire', 'Tangle'],
  desert: ['Dunes', 'Barrens', 'Sands', 'Erg'],
  tundra: ['Tundra', 'Heath', 'Moor'],
  ice: ['Icefield', 'Glacier', 'Shelf'],
  mountain: ['Peaks', 'Highlands', 'Spires', 'Range'],
  volcanic: ['Calderas', 'Ashlands', 'Flows'],
  wasteland: ['Wastes', 'Flats', 'Scar'],
};
const REGION_PREFIX = ['Northern', 'Southern', 'Eastern', 'Western', 'Amber', 'Silver', 'Hollow', 'Crimson', 'Verdant', 'Pale', 'Iron', 'Whispering', 'Sunken', 'High', 'Far', 'Old', 'Shimmering', 'Cobalt', 'Gilded', 'Misty'];

/** Fibonacci-sphere region layout with nearest-neighbour adjacency. */
export function generateRegions(rng: Rng, type: PlanetType, count: number): Region[] {
  const pts: { lat: number; lon: number; v: [number, number, number] }[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const offset = rng.range(0, Math.PI * 2);
  for (let i = 0; i < count; i++) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i + offset;
    pts.push({ lat: y, lon: Math.atan2(Math.sin(th), Math.cos(th)) / Math.PI, v: [Math.cos(th) * r, y, Math.sin(th) * r] });
  }
  const used = new Set<string>();
  const regions: Region[] = pts.map((p, i) => {
    const n = rng.next();
    const biome = biomeFor(type, p.lat, n);
    let name = '';
    for (let tries = 0; tries < 10; tries++) {
      name = `${rng.pick(REGION_PREFIX)} ${rng.pick(REGION_WORDS[biome])}`;
      if (!used.has(name)) break;
    }
    used.add(name);
    const res = resourceProfile(rng, type);
    if (biome === 'mountain') res.metals = Math.min(1, res.metals + 0.25);
    if (biome === 'volcanic' || biome === 'desert') res.energy = Math.min(1, res.energy + 0.2);
    if (biome === 'forest' || biome === 'jungle') res.organics = Math.min(1, res.organics + 0.2);
    return {
      index: i,
      name,
      biome,
      lat: p.lat,
      lon: p.lon,
      fertility: +clamp(FERTILITY[biome] + rng.normal(0, 0.08), 0.02, 1).toFixed(2),
      resources: res,
      ownerCivId: null,
      neighbors: [],
      explored: false,
    };
  });
  // adjacency: 3–4 nearest
  for (let i = 0; i < count; i++) {
    const d = pts
      .map((q, j) => ({ j, d: (pts[i].v[0] - q.v[0]) ** 2 + (pts[i].v[1] - q.v[1]) ** 2 + (pts[i].v[2] - q.v[2]) ** 2 }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d);
    for (const { j } of d.slice(0, 4)) {
      if (!regions[i].neighbors.includes(j)) regions[i].neighbors.push(j);
      if (!regions[j].neighbors.includes(i)) regions[j].neighbors.push(i);
    }
  }
  return regions;
}

export function pickPlanetType(rng: Rng, star: Star, orbit: number): PlanetType {
  const hz = Math.sqrt(star.luminosity);
  const rel = orbit / hz;
  if (rel > 3.2) return rng.chance(0.55) ? 'gas_giant' : 'ice_giant';
  if (rel > 1.7) return rng.weighted<PlanetType>(['gas_giant', 'ice_giant', 'arctic', 'barren'], (t) => ({ gas_giant: 3, ice_giant: 2, arctic: 1.5, barren: 1 } as Record<string, number>)[t]);
  if (rel > 1.15) return rng.weighted<PlanetType>(['arctic', 'desert', 'barren', 'terran'], (t) => ({ arctic: 3, desert: 1.5, barren: 1.5, terran: 1 } as Record<string, number>)[t]);
  if (rel > 0.75) return rng.weighted<PlanetType>(['terran', 'ocean', 'jungle', 'desert'], (t) => ({ terran: 3, ocean: 2, jungle: 2, desert: 1.5 } as Record<string, number>)[t]);
  if (rel > 0.45) return rng.weighted<PlanetType>(['desert', 'volcanic', 'jungle', 'barren'], (t) => ({ desert: 3, volcanic: 2, jungle: 1, barren: 1.5 } as Record<string, number>)[t]);
  return rng.chance(0.5) ? 'volcanic' : 'barren';
}

export function generatePlanet(
  world: World,
  rng: Rng,
  sys: StarSystem,
  opts: { type?: PlanetType; orbit?: number; inhabited?: boolean; index?: number } = {},
): Planet {
  const index = opts.index ?? sys.planetIds.length;
  const hz = Math.sqrt(sys.star.luminosity);
  const orbit = +(opts.orbit ?? hz * (0.35 + index * 0.55 + rng.range(-0.1, 0.25))).toFixed(2);
  const type = opts.type ?? pickPlanetType(rng, sys.star, orbit);
  const info = PLANET_INFO[type];
  const giant = !hasSurface(type);
  const radius = +(giant ? rng.range(3.5, 11) : rng.range(0.45, 1.6)).toFixed(2);
  const density = giant ? rng.range(0.2, 0.35) : rng.range(0.8, 1.15);
  const gravity = +(radius * density).toFixed(2);
  const pressure = +rng.range(info.pressure[0], info.pressure[1]).toFixed(2);
  const eqTemp = 278 * Math.pow(sys.star.luminosity, 0.25) / Math.sqrt(orbit) - 273;
  const greenhouse = type === 'volcanic' ? rng.range(150, 380) : type === 'barren' ? 0 : Math.log1p(pressure) * 22;
  const typeBias: Partial<Record<PlanetType, number>> = { arctic: -35, desert: 14, jungle: 10, terran: 0, ocean: 2 };
  const baseTemperature = Math.round(isHabitableType(type) ? 15 + (typeBias[type] ?? 0) + rng.normal(0, 4) : eqTemp + greenhouse);
  const regionCount = giant ? 0 : isHabitableType(type) ? 14 : 8;
  const names = new Set(Object.values(world.planets).map((p) => p.name));
  let name = planetName(rng, sys.star.name, index, !!opts.inhabited);
  while (names.has(name)) name = planetName(rng, sys.star.name, index, true);
  const moons: Moon[] = [];
  const moonCount = giant ? rng.int(2, 5) : rng.weighted([0, 1, 2, 3], (n) => [3, 4, 2, 1][n]);
  for (let i = 0; i < moonCount; i++) {
    moons.push({
      name: moonName(rng),
      radius: +rng.range(0.08, giant ? 0.5 : 0.3).toFixed(2),
      orbit: +(2.2 + i * rng.range(1.2, 2.2)).toFixed(2),
      color: rng.pick(['#b8b2a8', '#9c958d', '#d6cfc2', '#a89a88', '#c8d0d8']),
    });
  }
  const habitability = isHabitableType(type)
    ? +clamp(1 - Math.abs(baseTemperature - 16) / 60 - (info.breathable ? 0 : 0.3) - Math.abs(gravity - 1) * 0.3, 0.05, 1).toFixed(2)
    : 0;
  const planet: Planet = {
    id: newId(world, 'p'),
    systemId: sys.id,
    name,
    type,
    orbit,
    orbitalPeriodDays: Math.round(365 * Math.sqrt(Math.pow(orbit, 3) / Math.max(0.08, sys.star.mass))),
    orbitPhase: rng.range(0, Math.PI * 2),
    radius,
    gravity,
    atmosphere: { composition: info.atmo, pressure, breathable: info.breathable },
    baseTemperature,
    climate: rng.pick(info.climate),
    terrain: rng.pick(info.terrain),
    resources: resourceProfile(rng, type),
    moons,
    habitability,
    regions: regionCount ? generateRegions(rng, type, regionCount) : [],
    civIds: [],
    environment: {
      temperatureOffset: 0,
      climateYield: 1,
      disturbanceDays: 0,
      disturbance: null,
      weather: defaultWeather(type),
    },
    palette: rng.pick(PALETTES[type]),
    seed: Math.floor(rng.next() * 1e9),
    axialTilt: +rng.range(0, 35).toFixed(1),
    hasRings: giant ? rng.chance(0.55) : rng.chance(0.05),
  };
  world.planets[planet.id] = planet;
  sys.planetIds.push(planet.id);
  return planet;
}

export function defaultWeather(type: PlanetType): Planet['environment']['weather'] {
  switch (type) {
    case 'desert':
      return 'clear';
    case 'arctic':
      return 'snow';
    case 'jungle':
      return 'rain';
    case 'ocean':
      return 'cloudy';
    case 'volcanic':
      return 'dust';
    default:
      return 'clear';
  }
}

export { SURFACE_TYPES };
