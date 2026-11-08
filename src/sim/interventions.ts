/**
 * Creator Console interventions. Every action mutates real simulation state
 * and records a 'creator' history event describing exactly what changed, so
 * downstream consequences (famines, revolutions, treaties…) can cite it.
 */
import { clamp } from './rng';
import { worldRng } from './engine';
import { generatePlanet, generateSystem, hasSurface, isHabitableType } from './generate/cosmos';
import { createCharacter, createSettlement, generateCivilization } from './generate/society';
import { GOVERNMENTS } from './data/society';
import { TECH_BY_ID } from './data/techs';
import type { ArchitectureStyle, Civilization, GovernmentType, PlanetType, TechCategory, TechDef, World } from './types';
import { addMemory, fullName, getRelation, recordEvent, relationKey } from './world';
import { completeResearch, techById } from './systems/technology';
import { DISTURBANCE_LIST, startDisturbance, startPlague } from './systems/environment';
import { succession } from './systems/politics';
import { cultureSimilarity } from './systems/diplomacy';
import { die } from './systems/characters';

export interface InterventionResult {
  ok: boolean;
  message: string;
  eventId?: string;
  /** Id of a created entity to navigate to. */
  createdId?: string;
}

const fail = (message: string): InterventionResult => ({ ok: false, message });

export function discoverStarSystem(world: World): InterventionResult {
  const rng = worldRng(world);
  const sys = generateSystem(world, rng, { origin: 'discovered' });
  const count = rng.int(2, 5);
  for (let i = 0; i < count; i++) generatePlanet(world, rng, sys, { index: i });
  world.rngState = rng.state;
  const ev = recordEvent(world, {
    category: 'cosmic',
    title: `The ${sys.name} system is charted`,
    description: `A ${sys.star.spectralClass}-class star with ${count} planets has been added to the galactic map.`,
    importance: 3,
    systemId: sys.id,
    cause: 'Discovered through the Creator Console.',
    effects: [
      { label: 'Charted systems', after: Object.keys(world.systems).length },
      { label: 'Planets', after: sys.planetIds.map((id) => world.planets[id].name).join(', ') },
    ],
    source: 'creator',
  });
  return { ok: true, message: `Charted ${sys.name} with ${count} planets.`, eventId: ev.id, createdId: sys.id };
}

export function createPlanet(world: World, systemId: string, type?: PlanetType): InterventionResult {
  const sys = world.systems[systemId];
  if (!sys) return fail('Unknown star system.');
  if (sys.planetIds.length >= 9) return fail(`${sys.name} already holds nine planets.`);
  const rng = worldRng(world);
  const lastOrbit = Math.max(0.2, ...sys.planetIds.map((id) => world.planets[id].orbit));
  const habitable = type && isHabitableType(type);
  const orbit = habitable ? +(Math.sqrt(sys.star.luminosity) * rng.range(0.9, 1.15)).toFixed(2) : +(lastOrbit * rng.range(1.3, 1.7)).toFixed(2);
  const p = generatePlanet(world, rng, sys, { type, orbit, index: sys.planetIds.length, inhabited: !!habitable });
  world.rngState = rng.state;
  const ev = recordEvent(world, {
    category: 'cosmic',
    title: `A new world forms: ${p.name}`,
    description: `A ${p.type.replace('_', ' ')} planet now orbits ${sys.name} at ${p.orbit} AU.`,
    importance: 3,
    systemId: sys.id,
    planetId: p.id,
    cause: 'Created through the Creator Console.',
    effects: [
      { label: 'Planets in system', before: sys.planetIds.length - 1, after: sys.planetIds.length },
      { label: 'Habitability', after: `${Math.round(p.habitability * 100)}%` },
    ],
    source: 'creator',
  });
  return { ok: true, message: `${p.name} created around ${sys.name}.`, eventId: ev.id, createdId: p.id };
}

