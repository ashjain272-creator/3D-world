import type { Rng } from '../rng';
import { TECHS } from '../data/techs';
import { CATEGORY_LABEL, OCCUPATIONS, POLICIES } from '../data/society';
import type { Character, Civilization, Good, TechDef, World } from '../types';
import { addMemory, causeKey, fullName, lastCause, noteCause, recordEvent } from '../world';

export function allTechs(world: World): TechDef[] {
  return world.customTechs.length ? [...TECHS, ...world.customTechs] : TECHS;
}

export function techById(world: World, id: string): TechDef | undefined {
  return TECHS.find((t) => t.id === id) ?? world.customTechs.find((t) => t.id === id);
}

export interface Modifiers {
  production: Record<Good, number>;
  research: number;
  growth: number;
  health: number;
  stability: number;
  capacity: number;
  trade: number;
  canContact: boolean;
  canColonize: boolean;
  interstellar: boolean;
}

/** Aggregate technology + policy modifiers for a civilisation. */
export function civModifiers(world: World, civ: Civilization): Modifiers {
  const m: Modifiers = {
    production: { food: 1, materials: 1, energy: 1, goods: 1 },
    research: 1,
    growth: 0,
    health: 0,
    stability: 0,
    capacity: 1,
    trade: 1,
    canContact: false,
    canColonize: false,
    interstellar: false,
  };
  for (const id of civ.tech.known) {
    const t = techById(world, id);
    if (!t) continue;
    const e = t.effects;
    if (e.production) for (const g of Object.keys(e.production) as Good[]) m.production[g] += e.production[g] ?? 0;
    m.research += e.research ?? 0;
    m.growth += e.growth ?? 0;
    m.health += e.health ?? 0;
    m.stability += e.stability ?? 0;
    m.capacity += e.capacity ?? 0;
    m.trade += e.trade ?? 0;
    if (e.unlocks?.includes('contact')) m.canContact = true;
    if (e.unlocks?.includes('colonize')) m.canColonize = true;
    if (e.unlocks?.includes('interstellar')) m.interstellar = true;
  }
  for (const pid of civ.government.policies) {
    const p = POLICIES[pid];
    if (p.production) for (const g of Object.keys(p.production) as Good[]) m.production[g] += p.production[g] ?? 0;
    m.research += p.research ?? 0;
    m.growth += p.growth ?? 0;
    m.stability += p.stability ?? 0;
    m.trade += p.trade ?? 0;
  }
  return m;
}

export function availableTechs(world: World, civ: Civilization): TechDef[] {
  const known = new Set(civ.tech.known);
  return allTechs(world).filter((t) => !known.has(t.id) && t.prereqs.every((p) => known.has(p)));
}

/** Choose the next research project from priorities and current needs. */
export function chooseResearch(world: World, rng: Rng, civ: Civilization): string | null {
  const avail = availableTechs(world, civ);
  if (!avail.length) return null;
  const e = civ.economy;
  const need: Partial<Record<string, number>> = {};
  // Shortages steer research — e.g. food deficits prioritise agriculture.
  if (e.production.food < e.consumption.food) need.agriculture = 1.2;
  if (e.production.energy < e.consumption.energy) need.energy = 1.0;
  if (e.production.goods < e.consumption.goods || e.production.materials < e.consumption.materials) need.industry = 1.0;
  if (civ.stability < 45) need.society = 1.0;
  const pick = rng.weighted(avail, (t) => {
    const pr = civ.tech.priorities[t.category] + (need[t.category] ?? 0);
    const boost = 1 + (civ.tech.boosts[t.id] ?? 0) / Math.max(1, t.cost);
    return (pr * boost) / Math.pow(t.tier, 1.3);
  });
  return pick.id;
}

/**
 * Daily research step. Research points come from aggregate research capacity
 * (settlements specialised in research, population size) plus the actual
 * skill of individual scientists who worked that day.
 */
export function researchTick(world: World, rng: Rng, civ: Civilization, scientistWork: Map<string, number>, mods: Modifiers): void {
  let base = 0;
  for (const sid of civ.settlementIds) {
    const s = world.settlements[sid];
    if (!s) continue;
    const popFactor = Math.sqrt(s.population / 1e5);
    base += popFactor * (s.specialization === 'research' ? 0.22 : 0.05) * (0.5 + s.infrastructure / 10);
  }
  const individual = scientistWork.get(civ.id) ?? 0;
  const stabilityFactor = 0.6 + civ.stability / 250;
  const rate = (base + individual) * mods.research * stabilityFactor;
  civ.tech.rate = rate;
  if (!civ.tech.researching || civ.tech.known.includes(civ.tech.researching)) {
    civ.tech.researching = chooseResearch(world, rng, civ);
    civ.tech.progress = 0;
  }
  const target = civ.tech.researching ? techById(world, civ.tech.researching) : undefined;
  if (!target) return;
  civ.tech.progress += rate;
  const boost = civ.tech.boosts[target.id] ?? 0;
  if (civ.tech.progress + boost >= target.cost) {
    completeResearch(world, rng, civ, target);
  }
}

