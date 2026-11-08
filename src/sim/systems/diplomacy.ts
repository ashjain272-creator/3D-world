import type { Rng } from '../rng';
import { clamp } from '../rng';
import type { Civilization, CultureValues, DiplomaticRelation, RelationStatus, World } from '../types';
import { MINUTES_PER_DAY } from '../time';
import { addMemory, recordEvent } from '../world';
import type { Modifiers } from './technology';

export function cultureSimilarity(a: Civilization, b: Civilization): number {
  const keys = Object.keys(a.culture.values) as (keyof CultureValues)[];
  let d = 0;
  for (const k of keys) d += Math.abs(a.culture.values[k] - b.culture.values[k]);
  return 1 - d / (keys.length * 2);
}

/** Do the two civs share a land border (adjacent regions on any planet)? */
export function shareBorder(world: World, a: Civilization, b: Civilization): boolean {
  for (const pid of a.planetIds) {
    if (!b.planetIds.includes(pid)) continue;
    const planet = world.planets[pid];
    for (const r of planet.regions) {
      if (r.ownerCivId !== a.id) continue;
      if (r.neighbors.some((n) => planet.regions[n].ownerCivId === b.id)) return true;
    }
  }
  return false;
}

export interface OpinionFactor {
  label: string;
  value: number;
}

/** Transparent breakdown of where two civs' target opinion comes from. */
export function opinionFactors(world: World, rel: DiplomaticRelation): OpinionFactor[] {
  const a = world.civs[rel.a];
  const b = world.civs[rel.b];
  const f: OpinionFactor[] = [];
  f.push({ label: 'Cultural affinity', value: Math.round((cultureSimilarity(a, b) - 0.6) * 90) });
  if (a.government.type === b.government.type) f.push({ label: 'Similar government', value: 6 });
  if (rel.treaties.some((t) => t.kind === 'trade')) f.push({ label: 'Trade agreement', value: 14 });
  if (rel.treaties.some((t) => t.kind === 'alliance')) f.push({ label: 'Alliance', value: 18 });
  if (rel.tradeVolume > 500) f.push({ label: 'Trade volume', value: Math.min(10, Math.round(rel.tradeVolume / 800)) });
  const la = a.government.leaderId ? world.characters[a.government.leaderId] : undefined;
  const lb = b.government.leaderId ? world.characters[b.government.leaderId] : undefined;
  if (la && lb) {
    f.push({ label: 'Leaders’ temperament', value: Math.round((la.personality.agreeableness + lb.personality.agreeableness - 1) * 20) });
    const personal = la.relationships[lb.id];
    if (personal) f.push({ label: 'Leaders’ personal relationship', value: Math.round(personal.affinity / 5) });
  }
  if (shareBorder(world, a, b)) f.push({ label: 'Border friction', value: Math.round(-6 - Math.max(0, a.culture.values.militarism + b.culture.values.militarism) * 8) });
  const open = (a.culture.values.openness + b.culture.values.openness) / 2;
  f.push({ label: 'Openness to outsiders', value: Math.round(open * 12) });
  if (rel.incidents > 0) f.push({ label: 'Recent incidents', value: -Math.min(30, rel.incidents * 6) });
  return f;
}

function statusFor(rel: DiplomaticRelation): RelationStatus {
  if (rel.contactAt === null) return 'unknown';
  if (rel.treaties.some((t) => t.kind === 'alliance')) return 'alliance';
  if (rel.opinion <= -45) return 'rivalry';
  if (rel.opinion <= -18) return 'tense';
  if (rel.treaties.some((t) => t.kind === 'trade')) return 'trade';
  if (rel.opinion >= 18) return 'cordial';
  return 'neutral';
}

