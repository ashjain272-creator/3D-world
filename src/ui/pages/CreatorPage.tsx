import { useState, type ReactNode } from 'react';
import { DISTURBANCE_LIST } from '../../sim/systems/environment';
import { GOVERNMENTS } from '../../sim/data/society';
import { hasSurface } from '../../sim/generate/cosmos';
import { HISTORICAL_EVENTS, techOptionsFor, type DiplomaticAction, type HistoricalEventKind, type InterventionKind, type InterventionResult } from '../../sim/interventions';
import type { ArchitectureStyle, GovernmentType, Planet, PlanetType, StarSystem, TechCategory } from '../../sim/types';
import { MINUTES_PER_DAY, SPEEDS } from '../../sim/time';
import { fullName } from '../../sim/world';
import { navigate } from '../../state/router';
import { getWorld, useApp, useWorldVersion } from '../../state/store';
import { sim } from '../../state/runner';
import { Confirm, EventRow } from '../components/common';

function useResult() {
  const [r, setR] = useState<InterventionResult | null>(null);
  const bump = useApp((s) => s.bump);
  const toast = useApp((s) => s.toast);
  const run = async (kind: InterventionKind, ...args: unknown[]) => {
    try {
      const res = (await sim.exec({ type: 'intervene', kind, args })) as InterventionResult;
      setR(res);
      bump();
      if (res.ok) {
        toast({ kind: 'success', title: 'Intervention applied', body: res.message, eventId: res.eventId });
        void sim.save();
      }
    } catch (e) {
      setR({ ok: false, message: (e as Error).message });
    }
  };
  return { r, run };
}

function Result({ r }: { r: InterventionResult | null }) {
  if (!r) return null;
  return (
    <div className={`result ${r.ok ? '' : 'err'}`}>
      {r.message}{' '}
      {r.eventId && (
        <button className="link" onClick={() => navigate(`history/${r.eventId}`)}>
          view in history
        </button>
      )}
    </div>
  );
}

function Tool({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="tool">
      <h4>{title}</h4>
      <p>{desc}</p>
      {children}
    </div>
  );
}

const PLANET_TYPES: PlanetType[] = ['terran', 'ocean', 'desert', 'arctic', 'jungle', 'volcanic', 'barren', 'gas_giant', 'ice_giant'];