export function foundSettlement(world: World, civId: string, planetId: string, regionIndex: number): InterventionResult {
  const civ = world.civs[civId];
  const planet = world.planets[planetId];
  if (!civ || !planet) return fail('Unknown civilisation or planet.');
  if (!hasSurface(planet.type)) return fail(`${planet.name} has no solid surface.`);
  const region = planet.regions[regionIndex];
  if (!region) return fail('Unknown region.');
  if (region.ownerCivId && region.ownerCivId !== civ.id) return fail(`${region.name} is held by the ${world.civs[region.ownerCivId]?.name}.`);
  if (Object.values(world.settlements).some((s) => s.planetId === planetId && s.regionIndex === regionIndex)) return fail(`${region.name} already has a settlement.`);
  const rng = worldRng(world);
  const offworld = !civ.planetIds.includes(planet.id);
  const source = civ.settlementIds.map((id) => world.settlements[id]).sort((a, b) => b.population - a.population)[0];
  const settlers = Math.round(Math.min(source.population * 0.05, rng.range(6000, 20000)));
  source.population -= settlers;
  const s = createSettlement(world, rng, civ, planet, regionIndex, offworld ? 'colony' : 'outpost', settlers, world.time);
  for (let i = 0; i < 3; i++) createCharacter(world, rng, civ, s, { age: rng.int(20, 45) });
  world.rngState = rng.state;
  const ev = recordEvent(world, {
    category: 'founding',
    title: `${s.name} founded in the ${region.name}`,
    description: `${settlers.toLocaleString()} settlers of the ${civ.name} established ${s.name} on ${planet.name}.`,
    importance: offworld ? 4 : 3,
    civIds: [civ.id],
    planetId: planet.id,
    settlementId: s.id,
    cause: 'Ordered through the Creator Console.',
    effects: [
      { label: 'Settlements', before: civ.settlementIds.length - 1, after: civ.settlementIds.length },
      { label: `${source.name} population`, before: Math.round(source.population + settlers), after: Math.round(source.population) },
    ],
    source: 'creator',
  });
  return { ok: true, message: `${s.name} founded.`, eventId: ev.id, createdId: s.id };
}

export function introduceCivilization(
  world: World,
  planetId: string,
  opts: { architecture?: ArchitectureStyle; government?: GovernmentType; regionIndex?: number } = {},
): InterventionResult {
  const planet = world.planets[planetId];
  if (!planet || !hasSurface(planet.type)) return fail('Choose a planet with a solid surface.');
  const free = planet.regions.filter((r) => !r.ownerCivId && r.biome !== 'ocean');
  if (!free.length) return fail(`No unclaimed land remains on ${planet.name}.`);
  const rng = worldRng(world);
  const region = opts.regionIndex !== undefined ? planet.regions[opts.regionIndex] : [...free].sort((a, b) => b.fertility - a.fertility)[0];
  if (!region || region.ownerCivId) return fail('That region is already claimed.');
  if (!isHabitableType(planet.type) && planet.environment.temperatureOffset === 0) {
    // hostile worlds host hardy, small civilisations
  }
  const civ = generateCivilization(world, rng, planet, region.index, {
    architecture: opts.architecture,
    government: opts.government,
    techLevel: rng.int(5, 9),
    characters: 24,
    population: rng.range(4e5, 1.2e6),
    settlements: rng.int(1, 2),
    foundedYearsAgo: rng.int(150, 600),
    source: 'creator',
  });
  // Relations with all existing civs; same-planet civs know each other immediately.
  for (const other of Object.values(world.civs)) {
    if (other.id === civ.id) continue;
    const same = other.planetIds.includes(planet.id);
    world.relations[relationKey(civ.id, other.id)] = {
      a: civ.id,
      b: other.id,
      opinion: same ? Math.round((cultureSimilarity(civ, other) - 0.6) * 60) : 0,
      status: same ? 'neutral' : 'unknown',
      treaties: [],
      tradeVolume: 0,
      incidents: 0,
      history: [],
      contactAt: same ? world.time : null,
    };
    if (same) {
      civ.knownCivIds.push(other.id);
      other.knownCivIds.push(civ.id);
    }
  }
  world.rngState = rng.state;
  return { ok: true, message: `The ${civ.name} now inhabit ${planet.name}.`, createdId: civ.id, eventId: civ.causeLinks.founding };
}

