/**
 * Conversation generation for Explorer. Responses are assembled from the
 * character's actual simulation state (needs, mood, activity, goals,
 * relationships, memories, civilisation conditions). This is transparent,
 * template-based text — not a language model — but every sentence reflects
 * real data, and the architecture (topic → state → text) could be swapped for
 * an LLM-backed generator later.
 */
import { OCCUPATIONS, POLICIES } from '../sim/data/society';
import { Rng } from '../sim/rng';
import { MINUTES_PER_DAY, formatDate } from '../sim/time';
import type { Character, World } from '../sim/types';
import { addMemory, ageOf, fullName } from '../sim/world';

export type Topic = 'greet' | 'activity' | 'self' | 'leader' | 'news' | 'people' | 'goals' | 'bye';

export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'activity', label: 'What are you doing?' },
  { id: 'self', label: 'Tell me about yourself.' },
  { id: 'goals', label: 'What do you hope for?' },
  { id: 'people', label: 'Who matters to you?' },
  { id: 'leader', label: 'How are things in the realm?' },
  { id: 'news', label: 'Any news?' },
  { id: 'bye', label: 'Farewell.' },
];

function moodWord(c: Character): string {
  if (c.mood > 50) return 'wonderful';
  if (c.mood > 20) return 'well';
  if (c.mood > -10) return 'all right';
  if (c.mood > -40) return 'not great, honestly';
  return 'terrible';
}

function lowestNeed(c: Character): [string, number] {
  const entries = Object.entries(c.needs) as [string, number][];
  return entries.sort((a, b) => a[1] - b[1])[0];
}

const NEED_LINES: Record<string, string> = {
  energy: "I'm exhausted — I could use some sleep.",
  hunger: "I'm starving; I haven't eaten properly.",
  social: "It's been lonely lately.",
  purpose: "I feel like I'm drifting without purpose.",
  fun: "I need something to lift my spirits.",
  security: 'Money worries keep me up at night.',
};