/** Find the individual most responsible for a discovery (credit attribution). */
function creditCharacter(world: World, rng: Rng, civ: Civilization, tech: TechDef): Character | undefined {
  const skillFor: Record<string, keyof Character['skills']> = {
    agriculture: 'agriculture',
    industry: 'engineering',
    energy: 'engineering',
    society: 'diplomacy',
    medicine: 'medicine',
    space: 'engineering',
    science: 'science',
  };
  const sk = skillFor[tech.category];
  const candidates = Object.values(world.characters).filter(
    (c) => c.alive && c.civId === civ.id && (c.occupation === 'scientist' || OCCUPATIONS[c.occupation].skill === sk || c.occupation === 'engineer'),
  );
  if (!candidates.length) return undefined;
  return rng.weighted(candidates, (c) => Math.pow(c.skills[sk] + c.skills.science * 0.5 + c.contributions * 0.02, 2));
}

export function completeResearch(world: World, rng: Rng, civ: Civilization, tech: TechDef, cause?: { text: string; ids: string[] }): void {
  if (civ.tech.known.includes(tech.id)) return;
  civ.tech.known.push(tech.id);
  civ.tech.progress = 0;
  civ.tech.researching = null;
  delete civ.tech.boosts[tech.id];
  const first = !world.firstDiscoveries[tech.id];
  const credit = cause ? undefined : creditCharacter(world, rng, civ, tech);
  const homeworld = world.planets[civ.homeworldId];
  const K = (t: string) => causeKey.civ(civ.id, t);
  // Causes: prerequisite discoveries, the credited researcher's own path,
  // research policy, boosts (ruins, allies), and earlier foreign discovery.
  const prior = world.firstDiscoveries[tech.id];
  const derived = [
    ...tech.prereqs.map((p) => lastCause(world, K(`tech_${p}`))),
    credit ? lastCause(world, causeKey.char(credit.id)) : undefined,
    lastCause(world, K('policy_research_grants')),
    lastCause(world, K(`boost_${tech.id}`)),
    prior && civ.knownCivIds.includes(prior.civId) ? prior.eventId : undefined,
  ];
  if (!derived.some(Boolean)) derived.push(lastCause(world, K('tech')) ?? lastCause(world, K('founding')));
  const ev = recordEvent(world, {
    category: 'discovery',
    title: first ? `${civ.adjective} breakthrough: ${tech.name}` : `${civ.name} adopts ${tech.name}`,
    description: `${tech.description}${credit ? ` Credited to ${fullName(credit)}.` : ''}${first ? ' The first civilisation to achieve it.' : ''}`,
    importance: first ? (tech.tier >= 3 ? 4 : 3) : 2,
    civIds: [civ.id],
    planetId: homeworld?.id,
    characterIds: credit ? [credit.id] : [],
    cause: cause?.text ?? `Accumulated ${Math.round(tech.cost)} research points in ${CATEGORY_LABEL[tech.category]} (research rate ${civ.tech.rate.toFixed(1)}/day).`,
    causeIds: [...(cause?.ids ?? []), ...derived].slice(0, 6),
    effects: describeTechEffects(tech),
  });
  if (first) world.firstDiscoveries[tech.id] = { civId: civ.id, t: world.time, eventId: ev.id, characterId: credit?.id };
  noteCause(world, [K(`tech_${tech.id}`), K('tech')], ev.id);
  if (credit) noteCause(world, causeKey.char(credit.id), ev.id);
  if (tech.effects.unlocks?.includes('contact')) noteCause(world, K('contact_tech'), ev.id);
  if (tech.effects.unlocks?.includes('colonize')) noteCause(world, K('colonize_tech'), ev.id);
  if (credit) {
    credit.contributions += tech.cost;
    credit.reputation = Math.min(100, credit.reputation + (first ? 15 : 6));
    credit.notable = true;
    credit.needs.purpose = 100;
    credit.mood = Math.min(100, credit.mood + 30);
    addMemory(credit, { t: world.time, text: `Led the work that produced ${tech.name}.`, valence: 0.9, importance: 5, eventId: ev.id });
    const g = credit.goals.find((x) => x.type === 'discover');
    if (g) g.progress = 1;
  }
  // Everyone in the civilisation hears about it; scientists care most.
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.civId !== civ.id || c === credit) continue;
    if (c.occupation === 'scientist' || c.personality.openness > 0.7) {
      addMemory(c, { t: world.time, text: `Heard the news of ${tech.name}.`, valence: 0.4, importance: 2, eventId: ev.id });
    }
  }
}

export function describeTechEffects(t: TechDef) {
  const fx: { label: string; after: string }[] = [];
  const e = t.effects;
  if (e.production) for (const [g, v] of Object.entries(e.production)) fx.push({ label: `${g} output`, after: `${v! > 0 ? '+' : ''}${Math.round(v! * 100)}%` });
  if (e.research) fx.push({ label: 'Research', after: `+${Math.round(e.research * 100)}%` });
  if (e.growth) fx.push({ label: 'Population growth', after: `${e.growth > 0 ? '+' : ''}${(e.growth * 100).toFixed(0)}%` });
  if (e.health) fx.push({ label: 'Mortality', after: `−${Math.round(e.health * 100)}%` });
  if (e.stability) fx.push({ label: 'Stability', after: `+${e.stability}` });
  if (e.capacity) fx.push({ label: 'Housing capacity', after: `+${Math.round(e.capacity * 100)}%` });
  if (e.trade) fx.push({ label: 'Trade efficiency', after: `+${Math.round(e.trade * 100)}%` });
  if (e.unlocks?.includes('contact')) fx.push({ label: 'Unlocks', after: 'Contact with other worlds' });
  if (e.unlocks?.includes('colonize')) fx.push({ label: 'Unlocks', after: 'Colonisation of other planets' });
  if (e.unlocks?.includes('interstellar')) fx.push({ label: 'Unlocks', after: 'Interstellar travel' });
  return fx;
}
