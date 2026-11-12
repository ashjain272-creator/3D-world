# Visual diff: Phase 2 baseline → after

Baseline screenshots: `docs/screenshots/baseline/` (commit `0df42fd`, Step 0).
After screenshots: `docs/screenshots/after/` (end of Phase 2).
Side-by-side composites (baseline left, after right): `docs/screenshots/diff/`.

Both sets come from `scripts/e2e.mjs` at 1440×900 in headless Chromium with **SwiftShader (software WebGL, no GPU)**. Each run generates a new random universe, so the scenes show the same screen of different universes, not identical frames.

## Frame rate at medium quality

`node scripts/fps-compare.mjs medium http://localhost:4174/=baseline http://localhost:4173/=current`

Both builds were served side by side: the baseline from a worktree at `7527abe` (Step 0) and the current build. Each used seed `fps-compare-7`, medium quality, the simulation paused, and a 6 s `requestAnimationFrame` sample.

**Not run.** The script and a baseline build at `7527abe` are ready, but the comparison was not executed before delivery: the CPU was occupied by the 100-year soak.

Software rendering gives absolute numbers about two orders of magnitude below a real GPU, so only the ratio between builds means anything. So "no frame-rate regression on medium" is **unverified**. Known cost increases on medium: bloom and tone mapping, and a denser galaxy (42k stars). Known savings: LOD tiles and distance culling for buildings, vegetation and figures.

## Screen by screen

| # | Screen | Baseline problem (BASELINE.md) | After |
|---|---|---|---|
| 04 | galaxy | Core blown out to flat white; sparse, grainy stars; no dust lanes; overlapping labels | Denser star field (18k / 42k / 70k by quality) with dark dust lanes and coloured emission nebulae along the arms; the core has a soft halo instead of a white disc; sub-labels only on hover, so labels no longer pile up. Bloom (medium, high) and vignette (high) applied. |
| 05 | system | Star glow dominates; civ sub-label overlaps a neighbour; outer orbits under the side panel | Glow is tinted by star class and less dominant; civ sub-labels appear only on hover. Outer orbits still pass under the side panel (unchanged). |
| 08 / 09 | explorer arrival / moving | Empty green foreground, uniform white windows, orange fog band, few figures | The ambient crowd fills streets during the day (231 crowd + 101 simulated at 13:00 in the e2e run, screenshot `10b-capital-midday`). The sky dome and fog colours come from the planet type and star class, which removes the orange band. Windows keep the window shader near the camera and switch to a cheap emissive material far away. The `08` capture in this run still shows the loading veil: post-processing plus more geometry makes the first software-rendered frame slower, and the e2e now waits for the veil to clear before this shot. |
| 10 | dialogue | Haze washes out buildings; NPC label floats over the panel | Two new topics, "What do you remember most?" and "Why are things the way they are?", answered from memories and the causal history. The newest reply scrolls into view. |
| 11 | explorer night | Two NPC labels overlap; street edge lines glare as thick white bars | Street glow cut to 0.3 + 1.1 × night. A cyan ring marks simulated individuals so they read apart from the crowd. A second label is shown only when the two figures are more than 3.5 m apart. The `11` capture predates that last fix and still shows one overlap. |
| 13 | wilderness | Still on the loading veil (no frame within 6 s) | Renders: forest at night in rain, with trees, rocks and a lake. Trees and large rocks now have colliders. |
| 13b | cloud platform (new) | Gas and ice giants could not be visited | Floating hub and satellite decks joined by railed sky-bridges above an animated cloud sea. Towers, domes, a spire, an observatory and a skyport; crew walking the decks; the HUD reads "Floating outpost · gas giant". |
| 18 | event detail | No causes, no consequences, large empty area | Shows the trigger, root and creator badges, a collapsible cause tree up to 6 levels back (open to 5), and a "what followed" tree. The pictured event is a creator-charted region, so it is correctly a root with no prior cause. `18b-cause-chain` shows a simulated event with a 5-level chain. |
| 18b | cause chain (new) | — | Depth-5 chain from a 5.2-year world, with creator-origin tags where they apply. |
| 19 / 20 | discoveries / creator | "Following" widget overlaps content | Widget moved into the top bar. The `after` captures predate the final JSX fix and show it as a small chip at the bottom of the rail; it now renders in the header. |
| 21 / 22 | creator after / settings | Four toasts stack over a third of the page | At most two toasts, and only the two newest fresh events become toasts. |
| 24 | mobile | Follow widget over content; last tab label cut ("Cre…") | All eight tab labels fit (min-width 47 px, 9 px labels). The follow chip sat below the tab bar in this capture (same JSX issue as 19/20, since fixed). |

Unchanged screens (01–03, 06, 07, 12, 14–17, 23) differ only in universe content.

## Rendering changes behind the screenshots

- **LOD and culling.** `TiledInstances` groups instances into tiles with two detail levels and a culling distance. Buildings: near (window shader) up to 420 m (260 m on low), far (emissive box) up to 1400 m (700 m), then culled. Trunks 200/380 m, canopies 230/520 m, rocks 170/300 m (× 0.65 on low). Crowd figures are culled beyond 180 m (110 m on low) and named figures beyond 150 m.
- **Post-processing** (`@react-three/postprocessing` 2.16.3): high = bloom, ACES tone mapping, vignette, SMAA, and depth of field during the galaxy fly-in; medium = bloom and tone mapping; low = none.
- **Galaxy.** Smooth 1.25 s camera fly-in (smootherstep) before a system opens.
- **Sky.** Custom dome shader. Palettes by planet type, tinted by star class and blended by sun elevation on the planet's local clock. Fog uses the horizon colour, and hemisphere light uses the palette.
