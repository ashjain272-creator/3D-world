import { useEffect, useState } from 'react';
import { UniverseScene, type UniverseView } from '../../cosmos/UniverseScene';
import { hasSurface } from '../../sim/generate/cosmos';
import { ARCHITECTURE_LABEL } from '../../sim/data/society';
import type { Planet, Settlement, World } from '../../sim/types';
import { charactersIn, civPopulation, fmtPop, planetPopulation } from '../../sim/world';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useWorldVersion } from '../../state/store';
import { Icon } from '../components/Icons';
import { CharLink, CivLink, EventRow } from '../components/common';

function viewFromRoute(parts: string[]): UniverseView {
  const w = getWorld();
  if (parts[0] === 'system' && w.systems[parts[1]]) return { kind: 'system', id: parts[1] };
  if (parts[0] === 'planet' && w.planets[parts[1]]) return { kind: 'planet', id: parts[1], settlementId: parts[2] };
  return { kind: 'galaxy' };
}

export function UniversePage() {
  const route = useRoute();
  const version = useWorldVersion();
  const view = viewFromRoute(route.parts);
  const [region, setRegion] = useState<number | null>(null);
  const viewKey = view.kind === 'galaxy' ? 'g' : view.id;
  useEffect(() => setRegion(null), [viewKey]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        const w = getWorld();
        if (view.kind === 'planet') navigate(view.settlementId ? `universe/planet/${view.id}` : `universe/system/${w.planets[view.id].systemId}`);
        else if (view.kind === 'system') navigate('universe');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);
  const w = getWorld();
  return (
    <div className="canvas-wrap" data-testid="universe-page">
      <UniverseScene
        view={view}
        version={version}
        selectedRegion={region}
        onSelectSystem={(id) => navigate(`universe/system/${id}`)}
        onSelectPlanet={(id) => navigate(`universe/planet/${id}`)}
        onSelectRegion={(i) => {
          setRegion(i);
          if (view.kind === 'planet' && view.settlementId) navigate(`universe/planet/${view.id}`, true);
        }}
        onSelectSettlement={(id) => {
          setRegion(null);
          navigate(`universe/planet/${w.settlements[id].planetId}/${id}`);
        }}
      />
      {view.kind !== 'galaxy' && (
        <div className="view-switch">
          <button
            className="btn sm"
            onClick={() => (view.kind === 'planet' ? navigate(`universe/system/${w.planets[view.id].systemId}`) : navigate('universe'))}
          >
            <Icon.Back style={{ width: 14, height: 14 }} /> {view.kind === 'planet' ? w.systems[w.planets[view.id].systemId].name : 'Galaxy'}
          </button>
        </div>
      )}
      <div className="view-hint">
        <span>
          <kbd>drag</kbd> orbit
        </span>
        <span>
          <kbd>scroll</kbd> zoom
        </span>
        <span>
          <kbd>click</kbd> {view.kind === 'galaxy' ? 'a star to open its system' : view.kind === 'system' ? 'a planet to inspect it' : 'a region or settlement'}
        </span>
        {view.kind !== 'galaxy' && (
          <span>
            <kbd>esc</kbd> back
          </span>
        )}
      </div>
      <aside className="side panel" key={viewKey + (view.kind === 'planet' ? view.settlementId ?? region ?? '' : '')}>
        {view.kind === 'galaxy' && <GalaxyPanel w={w} />}
        {view.kind === 'system' && <SystemPanel w={w} id={view.id} />}
        {view.kind === 'planet' && <PlanetPanel w={w} id={view.id} settlementId={view.settlementId} region={region} />}
      </aside>
    </div>
  );
}