export type EnvironmentChange =
  | { kind: 'temperature'; delta: number }
  | { kind: 'disturbance'; name: string }
  | { kind: 'restore' }
  | { kind: 'enrich'; resource: 'metals' | 'energy' | 'organics' | 'water' | 'exotics' };

export function changeEnvironment(world: World, planetId: string, change: EnvironmentChange): InterventionResult {
  const planet = world.planets[planetId];
  if (!planet) return fail('Unknown planet.');
  const rng = worldRng(world);
  const env = planet.environment;
  let result: InterventionResult;
  if (change.kind === 'temperature') {
    const before = env.temperatureOffset;
    env.temperatureOffset = clamp(before + change.delta, -30, 30);
    const ev = recordEvent(world, {
      category: 'environment',
      title: `${planet.name}'s climate ${change.delta > 0 ? 'warms' : 'cools'}`,
      description: `Mean temperature shifted by ${change.delta > 0 ? '+' : ''}${change.delta}°C. Farmland yields and weather patterns respond.`,
      importance: 3,
      civIds: [...planet.civIds],
      planetId,
      cause: 'Climate altered through the Creator Console.',
      effects: [
        { label: 'Mean temperature', before: `${planet.baseTemperature + before}°C`, after: `${planet.baseTemperature + env.temperatureOffset}°C` },
        { label: 'Disturbance risk', after: `×${(1 + Math.abs(env.temperatureOffset) / 6).toFixed(1)}` },
      ],
      source: 'creator',
    });
    if (env.temperatureOffset < -8) env.weather = 'snow';
    result = { ok: true, message: `${planet.name} is now ${planet.baseTemperature + env.temperatureOffset}°C on average.`, eventId: ev.id };
  } else if (change.kind === 'disturbance') {
    const d = DISTURBANCE_LIST.find((x) => x.name === change.name);
    if (!d) return fail('Unknown disturbance.');
    if (env.disturbanceDays > 0) return fail(`${planet.name} is already suffering a ${env.disturbance}.`);
    startDisturbance(world, rng, planet, d, 'Unleashed through the Creator Console.', [], 'creator');
    result = { ok: true, message: `A ${d.name} strikes ${planet.name}.`, eventId: env.disturbanceEventId };
  } else if (change.kind === 'restore') {
    const before = { off: env.temperatureOffset, d: env.disturbance };
    env.temperatureOffset = 0;
    env.disturbance = null;
    env.disturbanceDays = 0;
    env.climateYield = 1;
    const ev = recordEvent(world, {
      category: 'environment',
      title: `${planet.name}'s climate is restored`,
      description: 'Natural conditions return across the planet.',
      importance: 2,
      civIds: [...planet.civIds],
      planetId,
      cause: 'Restored through the Creator Console.',
      effects: [
        { label: 'Temperature offset', before: `${before.off}°C`, after: '0°C' },
        { label: 'Disturbance', before: before.d ?? 'none', after: 'none' },
      ],
      source: 'creator',
    });
    result = { ok: true, message: `${planet.name} restored.`, eventId: ev.id };
  } else {
    const r = change.resource;
    const before = planet.resources[r];
    planet.resources[r] = clamp(before + 0.25, 0, 1);
    for (const reg of planet.regions) reg.resources[r] = clamp(reg.resources[r] + 0.25, 0, 1);
    const ev = recordEvent(world, {
      category: 'environment',
      title: `Vast ${r} deposits found on ${planet.name}`,
      description: `New reserves of ${r} make the planet considerably richer.`,
      importance: 3,
      civIds: [...planet.civIds],
      planetId,
      cause: 'Introduced through the Creator Console.',
      effects: [{ label: `${r} abundance`, before: `${Math.round(before * 100)}%`, after: `${Math.round(planet.resources[r] * 100)}%` }],
      source: 'creator',
    });
    result = { ok: true, message: `${planet.name} enriched with ${r}.`, eventId: ev.id };
  }
  world.rngState = rng.state;
  return result;
}

