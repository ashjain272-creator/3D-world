import { useMemo, useState } from 'react';
import { OCCUPATIONS } from '../../sim/data/society';
import { skillLabel } from '../../sim/systems/goals';
import { scoreActivities } from '../../sim/systems/characters';
import { Rng } from '../../sim/rng';
import { SKILLS, type Character, type Occupation, type World } from '../../sim/types';
import { formatDate, formatDuration } from '../../sim/time';
import { ageOf, fullName } from '../../sim/world';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useWorldVersion } from '../../state/store';
import { OCC_COLORS } from '../../explorer/People';
import { Meter } from '../components/Charts';
import { CharLink, CivLink, EventRow, SearchBox, SettlementLink, moodLabel } from '../components/common';
import { Icon } from '../components/Icons';
import { sim } from '../../state/runner';

export function CharactersPage() {
  useWorldVersion();
  const route = useRoute();
  const w = getWorld();
  const [q, setQ] = useState('');
  const [civ, setCiv] = useState('all');
  const [occ, setOcc] = useState<'all' | Occupation>('all');
  const [status, setStatus] = useState<'living' | 'notable' | 'deceased' | 'all'>('living');
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return Object.values(w.characters)
      .filter((c) => (status === 'living' ? c.alive : status === 'notable' ? c.alive && c.notable : status === 'deceased' ? !c.alive : true))
      .filter((c) => civ === 'all' || c.civId === civ)
      .filter((c) => occ === 'all' || c.occupation === occ)
      .filter((c) => !ql || fullName(c).toLowerCase().includes(ql))
      .sort((a, b) => Number(b.notable) - Number(a.notable) || b.reputation - a.reputation);
  }, [w, q, civ, occ, status, w.characters]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = route.parts[0] ? w.characters[route.parts[0]] : undefined;
  const living = Object.values(w.characters).filter((c) => c.alive).length;
  return (
    <div className="page" data-testid="characters-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Inhabitants</div>
          <h1 className="page-title">{living} lives in motion</h1>
          <p className="page-sub">Each person decides for themselves using a transparent utility system: needs, personality, goals, relationships and the time of day. Their choices feed their society — scientists produce research, merchants drive trade, leaders set policy.</p>
        </div>
      </div>
      <div className="split">
        <div className="sticky">
          <SearchBox value={q} onChange={setQ} placeholder="Search by name" />
          <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
            <select className="input" value={civ} onChange={(e) => setCiv(e.target.value)} style={{ flex: 1 }}>
              <option value="all">All civilisations</option>
              {Object.values(w.civs).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={occ} onChange={(e) => setOcc(e.target.value as Occupation | 'all')} style={{ flex: 1 }}>
              <option value="all">All occupations</option>
              {Object.values(OCCUPATIONS).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['living', 'notable', 'deceased', 'all'] as const).map((s) => (
              <button key={s} className={`btn sm ${status === s ? 'accent' : 'ghost'}`} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>
                {s}
              </button>
            ))}
          </div>
          <div className="scroll-list">
            {list.slice(0, 400).map((c) => (
              <div key={c.id} className={`row ${selected?.id === c.id ? 'active' : ''}`} onClick={() => navigate(`characters/${c.id}`)} data-testid="character-row">
                <span className="dot" style={{ background: OCC_COLORS[c.occupation] }} />
                <div className="grow">
                  <div className="title">
                    {fullName(c)}
                    {!c.alive && ' †'}
                    {c.notable && c.alive && <span className="tag accent" style={{ marginLeft: 6, fontSize: 10 }}>notable</span>}
                  </div>
                  <div className="sub">
                    {OCCUPATIONS[c.occupation].label} · {ageOf(c, w.time)} · {c.alive ? c.activity.description : `died ${formatDate(c.deathTime ?? 0, w.epochYear)}`}
                  </div>
                </div>
              </div>
            ))}
            {!list.length && <div className="empty">Nobody matches.</div>}
          </div>
        </div>
        <div>{selected ? <CharacterDetail c={selected} w={w} key={selected.id} /> : <div className="empty">Select someone to see their life.</div>}</div>
      </div>
    </div>
  );
}

const PERSONALITY: { k: keyof Character['personality']; lo: string; hi: string }[] = [
  { k: 'openness', lo: 'Conventional', hi: 'Curious' },
  { k: 'conscientiousness', lo: 'Spontaneous', hi: 'Diligent' },
  { k: 'extraversion', lo: 'Reserved', hi: 'Outgoing' },
  { k: 'agreeableness', lo: 'Combative', hi: 'Kind' },
  { k: 'neuroticism', lo: 'Calm', hi: 'Anxious' },
];

