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

## Phase 3: visual pass and glitch fixes

Requested after Phase 2: better UI, more detailed buildings, trees and environment, more depth and texture, then fix glitches.

**Visuals** (screenshots in `docs/screenshots/after/`, comparisons in `docs/screenshots/diff/`)
- **Buildings.** New facade shader: three glass-tower variants per building, shopfronts, floor slabs, parapets, sky reflection in glass, lintel shading and lit sills. Old towns get half-timber frames, stone courses, framed windows with shutters and stone footings. Geometry: stepped towers with podiums, rooftop plant, cornices, entrances, chimneys, doors, crates, dome plinths and skylights.
- **Streets.** Pavements, lane dashes, cobbles, street trees in planters, benches and bollards.
- **Vegetation.** Layered crowns (tiered conifers, clustered broadleaf, stacked jungle canopies, cactus arms), wind sway, leaf mottling, bushes, grass tufts, flowers and lumpy boulders.
- **Environment.** Terrain detail and rock strata, rippling reflective water, two hazy ridgelines, a weather-driven cloud deck.
- **Depth and texture.** Procedural surfaces for bark, rock, plaster, roof tiles, paving, metal deck, cloth and skin. On high quality: relief near the camera (filtered finite differences), sun shadows from trees, props and crowds, and sky reflections from an environment map.
- **UI.** Glass panels, gradient buttons with hover and focus states, HUD chips, pill labels, restyled toasts and dialogue bubbles.

**Glitches fixed**
- Arriving in a lake or on a cliff in the wilderness: the spawn now moves to the nearest dry, level ground.
- After a time jump, simulated people kept walking for minutes instead of being where their schedule puts them.
- Relief shading aliased into blocky noise at distance: rewritten with filtering and a distance fade.
- A shader failed to compile on figures (matrix not available in the fragment stage).
- Entrance canopies blocked the follow camera; shopfronts were blown out white at night.
- The Universe scene sat partly under the info panel: the view is now centred in the visible area.
- The night crowd check compared against people who are legitimately awake; it now compares the ambient crowd.

**Verification on the final code**
- Typecheck: 0 errors. Unit tests: **73 / 73** (13 files), including the long simulation, host and 50-year retention tests (0 dangling links, save 11.05 MB).
- Browser journey: **37 / 37** at medium quality. Re-run after the canopy and shopfront fixes: **37 / 37**.
- 100-year soak on the capped code: **completed** (`soak-report.json` values): 100 years in 2 873 s; 40 128 events recorded (1 762 hot, 22 819 archived, 15 547 compacted, 195 chunks); **0 dangling links**; 99.57 % of 23 794 important events cite a cause and 100 % have a cause or root flag; save 17.81 MB, archive 16.12 MB, reload OK; peak heap 814 MB (includes the in-memory IndexedDB); tracked individuals 804 at year 100 (peak 812, cap 800), 47 settlements. The 15 MB save target was set for 50 years (11.05 MB there); at 100 years the save is above it.

**Cost of the new visuals** (software rendering, Explorer in a capital, same seed)

| Quality | Frames per second |
|---|---|
| Low | 4.2 |
| Medium | 2.4 |
| High | 1.1 (about 3 before this pass) |

High is roughly three times more expensive per frame than before; sky reflections and relief account for most of it, which is why both are limited to high. These are software-rendering numbers; nothing has been measured on a GPU. The browser journey now runs at medium by default (`E2E_QUALITY=high` overrides), because high is too slow here to drive.

## Phase 4: world detail passes (colour, nature, desert and ice, living world, highways, figures)

Requested after Phase 3, in order:
1. Colour theory and variety.
2. Domes that all look the same, repetitive trees, a night city that looks fake, missing grass.
3. A desert with more in it, and better icy mountains.
4. More detail, down to the smallest things.
5. Multi-level highways.
6. "Finish everything and make the world perfect."

Commits `a997643` → `27ba4d1`.