/** Grant an existing technology to a civilisation. */
export function grantTechnology(world: World, civId: string, techId: string): InterventionResult {
  const civ = world.civs[civId];
  const tech = techById(world, techId);
  if (!civ || !tech) return fail('Unknown civilisation or technology.');
  if (civ.tech.known.includes(techId)) return fail(`The ${civ.name} already know ${tech.name}.`);
  const rng = worldRng(world);
  // grant missing prerequisites too (recursively), so the tree stays valid
  const chain: TechDef[] = [];
  const visit = (t: TechDef) => {
    for (const p of t.prereqs) {
      const pt = techById(world, p);
      if (pt && !civ.tech.known.includes(p) && !chain.includes(pt)) visit(pt);
    }
    if (!chain.includes(t)) chain.push(t);
  };
  visit(tech);
  const intro = recordEvent(world, {
    category: 'intervention',
    title: `Knowledge of ${tech.name} is gifted to the ${civ.name}`,
    description: chain.length > 1 ? `Along with prerequisites: ${chain.slice(0, -1).map((t) => t.name).join(', ')}.` : tech.description,
    importance: 3,
    civIds: [civ.id],
    cause: 'Introduced through the Creator Console.',
    effects: chain.map((t) => ({ label: 'Technology', after: t.name })),
    source: 'creator',
  });
  for (const t of chain) completeResearch(world, rng, civ, t, { text: 'Knowledge introduced through the Creator Console.', ids: [intro.id] });
  world.rngState = rng.state;
  return { ok: true, message: `The ${civ.name} learned ${chain.map((t) => t.name).join(', ')}.`, eventId: intro.id };
}

/**
 * Introduce a brand-new scientific discovery. The originating civilisation
 * gains it; every other civilisation in contact reacts according to its
 * culture — progressive and rational societies race to replicate it,
 * traditional or spiritual ones suffer unrest.
 */
