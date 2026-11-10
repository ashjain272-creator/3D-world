import type { Rng } from '../rng';
import { clamp } from '../rng';
import { GOVERNMENTS, POLICIES } from '../data/society';
import type { Character, Civilization, CultureValues, GovernmentType, PolicyId, World } from '../types';
import { DAYS_PER_YEAR, MINUTES_PER_DAY, MINUTES_PER_YEAR } from '../time';
import { addMemory, ageOf, causeKey, fullName, gatherCauses, lastCause, noteCause, recordEvent } from '../world';
import type { Modifiers } from './technology';

function policyAlignment(civ: Civilization, pid: PolicyId): number {
  const pref = POLICIES[pid].culture;
  let s = 0;
  for (const k of Object.keys(pref) as (keyof CultureValues)[]) s += (pref[k] ?? 0) * civ.culture.values[k];
  return s;
}

/** Explain the components of a civ's target satisfaction (used by UI too). */
export function satisfactionBreakdown(world: World, civ: Civilization, mods: Modifiers): { label: string; value: number }[] {
  const e = civ.economy;
  const parts: { label: string; value: number }[] = [{ label: 'Baseline', value: 46 }];
  const foodDays = e.stockpile.food / Math.max(1e-6, e.consumption.food);
  parts.push({ label: 'Food security', value: civ.conditions.shortage_food ? -24 : clamp((foodDays - 25) / 8, -8, 6) });
  const goodsDays = e.stockpile.goods / Math.max(1e-6, e.consumption.goods);
  parts.push({ label: 'Consumer goods', value: civ.conditions.shortage_goods ? -10 : clamp((goodsDays - 25) / 10, -5, 4) });
  if (civ.conditions.shortage_energy) parts.push({ label: 'Energy shortage', value: -8 });
  parts.push({ label: 'Employment', value: clamp((e.employment - 0.9) * 80, -20, 5) });
  parts.push({ label: 'Inequality', value: -(e.inequality - 0.32) * 45 });
  let pol = 0;
  for (const pid of civ.government.policies) pol += (POLICIES[pid].satisfaction ?? 0) * 0.8 + policyAlignment(civ, pid) * 2;
  parts.push({ label: 'Policies', value: pol });
  const leader = civ.government.leaderId ? world.characters[civ.government.leaderId] : undefined;
  if (leader) parts.push({ label: 'Leader popularity', value: (leader.reputation - 50) / 6 });
  if (civ.economy.treasury < 0) parts.push({ label: 'State in debt', value: -6 });
  if (civ.conditions.golden_age) parts.push({ label: 'Golden age', value: 10 });
  if (civ.conditions.plague) parts.push({ label: 'Plague', value: -15 });
  if (civ.conditions.festival) parts.push({ label: 'Festivities', value: 6 });
  if (civ.conditions.renaissance) parts.push({ label: 'Cultural renaissance', value: 5 });
  if (civ.conditions.unrest_tech) parts.push({ label: 'Disruptive discovery', value: -civ.conditions.unrest_tech });
  parts.push({ label: 'Technology', value: mods.stability * 0.4 });
  parts.push({ label: 'Taxation', value: -(civ.economy.taxRate - 0.15) * 40 });
  parts.push({ label: 'Rising expectations', value: -Math.max(0, civ.tech.known.length - 6) * 0.35 });
  return parts;
}

/** Daily satisfaction drift toward its target. */
export function satisfactionTick(world: World, civ: Civilization, mods: Modifiers): void {
  const target = clamp(satisfactionBreakdown(world, civ, mods).reduce((a, p) => a + p.value, 0), 0, 100);
  civ.satisfaction += (target - civ.satisfaction) * 0.04;
  // decay timed conditions
  for (const k of ['golden_age', 'plague', 'festival', 'renaissance', 'unrest_tech', 'ga_cooldown'] as const) {
    if (civ.conditions[k]) {
      civ.conditions[k] -= k === 'unrest_tech' ? 0.1 : 1;
      if (civ.conditions[k] <= 0) {
        delete civ.conditions[k];
        if (k === 'golden_age') civ.conditions.ga_cooldown = 1440;
      }
    }
  }
}

