/**
 * Threshold crossings as first-class (low-importance) history.
 *
 * When a continuous quantity crosses a meaningful line — satisfaction falls
 * into discontent, the treasury slips into deficit, granaries run low — the
 * crossing is recorded as its own event, citing the recent events that pushed
 * it there. Later events (unrest, policy changes, famine, expansion) cite the
 * crossing, which keeps causal chains continuous instead of jumping straight
 * from "state" to "consequence".
 */
import type { Civilization, World } from '../types';
import { causeKey, gatherCauses, noteCause, recordEvent } from '../world';
import { MINUTES_PER_YEAR } from '../time';

interface Crossing {
  key: string;
  enter: boolean;
  exit: boolean;
  enterTitle: string;
  exitTitle: string;
  enterText: string;
  exitText: string;
  enterCauses: string[];
  exitCauses: string[];
}

const ck = (civ: Civilization, types: string[]) => types.map((t) => causeKey.civ(civ.id, t));

function apply(world: World, civ: Civilization, c: Crossing): void {
  const flag = `th_${c.key}`;
  const active = !!civ.conditions[flag];
  if (!active && c.enter) {
    civ.conditions[flag] = 1;
    const causes = gatherCauses(world, ck(civ, c.enterCauses), 4, 2 * MINUTES_PER_YEAR);
    const ev = recordEvent(world, {
      category: 'economy',
      title: c.enterTitle,
      description: c.enterText,
      importance: 1,
      civIds: [civ.id],
      cause: causes.length ? 'Pushed over the threshold by recent developments.' : 'Gradual drift in underlying conditions.',
      causeIds: causes.length ? causes : gatherCauses(world, ck(civ, ['leader', 'policy', 'founding']), 1),
      trigger: { kind: 'threshold', text: c.enterText },
    });
    noteCause(world, causeKey.civ(civ.id, flag), ev.id);
  } else if (active && c.exit) {
    delete civ.conditions[flag];
    const causes = gatherCauses(world, ck(civ, [...c.exitCauses, flag]), 4);
    const ev = recordEvent(world, {
      category: 'economy',
      title: c.exitTitle,
      description: c.exitText,
      importance: 1,
      civIds: [civ.id],
      cause: 'Conditions moved back across the threshold.',
      causeIds: causes,
      trigger: { kind: 'threshold', text: c.exitText },
    });
    noteCause(world, causeKey.civ(civ.id, `${flag}_end`), ev.id);
  }
}

const NEGATIVE = ['shortage_food', 'shortage_goods', 'shortage_energy', 'plague', 'disaster', 'tax_up', 'policy_austerity', 'policy_martial_order', 'policy_industrial_drive', 'unrest_tech', 'leader', 'th_deficit', 'th_housing'];
const POSITIVE = ['shortage_end', 'golden_age', 'festival', 'renaissance', 'policy_welfare', 'policy_cultural_festivals', 'policy_public_works', 'tax_down', 'trade', 'leader'];

/** Daily: check every threshold for one civilisation. */
export function thresholdTick(world: World, civ: Civilization): void {
  const e = civ.economy;
  const popM = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.population ?? 0), 0) / 1e6;
  const foodDays = e.stockpile.food / Math.max(1e-6, e.consumption.food);
  const cap = civ.settlementIds.reduce((a, id) => a + (world.settlements[id]?.capacity ?? 0), 0);
  const pressure = (popM * 1e6) / Math.max(1, cap);
  const n = civ.name;
  apply(world, civ, {
    key: 'discontent',
    enter: civ.satisfaction < 42,
    exit: civ.satisfaction > 52,
    enterTitle: `Discontent grows in the ${n}`,
    exitTitle: `Public mood recovers in the ${n}`,
    enterText: `Satisfaction fell below 42 (now ${civ.satisfaction.toFixed(0)}).`,
    exitText: `Satisfaction rose back above 52 (now ${civ.satisfaction.toFixed(0)}).`,
    enterCauses: NEGATIVE,
    exitCauses: POSITIVE,
  });
  apply(world, civ, {
    key: 'instability',
    enter: civ.stability < 38,
    exit: civ.stability > 48,
    enterTitle: `Stability falters in the ${n}`,
    exitTitle: `Order returns to the ${n}`,
    enterText: `Stability fell below 38 (now ${civ.stability.toFixed(0)}).`,
    exitText: `Stability recovered above 48 (now ${civ.stability.toFixed(0)}).`,
    enterCauses: ['th_discontent', 'revolution', 'disaster', 'leader', ...NEGATIVE],
    exitCauses: ['th_discontent_end', 'policy_martial_order', ...POSITIVE],
  });
  apply(world, civ, {
    key: 'deficit',
    enter: e.treasury < 0,
    exit: e.treasury > popM * 50,
    enterTitle: `The ${n} treasury falls into deficit`,
    exitTitle: `The ${n} balances its books`,
    enterText: `Spending outpaced revenue; the treasury stands at ${Math.round(e.treasury)}.`,
    exitText: `The treasury recovered to ${Math.round(e.treasury)}.`,
    enterCauses: ['policy', 'tax_down', 'expansion', 'shortage_goods', 'shortage_energy', 'disaster'],
    exitCauses: ['tax_up', 'policy_austerity', 'trade'],
  });
  apply(world, civ, {
    key: 'surplus',
    enter: e.treasury > popM * 900,
    exit: e.treasury < popM * 400,
    enterTitle: `The ${n} treasury overflows`,
    exitTitle: `The ${n} surplus is spent`,
    enterText: `Revenue far exceeds spending (treasury ${Math.round(e.treasury)}).`,
    exitText: `The surplus has been drawn down (treasury ${Math.round(e.treasury)}).`,
    enterCauses: ['tax_up', 'policy_austerity', 'trade', 'golden_age', 'tech', 'th_deficit_end'],
    exitCauses: ['tax_down', 'policy', 'expansion'],
  });
  apply(world, civ, {
    key: 'granaries',
    enter: foodDays < 15 && e.production.food < e.consumption.food,
    exit: foodDays > 30,
    enterTitle: `Granaries run low in the ${n}`,
    exitTitle: `Granaries refill in the ${n}`,
    enterText: `Food reserves cover only ${foodDays.toFixed(0)} days and output trails consumption.`,
    exitText: `Food reserves cover ${foodDays.toFixed(0)} days again.`,
    enterCauses: ['disturbance', 'climate', 'th_housing', 'growth', 'migration', 'retool', 'plague'],
    exitCauses: ['disturbance_end', 'policy_agrarian_subsidies', 'retool', 'trade', 'tech'],
  });
  apply(world, civ, {
    key: 'housing',
    enter: pressure > 0.9,
    exit: pressure < 0.8,
    enterTitle: `Housing strain in the ${n}`,
    exitTitle: `Housing pressure eases in the ${n}`,
    enterText: `Population reached ${(pressure * 100).toFixed(0)}% of housing capacity.`,
    exitText: `Population is down to ${(pressure * 100).toFixed(0)}% of housing capacity.`,
    enterCauses: ['growth', 'golden_age', 'migration', 'disaster', 'tech'],
    exitCauses: ['expansion', 'plague', 'tech', 'policy_public_works'],
  });
}