export function introduceDiscovery(
  world: World,
  civId: string,
  spec: { name: string; category: TechCategory; magnitude: number; description?: string },
): InterventionResult {
  const civ = world.civs[civId];
  if (!civ) return fail('Unknown civilisation.');
  const name = spec.name.trim().slice(0, 48);
  if (!name) return fail('Name the discovery.');
  const rng = worldRng(world);
  const m = clamp(spec.magnitude, 0.5, 3);
  const id = `custom_${world.nextId + 1}`;
  const effects: TechDef['effects'] = {};
  switch (spec.category) {
    case 'agriculture':
      effects.production = { food: 0.25 * m };
      effects.growth = 0.02 * m;
      break;
    case 'industry':
      effects.production = { goods: 0.25 * m, materials: 0.15 * m };
      break;
    case 'energy':
      effects.production = { energy: 0.35 * m };
      break;
    case 'society':
      effects.stability = Math.round(4 * m);
      effects.trade = 0.1 * m;
      break;
    case 'medicine':
      effects.health = 0.2 * m;
      break;
    case 'space':
      effects.unlocks = m >= 2 ? ['contact', 'colonize'] : ['contact'];
      effects.trade = 0.1 * m;
      break;
    case 'science':
      effects.research = 0.3 * m;
      break;
  }
  const tier = Math.max(...civ.tech.known.map((k) => techById(world, k)?.tier ?? 1), 1);
  const tech: TechDef = {
    id,
    name,
    category: spec.category,
    tier: Math.min(5, tier + 1),
    cost: Math.round(600 * m * tier),
    prereqs: [],
    description: spec.description?.trim() || `A paradigm-shifting discovery in ${spec.category}.`,
    effects,
    custom: true,
  };
  world.customTechs.push(tech);
  const intro = recordEvent(world, {
    category: 'intervention',
    title: `A revelation: ${name}`,
    description: `${civ.adjective} researchers stumble upon ${name}. ${tech.description}`,
    importance: 4,
    civIds: [civ.id],
    cause: 'Introduced through the Creator Console.',
    effects: [{ label: 'Magnitude', after: `${m.toFixed(1)}×` }],
    source: 'creator',
  });
  completeResearch(world, rng, civ, tech, { text: 'A sudden revelation introduced through the Creator Console.', ids: [intro.id] });
  // Responses
  const responses: string[] = [];
  for (const other of Object.values(world.civs)) {
    const v = other.culture.values;
    const receptiveness = v.progress * 0.6 + v.rationalism * 0.5 + v.openness * 0.3;
    const isSelf = other.id === civ.id;
    if (!isSelf && !other.knownCivIds.includes(civ.id)) continue;
    if (receptiveness > 0.15) {
      if (!isSelf) {
        other.tech.boosts[id] = (other.tech.boosts[id] ?? 0) + tech.cost * 0.4;
        other.tech.researching = id;
        other.tech.progress = 0;
      }
      other.satisfaction = clamp(other.satisfaction + 3, 0, 100);
      const ev = recordEvent(world, {
        category: 'discovery',
        title: isSelf ? `The ${other.name} embraces ${name}` : `The ${other.name} races to replicate ${name}`,
        description: isSelf ? 'Universities and industry rush to apply the breakthrough.' : 'Scholars are redirected to study the foreign breakthrough.',
        importance: 2,
        civIds: [other.id],
        cause: `A progressive, rational culture (receptiveness ${(receptiveness * 100).toFixed(0)}).`,
        causeIds: [intro.id],
        effects: isSelf ? [{ label: 'Satisfaction', after: '+3' }] : [{ label: 'Research target', after: name }, { label: 'Head start', after: `${Math.round(tech.cost * 0.4)} points` }],
        source: 'creator',
      });
      responses.push(ev.id);
    } else if (receptiveness < -0.15) {
      other.conditions.unrest_tech = Math.round(clamp(-receptiveness * 12 * m, 3, 18));
      const ev = recordEvent(world, {
        category: 'culture',
        title: `${name} unsettles the ${other.name}`,
        description: 'Traditionalists denounce the discovery; protests and sermons warn against it.',
        importance: 3,
        civIds: [other.id],
        cause: `A traditional or spiritual culture (receptiveness ${(receptiveness * 100).toFixed(0)}).`,
        causeIds: [intro.id],
        effects: [{ label: 'Satisfaction', after: `−${other.conditions.unrest_tech} (fading)` }],
        source: 'creator',
      });
      responses.push(ev.id);
    }
  }
  world.rngState = rng.state;
  return { ok: true, message: `${name} introduced; ${responses.length} civilisation(s) responded.`, eventId: intro.id };
}

export type DiplomaticAction = 'summit' | 'incident' | 'trade' | 'alliance' | 'sever';

