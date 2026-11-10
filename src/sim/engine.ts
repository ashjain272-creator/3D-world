/**
 * Simulation engine: advances the world clock in bounded steps and
 * schedules subsystems at their natural cadence.
 *
 *  - Agents: event-driven — each re-plans only when its activity ends.
 *  - Daily: environment, economy, population, research, satisfaction, trade,
 *           individual life events.
 *  - Weekly: migration.
 *  - Monthly: politics, expansion, diplomacy, emergent conditions, statistics.
 *
 * The engine never touches rendering or React. Callers decide how much
 * simulated time to advance per real frame; a time budget keeps long catch-up
 * runs (offline progress, fast-forward) from blocking the UI.
 */
import { Rng, clamp } from './rng';
import { characterVersion } from './world';
import type { Character, Civilization, World } from './types';
import { DAYS_PER_MONTH, MINUTES_PER_DAY, dayIndex } from './time';
import { civModifiers, researchTick, type Modifiers } from './systems/technology';
import { economyTick, structuralTick, tradeTick, type DayContext } from './systems/economy';
import { expansionTick, migrationTick, populationTick } from './systems/population';
import { politicsTick, satisfactionTick } from './systems/politics';
import { diplomacyTick } from './systems/diplomacy';
import { characterDaily, characterStep, replenishNotables } from './systems/characters';
import { environmentTick, societalConditionsTick } from './systems/environment';
import { backgroundTarget } from './generate/society';
import { thresholdTick } from './systems/thresholds';
import { maintainHistory } from './history';

interface EngineState {
  ctx: DayContext;
  living: Character[];
  livingDay: number;
  livingCount: number;
}

const states = new WeakMap<World, EngineState>();

function stateFor(world: World): EngineState {
  let s = states.get(world);
  if (!s) {
    s = { ctx: { work: new Map() }, living: [], livingDay: -1, livingCount: -1 };
    states.set(world, s);
  }
  return s;
}

/**
 * The list of living agents is rebuilt whenever the population of tracked
 * individuals changes. It is checked at the start of every step, so results
 * do not depend on how a span of time is split across advance() calls.
 */
function refreshLiving(world: World, st: EngineState): void {
  const count = characterVersion(world);
  const day = dayIndex(world.time);
  if (st.livingCount === count && st.livingDay === day) return;
  st.living = Object.values(world.characters).filter((c) => c.alive);
  st.livingDay = day;
  st.livingCount = count;
}

export function worldRng(world: World): Rng {
  const r = new Rng(1);
  r.state = world.rngState >>> 0;
  return r;
}

export function activeCivs(world: World): Civilization[] {
  return Object.values(world.civs).filter((c) => !c.extinct);
}

/** Tracked foreground individuals per civilisation (the rest are background). */
export function foregroundTarget(civ: Civilization): number {
  return clamp(20 + civ.settlementIds.length * 6, 24, 70);
}

export function characterTarget(world: World, civ: Civilization): number {
  return foregroundTarget(civ) + backgroundTarget(world, civ);
}

const STEP = 30; // minutes

export interface AdvanceResult {
  advanced: number;
  eventsAdded: number;
  daysProcessed: number;
}

/**
 * Advance the simulation by `minutes`. If `budgetMs` is given, stops early
 * when the real-time budget is exhausted and reports how far it got.
 */
export function advance(world: World, minutes: number, budgetMs = Infinity): AdvanceResult {
  const rng = worldRng(world);
  const st = stateFor(world);
  const startEvents = world.events.length;
  const start = world.time;
  const target = world.time + minutes;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let days = 0;
  refreshLiving(world, st);
  while (world.time < target) {
    const prevDay = dayIndex(world.time);
    // Steps land on an absolute 30-minute grid, so results never depend on
    // how a span of time is split across calls. A partial step just moves the
    // clock; everything due is processed at the next grid point.
    const nextGrid = (Math.floor(world.time / STEP) + 1) * STEP;
    if (nextGrid > target) {
      world.time = target;
      break;
    }
    world.time = nextGrid;
    refreshLiving(world, st);
    for (const c of st.living) if (c.alive && world.time >= c.nextDecisionAt) characterStep(world, rng, c, st.ctx);
    const day = dayIndex(world.time);
    if (day !== prevDay) {
      for (let d = prevDay + 1; d <= day; d++) {
        dailyTick(world, rng, st, d);
        days++;
      }
      refreshLiving(world, st);
      if (budgetMs !== Infinity) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - t0 > budgetMs) break;
      }
    }
  }
  world.stats.ticks += 1;
  world.rngState = rng.state;
  return { advanced: world.time - start, eventsAdded: world.events.length - startEvents, daysProcessed: days };
}

function dailyTick(world: World, rng: Rng, st: EngineState, day: number): void {
  const civs = activeCivs(world);
  const mods = new Map<string, Modifiers>();
  for (const civ of civs) mods.set(civ.id, civModifiers(world, civ));
  environmentTick(world, rng);
  const research = new Map<string, number>();
  for (const civ of civs) research.set(civ.id, st.ctx.work.get(civ.id)?.research_points ?? 0);
  for (const civ of civs) {
    const m = mods.get(civ.id)!;
    economyTick(world, rng, civ, m, st.ctx);
    populationTick(world, civ, m);
    researchTick(world, rng, civ, research, m);
    satisfactionTick(world, civ, m);
    thresholdTick(world, civ);
  }
  tradeTick(world, civs, mods, st.ctx);
  for (const c of st.living) {
    if (!c.alive) continue;
    characterDaily(world, rng, c, mods.get(c.civId)?.health ?? 0);
  }
  if (day % 7 === 0) for (const civ of civs) migrationTick(world, rng, civ);
  if (day % DAYS_PER_MONTH === 0) monthlyTick(world, rng, civs, mods);
  st.ctx.work.clear();
}

function monthlyTick(world: World, rng: Rng, civs: Civilization[], mods: Map<string, Modifiers>): void {
  for (const civ of civs) {
    const m = civModifiers(world, civ);
    mods.set(civ.id, m);
    politicsTick(world, rng, civ, m);
    expansionTick(world, rng, civ, m);
    structuralTick(world, rng, civ);
    societalConditionsTick(world, rng, civ, m.health);
    replenishNotables(world, rng, civ, characterTarget(world, civ), foregroundTarget(civ));
    snapshot(world, civ);
  }
  diplomacyTick(world, rng, mods);
  maintainHistory(world);
}

export function snapshot(world: World, civ: Civilization): void {
  const pop = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0), 0);
  civ.stats.push({
    t: Math.floor(world.time / MINUTES_PER_DAY),
    population: Math.round(pop),
    gdp: Math.round(civ.economy.gdp),
    stability: +civ.stability.toFixed(1),
    satisfaction: +civ.satisfaction.toFixed(1),
    techs: civ.tech.known.length,
    treasury: Math.round(civ.economy.treasury),
  });
  if (civ.stats.length > 400) {
    // thin the older half to keep long histories compact
    const half = Math.floor(civ.stats.length / 2);
    civ.stats = [...civ.stats.slice(0, half).filter((_, i) => i % 2 === 0), ...civ.stats.slice(half)];
  }
}