**What was added** (current screenshots: `docs/screenshots/after/`, from the final e2e run)
- **Colour.** City palettes are derived from the civilisation's colour (analogous wall tints, split-complementary accents) and finished with a colour-grade post effect. Each futuristic tower has its own glazing tint (base, bronze, teal, blue or dark) and draws from a wider wall palette.
- **Organic towns.** Six dome variants: banded low dome, tall beehive, drum with a window ring, drum with a spire, clusters of grown-on rooms, two-tier domes; skylights or chimney pipes on top.
- **Night.** Windows are lit per apartment: offices go dark, homes light up. Lamp light pools on the street.
- **Trees.** Species per biome; trees are clustered by noise with a minimum spacing, so there is no grid pattern.
- **Grass.** Camera-following ground cover (grass and flowers). Green ground also gets clover and dry patches and a blade texture near the camera.
- **Deserts.** Dunes, flat-topped buttes and cracked clay pans. Adobe villages with a market and a smoking bread oven, stepped temples, an oasis, giant skeletons, obelisks, hoodoos, arches and wells.
- **Frozen worlds.** Snow on flat ground and above the snowline, wind-carved snow, glacier ice with crevasses. Igloo villages around a smoking campfire, ice caves, ice arches, spires, outposts, and auroras at night.
- **Living world.** Birds (vultures over deserts), butterflies by day and fireflies at night. Shoreline foam and damp sand, lily pads, mushroom rings, sky traffic, shop signs, frontier props, golden-hour light.
- **Smoke.** Plumes rise from about a third of frontier chimneys and from campfires and ovens. The whole particle life runs in the vertex shader, so there is no per-frame CPU cost.
- **Highways** (futuristic cities):
  - an elevated ring road and two expressways on different levels, with four ramps on pillars;
  - asphalt with lane markings, lamps, gantries and signs;
  - ground boulevards;
  - cars in every lane, in both directions.
- **Walking on the decks.** The player can walk up the ramps and along the decks. A central barrier blocks the median, and pillars only block the player at street level.
- **Roofs.** Gardens with trees and railings on low blocks, helipads with perimeter lights, and red aviation lights on tall towers.
- **People.** Articulated figures replace the capsules for the crowd, named people and the player. Each has an outfit (shirt, trousers, skin tone, hair, long or short hair) and a walk cycle driven by the vertex shader. Distant crowds use a lower-detail figure on medium.

**Defects found and fixed in this pass**
- **Most important: shared shader programs.** three.js caches compiled programs by the source text of `onBeforeCompile`. That text is the same for every material made by one factory function. So plaster, paving, roof tiles and rock (and several other parameterised materials) were drawn with whichever variant compiled first, which showed up as bark-like streaks on roofs and pavements. Every parameterised material now sets `customProgramCacheKey`. Before and after were checked in screenshots, and the whole tour was re-shot afterwards.
- **Noise hash.** The GLSL hash used `sin`, which loses precision at large world coordinates. It was replaced with a sin-free hash.
- **Name labels.** They scaled with distance, so people behind buildings showed as unreadable specks and people beside the camera as huge banners. Labels are now a fixed screen size and are only shown for people the camera can see (a line-of-sight test past buildings) within 30 m.
- **Glossy streets.** Asphalt gloss patches caught the sun as a white smear and are now matte.
- **Rain streaks on roofs.** The plaster's vertical rain streaks appeared on roofs and now apply only to walls.
- **Landmarks in water.** Wild landmarks could stand in a lake; they now move to the nearest dry ground, as the spawn point already did.
- **Domes from inside.** Domes were invisible from inside (a door seemed to float in the air); they are now double-sided.
- **Hidden mushroom rings.** Grass hid the mushroom rings; they were enlarged.
- **Standing on the median.** The player could stand on top of the median barrier.

**Not verified visually.** The street-car wheels and flatter lamps (commit `dfefd0a`) typecheck and render without errors, but no screenshot caught a car close enough to inspect them.

**Verification on the final code**
- Typecheck: 0 errors.
- Unit tests: **84 / 84** in 14 files. These include the long simulation and 50-year retention tests (0 dangling links, save 11.05 MB). New tests (`tests/world3d.test.ts`) cover:
  - deterministic vegetation;
  - structures that suit the biome;
  - spawn point and landmarks on dry ground, with nothing at the spawn point;
  - a ring road, two expressways on different levels, four ramps and pillars;
  - road sampling on closed loops;
  - deck surface and median barrier;
  - line of sight.
- Browser journey: **36 / 37** at medium on the final build. The failing check was "WASD moves the player" (0.9 units in a 2 s hold). Player movement is capped at 0.12 s per frame and the final build renders at about 1 fps in software, so a 2 s hold covers only two frames. Run on its own, the same build moved the player 1.7 units in a 2 s hold and **14.3 units over 16 rendered frames**. The check now holds W for 16 rendered frames instead of 2 seconds. The full journey was not re-run after that change.
- Screenshot tour of every city style and wild biome, by day and at dusk or night, after the shader fix: `docs/screenshots/tour/` (34 images).
- **Frame rate: regressed.** Medians from `scripts/fps-compare.mjs`, software rendering, same seed:

  | Quality | Scene | Baseline | Now |
  |---|---|---|---|
  | Medium | Universe | 15.2 fps | 4.6 fps |
  | Medium | Explorer | 2.9 fps | 1.3 fps |
  | Low | Universe | 29.0 fps | 21.5 fps |
  | Low | Explorer | 6.7 fps | 3.5 fps |

  Low now renders at 0.75 resolution; before that it measured 16.1 and 2.3 fps. The baseline scene was much emptier. These figures measure CPU-side shading cost under SwiftShader and say nothing direct about GPU frame rates.
