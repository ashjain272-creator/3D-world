/**
 * Frame-rate and main-thread measurements (Performance API) for the
 * Universe view at 5× speed, in worker mode and in main-thread mode.
 *
 *   node scripts/perf.mjs http://localhost:4173/
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:4173/';
const GPU = process.argv.includes('--gpu');

const browser = await chromium.launch({ args: GPU ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));

async function measure(label, seconds = 5) {
  const r = await page.evaluate(async (secs) => {
    let longTotal = 0;
    let longCount = 0;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTotal += e.duration;
        longCount++;
      }
    });
    try {
      obs.observe({ type: 'longtask', buffered: false });
    } catch {
      /* unsupported */
    }
    const frames = [];
    const simMs0 = window.__genesis.sim.stats.mainThreadMs;
    const t0 = performance.now();
    let prev = t0;
    await new Promise((resolve) => {
      const f = (now) => {
        frames.push(now - prev);
        prev = now;
        if (now - t0 < secs * 1000) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    });
    obs.disconnect();
    const dur = performance.now() - t0;
    const sorted = [...frames].sort((a, b) => a - b);
    const w = window.__genesis.store.getWorld();
    return {
      fps: +(frames.length / (dur / 1000)).toFixed(1),
      p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
      longTasks: longCount,
      longTaskMs: Math.round(longTotal),
      mode: window.__genesis.sim.mode,
      simMainThreadMsPerSec: +((window.__genesis.sim.stats.mainThreadMs - simMs0) / (dur / 1000)).toFixed(2),
      simDays: +(w.time / 1440).toFixed(1),
      characters: Object.values(w.characters).filter((c) => c.alive).length,
    };
  }, seconds);
  console.log(JSON.stringify({ label, ...r }));
  return r;
}

await page.goto(BASE);
await page.click('[data-testid=skip-intro]', { timeout: 20000 });
await page.click('[data-testid=onboarding-dismiss]', { timeout: 30000 });
await page.waitForTimeout(2000);
await page.click('[data-speed="0"]');
await measure('universe paused (worker)');
await page.click('[data-speed="5"]');
await measure('universe 5x (worker)');
await page.click('[data-speed="0"]');
await page.evaluate(() => window.__genesis.sim.save());
await page.goto(BASE + '?sim=main#/universe');
await page.waitForFunction(() => window.__genesis?.store?.useApp.getState().phase === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2000);
await page.click('[data-speed="0"]');
await measure('universe paused (main thread)');
await page.click('[data-speed="5"]');
await measure('universe 5x (main thread)');
await browser.close();
