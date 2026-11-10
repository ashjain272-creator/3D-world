import type { Rng } from '../rng';
import { clamp } from '../rng';
import { GOVERNMENTS, POLICIES, SPECIALIZATION_OUTPUT } from '../data/society';
import { GOODS, type Civilization, type Good, type Planet, type Settlement, type Specialization, type World } from '../types';
import { causeKey, gatherCauses, getRelation, lastCause, noteCause, recordEvent } from '../world';
import { MINUTES_PER_YEAR } from '../time';
import type { Modifiers } from './technology';

/** Baseline output per million employed per day, before specialisation. */
const BASE_OUTPUT: Record<Good, number> = { food: 0.62, materials: 0.26, energy: 0.42, goods: 0.3 };
/** Consumption per million inhabitants per day. */
export const CONSUMPTION: Record<Good, number> = { food: 0.55, materials: 0.2, energy: 0.38, goods: 0.32 };
const GOOD_VALUE: Record<Good, number> = { food: 900, materials: 1100, energy: 1000, goods: 1500 };

export interface DayContext {
  /** Work contributions by individuals today, keyed by civ id → sector → skill points. */
  work: Map<string, Record<string, number>>;
}

export function climateFoodFactor(planet: Planet): number {
  const env = planet.environment;
  const temp = planet.baseTemperature + env.temperatureOffset;
  const tempPenalty = clamp(1 - Math.max(0, Math.abs(temp - 16) - 8) / 40, 0.15, 1.1);
  return tempPenalty * env.climateYield;
}

export function settlementJobs(s: Settlement): number {
  return s.population * (0.42 + s.infrastructure * 0.03);
}

/** Compute one day of production and consumption for a civilisation. */
export function economyTick(world: World, rng: Rng, civ: Civilization, mods: Modifiers, ctx: DayContext): void {
  const e = civ.economy;
  const prod: Record<Good, number> = { food: 0, materials: 0, energy: 0, goods: 0 };
  const cons: Record<Good, number> = { food: 0, materials: 0, energy: 0, goods: 0 };
  const work = ctx.work.get(civ.id) ?? {};
  // individuals' work adds a small, real boost to their sector
  const workBoost = (sector: string) => 1 + Math.min(0.12, (work[sector] ?? 0) / 4000);
  const energyRatio = e.consumption.energy > 0 ? clamp((e.stockpile.energy + e.production.energy) / e.consumption.energy, 0, 1) : 1;
  const energyFactor = 0.7 + 0.3 * energyRatio;
  let employedTotal = 0;
  let workforceTotal = 0;

  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    if (!s) continue;
    const planet = world.planets[s.planetId];
    const region = planet.regions[s.regionIndex];
    const workforce = s.population * 0.56;
    const jobs = settlementJobs(s);
    s.employment = clamp(jobs / Math.max(1, workforce), 0, 1);
    const employed = workforce * s.employment;
    employedTotal += employed;
    workforceTotal += workforce;
    const empM = employed / 1e6;
    const infra = 0.75 + s.infrastructure * 0.05;
    const spec = SPECIALIZATION_OUTPUT[s.specialization];
    const res: Record<Good, number> = {
      food: (0.35 + region.fertility * 0.9) * climateFoodFactor(planet),
      materials: 0.45 + region.resources.metals * 0.9,
      energy: 0.45 + region.resources.energy * 0.9,
      goods: 1,
    };
    for (const g of GOODS) {
      const out = empM * (BASE_OUTPUT[g] + (spec[g] ?? 0)) * res[g] * mods.production[g] * infra * energyFactor;
      prod[g] += out;
    }
    const popM = s.population / 1e6;
    // Living standards rise with technology: people expect more goods and energy.
    const standard = 1 + Math.max(0, civ.tech.known.length - 6) * 0.025;
    for (const g of GOODS) cons[g] += popM * CONSUMPTION[g] * (g === 'food' ? 1 : standard);
  }
  prod.food *= workBoost('agriculture');
  prod.goods *= workBoost('industry');
  prod.materials *= workBoost('mining');
  prod.energy *= workBoost('energy');
  // goods manufacturing draws on materials
  cons.materials += prod.goods * 0.25;

  e.employment = workforceTotal > 0 ? employedTotal / workforceTotal : 0;
  let gdp = 0;
  for (const g of GOODS) {
    e.production[g] = prod[g];
    e.consumption[g] = cons[g];
    e.stockpile[g] = Math.max(0, e.stockpile[g] + prod[g] - cons[g]);
    // Storage limits: reserves beyond ~4 months spoil or are written off.
    const excess = e.stockpile[g] - cons[g] * 120;
    e.stockpile[g] -= e.stockpile[g] * (g === 'food' ? 0.002 : 0.0005) + (excess > 0 ? excess * 0.03 : 0);
    const days = e.stockpile[g] / Math.max(1e-6, cons[g]);
    // Scarcity pricing: fewer days of supply → higher prices.
    const target = clamp(Math.pow(45 / Math.max(2, days), 0.35), 0.4, 3.5);
    e.prices[g] = e.prices[g] + (target - e.prices[g]) * 0.1;
    gdp += prod[g] * e.prices[g] * GOOD_VALUE[g];
  }
  e.gdp = gdp;

  // Treasury: taxes minus policy upkeep.
  const popM = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0), 0) / 1e6;
  let upkeep = 0;
  for (const pid of civ.government.policies) upkeep += (POLICIES[pid].treasuryPerCapita ?? 0) * popM * 7;
  const income = gdp * e.taxRate * 0.1;
  e.treasury += income - upkeep + e.tradeIncome;
  e.tradeIncome = 0;

  // Inequality drifts toward a target set by government, policy and culture.
  let ineqTarget = 0.35 + GOVERNMENTS[civ.government.type].inequalityBias - civ.culture.values.collectivism * 0.08;
  for (const pid of civ.government.policies) ineqTarget += POLICIES[pid].inequality ?? 0;
  e.inequality = clamp(e.inequality + (ineqTarget - e.inequality) * 0.004 + rng.normal(0, 0.0015), 0.1, 0.85);

  // Infrastructure investment when treasury and materials allow.
  if (e.treasury > popM * 150 && e.stockpile.materials > cons.materials * 20) {
    const target = civ.settlementIds
      .map((id) => world.settlements[id])
      .filter((s): s is Settlement => !!s && s.infrastructure < 10)
      .sort((a, b) => b.population / b.capacity - a.population / a.capacity)[0];
    if (target) {
      const engineerBoost = 1 + Math.min(0.5, (work.industry ?? 0) / 2000);
      const step = 0.004 * engineerBoost;
      target.infrastructure = Math.min(10, target.infrastructure + step);
      e.treasury -= popM * 6;
      e.stockpile.materials -= cons.materials * 0.3;
    }
  }
  // Housing capacity follows infrastructure and technology.
  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    if (!s) continue;
    const kindBase = s.kind === 'capital' ? 3.4e6 : s.kind === 'city' ? 1.1e6 : s.kind === 'town' ? 2.2e5 : 3e4;
    const target = kindBase * (0.55 + s.infrastructure * 0.09) * mods.capacity;
    s.capacity = s.capacity + (target - s.capacity) * 0.01;
  }

  trackShortages(world, civ);
}

