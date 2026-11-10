import type { Rng } from '../rng';
import { clamp } from '../rng';
import { hasSurface, isHabitableType } from '../generate/cosmos';
import { createCharacter, createSettlement } from '../generate/society';
import type { Civilization, Planet, Settlement, SettlementKind, World } from '../types';
import { MINUTES_PER_YEAR } from '../time';
import { addMemory, causeKey, fullName, gatherCauses, lastCause, noteCause, recordEvent } from '../world';
import type { Modifiers } from './technology';

const BASE_BIRTH = 0.019; // per year
const BASE_DEATH = 0.011;

/** Daily births and deaths for every settlement of a civilisation. */
export function populationTick(world: World, civ: Civilization, mods: Modifiers): void {
  const e = civ.economy;
  const famine = !!civ.conditions.shortage_food;
  const plague = civ.conditions.plague ?? 0;
  const goldenAge = civ.conditions.golden_age ?? 0;
  let births = 0;
  let deaths = 0;
  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    if (!s) continue;
    const crowd = s.population / Math.max(1, s.capacity);
    const housing = crowd > 1 ? clamp(1 - (crowd - 1) * 3, 0.1, 1) : 1;
    const happy = 0.7 + s.happiness / 170;
    const foodDays = e.stockpile.food / Math.max(1e-6, e.consumption.food);
    const foodF = famine ? 0.35 : clamp(0.6 + foodDays / 60, 0.6, 1.15);
    const b = BASE_BIRTH * (1 + mods.growth) * housing * happy * foodF * (goldenAge ? 1.1 : 1);
    const d = BASE_DEATH * (1 - Math.min(0.6, mods.health * 0.45)) * (famine ? 2.2 : 1) * (plague ? 3.5 : 1) * (crowd > 1.1 ? 1.2 : 1);
    const bn = (s.population * b) / 360;
    const dn = (s.population * d) / 360;
    births += bn;
    deaths += dn;
    s.population = Math.max(50, s.population + bn - dn);
    // Local happiness tracks the realm plus local jobs and housing.
    const local = civ.satisfaction + (s.employment - 0.88) * 60 - Math.max(0, crowd - 1) * 50;
    s.happiness = s.happiness + (clamp(local, 0, 100) - s.happiness) * 0.05;
    maybeUpgrade(world, civ, s);
  }
  world.stats.totalBirths += births;
  world.stats.totalDeaths += deaths;
}

const UPGRADE: { from: SettlementKind; to: SettlementKind; at: number }[] = [
  { from: 'outpost', to: 'town', at: 40000 },
  { from: 'colony', to: 'town', at: 40000 },
  { from: 'town', to: 'city', at: 300000 },
];

function maybeUpgrade(world: World, civ: Civilization, s: Settlement): void {
  for (const u of UPGRADE) {
    if (s.kind === u.from && s.population >= u.at) {
      s.kind = u.to;
      const K = (t: string) => causeKey.civ(civ.id, t);
      const ev = recordEvent(world, {
        category: 'population',
        title: `${s.name} grows into a ${u.to}`,
        description: `With ${Math.round(s.population).toLocaleString()} inhabitants, ${s.name} is now counted among the ${u.to === 'city' ? 'great cities' : 'towns'} of the ${civ.name}.`,
        importance: u.to === 'city' ? 3 : 2,
        civIds: [civ.id],
        settlementId: s.id,
        cause: `Sustained population growth (housing capacity ${Math.round(s.capacity).toLocaleString()}, happiness ${Math.round(s.happiness)}).`,
        causeIds: [lastCause(world, causeKey.settlement(s.id)), ...gatherCauses(world, [K('golden_age'), K('migration'), K('tech')], 2)],
        effects: [{ label: 'Status', before: u.from, after: u.to }],
      });
      noteCause(world, [causeKey.settlement(s.id), K('growth')], ev.id);
    }
  }
}

