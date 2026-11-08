/**
 * Individual inhabitants: a transparent utility-based decision system.
 *
 * Each agent re-evaluates only when its current activity ends (not every
 * frame or tick). At that moment the finished activity's effects are applied
 * (needs, skills, wealth, relationships, contributions to society), then every
 * candidate activity is scored from needs, personality, goals, time of day
 * and circumstances. The winner and its main reasons are stored on the agent
 * so the UI can explain *why* someone is doing what they do.
 *
 * The decision function is isolated behind `scoreActivities`, so a language
 * model could later be plugged in as an alternative "deliberation" strategy
 * for notable characters without touching the rest of the simulation.
 */
import type { Rng } from '../rng';
import { clamp } from '../rng';
import { OCCUPATIONS, INTERESTS, SPECIALIZATION_JOBS, WORKING_OCCUPATIONS } from '../data/society';
import { createCharacter, link } from '../generate/society';
import {
  SKILLS,
  type Activity,
  type ActivityType,
  type Character,
  type Civilization,
  type GoalType,
  type Occupation,
  type Skill,
  type World,
} from '../types';
import { MINUTES_PER_DAY, MINUTES_PER_YEAR, hourOfDay } from '../time';
import { addMemory, ageOf, fullName, recordEvent } from '../world';
import { goalActivityBias, makeGoal, skillLabel } from './goals';
import { succession } from './politics';
import type { DayContext } from './economy';

export interface Candidate {
  type: ActivityType;
  score: number;
  factors: string[];
  targetId?: string;
}

const SECTOR_OF: Partial<Record<Occupation, string>> = {
  farmer: 'agriculture',
  engineer: 'industry',
  artisan: 'industry',
  miner: 'mining',
  merchant: 'trade',
  pilot: 'trade',
  scientist: 'research',
  teacher: 'research',
};

function isChild(c: Character, now: number): boolean {
  return (now - c.birthTime) / MINUTES_PER_YEAR < 14;
}

/** Score all candidate activities for an agent at time `now`. */
export function scoreActivities(world: World, rng: Rng, c: Character, now: number): Candidate[] {
  const h = hourOfDay(now);
  const night = h >= 22 || h < 6;
  const workHours = h >= 8 && h < 17;
  const evening = h >= 17 && h < 22;
  const mealtime = (h >= 7 && h < 8.5) || (h >= 12 && h < 13.5) || (h >= 18.5 && h < 20);
  const p = c.personality;
  const n = c.needs;
  const d = (v: number) => clamp((100 - v) / 100, 0, 1);
  const child = isChild(c, now);
  const civ = world.civs[c.civId];
  const isLeader = civ?.government.leaderId === c.id;
  const cands: Candidate[] = [];
  const bias: Record<string, number> = {};
  for (const g of c.goals) for (const [k, v] of Object.entries(goalActivityBias(g))) bias[k] = (bias[k] ?? 0) + (v ?? 0);

  const push = (type: ActivityType, score: number, factors: string[], targetId?: string) => cands.push({ type, score, factors, targetId });

  push('sleep', (night ? 0.75 : 0.03) + Math.pow(d(n.energy), 1.5) * 1.3 - (n.energy > 90 && !night ? 1 : 0), [night ? 'night-time' : 'daytime', `energy ${n.energy.toFixed(0)}`]);
  push('eat', Math.pow(d(n.hunger), 1.3) * 1.4 + (mealtime ? 0.3 : 0), [`hunger ${n.hunger.toFixed(0)}`, ...(mealtime ? ['mealtime'] : [])]);

  if (!child && c.occupation !== 'student' && c.occupation !== 'retired') {
    const base = (workHours ? 0.6 : 0.02) * (0.55 + p.conscientiousness * 0.8);
    const s = base + d(n.purpose) * 0.3 + d(n.security) * 0.35 + (bias.work ?? 0) * (workHours ? 1 : 0.2);
    const type: ActivityType = isLeader ? 'govern' : c.occupation === 'explorer' ? 'explore' : 'work';
    push(type, s + (isLeader ? (bias.govern ?? 0) : 0), [workHours ? 'working hours' : 'off-hours', `conscientiousness ${(p.conscientiousness * 100).toFixed(0)}`, ...(n.security < 45 ? [`financial worry`] : [])]);
  }
  const studyBoost = c.occupation === 'student' && workHours ? 0.75 : 0;
  push('study', (night ? 0 : 0.08 + p.openness * 0.22 + d(n.purpose) * 0.12) + studyBoost + (bias.study ?? 0) * (night ? 0.1 : 1), [
    c.occupation === 'student' ? 'attending school' : `curiosity ${(p.openness * 100).toFixed(0)}`,
    ...(bias.study ? ['pursuing a goal'] : []),
  ]);
  // Only look for company when it could plausibly win (keeps decisions cheap).
  const wantsCompany = d(n.social) > 0.2 || evening || (bias.socialize ?? 0) > 0;
  const others = wantsCompany && !(night && h < 5) ? socialTargets(world, c) : [];
  if (others.length) {
    const target = rng.weighted(others, (o) => 1 + Math.max(0, (c.relationships[o.id]?.affinity ?? 0) + 20) / 20 + (c.relationships[o.id]?.kind === 'partner' ? 4 : 0));
    push('socialize', d(n.social) * (0.35 + p.extraversion * 0.85) + (evening ? 0.28 : 0) + (bias.socialize ?? 0), [`social need ${n.social.toFixed(0)}`, `extraversion ${(p.extraversion * 100).toFixed(0)}`, ...(evening ? ['evening'] : [])], target.id);
  }
  push('leisure', d(n.fun) * 0.85 + (evening ? 0.18 : 0) + (child ? 0.25 : 0), [`fun ${n.fun.toFixed(0)}`]);
  if (!child && !night && (c.occupation === 'artist' || c.skills.art > 30 || bias.create)) {
    push('create', c.skills.art / 250 + d(n.fun) * 0.2 + (bias.create ?? 0) + (c.occupation === 'artist' && workHours ? 0.45 : 0), [`artistry ${c.skills.art.toFixed(0)}`]);
  }
  if (!child && !night && c.occupation !== 'explorer' && (bias.explore ?? 0) > 0) {
    push('explore', 0.1 + p.openness * 0.25 + (bias.explore ?? 0) * 0.8 - (workHours ? 0.15 : 0), ['wanderlust', `openness ${(p.openness * 100).toFixed(0)}`]);
  }
  // Travel: return home, or visit a goal destination.
  if (c.travel && now >= c.travel.until && !night) push('travel', 1.4, ['visit is over; heading home'], c.travel.from);
  const visit = c.goals.find((g) => g.type === 'explore' && g.target.startsWith('visit:'));
  if (!c.travel && visit && !night && !child) push('travel', 0.2 + p.openness * 0.35 + (bias.travel ?? 0) * 0.5, [`goal: ${visit.description}`], visit.target.slice(6));
  const recentLoss = c.memories.find((m) => m.valence <= -0.8 && now - m.t < 3 * MINUTES_PER_DAY && m.withId);
  if (recentLoss) push('mourn', 0.55 + p.neuroticism * 0.4, ['grieving a loss']);

  // Personal noise: anxious personalities are less predictable.
  for (const cd of cands) cd.score += rng.normal(0, 0.04 + p.neuroticism * 0.07);
  return cands.sort((a, b) => b.score - a.score);
}