export function stabilityTarget(civ: Civilization, mods: Modifiers): number {
  const mil = civ.government.policies.includes('martial_order') ? 8 : 0;
  return clamp(civ.satisfaction * 0.55 + civ.government.legitimacy * 0.3 + mods.stability * 0.5 + mil + 5 - (civ.conditions.shortage_food ? 10 : 0) - (civ.conditions.plague ? 6 : 0), 0, 100);
}

/** Monthly politics: stability, policies, elections, succession and crises. */
export function politicsTick(world: World, rng: Rng, civ: Civilization, mods: Modifiers): void {
  const gov = civ.government;
  const prevStab = civ.stability;
  civ.stability += (stabilityTarget(civ, mods) - civ.stability) * 0.3 + rng.normal(0, 1.2);
  civ.stability = clamp(civ.stability, 0, 100);
  // legitimacy erodes when people are unhappy and recovers otherwise
  gov.legitimacy = clamp(gov.legitimacy + (civ.satisfaction - 50) * 0.04, 5, 100);

  const leader = gov.leaderId ? world.characters[gov.leaderId] : undefined;
  if (!leader || !leader.alive) {
    succession(world, rng, civ, 'vacancy');
    return;
  }

  // Crisis: sustained instability can topple the government.
  if (civ.stability < 22) {
    civ.conditions.crisis = (civ.conditions.crisis ?? 0) + 1;
    if (civ.conditions.crisis === 1) {
      const ev = recordEvent(world, {
        category: 'politics',
        title: `Unrest spreads through the ${civ.name}`,
        description: 'Protests fill the streets. Officials struggle to keep order.',
        importance: 3,
        civIds: [civ.id],
        cause: `Stability fell to ${civ.stability.toFixed(0)} (satisfaction ${civ.satisfaction.toFixed(0)}, legitimacy ${gov.legitimacy.toFixed(0)}).`,
        causeIds: gatherCauses(world, ['th_instability', 'th_discontent', 'shortage_food', 'shortage_goods', 'plague', 'disaster', 'tax_up', 'policy'].map((t) => causeKey.civ(civ.id, t)), 4),
        effects: [{ label: 'Stability', before: prevStab.toFixed(0), after: civ.stability.toFixed(0) }],
      });
      noteCause(world, causeKey.civ(civ.id, 'unrest'), ev.id);
    }
    if (civ.conditions.crisis >= 2 && rng.chance(0.35 + (22 - civ.stability) / 50)) {
      revolution(world, rng, civ, leader);
      return;
    }
  } else if (civ.conditions.crisis) {
    delete civ.conditions.crisis;
  }

  // Term limits and elections.
  if (gov.termLengthDays > 0 && world.time - gov.termStart >= gov.termLengthDays * MINUTES_PER_DAY) {
    succession(world, rng, civ, 'term');
    return;
  }
  // Elderly rulers for life may abdicate.
  if (gov.termLengthDays === 0 && ageOf(leader, world.time) > 78 && rng.chance(0.05)) {
    succession(world, rng, civ, 'abdication');
    return;
  }

  adjustPolicies(world, rng, civ, leader);
}

function candidates(world: World, civ: Civilization): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.civId === civ.id && ageOf(c, world.time) >= 28 && c.occupation !== 'student');
}

function candidateScore(c: Character, civ: Civilization, rng: Rng): number {
  const pref = GOVERNMENTS[civ.government.type].preferredSkill;
  return c.skills[pref] * 0.8 + c.skills.leadership + c.reputation * 0.9 + (c.goals.some((g) => g.type === 'lead') ? 15 : 0) + rng.range(0, 25);
}