function GalaxyPanel({ w }: { w: World }) {
  const systems = Object.values(w.systems);
  const civs = Object.values(w.civs);
  const pop = civs.reduce((a, c) => a + civPopulation(w, c), 0);
  const recent = [...w.events].reverse().filter((e) => e.importance >= 3).slice(0, 6);
  return (
    <>
      <div className="side-head">
        <div className="eyebrow">Galaxy</div>
        <h2>{w.galaxy.name}</h2>
        <div className="muted" style={{ fontSize: 12 }}>
          Seed <span className="mono">{w.seed}</span> · {w.galaxy.arms}-armed spiral
        </div>
      </div>
      <div className="side-body">
        <div className="statrow" style={{ margin: '0 -20px', gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="stat">
            <span className="label">Systems</span>
            <span className="value">{systems.length}</span>
          </div>
          <div className="stat">
            <span className="label">Civilisations</span>
            <span className="value">{civs.length}</span>
          </div>
          <div className="stat">
            <span className="label">Population</span>
            <span className="value">{fmtPop(pop)}</span>
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Charted systems</h3>
          </div>
          <div className="list" style={{ margin: '0 -12px' }}>
            {systems.map((s) => {
              const inhabited = s.planetIds.some((p) => w.planets[p].civIds.length);
              return (
                <div key={s.id} className="row" onClick={() => navigate(`universe/system/${s.id}`)}>
                  <span className="dot" style={{ background: s.star.color, boxShadow: `0 0 8px ${s.star.color}` }} />
                  <div className="grow">
                    <div className="title">{s.name}</div>
                    <div className="sub">
                      {s.star.spectralClass}-class · {s.planetIds.length} planets{inhabited ? ' · inhabited' : ''}
                    </div>
                  </div>
                  <Icon.Arrow style={{ width: 14, height: 14, color: 'var(--muted)' }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Civilisations</h3>
          </div>
          <div className="list" style={{ margin: '0 -12px' }}>
            {civs.map((c) => (
              <div key={c.id} className="row" onClick={() => navigate(`civilizations/${c.id}`)}>
                <span className="dot" style={{ background: c.color }} />
                <div className="grow">
                  <div className="title">{c.name}</div>
                  <div className="sub">
                    {c.government.type} · {fmtPop(civPopulation(w, c))} · {w.planets[c.homeworldId].name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Recent developments</h3>
            <button className="link" onClick={() => navigate('history')} style={{ fontSize: 12 }}>
              Timeline
            </button>
          </div>
          <div className="list" style={{ margin: '0 -12px' }}>
            {recent.map((e) => (
              <EventRow key={e.id} e={e} compact />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function SystemPanel({ w, id }: { w: World; id: string }) {
  const s = w.systems[id];
  const planets = s.planetIds.map((p) => w.planets[p]).sort((a, b) => a.orbit - b.orbit);
  return (
    <>
      <div className="side-head">
        <div className="eyebrow">Star system</div>
        <h2>{s.name}</h2>
        <div className="muted" style={{ fontSize: 12 }}>
          {s.origin === 'discovered' ? 'Charted by the Creator' : 'Charted at Genesis'}
        </div>
      </div>
      <div className="side-body">
        <dl className="kv">
          <dt>Classification</dt>
          <dd>
            <span className="dot" style={{ background: s.star.color, marginRight: 6 }} />
            {s.star.spectralClass}-type main sequence
          </dd>
          <dt>Temperature</dt>
          <dd className="mono">{s.star.temperature.toLocaleString()} K</dd>
          <dt>Radius</dt>
          <dd className="mono">{s.star.radius} R☉</dd>
          <dt>Mass</dt>
          <dd className="mono">{s.star.mass} M☉</dd>
          <dt>Luminosity</dt>
          <dd className="mono">{s.star.luminosity} L☉</dd>
          <dt>Age</dt>
          <dd className="mono">{s.star.age} billion years</dd>
          <dt>Location</dt>
          <dd className="mono">
            {Math.round(s.position[0])}, {Math.round(s.position[2])} ly
          </dd>
        </dl>
        <div className="section">
          <div className="section-title">
            <h3>Planets</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {planets.length}
            </span>
          </div>
          <div className="list" style={{ margin: '0 -12px' }}>
            {planets.map((p) => (
              <PlanetRow key={p.id} p={p} w={w} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const TYPE_LABEL: Record<Planet['type'], string> = {
  terran: 'Terran',
  ocean: 'Ocean world',
  desert: 'Desert world',
  arctic: 'Arctic world',
  jungle: 'Jungle world',
  volcanic: 'Volcanic',
  barren: 'Barren rock',
  gas_giant: 'Gas giant',
  ice_giant: 'Ice giant',
};

export function planetTypeLabel(t: Planet['type']): string {
  return TYPE_LABEL[t];
}

function PlanetRow({ p, w }: { p: Planet; w: World }) {
  return (
    <div className="row" onClick={() => navigate(`universe/planet/${p.id}`)}>
      <span className="dot" style={{ background: p.palette.mid, width: 10, height: 10 }} />
      <div className="grow">
        <div className="title">{p.name}</div>
        <div className="sub">
          {TYPE_LABEL[p.type]} · {p.orbit} AU{p.civIds.length ? ` · ${fmtPop(planetPopulation(w, p))}` : ''}
        </div>
      </div>
      {p.civIds.map((c) => (
        <span key={c} className="dot" style={{ background: w.civs[c]?.color }} />
      ))}
    </div>
  );
}

function PlanetPanel({ w, id, settlementId, region }: { w: World; id: string; settlementId?: string; region: number | null }) {
  const p = w.planets[id];
  const s = settlementId ? w.settlements[settlementId] : undefined;
  if (s) return <SettlementPanel w={w} s={s} />;
  if (region !== null && p.regions[region]) return <RegionPanel w={w} p={p} index={region} />;
  const settlements = Object.values(w.settlements).filter((x) => x.planetId === p.id);
  const history = [...w.events].reverse().filter((e) => e.planetId === p.id && e.importance >= 2).slice(0, 8);
  const surface = hasSurface(p.type);
  return (
    <>
      <div className="side-head">
        <div className="eyebrow">{TYPE_LABEL[p.type]}</div>
        <h2>{p.name}</h2>
        <div className="muted" style={{ fontSize: 12 }}>
          Orbiting {w.systems[p.systemId].name} at {p.orbit} AU · {p.orbitalPeriodDays}-day year
        </div>
      </div>
      <div className="side-body">
        <dl className="kv">
          <dt>Climate</dt>
          <dd>{p.climate}</dd>
          <dt>Terrain</dt>
          <dd>{p.terrain}</dd>
          <dt>Temperature</dt>
          <dd className="mono">
            {p.baseTemperature + p.environment.temperatureOffset}°C
            {p.environment.temperatureOffset !== 0 && <span className="warn"> ({p.environment.temperatureOffset > 0 ? '+' : ''}{p.environment.temperatureOffset})</span>}
          </dd>
          <dt>Gravity</dt>
          <dd className="mono">{p.gravity} g</dd>
          <dt>Atmosphere</dt>
          <dd>
            {p.atmosphere.composition}, <span className="mono">{p.atmosphere.pressure}</span> atm{p.atmosphere.breathable ? ' · breathable' : ''}
          </dd>
          <dt>Radius</dt>
          <dd className="mono">{p.radius} R⊕</dd>
          <dt>Habitability</dt>
          <dd className="mono">{Math.round(p.habitability * 100)}%</dd>
          <dt>Moons</dt>
          <dd>{p.moons.length ? p.moons.map((m) => m.name).join(', ') : 'none'}</dd>
          <dt>Population</dt>
          <dd className="mono">{fmtPop(planetPopulation(w, p))}</dd>
          {p.environment.disturbance && (
            <>
              <dt>Condition</dt>
              <dd className="warn">
                {p.environment.disturbance} ({p.environment.disturbanceDays} days left)
              </dd>
            </>
          )}
        </dl>
        <div className="section">
          <div className="section-title">
            <h3>Resources</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
            {(Object.keys(p.resources) as (keyof Planet['resources'])[]).map((k) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="muted" style={{ fontSize: 10.5, textTransform: 'capitalize' }}>
                  {k}
                </span>
                <div className="bar">
                  <i style={{ width: `${p.resources[k] * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {p.civIds.length > 0 && (
          <div className="section">
            <div className="section-title">
              <h3>Civilisations</h3>
            </div>
            {p.civIds.map((c) => (
              <div key={c} style={{ marginBottom: 6 }}>
                <CivLink id={c} /> <span className="muted">· {p.regions.filter((r) => r.ownerCivId === c).length} regions</span>
              </div>
            ))}
          </div>
        )}
        {surface && (
          <div className="section">
            <div className="section-title">
              <h3>Settlements</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                click the globe to inspect regions
              </span>
            </div>
            <div className="list" style={{ margin: '0 -12px' }}>
              {settlements.map((s) => (
                <div key={s.id} className="row" onClick={() => navigate(`universe/planet/${p.id}/${s.id}`)}>
                  <span className="dot" style={{ background: w.civs[s.civId]?.color }} />
                  <div className="grow">
                    <div className="title">{s.name}</div>
                    <div className="sub">
                      {s.kind} · {fmtPop(s.population)} · {p.regions[s.regionIndex].name}
                    </div>
                  </div>
                </div>
              ))}
              {!settlements.length && <div className="muted" style={{ padding: '6px 12px' }}>Uninhabited. Its regions await explorers.</div>}
            </div>
            {!settlements.length && (
              <button className="btn accent" style={{ marginTop: 10, width: '100%' }} onClick={() => navigate(`explorer/${p.id}/${bestRegion(p)}`)}>
                <Icon.Explorer style={{ width: 16, height: 16 }} /> Explore the surface
              </button>
            )}
          </div>
        )}
        {history.length > 0 && (
          <div className="section">
            <div className="section-title">
              <h3>Planetary history</h3>
            </div>
            <div className="list" style={{ margin: '0 -12px' }}>
              {history.map((e) => (
                <EventRow key={e.id} e={e} compact />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function bestRegion(p: Planet): number {
  return [...p.regions].filter((r) => r.biome !== 'ocean').sort((a, b) => b.fertility - a.fertility)[0]?.index ?? 0;
}

function RegionPanel({ w, p, index }: { w: World; p: Planet; index: number }) {
  const r = p.regions[index];
  const s = Object.values(w.settlements).find((x) => x.planetId === p.id && x.regionIndex === index);
  return (
    <>
      <div className="side-head">
        <div className="eyebrow">Region of {p.name}</div>
        <h2>{r.name}</h2>
        <div className="muted" style={{ fontSize: 12, textTransform: 'capitalize' }}>
          {r.biome} · {r.explored ? 'charted' : 'uncharted'}
        </div>
      </div>
      <div className="side-body">
        <dl className="kv">
          <dt>Controlled by</dt>
          <dd>{r.ownerCivId ? <CivLink id={r.ownerCivId} /> : <span className="muted">Unclaimed wilderness</span>}</dd>
          <dt>Fertility</dt>
          <dd className="mono">{Math.round(r.fertility * 100)}%</dd>
          <dt>Metals</dt>
          <dd className="mono">{Math.round(r.resources.metals * 100)}%</dd>
          <dt>Energy</dt>
          <dd className="mono">{Math.round(r.resources.energy * 100)}%</dd>
          <dt>Settlement</dt>
          <dd>{s ? <button className="link" onClick={() => navigate(`universe/planet/${p.id}/${s.id}`)}>{s.name}</button> : <span className="muted">none</span>}</dd>
          <dt>Neighbours</dt>
          <dd>{r.neighbors.map((n) => p.regions[n].name).join(', ')}</dd>
        </dl>
        <button className="btn primary" style={{ marginTop: 18, width: '100%' }} onClick={() => navigate(s ? `explorer/${s.id}` : `explorer/${p.id}/${index}`)} disabled={r.biome === 'ocean' && !s}>
          <Icon.Explorer style={{ width: 16, height: 16 }} /> {s ? `Enter ${s.name}` : r.biome === 'ocean' ? 'Open ocean — no landing site' : 'Explore this region'}
        </button>
      </div>
    </>
  );
}

function SettlementPanel({ w, s }: { w: World; s: Settlement }) {
  const p = w.planets[s.planetId];
  const civ = w.civs[s.civId];
  const people = charactersIn(w, s.id);
  const history = [...w.events].reverse().filter((e) => e.settlementId === s.id).slice(0, 6);
  return (
    <>
      <div className="side-head">
        <div className="eyebrow" style={{ color: civ.color }}>
          {s.kind} of the {civ.name}
        </div>
        <h2>{s.name}</h2>
        <div className="muted" style={{ fontSize: 12 }}>
          {p.regions[s.regionIndex].name}, {p.name}
        </div>
      </div>
      <div className="side-body">
        <button className="btn primary lg" style={{ width: '100%', marginBottom: 16 }} onClick={() => navigate(`explorer/${s.id}`)} data-testid="enter-explorer">
          <Icon.Explorer style={{ width: 16, height: 16 }} /> Enter {s.name} in Explorer
        </button>
        <dl className="kv">
          <dt>Population</dt>
          <dd className="mono">{Math.round(s.population).toLocaleString()}</dd>
          <dt>Housing</dt>
          <dd className="mono">{Math.round((s.population / s.capacity) * 100)}% of capacity</dd>
          <dt>Economy</dt>
          <dd style={{ textTransform: 'capitalize' }}>{s.specialization}</dd>
          <dt>Infrastructure</dt>
          <dd className="mono">{s.infrastructure.toFixed(1)} / 10</dd>
          <dt>Employment</dt>
          <dd className="mono">{Math.round(s.employment * 100)}%</dd>
          <dt>Happiness</dt>
          <dd className="mono">{Math.round(s.happiness)}</dd>
          <dt>Architecture</dt>
          <dd>{ARCHITECTURE_LABEL[s.style]}</dd>
          <dt>Landmarks</dt>
          <dd>{s.landmarks.map((l) => l.name).join(', ')}</dd>
        </dl>
        <div className="section">
          <div className="section-title">
            <h3>Inhabitants</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {people.length} tracked individuals
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {people.slice(0, 12).map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                <CharLink id={c.id} />
                <span className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.activity.description}
                </span>
              </div>
            ))}
          </div>
        </div>
        {history.length > 0 && (
          <div className="section">
            <div className="section-title">
              <h3>Local history</h3>
            </div>
            <div className="list" style={{ margin: '0 -12px' }}>
              {history.map((e) => (
                <EventRow key={e.id} e={e} compact />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