/** Monthly diplomacy for every pair of civilisations. */
export function diplomacyTick(world: World, rng: Rng, mods: Map<string, Modifiers>): void {
  for (const rel of Object.values(world.relations)) {
    const a = world.civs[rel.a];
    const b = world.civs[rel.b];
    if (!a || !b || a.extinct || b.extinct) continue;
    if (rel.contactAt === null) {
      maybeFirstContact(world, rng, rel, a, b, mods);
      continue;
    }
    const target = clamp(opinionFactors(world, rel).reduce((s, f) => s + f.value, 0), -100, 100);
    rel.opinion = clamp(rel.opinion + (target - rel.opinion) * 0.12 + rng.normal(0, 2.5), -100, 100);
    rel.incidents = Math.max(0, rel.incidents - 0.25);
    rel.history.push({ t: world.time, opinion: Math.round(rel.opinion) });
    if (rel.history.length > 120) rel.history.shift();
    const before = rel.status;

    // Treaties are proposed and broken based on opinion and mutual interest.
    const hasTrade = rel.treaties.some((t) => t.kind === 'trade');
    const hasAlliance = rel.treaties.some((t) => t.kind === 'alliance');
    const complementary = complementaryNeeds(a, b);
    if (!hasTrade && ((rel.opinion > 4 && complementary) || rel.opinion > 25) && rng.chance(0.35)) {
      rel.treaties.push({ kind: 'trade', since: world.time });
      treatyEvent(world, rel, a, b, 'Trade agreement signed', `The ${a.name} and the ${b.name} agreed to open their markets to each other.`, complementary ? `Complementary needs: ${complementary}. Opinion ${rel.opinion.toFixed(0)}.` : `Warm relations (opinion ${rel.opinion.toFixed(0)}).`, 3);
    } else if (hasTrade && rel.opinion < -5) {
      rel.treaties = rel.treaties.filter((t) => t.kind !== 'trade');
      treatyEvent(world, rel, a, b, 'Trade agreement collapses', `Merchants of the ${a.name} and ${b.name} are turned away at the borders.`, `Relations soured to ${rel.opinion.toFixed(0)}.`, 3);
    }
    const tradeAge = rel.treaties.find((t) => t.kind === 'trade');
    if (!hasAlliance && tradeAge && rel.opinion > 55 && world.time - tradeAge.since > 180 * MINUTES_PER_DAY && rng.chance(0.3)) {
      rel.treaties.push({ kind: 'alliance', since: world.time });
      treatyEvent(world, rel, a, b, 'Alliance formed', `The ${a.name} and the ${b.name} pledged mutual support and shared research.`, `Long-standing trade and high regard (opinion ${rel.opinion.toFixed(0)}).`, 4);
    } else if (hasAlliance && rel.opinion < 25) {
      rel.treaties = rel.treaties.filter((t) => t.kind !== 'alliance');
      treatyEvent(world, rel, a, b, 'Alliance dissolved', `The alliance between the ${a.name} and the ${b.name} has ended.`, `Opinion fell to ${rel.opinion.toFixed(0)}.`, 4);
    }

    // State visits: leaders meet, and their personal chemistry matters.
    if (rng.chance(0.06)) stateVisit(world, rng, rel, a, b);

    // Border incidents between tense neighbours.
    if ((rel.status === 'tense' || rel.status === 'rivalry') && shareBorder(world, a, b) && rng.chance(0.12 + Math.max(0, a.culture.values.militarism + b.culture.values.militarism) * 0.08)) {
      rel.incidents += 1;
      rel.opinion = clamp(rel.opinion - 6, -100, 100);
      const ev = treatyEvent(world, rel, a, b, 'Border incident', `Patrols of the ${a.name} and ${b.name} clashed along their shared frontier.`, `Tense relations (opinion ${rel.opinion.toFixed(0)}) along a shared border.`, 2);
      if (rel.status === 'rivalry') borderDispute(world, rng, a, b, ev.id);
    }

    // Allies share research.
    if (hasAlliance) {
      for (const [x, y] of [[a, b], [b, a]] as const) {
        if (x.tech.researching && y.tech.known.includes(x.tech.researching)) {
          x.tech.boosts[x.tech.researching] = (x.tech.boosts[x.tech.researching] ?? 0) + 25;
        }
      }
    }

    rel.status = statusFor(rel);
    if (rel.status !== before && (rel.status === 'rivalry' || before === 'rivalry')) {
      treatyEvent(
        world,
        rel,
        a,
        b,
        rel.status === 'rivalry' ? 'A rivalry hardens' : 'Rivalry thaws',
        rel.status === 'rivalry' ? `The ${a.name} and the ${b.name} now regard each other as rivals.` : `Hostility between the ${a.name} and the ${b.name} has eased.`,
        `Opinion moved to ${rel.opinion.toFixed(0)} (${opinionFactors(world, rel).sort((x, y) => Math.abs(y.value) - Math.abs(x.value))[0]?.label.toLowerCase()} was the strongest factor).`,
        3,
      );
    }
  }
}