export function CreatorPage() {
  useWorldVersion();
  const w = getWorld();
  const civs = Object.values(w.civs);
  const systems = Object.values(w.systems);
  const surfacePlanets = Object.values(w.planets).filter((p) => hasSurface(p.type));
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);
  const log = [...w.events].reverse().filter((e) => e.source === 'creator').slice(0, 10);

  return (
    <div className="page" data-testid="creator-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Creator Console</div>
          <h1 className="page-title">Shape the universe</h1>
          <p className="page-sub">Every action changes real simulation state and is written into history. Consequences unfold on their own — a drought can become a famine, a famine can topple a government.</p>
        </div>
      </div>
      <div className="creator-grid">
        <SystemTool />
        <PlanetTool systems={systems} />
        <CivTool planets={surfacePlanets} />
        <SettlementTool />
        <EnvironmentTool planets={Object.values(w.planets)} />
        <TechTool />
        <DiscoveryTool />
        <DiplomacyTool />
        <HistoryTool onConfirm={setConfirm} />
        <GovernmentTool onConfirm={setConfirm} />
        <TimeTool />
        <Tool title="Follow & inspect" desc="Jump to any civilisation or person and keep an eye on them.">
          <div className="fields">
            <select className="input full" onChange={(e) => e.target.value && navigate(`civilizations/${e.target.value}`)} defaultValue="">
              <option value="" disabled>
                Inspect a civilisation…
              </option>
              {civs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input full"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                void sim.exec({ type: 'player', action: { type: 'follow', characterId: e.target.value } });
                navigate(`characters/${e.target.value}`);
              }}
            >
              <option value="" disabled>
                Follow a person…
              </option>
              {Object.values(w.characters)
                .filter((c) => c.alive && c.notable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c)} — {w.civs[c.civId]?.adjective}
                  </option>
                ))}
            </select>
          </div>
        </Tool>
      </div>
      <div className="section">
        <div className="section-title">
          <h3>Intervention log</h3>
        </div>
        {log.length ? (
          <div className="list" style={{ margin: '0 -12px' }}>
            {log.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <div className="muted">You have not intervened yet.</div>
        )}
      </div>
      {confirm && (
        <Confirm
          title={confirm.title}
          body={confirm.body}
          danger
          confirmLabel="Proceed"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function SystemTool() {
  const { r, run } = useResult();
  return (
    <Tool title="Discover a star system" desc="Chart a new star with its own planets somewhere along the spiral arms.">
      <button className="btn primary" onClick={() => run('discoverStarSystem')} data-testid="discover-system">
        Chart new system
      </button>
      <Result r={r} />
    </Tool>
  );
}

function PlanetTool({ systems }: { systems: StarSystem[] }) {
  const { r, run } = useResult();
  const [sys, setSys] = useState(systems[0]?.id ?? '');
  const [type, setType] = useState<PlanetType | 'auto'>('auto');
  return (
    <Tool title="Generate a planet" desc="Form a new world in any system. Habitable types are placed in the star's temperate zone.">
      <div className="fields">
        <select className="input" value={sys} onChange={(e) => setSys(e.target.value)}>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as PlanetType | 'auto')}>
          <option value="auto">Natural type</option>
          {PLANET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <button className="btn primary" onClick={() => run('createPlanet', sys, type === 'auto' ? undefined : type)} data-testid="create-planet">
        Create planet
      </button>
      <Result r={r} />
    </Tool>
  );
}

function CivTool({ planets }: { planets: Planet[] }) {
  const { r, run } = useResult();
  const free = planets.filter((p) => p.regions.some((x) => !x.ownerCivId && x.biome !== 'ocean')).sort((a, b) => b.habitability - a.habitability);
  const [pid, setPid] = useState(free.find((p) => !p.civIds.length)?.id ?? free[0]?.id ?? '');
  const [arch, setArch] = useState<ArchitectureStyle | 'auto'>('auto');
  const [gov, setGov] = useState<GovernmentType | 'auto'>('auto');
  return (
    <Tool title="Introduce a civilisation" desc="Seed a new people with their own culture, language, history and inhabitants.">
      <div className="fields">
        <select className="input full" value={pid} onChange={(e) => setPid(e.target.value)}>
          {free.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.type}){p.civIds.length ? ' — inhabited' : ''}
            </option>
          ))}
        </select>
        <select className="input" value={arch} onChange={(e) => setArch(e.target.value as ArchitectureStyle | 'auto')}>
          <option value="auto">Any architecture</option>
          <option value="futuristic">Futuristic</option>
          <option value="organic">Organic</option>
          <option value="frontier">Frontier</option>
        </select>
        <select className="input" value={gov} onChange={(e) => setGov(e.target.value as GovernmentType | 'auto')}>
          <option value="auto">Any government</option>
          {Object.keys(GOVERNMENTS).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <button className="btn primary" disabled={!pid} onClick={() => run('introduceCivilization', pid, { architecture: arch === 'auto' ? undefined : arch, government: gov === 'auto' ? undefined : gov })} data-testid="introduce-civ">
        Introduce civilisation
      </button>
      <Result r={r} />
      {r?.ok && r.createdId && (
        <button className="link" onClick={() => navigate(`civilizations/${r.createdId}`)} style={{ alignSelf: 'flex-start' }}>
          Inspect the new civilisation →
        </button>
      )}
    </Tool>
  );
}

function SettlementTool() {
  const { r, run } = useResult();
  const w = getWorld();
  const civs = Object.values(w.civs);
  const [civ, setCiv] = useState(civs[0]?.id ?? '');
  const planets = Object.values(w.planets).filter((p) => hasSurface(p.type));
  const [pid, setPid] = useState(civs[0]?.homeworldId ?? '');
  const p = w.planets[pid];
  const options = p ? p.regions.filter((x) => (!x.ownerCivId || x.ownerCivId === civ) && x.biome !== 'ocean' && !Object.values(w.settlements).some((s) => s.planetId === pid && s.regionIndex === x.index)).sort((a, b) => b.fertility - a.fertility) : [];
  const [ri, setRi] = useState<number>(-1);
  const region = options.find((x) => x.index === ri) ?? options[0];
  return (
    <Tool title="Found a settlement" desc="Send settlers from a civilisation's largest city to a new region — even on another world.">
      <div className="fields">
        <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)}>
          {civs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
          {planets.map((pl) => (
            <option key={pl.id} value={pl.id}>
              {pl.name}
            </option>
          ))}
        </select>
        <select className="input full" value={region?.index ?? -1} onChange={(e) => setRi(Number(e.target.value))}>
          {options.map((x) => (
            <option key={x.index} value={x.index}>
              {x.name} — {x.biome}, fertility {Math.round(x.fertility * 100)}%
            </option>
          ))}
          {!options.length && <option value={-1}>No free regions</option>}
        </select>
      </div>
      <button className="btn primary" disabled={!region} onClick={() => region && run('foundSettlement', civ, pid, region.index)}>
        Found settlement
      </button>
      <Result r={r} />
    </Tool>
  );
}

