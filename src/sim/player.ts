/**
 * Actions taken by the person exploring the universe (the "traveller").
 * They change simulation state, so they run wherever the simulation runs
 * (worker or main thread) and are recorded like any other change.
 */
import type { Id, World } from './types';
import { addMemory, causeKey, lastCause, noteCause, recordEvent } from './world';
import { MINUTES_PER_DAY } from './time';

export type PlayerAction =
  | { type: 'follow'; characterId: Id | null }
  | { type: 'visit'; settlementId: Id }
  | { type: 'chart'; planetId: Id; regionIndex: number }
  | { type: 'discover'; landmarkId: Id; name: string; description: string; planetId: Id; settlementId?: Id; civId?: Id; place: string }
  | { type: 'talk'; characterId: Id };

export interface PlayerResult {
  ok: boolean;
  eventId?: string;
  toast?: { title: string; body?: string };
}

export function applyPlayerAction(world: World, a: PlayerAction): PlayerResult {
  const p = world.player;
  switch (a.type) {
    case 'follow':
      p.followedCharacterId = a.characterId;
      return { ok: true };
    case 'visit':
      p.visitedSettlementIds = [...p.visitedSettlementIds.filter((x) => x !== a.settlementId), a.settlementId];
      return { ok: true };
    case 'chart': {
      const planet = world.planets[a.planetId];
      const region = planet?.regions[a.regionIndex];
      if (!region || region.explored) return { ok: false };
      region.explored = true;
      const ev = recordEvent(world, {
        category: 'exploration',
        title: `The ${region.name} on ${planet.name} is charted`,
        description: 'A traveller from beyond the sky walked these lands and mapped them.',
        importance: 2,
        planetId: planet.id,
        civIds: region.ownerCivId ? [region.ownerCivId] : [],
        cause: 'Explored in person through Explorer mode.',
        effects: [{ label: region.name, before: 'uncharted', after: 'explored' }],
        source: 'creator',
        root: true,
      });
      noteCause(world, [causeKey.planet(planet.id, 'explore'), ...(region.ownerCivId ? [causeKey.civ(region.ownerCivId, 'explore')] : [])], ev.id);
      return { ok: true, eventId: ev.id, toast: { title: `Charted the ${region.name}`, body: 'Civilisations may now consider settling here.' } };
    }
    case 'discover': {
      if (p.discoveredLandmarkIds.includes(a.landmarkId)) return { ok: false };
      p.discoveredLandmarkIds.push(a.landmarkId);
      const ev = recordEvent(world, {
        category: 'exploration',
        title: `Traveller visits ${a.name}`,
        description: `${a.description} (${a.place})`,
        importance: 1,
        planetId: a.planetId,
        settlementId: a.settlementId,
        civIds: a.civId ? [a.civId] : [],
        cause: 'Discovered in person through Explorer mode.',
        causeIds: [a.settlementId ? lastCause(world, causeKey.settlement(a.settlementId)) : undefined],
        source: 'creator',
      });
      return { ok: true, eventId: ev.id, toast: { title: `Discovered: ${a.name}`, body: a.description } };
    }
    case 'talk': {
      const c = world.characters[a.characterId];
      if (!c) return { ok: false };
      const already = c.memories.some((m) => m.text.startsWith('Talked with a curious traveller') && world.time - m.t < MINUTES_PER_DAY);
      c.needs.social = Math.min(100, c.needs.social + 10);
      if (!already) {
        addMemory(c, { t: world.time, text: 'Talked with a curious traveller who seemed to know a great deal about the world.', valence: 0.3, importance: 2 });
        p.conversations += 1;
      }
      return { ok: true };
    }
  }
}