function complementaryNeeds(a: Civilization, b: Civilization): string | null {
  const goods = ['food', 'materials', 'energy', 'goods'] as const;
  for (const g of goods) {
    const da = a.economy.stockpile[g] / Math.max(1e-6, a.economy.consumption[g]);
    const db = b.economy.stockpile[g] / Math.max(1e-6, b.economy.consumption[g]);
    if ((da > 45 && db < 25) || (db > 45 && da < 25)) return `${da > db ? a.name : b.name} has surplus ${g}`;
  }
  return null;
}

function treatyEvent(world: World, rel: DiplomaticRelation, a: Civilization, b: Civilization, title: string, description: string, cause: string, importance: 1 | 2 | 3 | 4 | 5) {
  const la = a.government.leaderId;
  const lb = b.government.leaderId;
  const ev = recordEvent(world, {
    category: 'diplomacy',
    title: `${title}: ${a.adjective}–${b.adjective}`,
    description,
    importance,
    civIds: [a.id, b.id],
    characterIds: [la, lb].filter(Boolean) as string[],
    cause,
    causeIds: [a.causeLinks[`rel_${b.id}`]].filter(Boolean) as string[],
    effects: [{ label: 'Relation', before: rel.status, after: statusFor(rel) }, { label: 'Opinion', after: rel.opinion.toFixed(0) }],
  });
  a.causeLinks[`rel_${b.id}`] = ev.id;
  b.causeLinks[`rel_${a.id}`] = ev.id;
  return ev;
}

function borderDispute(world: World, rng: Rng, a: Civilization, b: Civilization, causeId: string): void {
  const power = (c: Civilization) => c.settlementIds.reduce((s, id) => s + (world.settlements[id]?.population ?? 0), 0) * (0.5 + c.stability / 100) * (1 + Math.max(0, c.culture.values.militarism));
  const [strong, weak] = power(a) * rng.range(0.7, 1.3) > power(b) * rng.range(0.7, 1.3) ? [a, b] : [b, a];
  for (const pid of weak.planetIds) {
    if (!strong.planetIds.includes(pid)) continue;
    const planet = world.planets[pid];
    const contested = planet.regions.filter(
      (r) =>
        r.ownerCivId === weak.id &&
        r.neighbors.some((n) => planet.regions[n].ownerCivId === strong.id) &&
        !Object.values(world.settlements).some((s) => s.planetId === pid && s.regionIndex === r.index),
    );
    if (!contested.length) continue;
    const r = rng.pick(contested);
    r.ownerCivId = strong.id;
    recordEvent(world, {
      category: 'diplomacy',
      title: `${strong.adjective} forces seize the ${r.name}`,
      description: `After a border dispute, the unsettled ${r.name} on ${planet.name} passed from the ${weak.name} to the ${strong.name}.`,
      importance: 4,
      civIds: [strong.id, weak.id],
      planetId: pid,
      cause: `Rivalry and border incidents; the ${strong.name} held the stronger position.`,
      causeIds: [causeId],
      effects: [{ label: `${r.name} control`, before: weak.name, after: strong.name }],
    });
    weak.stability = Math.max(0, weak.stability - 6);
    return;
  }
}

