# Phase 2 baseline

Recorded on commit `0df42fd`, before any Phase 2 changes.

## Commands and results

| Step | Command | Result |
|---|---|---|
| Install | `npm ci` | OK (0 errors; npm audit reports advisories in dev dependencies only) |
| Types | `npm run typecheck` | OK, 0 errors |
| Unit tests | `npm test` | **47 / 47 passed**, 8 files, 49.9 s |
| Build | `npm run build` | OK. `dist/` = 1.9 MB; largest chunks: three 683 kB (176 kB gz), r3f 310 kB (100 kB gz), app 194 kB (65 kB gz) |
| E2E | `node scripts/e2e.mjs http://localhost:4173/ screenshots` | **29 / 29 checks passed**, no uncaught page errors |

**Test count.** The suite has **47** tests (`grep` of `it(` gives 6+3+5+7+10+5+5+6 = 47), and the README said 47. The Phase 2 brief says 48. The README count was already correct. It will be updated to whatever the suite contains at the end of Phase 2.

## Baseline failures found and fixed before Step 1

| Issue | Fix |
|---|---|
| `src/sim/generate/universe.ts` `randomSeed()` used `Math.random` inside `src/sim`, breaking the "no Math.random in sim" rule. | Moved to `src/state/seed.ts`; all four importers updated. Added a guard test (`tests/rng.test.ts › determinism guard`) that scans every file in `src/sim` and fails on any `Math.random(` call. The suite is now 48 tests. |

No test, build or e2e failures existed at baseline.

## Screenshots

Captured at 1440×900 with SwiftShader (software WebGL). Copies are in `docs/screenshots/baseline/` (JPEG, 960 px).

| # | Screen | Visual problems |
|---|---|---|
| 01 | intro | Subtitle and seed label are low contrast; otherwise clean. |
| 02 | generating | Log text is small and dim; the upper ⅔ of the screen is empty starfield. |
| 03 | galaxy + onboarding | Onboarding panel hides the left of the galaxy; system labels near the bottom (two names) overlap. |
| 04 | galaxy | Galactic core blown out to flat white; star field sparse and grainy; no dust lanes; overlapping labels for close systems. |
| 05 | system | Star glow dominates the frame; civ sub-label overlaps the neighbouring planet's label; the outermost orbits run under the side panel. |
| 06 | planet | Good overall; settlement labels very small; territory border reads as a dotted line. |
| 07 | settlement panel | Fine (all inhabitants "Sleeping at home" because the capture is at night). |
| 08 | explorer arrival | Captured at 04:54: large empty green foreground; lit windows are uniform white blocks; orange fog band at the horizon; very few figures visible. |
| 09 | explorer moving | Same empty foreground; city feels deserted. |
| 10 | dialogue | Daytime haze washes out the buildings; the NPC name label floats over the dialogue panel. |
| 11 | explorer night | Two NPC labels overlap each other; futuristic street edge lines glare as thick white bars; the "Talk to" prompt is low contrast. |
| 12 | location picker | Fine; the panel sits tight against the minimap buttons. |
| 13 | wilderness | Screenshot still shows the "Descending to" veil (the software renderer had not produced a frame within 6 s). Not visually verifiable at baseline. |
| 14 | civilizations | Fine; the diplomatic web graphic is small, with empty space below it. |
| 15 | characters | Right half is an empty "Select someone" placeholder. |
| 16 | character detail | Fine. |
| 17 | history | Milestone strip runs off the right edge (by design, scrollable); fine. |
| 18 | event detail | Event has no causes and no consequences ("No later events cite this one"): shallow causality. Large empty area. |
| 19 | discoveries | The "Following" widget overlaps the Exploration list. |
| 20 | creator | The "Following" widget overlaps the tool grid at bottom left. |
| 21 | creator after actions | Four toasts stack and cover the right third of the page. |
| 22 | settings | Toast stack covers the settings column. |
| 23 | after reload | Captured mid page-in animation: content is washed out. |
| 24 | mobile | The "Following" widget overlaps content above the tab bar; the last tab label is cut ("Cre…"). |