function EnvironmentTool({ planets }: { planets: Planet[] }) {
  const { r, run } = useResult();
  const [pid, setPid] = useState(planets.find((p) => p.civIds.length)?.id ?? planets[0]?.id ?? '');
  const [delta, setDelta] = useState(-4);
  const [dist, setDist] = useState(DISTURBANCE_LIST[0].name);
  const [res, setRes] = useState<'metals' | 'energy' | 'organics' | 'water' | 'exotics'>('metals');
  return (
    <Tool title="Change environmental conditions" desc="Shift a planet's climate, unleash a natural disturbance, or enrich its resources.">
      <select className="input" value={pid} onChange={(e) => setPid(e.target.value)}>
        {planets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.civIds.length ? ' (inhabited)' : ''}
          </option>
        ))}
      </select>
      <div className="fields">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} className="full">
          <input type="range" min={-12} max={12} value={delta} onChange={(e) => setDelta(Number(e.target.value))} style={{ flex: 1 }} />
          <span className="mono" style={{ width: 44 }}>
            {delta > 0 ? '+' : ''}
            {delta}°C
          </span>
          <button className="btn sm" disabled={!delta} onClick={() => run('changeEnvironment', pid, { kind: 'temperature', delta })}>
            Shift climate
          </button>
        </div>
        <select className="input" value={dist} onChange={(e) => setDist(e.target.value)}>
          {DISTURBANCE_LIST.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => run('changeEnvironment', pid, { kind: 'disturbance', name: dist })}>
          Unleash
        </button>
        <select className="input" value={res} onChange={(e) => setRes(e.target.value as typeof res)}>
          {['metals', 'energy', 'organics', 'water', 'exotics'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => run('changeEnvironment', pid, { kind: 'enrich', resource: res })}>
          Enrich
        </button>
        <button className="btn ghost full" onClick={() => run('changeEnvironment', pid, { kind: 'restore' })}>
          Restore natural climate
        </button>
      </div>
      <Result r={r} />
    </Tool>
  );
}

function TechTool() {
  const { r, run } = useResult();
  const w = getWorld();
  const civs = Object.values(w.civs);
  const [civ, setCiv] = useState(civs[0]?.id ?? '');
  const c = w.civs[civ];
  const options = c ? techOptionsFor(w, c) : [];
  const [tech, setTech] = useState('');
  const t = options.find((x) => x.id === tech) ?? options[0];
  return (
    <Tool title="Introduce a technology" desc="Gift knowledge to a civilisation (with any missing prerequisites). Its effects apply immediately.">
      <div className="fields">
        <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={t?.id ?? ''} onChange={(e) => setTech(e.target.value)}>
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              T{x.tier} · {x.name}
            </option>
          ))}
        </select>
      </div>
      <button className="btn primary" disabled={!t} onClick={() => t && run('grantTechnology', civ, t.id)}>
        Grant technology
      </button>
      <Result r={r} />
    </Tool>
  );
}

