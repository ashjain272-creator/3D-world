import { Rng, clamp } from '../rng';
import { civName, familyName, personName, placeName } from '../data/names';
import {
  GOVERNMENTS,
  INTERESTS,
  MOTTOS,
  OCCUPATIONS,
  SPECIALIZATION_JOBS,
  SPECIES,
  TRADITIONS,
  WORKING_OCCUPATIONS,
} from '../data/society';
import { TECHS } from '../data/techs';
import {
  GOODS,
  SKILLS,
  type ArchitectureStyle,
  type Character,
  type Civilization,
  type Culture,
  type CultureValues,
  type GoalType,
  type GovernmentType,
  type Landmark,
  type LanguageKey,
  type Occupation,
  type Planet,
  type PolicyId,
  type Settlement,
  type SettlementKind,
  type Skill,
  type Specialization,
  type TechCategory,
  type World,
} from '../types';
import { MINUTES_PER_DAY, MINUTES_PER_YEAR } from '../time';
import { addMemory, bumpCharacterVersion, causeKey, fullName, lastCause, newId, noteCause, recordEvent } from '../world';
import { makeGoal } from '../systems/goals';

const CIV_COLORS = ['#5fd4ff', '#ffb35f', '#9d8bff', '#6fe3a5', '#ff7a8a', '#e8d36a', '#5f9dff', '#ff9f6a'];

/** Background individuals a civilisation's settlements support: grows with the square root of population. */
export function backgroundTarget(world: World, civ: Civilization): number {
  let n = 0;
  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    if (s) n += Math.round(Math.sqrt(s.population / 1000) * 1.4);
  }
  return n;
}

export interface CivOptions {
  language?: LanguageKey;
  architecture?: ArchitectureStyle;
  government?: GovernmentType;
  techLevel?: number; // number of starting techs approx
  population?: number; // capital population
  settlements?: number;
  characters?: number;
  name?: string;
  foundedYearsAgo?: number;
  source?: 'chronicle' | 'creator';
}

function randomValues(rng: Rng, arch: ArchitectureStyle): CultureValues {
  const v = () => +clamp(rng.normal(0, 0.45), -1, 1).toFixed(2);
  const vals: CultureValues = { progress: v(), collectivism: v(), rationalism: v(), militarism: v(), openness: v() };
  if (arch === 'futuristic') {
    vals.progress = +clamp(vals.progress + 0.45, -1, 1).toFixed(2);
    vals.rationalism = +clamp(vals.rationalism + 0.35, -1, 1).toFixed(2);
  } else if (arch === 'organic') {
    vals.collectivism = +clamp(vals.collectivism + 0.35, -1, 1).toFixed(2);
    vals.rationalism = +clamp(vals.rationalism - 0.3, -1, 1).toFixed(2);
    vals.militarism = +clamp(vals.militarism - 0.3, -1, 1).toFixed(2);
  } else {
    vals.progress = +clamp(vals.progress - 0.3, -1, 1).toFixed(2);
    vals.collectivism = +clamp(vals.collectivism - 0.25, -1, 1).toFixed(2);
  }
  return vals;
}

function governmentFit(type: GovernmentType, v: CultureValues): number {
  const pref = GOVERNMENTS[type].culture;
  let s = 0;
  for (const k of Object.keys(pref) as (keyof CultureValues)[]) s += (pref[k] ?? 0) * v[k];
  return s;
}