export function respond(world: World, c: Character, topic: Topic, seed: number): string {
  const rng = new Rng(seed);
  const civ = world.civs[c.civId];
  const s = world.settlements[c.settlementId];
  const age = ageOf(c, world.time);
  const occ = OCCUPATIONS[c.occupation];
  const p = c.personality;
  const warm = p.agreeableness > 0.55;
  const talkative = p.extraversion > 0.55;
  switch (topic) {
    case 'greet': {
      const open = warm ? rng.pick(['Well met, traveller!', 'Oh, hello there!', 'Greetings, friend.']) : rng.pick(['Yes?', 'Hm. Hello.', 'Can I help you?']);
      const [need, v] = lowestNeed(c);
      const feel = `I'm ${moodWord(c)}.`;
      const extra = v < 30 ? ` ${NEED_LINES[need]}` : talkative ? ` Lovely day in ${s?.name ?? 'town'}, isn't it?` : '';
      return `${open} I'm ${c.givenName}. ${feel}${extra}`;
    }
    case 'activity': {
      const a = c.activity;
      const why = a.reason ? a.reason.split(' (')[0] : '';
      return `${a.description}. ${why ? `If you must know why: ${why}.` : ''} ${a.type === 'work' ? `I've been a ${occ.label.toLowerCase()} for ${Math.max(1, Math.round((world.time - c.occupationSince) / (360 * MINUTES_PER_DAY)))} years.` : ''}`.trim();
    }
    case 'self': {
      const top = Object.entries(c.skills).sort((a, b) => b[1] - a[1])[0];
      const interests = c.interests.length ? `I love ${c.interests.slice(0, 2).join(' and ')}.` : '';
      const birth = c.memories[0]?.text ?? '';
      return `I'm ${age}, a ${occ.label.toLowerCase()} here in ${s?.name}. ${birth} People say I'm best at ${top[0]}. ${interests} ${p.neuroticism > 0.65 ? 'I worry more than I should.' : p.openness > 0.65 ? "I'm always curious about what lies beyond." : ''}`.replace(/\s+/g, ' ').trim();
    }
    case 'goals': {
      if (!c.goals.length) return "Honestly? I'm content as I am.";
      const g = c.goals[0];
      const progress = g.progress > 0.6 ? "I'm getting close." : g.progress > 0.25 ? "I'm making progress." : "It's a long road.";
      return `I want to ${g.description.toLowerCase()}. ${progress}${c.goals[1] ? ` Someday I'd also like to ${c.goals[1].description.toLowerCase()}.` : ''}`;
    }
    case 'people': {
      const rels = Object.entries(c.relationships)
        .map(([id, r]) => ({ c: world.characters[id], r }))
        .filter((x) => x.c)
        .sort((a, b) => Math.abs(b.r.affinity) - Math.abs(a.r.affinity));
      if (!rels.length) return "I don't really know anyone well yet.";
      const parts: string[] = [];
      const partner = rels.find((x) => x.r.kind === 'partner');
      if (partner) parts.push(`${partner.c.givenName} is my partner${partner.c.alive ? '' : ' — I still miss them'}.`);
      const friend = rels.find((x) => (x.r.kind === 'close_friend' || x.r.kind === 'friend') && x.c.alive);
      if (friend) parts.push(`${fullName(friend.c)} is a ${friend.r.kind === 'close_friend' ? 'dear' : 'good'} friend.`);
      const rival = rels.find((x) => x.r.kind === 'rival');
      if (rival) parts.push(`And ${rival.c.givenName}… let's just say we don't get along.`);
      if (c.childIds.length) parts.push(`I have ${c.childIds.length} ${c.childIds.length === 1 ? 'child' : 'children'}.`);
      return parts.join(' ') || `I'm on good terms with ${rels[0].c.givenName}.`;
    }
    case 'leader': {
      const leader = civ.government.leaderId ? world.characters[civ.government.leaderId] : undefined;
      if (leader?.id === c.id) return `As ${civ.government.leaderTitle}, I carry the weight of ${Math.round(civ.stability)} percent stability on my shoulders. ${civ.government.policies.length ? `My government pursues ${civ.government.policies.map((x) => POLICIES[x].name).join(', ')}.` : ''}`;
      const op = leader ? c.relationships[leader.id]?.affinity ?? 0 : 0;
      const verdict = civ.satisfaction > 65 ? 'Times are good.' : civ.satisfaction > 45 ? 'We get by.' : 'People are angry, and with reason.';
      const issues: string[] = [];
      if (civ.conditions.shortage_food) issues.push('the food shortages');
      if (civ.conditions.plague) issues.push('the plague');
      if (civ.economy.taxRate > 0.3) issues.push('high taxes');
      if (civ.conditions.golden_age) issues.push('this golden age we are living through');
      const lv = leader ? `${civ.government.leaderTitle} ${leader.givenName} ${op > 25 ? 'has my full support' : op < -25 ? 'is a disgrace' : p.agreeableness > 0.5 ? 'is doing their best' : 'could do better'}.` : 'We have no leader right now.';
      return `${verdict} ${lv}${issues.length ? ` Everyone is talking about ${issues.join(' and ')}.` : ''}`;
    }
    case 'news': {
      const recent = [...world.events]
        .reverse()
        .filter((e) => e.importance >= 3 && (e.civIds.includes(c.civId) || e.importance >= 4) && world.time - e.t < 120 * MINUTES_PER_DAY)
        .slice(0, 2);
      if (!recent.length) return `Nothing much since ${formatDate(world.time - 30 * MINUTES_PER_DAY, world.epochYear)}. Quiet times.`;
      return recent.map((e, i) => `${i === 0 ? 'Have you heard?' : 'Also —'} ${e.title}.`).join(' ');
    }
    case 'bye':
      return warm ? rng.pick(['Safe travels!', 'Come back anytime.', 'May the stars guide you.']) : rng.pick(['Right. Goodbye.', 'Mm.', 'Off you go, then.']);
  }
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
