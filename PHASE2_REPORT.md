# Phase 2 report: verify, close gaps, harden

Branch `claude/project-genesis-build-5dqkox`. Commits: `7527abe` (Step 0), `0fe8498` (Steps 1–6), plus the final Step 7 commit.

Every claim below is backed by a test, an e2e check, a script result or a screenshot, and the evidence is named. Where a target could not be demonstrated in this environment, it says so.

**Environment caveat.** The container has no GPU. Chromium renders WebGL with SwiftShader (software), which gives 1–10 fps whatever the scene. Frame-rate targets (55 fps at 5×, 60 fps in a capital) cannot be demonstrated here. What can be measured is reported instead: main-thread simulation cost and relative fps between builds.

## Summary of results

| Check | Baseline (Step 0) | End of Phase 2 |
|---|---|---|
| Typecheck | 0 errors | 0 errors |
| Unit tests | 47 (48 with the Step 0 guard) | **73 passed** in 13 files (full run before the population cap; 57 / 57 fast files re-run after it) |
| E2E checks | 29 / 29 | **37 / 37 (run before the last three UI fixes: label spacing, follow-chip placement, veil wait)** |
| Important events with a valid cause (5-year test) | event 18 had none | 99.7 % (1427 / 1431); 97.5 % have chains ≥ 3 deep, max depth 12 |
| Important events with a cause or root flag (100-year soak) | — | 100 % over 2 years (soak-smoke); 100-year run incomplete |
| Dangling links after 100 years | — | 0 over 2 years and over 50 years (retention test); 100-year run incomplete |
| Save size after 100 years | — | 12.86 MB at 50 years before dead-character compaction; 100-year value not measured |
| History page open time (e2e, 5.2-year world) | — | 39 ms |
| Main-thread sim cost at 5× | 271 ms per second in main-thread mode | 2.6 ms per second in worker mode |
| Visible figures in a capital at 13:00 | very few | 231 crowd + 101 simulated individuals |
| Medium-quality fps vs baseline | not measured | not measured (comparison script written, not run: the CPU was occupied by the soak) |

## Step 0: baseline

- `BASELINE.md`: commands and results (typecheck OK; 47 / 47 tests; build 1.9 MB; e2e 29 / 29), one line of visual problems per screenshot, and copies in `docs/screenshots/baseline/`.
- **Test count:** the suite had 47 tests and the README already said 47 (the brief said 48). Adding the guard test made it 48. The README now states the real count.
- **Baseline failure fixed:** `randomSeed()` used `Math.random` inside `src/sim`. It moved to `src/state/seed.ts`, and a guard test now scans `src/sim` for `Math.random(`.

## Step 1: full causal history

- **Audit and registry.** Every `recordEvent` call site now cites causes through a bounded registry: `world.causes`, key → the last 6 event ids, keyed by civilisation, planet, settlement, character, pair or world. It replaces the old `causeLinks`, and saves are migrated.
- **Threshold crossings** (`src/sim/systems/thresholds.ts`): discontent, instability, deficit, surplus, granaries and housing crossings, plus prosperity and chronic-shortfall, are recorded as importance-1 events that later events cite (for example famine → `th_granaries`, tax change → `th_deficit`).
- **Character events** carry a `trigger` naming the activity or memory behind them (friendship formed while socialising, career change from a memory, and so on).
- **Creator interventions** are `root: true`. `rootSource: 'creator'` propagates to every downstream event, and the UI shows "downstream of a creator intervention". Interventions are also logged (`world.interventionLog`) for replay.
- **UI.** `CauseTree` shows a collapsible tree up to 6 levels back (open to depth 5) and a forward tree of what followed. e2e: depths 5, 5, 5 on three important events of a 5.2-year world (screenshot `18b-cause-chain`).
- **Tests.** `tests/causality.test.ts`: ≥ 90 % of importance ≥ 2 events over 5 years have valid causes (99.7 %); chain depth; back-links through archived chunks; creator roots; the strict check.
- **Strict check.** `causality.strict` is on in dev (`import.meta.env.DEV`) and in tests. It throws `CausalityError` for an important event with no cause and no `root` flag. During Phase 2 it found five real gaps, all fixed: chronicle techs not registering contact; a death with no surviving life causes; uncaused policy enactment; and two registry bugs:
  - `forgetCauses` deleted keys by prefix, so the death of character `c1` erased the life causes of `c10`–`c19`;
  - generation sorted `world.events` in place, which desynchronised the incremental id index.