/** Detect the start and end of shortages, recording causally-linked events. */
function trackShortages(world: World, civ: Civilization): void {
  const e = civ.economy;
  for (const g of GOODS) {
    const key = `shortage_${g}`;
    const days = e.stockpile[g] / Math.max(1e-6, e.consumption[g]);
    const deficit = e.production[g] + Math.max(0, e.netTrade[g]) < e.consumption[g];
    if (!civ.conditions[key] && days < 3 && deficit) {
      civ.conditions[key] = 1;
      const planet = world.planets[civ.homeworldId];
      const K = (t: string) => causeKey.civ(civ.id, t);
      const causeIds: (string | undefined)[] = [];
      let cause = `${g} production (${e.production[g].toFixed(2)}/day) fell below consumption (${e.consumption[g].toFixed(2)}/day) and reserves ran out.`;
      if (g === 'food' && planet.environment.disturbanceEventId && planet.environment.disturbanceDays > 0) {
        causeIds.push(planet.environment.disturbanceEventId);
        cause += ` Crop yields were reduced by the ${planet.environment.disturbance}.`;
      }
      causeIds.push(...gatherCauses(world, [K(g === 'food' ? 'th_granaries' : `th_chronic_${g}`), K('disturbance'), K('th_housing'), K('retool'), K('disaster'), K('policy')], 3, 2 * MINUTES_PER_YEAR));
      if (!causeIds.some(Boolean)) causeIds.push(lastCause(world, K('th_deficit')) ?? lastCause(world, K('leader')));
      const ev = recordEvent(world, {
        category: 'economy',
        title: g === 'food' ? `Famine grips the ${civ.name}` : `${cap(g)} shortage in the ${civ.name}`,
        description: g === 'food' ? 'Granaries are empty; rationing begins across the realm.' : `Reserves of ${g} are exhausted. Prices soar and output suffers.`,
        importance: g === 'food' ? 4 : 3,
        civIds: [civ.id],
        cause,
        causeIds: causeIds.slice(0, 4),
        effects: [
          { label: `${cap(g)} price`, before: '1.0×', after: `${e.prices[g].toFixed(2)}×` },
          { label: 'Satisfaction', after: 'falling' },
        ],
      });
      noteCause(world, [K(key), K('shortage'), K('disaster')], ev.id);
    } else if (civ.conditions[key]) {
      civ.conditions[key] += 1;
      if (days > 12) {
        const dur = civ.conditions[key];
        delete civ.conditions[key];
        const K = (t: string) => causeKey.civ(civ.id, t);
        const end = recordEvent(world, {
          category: 'economy',
          title: g === 'food' ? `Famine ends in the ${civ.name}` : `${cap(g)} shortage eases in the ${civ.name}`,
          description: `After ${dur} days, reserves of ${g} have recovered.`,
          importance: 2,
          civIds: [civ.id],
          cause: `Production and trade restored ${days.toFixed(0)} days of ${g} reserves.`,
          causeIds: [lastCause(world, K(key)), ...gatherCauses(world, [K('disturbance_end'), K('retool'), K('trade'), K('policy_agrarian_subsidies'), K('policy_industrial_drive')], 2, MINUTES_PER_YEAR)],
          effects: [{ label: `${cap(g)} reserves`, after: `${days.toFixed(0)} days` }],
        });
        noteCause(world, [K(`shortage_end_${g}`), K('shortage_end')], end.id);
      }
    }
  }
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Bilateral trade between civilisations in contact. Surpluses flow to
 * deficits; both sides earn income. Trade treaties make trade far more
 * efficient, open markets help, protectionism hinders.
 */
export function tradeTick(world: World, civs: Civilization[], mods: Map<string, Modifiers>, ctx: DayContext): void {
  for (const c of civs) for (const g of GOODS) c.economy.netTrade[g] = 0;
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const a = civs[i];
      const b = civs[j];
      const rel = getRelation(world, a.id, b.id);
      if (!rel || rel.contactAt === null || rel.status === 'rivalry') continue;
      const hasTreaty = rel.treaties.some((t) => t.kind === 'trade' || t.kind === 'alliance');
      if (!hasTreaty && rel.opinion < 0) continue;
      const merchantA = (ctx.work.get(a.id)?.trade ?? 0) / 3000;
      const merchantB = (ctx.work.get(b.id)?.trade ?? 0) / 3000;
      const sameWorld = a.homeworldId === b.homeworldId;
      const eff =
        (hasTreaty ? 0.5 : 0.12) *
        Math.min(mods.get(a.id)!.trade, mods.get(b.id)!.trade) *
        (sameWorld ? 1 : 0.6) *
        (1 + Math.min(0.3, merchantA + merchantB));
      let volume = 0;
      for (const g of GOODS) {
        const da = a.economy.stockpile[g] / Math.max(1e-6, a.economy.consumption[g]);
        const db = b.economy.stockpile[g] / Math.max(1e-6, b.economy.consumption[g]);
        const [from, to, dFrom, dTo] = da > db ? [a, b, da, db] : [b, a, db, da];
        if (dFrom < 40 || dTo > 30) continue;
        const surplus = from.economy.stockpile[g] - from.economy.consumption[g] * 40;
        const need = to.economy.consumption[g] * 30 - to.economy.stockpile[g];
        const amount = Math.max(0, Math.min(surplus, need) * eff * 0.1);
        if (amount <= 0) continue;
        from.economy.stockpile[g] -= amount;
        to.economy.stockpile[g] += amount;
        from.economy.netTrade[g] -= amount;
        to.economy.netTrade[g] += amount;
        const value = amount * GOOD_VALUE[g] * ((from.economy.prices[g] + to.economy.prices[g]) / 2);
        from.economy.tradeIncome += value * 0.06;
        to.economy.tradeIncome += value * 0.02; // importers gain from avoided shortage
        volume += value;
      }
      rel.tradeVolume = rel.tradeVolume * 0.97 + volume * 0.03;
    }
  }
}