export function choosePolicies(rng: Rng, v: CultureValues, count: number): PolicyId[] {
  // lazy import avoided: inline policy culture preferences
  const prefs: Record<PolicyId, Partial<CultureValues>> = {
    research_grants: { progress: 0.6, rationalism: 0.6 },
    agrarian_subsidies: { progress: -0.3, collectivism: 0.3 },
    industrial_drive: { collectivism: 0.4, militarism: 0.3 },
    open_markets: { collectivism: -0.7, openness: 0.6 },
    protectionism: { openness: -0.7 },
    public_works: { collectivism: 0.5 },
    austerity: { collectivism: -0.4 },
    welfare: { collectivism: 0.7 },
    expansionism: { militarism: 0.4, openness: 0.3 },
    cultural_festivals: { progress: -0.4, rationalism: -0.4 },
    martial_order: { militarism: 0.8, openness: -0.4 },
    exploration_charter: { openness: 0.6, progress: 0.3 },
  };
  const exclusive: [PolicyId, PolicyId][] = [
    ['open_markets', 'protectionism'],
    ['austerity', 'public_works'],
    ['austerity', 'welfare'],
  ];
  const scored = (Object.keys(prefs) as PolicyId[])
    .filter((p) => p !== 'austerity' && p !== 'martial_order')
    .map((p) => {
      let s = rng.range(0, 0.4);
      for (const k of Object.keys(prefs[p]) as (keyof CultureValues)[]) s += (prefs[p][k] ?? 0) * v[k];
      return { p, s };
    })
    .sort((a, b) => b.s - a.s);
  const out: PolicyId[] = [];
  for (const { p } of scored) {
    if (out.length >= count) break;
    if (exclusive.some(([a, b]) => (a === p && out.includes(b)) || (b === p && out.includes(a)))) continue;
    out.push(p);
  }
  return out;
}

function researchPriorities(v: CultureValues): Record<TechCategory, number> {
  return {
    agriculture: 1 + Math.max(0, -v.progress) * 0.5 + Math.max(0, v.collectivism) * 0.3,
    industry: 1 + Math.max(0, v.militarism) * 0.5 + Math.max(0, -v.collectivism) * 0.2,
    energy: 1 + Math.max(0, v.progress) * 0.3,
    society: 1 + Math.max(0, v.collectivism) * 0.4 + Math.max(0, -v.rationalism) * 0.3,
    medicine: 1 + Math.max(0, v.collectivism) * 0.3 + Math.max(0, -v.militarism) * 0.3,
    space: 0.8 + Math.max(0, v.openness) * 0.6 + Math.max(0, v.progress) * 0.3,
    science: 1 + Math.max(0, v.rationalism) * 0.6 + Math.max(0, v.progress) * 0.3,
  };
}

const LANDMARKS: Record<ArchitectureStyle, { kind: Landmark['kind']; names: string[]; desc: string }[]> = {
  futuristic: [
    { kind: 'spire', names: ['Meridian Spire', 'Lumen Tower', 'Zenith Needle'], desc: 'A tapering tower of glass and light that anchors the skyline.' },
    { kind: 'observatory', names: ['Deep Array', 'Horizon Observatory'], desc: 'Radio dishes and optical domes that listen to distant stars.' },
    { kind: 'market', names: ['Exchange Plaza', 'Trade Concourse'], desc: 'A wide plaza where merchants trade under holographic signs.' },
    { kind: 'archive', names: ['Grand Archive', 'Memory Vault'], desc: 'Repository of every record the civilisation has kept.' },
    { kind: 'spaceport', names: ['Ascension Port', 'Orbital Gate'], desc: 'Launch pads and cargo cradles reaching for orbit.' },
  ],
  organic: [
    { kind: 'garden', names: ['Hanging Gardens', 'Grove of Murmurs'], desc: 'Terraced living gardens tended for generations.' },
    { kind: 'temple', names: ['Sanctum of Roots', 'Moonwell Shrine'], desc: 'A domed shrine grown from shaped living wood.' },
    { kind: 'monument', names: ['Founders’ Circle', 'Stone of First Light'], desc: 'Standing stones marking where the first settlers arrived.' },
    { kind: 'market', names: ['Lantern Market', 'Riverside Bazaar'], desc: 'Stalls woven from reeds, busy from dawn.' },
  ],
  frontier: [
    { kind: 'monument', names: ['Pioneer Obelisk', 'Ironwatch Memorial'], desc: 'An obelisk raised to those who crossed the wastes.' },
    { kind: 'market', names: ['Caravan Yard', 'Dust Market'], desc: 'Where caravans unload ore and buy water.' },
    { kind: 'ruin', names: ['The Old Bastion', 'Sunken Citadel'], desc: 'Weathered walls of an older settlement long abandoned.' },
    { kind: 'observatory', names: ['Windmill Observatory', 'Mesa Lookout'], desc: 'A lookout tower with a hand-built telescope.' },
    { kind: 'temple', names: ['Chapel of the Long Road'], desc: 'A small stone chapel for travellers.' },
  ],
};