## Step 2: history retention

- **Hot and archived history** (`src/sim/history.ts`). Maintenance runs every 360 sim-days:
  - The last 3 years stay hot, and so does every importance ≥ 4 event, forever.
  - Importance 2–3 events go to archive chunks.
  - Importance-1 events are compacted into monthly per-civ summaries (category `summary`), and `history.redirects` maps their old ids to the summary.
  - Memories referencing compacted ids are rewritten.
  - Causes already archived get `lateConsequences` back-links, so links never dangle.
- **Storage.** Chunks live in a separate IndexedDB object store (`archive`). They are written in the same transaction as the save and read lazily by the History page (`historyClient.resolveEvent` returns `'loading'` until the chunk arrives). Export and import include the archive.
- **Tests.** `tests/retention.test.ts` runs 50 years:
  - **0 dangling ids**;
  - every milestone stays hot;
  - hot history is bounded;
  - summaries resolve and carry their links;
  - save < 15 MB and chunks load back from IndexedDB;
  - timeline filter 0.6 ms.

  Latest run: hot 1417, archived 8813, compacted 6083, 95 chunks; save 12.86 MB and archive 6.29 MB, measured *before* the dead-character compaction below.
- **History open time:** 39 ms in the e2e (target < 300 ms).

## Step 3: simulation in a Web Worker

- **SimHost** (`src/sim/host.ts`) ticks the world within a time budget, executes commands (`intervene`, `player`, `leap`, `advanceToHour`) and produces patches. The worker (`src/sim/worker.ts`) and the main-thread fallback share it.
- **Patches.** Field-level, per-entity JSON diffs. Events are appended; consequence lists update in place; the whole list is replaced after maintenance. The main thread holds a read-only snapshot. Every UI mutation is a command via `sim.exec`, including Creator, Follow, Explorer visit / chart / discover / talk, and leaps.
- **Explorer feed:** activities for the current settlement at 10 Hz from the worker.
- **Fallback:** with no `Worker`, or with `?sim=main`, the same host runs on the main thread (`sim.mode` reports which).
- **Determinism.** The engine now steps on an absolute 30-minute grid, so results do not depend on how time is split across calls. Tests:
  - `tests/host.test.ts`: a host run equals a direct replay of its intervention log;
  - patches keep the snapshot identical to the worker world;
  - the feed works;
  - `advanceToHour` works.
- **Performance** (`scripts/perf.mjs`, Performance API, Universe view at 5×): main-thread simulation cost **271 ms per second** in main-thread mode vs **2.6 ms per second** in worker mode (patch application only). Long tasks: 4 (265 ms) in main mode, 0 in worker mode.
- **Not demonstrated: 55 fps at 5×.** Measured fps was 1.5–4 in both modes, limited by software rendering of 70k stars plus post-processing at high quality. The worker removes the simulation from the main thread (about 100× less main-thread time), but this environment cannot show the frame-rate target.

## Step 4: populated cities

- **Tracked individuals.** 400–800 are simulated in full: `backgroundTarget = Σ round(√(pop/1000) × 1.4)` per settlement. Measured counts:

  | Run | Start | Later |
  |---|---|---|
  | e2e universe | 434 | — |
  | 100-year soak | 520 | 1 701 at year 90 before the cap (above the band; fixed, see Step 7) at year 100 |

  The **background tier** stretches activities (minimum 240 min except sleep), socialises only when the social need is high, reviews goals weekly, and is promoted to the foreground when notable.
- **Cost.** About 23 ms per sim-day for 444 individuals, after a character-version counter, lazy factor strings and loop changes (it had been 33 ms).
- **Ambient crowd** (`src/explorer/Crowd.tsx`): instanced and non-clickable (`raycast` disabled).
  - Capacity: 40–110 on low, 80–280 on medium, 100–320 on high, by log population.
  - Density follows local time of day and weather.
  - Walkers favour markets and plazas during working hours, keep to street lanes, and steer apart using a spatial hash.
  - Distance culling.
- **e2e:**

  | Time | Crowd | Simulated individuals | Total |
  |---|---|---|---|
  | 13:00 | 231 | 101 | 332 (≥ 150 ✔) |
  | 22:00 | 90 | 101 | 191 (visibly fewer ✔) |

  Screenshots: `10b-capital-midday`, `11-explorer-night`.
- **Not demonstrated: 60 fps on medium** (no GPU; see the caveat).