- Renderer cost on medium (Explorer, from `renderer.info`):

  | Scene | Draw calls | Triangles |
  |---|---|---|
  | Futuristic capital | 266 | 457k |
  | Organic capital | 352 | 542k |
  | Forest | 338 | 244k |
  | Desert | 201 | 300k |

## Phase 5: districts in futuristic cities

Requested: "look at cities like Dubai… areas with skyscrapers, areas with mansions, areas with loads of shops… flyovers, highways, mosques, temples… the mansions should all look amazing and have some variety."

What makes a Gulf city read as varied is its zoning. There is a supertall downtown with one signature tower, a corridor of towers along the expressways, low old souk quarters of arcaded shophouses with wind towers, malls, villa districts of walled plots with pools and palms, and mosques and temples set among them. Futuristic cities now follow that pattern. The layout is deterministic per settlement, and every building records its district. Screenshots are in `docs/screenshots/districts/`.

- **Zoning** (`layout.ts`). The grid is split by ring and sector, with a random rotation per city:
  - downtown inside 40 % of the radius;
  - a villa sector in the outer ring;
  - a souk sector;
  - mixed towers and blocks elsewhere.

  Each capital or city gets one mall (in the souk), one mosque and one temple on whole blocks. Downtown plots are whole blocks. Its tallest buildings become supertalls, and the first one beside the central plaza is the city's signature tower: 230–260 m in a capital.
- **Supertalls** (five silhouettes, `City.tsx`), all with a lobby podium and a red aviation light:
  - a Y-plan needle that steps back seven times under a spire;
  - a tower twisting through 90°;
  - a curved sail with lit edges;
  - twin towers joined by a sky bridge;
  - an octagonal tower with a crown of lit fins.
- **Facade fix.** The window shader now measures floors from street level in futuristic cities. Before, every stacked tier of a set-back tower began with a shopfront band in mid-air.
- **Mansions** (five styles, `districts.ts`):
  - modern, with a cantilevered upper volume, floor-to-ceiling glazing, a timber or stone screen and a glass balustrade;
  - Mediterranean, with a tiled hip roof and wing, arched windows, shutters, a balustraded balcony, pots and a pergola;
  - Gulf courtyard house, with crenellated sand walls, a gold, white or turquoise dome, a slatted wind tower, an arched portal and carved doors behind wooden screens;
  - classical, with a portico of four or six columns under a pediment, lower wings and a tiered fountain;
  - glass pavilion, with a floating roof plane on slim columns, a stone core and a rooftop studio.

  Every plot has a lawn, a garden wall or clipped hedge, gate piers with lamps, a driveway with a parked car, a pool with deck, loungers and an umbrella, and palms (conifers on cold worlds). Wall, roof and dome colours, column counts and accents vary per house. At night the panes light up room by room, in warm or cool light, and the pools glow.
- **Souk.** Terraces of two or three shophouses with arcades, glowing shopfronts and coloured signs, goods set out on the pavement, arched upper windows behind wooden screens, crenellated parapets, wind towers on about half the roofs, awnings and lanterns.
- **Mall.** A stone-clad block with bands, a ribbed glass atrium dome, a glazed portal under a canopy, signage, and a plaza of palms in planters.
- **Mosque.** Courtyard walls with an arched gate, a prayer hall with arched windows, a great dome on a windowed drum, four corner domes, a tall arched iwan, two or four minarets with lit balconies and gold finials, an ablution fountain and palms.
- **Temple.** A stepped plinth, a pillared hall under a stepped roof, and a sanctum with a nine-course shikhara tower with ribbed buttresses, a cap, a gold finial and a saffron flag. Four corner shrines and a row of lamps surround it.
- **Boulevards.** Palms in planters line the wide avenues on warm worlds.

**Verification**
- Full unit suite: **88 / 88** in 14 files (the long simulation and retention tests included). The browser journey was not re-run after this phase.
- New tests in `tests/world3d.test.ts`:
  - large futuristic cities contain villas, a souk and a mosque, and each kind sits in its own district;
  - at most one mall, mosque and temple per city;
  - deterministic district geometry with more than 500 pieces in a capital;
  - a lit pool or fountain for every villa;
  - palms only on warm worlds;
  - every villa piece stays inside its plot;
  - all five villa styles occur across the universe;
  - other city styles are untouched.