export function makeLandmarks(world: World, rng: Rng, style: ArchitectureStyle, count: number): Landmark[] {
  const opts = rng.shuffle([...LANDMARKS[style]]);
  return opts.slice(0, count).map((o) => ({ id: newId(world, 'l'), name: rng.pick(o.names), kind: o.kind, description: o.desc }));
}

export function createSettlement(
  world: World,
  rng: Rng,
  civ: Civilization,
  planet: Planet,
  regionIndex: number,
  kind: SettlementKind,
  population: number,
  foundedAt: number,
): Settlement {
  const region = planet.regions[regionIndex];
  const spec: Specialization =
    kind === 'capital'
      ? rng.pick<Specialization>(['trade', 'research', 'industry'])
      : region.fertility > 0.6
        ? 'agriculture'
        : region.resources.metals > 0.65
          ? 'mining'
          : region.resources.energy > 0.7
            ? 'energy'
            : rng.pick<Specialization>(['industry', 'research', 'trade', 'agriculture']);
  const s: Settlement = {
    id: newId(world, 't'),
    name: placeName(rng, civ.culture.language),
    civId: civ.id,
    planetId: planet.id,
    regionIndex,
    kind,
    specialization: spec,
    population: Math.round(population),
    capacity: Math.round(population * rng.range(1.15, 1.4)),
    infrastructure: kind === 'capital' ? rng.range(4, 6) : kind === 'outpost' || kind === 'colony' ? rng.range(1, 2) : rng.range(2, 4),
    happiness: rng.range(55, 70),
    employment: rng.range(0.85, 0.95),
    foundedAt,
    style: civ.culture.architecture,
    layoutSeed: Math.floor(rng.next() * 1e9),
    landmarks: makeLandmarks(world, rng, civ.culture.architecture, kind === 'capital' ? 3 : kind === 'city' ? 2 : 1),
  };
  world.settlements[s.id] = s;
  civ.settlementIds.push(s.id);
  region.ownerCivId = civ.id;
  region.explored = true;
  if (!civ.planetIds.includes(planet.id)) civ.planetIds.push(planet.id);
  if (!planet.civIds.includes(civ.id)) planet.civIds.push(civ.id);
  return s;
}

function personality(rng: Rng) {
  const t = () => +clamp(rng.normal(0.5, 0.2), 0, 1).toFixed(2);
  return { openness: t(), conscientiousness: t(), extraversion: t(), agreeableness: t(), neuroticism: t() };
}

export function pickOccupation(rng: Rng, s: Settlement, age: number): Occupation {
  if (age < 22) return 'student';
  if (age > 72 && rng.chance(0.7)) return 'retired';
  if (rng.chance(0.55)) return rng.pick(SPECIALIZATION_JOBS[s.specialization]);
  return rng.pick(WORKING_OCCUPATIONS);
}

export interface CharacterOptions {
  tier?: 'foreground' | 'background';
  age?: number;
  familyName?: string;
  occupation?: Occupation;
  birthTime?: number;
  parentIds?: string[];
  notable?: boolean;
}