/** Weekly internal migration from less to more attractive settlements. */
export function migrationTick(world: World, rng: Rng, civ: Civilization): void {
  const list = civ.settlementIds.map((id) => world.settlements[id]).filter(Boolean) as Settlement[];
  if (list.length < 2) return;
  const attract = (s: Settlement) => s.happiness + s.employment * 40 + clamp((s.capacity - s.population) / s.capacity, -0.5, 0.5) * 60;
  const sorted = [...list].sort((a, b) => attract(a) - attract(b));
  const from = sorted[0];
  const to = sorted[sorted.length - 1];
  const gap = attract(to) - attract(from);
  if (gap < 8) return;
  const movers = from.population * Math.min(0.004, gap / 8000) * rng.range(0.7, 1.3);
  from.population -= movers;
  to.population += movers;
  // Individuals may follow the trend.
  if (rng.chance(0.15)) {
    const candidates = Object.values(world.characters).filter(
      (c) => c.alive && c.settlementId === from.id && c.id !== civ.government.leaderId && c.personality.openness > 0.45 && (world.time - c.birthTime) / MINUTES_PER_YEAR > 18,
    );
    if (candidates.length) {
      const c = rng.pick(candidates);
      c.settlementId = to.id;
      c.homeSettlementId = to.id;
      addMemory(c, { t: world.time, text: `Moved from ${from.name} to ${to.name} looking for a better life.`, valence: 0.3, importance: 3 });
      const mev = recordEvent(world, {
        category: 'personal',
        title: `${fullName(c)} moves to ${to.name}`,
        description: `${c.givenName} left ${from.name} for ${to.name}, part of a wave of migrants.`,
        importance: 1,
        civIds: [civ.id],
        settlementId: to.id,
        characterIds: [c.id],
        cause: `${to.name} offered better prospects (attractiveness ${attract(to).toFixed(0)} vs ${attract(from).toFixed(0)}).`,
        causeIds: [lastCause(world, causeKey.char(c.id)), lastCause(world, causeKey.settlement(to.id))],
      });
      noteCause(world, [causeKey.char(c.id), causeKey.civ(civ.id, 'migration')], mev.id);
    }
  }
}

/**
 * Monthly expansion: crowded, stable, solvent civilisations found new
 * settlements in adjacent unclaimed regions — or, with the right technology,
 * on other planets.
 */
