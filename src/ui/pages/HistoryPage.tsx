import { useMemo, useState } from 'react';
import type { EventCategory, HistoryEvent, World } from '../../sim/types';
import { formatDate, toDate } from '../../sim/time';
import { findEvent } from '../../sim/world';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useWorldVersion } from '../../state/store';
import { CATEGORY_COLORS, CharLink, CivLink, EventLink, EventRow, Importance, PlanetLink, SearchBox, SettlementLink } from '../components/common';
import { Icon } from '../components/Icons';

const CATS: EventCategory[] = ['founding', 'discovery', 'economy', 'politics', 'diplomacy', 'culture', 'population', 'environment', 'exploration', 'personal', 'intervention', 'cosmic'];

export function HistoryPage() {
  useWorldVersion();
  const route = useRoute();
  const w = getWorld();
  if (route.parts[0]) {
    const ev = findEvent(w, route.parts[0]);
    return ev ? <EventDetail e={ev} w={w} /> : <div className="page"><div className="empty">This event has faded from the record.</div></div>;
  }
  return <Timeline w={w} />;
}

function Timeline({ w }: { w: World }) {
  const [cats, setCats] = useState<Set<EventCategory>>(new Set(CATS.filter((c) => c !== 'personal')));
  const [minImp, setMinImp] = useState(2);
  const [civ, setCiv] = useState('all');
  const [source, setSource] = useState<'all' | 'simulation' | 'chronicle' | 'creator'>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(150);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out: HistoryEvent[] = [];
    for (let i = w.events.length - 1; i >= 0; i--) {
      const e = w.events[i];
      if (e.importance < minImp || !cats.has(e.category)) continue;
      if (civ !== 'all' && !e.civIds.includes(civ)) continue;
      if (source !== 'all' && e.source !== source) continue;
      if (ql && !e.title.toLowerCase().includes(ql) && !e.description.toLowerCase().includes(ql)) continue;
      out.push(e);
    }
    return out.sort((a, b) => b.t - a.t);
  }, [w, w.events.length, cats, minImp, civ, source, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const milestones = useMemo(() => [...w.events].filter((e) => e.importance >= 4).sort((a, b) => b.t - a.t).slice(0, 12), [w, w.events.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups: { year: number; items: HistoryEvent[] }[] = [];
  for (const e of filtered.slice(0, limit)) {
    const y = toDate(e.t, w.epochYear).year;
    const g = groups[groups.length - 1];
    if (g && g.year === y) g.items.push(e);
    else groups.push({ year: y, items: [e] });
  }
  const sim = w.events.filter((e) => e.source === 'simulation').length;
  return (
    <div className="page" data-testid="history-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">History</div>
          <h1 className="page-title">The chronicle of {w.galaxy.name}</h1>
          <p className="page-sub">
            {w.events.length.toLocaleString()} recorded events — {sim.toLocaleString()} emerged from the simulation, the rest are founding chronicles or your interventions. Select any event to trace what caused it and what followed.
          </p>
        </div>
      </div>
      <div className="milestones">
        {milestones.map((e) => (
          <button key={e.id} className="milestone" onClick={() => navigate(`history/${e.id}`)}>
            <span className="mono muted">{formatDate(e.t, w.epochYear)}</span>
            <span>{e.title}</span>
          </button>
        ))}
      </div>
      <div className="split" style={{ marginTop: 24 }}>
        <div className="sticky" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search history" />
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Categories
            </div>
            <div className="chip-row">
              {CATS.map((c) => (
                <button
                  key={c}
                  className={`tag ${cats.has(c) ? 'accent' : ''}`}
                  style={{ cursor: 'pointer', border: 0 }}
                  onClick={() => {
                    const n = new Set(cats);
                    if (n.has(c)) n.delete(c);
                    else n.add(c);
                    setCats(n);
                  }}
                >
                  <span className="dot" style={{ background: CATEGORY_COLORS[c] }} />
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Minimum importance
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`btn sm ${minImp === n ? 'accent' : 'ghost'}`} onClick={() => setMinImp(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)} style={{ flex: 1 }}>
              <option value="all">All civilisations</option>
              {Object.values(w.civs).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              <option value="all">All sources</option>
              <option value="simulation">Simulation</option>
              <option value="chronicle">Chronicle</option>
              <option value="creator">Creator</option>
            </select>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {filtered.length.toLocaleString()} matching events
          </div>
        </div>
        <div>
          {groups.map((g) => (
            <div key={g.year} className="year-group">
              <div className="year-label mono">{g.year}</div>
              <div className="list" style={{ margin: '0 -12px' }}>
                {g.items.map((e) => (
                  <EventRow key={e.id} e={e} />
                ))}
              </div>
            </div>
          ))}
          {filtered.length > limit && (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 200)}>
              Show more
            </button>
          )}
          {!filtered.length && <div className="empty">No events match these filters.</div>}
        </div>
      </div>
    </div>
  );
}

function chain(w: World, e: HistoryEvent, depth = 0, seen = new Set<string>()): HistoryEvent[] {
  if (depth > 4 || seen.has(e.id)) return [];
  seen.add(e.id);
  const first = e.causeIds.map((id) => findEvent(w, id)).find(Boolean);
  return first ? [...chain(w, first, depth + 1, seen), first] : [];
}

function EventDetail({ e, w }: { e: HistoryEvent; w: World }) {
  const causes = e.causeIds.map((id) => findEvent(w, id)).filter(Boolean) as HistoryEvent[];
  const consequences = e.consequenceIds.map((id) => findEvent(w, id)).filter(Boolean) as HistoryEvent[];
  const lineage = chain(w, e);
  return (
    <div className="page" data-testid="event-detail">
      <button className="btn sm ghost" onClick={() => navigate('history')} style={{ marginBottom: 12 }}>
        <Icon.Back style={{ width: 14, height: 14 }} /> Timeline
      </button>
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="tag" style={{ color: CATEGORY_COLORS[e.category] }}>
            <span className="dot" style={{ background: CATEGORY_COLORS[e.category] }} />
            {e.category}
          </span>
          <Importance n={e.importance} />
          <span className="muted mono" style={{ fontSize: 12 }}>
            {formatDate(e.t, w.epochYear, true)}
          </span>
          <span className="tag">{e.source === 'simulation' ? 'emerged from simulation' : e.source === 'creator' ? 'creator intervention' : 'founding chronicle'}</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 30, marginTop: 12 }}>
          {e.title}
        </h1>
        <p className="dim" style={{ fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>
          {e.description}
        </p>
        <div className="grid cols-2" style={{ gap: 36, marginTop: 24 }}>
          <div>
            <div className="section-title">
              <h3>What caused it</h3>
            </div>
            <p style={{ marginTop: 0 }}>{e.cause}</p>
            {causes.length > 0 && (
              <div className="list" style={{ margin: '0 -12px' }}>
                {causes.map((c) => (
                  <EventRow key={c.id} e={c} />
                ))}
              </div>
            )}
            {lineage.length > 1 && (
              <div className="section">
                <div className="section-title">
                  <h3>Causal chain</h3>
                </div>
                <div className="chain">
                  {lineage.map((c) => (
                    <div key={c.id} className="chain-node" onClick={() => navigate(`history/${c.id}`)}>
                      <span className="mono muted">{formatDate(c.t, w.epochYear)}</span>
                      <span>{c.title}</span>
                    </div>
                  ))}
                  <div className="chain-node here">
                    <span className="mono muted">{formatDate(e.t, w.epochYear)}</span>
                    <span>{e.title}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <div className="section-title">
              <h3>What changed</h3>
            </div>
            {e.effects.length ? (
              <table className="table">
                <tbody>
                  {e.effects.map((fx, i) => (
                    <tr key={i}>
                      <td className="dim">{fx.label}</td>
                      <td className="mono muted">{fx.before ?? ''}</td>
                      <td className="muted">{fx.before !== undefined ? '→' : ''}</td>
                      <td className="mono">{fx.after ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted">No measurable state change was recorded.</div>
            )}
            <div className="section">
              <div className="section-title">
                <h3>What followed</h3>
              </div>
              {consequences.length ? (
                <div className="list" style={{ margin: '0 -12px' }}>
                  {consequences.map((c) => (
                    <EventRow key={c.id} e={c} />
                  ))}
                </div>
              ) : (
                <div className="muted">No later events cite this one — yet.</div>
              )}
            </div>
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Involved</h3>
          </div>
          <div className="chip-row" style={{ gap: 14 }}>
            {e.civIds.map((id) => (
              <CivLink key={id} id={id} />
            ))}
            {e.planetId && <PlanetLink id={e.planetId} />}
            {e.settlementId && <SettlementLink id={e.settlementId} />}
            {e.characterIds.map((id) => (
              <CharLink key={id} id={id} />
            ))}
            {!e.civIds.length && !e.planetId && !e.characterIds.length && <span className="muted">—</span>}
          </div>
        </div>
        {e.causeIds.length > causes.length && (
          <p className="muted" style={{ fontSize: 12 }}>
            Some earlier causes have been pruned from long-term memory. (<EventLink id={e.causeIds[0]} />)
          </p>
        )}
      </div>
    </div>
  );
}