export function createCharacter(world: World, rng: Rng, civ: Civilization, s: Settlement, opts: CharacterOptions = {}): Character {
  const age = opts.age ?? Math.round(clamp(rng.normal(38, 15), 18, 88));
  const birthTime = opts.birthTime ?? world.time - age * MINUTES_PER_YEAR - rng.int(0, 359) * MINUTES_PER_DAY;
  const p = personality(rng);
  const occupation = opts.occupation ?? pickOccupation(rng, s, age);
  const skills = {} as Record<Skill, number>;
  const ageFactor = clamp(age / 45, 0.2, 1.2);
  for (const sk of SKILLS) skills[sk] = Math.round(clamp(rng.normal(14, 8) * ageFactor, 0, 60));
  const main = OCCUPATIONS[occupation].skill;
  skills[main] = Math.round(clamp(skills[main] + 20 + age * 0.6 + rng.normal(0, 8), 5, 95));
  if (p.openness > 0.6) skills.science = Math.min(100, skills.science + 6);
  if (p.extraversion > 0.6) skills.diplomacy = Math.min(100, skills.diplomacy + 6);
  const interests = rng.shuffle([...INTERESTS]).slice(0, rng.int(1, 3));
  const c: Character = {
    id: newId(world, 'c'),
    givenName: personName(rng, civ.culture.language),
    familyName: opts.familyName ?? familyName(rng, civ.culture.language),
    civId: civ.id,
    settlementId: s.id,
    homeSettlementId: s.id,
    birthTime,
    alive: true,
    personality: p,
    occupation,
    occupationSince: world.time - Math.max(0, age - 22) * rng.range(0.2, 1) * MINUTES_PER_YEAR,
    skills,
    needs: {
      energy: rng.range(55, 95),
      hunger: rng.range(50, 95),
      social: rng.range(40, 90),
      purpose: rng.range(40, 90),
      fun: rng.range(40, 90),
      security: rng.range(50, 90),
    },
    mood: rng.range(-10, 40),
    health: clamp(100 - Math.max(0, age - 50) * 1.2 + rng.normal(0, 6), 20, 100),
    wealth: Math.round(clamp(rng.normal(120, 70) * (OCCUPATIONS[occupation].wage / 4 + 0.4), 5, 2000)),
    goals: [],
    relationships: {},
    memories: [],
    interests,
    activity: { type: 'idle', startedAt: world.time, endsAt: world.time, description: 'Considering the day ahead' },
    nextDecisionAt: world.time + rng.int(0, 180),
    parentIds: opts.parentIds ?? [],
    childIds: [],
    notable: opts.notable ?? false,
    reputation: Math.round(clamp(rng.normal(30, 15), 0, 90)),
    eventIds: [],
    contributions: 0,
    homeSlot: rng.int(0, 999),
    workSlot: rng.int(0, 999),
    recent: [],
    discontent: 0,
    tier: opts.tier ?? 'foreground',
  };
  // initial goals from personality
  const goalTypes: GoalType[] = [];
  if (p.openness > 0.55) goalTypes.push(rng.chance(0.5) ? 'explore' : 'discover');
  if (p.conscientiousness > 0.55) goalTypes.push('master_skill');
  if (p.extraversion > 0.55) goalTypes.push('make_friend');
  if (p.agreeableness < 0.4 || skills.leadership > 45) goalTypes.push('lead');
  if (OCCUPATIONS[occupation].wage <= 4) goalTypes.push('wealth');
  if (skills.art > 35 || occupation === 'artist') goalTypes.push('create_work');
  if (age > 24 && age < 50 && rng.chance(0.4)) goalTypes.push('family');
  if (goalTypes.length === 0) goalTypes.push('master_skill');
  for (const g of rng.shuffle(goalTypes).slice(0, 2)) {
    const goal = makeGoal(world, rng, c, g);
    if (goal) c.goals.push(goal);
  }
  addMemory(c, {
    t: birthTime,
    text: `Born in ${s.name}${opts.parentIds?.length ? ` to ${opts.parentIds.map((id) => world.characters[id]?.givenName).filter(Boolean).join(' and ')}` : ''}.`,
    valence: 0.4,
    importance: 5,
  });
  world.characters[c.id] = c;
  bumpCharacterVersion(world);
  return c;
}

export function link(world: World, a: Character, b: Character, kind: Character['relationships'][string]['kind'], affinity: number, since: number): void {
  a.relationships[b.id] = { affinity, familiarity: Math.min(100, 30 + Math.abs(affinity) * 0.6), kind, since, lastInteraction: world.time };
  b.relationships[a.id] = { affinity: affinity + (kind === 'rival' ? 0 : -3), familiarity: Math.min(100, 30 + Math.abs(affinity) * 0.6), kind, since, lastInteraction: world.time };
}

