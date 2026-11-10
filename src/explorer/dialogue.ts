/**
 * Conversation generation for Explorer.
 *
 * Two stages:
 *  1. `buildDialogueContext` gathers a structured, serialisable snapshot of
 *     what this character knows: needs, mood, activity, ranked memories, goals,
 *     relationships, and recent events in their civilisation together with the
 *     causes the causal history records for them.
 *  2. A `DialogueProvider` turns (context, topic) into text. The built-in
 *     provider is transparent template text — not a language model — but every
 *     sentence comes from the context. A different provider (for example a
 *     local LLM) can be installed with `setDialogueProvider` without touching
 *     the simulation or the UI; the context is plain JSON so it can be sent
 *     as a prompt as-is.
 */
import { OCCUPATIONS, POLICIES } from '../sim/data/society';
import { Rng } from '../sim/rng';
import { DAYS_PER_YEAR, MINUTES_PER_DAY, formatDate } from '../sim/time';
import type { Character, World } from '../sim/types';
import { addMemory, ageOf, findEvent, fullName } from '../sim/world';

export type Topic = 'greet' | 'activity' | 'self' | 'memories' | 'leader' | 'news' | 'why' | 'people' | 'goals' | 'bye';

export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'activity', label: 'What are you doing?' },
  { id: 'self', label: 'Tell me about yourself.' },
  { id: 'memories', label: 'What do you remember most?' },
  { id: 'goals', label: 'What do you hope for?' },
  { id: 'people', label: 'Who matters to you?' },
  { id: 'leader', label: 'How are things in the realm?' },
  { id: 'news', label: 'Any news?' },
  { id: 'why', label: 'Why are things the way they are?' },
  { id: 'bye', label: 'Farewell.' },
];

// ───────────────────────────── context ─────────────────────────────

export interface ContextEvent {
  id: string;
  title: string;
  daysAgo: number;
  importance: number;
  category: string;
  /** Titles of the direct causes recorded for this event (most relevant first). */
  causes: string[];
  /** One step further back: a cause of the first cause, if known. */
  rootCause?: string;
  /** True when the chain leads back to an intervention by the creator. */
  creatorOrigin: boolean;
  /** True when the speaker appears in the event. */
  involvesSpeaker: boolean;
}

export interface DialogueContext {
  date: string;
  speaker: {
    id: string;
    name: string;
    givenName: string;
    age: number;
    occupation: string;
    occupationYears: number;
    personality: Character['personality'];
    mood: number;
    lowestNeed: { need: string; value: number };
    bestSkill: string;
    interests: string[];
    activity: { type: string; description: string; reason: string };
    isLeader: boolean;
  };
  place: {
    settlement: string;
    civ: string;
    leaderTitle: string;
    leaderName?: string;
    opinionOfLeader: number;
    satisfaction: number;
    stability: number;
    policies: string[];
    conditions: string[];
    taxRate: number;
  };
  memories: { text: string; daysAgo: number; valence: number; importance: number; eventId?: string }[];
  goals: { description: string; progress: number }[];
  relationships: { name: string; givenName: string; kind: string; affinity: number; alive: boolean }[];
  children: number;
  civEvents: ContextEvent[];
}

const CONDITION_NAMES: Record<string, string> = {
  shortage_food: 'the food shortages',
  shortage_energy: 'the energy shortages',
  shortage_goods: 'the empty market stalls',
  plague: 'the plague',
  crisis: 'the crisis',
  prosperity: 'how prosperous things have become',
  golden_age: 'this golden age',
  renaissance: 'the renaissance',
  festival: 'the festival',
};