/** Living residents grouped by settlement, rebuilt daily or when the roster changes. */
let residentCache: { world: World | null; day: number; count: number; map: Map<string, Character[]> } = { world: null, day: -1, count: -1, map: new Map() };

function residents(world: World, settlementId: string): Character[] {
  const day = Math.floor(world.time / MINUTES_PER_DAY);
  let count = 0;
  for (const _ in world.characters) count++;
  if (residentCache.world !== world || residentCache.day !== day || residentCache.count !== count) {
    const map = new Map<string, Character[]>();
    for (const id in world.characters) {
      const ch = world.characters[id];
      if (!ch.alive) continue;
      const list = map.get(ch.settlementId);
      if (list) list.push(ch);
      else map.set(ch.settlementId, [ch]);
    }
    residentCache = { world, day, count, map };
  }
  return residentCache.map.get(settlementId) ?? [];
}

function socialTargets(world: World, c: Character): Character[] {
  const out: Character[] = [];
  for (const id of Object.keys(c.relationships)) {
    const o = world.characters[id];
    if (o?.alive && o.settlementId === c.settlementId && isAvailable(o, world.time)) out.push(o);
  }
  if (out.length < 4) {
    // meet new people in town (bounded scan)
    let found = 0;
    for (const o of residents(world, c.settlementId)) {
      if (found >= 4) break;
      if (o.alive && o.id !== c.id && o.settlementId === c.settlementId && !c.relationships[o.id] && isAvailable(o, world.time)) {
        out.push(o);
        found++;
      }
    }
  }
  return out;
}

/** Someone is free to socialise unless asleep, working, travelling or away. */
function isAvailable(o: Character, now: number): boolean {
  const t = o.activity.type;
  if (t === 'sleep' || t === 'work' || t === 'govern' || t === 'travel' || t === 'explore' || t === 'mourn') return false;
  return o.activity.endsAt - now < 240 || t === 'leisure' || t === 'idle' || t === 'eat';
}

function durationFor(rng: Rng, type: ActivityType, now: number, c: Character): number {
  const h = hourOfDay(now);
  switch (type) {
    case 'sleep': {
      if (h >= 20 || h < 6) {
        const wake = 5.5 + rng.range(0, 2) + (c.personality.conscientiousness < 0.4 ? 1 : 0);
        const hrs = h >= 20 ? 24 - h + wake : wake - h;
        return Math.max(60, hrs * 60);
      }
      return rng.range(60, 120);
    }
    case 'eat':
      return rng.range(30, 60);
    case 'work':
    case 'govern':
      return h < 12 ? Math.max(60, (12 - h) * 60) : Math.max(60, Math.min(5, 17.5 - h) * 60);
    case 'study':
      return rng.range(90, 180);
    case 'socialize':
      return rng.range(60, 180);
    case 'leisure':
      return rng.range(60, 150);
    case 'create':
      return rng.range(120, 240);
    case 'explore':
      return rng.range(240, 480);
    case 'travel':
      return rng.range(300, 720);
    case 'mourn':
      return rng.range(120, 240);
    default:
      return 60;
  }
}

function describe(world: World, c: Character, type: ActivityType, targetId?: string): string {
  const s = world.settlements[c.settlementId];
  const place = s?.name ?? 'the wilds';
  switch (type) {
    case 'sleep':
      return 'Sleeping at home';
    case 'eat':
      return `Sharing a meal in ${place}`;
    case 'work':
      return `${OCCUPATIONS[c.occupation].verb[0].toUpperCase()}${OCCUPATIONS[c.occupation].verb.slice(1)}`;
    case 'govern':
      return `Presiding over the affairs of state`;
    case 'study': {
      const g = c.goals.find((x) => x.type === 'master_skill' || x.type === 'change_occupation');
      if (c.occupation === 'student') return 'Attending lessons';
      return g ? `Studying (${g.description.toLowerCase()})` : `Reading about ${c.interests[0] ?? 'the world'}`;
    }
    case 'socialize': {
      const o = targetId ? world.characters[targetId] : undefined;
      return o ? `Spending time with ${o.givenName}` : 'Meeting people';
    }
    case 'leisure':
      return `Enjoying ${c.interests[0] ?? 'some free time'}`;
    case 'create':
      return 'Working on a new creation';
    case 'explore':
      return `Exploring beyond ${place}`;
    case 'travel': {
      const t = targetId ? world.settlements[targetId] : undefined;
      return t ? `Travelling to ${t.name}` : 'Travelling';
    }
    case 'mourn':
      return 'Grieving quietly';
    default:
      return 'Pausing to think';
  }
}

