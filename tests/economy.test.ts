import { describe, expect, it } from 'vitest';
import { advance, worldRng } from '../src/sim/engine';
import { DISTURBANCE_LIST, startDisturbance } from '../src/sim/systems/environment';
import { civModifiers } from '../src/sim/systems/technology';
import { economyTick, tradeTick } from '../src/sim/systems/economy';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { relationKey } from '../src/sim/world';
import { freshWorld } from './helpers';

describe('economy', () => {
  it('a drought reduces food output on the affected planet', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[0];
    const planet = w.planets[civ.homeworldId];
    const ctx = { work: new Map() };
    const rng = worldRng(w);
    economyTick(w, rng, civ, civModifiers(w, civ), ctx);
    const before = civ.economy.production.food;
    startDisturbance(w, rng, planet, DISTURBANCE_LIST[0], 'test');
    economyTick(w, rng, civ, civModifiers(w, civ), ctx);
    expect(civ.economy.production.food).toBeLessThan(before * 0.85);
    expect(w.events.at(-1)!.category).toBe('environment');
  });

  it('a sustained crop failure produces a famine that cites the drought', () => {
    const w = freshWorld('famine');
    const civ = Object.values(w.civs)[0];
    const planet = w.planets[civ.homeworldId];
    const rng = worldRng(w);
    startDisturbance(w, rng, planet, DISTURBANCE_LIST[0], 'test');
    planet.environment.climateYield = 0.15;
    planet.environment.disturbanceDays = 400;
    civ.economy.stockpile.food = 0;
    w.rngState = rng.state;
    advance(w, 40 * MINUTES_PER_DAY);
    const famine = w.events.find((e) => e.title.startsWith('Famine grips') && e.civIds.includes(civ.id));
    expect(famine).toBeDefined();
    expect(famine!.causeIds).toContain(planet.environment.disturbanceEventId);
    expect(civ.conditions.shortage_food).toBeDefined();
  });

  it('trade moves surplus goods to a partner in need', () => {
    const w = freshWorld();
    const [a, b] = Object.values(w.civs);
    const rel = w.relations[relationKey(a.id, b.id)];
    rel.contactAt = 0;
    rel.opinion = 40;
    rel.status = 'trade';
    rel.treaties = [{ kind: 'trade', since: 0 }];
    for (const c of [a, b]) economyTick(w, worldRng(w), c, civModifiers(w, c), { work: new Map() });
    a.economy.stockpile.materials = a.economy.consumption.materials * 110;
    b.economy.stockpile.materials = 0;
    const mods = new Map([a, b].map((c) => [c.id, civModifiers(w, c)]));
    tradeTick(w, [a, b], mods, { work: new Map() });
    expect(b.economy.stockpile.materials).toBeGreaterThan(0);
    expect(a.economy.netTrade.materials).toBeLessThan(0);
    expect(rel.tradeVolume).toBeGreaterThan(0);
  });
});