export function buildDialogueContext(world: World, c: Character): DialogueContext {
  const civ = world.civs[c.civId];
  const s = world.settlements[c.settlementId];
  const leader = civ?.government.leaderId ? world.characters[civ.government.leaderId] : undefined;
  const needs = Object.entries(c.needs) as [string, number][];
  const [need, value] = needs.reduce((a, b) => (b[1] < a[1] ? b : a));
  const top = Object.entries(c.skills).sort((a, b) => b[1] - a[1])[0];
  const days = (t: number) => Math.max(0, Math.round((world.time - t) / MINUTES_PER_DAY));

  // memories: importance weighted by recency and emotional weight
  const memories = c.memories
    .map((m) => ({ m, score: m.importance * (1 + Math.abs(m.valence)) / (1 + days(m.t) / DAYS_PER_YEAR) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ m }) => ({ text: m.text, daysAgo: days(m.t), valence: m.valence, importance: m.importance, eventId: m.eventId }));

  const relationships = Object.entries(c.relationships)
    .map(([id, r]) => ({ o: world.characters[id], r }))
    .filter((x) => x.o)
    .sort((a, b) => Math.abs(b.r.affinity) - Math.abs(a.r.affinity))
    .slice(0, 6)
    .map(({ o, r }) => ({ name: fullName(o), givenName: o.givenName, kind: r.kind, affinity: Math.round(r.affinity), alive: o.alive }));

  // recent events in the speaker's civilisation, with their recorded causes
  const civEvents: ContextEvent[] = [];
  const horizon = world.time - DAYS_PER_YEAR * MINUTES_PER_DAY;
  for (let i = world.events.length - 1; i >= 0 && civEvents.length < 4; i--) {
    const e = world.events[i];
    if (e.t < horizon) break;
    if (e.importance < 2 || e.category === 'summary') continue;
    const mine = e.characterIds.includes(c.id);
    if (!(mine || (e.civIds.includes(c.civId) && e.importance >= 3) || e.importance >= 4)) continue;
    const causes = e.causeIds
      .map((id) => findEvent(world, id))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.importance - a.importance);
    const first = causes[0];
    const second = first?.causeIds.map((id) => findEvent(world, id)).find((x) => x);
    civEvents.push({
      id: e.id,
      title: e.title,
      daysAgo: days(e.t),
      importance: e.importance,
      category: e.category,
      causes: causes.slice(0, 2).map((x) => x.title),
      rootCause: second?.title,
      creatorOrigin: e.rootSource === 'creator',
      involvesSpeaker: mine,
    });
  }

  return {
    date: formatDate(world.time, world.epochYear),
    speaker: {
      id: c.id,
      name: fullName(c),
      givenName: c.givenName,
      age: ageOf(c, world.time),
      occupation: OCCUPATIONS[c.occupation].label.toLowerCase(),
      occupationYears: Math.max(1, Math.round((world.time - c.occupationSince) / (DAYS_PER_YEAR * MINUTES_PER_DAY))),
      personality: c.personality,
      mood: c.mood,
      lowestNeed: { need, value },
      bestSkill: top?.[0] ?? 'getting by',
      interests: c.interests.slice(0, 3),
      activity: { type: c.activity.type, description: c.activity.description, reason: c.activity.reason ? c.activity.reason.split(' (')[0] : '' },
      isLeader: leader?.id === c.id,
    },
    place: {
      settlement: s?.name ?? 'town',
      civ: civ?.name ?? '',
      leaderTitle: civ?.government.leaderTitle ?? 'leader',
      leaderName: leader?.givenName,
      opinionOfLeader: leader ? Math.round(c.relationships[leader.id]?.affinity ?? 0) : 0,
      satisfaction: Math.round(civ?.satisfaction ?? 50),
      stability: Math.round(civ?.stability ?? 50),
      policies: (civ?.government.policies ?? []).map((x) => POLICIES[x].name),
      conditions: Object.keys(civ?.conditions ?? {}).filter((k) => civ.conditions[k as keyof typeof civ.conditions]),
      taxRate: civ?.economy.taxRate ?? 0,
    },
    memories,
    goals: c.goals.map((g) => ({ description: g.description, progress: g.progress })),
    relationships,
    children: c.childIds.length,
    civEvents,
  };
}

// ───────────────────────────── providers ─────────────────────────────

export interface DialogueProvider {
  id: string;
  /** Must be synchronous and deterministic for the same context, topic and seed. */
  respond(ctx: DialogueContext, topic: Topic, seed: number): string;
}

const NEED_LINES: Record<string, string> = {
  energy: "I'm exhausted — I could use some sleep.",
  hunger: "I'm starving; I haven't eaten properly.",
  social: "It's been lonely lately.",
  purpose: "I feel like I'm drifting without purpose.",
  fun: "I need something to lift my spirits.",
  security: 'Money worries keep me up at night.',
};

function moodWord(mood: number): string {
  if (mood > 50) return 'wonderful';
  if (mood > 20) return 'well';
  if (mood > -10) return 'all right';
  if (mood > -40) return 'not great, honestly';
  return 'terrible';
}

function ago(days: number): string {
  if (days < 2) return 'Just yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return 'A few weeks ago';
  if (days < DAYS_PER_YEAR) return `${Math.round(days / 30)} months ago`;
  const y = Math.round(days / DAYS_PER_YEAR);
  return y === 1 ? 'A year ago' : `${y} years ago`;
}