export function diplomaticIntervention(world: World, aId: string, bId: string, action: DiplomaticAction): InterventionResult {
  const a = world.civs[aId];
  const b = world.civs[bId];
  if (!a || !b || a === b) return fail('Choose two different civilisations.');
  const rel = getRelation(world, aId, bId);
  if (!rel) return fail('No relation record.');
  const before = { opinion: Math.round(rel.opinion), status: rel.status };
  const contact = rel.contactAt === null;
  if (contact) {
    rel.contactAt = world.time;
    a.knownCivIds.push(b.id);
    b.knownCivIds.push(a.id);
  }
  let title = '';
  let desc = '';
  switch (action) {
    case 'summit':
      rel.opinion = clamp(rel.opinion + 25, -100, 100);
      rel.incidents = 0;
      title = `Grand summit between the ${a.name} and the ${b.name}`;
      desc = 'Delegations meet for weeks of talks; old grievances are aired and set aside.';
      break;
    case 'incident':
      rel.opinion = clamp(rel.opinion - 30, -100, 100);
      rel.incidents += 3;
      title = `Diplomatic incident between the ${a.name} and the ${b.name}`;
      desc = 'An envoy is insulted and expelled. Tempers flare on both sides.';
      break;
    case 'trade':
      if (!rel.treaties.some((t) => t.kind === 'trade')) rel.treaties.push({ kind: 'trade', since: world.time });
      rel.opinion = clamp(rel.opinion + 10, -100, 100);
      title = `Trade pact brokered: ${a.adjective}–${b.adjective}`;
      desc = 'Markets open between the two powers.';
      break;
    case 'alliance':
      if (!rel.treaties.some((t) => t.kind === 'trade')) rel.treaties.push({ kind: 'trade', since: world.time });
      if (!rel.treaties.some((t) => t.kind === 'alliance')) rel.treaties.push({ kind: 'alliance', since: world.time });
      rel.opinion = clamp(Math.max(rel.opinion, 40) + 15, -100, 100);
      title = `Alliance forged: ${a.adjective}–${b.adjective}`;
      desc = 'The two civilisations pledge mutual support and shared research.';
      break;
    case 'sever':
      rel.treaties = [];
      rel.opinion = clamp(rel.opinion - 20, -100, 100);
      title = `Relations severed: ${a.adjective}–${b.adjective}`;
      desc = 'Ambassadors are recalled and all treaties torn up.';
      break;
  }
  rel.status = rel.treaties.some((t) => t.kind === 'alliance')
    ? 'alliance'
    : rel.opinion <= -45
      ? 'rivalry'
      : rel.opinion <= -18
        ? 'tense'
        : rel.treaties.some((t) => t.kind === 'trade')
          ? 'trade'
          : rel.opinion >= 18
            ? 'cordial'
            : 'neutral';
  const ev = recordEvent(world, {
    category: 'diplomacy',
    title,
    description: desc + (contact ? ' It is the first time the two peoples have met.' : ''),
    importance: action === 'alliance' || action === 'sever' ? 4 : 3,
    civIds: [a.id, b.id],
    characterIds: [a.government.leaderId, b.government.leaderId].filter(Boolean) as string[],
    cause: 'Initiated through the Creator Console.',
    effects: [
      { label: 'Opinion', before: before.opinion, after: Math.round(rel.opinion) },
      { label: 'Status', before: before.status, after: rel.status },
    ],
    source: 'creator',
  });
  a.causeLinks[`rel_${b.id}`] = ev.id;
  b.causeLinks[`rel_${a.id}`] = ev.id;
  return { ok: true, message: `${title}.`, eventId: ev.id };
}

export type HistoricalEventKind = 'golden_age' | 'plague' | 'festival' | 'renaissance' | 'meteor' | 'migration' | 'coup' | 'prophet';

export const HISTORICAL_EVENTS: { kind: HistoricalEventKind; label: string; destructive: boolean; description: string }[] = [
  { kind: 'golden_age', label: 'Golden age', destructive: false, description: 'A year of prosperity: +10 satisfaction, higher birth rate.' },
  { kind: 'festival', label: 'Great festival', destructive: false, description: 'Celebrations lift spirits (+6 satisfaction for 30 days).' },
  { kind: 'renaissance', label: 'Cultural renaissance', destructive: false, description: 'Artists flourish; inspires creative goals.' },
  { kind: 'prophet', label: 'Rise of a visionary', destructive: false, description: 'A charismatic new figure appears with high leadership and reputation.' },
  { kind: 'migration', label: 'Migration wave', destructive: false, description: 'Newcomers arrive: +8% population, strain on housing.' },
  { kind: 'plague', label: 'Plague', destructive: true, description: 'An epidemic: tripled mortality for months.' },
  { kind: 'meteor', label: 'Meteor strike', destructive: true, description: 'A settlement is devastated: heavy population and infrastructure loss.' },
  { kind: 'coup', label: 'Coup d’état', destructive: true, description: 'The current leader is removed and a successor installed.' },
];

