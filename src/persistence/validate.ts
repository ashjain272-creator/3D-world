/**
 * Save-file validation and migration. Pure functions (no IndexedDB) so they
 * can be unit-tested. Older or partially-damaged saves are repaired where
 * possible; structurally broken ones are rejected with a clear reason.
 */
import type { Character, Civilization, World } from '../sim/types';
import { SCHEMA_VERSION } from '../sim/world';

export class SaveError extends Error {}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Throws SaveError if the data cannot be a World; otherwise returns a repaired World. */
export function validateAndMigrate(raw: unknown): World {
  if (!isObj(raw)) throw new SaveError('Save data is not an object.');
  const w = raw as unknown as World;
  const version = typeof w.schemaVersion === 'number' ? w.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new SaveError(`Save was created by a newer version (schema ${version}).`);
  if (version < 1) throw new SaveError('Save has no schema version — not a Genesis universe.');
  for (const key of ['systems', 'planets', 'civs', 'settlements', 'characters', 'relations'] as const) {
    if (!isObj(w[key])) throw new SaveError(`Save is missing its ${key} table.`);
  }
  if (!Array.isArray(w.events)) throw new SaveError('Save is missing its history.');
  if (typeof w.time !== 'number' || !isFinite(w.time)) throw new SaveError('Save has an invalid clock.');
  if (typeof w.seed !== 'string') throw new SaveError('Save has no seed.');
  if (Object.keys(w.civs).length === 0 && Object.keys(w.systems).length === 0) throw new SaveError('Save contains an empty universe.');

  // ── Repairs / migrations (idempotent) ──
  w.customTechs ??= [];
  w.firstDiscoveries ??= {};
  w.player ??= { discoveredLandmarkIds: [], visitedSettlementIds: [], conversations: 0, followedCharacterId: null };
  w.stats ??= { totalBirths: 0, totalDeaths: 0, ticks: 0 };
  if (typeof w.rngState !== 'number') w.rngState = 12345;
  if (typeof w.nextId !== 'number') w.nextId = 100000;
  w.causes ??= {};
  w.history ??= { chunks: [], redirects: {}, lateConsequences: {}, archivedCount: 0, compactedCount: 0, lastMaintenanceDay: 0 };
  w.history.chunks ??= [];
  w.history.redirects ??= {};
  w.history.lateConsequences ??= {};
  w.interventionLog ??= [];
  for (const p of Object.values(w.planets)) p.dayLengthHours ??= 24;
  for (const c of Object.values(w.civs) as (Civilization & { causeLinks?: Record<string, string> })[]) {
    // v3 → v4: single-slot cause links become the bounded cause registry
    if (c.causeLinks) {
      for (const [k, id] of Object.entries(c.causeLinks)) {
        const type = k === 'leader_policy' ? 'policy' : k.startsWith('rel_') ? null : k;
        if (type && id) (w.causes[`c:${c.id}:${type}`] ??= []).push(id);
      }
      delete c.causeLinks;
    }
    c.conditions ??= {};
    c.stats ??= [];
    c.knownCivIds ??= [];
    c.pastLeaderIds ??= [];
    c.tech.boosts ??= {};
    c.settlementIds = c.settlementIds.filter((id) => w.settlements[id]);
  }
  for (const ch of Object.values(w.characters) as Character[]) {
    ch.recent ??= [];
    ch.discontent ??= 0;
    ch.memories ??= [];
    ch.goals ??= [];
    ch.relationships ??= {};
    ch.eventIds ??= [];
    if (!w.settlements[ch.settlementId]) {
      const civ = w.civs[ch.civId];
      const fallback = civ?.settlementIds[0];
      if (fallback) ch.settlementId = ch.homeSettlementId = fallback;
      else ch.alive = false;
    }
    if (typeof ch.nextDecisionAt !== 'number' || !isFinite(ch.nextDecisionAt)) ch.nextDecisionAt = w.time;
  }
  for (const e of w.events) {
    e.causeIds ??= [];
    e.consequenceIds ??= [];
    e.effects ??= [];
    e.characterIds ??= [];
    e.civIds ??= [];
  }
  w.schemaVersion = SCHEMA_VERSION;
  return w;
}
