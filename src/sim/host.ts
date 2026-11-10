/**
 * SimHost: owns a World and everything that mutates it.
 *
 * The same class runs inside the Web Worker (src/sim/worker.ts) and, as a
 * fallback, on the main thread. It exposes:
 *  - real-time stepping with a CPU budget (`tick`),
 *  - commands (interventions, player actions, leaps) applied in order,
 *  - incremental patches for the main thread's read-only snapshot,
 *  - a small per-settlement activity feed for Explorer.
 */
import { advance } from './engine';
import { applyIntervention, type InterventionKind, type InterventionResult } from './interventions';
import { applyPlayerAction, type PlayerAction, type PlayerResult } from './player';
import { MINUTES_PER_DAY, SPEEDS, localHour } from './time';
import type { HistoryEvent, World } from './types';

export type Command =
  | { type: 'intervene'; kind: InterventionKind; args: unknown[] }
  | { type: 'player'; action: PlayerAction }
  | { type: 'leap'; days: number }
  /** Advance (deterministically) to the next occurrence of an hour of day. */
  | { type: 'advanceToHour'; hour: number; planetId?: string };

export type CommandResult =
  | ({ kind: 'intervene' } & InterventionResult)
  | ({ kind: 'player' } & PlayerResult)
  | { kind: 'leap'; ok: true; days: number; eventsAdded: number }
  | { kind: 'time'; ok: true; time: number };

const TABLES = ['systems', 'planets', 'civs', 'settlements', 'characters', 'relations'] as const;
type Table = (typeof TABLES)[number];
/** Top-level fields compared by value each patch. */
const SCALARS = ['time', 'rngState', 'nextId', 'stats', 'player', 'firstDiscoveries', 'customTechs', 'galaxy', 'epochYear', 'seed', 'savedAtReal', 'createdAtReal', 'schemaVersion'] as const;

export interface Patch {
  seq: number;
  scalars: Partial<Record<(typeof SCALARS)[number], unknown>>;
  tables: Partial<Record<Table, { set: Record<string, Record<string, unknown>>; del: string[] }>>;
  events: { replace?: HistoryEvent[]; append: HistoryEvent[]; consequences: [string, string[]][] };
  history?: World['history'];
  interventionLog?: World['interventionLog'];
}

export interface FeedEntry {
  id: string;
  type: string;
  startedAt: number;
  endsAt: number;
  targetId?: string;
  description: string;
  settlementId: string;
}

interface SentState {
  fields: Map<Table, Map<string, Record<string, string>>>;
  scalars: Record<string, string>;
  eventsArr: HistoryEvent[] | null;
  eventsLen: number;
  consLen: Map<string, number>;
  historySig: string;
  logLen: number;
}

function historySig(w: World): string {
  const h = w.history;
  return `${h.chunks.length}|${h.archivedCount}|${h.compactedCount}|${Object.keys(h.lateConsequences).length}|${Object.values(h.lateConsequences).reduce((a, l) => a + l.length, 0)}`;
}

export class SimHost {
  world: World;
  speed = 1;
  private debt = 0;
  private sent: SentState;
  private seq = 0;

  constructor(world: World) {
    this.world = world;
    this.sent = this.captureSent();
  }

  /** Replace the world (new universe, import). Resets patch tracking. */
  replace(world: World): void {
    this.world = world;
    this.debt = 0;
    this.sent = this.captureSent();
  }

  /** Advance by real elapsed seconds at the current speed, within a CPU budget. */
  tick(dtSec: number, budgetMs = 14): number {
    const rate = SPEEDS[this.speed]?.rate ?? 0;
    if (rate <= 0) return 0;
    const want = rate * Math.min(1, dtSec) + this.debt;
    const res = advance(this.world, want, budgetMs);
    this.debt = Math.min(rate * 2, want - res.advanced);
    return res.advanced;
  }

  exec(cmd: Command): CommandResult {
    const w = this.world;
    switch (cmd.type) {
      case 'intervene':
        return { kind: 'intervene', ...applyIntervention(w, cmd.kind, cmd.args) };
      case 'player':
        return { kind: 'player', ...applyPlayerAction(w, cmd.action) };
      case 'leap': {
        const before = w.events.length;
        advance(w, cmd.days * MINUTES_PER_DAY);
        return { kind: 'leap', ok: true, days: cmd.days, eventsAdded: Math.max(0, w.events.length - before) };
      }
      case 'advanceToHour': {
        const dayLen = (cmd.planetId && w.planets[cmd.planetId]?.dayLengthHours) || 24;
        const now = localHour(w.time, dayLen);
        let delta = ((cmd.hour - now) * 60 * dayLen) / 24;
        if (delta <= 0) delta += dayLen * 60;
        advance(w, delta);
        return { kind: 'time', ok: true, time: w.time };
      }
    }
  }

  // ───────────────────────── patches ─────────────────────────

