# Project Genesis

A procedurally generated, persistent universe you can explore, observe and influence. Galaxies, stars, planets, civilisations, settlements and individual inhabitants are generated from a seed and then simulated in real time. Economies grow and fail, governments change hands, explorers chart new lands, people make friends and rivals, and every meaningful change goes into a causally linked history.

Everything runs locally in the browser. It needs no accounts, API keys or servers.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build and preview:

```bash
npm run build
npx vite preview     # http://localhost:4173
```

Checks:

```bash
npm run typecheck    # TypeScript, strict mode
npm test             # Vitest suite (73 tests)
node scripts/e2e.mjs http://localhost:4173/ screenshots   # browser journeys + screenshots (needs a running preview)
node scripts/perf.mjs http://localhost:4173/              # frame rate and main-thread sim cost, worker vs main thread
npx vite-node scripts/soak.ts 100                         # headless 100-year soak; writes soak-report.json
```

## What's inside

| Section | What you can do |
|---|---|
| **Universe** | Spiral galaxy map → star systems with orbiting planets → rotating planet globes with territories, settlements and clickable regions. Any settlement or wild region can be entered in Explorer; gas and ice giants have floating cloud-platform outposts. |
| **Explorer** | Third-/first-person 3D exploration. Procedural terrain and vegetation. Cities in three architectural styles: futuristic cities laid out in districts (a supertall downtown with a signature tower, two villa enclaves of walled estates with mansions in six styles, pools, tennis courts and formal gardens, a souk of arcaded shophouses with wind towers, malls, pocket parks, and mosques, temples and a church spread across the city) with multi-level highways, rooftop gardens and traffic; organic domes and tree-houses; stone-and-timber frontier towns with smoking chimneys. Wild regions have biome-specific trees, ground cover and structures (adobe villages, temples and skeletons in deserts; igloo camps, ice caves and auroras on frozen worlds; stone circles and ruined towers in temperate lands), plus birds, butterflies and fireflies. People are articulated figures with individual outfits and walk cycles, and the player can walk up highway ramps onto the decks. Landmarks to discover. Inhabitants who walk to work, meet friends and go home to sleep according to the simulation. Each planet has its own day length; sky, fog and light follow the planet type and its star's class. Ambient crowds scale with population, time of day and weather. A minimap, and conversations built from each person's memories, goals, relationships and the recorded causes of recent events. |
| **Civilisations** | Culture, government, policies, economy (production, consumption, reserves, prices, trade), technology, diplomacy, settlements and history. Satisfaction, stability and diplomatic opinion all come with a breakdown of what drives them. |
| **Characters** | Every tracked inhabitant has personality, needs, skills, goals, relationships, memories and a life history. The detail view shows the live utility scores behind their current choice, plus a relationship graph. You can follow anyone. |
| **History** | A timeline you can filter by category, importance, civilisation and source. Each event records its cause, its trigger (an activity, memory or threshold crossing), the state it changed (before → after), a collapsible cause tree several levels back, and what followed. Events downstream of a creator intervention are marked. Old history is archived and loaded on demand. |
| **Discoveries** | The technology tree, showing which civilisation knows or is researching each technology, plus first-discovery credits, charted regions and the landmarks you have found. |
| **Creator Console** | Chart star systems, form planets, introduce civilisations, found settlements, shift climates, unleash droughts, grant technologies, invent new discoveries, broker or break treaties, and write historical events (golden ages, plagues, meteor strikes, coups). Destructive actions ask for confirmation. You can also leap forward a month, a year or a decade. |
| **Settings** | Graphics quality, optional procedural ambient sound (off by default; also a speaker button in the top bar), controls, notifications, autosave, progress while away, export/import, and starting a new universe from a seed. |

Keyboard: `1`–`7` switch sections, `Space` pauses or resumes, `+`/`-` change speed. In Explorer: `WASD` to move, `Shift` to run, `Space` to jump, drag to look (double-click captures the mouse), `E` to talk, `V` to toggle the camera, `M` for locations, `Esc` to close the dialogue.

## Architecture

```
src/
  sim/                 Pure TypeScript simulation, no rendering or React
    types.ts           Strongly typed, JSON-serialisable data model (World)
    rng.ts             Seeded PRNG; the simulation never calls Math.random
    generate/          Galaxy, stars, planets, regions, civilisations, people, chronicle
    systems/           economy, population, technology, politics, diplomacy,
                       environment, characters (utility AI), goals
                       thresholds (low-importance threshold-crossing events)
    engine.ts          Scheduler on an absolute 30-minute grid: agents, then daily/weekly/monthly systems
    interventions.ts   Creator actions; each is a causal root and is logged for replay
    world.ts           Event recording, cause registry, strict causality check, id index
    history.ts         Hot/archived history, monthly summaries, redirects, chunk bookkeeping
    host.ts            SimHost: ticking, commands, patch generation (shared by worker and fallback)
    worker.ts          Web Worker entry; protocol.ts holds the typed messages
    player.ts          Player actions (visit, chart, discover, talk) as sim commands
  persistence/         IndexedDB: 'saves' store + lazily read 'archive' store; validation, migration
  state/               Zustand UI store, SimClient (worker or main-thread fallback), history client
  cosmos/              Galaxy, system and planet rendering; procedural planet textures
  explorer/            Terrain, city and cloud-platform layouts, tiled LOD instancing, vegetation
                       and colliders, simulated people and ambient crowd, player, sky dome,
                       weather, minimap, dialogue (context + provider)
  audio/               Procedural WebAudio soundscape (optional)
  ui/                  Shell, pages, cause tree, post-processing, charts, shared components
tests/                 Vitest suites
scripts/               e2e.mjs (Playwright journeys), perf.mjs, fps-compare.mjs, soak.ts
```