- Screenshots (day, and night for villas, souk, mosque and skyline) are listed in the file names under `docs/screenshots/districts/`. The temple and skyline were checked from several angles. Supertalls can only be judged from a distance, so the skyline shots are the evidence for them.
- **Renderer cost.** A capital's districts add 2 095 instanced pieces in 49 shape-and-material groups (a city 1 644, a town 887). At medium in the futuristic capital (`renderer.info`, same seed and view as Phase 4):

  | Measure | Before districts | After |
  |---|---|---|
  | Draw calls per frame | 266 | 390 (505 before the district tiles were enlarged to 240 m) |
  | Triangles per frame | 457k | 579k |
  | Software frame time | about 0.70 s | about 1.07 s |

  The fps comparison against the baseline was not re-run after this phase.

## Phase 6: grander mansions, places of worship spread out, bigger cities

Requested: "The mansions should look much better… distribute the buildings, mosques and all much better… all the temples, mosques and other religious things are in one area… if they don't fit, make the city bigger."

**City size and distribution** (`layout.ts`, `terrain.ts`)
- **Bigger cities.** Futuristic cities are larger: capital radius 175 → 262 m, city 145 → 215, town 110 → 150, outpost 75 → 95. Their terrain grows from 720 m to 960 m across, with resolution scaled so detail per metre is unchanged, so the framing mountains still start beyond the city. The ring road sits 26 m outside the city, and its countryside ramps were shortened to fit.
- **Districts.** Two villa enclaves sit on opposite sides of the outer ring. There is a souk sector, downtown within 36 % of the radius, mixed blocks elsewhere, and pocket parks (four in a capital).
- **Worship sites and malls.** They are placed by farthest-point spreading: each new site goes to the allowed block farthest from everything already placed. The allowed districts are:
  - mosques: mixed, souk and villas;
  - temples: mixed, villas and souk;
  - the church: mixed and villas.

  A capital gets 4 mosques, 2 temples, 1 church and 2 malls. A city gets 3, 1, 1 and 1.
- **Reference capital (seed `vis-check-3`).** The plan in `docs/screenshots/districts/district-map.jpg` is drawn from the real layout:
  - mosques stand in all four quarters (two in villa enclaves, one in the souk);
  - one temple stands to the north and one to the north-east, and the church to the east;
  - the nearest two worship sites are 130 m apart.
- **Estates.** Villa estates occupy two neighbouring blocks with the street between them closed, never across the inner avenues that carry the expressways. Plots are about 60 × 24 m, with houses of 19–24 × 12–14 m and 9.5–12.5 m tall (up to three floors). Single-block villas remain where no pair fits.

**Mansions rebuilt** (`districts.ts`), six styles:
- **Common to every style.**
  - Framed windows on every face, with a mullion and transom and a projecting sill.
  - A stone plinth, flower beds and facade uplights.
  - Striped lawns and walls with coping, or clipped hedges.
  - Lamp piers along the frontage, gate piers with lamps or urns, iron gates.
  - A kerbed drive with lamp posts and one or two cars, and trees along the back wall.
- **Estates also have** a pool with a deck, loungers, an umbrella and a pool house, plus one of:
  - a tennis court with lines and a net;
  - a formal parterre of clipped hedges round a tiered fountain, with topiary cones and a flower bed;
  - a marble gazebo with a table.
- **The six styles:**
  - **Modern:** floor-to-ceiling glazing with mullions, a cantilevered upper floor with timber or stone fins, thin roof planes with lit soffits, a glass penthouse on three-floor houses, a stone feature wall and an entrance canopy.
  - **Mediterranean:** a hipped terracotta roof with eaves and a chimney, an arcaded loggia carrying a balustraded balcony, arched French doors, shuttered windows all round, a hipped wing, and bougainvillea climbing the corners.
  - **Courtyard palace:** U-shaped round a marble courtyard with arcades, a tiered fountain and palms. It has crenellations, a great dome on a windowed drum, two small domes, two slatted wind towers, wooden oriels and a crenellated arched gateway.
  - **Classical:** rustication, a string course, a cornice with a balustrade and urns, a cupola, and pedimented windows. A portico of four or six columns with bases and capitals stands on steps, and wings carry their own balustrades.
  - **Glass pavilion:** two glass volumes crossing at right angles under white roof plates with a lit soffit, a stone wall, a timber deck and a fire pit with lounge seats.
  - **Tropical** (new): timber-framed glass pavilions under deep hipped roofs, joined by a covered walk, with a lily pond, stepping stones and stone lanterns.
