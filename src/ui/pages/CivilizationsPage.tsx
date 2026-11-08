import { useState } from 'react';
import { CATEGORY_LABEL, GOVERNMENTS, POLICIES, ARCHITECTURE_LABEL } from '../../sim/data/society';
import { civModifiers, availableTechs, techById } from '../../sim/systems/technology';
import { satisfactionBreakdown, stabilityTarget } from '../../sim/systems/politics';
import { opinionFactors } from '../../sim/systems/diplomacy';
import { GOODS, type Civilization, type CultureValues, type World } from '../../sim/types';
import { DAYS_PER_YEAR, MINUTES_PER_DAY, formatDate, formatShortDate } from '../../sim/time';
import { ageOf, civPopulation, fmtNum, fmtPop, fullName, getRelation } from '../../sim/world';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useWorldVersion } from '../../state/store';
import { Breakdown, LineChart, Meter, Sparkline } from '../components/Charts';
import { CharLink, CivLink, EventRow, PlanetLink } from '../components/common';
import { Icon } from '../components/Icons';

const TABS = ['Overview', 'Economy', 'Technology', 'Politics', 'Diplomacy', 'Settlements', 'History'] as const;
type Tab = (typeof TABS)[number];

export function CivilizationsPage() {
  useWorldVersion();
  const route = useRoute();
  const w = getWorld();
  const civs = Object.values(w.civs);
  const selected = route.parts[0] && w.civs[route.parts[0]] ? w.civs[route.parts[0]] : null;
  return (
    <div className="page" data-testid="civilizations-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Civilisations</div>
          <h1 className="page-title">Societies of {w.galaxy.name}</h1>
          <p className="page-sub">Every number here comes from the running simulation. Expand any figure to see what drives it.</p>
        </div>
      </div>
      <div className="split">
        <div className="sticky">
          <div className="list" style={{ margin: '0 -12px' }}>
            {civs.map((c) => (
              <div key={c.id} className={`row ${selected?.id === c.id ? 'active' : ''}`} onClick={() => navigate(`civilizations/${c.id}`)} data-testid="civ-row">
                <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
                <div className="grow">
                  <div className="title">{c.name}</div>
                  <div className="sub">
                    {c.government.type} · {fmtPop(civPopulation(w, c))}
                  </div>
                </div>
                <Sparkline values={c.stats.slice(-30).map((s) => s.population)} color={c.color} width={60} height={22} />
              </div>
            ))}
          </div>
          <RelationsGraph w={w} />
        </div>
        <div>{selected ? <CivDetail civ={selected} w={w} key={selected.id} /> : <Overview w={w} />}</div>
      </div>
    </div>
  );
}