export function succession(world: World, rng: Rng, civ: Civilization, reason: 'term' | 'vacancy' | 'abdication' | 'revolution' | 'creator', causeIds: string[] = [], exclude?: string): Character | undefined {
  const gov = civ.government;
  const def = GOVERNMENTS[gov.type];
  const old = gov.leaderId ? world.characters[gov.leaderId] : undefined;
  const pool = candidates(world, civ).filter((c) => (c.id !== old?.id || reason === 'term') && c.id !== exclude);
  if (!pool.length) return undefined;
  let winner: Character | undefined;
  let how = '';
  let reelected = false;
  if (def.succession === 'heredity') {
    const heirs = old ? old.childIds.map((id) => world.characters[id]).filter((c) => c?.alive && ageOf(c, world.time) >= 18) : [];
    const kin = old ? pool.filter((c) => c.familyName === old.familyName && c.id !== old.id) : [];
    winner = heirs[0] ?? kin.sort((a, b) => b.skills.leadership - a.skills.leadership)[0];
    how = winner ? (heirs.length ? 'by right of inheritance' : 'as nearest of kin') : '';
    if (!winner) {
      winner = pool.sort((a, b) => candidateScore(b, civ, rng) - candidateScore(a, civ, rng))[0];
      how = 'after the line of succession failed';
    }
  } else {
    const scored = pool.map((c) => {
      let s = candidateScore(c, civ, rng);
      if (c.id === old?.id) s += (civ.satisfaction - 55) * 1.5; // incumbency rises and falls with public mood
      return { c, s };
    });
    scored.sort((a, b) => b.s - a.s);
    winner = scored[0].c;
    reelected = winner.id === old?.id;
    how =
      def.succession === 'election'
        ? reelected
          ? `re-elected with public satisfaction at ${civ.satisfaction.toFixed(0)}`
          : `elected over ${scored.length > 1 ? fullName(scored[1].c) : 'no rival'}`
        : def.succession === 'council'
          ? 'chosen by the council'
          : 'appointed by peers';
  }
  if (!winner) return undefined;
  if (old && !reelected) civ.pastLeaderIds.push(old.id);
  gov.leaderId = winner.id;
  gov.termStart = world.time;
  gov.legitimacy = reason === 'revolution' ? 45 : clamp(def.baseLegitimacy + (winner.reputation - 50) * 0.3, 20, 95);
  winner.notable = true;
  winner.reputation = Math.min(100, winner.reputation + 10);
  if (!reelected) {
    winner.occupation = 'official';
    winner.occupationSince = world.time;
  }
  const lead = winner.goals.find((g) => g.type === 'lead');
  if (lead) lead.progress = 1;
  const reasonText: Record<string, string> = {
    term: `The term of ${old ? fullName(old) : 'the previous leader'} ended (${(def.termLengthDays / DAYS_PER_YEAR).toFixed(0)}-year term).`,
    vacancy: old ? `${fullName(old)} ${old.alive ? 'left office' : 'died in office'}.` : 'The office stood empty.',
    abdication: `${old ? fullName(old) : 'The ruler'} stepped down at age ${old ? ageOf(old, world.time) : '?'}.`,
    revolution: 'The previous order collapsed in revolution.',
    creator: 'A leadership change was imposed through the Creator Console.',
  };
  const ev = recordEvent(world, {
    category: 'politics',
    title: reelected ? `${fullName(winner)} re-elected` : `${fullName(winner)} becomes ${gov.leaderTitle}`,
    description: `${fullName(winner)} (${ageOf(winner, world.time)}) was ${how} as ${gov.leaderTitle} of the ${civ.name}.`,
    importance: reelected ? 3 : 4,
    civIds: [civ.id],
    characterIds: [winner.id, ...(old && !reelected ? [old.id] : [])],
    cause: reasonText[reason],
    causeIds: [
      ...causeIds,
      // the previous accession (a chain of rulers), what ended it, and the winner's own story
      lastCause(world, causeKey.civ(civ.id, 'leader')),
      reason === 'vacancy' ? lastCause(world, causeKey.civ(civ.id, 'leader_death')) : undefined,
      lastCause(world, causeKey.char(winner.id)),
    ].slice(0, 5),
    effects: [
      { label: gov.leaderTitle, before: old ? fullName(old) : '—', after: fullName(winner) },
      { label: 'Legitimacy', after: gov.legitimacy.toFixed(0) },
    ],
    source: reason === 'creator' ? 'creator' : 'simulation',
  });
  noteCause(world, [causeKey.civ(civ.id, 'leader'), causeKey.char(winner.id)], ev.id);
  addMemory(winner, { t: world.time, text: reelected ? `Re-elected as ${gov.leaderTitle}.` : `Became ${gov.leaderTitle} of the ${civ.name}.`, valence: 0.9, importance: 5, eventId: ev.id });
  if (old && old.alive && !reelected) addMemory(old, { t: world.time, text: `Left the office of ${gov.leaderTitle}.`, valence: reason === 'revolution' ? -0.9 : -0.2, importance: 4, eventId: ev.id });
  // Citizens react according to their relationship with the new leader.
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.civId !== civ.id || c === winner || c === old) continue;
    const rel = c.relationships[winner.id];
    if (rel && Math.abs(rel.affinity) > 25) {
      addMemory(c, { t: world.time, text: `${rel.affinity > 0 ? 'Celebrated' : 'Was dismayed by'} ${winner.givenName}'s rise to power.`, valence: rel.affinity > 0 ? 0.6 : -0.5, importance: 3, eventId: ev.id, withId: winner.id });
      c.mood = clamp(c.mood + rel.affinity * 0.2, -100, 100);
    }
  }
  return winner;
}