/** Apply the consequences of the activity that just finished. */
function completeActivity(world: World, rng: Rng, c: Character, ctx: DayContext): void {
  const a = c.activity;
  const hours = Math.max(0, (a.endsAt - a.startedAt) / 60);
  const n = c.needs;
  const p = c.personality;
  const civ = world.civs[c.civId];
  const famine = !!civ?.conditions.shortage_food;
  // passive decay
  n.energy -= hours * 3.4;
  n.hunger -= hours * (famine ? 6 : 4.4);
  n.social -= hours * 1.3 * (0.5 + p.extraversion);
  n.purpose -= hours * 1.1;
  n.fun -= hours * 1.5;
  const wealthSecurity = clamp(30 + Math.log10(Math.max(1, c.wealth)) * 22, 0, 100) - (famine ? 25 : 0) - (civ && civ.stability < 35 ? 15 : 0);
  n.security += (wealthSecurity - n.security) * 0.1;

  switch (a.type) {
    case 'sleep':
      n.energy += hours * 13;
      c.health = clamp(c.health + hours * 0.05, 0, 100 - Math.max(0, ageOf(c, world.time) - 60) * 0.8);
      break;
    case 'eat':
      n.hunger += famine ? 35 : 70;
      n.social += 6;
      break;
    case 'work':
    case 'govern':
    case 'explore': {
      const occ = OCCUPATIONS[c.occupation];
      const skill = c.skills[occ.skill];
      n.purpose += hours * 9;
      const earned = occ.wage * 0.12 * hours * (0.6 + skill / 150) * (1 - (civ?.economy.taxRate ?? 0.2));
      c.wealth += earned;
      c.skills[occ.skill] = Math.min(100, skill + hours * 0.0022 * (0.5 + p.conscientiousness) * (1 - skill / 130));
      if (civ) {
        const w = ctx.work.get(civ.id) ?? {};
        const sector = SECTOR_OF[c.occupation];
        if (sector) w[sector] = (w[sector] ?? 0) + (skill * hours) / 8;
        if (c.occupation === 'engineer' && world.settlements[c.settlementId]?.specialization === 'energy') w.energy = (w.energy ?? 0) + (skill * hours) / 8;
        if (c.occupation === 'scientist') {
          // direct research contribution, credited to the individual
          const pts = (skill / 280) * (hours / 8) * (0.6 + p.openness * 0.8);
          w.research_points = (w.research_points ?? 0) + pts;
          c.contributions += pts;
        }
        ctx.work.set(civ.id, w);
        if (a.type === 'govern') {
          civ.government.legitimacy = clamp(civ.government.legitimacy + 0.01 * (c.skills.leadership / 50), 0, 100);
          c.skills.leadership = Math.min(100, c.skills.leadership + hours * 0.002);
        }
      }
      if (a.type === 'explore') exploreAttempt(world, rng, c, hours);
      break;
    }
    case 'study': {
      const g = c.goals.find((x) => x.type === 'master_skill' || x.type === 'change_occupation');
      let sk: Skill = OCCUPATIONS[c.occupation].skill;
      if (g?.type === 'master_skill') sk = g.target.split(':')[0] as Skill;
      if (g?.type === 'change_occupation') sk = OCCUPATIONS[g.target as Occupation].skill;
      c.skills[sk] = Math.min(100, c.skills[sk] + hours * 0.014 * (0.5 + p.openness) * (1 - c.skills[sk] / 130));
      n.purpose += hours * 6;
      n.fun += hours * (p.openness > 0.6 ? 3 : -1);
      if (rng.chance(0.004 * hours * p.openness)) gainInterest(world, rng, c, 'studying');
      break;
    }
    case 'socialize': {
      n.social += hours * 16;
      n.fun += hours * 6;
      const o = a.targetId ? world.characters[a.targetId] : undefined;
      if (o?.alive) interact(world, rng, c, o, hours);
      break;
    }
    case 'leisure':
      n.fun += hours * 16;
      n.energy += hours * 1;
      break;
    case 'create': {
      n.fun += hours * 7;
      n.purpose += hours * 7;
      c.skills.art = Math.min(100, c.skills.art + hours * 0.006 * (1 - c.skills.art / 130));
      const g = c.goals.find((x) => x.type === 'create_work');
      if (g) {
        g.progress = Math.min(1, g.progress + hours * (0.0004 + c.skills.art / 100000));
      }
      break;
    }
    case 'travel': {
      const dest = a.targetId ? world.settlements[a.targetId] : undefined;
      if (dest) {
        const from = c.settlementId;
        c.settlementId = dest.id;
        if (dest.id === c.homeSettlementId) {
          c.travel = undefined;
          logRecent(c, world.time, `Returned home to ${dest.name}`);
        } else {
          c.travel = { from, until: world.time + rng.range(2, 6) * MINUTES_PER_DAY };
          addMemory(c, { t: world.time, text: `Travelled to ${dest.name}.`, valence: 0.3, importance: 2 });
          const visitGoal = c.goals.find((g) => g.target === `visit:${dest.id}`);
          if (visitGoal) visitGoal.progress = 1;
        }
      }
      n.energy -= hours * 1.5;
      break;
    }
    case 'mourn':
      c.mood = clamp(c.mood + 6, -100, 100);
      break;
    default:
      break;
  }
  for (const k of Object.keys(n) as (keyof typeof n)[]) n[k] = clamp(n[k], 0, 100);
  // Mood: needs satisfaction, recent memories and temperament.
  const avg = (n.energy + n.hunger + n.social + n.purpose + n.fun + n.security) / 6;
  let memMood = 0;
  for (let i = c.memories.length - 1, k = 0; i >= 0 && k < 6; i--, k++) {
    const m = c.memories[i];
    const age = (world.time - m.t) / MINUTES_PER_DAY;
    memMood += (m.valence * m.importance * 6) / (1 + age / 10);
  }
  const target = clamp((avg - 50) * 1.4 + memMood + (0.5 - p.neuroticism) * 20, -100, 100);
  c.mood = c.mood + (target - c.mood) * 0.35;
}