const SPEC_FOR_GOOD: Record<Good, Specialization> = { food: 'agriculture', materials: 'mining', energy: 'energy', goods: 'industry' };

/**
 * Monthly structural adaptation: a chronic shortage leads one non-capital
 * settlement to retool toward producing the missing good, and the state
 * adjusts taxes to keep the treasury in a sensible range.
 */
export function structuralTick(world: World, rng: Rng, civ: Civilization): void {
  const e = civ.economy;
  const popM = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0), 0) / 1e6;
  // Fiscal policy
  const before = e.taxRate;
  if (e.treasury > popM * 900 && e.taxRate > 0.08) e.taxRate = Math.max(0.08, e.taxRate - 0.01);
  else if (e.treasury < 0 && e.taxRate < 0.45) e.taxRate = Math.min(0.45, e.taxRate + 0.015);
  if (Math.abs(e.taxRate - (civ.conditions.tax_reported ?? before)) >= 0.05) {
    const up = e.taxRate > (civ.conditions.tax_reported ?? before);
    const K = (t: string) => causeKey.civ(civ.id, t);
    const tax = recordEvent(world, {
      category: 'economy',
      title: `${civ.name} ${up ? 'raises' : 'cuts'} taxes`,
      description: `The tax rate now stands at ${(e.taxRate * 100).toFixed(0)}%.`,
      importance: 2,
      civIds: [civ.id],
      cause: up ? `The treasury fell into deficit (${Math.round(e.treasury)}).` : `A large treasury surplus (${Math.round(e.treasury)}) allowed relief for taxpayers.`,
      causeIds: [lastCause(world, K(up ? 'th_deficit' : 'th_surplus')), ...gatherCauses(world, [K('tax'), K('policy')], 1)],
      effects: [{ label: 'Tax rate', before: `${((civ.conditions.tax_reported ?? before) * 100).toFixed(0)}%`, after: `${(e.taxRate * 100).toFixed(0)}%` }],
    });
    civ.conditions.tax_reported = e.taxRate;
    noteCause(world, [K(up ? 'tax_up' : 'tax_down'), K('tax')], tax.id);
  }
  if (civ.conditions.tax_reported === undefined) civ.conditions.tax_reported = e.taxRate;
  // Retooling under chronic shortage
  let worst: Good | null = null;
  let worstRatio = 0.92;
  for (const g of GOODS) {
    const ratio = (e.production[g] + Math.max(0, e.netTrade[g])) / Math.max(1e-6, e.consumption[g]);
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = g;
    }
  }
  if (!worst) {
    delete civ.conditions.chronic;
    return;
  }
  civ.conditions.chronic = (civ.conditions.chronic ?? 0) + 1;
  const K = (t: string) => causeKey.civ(civ.id, t);
  if (civ.conditions.chronic === 3) {
    const shortfall = recordEvent(world, {
      category: 'economy',
      title: `Persistent ${worst} shortfall in the ${civ.name}`,
      description: `For three months ${worst} supply has covered only ${(worstRatio * 100).toFixed(0)}% of consumption.`,
      importance: 1,
      civIds: [civ.id],
      cause: 'Output failed to keep pace with consumption.',
      causeIds: gatherCauses(world, [K(`shortage_${worst}`), K('disturbance'), K('th_housing'), K('retool'), K('tech'), K('policy'), K('leader')], 3),
      trigger: { kind: 'threshold', text: `${worst} supply below 92% of consumption for three months` },
    });
    noteCause(world, K(`th_chronic_${worst}`), shortfall.id);
  }
  if (civ.conditions.chronic < 3 || !rng.chance(0.4)) return;
  const want = SPEC_FOR_GOOD[worst];
  const candidates = civ.settlementIds
    .map((id) => world.settlements[id])
    .filter((s): s is Settlement => !!s && s.kind !== 'capital' && s.specialization !== want)
    .sort((a, b) => {
      const ra = world.planets[a.planetId].regions[a.regionIndex];
      const rb = world.planets[b.planetId].regions[b.regionIndex];
      const fit = (r: typeof ra) => (want === 'agriculture' ? r.fertility : want === 'mining' ? r.resources.metals : want === 'energy' ? r.resources.energy : 0.5);
      return fit(rb) - fit(ra);
    });
  const s = candidates[0];
  if (!s) return;
  const prev = s.specialization;
  s.specialization = want;
  s.infrastructure = Math.max(1, s.infrastructure - 0.3);
  civ.conditions.chronic = 0;
  const retool = recordEvent(world, {
    category: 'economy',
    title: `${s.name} retools toward ${want}`,
    description: `Facing persistent ${worst} shortfalls, ${s.name} converted its economy from ${prev} to ${want}.`,
    importance: 3,
    civIds: [civ.id],
    settlementId: s.id,
    cause: `${worst} supply covered only ${(worstRatio * 100).toFixed(0)}% of consumption for three months.`,
    causeIds: [lastCause(world, K(`th_chronic_${worst}`)), lastCause(world, K(`shortage_${worst}`)), lastCause(world, causeKey.settlement(s.id))],
    effects: [
      { label: 'Specialisation', before: prev, after: want },
      { label: 'Infrastructure', after: 'temporarily reduced' },
    ],
  });
  noteCause(world, [K('retool'), causeKey.settlement(s.id)], retool.id);
}
