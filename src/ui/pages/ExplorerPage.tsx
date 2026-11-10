import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExplorerScene } from '../../explorer/ExplorerScene';
import { Minimap } from '../../explorer/Minimap';
import { TOPICS, respond, type Topic } from '../../explorer/dialogue';
import { playerState, useExplorer } from '../../explorer/explorerStore';
import { buildColliderGrid, generateLayout, settlementRadius, wildLayout } from '../../explorer/layout';
import { generateVegetation } from '../../explorer/vegetation';
import { generateCloudCity } from '../../explorer/cloudCity';
import { generateTerrain } from '../../explorer/terrain';
import { OCC_COLORS } from '../../explorer/People';
import { hasSurface } from '../../sim/generate/cosmos';
import { OCCUPATIONS } from '../../sim/data/society';
import { formatDate, localHour } from '../../sim/time';
import type { Planet, Settlement } from '../../sim/types';
import { ageOf, fmtPop, fullName } from '../../sim/world';
import { sim } from '../../state/runner';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useApp, useWorldVersion } from '../../state/store';
import { Icon } from '../components/Icons';
import { moodLabel } from '../components/common';

interface Target {
  planet: Planet;
  settlement?: Settlement;
  regionIndex: number;
  key: string;
  /** Gas or ice giant: visit the floating platforms in the cloud deck. */
  cloud?: boolean;
}

function resolveTarget(parts: string[]): Target | null {
  const w = getWorld();
  if (parts[0] && w.settlements[parts[0]]) {
    const s = w.settlements[parts[0]];
    return { planet: w.planets[s.planetId], settlement: s, regionIndex: s.regionIndex, key: s.id };
  }
  if (parts[0] && w.planets[parts[0]] && hasSurface(w.planets[parts[0]].type)) {
    const p = w.planets[parts[0]];
    const ri = Math.max(0, Math.min(p.regions.length - 1, Number(parts[1] ?? 0) || 0));
    const s = Object.values(w.settlements).find((x) => x.planetId === p.id && x.regionIndex === ri);
    if (s) return { planet: p, settlement: s, regionIndex: ri, key: s.id };
    return { planet: p, regionIndex: ri, key: `${p.id}:${ri}` };
  }
  if (parts[0] && w.planets[parts[0]]) {
    const p = w.planets[parts[0]];
    return { planet: p, regionIndex: 0, key: `${p.id}:cloud`, cloud: true };
  }
  return null;
}

export function ExplorerPage() {
  const route = useRoute();
  useEffect(() => {
    if (!resolveTarget(route.parts)) {
      const w = getWorld();
      const last = w.player.visitedSettlementIds[w.player.visitedSettlementIds.length - 1];
      const civ = Object.values(w.civs)[0];
      const id = last && w.settlements[last] ? last : civ?.settlementIds[0];
      if (id) navigate(`explorer/${id}`, true);
    }
  }, [route.parts]);
  const target = resolveTarget(route.parts);
  if (!target) return <div className="loading-veil"><div className="spinner" /></div>;
  return <Explorer target={target} key={target.key} />;
}