const IRREGULAR = new Set(['Met', 'Fell', 'Came', 'Felt', 'Set', 'Led', 'Heard', 'Was', 'Held', 'Left', 'Became', 'Re-elected', 'Lived', 'Worked']);
/** Memories are stored as first-person predicates ("Travelled to Vel."): give them a subject. */
function firstPerson(text: string): string {
  const w = text.split(' ')[0];
  const verb = IRREGULAR.has(w) || /^[A-Z][a-z-]+ed$/.test(w);
  const t = verb ? `I ${text[0].toLowerCase()}${text.slice(1)}` : text;
  return t.endsWith('.') ? t : `${t}.`;
}

function lc(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Lower-case only a leading article: titles and memories start with names or "I". */
function mid(s: string): string {
  return /^(The|A|An) /.test(s) ? lc(s) : s;
}

export const templateProvider: DialogueProvider = {
  id: 'template',
  respond(ctx, topic, seed) {
    const rng = new Rng(seed);
    const { speaker: sp, place } = ctx;
    const p = sp.personality;
    const warm = p.agreeableness > 0.55;
    const talkative = p.extraversion > 0.55;
    switch (topic) {
      case 'greet': {
        const open = warm ? rng.pick(['Well met, traveller!', 'Oh, hello there!', 'Greetings, friend.']) : rng.pick(['Yes?', 'Hm. Hello.', 'Can I help you?']);
        const feel = `I'm ${moodWord(sp.mood)}.`;
        const extra = sp.lowestNeed.value < 30 ? ` ${NEED_LINES[sp.lowestNeed.need]}` : talkative ? ` Lovely day in ${place.settlement}, isn't it?` : '';
        return `${open} I'm ${sp.givenName}. ${feel}${extra}`;
      }
      case 'activity': {
        const a = sp.activity;
        return `${a.description}. ${a.reason ? `If you must know why: ${a.reason}.` : ''} ${a.type === 'work' ? `I've been a ${sp.occupation} for ${sp.occupationYears} years.` : ''}`.replace(/\s+/g, ' ').trim();
      }
      case 'self': {
        const interests = sp.interests.length ? `I love ${sp.interests.slice(0, 2).join(' and ')}.` : '';
        const formative = ctx.memories.find((m) => m.importance >= 3);
        const temper = p.neuroticism > 0.65 ? 'I worry more than I should.' : p.openness > 0.65 ? "I'm always curious about what lies beyond." : p.conscientiousness > 0.65 ? 'I like things done properly.' : '';
        return `I'm ${sp.age}, a ${sp.occupation} here in ${place.settlement}. People say I'm best at ${sp.bestSkill}. ${interests} ${formative ? `${firstPerson(formative.text)}` : ''} ${temper}`.replace(/\s+/g, ' ').trim();
      }
      case 'memories': {
        if (!ctx.memories.length) return "Not much has happened to me worth telling, I'm afraid.";
        const [a, b] = ctx.memories;
        const feel = (v: number) => (v > 0.4 ? 'I still smile about it.' : v < -0.4 ? 'It still hurts.' : '');
        const first = `${ago(a.daysAgo)}, ${mid(firstPerson(a.text))} ${feel(a.valence)}`;
        const second = b ? ` And ${ago(b.daysAgo).toLowerCase()}: ${mid(firstPerson(b.text))}` : '';
        return `${first}${second}`.replace(/\s+/g, ' ').trim();
      }
      case 'goals': {
        if (!ctx.goals.length) return "Honestly? I'm content as I am.";
        const g = ctx.goals[0];
        const progress = g.progress > 0.6 ? "I'm getting close." : g.progress > 0.25 ? "I'm making progress." : "It's a long road.";
        const spark = ctx.memories.find((m) => /resolved to|new aim/i.test(m.text));
        return `I want to ${lc(g.description)}. ${progress}${spark ? ` ${ago(spark.daysAgo)} I made up my mind.` : ''}${ctx.goals[1] ? ` Someday I'd also like to ${lc(ctx.goals[1].description)}.` : ''}`;
      }
      case 'people': {
        const rels = ctx.relationships;
        if (!rels.length) return "I don't really know anyone well yet.";
        const parts: string[] = [];
        const partner = rels.find((x) => x.kind === 'partner');
        if (partner) parts.push(`${partner.givenName} is my partner${partner.alive ? '' : ' — I still miss them'}.`);
        const friend = rels.find((x) => (x.kind === 'close_friend' || x.kind === 'friend') && x.alive);
        if (friend) {
          const how = ctx.memories.find((m) => m.text.includes(friend.givenName));
          parts.push(`${friend.name} is a ${friend.kind === 'close_friend' ? 'dear' : 'good'} friend${how ? ` — ${mid(firstPerson(how.text)).replace(/\.$/, '')}, ${ago(how.daysAgo).toLowerCase()}` : ''}.`);
        }
        const rival = rels.find((x) => x.kind === 'rival');
        if (rival) parts.push(`And ${rival.givenName}… let's just say we don't get along.`);
        if (ctx.children) parts.push(`I have ${ctx.children} ${ctx.children === 1 ? 'child' : 'children'}.`);
        return parts.join(' ') || `I'm on good terms with ${rels[0].givenName}.`;
      }
      case 'leader': {
        if (sp.isLeader) return `As ${place.leaderTitle}, I carry the weight of ${place.stability} percent stability on my shoulders. ${place.policies.length ? `My government pursues ${place.policies.join(', ')}.` : ''}`.trim();
        const op = place.opinionOfLeader;
        const verdict = place.satisfaction > 65 ? 'Times are good.' : place.satisfaction > 45 ? 'We get by.' : 'People are angry, and with reason.';
        const issues = place.conditions.map((k) => CONDITION_NAMES[k]).filter(Boolean);
        if (place.taxRate > 0.3) issues.push('high taxes');
        const lv = place.leaderName ? `${place.leaderTitle} ${place.leaderName} ${op > 25 ? 'has my full support' : op < -25 ? 'is a disgrace' : p.agreeableness > 0.5 ? 'is doing their best' : 'could do better'}.` : 'We have no leader right now.';
        return `${verdict} ${lv}${issues.length ? ` Everyone is talking about ${issues.join(' and ')}.` : ''}`;
      }
      case 'news': {
        const recent = ctx.civEvents.filter((e) => e.daysAgo <= 120).slice(0, 2);
        if (!recent.length) return `Nothing much since ${ctx.date.split(' ').slice(1).join(' ')}. Quiet times.`;
        return recent
          .map((e, i) => {
            const lead = e.involvesSpeaker ? 'You may have heard —' : i === 0 ? 'Have you heard?' : 'Also —';
            const why = e.causes[0] ? ` They say it came of ${mid(e.causes[0])}.` : '';
            return `${lead} ${e.title}.${why}`;
          })
          .join(' ');
      }
      case 'why': {
        const e = ctx.civEvents.find((x) => x.causes.length) ?? ctx.civEvents[0];
        if (!e) return `Things in ${place.settlement} have been settled for a long while. Nothing much to explain.`;
        if (!e.causes.length) return `${e.title} — ${ago(e.daysAgo).toLowerCase()}. Nobody can say what set it off.`;
        const chain = `${e.title}. That came of ${mid(e.causes[0])}${e.rootCause ? `, and that in turn of ${mid(e.rootCause)}` : ''}.`;
        const also = e.causes[1] ? ` ${e.causes[1]} played a part too.` : '';
        const myth = e.creatorOrigin ? (p.openness > 0.5 ? ' Some say the heavens themselves had a hand in it.' : ' The priests call it the will of the heavens.') : '';
        return `${ago(e.daysAgo)}: ${chain}${also}${myth}`;
      }
      case 'bye':
        return warm ? rng.pick(['Safe travels!', 'Come back anytime.', 'May the stars guide you.']) : rng.pick(['Right. Goodbye.', 'Mm.', 'Off you go, then.']);
    }
  },
};

let provider: DialogueProvider = templateProvider;

/** Install a different text generator (e.g. a local LLM bridge). */
export function setDialogueProvider(p: DialogueProvider | null): void {
  provider = p ?? templateProvider;
}

export function dialogueProviderId(): string {
  return provider.id;
}

export function respond(world: World, c: Character, topic: Topic, seed: number): string {
  return provider.respond(buildDialogueContext(world, c), topic, seed);
}

/** Record that the player met this character (a real state change). */
export function recordConversation(world: World, c: Character): void {
  const already = c.memories.some((m) => m.text.startsWith('Talked with a curious traveller') && world.time - m.t < MINUTES_PER_DAY);
  c.needs.social = Math.min(100, c.needs.social + 10);
  if (!already) {
    addMemory(c, { t: world.time, text: 'Talked with a curious traveller who seemed to know a great deal about the world.', valence: 0.3, importance: 2 });
    world.player.conversations += 1;
  }
}