function CharacterDetail({ c, w }: { c: Character; w: World }) {
  const civ = w.civs[c.civId];
  const mood = moodLabel(c.mood);
  const isLeader = civ?.government.leaderId === c.id;
  const following = w.player.followedCharacterId === c.id;
  const [, force] = useState(0);
  const candidates = useMemo(() => (c.alive ? scoreActivities(w, new Rng(1), c, w.time).slice(0, 5) : []), [c, w, w.time]); // eslint-disable-line react-hooks/exhaustive-deps
  const rels = Object.entries(c.relationships)
    .map(([id, r]) => ({ o: w.characters[id], r }))
    .filter((x) => x.o)
    .sort((a, b) => Math.abs(b.r.affinity) - Math.abs(a.r.affinity));
  const events = c.eventIds.map((id) => w.events.find((e) => e.id === id)).filter(Boolean).reverse();
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="avatar" style={{ width: 52, height: 52, fontSize: 20, background: OCC_COLORS[c.occupation] }}>
          {c.givenName[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">
            {isLeader ? `${civ.government.leaderTitle} of the ${civ.name}` : OCCUPATIONS[c.occupation].label}
            {c.notable && ' · notable'}
          </div>
          <h2 style={{ margin: '4px 0 2px', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {fullName(c)}
            {!c.alive && ' †'}
          </h2>
          <div className="muted">
            {ageOf(c, w.time)} years · <CivLink id={c.civId} /> · lives in <SettlementLink id={c.settlementId} />
            {c.travel && <> (visiting, home is <SettlementLink id={c.homeSettlementId} />)</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {c.alive && (
            <button
              className={`btn ${following ? 'accent' : ''}`}
              onClick={() => {
                void sim.exec({ type: 'player', action: { type: 'follow', characterId: following ? null : c.id } }).then(() => force((x) => x + 1));
              }}
              data-testid="follow-btn"
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
          {c.alive && (
            <button className="btn primary" onClick={() => navigate(`explorer/${c.settlementId}`)}>
              <Icon.Explorer style={{ width: 15, height: 15 }} /> Find in Explorer
            </button>
          )}
        </div>
      </div>

      {c.alive ? (
        <div className="panel" style={{ marginTop: 18, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="eyebrow">Right now</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }} data-testid="char-activity">
                {c.activity.description}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                for another {formatDuration(Math.max(0, c.activity.endsAt - w.time))} · feeling <span className={mood.cls}>{mood.text.toLowerCase()}</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Decision — utility of options right now
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map((cd, i) => (
                <div key={cd.type + i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 46px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ textTransform: 'capitalize', color: i === 0 ? 'var(--accent)' : 'var(--text-2)' }}>{cd.type}</span>
                  <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cd.factors().join(' · ')}
                  </span>
                  <span className="mono" style={{ textAlign: 'right' }}>
                    {cd.score.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Chosen at the start of the activity: {c.activity.reason}
            </div>
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 18, padding: 16 }}>
          Died {formatDate(c.deathTime ?? 0, w.epochYear)} at {ageOf(c, w.time)}.
        </div>
      )}

      <div className="grid cols-2" style={{ gap: 32, marginTop: 8 }}>
        <div>
          <div className="section">
            <div className="section-title">
              <h3>Needs</h3>
              <span className="muted mono" style={{ fontSize: 12 }}>
                mood {c.mood.toFixed(0)} · health {c.health.toFixed(0)} · wealth {Math.round(c.wealth)}
              </span>
            </div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              {(Object.keys(c.needs) as (keyof Character['needs'])[]).map((k) => (
                <Meter key={k} label={k[0].toUpperCase() + k.slice(1)} value={c.needs[k]} />
              ))}
            </div>
          </div>
          <div className="section">
            <div className="section-title">
              <h3>Personality</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PERSONALITY.map((p) => (
                <div key={p.k} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 70px', gap: 10, alignItems: 'center', fontSize: 12 }}>
                  <span className="muted" style={{ textAlign: 'right' }}>
                    {p.lo}
                  </span>
                  <div className="bar">
                    <i style={{ width: `${c.personality[p.k] * 100}%`, background: 'var(--accent-2)' }} />
                  </div>
                  <span className="muted">{p.hi}</span>
                </div>
              ))}
            </div>
            <div className="chip-row" style={{ marginTop: 12 }}>
              {c.interests.map((i) => (
                <span key={i} className="tag">
                  {i}
                </span>
              ))}
            </div>
          </div>
          <div className="section">
            <div className="section-title">
              <h3>Skills</h3>
            </div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              {[...SKILLS]
                .sort((a, b) => c.skills[b] - c.skills[a])
                .map((s) => (
                  <Meter key={s} label={skillLabel(s)} value={c.skills[s]} right={c.skills[s].toFixed(0)} color="var(--accent)" />
                ))}
            </div>
          </div>
          <div className="section">
            <div className="section-title">
              <h3>Goals</h3>
            </div>
            {c.goals.length === 0 && <div className="muted">No active goals.</div>}
            {c.goals.map((g) => (
              <div key={g.id} style={{ marginBottom: 10 }}>
                <Meter label={g.description} value={g.progress * 100} right={`${Math.round(g.progress * 100)}%`} color="var(--good)" />
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  since {formatDate(g.createdAt, w.epochYear)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="section">
            <div className="section-title">
              <h3>Relationships</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                {rels.length}
              </span>
            </div>
            <EgoGraph c={c} w={w} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {rels.slice(0, 14).map(({ o, r }) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span>
                    <CharLink id={o.id} /> <span className="muted">· {r.kind.replace('_', ' ')}</span>
                  </span>
                  <span className={`mono ${r.affinity > 20 ? 'good' : r.affinity < -20 ? 'bad' : 'muted'}`}>{r.affinity > 0 ? '+' : ''}{r.affinity.toFixed(0)}</span>
                </div>
              ))}
            </div>
            {(c.parentIds.length > 0 || c.childIds.length > 0) && (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {c.parentIds.length > 0 && (
                  <div>
                    Parents:{' '}
                    {c.parentIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        <CharLink id={id} />
                      </span>
                    ))}
                  </div>
                )}
                {c.childIds.length > 0 && (
                  <div>
                    Children:{' '}
                    {c.childIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        <CharLink id={id} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="section">
            <div className="section-title">
              <h3>Memories</h3>
            </div>
            <div className="memories">
              {[...c.memories].reverse().map((m, i) => (
                <div key={i} className="memory">
                  <span className="mono muted">{formatDate(m.t, w.epochYear)}</span>
                  <span style={{ opacity: 0.55 + m.importance * 0.09 }} className={m.valence > 0.3 ? '' : m.valence < -0.3 ? 'warn' : 'dim'}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {c.recent.length > 0 && (
            <div className="section">
              <div className="section-title">
                <h3>Recent days</h3>
              </div>
              {[...c.recent].reverse().map((r, i) => (
                <div key={i} className="memory">
                  <span className="mono muted">{formatDate(r.t, w.epochYear, true).split(' · ')[1]}</span>
                  <span className="dim">{r.text}</span>
                </div>
              ))}
            </div>
          )}
          {events.length > 0 && (
            <div className="section">
              <div className="section-title">
                <h3>In the historical record</h3>
              </div>
              <div className="list" style={{ margin: '0 -12px' }}>
                {events.slice(0, 12).map((e) => (
                  <EventRow key={e!.id} e={e!} compact />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Small radial graph of a character's strongest relationships, with ties between them. */
function EgoGraph({ c, w }: { c: Character; w: World }) {
  const rels = Object.entries(c.relationships)
    .map(([id, r]) => ({ o: w.characters[id], r }))
    .filter((x) => x.o)
    .sort((a, b) => Math.abs(b.r.affinity) - Math.abs(a.r.affinity))
    .slice(0, 12);
  if (!rels.length) return <div className="muted">No relationships yet.</div>;
  const W = 420,
    H = 220,
    cx = W / 2,
    cy = H / 2;
  const pos = rels.map((x, i) => {
    const a = (i / rels.length) * Math.PI * 2 - Math.PI / 2;
    const r = 70 + (1 - Math.abs(x.r.affinity) / 100) * 30;
    return { ...x, x: cx + Math.cos(a) * r * 1.7, y: cy + Math.sin(a) * r * 0.95 };
  });
  const col = (k: string, aff: number) => (k === 'partner' ? '#ff8ac8' : k === 'family' ? '#f4c26b' : k === 'rival' ? '#ff7a7a' : aff > 30 ? '#6fe3a5' : '#45536b');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {pos.map((p, i) =>
        pos.slice(i + 1).map((q) =>
          p.o.relationships[q.o.id] && Math.abs(p.o.relationships[q.o.id].affinity) > 25 ? <line key={p.o.id + q.o.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(132,170,230,0.12)" /> : null,
        ),
      )}
      {pos.map((p) => (
        <line key={p.o.id} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={col(p.r.kind, p.r.affinity)} strokeWidth={1 + Math.abs(p.r.affinity) / 35} opacity={0.75} />
      ))}
      <circle cx={cx} cy={cy} r={11} fill={OCC_COLORS[c.occupation]} />
      {pos.map((p) => (
        <g key={p.o.id + 'n'} onClick={() => navigate(`characters/${p.o.id}`)} style={{ cursor: 'pointer' }}>
          <circle cx={p.x} cy={p.y} r={6} fill={OCC_COLORS[p.o.occupation]} opacity={p.o.alive ? 1 : 0.4} />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#a7b5cc">
            {p.o.givenName}
          </text>
        </g>
      ))}
    </svg>
  );
}