function maybeFirstContact(world: World, rng: Rng, rel: DiplomaticRelation, a: Civilization, b: Civilization, mods: Map<string, Modifiers>): void {
  const ma = mods.get(a.id)!;
  const mb = mods.get(b.id)!;
  if (!ma.canContact && !mb.canContact) return;
  const sameSystem = world.planets[a.homeworldId].systemId === world.planets[b.homeworldId].systemId;
  const p = (ma.canContact && mb.canContact ? 0.25 : 0.06) * (sameSystem ? 1.5 : 0.7) * (ma.interstellar || mb.interstellar ? 2 : 1);
  if (!rng.chance(p)) return;
  rel.contactAt = world.time;
  rel.opinion = Math.round((cultureSimilarity(a, b) - 0.55) * 60 + rng.normal(0, 10));
  rel.status = statusFor(rel);
  a.knownCivIds.push(b.id);
  b.knownCivIds.push(a.id);
  const initiator = ma.canContact ? a : b;
  const other = initiator === a ? b : a;
  const ev = recordEvent(world, {
    category: 'diplomacy',
    title: `First contact: ${a.name} and ${b.name}`,
    description: `${initiator.adjective} ${ma.canContact && mb.canContact ? 'and ' + other.adjective + ' signals met in the void' : 'astronomers detected structured signals from ' + world.planets[other.homeworldId].name}. Two civilisations now know they are not alone.`,
    importance: 5,
    civIds: [a.id, b.id],
    cause: `${initiator.name} gained ${initiator.tech.known.includes('orbital_flight') ? 'orbital flight' : 'radio astronomy'}, allowing contact across space.`,
    causeIds: [initiator.causeLinks.contact_tech].filter(Boolean) as string[],
    effects: [{ label: 'Relation', before: 'unknown', after: rel.status }, { label: 'Initial opinion', after: rel.opinion.toFixed(0) }],
  });
  for (const civ of [a, b]) {
    for (const c of Object.values(world.characters)) {
      if (c.alive && c.civId === civ.id && rng.chance(0.6)) {
        addMemory(c, {
          t: world.time,
          text: `Learned that the ${civ === a ? b.name : a.name} exist beyond our world.`,
          valence: c.personality.openness > 0.5 ? 0.6 : -0.2,
          importance: 4,
          eventId: ev.id,
        });
      }
    }
  }
  const la = a.government.leaderId ? world.characters[a.government.leaderId] : undefined;
  if (la) ev.characterIds.push(la.id);
}

function stateVisit(world: World, rng: Rng, rel: DiplomaticRelation, a: Civilization, b: Civilization): void {
  const la = a.government.leaderId ? world.characters[a.government.leaderId] : undefined;
  const lb = b.government.leaderId ? world.characters[b.government.leaderId] : undefined;
  if (!la?.alive || !lb?.alive) return;
  const [host, guest, hostCiv, guestCiv] = rng.chance(0.5) ? [la, lb, a, b] : [lb, la, b, a];
  const compat = 1 - Math.abs(la.personality.agreeableness - lb.personality.agreeableness) - Math.abs(la.personality.openness - lb.personality.openness) * 0.5;
  const skill = (la.skills.diplomacy + lb.skills.diplomacy) / 200;
  const delta = Math.round((compat - 0.4) * 20 + skill * 10 + rng.normal(0, 6));
  for (const [x, y] of [[la, lb], [lb, la]] as const) {
    const r = x.relationships[y.id] ?? (x.relationships[y.id] = { affinity: 0, familiarity: 0, kind: 'acquaintance', since: world.time, lastInteraction: world.time });
    r.affinity = clamp(r.affinity + delta, -100, 100);
    r.familiarity = Math.min(100, r.familiarity + 15);
    r.lastInteraction = world.time;
  }
  rel.opinion = clamp(rel.opinion + delta * 0.5, -100, 100);
  const good = delta >= 0;
  const ev = recordEvent(world, {
    category: 'diplomacy',
    title: `${guest.givenName} ${guest.familyName} visits ${world.settlements[hostCiv.settlementIds[0]]?.name ?? hostCiv.name}`,
    description: good
      ? `The ${guestCiv.government.leaderTitle} of the ${guestCiv.name} was received warmly by ${host.givenName}. The talks went well.`
      : `A state visit by the ${guestCiv.government.leaderTitle} of the ${guestCiv.name} ended in frosty disagreement.`,
    importance: Math.abs(delta) > 10 ? 3 : 2,
    civIds: [a.id, b.id],
    characterIds: [la.id, lb.id],
    cause: `Leaders\u2019 chemistry (temperament compatibility ${(compat * 100).toFixed(0)}%, combined diplomacy ${(skill * 100).toFixed(0)}).`,
    effects: [{ label: 'Opinion', before: Math.round(rel.opinion - delta * 0.5), after: Math.round(rel.opinion) }],
  });
  for (const x of [la, lb]) addMemory(x, { t: world.time, text: `${good ? 'Held productive talks' : 'Clashed'} with ${x === la ? lb.givenName : la.givenName} during a state visit.`, valence: good ? 0.5 : -0.4, importance: 3, eventId: ev.id, withId: x === la ? lb.id : la.id });
}