function logRecent(c: Character, t: number, text: string): void {
  c.recent.push({ t, text });
  if (c.recent.length > 10) c.recent.shift();
}

/** Social interaction: affinity evolves from compatibility and mood. */
function interact(world: World, rng: Rng, a: Character, b: Character, hours: number): void {
  const now = world.time;
  const compat =
    1 -
    Math.abs(a.personality.agreeableness - b.personality.agreeableness) * 0.8 -
    Math.abs(a.personality.openness - b.personality.openness) * 0.5 -
    Math.abs(a.personality.extraversion - b.personality.extraversion) * 0.3;
  const shared = a.interests.filter((i) => b.interests.includes(i)).length;
  const temper = (a.personality.agreeableness + b.personality.agreeableness) / 2;
  const delta = (compat - 0.45) * 8 + shared * 2.5 + (temper - 0.5) * 6 + (a.mood + b.mood) / 80 + rng.normal(0, 4);
  const first = !a.relationships[b.id];
  if (first) {
    a.relationships[b.id] = { affinity: 0, familiarity: 0, kind: 'acquaintance', since: now, lastInteraction: now };
    b.relationships[a.id] = { affinity: 0, familiarity: 0, kind: 'acquaintance', since: now, lastInteraction: now };
    addMemory(a, { t: now, text: `Met ${fullName(b)}.`, valence: 0.1, importance: 1, withId: b.id });
  }
  const ra = a.relationships[b.id];
  const rb = b.relationships[a.id] ?? (b.relationships[a.id] = { affinity: 0, familiarity: 0, kind: 'acquaintance', since: now, lastInteraction: now });
  ra.affinity = clamp(ra.affinity + delta * Math.min(1, hours / 2), -100, 100);
  rb.affinity = clamp(rb.affinity + delta * 0.85 * Math.min(1, hours / 2), -100, 100);
  ra.familiarity = Math.min(100, ra.familiarity + hours * 3);
  rb.familiarity = Math.min(100, rb.familiarity + hours * 3);
  ra.lastInteraction = rb.lastInteraction = now;
  b.needs.social = Math.min(100, b.needs.social + hours * 10);
  // shared interests can spread
  if (rng.chance(0.01 * hours)) {
    const theirs = b.interests.filter((i) => !a.interests.includes(i));
    if (theirs.length && a.interests.length < 5) {
      const i = rng.pick(theirs);
      a.interests.push(i);
      addMemory(a, { t: now, text: `${b.givenName} got me interested in ${i}.`, valence: 0.4, importance: 2, withId: b.id });
    }
  }
  updateKind(world, rng, a, b, ra, rb);
  logRecent(a, now, `Spent time with ${b.givenName} (${ra.affinity > 30 ? 'warm' : ra.affinity < -20 ? 'strained' : 'cordial'})`);
}