- **Night.** Windows light up room by room, pools glow, and lamps line the walls and drives.

**New buildings**
- **Church:** a buttressed nave with stained-glass lancets, an apse, a west tower with belfry openings, pinnacles and a tall slate spire with a cross, a rose window, and a churchyard with yews.
- **Pocket parks:** crossing paths, a tiered fountain, trees or palms, flower beds, benches and lamps.

**Verification**
- Full unit suite on the final code: **88 / 88** in 14 files (log: `logs/unit-tests-mansions.log`).
- Tests (`tests/world3d.test.ts`):
  - capitals have at least six worship sites, other big cities at least four;
  - no two are closer than two blocks (72 m);
  - they stand in at least two districts and at least three quarters of the city;
  - estates exist;
  - every villa has more than 80 pieces, all inside its plot;
  - churches and parks are built;
  - all six styles occur across the universe.
- Screenshots of every style (estates and single plots), the church, a park, mosques, the temple, the skyline, night estates and the plan map are in `docs/screenshots/districts/`.
- **Renderer cost** (futuristic capital, medium): 415 draw calls and 1.19M triangles per frame, against 390 and 579k before this phase. Software frame time stayed about 1.06 s.
- **Not done:** the browser journey and the fps comparison against the baseline were not re-run after this phase. Garden walls still have no colliders.

## Phase 7: real parks, neighbourhoods, better mansions, building photos

Requested:
- parks that look like parks, with swings, play equipment, picnics and different sizes;
- distribution "better but still not good enough";
- mansions that look better;
- a picture of each type of building on its own.

**Distribution** (`layout.ts`)
- **Neighbourhoods instead of pie slices.** Each futuristic city scatters 3–13 neighbourhood seeds outside the downtown core: villa enclaves, souks, mixed areas and, in capitals, a second skyline cluster out in the ring. Every block belongs to the nearest seed, with a deterministic jitter so the borders are irregular. The villa and souk districts therefore come in several patches of different sizes in different parts of the city.
- **Places of worship.** They are placed in one interleaved sequence (mosque, temple, mosque, church, …), each on the allowed block farthest from every landmark already placed.
  - In the reference capital (seed `vis-check-3`) that gives 6 mosques, 3 temples and 2 churches across all four quarters, mixed with each other.
  - The nearest two are 114 m apart.
  - The plan is at `docs/screenshots/buildings/district-map.jpg`.
- **Parks in three sizes.**

  | Park | Blocks | Approx. size | Capital | City | Town | Outpost |
  |---|---|---|---|---|---|---|
  | Central | 2 × 2 | 62 × 62 m | 1 | 1 | – | – |
  | Long | 2 × 1 | 62 × 26 m | 2 | 1 | 1 | – |
  | Pocket | 1 × 1 | 26 × 26 m | 3 | 2 | 2 | 1 |

  Streets inside a park are closed, there are no street lamps at the closed crossings, and highway pillars are kept out of parks and villa gardens.

**Parks** (`districts.ts`)
- **Every park:**
  - a lawn with meadow patches;
  - a winding path loop with entrances from each side;
  - benches and lamps along the path;
  - tree clusters (round trees, conifers, autumn trees, palms on warm worlds);
  - flower beds and a low hedge with gaps at the entrances.
- **Playgrounds** on a coloured safety surface behind a low fence:
  - swings on A-frames, a slide tower with a roof and ladder;
  - a seesaw, a roundabout, spring riders;
  - on larger ones, a climbing frame and a sandpit with a bucket.
- **Picnic areas** with picnic tables, blankets, hampers and a barbecue.
- **By size:**
  - pocket parks hold a playground or a picnic lawn;
  - long parks hold a playground, a picnic area and a café kiosk with umbrella tables;
  - the central park adds mounds, an irregular pond with reeds, lily pads, ducks and a footbridge, a basketball court or a five-a-side pitch, and a bandstand.

**Mansions**
- **Glass.** Glass is lighter, reflects the sky at grazing angles, and lights up room by room at night. Before, the glass houses read as dark slabs.
- **Estates.** Houses now stand at the back of the plot behind a gravel motor court with kerbs, lamps, cars drawn up at the sides, and a tiered fountain or topiary island.
- **Details:**
  - stone quoins on Mediterranean and classical houses;
  - chimneys and dormers;
  - a belvedere tower with an open arcade on Mediterranean houses;
  - a planted roof and a bronze band on modern houses;
  - a teak deck, timber screens and planters on tropical houses.

