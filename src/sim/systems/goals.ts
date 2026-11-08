import type { Rng } from '../rng';
import { OCCUPATIONS, WORKING_OCCUPATIONS } from '../data/society';
import { SKILLS, type Character, type Goal, type GoalType, type Skill, type World } from '../types';
import { fullName } from '../world';

const SKILL_LABEL: Record<Skill, string> = {
  science: 'the sciences',
  engineering: 'engineering',
  commerce: 'commerce',
  diplomacy: 'diplomacy',
  craft: 'craftsmanship',
  agriculture: 'agriculture',
  medicine: 'medicine',
  leadership: 'leadership',
  exploration: 'exploration',
  art: 'the arts',
};

export function skillLabel(s: Skill): string {
  return SKILL_LABEL[s];
}

/** Construct a goal suited to the character. Returns null if not applicable. */
export function makeGoal(world: World, rng: Rng, c: Character, type: GoalType): Goal | null {
  const base = { id: `${c.id}-g${world.nextId++}`, type, progress: 0, createdAt: world.time };
  switch (type) {
    case 'master_skill': {
      const main = OCCUPATIONS[c.occupation].skill;
      const sk = rng.chance(0.6) ? main : rng.pick(SKILLS);
      const target = Math.min(100, Math.max(c.skills[sk] + 15, 60));
      return { ...base, target: `${sk}:${target}`, description: `Master ${SKILL_LABEL[sk]} (reach ${target})` };
    }
    case 'change_occupation': {
      const options = WORKING_OCCUPATIONS.filter((o) => o !== c.occupation);
      const best = options.sort((a, b) => c.skills[OCCUPATIONS[b].skill] - c.skills[OCCUPATIONS[a].skill])[rng.int(0, 2)];
      return { ...base, target: best, description: `Become a ${OCCUPATIONS[best].label.toLowerCase()}` };
    }
    case 'make_friend':
      return { ...base, target: '1', description: 'Find a true friend' };
    case 'explore': {
      const s = world.settlements[c.settlementId];
      const planet = s ? world.planets[s.planetId] : undefined;
      const unexplored = planet?.regions.filter((r) => !r.explored) ?? [];
      if (unexplored.length) {
        const r = rng.pick(unexplored);
        return { ...base, target: String(r.index), description: `Journey into the uncharted ${r.name}` };
      }
      const others = Object.values(world.settlements).filter((x) => x.civId === c.civId && x.id !== c.settlementId);
      if (!others.length) return null;
      const t = rng.pick(others);
      return { ...base, target: `visit:${t.id}`, description: `Travel to ${t.name}` };
    }
    case 'wealth': {
      const target = Math.round(Math.max(300, c.wealth * 2));
      return { ...base, target: String(target), description: `Save ${target} credits` };
    }
    case 'lead':
      return { ...base, target: 'lead', description: 'Rise to a position of leadership' };
    case 'discover':
      return { ...base, target: 'discover', description: 'Make a discovery that changes the world' };
    case 'family': {
      return { ...base, target: 'family', description: 'Start a family' };
    }
    case 'create_work':
      return { ...base, target: 'work', description: 'Create a lasting work of art' };
  }
}

/** Score how strongly a goal pushes towards a given activity. */
export function goalActivityBias(goal: Goal): Partial<Record<string, number>> {
  switch (goal.type) {
    case 'master_skill':
      return { study: 0.5, work: 0.2 };
    case 'change_occupation':
      return { study: 0.45 };
    case 'make_friend':
      return { socialize: 0.5 };
    case 'explore':
      return { explore: 0.6, travel: 0.3 };
    case 'wealth':
      return { work: 0.45 };
    case 'lead':
      return { socialize: 0.25, work: 0.2, govern: 0.3 };
    case 'discover':
      return { study: 0.3, work: 0.3, explore: 0.15 };
    case 'family':
      return { socialize: 0.35 };
    case 'create_work':
      return { create: 0.6 };
  }
}

export function describeGoalTarget(world: World, g: Goal): string {
  if (g.type === 'make_friend' || g.type === 'family') return g.description;
  if (g.target.startsWith('visit:')) return world.settlements[g.target.slice(6)]?.name ?? g.description;
  const ch = world.characters[g.target];
  return ch ? fullName(ch) : g.description;
}