function updateKind(world: World, rng: Rng, a: Character, b: Character, ra: Character['relationships'][string], rb: Character['relationships'][string]): void {
  if (ra.kind === 'family' || ra.kind === 'partner' || ra.kind === 'mentor') {
    // partners may form from close friends; handled below
  }
  const now = world.time;
  const notable = a.notable || b.notable;
  const setBoth = (k: Character['relationships'][string]['kind']) => {
    ra.kind = k;
    rb.kind = k;
  };
  if ((ra.kind === 'acquaintance' || ra.kind === 'rival') && ra.affinity > 35 && ra.familiarity > 30) {
    const wasRival = ra.kind === 'rival';
    setBoth('friend');
    addMemory(a, { t: now, text: wasRival ? `Reconciled with ${b.givenName}.` : `Became friends with ${b.givenName}.`, valence: 0.6, importance: 3, withId: b.id });
    addMemory(b, { t: now, text: wasRival ? `Reconciled with ${a.givenName}.` : `Became friends with ${a.givenName}.`, valence: 0.6, importance: 3, withId: a.id });
    const fg = [...a.goals, ...b.goals].filter((g) => g.type === 'make_friend');
    for (const g of fg) g.progress = 1;
    if (notable) recordEvent(world, {
      category: 'personal',
      title: wasRival ? `${a.givenName} and ${b.givenName} reconcile` : `${a.givenName} and ${b.givenName} become friends`,
      description: `${fullName(a)} and ${fullName(b)} have grown close.`,
      importance: notable ? 2 : 1,
      civIds: [...new Set([a.civId, b.civId])],
      settlementId: a.settlementId,
      characterIds: [a.id, b.id],
      cause: `Repeated time together; compatible temperaments and ${a.interests.filter((i) => b.interests.includes(i)).join(', ') || 'mutual respect'}.`,
    });
  } else if (ra.kind === 'friend' && ra.affinity > 70 && ra.familiarity > 60) {
    setBoth('close_friend');
    addMemory(a, { t: now, text: `${b.givenName} has become one of my closest friends.`, valence: 0.7, importance: 3, withId: b.id });
  } else if ((ra.kind === 'acquaintance' || ra.kind === 'friend') && ra.affinity < -30) {
    setBoth('rival');
    addMemory(a, { t: now, text: `Fell out with ${b.givenName}.`, valence: -0.6, importance: 3, withId: b.id });
    addMemory(b, { t: now, text: `Fell out with ${a.givenName}.`, valence: -0.6, importance: 3, withId: a.id });
    if (notable) recordEvent(world, {
      category: 'personal',
      title: `${a.givenName} and ${b.givenName} become rivals`,
      description: `A falling-out between ${fullName(a)} and ${fullName(b)}.`,
      importance: notable ? 2 : 1,
      civIds: [...new Set([a.civId, b.civId])],
      settlementId: a.settlementId,
      characterIds: [a.id, b.id],
      cause: `Clashing temperaments (agreeableness ${(a.personality.agreeableness * 100).toFixed(0)} vs ${(b.personality.agreeableness * 100).toFixed(0)}) and tense encounters.`,
    });
  }
  // Partnership
  if ((ra.kind === 'close_friend' || ra.kind === 'friend') && ra.affinity > 62 && rb.affinity > 55 && ra.familiarity > 55) {
    const adult = (c: Character) => ageOf(c, now) >= 21;
    const hasPartner = (c: Character) => Object.values(c.relationships).some((r) => r.kind === 'partner');
    const related = a.familyName === b.familyName || a.parentIds.includes(b.id) || b.parentIds.includes(a.id);
    if (adult(a) && adult(b) && !hasPartner(a) && !hasPartner(b) && !related && Math.abs(ageOf(a, now) - ageOf(b, now)) < 15 && rng.chance(0.12)) {
      setBoth('partner');
      addMemory(a, { t: now, text: `Committed to a life together with ${b.givenName}.`, valence: 0.95, importance: 5, withId: b.id });
      addMemory(b, { t: now, text: `Committed to a life together with ${a.givenName}.`, valence: 0.95, importance: 5, withId: a.id });
      recordEvent(world, {
        category: 'personal',
        title: `${a.givenName} ${a.familyName} and ${b.givenName} ${b.familyName} are partnered`,
        description: `A union celebrated in ${world.settlements[a.settlementId]?.name ?? 'their town'}.`,
        importance: notable ? 2 : 1,
        civIds: [...new Set([a.civId, b.civId])],
        settlementId: a.settlementId,
        characterIds: [a.id, b.id],
        cause: `Deep affinity (${ra.affinity.toFixed(0)}) built over time.`,
      });
    }
  }
}

function exploreAttempt(world: World, rng: Rng, c: Character, hours: number): void {
  const s = world.settlements[c.settlementId];
  if (!s) return;
  const planet = world.planets[s.planetId];
  const skill = c.skills.exploration;
  c.skills.exploration = Math.min(100, skill + hours * 0.004 * (1 - skill / 130));
  const goal = c.goals.find((g) => g.type === 'explore' && !g.target.startsWith('visit:'));
  const near = planet.regions[s.regionIndex].neighbors.map((i) => planet.regions[i]).filter((r) => !r.explored);
  const targetRegion = goal ? planet.regions[Number(goal.target)] : near[0];
  if (!targetRegion || targetRegion.explored) {
    if (goal) goal.progress = 1;
    return;
  }
  const charter = world.civs[c.civId]?.government.policies.includes('exploration_charter') ? 1.6 : 1;
  if (!rng.chance(0.0025 * hours * (0.4 + skill / 60) * charter)) return;
  targetRegion.explored = true;
  if (goal && Number(goal.target) === targetRegion.index) goal.progress = 1;
  const findRoll = rng.next();
  let find = 'its terrain and watercourses';
  const effects = [{ label: `${targetRegion.name}`, before: 'uncharted', after: 'explored' }] as { label: string; before?: string; after?: string }[];
  const civ = world.civs[c.civId];
  if (findRoll < 0.3) {
    targetRegion.resources.metals = Math.min(1, targetRegion.resources.metals + 0.2);
    find = 'rich metal deposits';
    effects.push({ label: 'Metal abundance', after: `+20%` });
  } else if (findRoll < 0.5) {
    find = 'ruins of a forgotten people';
    if (civ?.tech.researching) {
      civ.tech.boosts[civ.tech.researching] = (civ.tech.boosts[civ.tech.researching] ?? 0) + 60;
      effects.push({ label: 'Research boost', after: '+60 points' });
    }
  } else if (findRoll < 0.65) {
    targetRegion.fertility = Math.min(1, targetRegion.fertility + 0.15);
    find = 'fertile hidden valleys';
    effects.push({ label: 'Fertility', after: '+15%' });
  }
  c.reputation = Math.min(100, c.reputation + 5);
  addMemory(c, { t: world.time, text: `Charted the ${targetRegion.name} and found ${find}.`, valence: 0.8, importance: 4 });
  const ev = recordEvent(world, {
    category: 'exploration',
    title: `${fullName(c)} charts the ${targetRegion.name}`,
    description: `An expedition led by ${c.givenName} mapped the ${targetRegion.name} on ${planet.name}, discovering ${find}.`,
    importance: findRoll < 0.5 ? 3 : 2,
    civIds: [c.civId],
    planetId: planet.id,
    characterIds: [c.id],
    cause: `${c.givenName}'s ${c.occupation === 'explorer' ? 'work as an explorer' : 'personal wanderlust'} (exploration skill ${skill.toFixed(0)}).`,
    effects,
  });
  if (civ) civ.causeLinks.explore = ev.id;
}

function gainInterest(world: World, rng: Rng, c: Character, how: string): void {
  const options = INTERESTS.filter((i) => !c.interests.includes(i));
  if (!options.length || c.interests.length >= 5) return;
  const i = rng.pick(options);
  c.interests.push(i);
  addMemory(c, { t: world.time, text: `Developed a new interest in ${i} while ${how}.`, valence: 0.4, importance: 2 });
}