function Overview({ w }: { w: World }) {
  const civs = Object.values(w.civs);
  return (
    <div>
      <div className="section-title">
        <h3>Comparative population</h3>
      </div>
      <LineChart series={civs.map((c) => ({ label: c.adjective, color: c.color, values: c.stats.map((s) => ({ x: s.t, y: s.population })) }))} format={(v) => fmtPop(v)} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} />
      <div className="section">
        <div className="section-title">
          <h3>Stability</h3>
        </div>
        <LineChart series={civs.map((c) => ({ label: c.adjective, color: c.color, values: c.stats.map((s) => ({ x: s.t, y: s.stability })) }))} yMin={0} yMax={100} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} />
      </div>
      <div className="section">
        <div className="section-title">
          <h3>At a glance</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Civilisation</th>
              <th>Population</th>
              <th>GDP/day</th>
              <th>Stability</th>
              <th>Satisfaction</th>
              <th>Technologies</th>
              <th>Leader</th>
            </tr>
          </thead>
          <tbody>
            {civs.map((c) => (
              <tr key={c.id} onClick={() => navigate(`civilizations/${c.id}`)} style={{ cursor: 'pointer' }}>
                <td>
                  <span className="dot" style={{ background: c.color, marginRight: 8 }} />
                  {c.name}
                </td>
                <td className="mono">{fmtPop(civPopulation(w, c))}</td>
                <td className="mono">{fmtNum(c.economy.gdp)}</td>
                <td className="mono">{c.stability.toFixed(0)}</td>
                <td className="mono">{c.satisfaction.toFixed(0)}</td>
                <td className="mono">{c.tech.known.length}</td>
                <td>{c.government.leaderId ? fullName(w.characters[c.government.leaderId]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function challengesOf(w: World, c: Civilization): { text: string; tone: 'bad' | 'warn' | 'good' }[] {
  const out: { text: string; tone: 'bad' | 'warn' | 'good' }[] = [];
  const e = c.economy;
  for (const g of GOODS) if (c.conditions[`shortage_${g}`]) out.push({ text: g === 'food' ? 'Famine — food reserves exhausted' : `Shortage of ${g}`, tone: 'bad' });
  if (c.conditions.plague) out.push({ text: `Plague (${Math.round(c.conditions.plague)} days remaining)`, tone: 'bad' });
  if (c.conditions.crisis) out.push({ text: 'Political crisis — risk of revolution', tone: 'bad' });
  if (c.stability < 40) out.push({ text: `Low stability (${c.stability.toFixed(0)})`, tone: 'warn' });
  if (e.treasury < 0) out.push({ text: 'State treasury in debt', tone: 'warn' });
  if (e.employment < 0.85) out.push({ text: `Unemployment at ${Math.round((1 - e.employment) * 100)}%`, tone: 'warn' });
  if (e.inequality > 0.5) out.push({ text: 'Severe wealth inequality', tone: 'warn' });
  const crowded = c.settlementIds.map((id) => w.settlements[id]).filter((s) => s && s.population > s.capacity);
  if (crowded.length) out.push({ text: `Overcrowding in ${crowded.map((s) => s.name).join(', ')}`, tone: 'warn' });
  for (const r of Object.values(w.relations)) if ((r.a === c.id || r.b === c.id) && r.status === 'rivalry') out.push({ text: `Rivalry with the ${w.civs[r.a === c.id ? r.b : r.a]?.name}`, tone: 'warn' });
  if (c.conditions.golden_age) out.push({ text: 'Golden age', tone: 'good' });
  if (c.conditions.renaissance) out.push({ text: 'Cultural renaissance', tone: 'good' });
  if (!out.length) out.push({ text: 'No pressing challenges', tone: 'good' });
  return out;
}

function CivDetail({ civ, w }: { civ: Civilization; w: World }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const pop = civPopulation(w, civ);
  const last = civ.stats[civ.stats.length - 1];
  const prev = civ.stats[Math.max(0, civ.stats.length - 13)];
  const growth = prev && last ? ((last.population - prev.population) / Math.max(1, prev.population)) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow" style={{ color: civ.color }}>
            {civ.speciesName} · {civ.government.type}
          </div>
          <h2 style={{ margin: '4px 0 2px', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{civ.name}</h2>
          <div className="muted">
            Founded {civ.foundedYear} · Homeworld <PlanetLink id={civ.homeworldId} /> · “{civ.culture.motto}”
          </div>
        </div>
        <button className="btn accent" onClick={() => navigate(`explorer/${civ.settlementIds[0]}`)}>
          <Icon.Explorer style={{ width: 16, height: 16 }} /> Visit capital
        </button>
      </div>
      <div className="statrow" style={{ marginTop: 18 }}>
        <div className="stat">
          <span className="label">Population</span>
          <span className="value">{fmtPop(pop)}</span>
          <span className={`delta ${growth >= 0 ? 'good' : 'bad'}`}>
            {growth >= 0 ? '+' : ''}
            {growth.toFixed(2)}% / yr
          </span>
        </div>
        <div className="stat">
          <span className="label">GDP / day</span>
          <span className="value">{fmtNum(civ.economy.gdp)}</span>
        </div>
        <div className="stat">
          <span className="label">Stability</span>
          <span className="value">{civ.stability.toFixed(0)}</span>
        </div>
        <div className="stat">
          <span className="label">Satisfaction</span>
          <span className="value">{civ.satisfaction.toFixed(0)}</span>
        </div>
        <div className="stat">
          <span className="label">Technologies</span>
          <span className="value">{civ.tech.known.length}</span>
        </div>
        <div className="stat">
          <span className="label">Treasury</span>
          <span className={`value ${civ.economy.treasury < 0 ? 'bad' : ''}`}>{fmtNum(civ.economy.treasury)}</span>
        </div>
      </div>
      <div className="tabs" style={{ marginTop: 20 }}>
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && <OverviewTab civ={civ} w={w} />}
      {tab === 'Economy' && <EconomyTab civ={civ} w={w} />}
      {tab === 'Technology' && <TechTab civ={civ} w={w} />}
      {tab === 'Politics' && <PoliticsTab civ={civ} w={w} />}
      {tab === 'Diplomacy' && <DiplomacyTab civ={civ} w={w} />}
      {tab === 'Settlements' && <SettlementsTab civ={civ} w={w} />}
      {tab === 'History' && <HistoryTab civ={civ} w={w} />}
    </div>
  );
}

const VALUE_LABELS: Record<keyof CultureValues, [string, string]> = {
  progress: ['Traditional', 'Progressive'],
  collectivism: ['Individualist', 'Collectivist'],
  rationalism: ['Spiritual', 'Rational'],
  militarism: ['Pacifist', 'Martial'],
  openness: ['Insular', 'Outward'],
};

function OverviewTab({ civ, w }: { civ: Civilization; w: World }) {
  const leader = civ.government.leaderId ? w.characters[civ.government.leaderId] : undefined;
  const ch = challengesOf(w, civ);
  return (
    <div className="grid cols-2" style={{ gap: 32 }}>
      <div>
        <p className="dim" style={{ marginTop: 0, lineHeight: 1.65 }}>
          {civ.background}
        </p>
        <div className="section">
          <div className="section-title">
            <h3>Culture</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              {ARCHITECTURE_LABEL[civ.culture.architecture]} architecture
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(Object.keys(VALUE_LABELS) as (keyof CultureValues)[]).map((k) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span className="muted" style={{ textAlign: 'right' }}>
                  {VALUE_LABELS[k][0]}
                </span>
                <div style={{ position: 'relative', height: 4, background: 'rgba(132,170,230,0.1)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: 'rgba(132,170,230,0.25)' }} />
                  <div style={{ position: 'absolute', top: -3, width: 10, height: 10, borderRadius: '50%', background: civ.color, left: `calc(${(civ.culture.values[k] + 1) * 50}% - 5px)` }} />
                </div>
                <span className="muted">{VALUE_LABELS[k][1]}</span>
              </div>
            ))}
          </div>
          <div className="chip-row" style={{ marginTop: 14 }}>
            {civ.culture.traditions.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Population</h3>
          </div>
          <LineChart series={[{ label: 'Population', color: civ.color, values: civ.stats.map((s) => ({ x: s.t, y: s.population })) }]} format={fmtPop} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} height={150} />
        </div>
      </div>
      <div>
        <div className="section-title">
          <h3>Leadership</h3>
        </div>
        {leader ? (
          <div className="row" onClick={() => navigate(`characters/${leader.id}`)} style={{ margin: '0 -12px' }}>
            <div className="avatar" style={{ background: civ.color }}>
              {leader.givenName[0]}
            </div>
            <div className="grow">
              <div className="title">{fullName(leader)}</div>
              <div className="sub">
                {civ.government.leaderTitle} · age {ageOf(leader, w.time)} · in office {((w.time - civ.government.termStart) / (DAYS_PER_YEAR * MINUTES_PER_DAY)).toFixed(1)} yrs
              </div>
            </div>
          </div>
        ) : (
          <div className="muted">The seat of power is vacant.</div>
        )}
        <div className="section">
          <div className="section-title">
            <h3>Current challenges</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ch.map((c) => (
              <div key={c.text} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="dot" style={{ background: `var(--${c.tone})` }} />
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Territory</h3>
          </div>
          {civ.planetIds.map((pid) => {
            const p = w.planets[pid];
            const owned = p.regions.filter((r) => r.ownerCivId === civ.id);
            return (
              <div key={pid} style={{ marginBottom: 8 }}>
                <PlanetLink id={pid} /> <span className="muted">· {owned.length} of {p.regions.length} regions</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {owned.map((r) => r.name).join(', ')}
                </div>
              </div>
            );
          })}
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Recent events</h3>
          </div>
          <div className="list" style={{ margin: '0 -12px' }}>
            {[...w.events]
              .reverse()
              .filter((e) => e.civIds.includes(civ.id) && e.importance >= 2)
              .slice(0, 6)
              .map((e) => (
                <EventRow key={e.id} e={e} compact />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EconomyTab({ civ, w }: { civ: Civilization; w: World }) {
  const e = civ.economy;
  return (
    <div>
      <table className="table">
        <thead>
          <tr>
            <th>Good</th>
            <th>Production/day</th>
            <th>Consumption/day</th>
            <th>Balance</th>
            <th>Reserves</th>
            <th>Price</th>
            <th>Net trade</th>
          </tr>
        </thead>
        <tbody>
          {GOODS.map((g) => {
            const bal = e.production[g] - e.consumption[g];
            const days = e.stockpile[g] / Math.max(1e-6, e.consumption[g]);
            return (
              <tr key={g}>
                <td style={{ textTransform: 'capitalize' }}>
                  {g}
                  {civ.conditions[`shortage_${g}`] ? <span className="tag bad" style={{ marginLeft: 8 }}>shortage</span> : null}
                </td>
                <td className="mono">{e.production[g].toFixed(3)}</td>
                <td className="mono">{e.consumption[g].toFixed(3)}</td>
                <td className={`mono ${bal >= 0 ? 'good' : 'bad'}`}>
                  {bal >= 0 ? '+' : ''}
                  {bal.toFixed(3)}
                </td>
                <td className="mono">{days.toFixed(0)} days</td>
                <td className="mono">{e.prices[g].toFixed(2)}×</td>
                <td className={`mono ${e.netTrade[g] > 0 ? 'good' : e.netTrade[g] < 0 ? 'warn' : 'muted'}`}>{e.netTrade[g] ? `${e.netTrade[g] > 0 ? '+' : ''}${e.netTrade[g].toFixed(3)}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        Units: millions of standard rations per day. Prices rise as reserves fall below ~45 days of consumption.
      </p>
      <div className="grid cols-4" style={{ marginTop: 18 }}>
        <Meter label="Employment" value={e.employment * 100} right={`${Math.round(e.employment * 100)}%`} />
        <Meter label="Inequality (Gini)" value={e.inequality * 100} right={e.inequality.toFixed(2)} color="var(--warn)" />
        <Meter label="Tax rate" value={e.taxRate * 100} max={50} right={`${Math.round(e.taxRate * 100)}%`} color="var(--accent-2)" />
        <Meter label="Stability" value={civ.stability} />
      </div>
      <div className="grid cols-2" style={{ marginTop: 26 }}>
        <div>
          <div className="section-title">
            <h3>Gross output</h3>
          </div>
          <LineChart series={[{ label: 'GDP', color: '#f4c26b', values: civ.stats.map((s) => ({ x: s.t, y: s.gdp })) }]} format={fmtNum} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} height={150} />
        </div>
        <div>
          <div className="section-title">
            <h3>Treasury</h3>
          </div>
          <LineChart series={[{ label: 'Treasury', color: '#6fd6ff', values: civ.stats.map((s) => ({ x: s.t, y: s.treasury })) }]} format={fmtNum} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} height={150} />
        </div>
      </div>
    </div>
  );
}

function TechTab({ civ, w }: { civ: Civilization; w: World }) {
  const current = civ.tech.researching ? techById(w, civ.tech.researching) : undefined;
  const next = availableTechs(w, civ);
  const byCat = new Map<string, string[]>();
  for (const id of civ.tech.known) {
    const t = techById(w, id);
    if (!t) continue;
    byCat.set(t.category, [...(byCat.get(t.category) ?? []), t.name]);
  }
  const mods = civModifiers(w, civ);
  return (
    <div className="grid cols-2" style={{ gap: 32 }}>
      <div>
        <div className="section-title">
          <h3>Current research</h3>
          <span className="mono muted" style={{ fontSize: 12 }}>
            {civ.tech.rate.toFixed(2)} pts/day
          </span>
        </div>
        {current ? (
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{current.name}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              {CATEGORY_LABEL[current.category]} · tier {current.tier} · {current.description}
            </div>
            <Meter value={civ.tech.progress + (civ.tech.boosts[current.id] ?? 0)} max={current.cost} label="Progress" right={`${Math.round(civ.tech.progress + (civ.tech.boosts[current.id] ?? 0))} / ${current.cost}`} />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Estimated {civ.tech.rate > 0 ? Math.max(0, Math.round((current.cost - civ.tech.progress - (civ.tech.boosts[current.id] ?? 0)) / civ.tech.rate)) : '∞'} days remaining
            </div>
          </div>
        ) : (
          <div className="muted">All known paths are exhausted.</div>
        )}
        <div className="section">
          <div className="section-title">
            <h3>Research priorities</h3>
            <span className="muted" style={{ fontSize: 12 }}>
              from culture & needs
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(civ.tech.priorities).map(([k, v]) => (
              <Meter key={k} label={CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]} value={v} max={2} right={v.toFixed(2)} color="var(--accent-2)" />
            ))}
          </div>
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Available next</h3>
          </div>
          <div className="chip-row">
            {next.map((t) => (
              <span key={t.id} className="tag" title={t.description}>
                {t.name} · {t.cost}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="section-title">
          <h3>Known technologies</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {civ.tech.known.length}
          </span>
        </div>
        {[...byCat.entries()].map(([cat, names]) => (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}
            </div>
            <div className="chip-row">
              {names.map((n) => (
                <span key={n} className="tag accent">
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
        <div className="section">
          <div className="section-title">
            <h3>Combined effects</h3>
          </div>
          <dl className="kv">
            {GOODS.map((g) => (
              <span key={g} style={{ display: 'contents' }}>
                <dt style={{ textTransform: 'capitalize' }}>{g} output</dt>
                <dd className="mono">×{mods.production[g].toFixed(2)}</dd>
              </span>
            ))}
            <dt>Research</dt>
            <dd className="mono">×{mods.research.toFixed(2)}</dd>
            <dt>Housing capacity</dt>
            <dd className="mono">×{mods.capacity.toFixed(2)}</dd>
            <dt>Mortality reduction</dt>
            <dd className="mono">{Math.round(Math.min(0.6, mods.health * 0.45) * 100)}%</dd>
            <dt>Contact other worlds</dt>
            <dd>{mods.canContact ? 'Yes' : 'No'}</dd>
            <dt>Colonise planets</dt>
            <dd>{mods.canColonize ? 'Yes' : 'No'}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function PoliticsTab({ civ, w }: { civ: Civilization; w: World }) {
  const gov = civ.government;
  const def = GOVERNMENTS[gov.type];
  const mods = civModifiers(w, civ);
  const breakdown = satisfactionBreakdown(w, civ, mods);
  const target = breakdown.reduce((a, b) => a + b.value, 0);
  const termLeft = gov.termLengthDays ? gov.termLengthDays - (w.time - gov.termStart) / MINUTES_PER_DAY : null;
  return (
    <div className="grid cols-2" style={{ gap: 32 }}>
      <div>
        <dl className="kv">
          <dt>Government</dt>
          <dd>{gov.type}</dd>
          <dt>Succession</dt>
          <dd style={{ textTransform: 'capitalize' }}>{def.succession}</dd>
          <dt>{gov.leaderTitle}</dt>
          <dd>{gov.leaderId ? <CharLink id={gov.leaderId} /> : '—'}</dd>
          <dt>Term</dt>
          <dd>{termLeft === null ? 'For life' : `${Math.max(0, Math.round(termLeft))} days remaining`}</dd>
          <dt>Legitimacy</dt>
          <dd className="mono">{gov.legitimacy.toFixed(0)}</dd>
          <dt>Stability target</dt>
          <dd className="mono">{stabilityTarget(civ, mods).toFixed(0)}</dd>
        </dl>
        <div className="section">
          <div className="section-title">
            <h3>Policies</h3>
          </div>
          {gov.policies.length === 0 && <div className="muted">No active policies.</div>}
          {gov.policies.map((p) => (
            <div key={p} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 500 }}>{POLICIES[p].name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {POLICIES[p].description}
              </div>
            </div>
          ))}
        </div>
        <div className="section">
          <div className="section-title">
            <h3>Past leaders</h3>
          </div>
          {civ.pastLeaderIds.length === 0 && <div className="muted">None recorded since Genesis.</div>}
          {[...civ.pastLeaderIds].reverse().map((id, i) => (
            <div key={id + i}>
              <CharLink id={id} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="section-title">
          <h3>Why satisfaction is {civ.satisfaction.toFixed(0)}</h3>
          <span className="muted mono" style={{ fontSize: 12 }}>
            target {Math.max(0, Math.min(100, target)).toFixed(0)}
          </span>
        </div>
        <Breakdown items={breakdown.filter((b) => Math.abs(b.value) > 0.05)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Satisfaction drifts ~4% toward its target each day. Stability follows satisfaction and legitimacy monthly; sustained instability below 22 can trigger revolution.
        </p>
        <div className="section">
          <div className="section-title">
            <h3>Stability & satisfaction</h3>
          </div>
          <LineChart
            series={[
              { label: 'Stability', color: '#6fd6ff', values: civ.stats.map((s) => ({ x: s.t, y: s.stability })) },
              { label: 'Satisfaction', color: '#6fe3a5', values: civ.stats.map((s) => ({ x: s.t, y: s.satisfaction })) },
            ]}
            yMin={0}
            yMax={100}
            xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)}
            height={150}
          />
        </div>
      </div>
    </div>
  );
}

function DiplomacyTab({ civ, w }: { civ: Civilization; w: World }) {
  const others = Object.values(w.civs).filter((c) => c.id !== civ.id);
  if (!others.length) return <div className="empty">This civilisation is alone in the galaxy.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {others.map((o) => {
        const rel = getRelation(w, civ.id, o.id);
        if (!rel) return null;
        const factors = rel.contactAt === null ? [] : opinionFactors(w, rel);
        return (
          <div key={o.id} className="grid cols-2" style={{ gap: 32 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span className="dot" style={{ background: o.color, width: 10, height: 10 }} />
                <CivLink id={o.id} />
                <span className={`tag ${rel.status === 'alliance' || rel.status === 'trade' || rel.status === 'cordial' ? 'good' : rel.status === 'rivalry' || rel.status === 'tense' ? 'bad' : ''}`}>{rel.status}</span>
              </div>
              {rel.contactAt === null ? (
                <div className="muted">No contact yet. Contact requires Radio Astronomy or Orbital Flight.</div>
              ) : (
                <>
                  <dl className="kv">
                    <dt>Opinion</dt>
                    <dd className="mono">{rel.opinion.toFixed(0)}</dd>
                    <dt>Treaties</dt>
                    <dd>{rel.treaties.length ? rel.treaties.map((t) => `${t.kind} (since ${formatDate(t.since, w.epochYear)})`).join(', ') : 'none'}</dd>
                    <dt>Trade volume</dt>
                    <dd className="mono">{fmtNum(rel.tradeVolume)}/day</dd>
                    <dt>First contact</dt>
                    <dd>{rel.contactAt < 0 ? 'Ancient neighbours' : formatDate(rel.contactAt, w.epochYear)}</dd>
                  </dl>
                  <div style={{ marginTop: 14 }}>
                    <LineChart series={[{ label: 'Opinion', color: o.color, values: rel.history.map((h) => ({ x: h.t / MINUTES_PER_DAY, y: h.opinion })) }]} yMin={-100} yMax={100} xFormat={(d) => formatShortDate(d * MINUTES_PER_DAY, w.epochYear)} height={110} />
                  </div>
                </>
              )}
            </div>
            <div>
              {factors.length > 0 && (
                <>
                  <div className="section-title">
                    <h3>What shapes this relationship</h3>
                  </div>
                  <Breakdown items={factors} />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettlementsTab({ civ, w }: { civ: Civilization; w: World }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Settlement</th>
          <th>Planet</th>
          <th>Population</th>
          <th>Housing</th>
          <th>Economy</th>
          <th>Infra</th>
          <th>Happiness</th>
          <th>Founded</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {civ.settlementIds.map((id) => {
          const s = w.settlements[id];
          if (!s) return null;
          return (
            <tr key={id}>
              <td>
                <button className="link" onClick={() => navigate(`universe/planet/${s.planetId}/${s.id}`)}>
                  {s.name}
                </button>
                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                  {s.kind}
                </span>
              </td>
              <td>{w.planets[s.planetId].name}</td>
              <td className="mono">{fmtPop(s.population)}</td>
              <td className={`mono ${s.population > s.capacity ? 'warn' : ''}`}>{Math.round((s.population / s.capacity) * 100)}%</td>
              <td style={{ textTransform: 'capitalize' }}>{s.specialization}</td>
              <td className="mono">{s.infrastructure.toFixed(1)}</td>
              <td className="mono">{s.happiness.toFixed(0)}</td>
              <td className="muted">{s.foundedAt < 0 ? `${Math.round(-s.foundedAt / (DAYS_PER_YEAR * MINUTES_PER_DAY))} yrs before Genesis` : formatDate(s.foundedAt, w.epochYear)}</td>
              <td>
                <button className="btn sm" onClick={() => navigate(`explorer/${s.id}`)}>
                  Enter
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryTab({ civ, w }: { civ: Civilization; w: World }) {
  const [min, setMin] = useState(2);
  const list = [...w.events].reverse().filter((e) => e.civIds.includes(civ.id) && e.importance >= min);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className={`btn sm ${min === n ? 'accent' : 'ghost'}`} onClick={() => setMin(n)}>
            {n === 1 ? 'All' : `Importance ≥ ${n}`}
          </button>
        ))}
      </div>
      <div className="list" style={{ margin: '0 -12px' }}>
        {list.slice(0, 200).map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}

function RelationsGraph({ w }: { w: World }) {
  const civs = Object.values(w.civs);
  if (civs.length < 2) return null;
  const R = 90;
  const pos = new Map(civs.map((c, i) => [c.id, [150 + Math.cos((i / civs.length) * Math.PI * 2 - Math.PI / 2) * R, 120 + Math.sin((i / civs.length) * Math.PI * 2 - Math.PI / 2) * R] as const]));
  const color = (s: string) => (s === 'alliance' ? '#6fe3a5' : s === 'trade' ? '#6fd6ff' : s === 'cordial' ? '#8aa8ff' : s === 'rivalry' ? '#ff7a7a' : s === 'tense' ? '#f4c26b' : '#45536b');
  return (
    <div className="section">
      <div className="section-title">
        <h3>Diplomatic web</h3>
      </div>
      <svg viewBox="0 0 300 240" width="100%">
        {Object.values(w.relations).map((r) => {
          const a = pos.get(r.a);
          const b = pos.get(r.b);
          if (!a || !b) return null;
          return <line key={r.a + r.b} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color(r.status)} strokeWidth={r.status === 'alliance' ? 3 : 1.5} strokeDasharray={r.status === 'unknown' ? '3 4' : undefined} opacity={0.85} />;
        })}
        {civs.map((c) => {
          const p = pos.get(c.id)!;
          return (
            <g key={c.id} onClick={() => navigate(`civilizations/${c.id}`)} style={{ cursor: 'pointer' }}>
              <circle cx={p[0]} cy={p[1]} r={9} fill={c.color} />
              <text x={p[0]} y={p[1] + 22} textAnchor="middle" fontSize="10" fill="#a7b5cc">
                {c.adjective}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chip-row">
        {['alliance', 'trade', 'cordial', 'neutral', 'tense', 'rivalry', 'unknown'].map((s) => (
          <span key={s} className="tag">
            <span className="dot" style={{ background: color(s) }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