**Building photos.** A free photo camera (`commands.photo`) frames a single building, trying several angles and heights until the sight line clears other buildings, with the interface hidden. `docs/screenshots/buildings/` holds 39 photos, one per type:
- **Futuristic, mansions:** six styles, each as a single villa and as an estate (12 photos).
- **Futuristic, skyscrapers:** four supertall silhouettes (the twisted one did not appear in the reference capital; the "twin" shot shows the skyline from too far away to tell it apart), tower, block, slab.
- **Futuristic, other:** souk shophouse, mall, mosque, temple, church, and the three park sizes.
- **Organic:** six dome variants, the treehouse and the pod.
- **Frontier:** house, hall, silo, windmill.

**Verification.** Full unit suite **88 / 88** on this code (`logs/unit-tests-parks.log`). New checks:
- parks come in more than one size, including one over 2 500 m²;
- mosques are at most 60 % of the places of worship;
- villas and souks appear in several quarters of the city.

**Problems still visible in the photos**
- Organic domes read grey rather than cream in this light.
- A few shots still have a nearby tower or the highway deck in the foreground. The camera angle search only checks building footprints.

## Phase 8: a Premier League stadium and an NBA arena

Requested: "Make a basketball NBA sized stadium, make a football Premier League sized stadium, and make them extremely detailed and good looking."

**Placement** (`layout.ts`, `roadNetwork.ts`)
- **Which cities get them.** Capitals get both venues, cities get the arena. The capital radius grows from 262 m to 300 m so the districts keep their space.
- **Blocks.** The stadium reserves 5 × 4 blocks (170 × 134 m) and the arena 4 × 4 (134 × 134 m), with their inner streets closed. Neither may cross the two central boulevards or sit in the downtown core, and the two are kept apart.
- **Landmarks.** A landmark that would land on a venue is moved elsewhere. Before, it deleted the venue.
- **Expressways.** An expressway that cannot find a clear avenue is now left out rather than driven over a stadium roof. The first version had one crossing the pitch.
- **Checked across seeds.** In five seeds every capital has both venues and every city has an arena.

**Football stadium** (`venues.ts`)
- **Pitch and markings.**
  - A 105 × 68 m pitch with 18 mowing stripes and run-offs.
  - Every marking: touch and goal lines, halfway line, centre circle and spot, both penalty areas (40.3 × 16.5 m), goal areas, penalty spots and both Ds.
  - Goals with posts, crossbars and nets, and corner flags.
- **Pitchside.**
  - 22 players in two kits plus a referee and the ball.
  - Two dugouts with perspex roofs and team seats, technical areas, the players' tunnel and TV cameras.
  - A ring of LED advertising boards.
- **Stands.**
  - Four two-tier stands: a lower tier of 16 rows, a glazed and lit band of executive boxes, and an upper tier of 13 rows with an LED ribbon on its fascia.
  - Aisles cut through the rows, vomitories, and back walls.
  - Corner fills with giant screens above them.
- **Roof.** Cantilevered over every stand on back columns, with trusses, a translucent leading edge, floodlight strips and a lit sign on the main stand.
- **Outside.**
  - A glazed ground floor under tall alternating fins with a lit band in club colours.
  - Four glazed stair towers.
  - A main entrance canopy with turnstiles and a lit crest, and flags in the fan zone.

**NBA arena**
- **Court and baskets.**
  - A 28.65 × 15.24 m maple court on a team-colour apron.
  - All NBA markings: sidelines and baselines, halfway line, centre circle, painted keys (4.88 × 5.79 m), free-throw circles, restricted arcs, three-point arcs (7.24 m) and the straight corner sections.
  - Padded stanchions, glass backboards with red frames, rims, nets and shot clocks.
- **Courtside.** A lit scorer's table, team benches, two rows of courtside seats, and ten players with a ball.
- **Bowl.**
  - Three tiers of 14, 8 and 10 rows, each set back and raised, with angled corner sections.
  - Ribbon boards on the tier fronts.
  - A glazed, lit suite level.
- **Overhead.**
  - A centre-hung scoreboard with four large screens, LED rings and a lower ring of small screens.
  - Two catwalks with light rigs, and a dark ceiling with trusses.
- **Outside.**
  - A 40-segment glazed elliptical drum with metal panels, fins and a team-colour LED band, fully glazed over the main entrance.
  - A roof with a lit rim and a glass lantern.
  - An entrance canopy with a lit sign, a statue on a plinth, and banners round the building.

**Crowd and lighting**
- **Crowd shader.** A shader fills every seating row with fans: shoulders and heads seen from above, torsos and heads above the seat backs on the row fronts. About 10 % of seats are left empty. Clothing is muted and varied, with about a third of fans in club colours.
- **Night.** The pitch, the court and the crowd carry their own floodlight after dark.