function DiscoveryTool() {
  const { r, run } = useResult();
  const civs = Object.values(getWorld().civs);
  const [civ, setCiv] = useState(civs[0]?.id ?? '');
  const [name, setName] = useState('Harmonic Resonance Theory');
  const [cat, setCat] = useState<TechCategory>('science');
  const [mag, setMag] = useState(1.5);
  return (
    <Tool title="Spark a scientific revolution" desc="Invent an entirely new discovery. Watch how each culture responds — embrace, imitation or backlash.">
      <div className="fields">
        <input className="input full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the discovery" />
        <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={cat} onChange={(e) => setCat(e.target.value as TechCategory)}>
          {['agriculture', 'industry', 'energy', 'society', 'medicine', 'space', 'science'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <div className="full" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Magnitude
          </span>
          <input type="range" min={0.5} max={3} step={0.1} value={mag} onChange={(e) => setMag(Number(e.target.value))} style={{ flex: 1 }} />
          <span className="mono">{mag.toFixed(1)}×</span>
        </div>
      </div>
      <button className="btn primary" onClick={() => run('introduceDiscovery', civ, { name, category: cat, magnitude: mag })} data-testid="introduce-discovery">
        Reveal discovery
      </button>
      <Result r={r} />
    </Tool>
  );
}

function DiplomacyTool() {
  const { r, run } = useResult();
  const civs = Object.values(getWorld().civs);
  const [a, setA] = useState(civs[0]?.id ?? '');
  const [b, setB] = useState(civs[1]?.id ?? '');
  const [act, setAct] = useState<DiplomaticAction>('summit');
  return (
    <Tool title="Initiate a diplomatic event" desc="Convene summits, provoke incidents, broker pacts or tear them up.">
      <div className="fields">
        <select className="input" value={a} onChange={(e) => setA(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={b} onChange={(e) => setB(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input full" value={act} onChange={(e) => setAct(e.target.value as DiplomaticAction)}>
          <option value="summit">Grand summit (+25 opinion)</option>
          <option value="trade">Broker a trade pact</option>
          <option value="alliance">Forge an alliance</option>
          <option value="incident">Provoke an incident (−30 opinion)</option>
          <option value="sever">Sever all treaties</option>
        </select>
      </div>
      <button className="btn primary" disabled={a === b} onClick={() => run('diplomaticIntervention', a, b, act)}>
        Initiate
      </button>
      <Result r={r} />
    </Tool>
  );
}

function HistoryTool({ onConfirm }: { onConfirm: (c: { title: string; body: string; action: () => void }) => void }) {
  const { r, run } = useResult();
  const civs = Object.values(getWorld().civs);
  const [civ, setCiv] = useState(civs[0]?.id ?? '');
  const [kind, setKind] = useState<HistoricalEventKind>('golden_age');
  const def = HISTORICAL_EVENTS.find((h) => h.kind === kind)!;
  const go = () => {
    const action = () => run('historicalIntervention', civ, kind);
    if (def.destructive) onConfirm({ title: `${def.label}?`, body: `${def.description} This will harm the ${getWorld().civs[civ]?.name} and cannot be undone.`, action });
    else action();
  };
  return (
    <Tool title="Create a historical event" desc="Write a turning point into history — and let the simulation decide what comes next.">
      <div className="fields">
        <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as HistoricalEventKind)}>
          {HISTORICAL_EVENTS.map((h) => (
            <option key={h.kind} value={h.kind}>
              {h.label}
              {h.destructive ? ' ⚠' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {def.description}
      </div>
      <button className={`btn ${def.destructive ? 'danger' : 'primary'}`} onClick={go} data-testid="historical-event">
        {def.destructive ? 'Unleash…' : 'Make it so'}
      </button>
      <Result r={r} />
    </Tool>
  );
}

function GovernmentTool({ onConfirm }: { onConfirm: (c: { title: string; body: string; action: () => void }) => void }) {
  const { r, run } = useResult();
  const civs = Object.values(getWorld().civs);
  const [civ, setCiv] = useState(civs[0]?.id ?? '');
  const [type, setType] = useState<GovernmentType>('Republic');
  return (
    <Tool title="Reform a government" desc="Impose a new form of government. A new leader is chosen under the new rules.">
      <div className="fields">
        <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)}>
          {civs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.government.type})
            </option>
          ))}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as GovernmentType)}>
          {Object.keys(GOVERNMENTS).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <button className="btn" onClick={() => onConfirm({ title: 'Reform government?', body: `The ${getWorld().civs[civ]?.name} will become a ${type}. Legitimacy will fall and a new leader will be installed.`, action: () => run('setGovernment', civ, type) })}>
        Reform…
      </button>
      <Result r={r} />
    </Tool>
  );
}

function TimeTool() {
  const speed = useApp((s) => s.speed);
  const setSpeed = useApp((s) => s.setSpeed);
  const bump = useApp((s) => s.bump);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const skip = async (days: number) => {
    setBusy(true);
    let added = 0;
    // a year at a time, so the snapshot (and this panel) updates as it goes
    for (let left = days; left > 0; left -= 360) {
      const r = (await sim.exec({ type: 'leap', days: Math.min(360, left) })) as { eventsAdded: number };
      added += r.eventsAdded;
      bump();
    }
    setMsg(`${days} days passed; ${added} events recorded.`);
    setBusy(false);
    void sim.save();
  };
  return (
    <Tool title="Simulation speed" desc="Time flows on its own. Adjust its pace, or leap forward instantly.">
      <div className="speeds" style={{ alignSelf: 'flex-start' }}>
        {SPEEDS.map((s) => (
          <button key={s.id} className={speed === s.id ? 'on' : ''} onClick={() => setSpeed(s.id)}>
            {s.id === 0 ? 'Pause' : s.short}
          </button>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {SPEEDS[speed].label}: {SPEEDS[speed].rate === 0 ? 'time is frozen' : SPEEDS[speed].rate >= MINUTES_PER_DAY ? `${SPEEDS[speed].rate / MINUTES_PER_DAY} day(s) per second` : `${SPEEDS[speed].rate} minutes per second`}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn" disabled={busy} onClick={() => skip(30)} data-testid="skip-month">
          Leap 1 month
        </button>
        <button className="btn" disabled={busy} onClick={() => skip(360)}>
          Leap 1 year
        </button>
        <button className="btn" disabled={busy} onClick={() => skip(3600)}>
          Leap 10 years
        </button>
      </div>
      {busy && <div className="spinner" style={{ width: 18, height: 18 }} />}
      {msg && <div className="result">{msg}</div>}
    </Tool>
  );
}