/** Run one agent's decision if its activity has finished. */
export function characterStep(world: World, rng: Rng, c: Character, ctx: DayContext): void {
  if (!c.alive || world.time < c.nextDecisionAt) return;
  completeActivity(world, rng, c, ctx);
  const cands = scoreActivities(world, rng, c, world.time);
  const best = cands[0];
  const dur = durationFor(rng, best.type, world.time, c);
  const act: Activity = {
    type: best.type,
    startedAt: world.time,
    endsAt: world.time + dur,
    targetId: best.targetId,
    description: describe(world, c, best.type, best.targetId),
    reason: `${best.factors.join(', ')} (utility ${best.score.toFixed(2)}${cands[1] ? `; next: ${cands[1].type} ${cands[1].score.toFixed(2)}` : ''})`,
  };
  c.activity = act;
  c.nextDecisionAt = act.endsAt;
  // The chosen companion joins in: their current activity is cut short (and its
  // effects applied for the time actually spent) so both spend the time together.
  if (best.type === 'socialize' && best.targetId) {
    const o = world.characters[best.targetId];
    if (o?.alive && o.activity.type !== 'socialize' && isAvailable(o, world.time)) {
      o.activity.endsAt = Math.max(o.activity.startedAt, world.time);
      completeActivity(world, rng, o, ctx);
      o.activity = {
        type: 'socialize',
        startedAt: world.time,
        endsAt: act.endsAt,
        targetId: c.id,
        description: describe(world, o, 'socialize', c.id),
        reason: `invited by ${c.givenName}`,
      };
      o.nextDecisionAt = act.endsAt;
    }
  }
  if (best.type !== 'sleep' && best.type !== 'eat' && best.type !== 'socialize') logRecent(c, world.time, act.description);
}

const TARGET_GOALS: GoalType[] = ['master_skill', 'make_friend', 'explore', 'wealth', 'lead', 'discover', 'family', 'create_work'];

/** Daily life events: ageing, death, careers, goals, births. */
export function characterDaily(world: World, rng: Rng, c: Character, healthMod: number): void {
  if (!c.alive) return;
  const age = ageOf(c, world.time);
  const civ = world.civs[c.civId];
  // Mortality (Gompertz-like), reduced by medicine.
  const famine = civ?.conditions.shortage_food ? 1.8 : 1;
  const plague = civ?.conditions.plague ? 4 : 1;
  const yearly = 0.0004 * Math.exp(0.09 * (age - 30)) * (1 - Math.min(0.7, healthMod * 0.5)) * famine * plague * (c.health < 25 ? 3 : 1) + (age < 5 ? 0.002 : 0);
  if (rng.chance(yearly / 360)) {
    die(world, rng, c, plague > 1 ? 'the plague' : famine > 1 ? 'hardship during the famine' : age > 70 ? 'old age' : 'illness');
    return;
  }
  // Coming of age / graduation.
  if (c.occupation === 'student' && age >= 22) {
    const s = world.settlements[c.settlementId];
    const demand = s ? SPECIALIZATION_JOBS[s.specialization] : WORKING_OCCUPATIONS;
    const occ = [...WORKING_OCCUPATIONS].sort((x, y) => c.skills[OCCUPATIONS[y].skill] + (demand.includes(y) ? 10 : 0) - (c.skills[OCCUPATIONS[x].skill] + (demand.includes(x) ? 10 : 0)))[0];
    setOccupation(world, c, occ, `Completed studies and became a ${OCCUPATIONS[occ].label.toLowerCase()}.`);
  }
  // Retirement.
  if (age >= 68 && c.occupation !== 'retired' && civ?.government.leaderId !== c.id && rng.chance(0.002 * (age - 66))) {
    setOccupation(world, c, 'retired', `Retired after years as a ${OCCUPATIONS[c.occupation].label.toLowerCase()}.`);
  }
  // Discontent drives career change.
  if (c.needs.purpose < 35 && c.mood < 5) c.discontent += 1;
  else c.discontent = Math.max(0, c.discontent - 0.5);
  if (c.discontent > 20 && !c.goals.some((g) => g.type === 'change_occupation') && c.occupation !== 'student' && c.occupation !== 'retired') {
    const g = makeGoal(world, rng, c, 'change_occupation');
    if (g) {
      c.goals.push(g);
      addMemory(c, { t: world.time, text: `Felt unfulfilled and resolved to ${g.description.toLowerCase()}.`, valence: -0.2, importance: 3 });
      c.discontent = 0;
    }
  }
  evaluateGoals(world, rng, c);
  // Births to partnered couples wanting a family.
  const partnerId = Object.keys(c.relationships).find((id) => c.relationships[id].kind === 'partner');
  if (partnerId && age < 46 && age > 21) {
    const partner = world.characters[partnerId];
    const wants = c.goals.some((g) => g.type === 'family') || partner?.goals.some((g) => g.type === 'family');
    const kids = c.childIds.filter((id) => world.characters[id]?.alive).length;
    if (partner?.alive && c.id < partner.id && kids < 3 && rng.chance((wants ? 0.0016 : 0.0003) / (1 + kids))) birth(world, rng, c, partner);
  }
  // Cost of living scales with local prices; lifestyles creep up with wealth.
  if (civ) {
    const priceIndex = (civ.economy.prices.food * 2 + civ.economy.prices.goods + civ.economy.prices.energy) / 4;
    const support = civ.government.policies.includes('welfare') && c.wealth < 60 ? 0.8 : 0;
    c.wealth = Math.max(0, c.wealth - (age < 18 ? 0 : 1.5 * priceIndex + c.wealth * 0.0015) + support + (c.occupation === 'retired' ? 0.9 : 0));
  }
  // Leader death check handled in die(); occasional reputation drift
  c.reputation = clamp(c.reputation + (c.notable ? 0 : -0.01), 0, 100);
}