### Simulation model

- **Time.** One sim year is 12 months of 30 days. The engine advances in 30-minute steps. Each agent re-plans only when its current activity ends. Economy, population, research, satisfaction and trade run daily. Migration runs weekly. Politics, diplomacy, expansion, emergent conditions and statistics run monthly. A per-call CPU budget lets fast-forward and offline catch-up run in chunks.
- **Speeds.** 1× is 10 sim-minutes per second, so a full day/night cycle takes 2.4 real minutes. 5× is one sim-week per second.
- **Population** is modelled two ways. Settlement populations (millions) evolve through births, deaths, housing, food and happiness. 400–800 named individuals are simulated in full: a foreground tier at full cadence and a background tier with longer activity blocks and weekly goal reviews, promoted to the foreground when they become notable. Everyone else appears in Explorer as an anonymous, non-clickable instanced crowd. Individuals feed the aggregate model: scientists' work adds research points with credit, merchants raise trade efficiency, engineers speed up infrastructure, and leaders choose policies.
- **Economy.** Each settlement produces food, materials, energy and goods according to its specialisation, its region's resources, the climate, technology, policy and energy supply. Consumption scales with population and rising living standards. Scarcity raises prices. Shortages become famines, which trigger policy responses and settlement retooling. Contacted civilisations trade surpluses into deficits.
- **Politics.** Satisfaction is a transparent sum of factors. Stability follows satisfaction and legitimacy. Terms end in elections, appointments or council choices, depending on government type. Rulers die and are succeeded. Sustained crises can end in revolution and a new form of government.
- **Diplomacy.** Opinion drifts toward a target built from cultural affinity, treaties, trade, leaders' temperaments and personal chemistry, border friction and incidents. Treaties form and break on their own. Civilisations on other worlds only meet once Radio Astronomy or Orbital Flight is discovered.
- **Characters** use utility AI. Every option (sleep, eat, work, study, socialise, leisure, create, explore, travel, mourn) is scored from needs, Big-Five personality, goals, time of day and circumstances, and the winning scores are stored for the UI. Agents build skills, earn and spend money, form friendships, rivalries and partnerships, have children, change careers, chart regions, create artworks, age and die. `scoreActivities()` is the single decision point, so an optional language-model "deliberation" step could later be added for notable characters. No LLM is used or claimed.
- **Causality.** Every recorded event of importance 2 or more cites earlier events, found through a bounded per-key cause registry (civilisation, planet, settlement, character, pair), or is explicitly marked as a root. Creator interventions are roots, and every event downstream of one carries `rootSource: 'creator'`. In development and tests a strict check throws on an uncaused important event.
- **Worker.** The simulation runs in a Web Worker. The UI holds a read-only snapshot updated by field-level patches; every mutation from the UI is a command (`sim.exec`). If workers are unavailable (or with `?sim=main`) the same SimHost runs on the main thread.
- **Determinism.** The same seed generates an identical universe, and the same inputs produce an identical simulation regardless of how time is split across calls; a run through the host equals a replay of its intervention log (covered by tests).

### Persistence

The world is stored in IndexedDB under an autosave key (every 30 s by default and whenever the tab is hidden). History older than three years is moved out of the save: milestones (importance 4–5) stay forever, importance 2–3 events go to archive chunks in a separate store that the History page loads on demand, and importance-1 events are compacted into monthly summaries whose ids redirect old links. A rotating backup copy is kept. On load the save is validated and repaired; saves from older versions are migrated. A damaged save is quarantined, the backup is tried, and if both fail you get a clear message with options to start a new universe or import one. When you return, time catches up at real-time speed, up to a configurable limit (30 days by default).

## Known limitations

- 400–800 individuals are simulated in full (capped at 800 universe-wide). Everyone else is aggregate population, plus an anonymous crowd in Explorer.
- High quality adds relief shading, shadows from all props and sky reflections, and costs about three times more per frame than medium in software rendering.
- Frame-rate targets have not been measured on a GPU. Development used software WebGL, which runs at 1–10 fps. Under software rendering the current build is 2–3× slower per frame at medium than the Phase 2 baseline, which drew a much emptier scene (see VISUAL_DIFF.md). Low quality renders at a 0.75 pixel ratio.
- Conversations are template text built from real state and recorded causes. A `DialogueProvider` interface allows an LLM to replace it, but none is included.
- Archived history loads on demand. A chunk that is still loading shows as "loading" in the History page for a moment.
- Background individuals act on a coarser schedule (activity blocks of 4 hours or more, weekly goal reviews).
- After 100 simulated years the save is 17.8 MB (11 MB at 50 years); see PHASE2_REPORT.md.