export function historicalIntervention(world: World, civId: string, kind: HistoricalEventKind): InterventionResult {
  const civ = world.civs[civId];
  if (!civ) return fail('Unknown civilisation.');
  const rng = worldRng(world);
  let res: InterventionResult;
  const ev = (title: string, description: string, importance: 2 | 3 | 4 | 5, effects: { label: string; before?: string | number; after?: string | number }[], extra: Partial<{ settlementId: string; characterIds: string[] }> = {}) =>
    recordEvent(world, { category: 'intervention', title, description, importance, civIds: [civ.id], cause: 'Created through the Creator Console.', effects, source: 'creator', ...extra });
  switch (kind) {
    case 'golden_age': {
      civ.conditions.golden_age = 360;
      const e = ev(`A golden age is proclaimed in the ${civ.name}`, 'Confidence and prosperity sweep the realm.', 4, [{ label: 'Satisfaction', after: '+10 for a year' }, { label: 'Birth rate', after: '+10%' }]);
      res = { ok: true, message: 'Golden age begun.', eventId: e.id };
      break;
    }
    case 'festival': {
      civ.conditions.festival = 30;
      const e = ev(`The ${civ.adjective} Festival of Lights`, 'For a month, cities are hung with lanterns and music.', 2, [{ label: 'Satisfaction', after: '+6 for 30 days' }]);
      for (const c of Object.values(world.characters)) if (c.alive && c.civId === civ.id) c.needs.fun = 100;
      res = { ok: true, message: 'Festival declared.', eventId: e.id };
      break;
    }
    case 'renaissance': {
      civ.conditions.renaissance = 240;
      const e = ev(`A cultural renaissance in the ${civ.name}`, 'Patrons fund artists; studios and theatres multiply.', 3, [{ label: 'Satisfaction', after: '+5 for 240 days' }, { label: 'Creative goals', after: 'adopted by curious citizens' }]);
      for (const c of Object.values(world.characters)) {
        if (c.alive && c.civId === civ.id && c.personality.openness > 0.6 && !c.goals.some((g) => g.type === 'create_work')) {
          c.goals.push({ id: `${c.id}-g${world.nextId++}`, type: 'create_work', target: 'work', progress: 0, createdAt: world.time, description: 'Create a lasting work of art' });
          addMemory(c, { t: world.time, text: 'Inspired by the renaissance to create something lasting.', valence: 0.6, importance: 3, eventId: e.id });
        }
      }
      res = { ok: true, message: 'Renaissance begun.', eventId: e.id };
      break;
    }
    case 'prophet': {
      const s = world.settlements[civ.settlementIds[0]];
      const c = createCharacter(world, rng, civ, s, { age: rng.int(28, 40), notable: true });
      c.skills.leadership = 85;
      c.skills.diplomacy = 70;
      c.reputation = 80;
      c.personality.extraversion = 0.9;
      c.goals = [{ id: `${c.id}-glead`, type: 'lead', target: 'lead', progress: 0, createdAt: world.time, description: 'Rise to a position of leadership' }];
      const e = ev(`${fullName(c)} rises as a visionary`, `A charismatic speaker draws crowds in ${s.name}.`, 3, [{ label: 'New notable figure', after: fullName(c) }], { settlementId: s.id, characterIds: [c.id] });
      res = { ok: true, message: `${fullName(c)} appears.`, eventId: e.id, createdId: c.id };
      break;
    }
    case 'migration': {
      let total = 0;
      for (const sid of civ.settlementIds) {
        const s = world.settlements[sid];
        const add = s.population * 0.08;
        s.population += add;
        total += add;
      }
      for (let i = 0; i < 3; i++) createCharacter(world, rng, civ, world.settlements[rng.pick(civ.settlementIds)], { age: rng.int(18, 40) });
      const e = ev(`A wave of migrants reaches the ${civ.name}`, 'Refugees and settlers from distant lands seek a new home.', 3, [{ label: 'Population', after: `+${Math.round(total).toLocaleString()}` }]);
      res = { ok: true, message: 'Migrants arrived.', eventId: e.id };
      break;
    }
    case 'plague': {
      startPlague(world, rng, civ, 'Unleashed through the Creator Console.', [], 'creator');
      res = { ok: true, message: 'Plague unleashed.', eventId: civ.causeLinks.plague };
      break;
    }
    case 'meteor': {
      const target = world.settlements[rng.pick(civ.settlementIds)];
      const before = Math.round(target.population);
      target.population *= rng.range(0.55, 0.75);
      target.infrastructure = Math.max(1, target.infrastructure * 0.6);
      civ.stability = Math.max(0, civ.stability - 12);
      const e = ev(`Meteor strike devastates ${target.name}`, 'Fire falls from the sky. Districts are flattened.', 5, [
        { label: `${target.name} population`, before, after: Math.round(target.population) },
        { label: 'Infrastructure', after: target.infrastructure.toFixed(1) },
        { label: 'Stability', after: '−12' },
      ], { settlementId: target.id });
      const victims = Object.values(world.characters).filter((c) => c.alive && c.settlementId === target.id && c.id !== civ.government.leaderId && rng.chance(0.25));
      for (const v of victims) die(world, rng, v, 'the meteor strike', [e.id]);
      for (const c of Object.values(world.characters)) if (c.alive && c.civId === civ.id) addMemory(c, { t: world.time, text: `The sky fell on ${target.name}.`, valence: -0.8, importance: 5, eventId: e.id });
      res = { ok: true, message: `${target.name} struck; ${victims.length} named inhabitants lost.`, eventId: e.id };
      break;
    }
    case 'coup': {
      const old = civ.government.leaderId ? world.characters[civ.government.leaderId] : undefined;
      const e = ev(`Coup in the ${civ.name}`, `${old ? fullName(old) : 'The leader'} is deposed in a night of shifting loyalties.`, 4, [{ label: 'Legitimacy', after: '−20' }], { characterIds: old ? [old.id] : [] });
      civ.government.legitimacy = Math.max(5, civ.government.legitimacy - 20);
      civ.stability = Math.max(0, civ.stability - 8);
      if (old) {
        addMemory(old, { t: world.time, text: 'Was deposed in a coup.', valence: -1, importance: 5, eventId: e.id });
        old.reputation = Math.max(0, old.reputation - 25);
        civ.pastLeaderIds.push(old.id);
        civ.government.leaderId = null;
      }
      const next = succession(world, rng, civ, 'creator', [e.id], old?.id);
      res = { ok: true, message: next ? `${fullName(next)} seized power.` : 'The leader was deposed.', eventId: e.id };
      break;
    }
  }
  world.rngState = rng.state;
  return res;
}

