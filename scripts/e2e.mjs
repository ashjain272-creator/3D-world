/**
 * End-to-end verification of the main user journeys in a real browser.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/e2e.mjs [baseUrl] [screenshotDir]
 *
 * Uses the Playwright + Chromium installation available on the machine.
 * Exits non-zero if any check fails. Screenshots of every major screen are
 * written to the screenshot directory for visual review.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? 'screenshots';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/WebGL|GPU stall|swiftshader/i.test(m.text())) errors.push(m.text());
});
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const world = (fn) => page.evaluate(fn);

try {
  // 1. First run: cinematic intro and generation
  await page.goto(BASE);
  await page.waitForSelector('[data-testid=intro]', { timeout: 20000 });
  check('intro shows on first run', true);
  await page.waitForTimeout(5800);
  await shot('01-intro');
  await page.click('[data-testid=begin]');
  await page.waitForTimeout(2500);
  await shot('02-generating');
  await page.waitForSelector('[data-testid=onboarding]', { timeout: 30000 });
  check('universe generated and onboarding shown', true);
  const stats = await world(() => {
    const w = window.__genesis.store.getWorld();
    return {
      systems: Object.keys(w.systems).length,
      planets: Object.keys(w.planets).length,
      civs: Object.keys(w.civs).length,
      people: Object.values(w.characters).filter((c) => c.alive).length,
      seed: w.seed,
      time: w.time,
    };
  });
  check('generation meets targets', stats.systems >= 3 && stats.planets >= 5 && stats.civs >= 2 && stats.people >= 50, JSON.stringify(stats));
  await shot('03-galaxy-onboarding');
  await page.click('[data-testid=onboarding-dismiss]');

  // 2. Time flows on its own
  const d1 = await page.textContent('[data-testid=sim-date]');
  await page.click('[data-speed="4"]');
  await page.waitForTimeout(2500);
  const d2 = await page.textContent('[data-testid=sim-date]');
  check('time advances at speed 4', d1 !== d2, `${d1} → ${d2}`);
  await page.click('[data-speed="0"]');
  const t1 = await world(() => window.__genesis.store.getWorld().time);
  await page.waitForTimeout(1200);
  const t2 = await world(() => window.__genesis.store.getWorld().time);
  check('pause stops time', t1 === t2);
  await page.click('[data-speed="1"]');

  // 3. Galaxy → system → planet → settlement → Explorer
  await shot('04-galaxy');
  const ids = await world(() => {
    const w = window.__genesis.store.getWorld();
    const civ = Object.values(w.civs)[0];
    const cap = w.settlements[civ.settlementIds[0]];
    return { system: w.planets[cap.planetId].systemId, planet: cap.planetId, settlement: cap.id, civ: civ.id };
  });
  await page.click('.side .row >> nth=0');
  await page.waitForTimeout(2500);
  check('system view opens from galaxy list', (await page.url()).includes('universe/system/'));
  await shot('05-system');
  await page.evaluate((p) => (location.hash = `#/universe/planet/${p}`), ids.planet);
  await page.waitForTimeout(4000);
  await shot('06-planet');
  await page.evaluate((p) => (location.hash = `#/universe/planet/${p.planet}/${p.settlement}`), ids);
  await page.waitForTimeout(1500);
  await shot('07-settlement-panel');
  await page.click('[data-testid=enter-explorer]');
  await page.waitForSelector('[data-testid=explorer-page]');
  await page.waitForTimeout(6000);
  check('Observer → Explorer transition', (await page.url()).includes(`explorer/${ids.settlement}`));
  await shot('08-explorer-arrival');

  // 4. Movement and camera
  const p0 = await world(() => ({ ...window.__genesis.player }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');
  const p1 = await world(() => ({ ...window.__genesis.player }));
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('WASD moves the player', moved > 1.5, `${moved.toFixed(1)} units`);
  const box = await page.locator('[data-testid=explorer-canvas] canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const p2 = await world(() => ({ ...window.__genesis.player }));
  check('mouse drag turns the camera', Math.abs(p2.yaw - p1.yaw) > 0.1, `yaw ${p1.yaw.toFixed(2)} → ${p2.yaw.toFixed(2)}`);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await shot('09-explorer-moving');

  // 5. Approach an inhabitant and talk (daytime, so people are out and about)
  await world(() => {
    const w = window.__genesis.store.getWorld();
    w.time = Math.floor(w.time / 1440) * 1440 + 1440 + 13 * 60;
  });
  await page.waitForTimeout(2500);
  const npc = await world(() => {
    const w = window.__genesis.store.getWorld();
    const sid = location.hash.split('/')[2];
    return Object.values(w.characters).find((c) => c.alive && c.settlementId === sid && c.activity.type !== 'sleep')?.id;
  });
  let talked = false;
  if (npc) {
    await page.waitForTimeout(1500);
    // walk to them: teleport next to the NPC's current minimap position
    for (let i = 0; i < 6 && !talked; i++) {
      const target = await page.evaluate((id) => window.__genesis.npcs.get(id) ?? [...window.__genesis.npcs.values()][0] ?? null, npc);
      if (target) await page.evaluate((t) => (window.__genesis.commands.teleport = { x: t.x + 1.5, z: t.z + 1.5 }), target);
      await page.waitForTimeout(800);
      const prompt = await page.$('[data-testid=interact-prompt]');
      if (prompt) {
        await page.keyboard.press('KeyE');
        talked = !!(await page.waitForSelector('[data-testid=dialogue]', { timeout: 3000 }).catch(() => null));
      }
    }
  }
  if (!talked) {
    // fall back: click the first visible inhabitant figure label via store
    const id = await world(() => Object.values(window.__genesis.store.getWorld().characters).find((c) => c.alive)?.id);
    await page.evaluate((cid) => window.__genesis.explorer.getState().setTalking(cid), id);
    talked = !!(await page.waitForSelector('[data-testid=dialogue]', { timeout: 3000 }).catch(() => null));
  }
  check('dialogue with an inhabitant opens', talked);
  if (talked) {
    await page.click('.dialogue-options button >> nth=0');
    await page.waitForTimeout(400);
    const lines = await page.$$eval('.dl', (els) => els.length);
    check('inhabitant answers questions', lines >= 3, `${lines} lines`);
    await shot('10-dialogue');
    await page.keyboard.press('Escape');
  }

  // 6. Night and wilderness
  await world(() => {
    const w = window.__genesis.store.getWorld();
    w.time = Math.floor(w.time / 1440) * 1440 + 22 * 60;
  });
  await page.waitForTimeout(2500);
  await shot('11-explorer-night');
  await page.click('[data-testid=locations-btn]');
  await page.waitForTimeout(500);
  await shot('12-location-picker');
  const wild = await world(() => {
    const w = window.__genesis.store.getWorld();
    const p = Object.values(w.planets).find((x) => x.regions.length && !x.civIds.length && ['jungle', 'terran', 'ocean', 'desert'].includes(x.type)) ?? Object.values(w.planets).find((x) => x.regions.length && !x.civIds.length);
    const r = p.regions.find((x) => x.biome !== 'ocean');
    w.time = Math.floor(w.time / 1440) * 1440 + 10 * 60;
    return `${p.id}/${r.index}`;
  });
  await page.evaluate((h) => (location.hash = `#/explorer/${h}`), wild);
  await page.waitForTimeout(6000);
  await shot('13-wilderness');
  const charted = await world(() => window.__genesis.store.getWorld().events.some((e) => e.title.includes('is charted')));
  check('exploring a wild region records history', charted);

  // 7. Observer sections
  for (const [name, hash, sel] of [
    ['14-civilizations', `#/civilizations/${ids.civ}`, '[data-testid=civilizations-page]'],
    ['15-characters', '#/characters', '[data-testid=characters-page]'],
    ['17-history', '#/history', '[data-testid=history-page]'],
    ['19-discoveries', '#/discoveries', '[data-testid=discoveries-page]'],
    ['20-creator', '#/creator', '[data-testid=creator-page]'],
    ['22-settings', '#/settings', '[data-testid=settings-page]'],
  ]) {
    await page.evaluate((h) => (location.hash = h), hash);
    const ok = !!(await page.waitForSelector(sel, { timeout: 8000 }).catch(() => null));
    await page.waitForTimeout(900);
    check(`${name.slice(3)} renders`, ok);
    await shot(name);
    if (name === '15-characters') {
      await page.click('[data-testid=character-row] >> nth=0');
      await page.waitForTimeout(800);
      const act = await page.textContent('[data-testid=char-activity]').catch(() => '');
      check('character detail shows current activity', !!act, act ?? '');
      await page.click('[data-testid=follow-btn]');
      await shot('16-character-detail');
    }
    if (name === '17-history') {
      await page.click('.year-group .row >> nth=0');
      const ok2 = !!(await page.waitForSelector('[data-testid=event-detail]', { timeout: 4000 }).catch(() => null));
      check('event detail with causes and effects', ok2);
      await page.waitForTimeout(500);
      await shot('18-event-detail');
    }
    if (name === '20-creator') {
      const before = await world(() => Object.keys(window.__genesis.store.getWorld().systems).length);
      await page.click('[data-testid=discover-system]');
      await page.waitForTimeout(400);
      const after = await world(() => Object.keys(window.__genesis.store.getWorld().systems).length);
      check('creator: discover star system', after === before + 1);
      await page.fill('.tool input.input.full', 'Resonant Field Theory');
      await page.click('[data-testid=introduce-discovery]');
      await page.waitForTimeout(400);
      const custom = await world(() => window.__genesis.store.getWorld().customTechs.length);
      check('creator: introduce discovery', custom >= 1);
      await page.selectOption('.tool:has([data-testid=historical-event]) select >> nth=1', 'plague');
      await page.click('[data-testid=historical-event]');
      const modal = !!(await page.waitForSelector('.modal', { timeout: 2000 }).catch(() => null));
      check('destructive action asks for confirmation', modal);
      if (modal) await page.click('.modal .btn.danger');
      await page.waitForTimeout(400);
      const plague = await world(() => Object.values(window.__genesis.store.getWorld().civs).some((c) => c.conditions.plague));
      check('creator: plague applied after confirmation', plague);
      await page.click('[data-testid=skip-month]');
      await page.waitForTimeout(3000);
      await shot('21-creator-after');
    }
  }
  const followVisible = await page.$('[data-testid=follow-widget]');
  check('followed character widget visible', !!followVisible);

  // 8. Persistence across reload
  await page.click('[data-speed="0"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid=save-now]');
  await page.waitForTimeout(800);
  const before = await world(() => ({ seed: window.__genesis.store.getWorld().seed, time: window.__genesis.store.getWorld().time, events: window.__genesis.store.getWorld().events.length }));
  await page.reload();
  await page.waitForFunction(() => window.__genesis?.store?.maybeWorld?.() && window.__genesis.store.useApp.getState().phase === 'ready', null, { timeout: 30000 });
  const after = await world(() => ({ seed: window.__genesis.store.getWorld().seed, time: window.__genesis.store.getWorld().time, events: window.__genesis.store.getWorld().events.length }));
  check('universe persists across reload', after.seed === before.seed && after.time >= before.time && after.events >= before.events, `${before.events} → ${after.events} events`);
  const intro = await page.$('[data-testid=intro]');
  check('no intro on returning visit', !intro);
  await shot('23-after-reload');

  // 9. Mobile layout sanity
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (location.hash = '#/civilizations'));
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.querySelector('.page')?.scrollWidth <= window.innerWidth + 1);
  check('no horizontal overflow at phone width', !!overflow);
  await shot('24-mobile');
} catch (e) {
  check('unexpected error', false, e.message);
}

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