  private captureSent(): SentState {
    const w = this.world;
    const fields = new Map<Table, Map<string, Record<string, string>>>();
    for (const t of TABLES) {
      const m = new Map<string, Record<string, string>>();
      for (const [id, ent] of Object.entries(w[t] as Record<string, object>)) {
        const rec: Record<string, string> = {};
        for (const [k, v] of Object.entries(ent)) rec[k] = JSON.stringify(v);
        m.set(id, rec);
      }
      fields.set(t, m);
    }
    const scalars: Record<string, string> = {};
    for (const k of SCALARS) scalars[k] = JSON.stringify(w[k]);
    const consLen = new Map<string, number>();
    for (const e of w.events) consLen.set(e.id, e.consequenceIds.length);
    return { fields, scalars, eventsArr: w.events, eventsLen: w.events.length, consLen, historySig: historySig(w), logLen: w.interventionLog.length };
  }

  /** Everything that changed since the last patch, at field granularity. */
  makePatch(): Patch {
    const w = this.world;
    const s = this.sent;
    const patch: Patch = { seq: ++this.seq, scalars: {}, tables: {}, events: { append: [], consequences: [] } };
    for (const k of SCALARS) {
      const j = JSON.stringify(w[k]);
      if (j !== s.scalars[k]) {
        patch.scalars[k] = w[k];
        s.scalars[k] = j;
      }
    }
    for (const t of TABLES) {
      const table = w[t] as unknown as Record<string, Record<string, unknown>>;
      const sentT = s.fields.get(t)!;
      let entry: { set: Record<string, Record<string, unknown>>; del: string[] } | undefined;
      for (const id in table) {
        const ent = table[id];
        let rec = sentT.get(id);
        if (!rec) {
          rec = {};
          sentT.set(id, rec);
        }
        let changed: Record<string, unknown> | undefined;
        for (const k in ent) {
          const j = JSON.stringify(ent[k]);
          if (rec[k] !== j) {
            rec[k] = j;
            (changed ??= {})[k] = ent[k];
          }
        }
        if (changed) ((entry ??= { set: {}, del: [] }).set[id] = changed);
      }
      for (const id of sentT.keys()) {
        if (!(id in table)) {
          sentT.delete(id);
          (entry ??= { set: {}, del: [] }).del.push(id);
        }
      }
      if (entry) patch.tables[t] = entry;
    }
    // events: append-only between maintenance passes; consequences grow in place
    if (w.events !== s.eventsArr || w.events.length < s.eventsLen) {
      patch.events.replace = w.events;
      s.consLen = new Map(w.events.map((e) => [e.id, e.consequenceIds.length]));
    } else {
      for (let i = 0; i < s.eventsLen; i++) {
        const e = w.events[i];
        if ((s.consLen.get(e.id) ?? 0) !== e.consequenceIds.length) {
          patch.events.consequences.push([e.id, e.consequenceIds]);
          s.consLen.set(e.id, e.consequenceIds.length);
        }
      }
      patch.events.append = w.events.slice(s.eventsLen);
      for (const e of patch.events.append) s.consLen.set(e.id, e.consequenceIds.length);
    }
    s.eventsArr = w.events;
    s.eventsLen = w.events.length;
    const sig = historySig(w);
    if (sig !== s.historySig) {
      patch.history = w.history;
      s.historySig = sig;
    }
    if (w.interventionLog.length !== s.logLen) {
      patch.interventionLog = w.interventionLog;
      s.logLen = w.interventionLog.length;
    }
    return patch;
  }

  /** Activities of the individuals currently in one settlement (Explorer feed). */
  feed(settlementId: string): FeedEntry[] {
    const out: FeedEntry[] = [];
    for (const c of Object.values(this.world.characters)) {
      if (!c.alive || c.settlementId !== settlementId) continue;
      out.push({ id: c.id, type: c.activity.type, startedAt: c.activity.startedAt, endsAt: c.activity.endsAt, targetId: c.activity.targetId, description: c.activity.description, settlementId: c.settlementId });
    }
    return out;
  }
}

/** Apply a patch to the main thread's snapshot in place (object identities are kept). */
export function applyPatch(snapshot: World, patch: Patch): void {
  const snap = snapshot as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch.scalars)) snap[k] = v;
  for (const t of TABLES) {
    const p = patch.tables[t];
    if (!p) continue;
    const table = snapshot[t] as unknown as Record<string, Record<string, unknown>>;
    for (const [id, fields] of Object.entries(p.set)) {
      const ent = table[id];
      if (ent) Object.assign(ent, fields);
      else table[id] = { ...fields };
    }
    for (const id of p.del) delete table[id];
  }
  if (patch.events.replace) snapshot.events = patch.events.replace;
  else {
    if (patch.events.consequences.length) {
      const byId = new Map(snapshot.events.map((e) => [e.id, e]));
      for (const [id, cons] of patch.events.consequences) {
        const e = byId.get(id);
        if (e) e.consequenceIds = cons;
      }
    }
    for (const e of patch.events.append) snapshot.events.push(e);
  }
  if (patch.history) snapshot.history = patch.history;
  if (patch.interventionLog) snapshot.interventionLog = patch.interventionLog;
}