export function seedRelationships(world: World, rng: Rng, chars: Character[]): void {
  // families: group some by family name; colleagues; friends; rivals
  for (let i = 0; i < chars.length; i++) {
    const a = chars[i];
    const sameTown = chars.filter((c) => c.id !== a.id && c.settlementId === a.settlementId);
    const n = rng.int(1, 3);
    for (let k = 0; k < n && sameTown.length; k++) {
      const b = rng.pick(sameTown);
      if (a.relationships[b.id]) continue;
      const compat = 1 - Math.abs(a.personality.agreeableness - b.personality.agreeableness) - Math.abs(a.personality.openness - b.personality.openness) * 0.5;
      const roll = rng.normal(compat * 40, 25);
      const kind = roll > 45 ? 'close_friend' : roll > 20 ? 'friend' : roll < -18 ? 'rival' : 'acquaintance';
      link(world, a, b, kind, Math.round(clamp(roll, -80, 85)), world.time - rng.int(1, 3000) * MINUTES_PER_DAY);
    }
  }
}

export function generateCivilization(world: World, rng: Rng, planet: Planet, regionIndex: number, opts: CivOptions = {}): Civilization {
  // Never found a capital on land another civilisation already holds.
  if (planet.regions[regionIndex]?.ownerCivId) {
    const free = planet.regions.filter((r) => !r.ownerCivId && r.biome !== 'ocean').sort((a, b) => b.fertility - a.fertility);
    if (free.length) regionIndex = free[0].index;
  }
  const usedLangs = new Set(Object.values(world.civs).map((c) => c.culture.language));
  const allLangs: LanguageKey[] = ['vel', 'kor', 'asha', 'tir', 'om', 'zen'];
  const language = opts.language ?? (allLangs.find((l) => !usedLangs.has(l) && rng.chance(0.6)) ?? rng.pick(allLangs));
  const architecture = opts.architecture ?? rng.pick<ArchitectureStyle>(['futuristic', 'organic', 'frontier']);
  const values = randomValues(rng, architecture);
  const govTypes = Object.keys(GOVERNMENTS) as GovernmentType[];
  const government = opts.government ?? govTypes.map((g) => ({ g, s: governmentFit(g, values) + rng.range(0, 0.5) })).sort((a, b) => b.s - a.s)[0].g;
  const n = civName(rng, language);
  const usedColors = new Set(Object.values(world.civs).map((c) => c.color));
  const color = CIV_COLORS.find((c) => !usedColors.has(c)) ?? rng.pick(CIV_COLORS);
  const foundedYearsAgo = opts.foundedYearsAgo ?? rng.int(400, 1600);
  const culture: Culture = {
    name: `${n.adjective} culture`,
    values,
    architecture,
    traditions: rng.shuffle([...TRADITIONS]).slice(0, 3),
    language,
    motto: rng.pick(MOTTOS),
  };
  const civ: Civilization = {
    id: newId(world, 'v'),
    name: opts.name ?? n.name,
    adjective: n.adjective,
    speciesName: rng.pick(SPECIES),
    homeworldId: planet.id,
    planetIds: [planet.id],
    color,
    culture,
    government: {
      type: government,
      leaderId: null,
      leaderTitle: GOVERNMENTS[government].leaderTitle,
      termStart: world.time,
      termLengthDays: GOVERNMENTS[government].termLengthDays,
      policies: choosePolicies(rng, values, 3),
      legitimacy: GOVERNMENTS[government].baseLegitimacy,
    },
    economy: {
      treasury: 0,
      stockpile: { food: 0, materials: 0, energy: 0, goods: 0 },
      production: { food: 0, materials: 0, energy: 0, goods: 0 },
      consumption: { food: 0, materials: 0, energy: 0, goods: 0 },
      prices: { food: 1, materials: 1, energy: 1, goods: 1 },
      netTrade: { food: 0, materials: 0, energy: 0, goods: 0 },
      gdp: 0,
      inequality: clamp(0.35 + GOVERNMENTS[government].inequalityBias - values.collectivism * 0.08, 0.15, 0.7),
      employment: 0.9,
      taxRate: 0.18 + Math.max(0, values.collectivism) * 0.1,
      tradeIncome: 0,
    },
    tech: { known: [], researching: null, progress: 0, rate: 0, priorities: researchPriorities(values), boosts: {} },
    stability: rng.range(58, 72),
    satisfaction: rng.range(55, 70),
    settlementIds: [],
    foundedYear: world.epochYear - foundedYearsAgo,
    background: '',
    pastLeaderIds: [],
    knownCivIds: [],
    stats: [],
    conditions: {},
    extinct: false,
  };
  world.civs[civ.id] = civ;

  // Starting technology: walk the tree by priority.
  const techLevel = opts.techLevel ?? 8;
  const known = new Set<string>();
  for (let i = 0; i < techLevel; i++) {
    const avail = TECHS.filter((t) => !known.has(t.id) && t.prereqs.every((p) => known.has(p)));
    if (!avail.length) break;
    const t = rng.weighted(avail, (x) => civ.tech.priorities[x.category] / x.tier);
    known.add(t.id);
  }
  civ.tech.known = [...known];

  // Settlements
  const foundedAt = -foundedYearsAgo * MINUTES_PER_YEAR;
  const capPop = opts.population ?? rng.range(1.4e6, 3.2e6);
  const capital = createSettlement(world, rng, civ, planet, regionIndex, 'capital', capPop, foundedAt);
  const extra = opts.settlements ?? rng.int(2, 3);
  const frontier = [regionIndex];
  for (let i = 0; i < extra; i++) {
    const candidates = frontier
      .flatMap((ri) => planet.regions[ri].neighbors)
      .filter((ri) => planet.regions[ri].ownerCivId === null && planet.regions[ri].biome !== 'ocean' && planet.regions[ri].biome !== 'ice');
    if (!candidates.length) break;
    const ri = rng.weighted(candidates, (r) => planet.regions[r].fertility + 0.2);
    const kind: SettlementKind = i === 0 ? 'city' : rng.chance(0.6) ? 'town' : 'outpost';
    const pop = kind === 'city' ? rng.range(3e5, 9e5) : kind === 'town' ? rng.range(4e4, 1.8e5) : rng.range(4e3, 1.5e4);
    createSettlement(world, rng, civ, planet, ri, kind, pop, foundedAt + rng.range(0.15, 0.85) * foundedYearsAgo * MINUTES_PER_YEAR);
    frontier.push(ri);
  }

  // Economy starting stockpiles relative to population
  const popM = civ.settlementIds.reduce((a, id) => a + world.settlements[id].population, 0) / 1e6;
  for (const g of GOODS) civ.economy.stockpile[g] = Math.round(popM * rng.range(40, 70));
  civ.economy.treasury = Math.round(popM * rng.range(120, 220));

  // Characters
  const count = opts.characters ?? 40;
  const chars: Character[] = [];
  const families: string[] = [];
  for (let i = 0; i < count; i++) {
    // distribute: capital gets more
    const sid = i < Math.ceil(count * 0.45) ? capital.id : civ.settlementIds[1 + ((i - Math.ceil(count * 0.45)) % Math.max(1, civ.settlementIds.length - 1))] ?? capital.id;
    const s = world.settlements[sid];
    const fam = families.length > 3 && rng.chance(0.25) ? rng.pick(families) : undefined;
    const c = createCharacter(world, rng, civ, s, { familyName: fam });
    if (!fam) families.push(c.familyName);
    chars.push(c);
  }
  // Background residents, distributed by settlement population
  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    const n = Math.round(Math.sqrt(s.population / 1000) * 1.4);
    for (let i = 0; i < n; i++) chars.push(createCharacter(world, rng, civ, s, { tier: 'background' }));
  }
  // Family ties for shared family names in the same settlement
  for (const a of chars) {
    for (const b of chars) {
      if (a.id < b.id && a.familyName === b.familyName && a.settlementId === b.settlementId) {
        link(world, a, b, 'family', Math.round(rng.range(20, 75)), Math.min(a.birthTime, b.birthTime));
      }
    }
  }
  seedRelationships(world, rng, chars);

  // Leader: best fit by preferred skill + reputation
  const pref = GOVERNMENTS[government].preferredSkill;
  const leader = [...chars]
    .filter((c) => (world.time - c.birthTime) / MINUTES_PER_YEAR > 30)
    .sort((a, b) => b.skills[pref] + b.skills.leadership + b.reputation - (a.skills[pref] + a.skills.leadership + a.reputation))[0];
  if (leader) {
    leader.occupation = 'official';
    leader.notable = true;
    leader.reputation = Math.max(leader.reputation, 70);
    leader.skills.leadership = Math.max(leader.skills.leadership, 55);
    leader.settlementId = capital.id;
    leader.homeSettlementId = capital.id;
    civ.government.leaderId = leader.id;
    civ.government.termStart = world.time - rng.int(30, 900) * MINUTES_PER_DAY;
    addMemory(leader, {
      t: civ.government.termStart,
      text: `Became ${civ.government.leaderTitle} of the ${civ.name}.`,
      valence: 0.8,
      importance: 5,
    });
  }
  // A few more notables: top skill holders
  [...chars].sort((a, b) => Math.max(...Object.values(b.skills)) - Math.max(...Object.values(a.skills))).slice(0, 5).forEach((c) => (c.notable = true));

  civ.background = buildBackground(world, rng, civ, planet, foundedYearsAgo);
  writeChronicle(world, rng, civ, planet, foundedYearsAgo, opts.source ?? 'chronicle');
  return civ;
}

