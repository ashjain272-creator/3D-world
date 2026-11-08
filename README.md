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
npm test             # Vitest suite (47 tests)
node scripts/e2e.mjs http://localhost:4173/ screenshots   # browser journeys + screenshots (needs a running preview)
```

## What's inside

| Section | What you can do |
|---|---|
| **Universe** | Spiral galaxy map → star systems with orbiting planets → rotating planet globes with territories, settlements and clickable regions. Any settlement or wild region can be entered in Explorer. |
| **Explorer** | Third-/first-person 3D exploration. Procedural terrain and vegetation. Cities in three architectural styles (luminous futuristic towers, organic domes and tree-houses, stone-and-timber frontier towns). Landmarks to discover. Inhabitants who walk to work, meet friends and go home to sleep according to the simulation. Day/night cycle, planet-specific skies, weather, a minimap, and conversations generated from each person's real state. |
| **Civilisations** | Culture, government, policies, economy (production, consumption, reserves, prices, trade), technology, diplomacy, settlements and history. Satisfaction, stability and diplomatic opinion all come with a breakdown of what drives them. |
| **Characters** | Every tracked inhabitant has personality, needs, skills, goals, relationships, memories and a life history. The detail view shows the live utility scores behind their current choice, plus a relationship graph. You can follow anyone. |
| **History** | A timeline you can filter by category, importance, civilisation and source. Each event records its cause, the earlier events that led to it, the state it changed (before → after), and the later events that cite it. |
| **Discoveries** | The technology tree, showing which civilisation knows or is researching each technology, plus first-discovery credits, charted regions and the landmarks you have found. |
| **Creator Console** | Chart star systems, form planets, introduce civilisations, found settlements, shift climates, unleash droughts, grant technologies, invent new discoveries, broker or break treaties, and write historical events (golden ages, plagues, meteor strikes, coups). Destructive actions ask for confirmation. You can also leap forward a month, a year or a decade. |
| **Settings** | Graphics quality, controls, notifications, autosave, progress while away, export/import, and starting a new universe from a seed. |

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
    engine.ts          Scheduler: event-driven agents, then daily/weekly/monthly systems
    interventions.ts   Creator actions; each one changes state and records history
    world.ts           Event recording with causal back-links, helpers
  persistence/         IndexedDB save/load, validation, migration, backup recovery
  state/               Zustand UI store, real-time runner, boot/offline catch-up, router
  cosmos/              Galaxy, system and planet rendering; procedural planet textures
  explorer/            Terrain, city layouts, instanced buildings, people, player,
                       sky/weather, minimap, dialogue
  ui/                  Shell, pages, charts and shared components
tests/                 Vitest suites
scripts/e2e.mjs        Playwright end-to-end journeys
```

### Simulation model

- **Time.** One sim year is 12 months of 30 days. The engine advances in 30-minute steps. Each agent re-plans only when its current activity ends. Economy, population, research, satisfaction and trade run daily. Migration runs weekly. Politics, diplomacy, expansion, emergent conditions and statistics run monthly. A per-call CPU budget lets fast-forward and offline catch-up run in chunks.
- **Speeds.** 1× is 10 sim-minutes per second, so a full day/night cycle takes 2.4 real minutes. 5× is one sim-week per second.
- **Population** is modelled two ways. Settlement populations (millions) evolve through births, deaths, housing, food and happiness. Around 110–170 named individuals are simulated in full. Individuals feed the aggregate model: scientists' work adds research points with credit, merchants raise trade efficiency, engineers speed up infrastructure, and leaders choose policies.
- **Economy.** Each settlement produces food, materials, energy and goods according to its specialisation, its region's resources, the climate, technology, policy and energy supply. Consumption scales with population and rising living standards. Scarcity raises prices. Shortages become famines, which trigger policy responses and settlement retooling. Contacted civilisations trade surpluses into deficits.
- **Politics.** Satisfaction is a transparent sum of factors. Stability follows satisfaction and legitimacy. Terms end in elections, appointments or council choices, depending on government type. Rulers die and are succeeded. Sustained crises can end in revolution and a new form of government.
- **Diplomacy.** Opinion drifts toward a target built from cultural affinity, treaties, trade, leaders' temperaments and personal chemistry, border friction and incidents. Treaties form and break on their own. Civilisations on other worlds only meet once Radio Astronomy or Orbital Flight is discovered.
- **Characters** use utility AI. Every option (sleep, eat, work, study, socialise, leisure, create, explore, travel, mourn) is scored from needs, Big-Five personality, goals, time of day and circumstances, and the winning scores are stored for the UI. Agents build skills, earn and spend money, form friendships, rivalries and partnerships, have children, change careers, chart regions, create artworks, age and die. `scoreActivities()` is the single decision point, so an optional language-model "deliberation" step could later be added for notable characters. No LLM is used or claimed.
- **Determinism.** The same seed generates an identical universe, and the same inputs produce an identical simulation (covered by tests).

### Persistence

The world is stored in IndexedDB under an autosave key (every 30 s by default and whenever the tab is hidden). A rotating backup copy is kept. On load the save is validated and repaired; saves from older versions are migrated. A damaged save is quarantined, the backup is tried, and if both fail you get a clear message with options to start a new universe or import one. When you return, time catches up at real-time speed, up to a configurable limit (30 days by default).

## Known limitations

- Hundreds of individuals are simulated in full, not every inhabitant. Aggregate populations cover the rest.
- Explorer collision covers buildings and landmarks only, not trees or rocks. Inhabitants follow street graphs and do not avoid each other.
- Conversations are assembled from templates filled with real state. They are not free-form.
- Gas and ice giants have no explorable surface.
- Planets share a 24-hour day for the time-of-day cycle.
- The simulation runs on the main thread with time budgets. A Web Worker would scale better to much larger worlds.
- There are no audio or post-processing effects (bloom, SSAO), to keep the app light on ordinary laptops.