function revolution(world: World, rng: Rng, civ: Civilization, oldLeader: Character): void {
  const gov = civ.government;
  const oldType = gov.type;
  const v = civ.culture.values;
  const options = (Object.keys(GOVERNMENTS) as GovernmentType[]).filter((t) => t !== oldType);
  const newType = options
    .map((t) => {
      const pref = GOVERNMENTS[t].culture;
      let s = rng.range(0, 0.6);
      for (const k of Object.keys(pref) as (keyof CultureValues)[]) s += (pref[k] ?? 0) * v[k];
      return { t, s };
    })
    .sort((a, b) => b.s - a.s)[0].t;
  const def = GOVERNMENTS[newType];
  gov.type = newType;
  gov.leaderTitle = def.leaderTitle;
  gov.termLengthDays = def.termLengthDays;
  const removed = gov.policies.filter((p) => POLICIES[p].satisfaction !== undefined && (POLICIES[p].satisfaction ?? 0) < 0);
  gov.policies = gov.policies.filter((p) => !removed.includes(p));
  const ev = recordEvent(world, {
    category: 'politics',
    title: `Revolution in the ${civ.name}`,
    description: `The ${oldType} of ${fullName(oldLeader)} has fallen. A ${newType} is proclaimed.`,
    importance: 5,
    civIds: [civ.id],
    characterIds: [oldLeader.id],
    cause: `Months of crisis: stability ${civ.stability.toFixed(0)}, satisfaction ${civ.satisfaction.toFixed(0)}, legitimacy ${gov.legitimacy.toFixed(0)}.`,
    causeIds: gatherCauses(world, ['unrest', 'th_instability', 'shortage_food', 'disaster', 'leader'].map((t) => causeKey.civ(civ.id, t)), 4),
    effects: [
      { label: 'Government', before: oldType, after: newType },
      ...removed.map((p) => ({ label: 'Policy repealed', after: POLICIES[p].name })),
    ],
  });
  civ.stability = 40;
  civ.satisfaction = Math.max(civ.satisfaction, 45);
  delete civ.conditions.crisis;
  noteCause(world, [causeKey.civ(civ.id, 'revolution'), causeKey.civ(civ.id, 'disaster')], ev.id);
  addMemory(oldLeader, { t: world.time, text: 'Was overthrown in the revolution.', valence: -1, importance: 5, eventId: ev.id });
  oldLeader.reputation = Math.max(0, oldLeader.reputation - 30);
  succession(world, rng, civ, 'revolution', [ev.id]);
}