export function setGovernment(world: World, civId: string, type: GovernmentType): InterventionResult {
  const civ = world.civs[civId];
  if (!civ) return fail('Unknown civilisation.');
  if (civ.government.type === type) return fail(`The ${civ.name} is already a ${type}.`);
  const rng = worldRng(world);
  const before = civ.government.type;
  const def = GOVERNMENTS[type];
  civ.government.type = type;
  civ.government.leaderTitle = def.leaderTitle;
  civ.government.termLengthDays = def.termLengthDays;
  civ.government.legitimacy = Math.min(civ.government.legitimacy, 55);
  const e = recordEvent(world, {
    category: 'intervention',
    title: `The ${civ.name} becomes a ${type}`,
    description: `Its institutions are remade along new lines.`,
    importance: 4,
    civIds: [civ.id],
    cause: 'Reform imposed through the Creator Console.',
    effects: [
      { label: 'Government', before, after: type },
      { label: 'Leader title', after: def.leaderTitle },
    ],
    source: 'creator',
  });
  succession(world, rng, civ, 'creator', [e.id]);
  world.rngState = rng.state;
  return { ok: true, message: `Reformed into a ${type}.`, eventId: e.id };
}

export function techOptionsFor(world: World, civ: Civilization) {
  return Object.values(TECH_BY_ID)
    .concat(world.customTechs)
    .filter((t) => !civ.tech.known.includes(t.id));
}