**Verification**
- **Tests** (`tests/world3d.test.ts`):
  - every capital has a stadium and every capital and city an arena, at real sizes;
  - no street runs through a venue and no expressway pillar stands in one;
  - venues have more than 100 crowd rows;
  - the stadium has its D arcs and two nets;
  - the arena has two three-point arcs and its court.
- **Full unit suite:** **89 / 89** in 14 files on this code (`logs/unit-tests-venues.log`).
- **Photos** in `docs/screenshots/venues/`:
  - stadium: exterior, aerial, stands, goal, pitchside;
  - arena: exterior, entrance, interior, court, scoreboard;
  - night versions of the exteriors, the stands and the arena interior.
- **Cost.** In the futuristic capital at medium, draw calls went from 415 to 513 per frame. Triangles are 1.09M per frame. The stadium is 1 937 instanced pieces and the arena 1 437. Frame time was not measured cleanly: the run overlapped the test suite.
- **Not done:** the arena has a single collider for its whole footprint, so the player cannot walk inside; the interior photos use the free photo camera. The browser journey was not re-run.

**Follow-up: visible markings.** Requested: "make the game lines more visible, I can barely see them".
- **Cause.** The pitch lines sat 1 cm below the tops of the mowing-stripe boxes, so they were hidden. The court lines shared a height with the painted keys and flickered against them. Both sets were also thin (12 cm and 8 cm) and lit like the ground, so they faded in shade and with distance.
- **Fix.**
  - Every marking is now drawn in unshaded white paint, pushed in front of its surface.
  - Pitch lines are 30 cm wide at 18 cm height, above the stripes.
  - Court lines are 15 cm wide at 24.5 cm height, above the keys and centre disc.
  - Arcs (centre circles, the Ds, corner arcs, free-throw circles, restricted and three-point arcs) are built from short segments of the same width. Before, scaled ring geometry thinned out on the large circles.
  - The court gained hash marks along the keys.
- **Checks.**
  - Tests now assert that every pitch marking is above 0.16 m and every court marking above 0.23 m.
  - The stadium and court photos in `docs/screenshots/venues/` were re-shot.

**Follow-up: stadium roof.** Requested: "make the stadium roofs look better". Before, each stand had a flat grey slab with thin ribs, and the corners were open.
- **Panels.** The roof is now 6 m bays of alternating metal panels (two tones) and translucent strips, tilted to rise 4 m from the back to the leading edge.
- **Structure.** White trusses with top chords and posts sit over every second bay. Back columns carry a white box beam.
- **Leading edge.** A deep white fascia carries an LED band in club colours (white on the main stand, which also has a lit sign), a row of floodlights every 3 m beneath it, and a catwalk.
- **Corners.** Corner roofs close the gaps, with diagonal fascias and LED bands joining the stand edges. The giant screens now hang under the corner roofs from pylons.
- **Masts.** Four masts rise from the stair towers. Each has red beacons, four stay cables to the nearest points of the leading edges, and a back-stay to the ground.
- **Photos.** `docs/screenshots/venues/stadium-roof.jpg` and `stadium-roof-night.jpg` are new; the stadium exterior, aerial and stands photos were re-shot.

**Follow-up: arena exterior.** Requested: "make the arena look better too". Before, it was a plain drum of identical panels with a flat roof disc and a small canopy.
- **Concourse.** A glazed concourse ring at street level, 9 m high with mullions, sits under a continuous canopy ring with a lit soffit. Both are built as rings of segments, because a solid disc would cut across the bowl inside.
- **Upper drum.** It is set back behind 48 leaning white and silver fins that cross in an X pattern over dark glass.
- **LED ribbon.** A 72-segment media ribbon runs round the drum in team colour, second colour and white.
- **Roof.** A white rim with a team-colour band, four stepped rings with 24 radial ribs, and a glass lantern with mullions, a white cap and a lit ring.
- **Ceiling.** Inside, the ceiling gained radial trusses. It is sized to the drum, so it no longer pokes out of the walls.
- **Entrance.** A projecting glass atrium, 30 m wide and 17 m high with a mullion grid, carries a framed video wall (team-colour screen with lit name bands). In front are a 40 m canopy on slender columns with a lit soffit, broad steps, planters with trees, bollards, a gold statue on a plinth, and banners round the building.
- **Fit.** The drum still clears the bowl: the outer rows reach about 57.4 m from the centre and the drum is 59.5 m.
- **Photos.** The arena exterior, roof, entrance, interior and court, plus night exterior and roof, are in `docs/screenshots/venues/`.

