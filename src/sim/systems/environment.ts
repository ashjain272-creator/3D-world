import type { Rng } from '../rng';
import { clamp } from '../rng';
import type { Civilization, Planet, World } from '../types';
import { addMemory, recordEvent } from '../world';
import { defaultWeather } from '../generate/cosmos';

interface Disturbance {
  name: string;
  yield: [number, number];
  days: [number, number];
  weather: Planet['environment']['weather'];
  description: string;
  types: Planet['type'][];
}

const DISTURBANCES: Disturbance[] = [
  { name: 'great drought', yield: [0.55, 0.75], days: [60, 160], weather: 'clear', description: 'Rains failed across the farmlands; rivers shrink to trickles.', types: ['terran', 'desert', 'jungle'] },
  { name: 'crop blight', yield: [0.6, 0.8], days: [40, 120], weather: 'cloudy', description: 'A fungal blight spreads through the staple crops.', types: ['terran', 'jungle', 'ocean'] },
  { name: 'harsh winter', yield: [0.65, 0.85], days: [50, 100], weather: 'snow', description: 'An unusually long winter freezes fields and roads.', types: ['terran', 'arctic'] },
  { name: 'monsoon floods', yield: [0.7, 0.85], days: [30, 70], weather: 'storm', description: 'Torrential rains flood the lowlands.', types: ['terran', 'jungle', 'ocean'] },
  { name: 'season of dust storms', yield: [0.6, 0.8], days: [40, 100], weather: 'dust', description: 'Choking storms bury crops and halt caravans.', types: ['desert'] },
];

/** Daily environment: natural disturbances, recovery, and weather. */
export function environmentTick(world: World, rng: Rng): void {
  for (const planet of Object.values(world.planets)) {
    const env = planet.environment;
    if (env.disturbanceDays > 0) {
      env.disturbanceDays -= 1;
      if (env.disturbanceDays <= 0) {
        const name = env.disturbance;
        env.disturbance = null;
        env.climateYield = 1;
        env.weather = defaultWeather(planet.type);
        if (planet.civIds.length && name) {
          recordEvent(world, {
            category: 'environment',
            title: `The ${name} on ${planet.name} ends`,
            description: 'Conditions return to normal and harvests recover.',
            importance: 2,
            civIds: [...planet.civIds],
            planetId: planet.id,
            cause: 'The disturbance ran its natural course.',
            causeIds: env.disturbanceEventId ? [env.disturbanceEventId] : [],
            effects: [{ label: 'Crop yield', after: '100%' }],
          });
        }
      }
      continue;
    }
    if (!planet.civIds.length) continue;
    // Temperature shifts imposed by the creator make disturbances more likely.
    const stress = 1 + Math.abs(env.temperatureOffset) / 6;
    if (rng.chance(0.0012 * stress)) {
      const options = DISTURBANCES.filter((d) => d.types.includes(planet.type));
      if (!options.length) continue;
      startDisturbance(world, rng, planet, rng.pick(options), `Natural climate variability on ${planet.name}${env.temperatureOffset ? ` (amplified by a ${env.temperatureOffset > 0 ? '+' : ''}${env.temperatureOffset}°C climate shift)` : ''}.`);
    } else if (rng.chance(0.08)) {
      // ordinary day-to-day weather variation for Explorer
      const pool: Planet['environment']['weather'][] =
        planet.type === 'desert' ? ['clear', 'clear', 'dust', 'cloudy'] : planet.type === 'arctic' ? ['snow', 'snow', 'cloudy', 'clear', 'fog'] : planet.type === 'jungle' ? ['rain', 'cloudy', 'fog', 'clear', 'storm'] : ['clear', 'clear', 'cloudy', 'rain', 'fog'];
      env.weather = rng.pick(pool);
    }
  }
}