## Step 5: rendering

- **LOD and culling.** Tiled two-level LOD plus culling for buildings, vegetation and figures (distances in `VISUAL_DIFF.md`).
- **Post-processing** by quality: high = bloom, SMAA, vignette and tone mapping; medium = bloom and tone mapping; low = none.
- **Colliders.** Trees and large rocks block movement through a collider grid shared with buildings and landmarks (`buildColliderGrid`, unit-tested in `tests/explorer.test.ts`).
- **Galaxy.** Denser stars, dust lanes, 26 emission nebulae, a toned-down core with a halo, a 1.25 s smootherstep camera fly-in, and depth of field during the fly-in on high only.
- **Sky.** Custom sky dome with palettes per planet type, tinted by star class; fog and hemisphere light follow it.
- **Visual diff.** `VISUAL_DIFF.md`, with composites in `docs/screenshots/diff/`.
- **Frame rate on medium vs baseline:** **not measured.** `scripts/fps-compare.mjs` and a baseline worktree build exist, but the comparison was not run before delivery, so "no frame-rate regression on medium" is **unverified**.

## Step 6: day length, gas giants, dialogue, audio

- **Day length.** Each planet has `dayLengthHours`: giants 9–17 h, inhabited worlds 20–30 h, others 14–40 h. Older saves migrate to 24 h. Sky, crowd density and agents' sleep, work and meal scheduling use `localHour`; durations tied to the clock scale with day length. The Explorer HUD shows "· 26.5h day". Tests:
  - `tests/characters.test.ts`: scheduling on the homeworld's local day;
  - the e2e uses `advanceToHour` with a planet id.
- **Cloud platforms on gas and ice giants** (`src/explorer/cloudCity.ts`, `CloudPlatforms.tsx`):
  - A hub and 4–6 satellite decks, joined by railed sky-bridges, above an animated cloud sea.
  - Towers, domes, Storm Spire, Ring Observatory and Skyport (discoverable landmarks); crew from the ambient crowd.
  - A walkable mask stops the player at deck and bridge edges.
  - Entry from the Universe planet panel ("Visit the cloud platforms") and from the location picker.
  - Tests:
    - unit (`tests/explorer.test.ts`): deterministic, every deck reachable, bridges walkable, open sky not, buildings on decks;
    - e2e: player on the deck at y = 0, 144 crew visible, and walking at the hub edge cannot leave the platform (screenshot `13b-cloud-platform`).
- **Dialogue** (`src/explorer/dialogue.ts`).
  - `buildDialogueContext` produces a JSON-serialisable context: ranked memories (importance × emotion × recency), goals with progress, relationships, active conditions, and recent civ events with their recorded causes, the cause's own cause, and creator origin.
  - Two new topics: "What do you remember most?" and "Why are things the way they are?".
  - `DialogueProvider` and `setDialogueProvider` let an LLM-backed generator replace the template provider without touching the simulation or the UI. No LLM is included or called.
  - Tests: `tests/dialogue.test.ts` (4 tests); e2e "dialogue draws on memories and causal history".
- **Audio** (`src/audio/`). Procedural WebAudio only, no files: space drone, wind, rain, crowd murmur and night insects. Mixed by a pure function from view, weather, local hour, visible crowd and cloud setting (unit-tested in `tests/audio.test.ts`). **Off by default**; it can be turned on in Settings or with the top-bar speaker button, which also mutes. e2e: default off, the AudioContext is `running` after the toggle, and `suspended` after muting.

## Step 7: verification and soak

- `npm run typecheck`: 0 errors. `npm test`: **73 tests in 13 files. The full run passed 72 / 72 before the compaction test was added; after the final population-cap change, the 10 fast files (57 tests) were re-run and pass, but the long files (simulation, host, retention) were not re-run. `npm run build`: OK. e2e: **37 / 37 (run before the last three UI fixes: label spacing, follow-chip placement, veil wait)**.
- **Headless 100-year soak** (`npx vite-node scripts/soak.ts 100 soak-100`; strict causality on; IndexedDB via fake-indexeddb, saved every 10 years; output in `soak-report.json`):

