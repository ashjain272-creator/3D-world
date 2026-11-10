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

export const SCHEMA_VERSION = 4;
export const MAX_MEMORIES = 36;

const characterVersions = new WeakMap<World, number>();

/** Changes whenever a character is added (cheap cache key for per-step lookups). */
export function characterVersion(world: World): number {
  return characterVersions.get(world) ?? 0;
}

export function bumpCharacterVersion(world: World): void {
  characterVersions.set(world, characterVersion(world) + 1);
}

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
  causeIds?: (Id | undefined | null)[];
  effects?: StateChange[];
  source?: HistoryEvent['source'];
  t?: number;
  /** Declare that this event legitimately has no prior event as cause. */
  root?: boolean;
  trigger?: HistoryEvent['trigger'];
}

/**
 * Development guard: when strict, recording an important event (importance ≥ 2)
 * without any cause and without an explicit `root: true` throws. Enabled in
 * tests and the dev server; off in production builds.
 */
export const causality = { strict: false };

export class CausalityError extends Error {}

/** Numeric part of an event id (ids are `e` + base-36 counter). */
export function eventNum(id: Id): number {
  return parseInt(id.slice(1), 36);
}

/** Is this id known to history at all (hot, compacted into a summary, or archived)? */
export function isKnownEventId(world: World, id: Id): boolean {
  if (eventIndex(world).has(id)) return true;
  if (world.history.redirects[id]) return true;
  const n = eventNum(id);
  return world.history.chunks.some((c) => n >= c.from && n <= c.to);
}

/**
 * Record an event in permanent history. Back-links causes to their
 * consequences (including archived ones), propagates the root source of the
 * causal chain, and attaches the event to involved characters.
 */
export function recordEvent(world: World, input: EventInput): HistoryEvent {
  const id = newId(world, 'e');
  const seen = new Set<Id>();
  const causeIds: Id[] = [];
  for (const raw of input.causeIds ?? []) {
    if (!raw || raw === id || seen.has(raw)) continue;
    // a compacted cause is cited through its summary
    const cid = world.history.redirects[raw] ?? raw;
    if (seen.has(cid)) continue;
    seen.add(cid);
    if (isKnownEventId(world, cid)) causeIds.push(cid);
  }
  if (causality.strict && input.importance >= 2 && causeIds.length === 0 && !input.root) {
    throw new CausalityError(`Event "${input.title}" (importance ${input.importance}) has no cause and is not marked root.`);
  }
  const source = input.source ?? 'simulation';
  const lookup = eventIndex(world);
  let rootSource: HistoryEvent['rootSource'] = source;
  if (source === 'simulation') {
    for (const cid of causeIds) {
      const c = lookup.get(cid);
      if (c && (c.rootSource ?? c.source) === 'creator') {
        rootSource = 'creator';
        break;
      }
    }
  }
  const ev: HistoryEvent = {
    id,
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
    causeIds,
    effects: input.effects ?? [],
    consequenceIds: [],
    source,
    rootSource,
  };
  if (input.root) ev.root = true;
  if (input.trigger) ev.trigger = input.trigger;
  if (!ev.planetId && ev.settlementId) ev.planetId = world.settlements[ev.settlementId]?.planetId;
  if (!ev.systemId && ev.planetId) ev.systemId = world.planets[ev.planetId]?.systemId;
  world.events.push(ev);
  for (const cid of causeIds) {
    const cause = lookup.get(cid);
    if (cause) {
      if (!cause.consequenceIds.includes(ev.id)) cause.consequenceIds.push(ev.id);
    } else {
      // cause lives in the archive: remember the back-link alongside the save
      (world.history.lateConsequences[cid] ??= []).push(ev.id);
    }
  }
  for (const cid of ev.characterIds) {
    const ch = world.characters[cid];
    if (ch) {
      ch.eventIds.push(ev.id);
      if (ch.eventIds.length > 60) ch.eventIds.splice(0, ch.eventIds.length - 60);
    }
  }
  return ev;
}

// Lightweight cache of id → hot event; rebuilt lazily when stale.
let indexCache: { world: World | null; arr: HistoryEvent[] | null; len: number; map: Map<Id, HistoryEvent> } = { world: null, arr: null, len: 0, map: new Map() };

export function eventIndex(world: World): Map<Id, HistoryEvent> {
  if (indexCache.world !== world || indexCache.arr !== world.events || indexCache.len > world.events.length) {
    indexCache = { world, arr: world.events, len: 0, map: new Map() };
  }
  const { map } = indexCache;
  for (let i = indexCache.len; i < world.events.length; i++) map.set(world.events[i].id, world.events[i]);
  indexCache.len = world.events.length;
  return map;
}

/** Synchronous lookup of hot events; compacted ids resolve to their summary. */
export function findEvent(world: World, id: Id): HistoryEvent | undefined {
  const idx = eventIndex(world);
  return idx.get(id) ?? (world.history.redirects[id] ? idx.get(world.history.redirects[id]) : undefined);
}

// ───────────────────────────── Cause registry ─────────────────────────────

export const CAUSE_SLOTS = 6;

export const causeKey = {
  civ: (civId: Id, type: string) => `c:${civId}:${type}`,
  planet: (planetId: Id, type: string) => `p:${planetId}:${type}`,
  settlement: (settlementId: Id) => `s:${settlementId}`,
  char: (charId: Id) => `h:${charId}`,
  pair: (a: Id, b: Id) => `r:${relationKey(a, b)}`,
  world: (type: string) => `w:${type}`,
};

/** Register an event as a potential cause under one or more keys. */
export function noteCause(world: World, keys: string | string[], eventId: Id): void {
  for (const k of Array.isArray(keys) ? keys : [keys]) {
    const list = (world.causes[k] ??= []);
    if (list[list.length - 1] === eventId) continue;
    list.push(eventId);
    if (list.length > CAUSE_SLOTS) list.splice(0, list.length - CAUSE_SLOTS);
  }
}

/** Most recent registered cause under a key (or undefined). */
export function lastCause(world: World, key: string): Id | undefined {
  const l = world.causes[key];
  return l ? l[l.length - 1] : undefined;
}

/**
 * Collect recent causes from several keys, newest first, optionally only
 * those recorded within `withinMinutes`.
 */
export function gatherCauses(world: World, keys: string[], limit = 4, withinMinutes = Infinity): Id[] {
  const out: Id[] = [];
  const idx = eventIndex(world);
  for (const k of keys) {
    const l = world.causes[k];
    if (!l?.length) continue;
    const id = l[l.length - 1];
    if (out.includes(id)) continue;
    if (withinMinutes !== Infinity) {
      const e = idx.get(id);
      if (!e || world.time - e.t > withinMinutes) continue;
    }
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export function forgetCauses(world: World, prefix: string): void {
  // exact key or its ':'-separated children only — 'h:c1' must not erase 'h:c12'
  const child = `${prefix}:`;
  for (const k of Object.keys(world.causes)) if (k === prefix || k.startsWith(child)) delete world.causes[k];
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