export function expansionTick(world: World, rng: Rng, civ: Civilization, mods: Modifiers): void {
  const list = civ.settlementIds.map((id) => world.settlements[id]).filter(Boolean) as Settlement[];
  if (!list.length) return;
  const pop = list.reduce((a, s) => a + s.population, 0);
  const cap = list.reduce((a, s) => a + s.capacity, 0);
  const pressure = pop / Math.max(1, cap);
  const expansionist = civ.government.policies.includes('expansionism');
  const threshold = expansionist ? 0.7 : 0.82;
  const popM = pop / 1e6;
  if (pressure < threshold || civ.stability < 40 || civ.economy.treasury < popM * 15) return;
  if (!rng.chance((expansionist ? 0.12 : 0.06) * (1 + (pressure - threshold) * 4))) return;

  // Option A: neighbouring region on an owned planet
  const options: { planet: Planet; region: number; score: number }[] = [];
  for (const pid of civ.planetIds) {
    const planet = world.planets[pid];
    for (const s of list.filter((x) => x.planetId === pid)) {
      for (const ri of planet.regions[s.regionIndex].neighbors) {
        const r = planet.regions[ri];
        if (r.biome === 'ocean' || (r.ownerCivId && r.ownerCivId !== civ.id)) continue;
        if (list.some((x) => x.planetId === pid && x.regionIndex === ri)) continue;
        if (!r.explored && !rng.chance(0.3)) continue;
        options.push({ planet, region: ri, score: r.fertility + r.resources.metals * 0.4 + r.resources.energy * 0.3 + (r.ownerCivId === civ.id ? 0.4 : 0) });
      }
    }
  }
  // Option B: colonise another planet
  if (mods.canColonize && (options.length === 0 || rng.chance(0.25))) {
    const home = world.planets[civ.homeworldId];
    const candidates = Object.values(world.planets).filter(
      (p) =>
        hasSurface(p.type) &&
        p.id !== home.id &&
        (mods.interstellar || p.systemId === home.systemId || civ.planetIds.some((id) => world.planets[id]?.systemId === p.systemId)) &&
        p.regions.some((r) => !r.ownerCivId && r.biome !== 'ocean'),
    );
    for (const p of candidates) {
      const free = p.regions.filter((r) => !r.ownerCivId && r.biome !== 'ocean');
      const best = free.sort((a, b) => b.fertility - a.fertility)[0];
      options.push({ planet: p, region: best.index, score: (isHabitableType(p.type) ? 1 : 0.3) + p.habitability + best.fertility * 0.5 + 0.6 });
    }
  }
  if (!options.length) return;
  const choice = options.sort((a, b) => b.score - a.score)[0];
  const offworld = !civ.planetIds.includes(choice.planet.id);
  const source = [...list].sort((a, b) => b.population / b.capacity - a.population / a.capacity)[0];
  const settlers = Math.round(Math.min(source.population * 0.04, offworld ? rng.range(3000, 9000) : rng.range(8000, 25000)));
  source.population -= settlers;
  const s = createSettlement(world, rng, civ, choice.planet, choice.region, offworld ? 'colony' : 'outpost', settlers, world.time);
  civ.economy.treasury -= popM * (offworld ? 30 : 12);
  const region = choice.planet.regions[choice.region];
  const ev = recordEvent(world, {
    category: 'founding',
    title: offworld ? `${civ.adjective} colony founded on ${choice.planet.name}` : `${s.name} founded`,
    description: offworld
      ? `Colonists from ${source.name} crossed the void to establish ${s.name} in the ${region.name} of ${choice.planet.name}.`
      : `${settlers.toLocaleString()} settlers from ${source.name} founded ${s.name} in the ${region.name}.`,
    importance: offworld ? 5 : 3,
    civIds: [civ.id],
    planetId: choice.planet.id,
    settlementId: s.id,
    cause: `Population pressure at ${(pressure * 100).toFixed(0)}% of housing capacity${expansionist ? ' and an Expansionism policy' : ''}, with a stable treasury.${offworld ? ' Colonisation technology made the voyage possible.' : ''}`,
    causeIds: [
      lastCause(world, causeKey.civ(civ.id, 'th_housing')),
      offworld ? lastCause(world, causeKey.civ(civ.id, 'colonize_tech')) : undefined,
      lastCause(world, causeKey.civ(civ.id, 'explore')),
      expansionist ? lastCause(world, causeKey.civ(civ.id, 'policy_expansionism')) : undefined,
      lastCause(world, causeKey.settlement(source.id)),
    ],
    effects: [
      { label: 'Settlements', before: list.length, after: list.length + 1 },
      { label: `${source.name} population`, before: Math.round(source.population + settlers), after: Math.round(source.population) },
    ],
  });
  noteCause(world, [causeKey.settlement(s.id), causeKey.civ(civ.id, 'expansion')], ev.id);
  // A few named pioneers go with them.
  const pioneers = Object.values(world.characters)
    .filter((c) => c.alive && c.settlementId === source.id && c.id !== civ.government.leaderId && c.personality.openness > 0.5)
    .slice(0, 2);
  for (const c of pioneers) {
    c.settlementId = s.id;
    c.homeSettlementId = s.id;
    addMemory(c, { t: world.time, text: `Helped found ${s.name}${offworld ? ` on ${choice.planet.name}` : ''}.`, valence: 0.7, importance: 5, eventId: ev.id });
    ev.characterIds.push(c.id);
    c.eventIds.push(ev.id);
    noteCause(world, causeKey.char(c.id), ev.id);
  }
  // and a newcomer is born into the colony to keep it populated
  if (pioneers.length < 2) noteCause(world, causeKey.char(createCharacter(world, rng, civ, s, { age: rng.int(20, 40) }).id), ev.id);
}