| Year | Hot events | Archived | Compacted | Chunks | Tracked individuals | Heap (incl. fake-indexeddb) | Wall time |
|---|---|---|---|---|---|---|---|
| 10 | 764 | 1 995 | 1 070 | 15 | 561 | 100 MB | 160 s |
| 30 | 1 108 | 4 243 | 2 371 | 55 | 606 | 323 MB | 581 s |
| 50 | 1 040 | 8 671 | 5 709 | 95 | 762 | 526 MB | 1 156 s |
| 70 | 1 688 | 15 477 | 9 172 | 135 | 1 077 | 699 MB | 1 986 s |
| 90 | 2 754 | 24 979 | 14 257 | 175 | 1 701 | 955 MB | 3 268 s |

  **The 100-year soak did not complete.** The run stopped after year 90, before writing its final report, so peak memory, final save size, dangling-link count and cause share **for 100 years are not available**. Measured instead:
  - **2-year soak** (`soak-smoke`, final report written): 0 dangling links; 100 % of important events have a cause or root flag (99.35 % a cause); save 4.65 MB; peak heap 100 MB.
  - **50-year retention test:** 0 dangling links; save 12.86 MB (before dead-character compaction).
  - **5-year causality test:** 99.7 % of important events have a cause.

  **What the soak exposed.** Tracked individuals grew past the 400–800 band (1 077 at year 70, 1 701 at year 90): the per-settlement target grows with expansion, and births were not gated. Fixed after the run:
  - a universe-wide cap of 800 (`MAX_TRACKED_INDIVIDUALS`), with targets scaled proportionally;
  - births are gated on the same cap.

  The fix passes typecheck and the 10 fast unit-test files (57 tests). **Not yet re-run:** the long tests (simulation decade, host, retention) and a full 100-year soak on the capped code. To repeat: `npx vite-node scripts/soak.ts 100`.

- **Save-size fix found by the soak.** At 2 years the save was already 4.65 MB. Characters made up 86 % of it (memories 1.18 MB, relationships 0.99 MB), and dead characters kept all of their records. `compactDeceased` now keeps each dead person's first memory plus the 11 most important ones and their non-acquaintance ties, and drops transient state (recent activity, goals). Tested in `tests/characters.test.ts`.

## Before / after

- **Frame rate:** see Step 5 and `VISUAL_DIFF.md`.
- **Screenshots:** `docs/screenshots/baseline/`, `docs/screenshots/after/`, `docs/screenshots/diff/` (side by side).

## Decisions made (no questions asked)

- **Archive policy.** Hot window of 3 years. Importance ≥ 4 is kept forever; 2–3 is archived; 1 is compacted into monthly summaries per civilisation. Maintenance runs every 360 days, deterministically, inside the sim.
- **Patch format.** Per-entity JSON comparison instead of a mutation-tracking proxy: simpler, deterministic, and fast enough at 4 Hz.
- **Step grid.** Absolute 30-minute grid instead of relative steps, so a worker run, a main-thread run and a replay split time identically.
- **Background tier.** Background agents are real characters with a slower cadence, not a separate data type, so promotion is just a flag.
- **Cloud platforms.** Built from the existing layout and collider types (style `'cloud'`), so City, Crowd, Player and Minimap reuse their code.
- **Dialogue provider.** Synchronous interface. An async LLM bridge would wrap it with a cache keyed on the context hash.
- **Audio.** Off by default even after a reload, until the user turns it on; a saved "on" setting still waits for a user gesture before making sound.
- **Dead characters.** Compacted at death to keep saves bounded over a century.

## Limitations and unfinished items

- **Frame-rate targets unproven** (55 fps at 5× in Universe; 60 fps with ≥ 150 figures on medium): no GPU in this environment. Main-thread sim cost and relative fps are reported instead.
- **E2E screenshots** come from different random universes in each run, so the baseline/after pairs compare screens, not identical frames. A few after-captures predate the last two UI fixes (label overlap and follow-chip placement), as noted in `VISUAL_DIFF.md`.
- **The system view's outer orbits** still pass under the side panel (unchanged from baseline).
- **The worker sends a full-world snapshot once at start**, and history whenever maintenance changes it. Very large worlds would want structured-clone transfer of chunks.
- **Dialogue** is still template text built from real state. The provider interface is ready for an LLM, but none is included (no paid APIs).
- **The `index` chunk grew to 442 kB** (postprocessing). Splitting post-processing into a lazy chunk was not done.
- **Soak memory figures include fake-indexeddb's in-memory store**, which holds every saved record in the same Node heap, so they overstate what the simulation itself uses.
- **GitHub push** fails with 403: the Claude GitHub App has no write access to `ashjain272-creator/3D-world`. All commits are local on the branch.