export function startDisturbance(world: World, rng: Rng, planet: Planet, d: Disturbance, cause: string, causeIds: string[] = [], source: 'simulation' | 'creator' = 'simulation'): void {
  const env = planet.environment;
  const before = env.climateYield;
  env.climateYield = +rng.range(d.yield[0], d.yield[1]).toFixed(2);
  env.disturbanceDays = rng.int(d.days[0], d.days[1]);
  env.disturbance = d.name;
  env.weather = d.weather;
  const ev = recordEvent(world, {
    category: 'environment',
    title: `A ${d.name} strikes ${planet.name}`,
    description: d.description,
    importance: 3,
    civIds: [...planet.civIds],
    planetId: planet.id,
    cause,
    causeIds,
    effects: [
      { label: 'Crop yield', before: `${Math.round(before * 100)}%`, after: `${Math.round(env.climateYield * 100)}%` },
      { label: 'Expected duration', after: `${env.disturbanceDays} days` },
    ],
    source,
  });
  env.disturbanceEventId = ev.id;
  for (const c of Object.values(world.characters)) {
    if (c.alive && world.settlements[c.settlementId]?.planetId === planet.id && (c.occupation === 'farmer' || rng.chance(0.2))) {
      addMemory(c, { t: world.time, text: `Lived through the ${d.name}.`, valence: -0.5, importance: c.occupation === 'farmer' ? 4 : 2, eventId: ev.id });
      c.needs.security = clamp(c.needs.security - 15, 0, 100);
    }
  }
}

export const DISTURBANCE_LIST = DISTURBANCES;

/** Rare emergent societal conditions evaluated monthly. */
export function societalConditionsTick(world: World, rng: Rng, civ: Civilization, healthMod: number): void {
  // Golden age: sustained prosperity.
  if (civ.stability > 78 && civ.satisfaction > 74) civ.conditions.prosperity = (civ.conditions.prosperity ?? 0) + 1;
  else delete civ.conditions.prosperity;
  if (!civ.conditions.golden_age && !civ.conditions.ga_cooldown && (civ.conditions.prosperity ?? 0) >= 6 && rng.chance(0.2)) {
    delete civ.conditions.prosperity;
    civ.conditions.golden_age = 360;
    recordEvent(world, {
      category: 'culture',
      title: `A golden age dawns for the ${civ.name}`,
      description: 'Prosperity, peace and confidence feed one another. Arts and sciences flourish.',
      importance: 4,
      civIds: [civ.id],
      cause: `Sustained high stability (${civ.stability.toFixed(0)}) and satisfaction (${civ.satisfaction.toFixed(0)}).`,
      causeIds: [civ.causeLinks.leader_policy, civ.causeLinks.leader].filter(Boolean).slice(0, 2) as string[],
      effects: [{ label: 'Satisfaction', after: '+10 for a year' }, { label: 'Birth rate', after: '+10%' }],
    });
  }
  // Epidemics: rarer with medicine; likelier when crowded or starving.
  if (!civ.conditions.plague) {
    const crowd = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0) / Math.max(1, world.settlements[id]?.capacity ?? 1), 0) / Math.max(1, civ.settlementIds.length);
    const p = 0.0015 * (1 - Math.min(0.85, healthMod)) * (crowd > 1 ? 2 : 1) * (civ.conditions.shortage_food ? 2.5 : 1);
    if (rng.chance(p)) startPlague(world, rng, civ, `Crowding (${(crowd * 100).toFixed(0)}% of capacity)${civ.conditions.shortage_food ? ' and famine' : ''} with limited medicine.`, civ.conditions.shortage_food && civ.causeLinks.shortage_food ? [civ.causeLinks.shortage_food] : []);
  }
}

export function startPlague(world: World, rng: Rng, civ: Civilization, cause: string, causeIds: string[] = [], source: 'simulation' | 'creator' = 'simulation'): void {
  civ.conditions.plague = rng.int(45, 120);
  const ev = recordEvent(world, {
    category: 'population',
    title: `Plague in the ${civ.name}`,
    description: 'A contagious fever spreads through crowded districts. Healers are overwhelmed.',
    importance: 4,
    civIds: [civ.id],
    cause,
    causeIds,
    effects: [
      { label: 'Death rate', after: '×3.5' },
      { label: 'Satisfaction', after: '−15 while it lasts' },
      { label: 'Duration', after: `${civ.conditions.plague} days` },
    ],
    source,
  });
  civ.causeLinks.plague = ev.id;
  for (const c of Object.values(world.characters)) {
    if (c.alive && c.civId === civ.id) {
      c.health = clamp(c.health - rng.range(0, 25), 5, 100);
      if (c.occupation === 'medic') addMemory(c, { t: world.time, text: 'Worked day and night treating the sick during the plague.', valence: -0.3, importance: 4, eventId: ev.id });
    }
  }
}
