import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/engine';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { buildDialogueContext, dialogueProviderId, respond, setDialogueProvider, type DialogueContext } from '../src/explorer/dialogue';
import { applyIntervention } from '../src/sim/interventions';
import { freshWorld } from './helpers';

describe('dialogue', () => {
  const w = freshWorld('dialogue-seed');
  advance(w, 240 * MINUTES_PER_DAY);
  const civ = Object.values(w.civs)[0];
  applyIntervention(w, 'historicalIntervention', [civ.id, 'plague']);
  advance(w, 20 * MINUTES_PER_DAY);
  const people = Object.values(w.characters).filter((c) => c.alive && c.civId === civ.id);

  it('builds a JSON-serialisable context from memories, goals, relationships and civ history', () => {
    const c = people.find((x) => x.memories.length >= 3 && Object.keys(x.relationships).length)!;
    const ctx = buildDialogueContext(w, c);
    expect(JSON.parse(JSON.stringify(ctx))).toEqual(ctx);
    expect(ctx.memories.length).toBeGreaterThan(0);
    expect(ctx.memories.length).toBeLessThanOrEqual(5);
    expect(ctx.relationships.length).toBeGreaterThan(0);
    expect(ctx.civEvents.length).toBeGreaterThan(0);
    // causes come from the causal history
    const withCause = ctx.civEvents.find((e) => e.causes.length);
    expect(withCause).toBeTruthy();
    const ev = w.events.find((e) => e.id === withCause!.id)!;
    const causeTitles = ev.causeIds.map((id) => w.events.find((x) => x.id === id)?.title);
    expect(causeTitles).toContain(withCause!.causes[0]);
  });

  it('explains recent events through their recorded causes', () => {
    const c = people[0];
    const ctx = buildDialogueContext(w, c);
    const target = ctx.civEvents.find((x) => x.causes.length)!;
    const why = respond(w, c, 'why', 3);
    expect(why).toContain(target.title);
    expect(why.toLowerCase()).toContain(target.causes[0].toLowerCase());
    // the plague was a creator intervention: the chain is marked as such
    const plague = ctx.civEvents.find((e) => /plague/i.test(e.title));
    expect(plague).toBeTruthy();
    expect(plague!.creatorOrigin).toBe(true);
  });

  it('recalls the most significant memory', () => {
    const c = people.find((x) => x.memories.length >= 3)!;
    const ctx = buildDialogueContext(w, c);
    const text = respond(w, c, 'memories', 1);
    const core = ctx.memories[0].text.replace(/\.$/, '').split(' ').slice(1).join(' ');
    expect(text).toContain(core);
  });

  it('is deterministic and accepts a different provider', () => {
    const c = people[1];
    expect(respond(w, c, 'news', 9)).toBe(respond(w, c, 'news', 9));
    let seen: DialogueContext | null = null;
    setDialogueProvider({
      id: 'echo',
      respond: (ctx, topic) => {
        seen = ctx;
        return `${topic}:${ctx.speaker.givenName}`;
      },
    });
    expect(dialogueProviderId()).toBe('echo');
    expect(respond(w, c, 'greet', 1)).toBe(`greet:${c.givenName}`);
    expect(seen!.speaker.id).toBe(c.id);
    setDialogueProvider(null);
    expect(dialogueProviderId()).toBe('template');
  });
});