function buildBackground(world: World, rng: Rng, civ: Civilization, planet: Planet, years: number): string {
  const capital = world.settlements[civ.settlementIds[0]];
  const v = civ.culture.values;
  const temperament =
    v.progress > 0.3 ? 'restless innovators who prize progress above tradition' : v.progress < -0.3 ? 'keepers of tradition who distrust sudden change' : 'a pragmatic people balancing old ways and new ideas';
  const social = v.collectivism > 0.3 ? 'Their society is built around shared duty and common stores.' : v.collectivism < -0.3 ? 'Their society rewards individual ambition and private enterprise.' : 'Their society mixes communal obligations with personal enterprise.';
  const outlook = v.openness > 0.3 ? 'They look outward with curiosity, eager to meet whatever lies beyond the horizon.' : v.openness < -0.3 ? 'They are wary of outsiders and guard their borders closely.' : 'They regard strangers with cautious interest.';
  const origin = rng.pick([
    `emerged from scattered river clans in the ${planet.regions[capital.regionIndex].name}`,
    `rose after uniting the warring cantons of the ${planet.regions[capital.regionIndex].name}`,
    `descend from the survivors of a long migration that ended in the ${planet.regions[capital.regionIndex].name}`,
    `grew from a coalition of trading towns along the ${planet.regions[capital.regionIndex].name}`,
  ]);
  return `The ${civ.speciesName} of the ${civ.name} ${origin} some ${years} years ago, founding ${capital.name} as their seat. They are ${temperament}. ${social} ${outlook} Their creed: “${civ.culture.motto}”`;
}

