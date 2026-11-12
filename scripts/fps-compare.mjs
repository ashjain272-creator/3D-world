/**
 * Frame-rate comparison at a fixed quality between two builds (e.g. the
 * Phase 2 baseline and the current build), same seed, simulation paused so
 * only rendering is measured. Uses requestAnimationFrame timing.
 *
 *   node scripts/fps-compare.mjs medium http://localhost:4174/=baseline http://localhost:4173/=current
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const quality = process.argv[2] ?? 'medium';
const targets = process.argv.slice(3).map((a) => {
  const [url, label] = a.split('=');
  return { url, label: label ?? url };
});
const SEED = 'fps-compare-7';

async function frames(page, secs = 6) {
  return page.evaluate(async (s) => {
    const f = [];
    const t0 = performance.now();
    let prev = t0;
    await new Promise((res) => {
      const step = (now) => {
        f.push(now - prev);
        prev = now;
        if (now - t0 < s * 1000) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
    const dur = performance.now() - t0;
    const sorted = [...f].sort((a, b) => a - b);
    return { fps: +(f.length / (dur / 1000)).toFixed(2), p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(0) };
  }, secs);
}

const results = [];
for (const t of targets) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('genesis.settings.v1', JSON.stringify({ quality: q, showIntro: true }));
    } catch {
      /* ignore */
    }
  }, quality);
  await page.goto(t.url);
  await page.waitForSelector('#seed', { timeout: 20000 });
  await page.fill('#seed', SEED);
  await page.click('[data-testid=begin]');
  await page.click('[data-testid=onboarding-dismiss]', { timeout: 60000 });
  await page.click('[data-speed="0"]');
  await page.waitForTimeout(3000);
  const universe = await frames(page);
  const cap = await page.evaluate(() => Object.values(window.__genesis.store.getWorld().civs)[0].settlementIds[0]);
  await page.evaluate((id) => (location.hash = `#/explorer/${id}`), cap);
  await page.waitForTimeout(8000);
  const explorer = await frames(page);
  const r = { build: t.label, quality, universe, explorer };
  console.log(JSON.stringify(r));
  results.push(r);
  await browser.close();
}
