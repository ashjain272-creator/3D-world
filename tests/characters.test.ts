import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import { characterStep, die, scoreActivities } from '../src/sim/systems/characters';
import type { World } from '../src/sim/types';
import { freshWorld } from './helpers';

/** Move the clock forward to the given local hour on the first civilisation's homeworld. */
function atHour(w: World, hour: number) {
  const L = w.planets[Object.values(w.civs)[0].homeworldId].dayLengthHours * 60;
  const start = Math.ceil(w.time / L) * L + L;
  w.time = start + (hour / 24) * L;
}

function adultWorker(w: World) {
  const home = Object.values(w.civs)[0].homeworldId;
  return Object.values(w.characters).find((c) => c.alive && c.occupation !== 'student' && c.occupation !== 'retired' && w.civs[c.civId].government.leaderId !== c.id && w.settlements[c.settlementId].planetId === home)!;
}

describe('utility-based characters', () => {
  it('eats when starving', () => {
    const w = freshWorld();
    atHour(w, 12.2);
    const c = adultWorker(w);
    Object.assign(c.needs, { energy: 80, hunger: 3, social: 80, purpose: 80, fun: 80, security: 80 });
    expect(scoreActivities(w, new Rng(1), c, w.time)[0].type).toBe('eat');
  });

  it('sleeps when exhausted at night', () => {
    const w = freshWorld();
    atHour(w, 23.5);
    const c = adultWorker(w);
    Object.assign(c.needs, { energy: 8, hunger: 80, social: 80, purpose: 80, fun: 80, security: 80 });
    expect(scoreActivities(w, new Rng(1), c, w.time)[0].type).toBe('sleep');
  });

  it('a diligent worker works during working hours', () => {
    const w = freshWorld();
    atHour(w, 9.5);
    const c = adultWorker(w);
    c.personality.conscientiousness = 0.95;
    c.goals = [];
    Object.assign(c.needs, { energy: 85, hunger: 85, social: 85, purpose: 40, fun: 85, security: 40 });
    const top = scoreActivities(w, new Rng(1), c, w.time)[0].type;
    expect(['work', 'explore']).toContain(top);
  });

  it('explains every decision', () => {
    const w = freshWorld();
    const c = adultWorker(w);
    c.nextDecisionAt = w.time;
    characterStep(w, new Rng(3), c, { work: new Map() });
    expect(c.activity.reason).toMatch(/utility/);
    expect(c.activity.endsAt).toBeGreaterThan(c.activity.startedAt);
  });

  it('socialising brings a companion along and changes the relationship', () => {
    const w = freshWorld();
    atHour(w, 19);
    const c = adultWorker(w);
    const partner = Object.values(w.characters).find((o) => o.alive && o.id !== c.id && o.settlementId === c.settlementId)!;
    partner.activity = { type: 'leisure', startedAt: w.time - 30, endsAt: w.time + 30, description: 'x' };
    Object.assign(c.needs, { energy: 90, hunger: 90, social: 0, purpose: 90, fun: 90, security: 90 });
    c.personality.extraversion = 1;
    c.relationships = { [partner.id]: { affinity: 60, familiarity: 50, kind: 'friend', since: 0, lastInteraction: 0 } };
    c.nextDecisionAt = w.time;
    const ctx = { work: new Map() };
    characterStep(w, new Rng(5), c, ctx);
    expect(c.activity.type).toBe('socialize');
    const companion = w.characters[c.activity.targetId!];
    expect(companion.activity.type).toBe('socialize');
    expect(companion.activity.targetId).toBe(c.id);
    expect(companion.activity.endsAt).toBe(c.activity.endsAt);
    const before = c.relationships[companion.id]?.familiarity ?? 0;
    w.time = c.activity.endsAt;
    characterStep(w, new Rng(6), c, ctx);
    expect(c.relationships[companion.id].familiarity).toBeGreaterThan(before);
  });

  it('a leader dying triggers succession and memories', () => {
    const w = freshWorld();
    const civ = Object.values(w.civs)[0];
    const leader = w.characters[civ.government.leaderId!];
    const friend = Object.keys(leader.relationships)[0];
    if (friend) leader.relationships[friend].affinity = 80;
    die(w, new Rng(9), leader, 'old age');
    expect(leader.alive).toBe(false);
    expect(civ.government.leaderId).not.toBe(leader.id);
    expect(w.characters[civ.government.leaderId!].alive).toBe(true);
    expect(civ.pastLeaderIds).toContain(leader.id);
    expect(w.events.some((e) => e.title.includes('dies') && e.characterIds.includes(leader.id))).toBe(true);
    if (friend && w.characters[friend].alive) expect(w.characters[friend].memories.some((m) => m.text.includes('Mourned'))).toBe(true);
  });

  it('compacts the record of the dead but keeps their life story and close ties', () => {
    const w = freshWorld();
    const c = adultWorker(w);
    const first = c.memories[0];
    for (let k = 0; k < 30; k++) c.memories.push({ t: w.time + k, text: `Thing ${k}.`, valence: 0, importance: k === 7 ? 5 : 1 });
    const acquaintance = Object.entries(c.relationships).find(([, r]) => r.kind === 'acquaintance')?.[0];
    const close = Object.entries(c.relationships).filter(([, r]) => r.kind !== 'acquaintance').map(([id]) => id);
    die(w, new Rng(1), c, 'old age');
    expect(c.alive).toBe(false);
    expect(c.memories.length).toBeLessThanOrEqual(12);
    expect(c.memories[0]).toEqual(first);
    expect(c.memories.some((m) => m.text === 'Thing 7.')).toBe(true);
    expect(c.recent).toEqual([]);
    for (const id of close) expect(c.relationships[id]).toBeTruthy();
    if (acquaintance) expect(c.relationships[acquaintance]).toBeUndefined();
    expect(Object.values(c.relationships).every((r) => r.kind !== 'acquaintance')).toBe(true);
  });
});