function setOccupation(world: World, c: Character, occ: Occupation, text: string): void {
  const prev = c.occupation;
  c.occupation = occ;
  c.occupationSince = world.time;
  addMemory(c, { t: world.time, text, valence: occ === 'retired' ? 0.2 : 0.5, importance: 4 });
  recordEvent(world, {
    category: 'personal',
    title: `${fullName(c)} becomes ${occ === 'retired' ? 'retired' : `a ${OCCUPATIONS[occ].label.toLowerCase()}`}`,
    description: text,
    importance: c.notable ? 2 : 1,
    civIds: [c.civId],
    settlementId: c.settlementId,
    characterIds: [c.id],
    cause: prev === 'student' ? `Graduated at ${ageOf(c, world.time)}; strongest skill: ${skillLabel(OCCUPATIONS[occ].skill)}.` : occ === 'retired' ? `Reached ${ageOf(c, world.time)} years of age.` : `Long dissatisfaction as a ${OCCUPATIONS[prev].label.toLowerCase()} and skill in ${skillLabel(OCCUPATIONS[occ].skill)} (${c.skills[OCCUPATIONS[occ].skill].toFixed(0)}).`,
    effects: [{ label: 'Occupation', before: OCCUPATIONS[prev].label, after: OCCUPATIONS[occ].label }],
  });
}

function evaluateGoals(world: World, rng: Rng, c: Character): void {
  for (const g of c.goals) {
    switch (g.type) {
      case 'master_skill': {
        const [sk, tgt] = g.target.split(':');
        g.progress = Math.min(1, c.skills[sk as Skill] / Number(tgt));
        break;
      }
      case 'wealth':
        g.progress = Math.min(1, c.wealth / Number(g.target));
        break;
      case 'change_occupation': {
        const occ = g.target as Occupation;
        const sk = c.skills[OCCUPATIONS[occ].skill];
        g.progress = Math.min(1, sk / 45);
        if (sk >= 45) setOccupation(world, c, occ, `Changed career to become a ${OCCUPATIONS[occ].label.toLowerCase()}.`);
        break;
      }
      case 'lead': {
        const civ = world.civs[c.civId];
        if (civ?.government.leaderId === c.id || (c.occupation === 'official' && c.reputation > 75)) g.progress = 1;
        else g.progress = Math.min(0.95, c.reputation / 80);
        break;
      }
      case 'discover':
        g.progress = Math.max(g.progress, Math.min(0.95, c.contributions / 400));
        break;
      case 'family':
        if (c.childIds.length) g.progress = 1;
        break;
      case 'create_work':
        if (g.progress >= 1) completeWork(world, rng, c);
        break;
      default:
        break;
    }
  }
  const done = c.goals.filter((g) => g.progress >= 1);
  for (const g of done) {
    c.needs.purpose = 100;
    c.mood = clamp(c.mood + 20, -100, 100);
    addMemory(c, { t: world.time, text: `Achieved a life goal: ${g.description.toLowerCase()}.`, valence: 0.85, importance: 4 });
    if (c.notable || g.type === 'lead' || g.type === 'discover') {
      recordEvent(world, {
        category: 'personal',
        title: `${fullName(c)} achieves a goal`,
        description: `${c.givenName} set out to ${g.description.toLowerCase()} — and did.`,
        importance: 1,
        civIds: [c.civId],
        settlementId: c.settlementId,
        characterIds: [c.id],
        cause: `Pursued since ${Math.max(0, Math.round((world.time - g.createdAt) / MINUTES_PER_DAY))} days earlier.`,
      });
    }
  }
  c.goals = c.goals.filter((g) => g.progress < 1 && world.time - g.createdAt < 25 * MINUTES_PER_YEAR);
  // Keep agents motivated: replace completed goals with new ones.
  if (c.goals.length < 2 && rng.chance(0.05) && c.occupation !== 'student') {
    const p = c.personality;
    const type = rng.weighted(TARGET_GOALS, (t) => {
      switch (t) {
        case 'master_skill':
          return 0.5 + p.conscientiousness;
        case 'make_friend':
          return 0.2 + p.extraversion;
        case 'explore':
          return p.openness;
        case 'wealth':
          return 0.3 + (1 - p.agreeableness) * 0.5;
        case 'lead':
          return c.skills.leadership / 80;
        case 'discover':
          return c.occupation === 'scientist' ? 1.2 : 0.1;
        case 'family':
          return ageOf(c, world.time) < 45 && ageOf(c, world.time) > 22 ? 0.5 : 0;
        case 'create_work':
          return c.skills.art / 60;
        default:
          return 0.1;
      }
    });
    if (!c.goals.some((g) => g.type === type)) {
      const g = makeGoal(world, rng, c, type);
      if (g) {
        c.goals.push(g);
        addMemory(c, { t: world.time, text: `Set a new aim: ${g.description.toLowerCase()}.`, valence: 0.3, importance: 2 });
      }
    }
  }
}

const WORK_FORMS = ['symphony', 'mural', 'epic poem', 'sculpture', 'novel', 'tapestry', 'light installation', 'song cycle'];
const WORK_THEMES = ['the First Dawn', 'the Long Migration', 'distant stars', 'the river at dusk', 'lost friends', 'the founding of the city', 'the turning seasons', 'the silent sky'];