**Follow-up: interiors.** Requested: "make the interior better and way more amazing for both of them".

**Stadium**
- **Colour zones.** The main stand is dark. The home end and the far side are in club colours. The visitors fill the lower tier of the far end in their own colours.
- **Home end.** A card mosaic (tifo) in club colours and white, with a gold emblem, lies across the whole upper tier on the rake of the seats.
- **Banners.** Banners hang from the other upper-tier fronts, in club colours at the far side and in the visitors' colours at the away end.
- **Directors' box.** A glazed, lit box projects from the centre of the main stand.
- **On the pitch edge.**
  - An inflatable players' tunnel in club colours.
  - Photographers with cameras behind both goals.
  - Ball kids at the corners.
  - Six substitutes in bibs warming up along the far touchline.
- **Roof edge.** Goal-line cameras sit under the roof edge, aimed at each goal.
- **Floodlight beams.** Additive haze cones from the floodlights. They fade in after dark only, because by day they read as solid cones.

**Arena**
- **Court edge.** LED boards run along both sidelines (broken at the scorer's table) and behind both baselines.
- **Centre court.** A logo: a gold ring round a white and second-colour disc.
- **Apron.** Sponsor panels painted on the apron.
- **People and cameras.** Eight dancers with pom-poms on the baselines, and four broadcast cameras on posts at the court corners.
- **Banners.** Six championship banners (team colour, gold band, white) and four retired-number banners hang in the rafters above the club level at one end.
- **Light beams.** Four light beams fall from the rigs onto the court. They are always on, since the arena is indoors.
- **Tunnels.** Tunnel mouths at the four corners of the lower bowl, with lit signs.
- **Scoreboard.** A lit halo in the second colour under the scoreboard.

**Checks**
- The court sponsor panels sit above the apron surface. The tests were adjusted to require paint above the apron (0.18 m) everywhere and above the keys (0.23 m) for the court markings.
- Photos re-shot in `docs/screenshots/venues/`: stadium stands (day and night), pitchside, home end, goal; arena interior (day and night), court, scoreboard.

**Follow-up: seats and light beams.** Requested: "make the arena seats more realistic, and the beams of light look weird".

**Seats**
- **Arena seat scheme.** The lower bowl and upper deck use a deep shade of the team colour, and the club level is black leather.
- **Clothing.** Fans dress like a real crowd: mostly black, navy, grey and white, about a third in team jerseys, the rest in muted colours. Before, every fan had a saturated rainbow shirt.
- **Seen from above.** Each occupied seat shows shoulders and a head, with skin or hair showing.
- **Row fronts.** Seat backs with armrest gaps and a lit top edge, with torsos and heads above them.
- **Hash fix.** The hash that picks a person now uses the same 0.8 m cells as the drawing, so a person never changes colour halfway across.
- **Distance.** Far away, the per-seat detail fades to the crowd's average tone, so distant stands read as a dense crowd instead of shimmering noise.
- **Night glow.** The crowd's night glow was cut by half.

**Light beams**
- The beams were solid cones with a cap and hard edges.
- They are now open cones in an additive shader, brightest along the axis and near the lamp, fading to nothing at the silhouette and towards the floor.
- This applies to both the arena (always on) and the stadium (after dark only).

**Photos.** Re-shot in `docs/screenshots/venues/`: arena interior (day and night), court and scoreboard, and the stadium stands (day and night).

## Limitations and unfinished items

- **Frame-rate targets unproven** (55 fps at 5× in Universe; 60 fps with ≥ 150 figures on medium): no GPU in this environment. Measured relative to the baseline under software rendering, the current build is 2–3× slower at medium (see Phase 4).
- **E2E screenshots** come from different random universes in each run, so the baseline/after pairs compare screens, not identical frames. A few after-captures predate the last two UI fixes (label overlap and follow-chip placement), as noted in `VISUAL_DIFF.md`.
- **The system view's outer orbits** still pass under the side panel (unchanged from baseline).
- **The worker sends a full-world snapshot once at start**, and history whenever maintenance changes it. Very large worlds would want structured-clone transfer of chunks.
- **Dialogue** is still template text built from real state. The provider interface is ready for an LLM, but none is included (no paid APIs).
- **The `index` chunk grew to 442 kB** (postprocessing). Splitting post-processing into a lazy chunk was not done.
- **Soak memory figures include fake-indexeddb's in-memory store**, which holds every saved record in the same Node heap, so they overstate what the simulation itself uses.
- **GitHub push** fails with 403: the Claude GitHub App has no write access to `ashjain272-creator/3D-world`. All commits are local on the branch.
