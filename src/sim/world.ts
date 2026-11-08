import type {
  Character,
  Civilization,
  DiplomaticRelation,
  EventCategory,
  HistoryEvent,
  Id,
  Memory,
  Planet,
  Settlement,
  StateChange,
  World,
} from './types';
import { MINUTES_PER_YEAR } from './time';

export const SCHEMA_VERSION = 3;
export const MAX_EVENTS = 6000;
export const MAX_MEMORIES = 36;

export function newId(world: World, prefix: string): Id {
  world.nextId += 1;
  return `${prefix}${world.nextId.toString(36)}`;
}

export function relationKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getRelation(world: World, a: Id, b: Id): DiplomaticRelation | undefined {
  return world.relations[relationKey(a, b)];
}

export function fullName(c: Pick<Character, 'givenName' | 'familyName'>): string {
  return `${c.givenName} ${c.familyName}`;
}

export function ageOf(c: Character, now: number): number {
  const end = c.alive ? now : c.deathTime ?? now;
  return Math.max(0, Math.floor((end - c.birthTime) / MINUTES_PER_YEAR));
}

export function civPopulation(world: World, civ: Civilization): number {
  let p = 0;
  for (const sid of civ.settlementIds) p += world.settlements[sid]?.population ?? 0;
  return p;
}

export function planetPopulation(world: World, planet: Planet): number {
  let p = 0;
  for (const s of Object.values(world.settlements)) if (s.planetId === planet.id) p += s.population;
  return p;
}

export function settlementsOfPlanet(world: World, planetId: Id): Settlement[] {
  return Object.values(world.settlements).filter((s) => s.planetId === planetId);
}

export function charactersIn(world: World, settlementId: Id): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.settlementId === settlementId);
}

export function livingCharacters(world: World): Character[] {
  return Object.values(world.characters).filter((c) => c.alive);
}

export interface EventInput {
  category: EventCategory;
  title: string;
  description: string;
  importance: 1 | 2 | 3 | 4 | 5;
  civIds?: Id[];
  planetId?: Id;
  systemId?: Id;
  settlementId?: Id;
  characterIds?: Id[];
  cause: string;
  causeIds?: Id[];
  effects?: StateChange[];
  source?: HistoryEvent['source'];
  t?: number;
}

/**
 * Record an event in permanent history. Back-links causes to their
 * consequences and attaches the event to involved characters.
 */
export function recordEvent(world: World, input: EventInput): HistoryEvent {
  const ev: HistoryEvent = {
    id: newId(world, 'e'),
    t: input.t ?? world.time,
    category: input.category,
    title: input.title,
    description: input.description,
    importance: input.importance,
    civIds: input.civIds ?? [],
    planetId: input.planetId,
    systemId: input.systemId,
    settlementId: input.settlementId,
    characterIds: input.characterIds ?? [],
    cause: input.cause,
    causeIds: (input.causeIds ?? []).filter(Boolean),
    effects: input.effects ?? [],
    consequenceIds: [],
    source: input.source ?? 'simulation',
  };
  if (!ev.planetId && ev.settlementId) ev.planetId = world.settlements[ev.settlementId]?.planetId;
  if (!ev.systemId && ev.planetId) ev.systemId = world.planets[ev.planetId]?.systemId;
  world.events.push(ev);
  if (ev.causeIds.length) {
    const lookup = eventIndex(world);
    for (const cid of ev.causeIds) {
      const cause = lookup.get(cid);
      if (cause && !cause.consequenceIds.includes(ev.id)) cause.consequenceIds.push(ev.id);
    }
  }
  for (const cid of ev.characterIds) {
    const ch = world.characters[cid];
    if (ch) {
      ch.eventIds.push(ev.id);
      if (ch.eventIds.length > 60) ch.eventIds.splice(0, ch.eventIds.length - 60);
    }
  }
  if (world.events.length > MAX_EVENTS) pruneEvents(world);
  return ev;
}

// Lightweight cache of id → event; rebuilt lazily when stale.
let indexCache: { world: World | null; len: number; map: Map<Id, HistoryEvent> } = { world: null, len: 0, map: new Map() };

export function eventIndex(world: World): Map<Id, HistoryEvent> {
  if (indexCache.world !== world || indexCache.len > world.events.length) {
    indexCache = { world, len: 0, map: new Map() };
  }
  const { map } = indexCache;
  for (let i = indexCache.len; i < world.events.length; i++) map.set(world.events[i].id, world.events[i]);
  indexCache.len = world.events.length;
  return map;
}

export function findEvent(world: World, id: Id): HistoryEvent | undefined {
  return eventIndex(world).get(id);
}

/** Drop the least important old events while keeping milestones forever. */
function pruneEvents(world: World): void {
  const keepRecent = 1500;
  const cutoff = world.events.length - keepRecent;
  const kept: HistoryEvent[] = [];
  for (let i = 0; i < world.events.length; i++) {
    const e = world.events[i];
    if (i >= cutoff || e.importance >= 3 || e.source !== 'simulation') kept.push(e);
  }
  // Still too many? drop importance-3 personal/population events from the oldest half.
  if (kept.length > MAX_EVENTS * 0.9) {
    const half = Math.floor(kept.length / 2);
    for (let i = half - 1; i >= 0; i--) {
      if (kept[i].importance === 3 && (kept[i].category === 'personal' || kept[i].category === 'population')) kept.splice(i, 1);
    }
  }
  world.events = kept;
  indexCache = { world: null, len: 0, map: new Map() };
}

export function addMemory(c: Character, m: Memory): void {
  c.memories.push(m);
  if (c.memories.length > MAX_MEMORIES) {
    // forget the least important, oldest memory (but never the first life memory)
    let worst = 1;
    let worstScore = Infinity;
    for (let i = 1; i < c.memories.length - 1; i++) {
      const mm = c.memories[i];
      const score = mm.importance * 10 + Math.abs(mm.valence) * 4 - (c.memories.length - i) * 0.05;
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    }
    c.memories.splice(worst, 1);
  }
}

export function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function fmtNum(n: number, digits = 0): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(digits);
}