function completeWork(world: World, rng: Rng, c: Character): void {
  const form = rng.pick(WORK_FORMS);
  const title = `${form[0].toUpperCase()}${form.slice(1)} of ${rng.pick(WORK_THEMES)}`;
  const quality = c.skills.art + rng.normal(0, 15);
  const civ = world.civs[c.civId];
  c.reputation = Math.min(100, c.reputation + (quality > 60 ? 15 : 5));
  if (quality > 60) c.notable = true;
  addMemory(c, { t: world.time, text: `Completed “${title}”.`, valence: 0.9, importance: 5 });
  const effects: { label: string; before?: string | number; after?: string | number }[] = [{ label: `${c.givenName}'s reputation`, after: Math.round(c.reputation) }];
  if (quality > 70 && civ) {
    civ.conditions.renaissance = Math.max(civ.conditions.renaissance ?? 0, 60);
    effects.push({ label: 'Cultural renaissance', after: '60 days (+5 satisfaction)' });
  }
  recordEvent(world, {
    category: 'culture',
    title: `${fullName(c)} unveils “${title}”`,
    description: quality > 70 ? 'Acclaimed as a masterpiece, it inspires a wave of creativity.' : quality > 45 ? 'It is well received by the public.' : 'It finds a small but devoted audience.',
    importance: quality > 70 ? 3 : 2,
    civIds: [c.civId],
    settlementId: c.settlementId,
    characterIds: [c.id],
    cause: `Months of creative work (artistry ${c.skills.art.toFixed(0)}).`,
    effects,
  });
}

function birth(world: World, rng: Rng, a: Character, b: Character): void {
  const civ = world.civs[a.civId];
  const s = world.settlements[a.settlementId];
  if (!civ || !s) return;
  const child = createCharacter(world, rng, civ, s, {
    age: 0,
    birthTime: world.time,
    familyName: rng.chance(0.5) ? a.familyName : b.familyName,
    occupation: 'student',
    parentIds: [a.id, b.id],
  });
  // Children inherit tendencies from parents.
  for (const k of Object.keys(child.personality) as (keyof Character['personality'])[]) {
    child.personality[k] = +clamp((a.personality[k] + b.personality[k]) / 2 + rng.normal(0, 0.15), 0, 1).toFixed(2);
  }
  for (const sk of SKILLS) child.skills[sk] = 0;
  child.goals = [];
  child.wealth = 0;
  child.health = 95;
  a.childIds.push(child.id);
  b.childIds.push(child.id);
  link(world, a, child, 'family', 80, world.time);
  link(world, b, child, 'family', 80, world.time);
  for (const p of [a, b]) {
    addMemory(p, { t: world.time, text: `Welcomed a child, ${child.givenName}.`, valence: 1, importance: 5, withId: child.id });
    const g = p.goals.find((x) => x.type === 'family');
    if (g) g.progress = 1;
  }
  recordEvent(world, {
    category: 'personal',
    title: `${child.givenName} ${child.familyName} is born`,
    description: `Born in ${s.name} to ${fullName(a)} and ${fullName(b)}.`,
    importance: civ.government.leaderId === a.id || civ.government.leaderId === b.id ? 3 : 1,
    civIds: [civ.id],
    settlementId: s.id,
    characterIds: [child.id, a.id, b.id],
    cause: `${a.givenName} and ${b.givenName} hoped to start a family.`,
  });
}

export function die(world: World, rng: Rng, c: Character, cause: string, causeIds: string[] = []): void {
  c.alive = false;
  c.deathTime = world.time;
  c.activity = { type: 'idle', startedAt: world.time, endsAt: world.time, description: 'Deceased' };
  const civ = world.civs[c.civId];
  const isLeader = civ?.government.leaderId === c.id;
  const age = ageOf(c, world.time);
  const ev = recordEvent(world, {
    category: 'population',
    title: `${fullName(c)} dies${isLeader ? ` — ${civ!.government.leaderTitle} of the ${civ!.name}` : ''}`,
    description: `${fullName(c)}, ${OCCUPATIONS[c.occupation].label.toLowerCase()} of ${world.settlements[c.settlementId]?.name ?? 'unknown'}, died at ${age} of ${cause}.`,
    importance: isLeader ? 4 : c.notable ? 2 : 1,
    civIds: [c.civId],
    settlementId: c.settlementId,
    characterIds: [c.id],
    cause: `Died of ${cause} at age ${age} (health ${c.health.toFixed(0)}).`,
    causeIds: causeIds.length ? causeIds : [cause === 'the plague' ? civ?.causeLinks.plague : cause.includes('famine') ? civ?.causeLinks.shortage_food : undefined].filter(Boolean) as string[],
  });
  for (const [id, r] of Object.entries(c.relationships)) {
    const o = world.characters[id];
    if (!o?.alive) continue;
    if (r.affinity > 25 || r.kind === 'family' || r.kind === 'partner') {
      addMemory(o, { t: world.time, text: `Mourned the death of ${fullName(c)}.`, valence: -0.9, importance: r.kind === 'partner' || r.kind === 'family' ? 5 : 3, eventId: ev.id, withId: c.id });
      o.mood = clamp(o.mood - 25, -100, 100);
    }
  }
  if (isLeader && civ) {
    succession(world, rng, civ, 'vacancy', [ev.id]);
  }
}

/**
 * Keep the tracked population of individuals near its target by recording
 * young adults who come of age in each settlement.
 */
export function replenishNotables(world: World, rng: Rng, civ: Civilization, target: number): void {
  const living = Object.values(world.characters).filter((c) => c.alive && c.civId === civ.id);
  if (living.length >= target) return;
  const sid = rng.pick(civ.settlementIds);
  const s = world.settlements[sid];
  if (!s) return;
  const c = createCharacter(world, rng, civ, s, { age: rng.int(18, 24) });
  addMemory(c, { t: world.time, text: `Came of age in ${s.name} and began an independent life.`, valence: 0.5, importance: 4 });
}