function Explorer({ target }: { target: Target }) {
  const w = getWorld();
  const { planet, settlement, regionIndex } = target;
  const cloudCity = useMemo(() => (target.cloud ? generateCloudCity(planet) : null), [target.cloud, planet]);
  const region = planet.regions[regionIndex] ?? { index: 0, name: 'Upper cloud deck', biome: 'tundra' as const, explored: true, ownerCivId: undefined };
  const system = w.systems[planet.systemId];
  const civ = settlement ? w.civs[settlement.civId] : region.ownerCivId ? w.civs[region.ownerCivId] : undefined;
  const civColor = civ?.color ?? '#6fd6ff';
  const terrain = useMemo(() => cloudCity?.terrain ?? generateTerrain(planet, regionIndex, region.biome, settlement ? settlementRadius(settlement) + 20 : 0), [cloudCity, planet, regionIndex, region.biome, settlement]);
  const layout = useMemo(() => cloudCity?.layout ?? (settlement ? generateLayout(settlement) : wildLayout(planet.id, regionIndex, terrain.seed, region.name)), [cloudCity, settlement, planet.id, regionIndex, terrain.seed, region.name]);
  const quality = useApp((s) => s.settings.quality);
  const vegetation = useMemo(() => generateVegetation(terrain, layout, quality), [terrain, layout, quality]);
  // buildings, landmarks, tree trunks and large rocks all block movement
  const colliders = useMemo(() => buildColliderGrid([...layout.colliders, ...vegetation.colliders]), [layout, vegetation]);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState(false);
  const toast = useApp((s) => s.toast);
  const nearbyId = useExplorer((s) => s.nearbyId);
  const talkingId = useExplorer((s) => s.talkingId);
  const setTalking = useExplorer((s) => s.setTalking);
  const locked = useExplorer((s) => s.locked);
  const [discovered, setDiscovered] = useState<string[]>(() => [...w.player.discoveredLandmarkIds]);

  useEffect(() => {
    // fallback in case the renderer is slow to report its first frames
    const id = window.setTimeout(() => setReady(true), 4000);
    return () => window.clearTimeout(id);
  }, []);

  // Arrival: record visit; charting an unexplored wilderness is a real event.
  useEffect(() => {
    if (settlement) void sim.exec({ type: 'player', action: { type: 'visit', settlementId: settlement.id } });
    if (!settlement && !region.explored)
      void sim.exec({ type: 'player', action: { type: 'chart', planetId: planet.id, regionIndex } }).then((r) => {
        if ('toast' in r && r.toast) toast({ kind: 'success', ...r.toast });
      });
    sim.subscribeFeed(settlement?.id ?? null);
    return () => {
      sim.subscribeFeed(null);
      setTalking(null);
      useExplorer.getState().setNearby(null);
    };
  }, [settlement, region, regionIndex, planet, toast, setTalking]);

  // Landmark discovery by proximity.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const iv = window.setInterval(() => {
      const world = getWorld();
      for (const l of layout.landmarks) {
        if (world.player.discoveredLandmarkIds.includes(l.id) || requested.current.has(l.id)) continue;
        if (Math.hypot(playerState.x - l.x, playerState.z - l.z) < l.radius + 20) {
          requested.current.add(l.id);
          setDiscovered((d) => [...d, l.id]);
          void sim
            .exec({
              type: 'player',
              action: { type: 'discover', landmarkId: l.id, name: l.name, description: l.description, planetId: planet.id, settlementId: settlement?.id, civId: civ?.id, place: settlement ? settlement.name : `${region.name}, ${planet.name}` },
            })
            .then((r) => {
              if ('toast' in r && r.toast) toast({ kind: 'success', ...r.toast });
            });
        }
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [layout, settlement, region, planet, civ, toast]);

  const interact = useCallback(() => {
    const st = useExplorer.getState();
    if (st.talkingId) {
      st.setTalking(null);
      return;
    }
    if (st.nearbyId) {
      if (document.pointerLockElement) document.exitPointerLock();
      st.setTalking(st.nearbyId);
    }
  }, []);
  const pick = useCallback((id: string) => {
    if (!getWorld().characters[id]) return;
    if (document.pointerLockElement) document.exitPointerLock();
    useExplorer.getState().setTalking(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && useExplorer.getState().talkingId) setTalking(null);
      if (e.code === 'KeyM' && !useExplorer.getState().talkingId) setPicker((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTalking]);

  return (
    <div className="canvas-wrap" data-testid="explorer-page">
      <ExplorerScene planet={planet} system={system} settlement={settlement} terrain={terrain} layout={layout} vegetation={vegetation} colliders={colliders} civColor={civColor} cloud={cloudCity ?? undefined} locationKey={target.key} onInteract={interact} onPick={pick} onReady={() => setReady(true)} />
      <div className="loading-veil" style={{ opacity: ready ? 0 : 1, pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow">Descending to</div>
          <div style={{ fontSize: 22, marginTop: 6 }}>{settlement?.name ?? region.name}</div>
        </div>
      </div>
      <LocationCard planet={planet} settlement={settlement} regionName={region.name} civName={civ?.name} civColor={civColor} />
      <div className="hud-tr">
        <Minimap t={terrain} layout={layout} discovered={discovered} civColor={civColor} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="btn sm" onClick={() => setPicker((v) => !v)} data-testid="locations-btn">
            Locations <span className="muted mono">M</span>
          </button>
          <button className="btn sm" onClick={() => navigate(settlement ? `universe/planet/${planet.id}/${settlement.id}` : `universe/planet/${planet.id}`)}>
            <Icon.Universe style={{ width: 14, height: 14 }} /> Observe
          </button>
        </div>
      </div>
      {picker && <LocationPicker current={target.key} onClose={() => setPicker(false)} planetId={planet.id} />}
      {!talkingId && nearbyId && <InteractPrompt id={nearbyId} />}
      {talkingId && <DialoguePanel id={talkingId} onClose={() => setTalking(null)} />}
      <div className="hud-help">
        <span>
          <kbd>WASD</kbd> move
        </span>
        <span>
          <kbd>Shift</kbd> run
        </span>
        <span>
          <kbd>Space</kbd> jump
        </span>
        <span>
          <kbd>drag</kbd> look{locked ? ' (captured — Esc to release)' : ' · double-click to capture'}
        </span>
        <span>
          <kbd>E</kbd> talk
        </span>
        <span>
          <kbd>V</kbd> camera
        </span>
      </div>
    </div>
  );
}

function LocationCard({ planet, settlement, regionName, civName, civColor }: { planet: Planet; settlement?: Settlement; regionName: string; civName?: string; civColor: string }) {
  useWorldVersion();
  const w = getWorld();
  const h = localHour(w.time, planet.dayLengthHours);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const env = w.planets[planet.id].environment;
  const period = h < 5 ? 'Night' : h < 7 ? 'Dawn' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 20 ? 'Evening' : 'Night';
  return (
    <div className="hud-tl panel">
      <div className="eyebrow" style={{ color: civColor }}>
        {settlement ? `${settlement.kind} · ${civName}` : civName ? `Territory of the ${civName}` : 'Unclaimed wilderness'}
      </div>
      <div className="hud-title">{settlement?.name ?? regionName}</div>
      <div className="muted" style={{ fontSize: 12 }}>
        {settlement ? `${regionName} · ` : ''}
        {planet.name} · {settlement ? `${fmtPop(settlement.population)} inhabitants` : planet.climate}
      </div>
      <div className="hud-meta mono">
        <span title={`Local time on ${planet.name} (a ${planet.dayLengthHours}-hour day)`}>
          {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')} {period} · {planet.dayLengthHours}h day
        </span>
        <span style={{ textTransform: 'capitalize' }}>{env.weather}</span>
        <span>{planet.baseTemperature + env.temperatureOffset}°C</span>
        <span>{formatDate(w.time, w.epochYear)}</span>
      </div>
    </div>
  );
}

function InteractPrompt({ id }: { id: string }) {
  const c = getWorld().characters[id];
  if (!c) return null;
  return (
    <div className="hud-prompt panel" data-testid="interact-prompt">
      <kbd>E</kbd>
      <span>
        Talk to <b>{c.givenName}</b> <span className="muted">· {OCCUPATIONS[c.occupation].label}</span>
      </span>
    </div>
  );
}

function DialoguePanel({ id, onClose }: { id: string; onClose: () => void }) {
  useWorldVersion();
  const w = getWorld();
  const c = w.characters[id];
  const [lines, setLines] = useState<{ who: 'you' | 'them'; text: string }[]>([]);
  const seed = useRef(0);
  const linesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // keep the newest reply in view
    const el = linesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  useEffect(() => {
    const world = getWorld();
    const ch = world.characters[id];
    if (!ch) return;
    void sim.exec({ type: 'player', action: { type: 'talk', characterId: ch.id } });
    setLines([{ who: 'them', text: respond(world, ch, 'greet', world.time) }]);
  }, [id]);
  if (!c) return null;
  const ask = (t: Topic, label: string) => {
    seed.current += 1;
    const text = respond(getWorld(), c, t, getWorld().time + seed.current);
    setLines((l) => [...l.slice(-8), { who: 'you', text: label }, { who: 'them', text }]);
    if (t === 'bye') setTimeout(onClose, 900);
  };
  const mood = moodLabel(c.mood);
  return (
    <div className="dialogue panel" data-testid="dialogue">
      <div className="dialogue-head">
        <span className="dot" style={{ background: OCC_COLORS[c.occupation], width: 10, height: 10 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{fullName(c)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {ageOf(c, w.time)} · {OCCUPATIONS[c.occupation].label} · <span className={mood.cls}>{mood.text}</span> · {c.activity.description}
          </div>
        </div>
        <button className="btn sm" onClick={() => navigate(`characters/${c.id}`)}>
          <Icon.Eye style={{ width: 14, height: 14 }} /> Inspect
        </button>
        <button className="btn sm ghost" onClick={onClose} aria-label="Close">
          <Icon.Close style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div className="dialogue-lines" ref={linesRef}>
        {lines.map((l, i) => (
          <div key={i} className={`dl ${l.who}`}>
            {l.text}
          </div>
        ))}
      </div>
      <div className="dialogue-options">
        {TOPICS.map((t) => (
          <button key={t.id} className="btn sm" onClick={() => ask(t.id, t.label)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LocationPicker({ current, onClose, planetId }: { current: string; onClose: () => void; planetId: string }) {
  const w = getWorld();
  const [pid, setPid] = useState(planetId);
  const planets = Object.values(w.planets).filter((p) => hasSurface(p.type) || p.type === 'gas_giant' || p.type === 'ice_giant');
  const p = w.planets[pid];
  const settlements = Object.values(w.settlements).filter((s) => s.planetId === pid);
  return (
    <div className="picker panel" data-testid="location-picker">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="eyebrow">Travel to</div>
        <button className="btn sm ghost" onClick={onClose}>
          <Icon.Close style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <select className="input" value={pid} onChange={(e) => setPid(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
        {planets.map((pl) => (
          <option key={pl.id} value={pl.id}>
            {pl.name} — {w.systems[pl.systemId].name}
            {pl.civIds.length ? ' (inhabited)' : ''}
            {hasSurface(pl.type) ? '' : ' (cloud platforms)'}
          </option>
        ))}
      </select>
      <div className="list" style={{ maxHeight: 380, overflowY: 'auto', margin: '0 -12px' }}>
        {settlements.map((s) => (
          <div key={s.id} className={`row ${current === s.id ? 'active' : ''}`} onClick={() => navigate(`explorer/${s.id}`)}>
            <span className="dot" style={{ background: w.civs[s.civId]?.color }} />
            <div className="grow">
              <div className="title">{s.name}</div>
              <div className="sub">
                {s.kind} · {s.style} · {fmtPop(s.population)}
              </div>
            </div>
          </div>
        ))}
        {!hasSurface(p.type) && (
          <div className={`row ${current === `${p.id}:cloud` ? 'active' : ''}`} onClick={() => navigate(`explorer/${p.id}`)} data-testid="cloud-platform-row">
            <span className="dot" style={{ background: p.palette.atmosphere }} />
            <div className="grow">
              <div className="title">Cloud platforms</div>
              <div className="sub">Floating outpost in the upper atmosphere</div>
            </div>
          </div>
        )}
        {p.regions
          .filter((r) => r.biome !== 'ocean' && !settlements.some((s) => s.regionIndex === r.index))
          .map((r) => (
            <div key={r.index} className={`row ${current === `${p.id}:${r.index}` ? 'active' : ''}`} onClick={() => navigate(`explorer/${p.id}/${r.index}`)}>
              <span className="dot" style={{ background: 'transparent', border: '1px solid var(--muted)' }} />
              <div className="grow">
                <div className="title">{r.name}</div>
                <div className="sub" style={{ textTransform: 'capitalize' }}>
                  {r.biome} wilderness{r.explored ? '' : ' · uncharted'}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