function writeChronicle(world: World, rng: Rng, civ: Civilization, planet: Planet, years: number, source: 'chronicle' | 'creator'): void {
  const cap = world.settlements[civ.settlementIds[0]];
  const t0 = -years * MINUTES_PER_YEAR;
  const isCreator = source === 'creator';
  const founding = recordEvent(world, {
    t: isCreator ? world.time : t0,
    category: 'founding',
    title: `${civ.name} founded`,
    description: isCreator
      ? `The ${civ.name} arose on ${planet.name}, with ${cap.name} as its capital.`
      : `The ${civ.speciesName} founded ${cap.name} on ${planet.name}, beginning the ${civ.name}.`,
    importance: 5,
    civIds: [civ.id],
    planetId: planet.id,
    settlementId: cap.id,
    cause: isCreator ? 'Introduced through the Creator Console.' : 'Recorded in the founding chronicles generated with the universe.',
    source,
    root: true,
    effects: [{ label: 'Capital', after: cap.name }],
  });
  noteCause(world, [causeKey.civ(civ.id, 'founding'), causeKey.settlement(cap.id)], founding.id);
  for (const sid of civ.settlementIds.slice(1)) {
    const s = world.settlements[sid];
    if (isCreator) {
      noteCause(world, causeKey.settlement(s.id), founding.id);
      continue;
    }
    const ev = recordEvent(world, {
      t: s.foundedAt,
      category: 'founding',
      title: `${s.name} founded`,
      description: `Settlers from ${cap.name} founded ${s.name} in the ${planet.regions[s.regionIndex].name}.`,
      importance: 3,
      civIds: [civ.id],
      planetId: planet.id,
      settlementId: s.id,
      cause: 'Population pressure and new land in the chronicled era.',
      causeIds: [founding.id],
      source: 'chronicle',
    });
    noteCause(world, causeKey.settlement(s.id), ev.id);
  }
  // Starting technologies recorded in plausible order, each citing its prerequisites
  const known = civ.tech.known;
  known.forEach((tid, i) => {
    const t = TECHS.find((x) => x.id === tid)!;
    const prereqCauses = t.prereqs.map((p) => lastCause(world, causeKey.civ(civ.id, `tech_${p}`)));
    const ev = recordEvent(world, {
      t: t0 + ((i + 1) / (known.length + 1)) * years * MINUTES_PER_YEAR * rng.range(0.85, 1),
      category: 'discovery',
      title: `${civ.adjective} scholars develop ${t.name}`,
      description: t.description,
      importance: 2,
      civIds: [civ.id],
      planetId: planet.id,
      cause: t.prereqs.length ? `Built on earlier work: ${t.prereqs.join(', ')}. Chronicled before the simulation began.` : 'Chronicled achievement from before the simulation began.',
      causeIds: prereqCauses.some(Boolean) ? prereqCauses : [founding.id],
      source: isCreator ? 'creator' : 'chronicle',
    });
    noteCause(world, [causeKey.civ(civ.id, `tech_${tid}`), causeKey.civ(civ.id, 'tech')], ev.id);
    if (t.effects.unlocks?.includes('contact')) noteCause(world, causeKey.civ(civ.id, 'contact_tech'), ev.id);
    if (t.effects.unlocks?.includes('colonize')) noteCause(world, causeKey.civ(civ.id, 'colonize_tech'), ev.id);
  });
  const leader = civ.government.leaderId ? world.characters[civ.government.leaderId] : null;
  if (leader) {
    const ev = recordEvent(world, {
      t: civ.government.termStart,
      category: 'politics',
      title: `${fullName(leader)} becomes ${civ.government.leaderTitle}`,
      description: `${fullName(leader)} took office as ${civ.government.leaderTitle} of the ${civ.name} (${civ.government.type}).`,
      importance: 4,
      civIds: [civ.id],
      characterIds: [leader.id],
      cause: `Selected by ${civ.government.type === 'Republic' || civ.government.type === 'Commune' ? 'popular vote' : civ.government.type === 'Monarchy' ? 'hereditary succession' : 'appointment by peers'}.`,
      causeIds: [founding.id],
      source: isCreator ? 'creator' : 'chronicle',
    });
    noteCause(world, [causeKey.civ(civ.id, 'leader'), causeKey.char(leader.id)], ev.id);
  }
  // Every inhabitant's story begins with the founding of their home.
  for (const ch of Object.values(world.characters)) {
    if (ch.civId !== civ.id || world.causes[causeKey.char(ch.id)]) continue;
    const origin = lastCause(world, causeKey.settlement(ch.settlementId));
    if (origin) noteCause(world, causeKey.char(ch.id), origin);
  }
}