/** The leader's personality and the civ's situation shape policy choices. */
function adjustPolicies(world: World, rng: Rng, civ: Civilization, leader: Character): void {
  if (!rng.chance(0.35)) return;
  const gov = civ.government;
  const e = civ.economy;
  const popM = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0), 0) / 1e6;
  const wants: { p: PolicyId; why: string; w: number; keys?: string[] }[] = [];
  const K = (t: string) => causeKey.civ(civ.id, t);
  if (e.treasury < -popM * 20) wants.push({ p: 'austerity', why: `the treasury is in deficit (${Math.round(e.treasury)})`, w: 3, keys: ['th_deficit', 'tax_up'] });
  if (civ.conditions.shortage_food || e.production.food < e.consumption.food * 0.97) wants.push({ p: 'agrarian_subsidies', why: 'food output lags consumption', w: 2.5, keys: ['shortage_food', 'th_granaries', 'th_chronic_food', 'disturbance'] });
  if (civ.stability < 40) {
    if (leader.personality.agreeableness < 0.4 || civ.culture.values.militarism > 0.3) wants.push({ p: 'martial_order', why: `stability has fallen to ${civ.stability.toFixed(0)}`, w: 2.2, keys: ['unrest', 'th_instability', 'th_discontent'] });
    else wants.push({ p: civ.culture.values.collectivism > 0 ? 'welfare' : 'cultural_festivals', why: `stability has fallen to ${civ.stability.toFixed(0)}`, w: 2.2, keys: ['unrest', 'th_instability', 'th_discontent'] });
  }
  if (e.production.goods < e.consumption.goods || e.production.materials < e.consumption.materials * 0.95) wants.push({ p: 'industrial_drive', why: 'materials and goods are scarce', w: 1.6, keys: ['shortage_goods', 'shortage_materials', 'th_chronic_goods', 'th_chronic_materials'] });
  if (leader.personality.openness > 0.6) wants.push({ p: 'research_grants', why: `${leader.givenName} champions science`, w: 1.2, keys: ['leader'] });
  if (leader.personality.openness > 0.55 && civ.culture.values.openness > 0) wants.push({ p: 'exploration_charter', why: `${leader.givenName} wants to chart the unknown`, w: 1, keys: ['leader', 'explore'] });
  if (e.treasury > popM * 400) wants.push({ p: 'public_works', why: 'the treasury is flush', w: 1.3, keys: ['th_surplus', 'tax_down'] });
  const candidates = wants.filter((w) => !gov.policies.includes(w.p) && !(POLICIES[w.p].excludes ?? []).some((x) => gov.policies.includes(x)));
  // remove policies that no longer make sense
  const drop: { p: PolicyId; why: string; keys: string[] }[] = [];
  if (gov.policies.includes('austerity') && e.treasury > popM * 120) drop.push({ p: 'austerity', why: 'the treasury has recovered', keys: ['th_deficit_end', 'th_surplus'] });
  if (gov.policies.includes('martial_order') && civ.stability > 62) drop.push({ p: 'martial_order', why: 'order has been restored', keys: ['th_instability_end', 'th_discontent_end'] });
  if (gov.policies.includes('public_works') && e.treasury < 0) drop.push({ p: 'public_works', why: 'the state can no longer afford it', keys: ['th_deficit'] });
  if (drop.length) {
    const d = drop[0];
    gov.policies = gov.policies.filter((p) => p !== d.p);
    const rep = recordEvent(world, {
      category: 'politics',
      title: `${civ.name} repeals ${POLICIES[d.p].name}`,
      description: `${fullName(leader)} ended the ${POLICIES[d.p].name} policy.`,
      importance: 2,
      civIds: [civ.id],
      characterIds: [leader.id],
      cause: `Repealed because ${d.why}.`,
      causeIds: [lastCause(world, K(`policy_${d.p}`)), ...gatherCauses(world, d.keys.map(K), 2), lastCause(world, K('leader'))],
      effects: [{ label: 'Policies', after: gov.policies.map((p) => POLICIES[p].name).join(', ') || 'none' }],
    });
    noteCause(world, [K('policy'), K(`repeal_${d.p}`)], rep.id);
    return;
  }
  if (!candidates.length) return;
  const pick = rng.weighted(candidates, (c) => c.w);
  if (gov.policies.length >= 4) {
    // replace the least aligned policy
    const worst = [...gov.policies].sort((a, b) => policyAlignment(civ, a) - policyAlignment(civ, b))[0];
    gov.policies = gov.policies.filter((p) => p !== worst);
  }
  for (const ex of POLICIES[pick.p].excludes ?? []) gov.policies = gov.policies.filter((p) => p !== ex);
  gov.policies.push(pick.p);
  const ev = recordEvent(world, {
    category: 'politics',
    title: `${civ.name} enacts ${POLICIES[pick.p].name}`,
    description: `${fullName(leader)} introduced ${POLICIES[pick.p].name}: ${POLICIES[pick.p].description}`,
    importance: 2,
    civIds: [civ.id],
    characterIds: [leader.id],
    cause: `Enacted because ${pick.why}.`,
    causeIds: [...gatherCauses(world, (pick.keys ?? []).map(K), 3), lastCause(world, K('leader'))],
    effects: [{ label: 'Policies', after: gov.policies.map((p) => POLICIES[p].name).join(', ') }],
  });
  noteCause(world, [K('policy'), K(`policy_${pick.p}`)], ev.id);
}

export function leaderTenureYears(civ: Civilization, now: number): number {
  return (now - civ.government.termStart) / MINUTES_PER_YEAR;
}
