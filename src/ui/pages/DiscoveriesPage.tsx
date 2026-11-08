import { useState } from 'react';
import { CATEGORY_LABEL } from '../../sim/data/society';
import { TECHS } from '../../sim/data/techs';
import { describeTechEffects } from '../../sim/systems/technology';
import type { TechCategory, TechDef, World } from '../../sim/types';
import { formatDate } from '../../sim/time';
import { navigate } from '../../state/router';
import { getWorld, useWorldVersion } from '../../state/store';
import { CharLink, CivLink, EventLink } from '../components/common';

const CATS: TechCategory[] = ['agriculture', 'industry', 'energy', 'society', 'medicine', 'science', 'space'];

export function DiscoveriesPage() {
  useWorldVersion();
  const w = getWorld();
  const [sel, setSel] = useState<string | null>(null);
  const all = [...TECHS, ...w.customTechs];
  const civs = Object.values(w.civs);
  const tech = sel ? all.find((t) => t.id === sel) : null;
  const discoveredByAny = all.filter((t) => civs.some((c) => c.tech.known.includes(t.id))).length;
  return (
    <div className="page" data-testid="discoveries-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Discoveries</div>
          <h1 className="page-title">Knowledge of the galaxy</h1>
          <p className="page-sub">
            {discoveredByAny} of {all.length} technologies are known somewhere. Each civilisation researches according to its culture and its current needs; allies share progress, and explorers' finds can accelerate research.
          </p>
        </div>
        <div className="chip-row">
          {civs.map((c) => (
            <span key={c.id} className="tag">
              <span className="dot" style={{ background: c.color }} />
              {c.adjective}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: tech ? '1fr 340px' : '1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ overflowX: 'auto' }}>
          <div className="techgrid">
            <div />
            {[1, 2, 3, 4, 5].map((t) => (
              <div key={t} className="eyebrow" style={{ textAlign: 'center' }}>
                Tier {t}
              </div>
            ))}
            {CATS.map((cat) => (
              <Row key={cat} cat={cat} w={w} sel={sel} onSel={setSel} techs={TECHS.filter((t) => t.category === cat)} />
            ))}
          </div>
          {w.customTechs.length > 0 && (
            <div className="section">
              <div className="section-title">
                <h3>Creator revelations</h3>
              </div>
              <div className="chip-row">
                {w.customTechs.map((t) => (
                  <TechNode key={t.id} t={t} w={w} sel={sel === t.id} onSel={setSel} />
                ))}
              </div>
            </div>
          )}
          <Exploration w={w} />
        </div>
        {tech && <TechPanel t={tech} w={w} onClose={() => setSel(null)} />}
      </div>
    </div>
  );
}

function Row({ cat, w, sel, onSel, techs }: { cat: TechCategory; w: World; sel: string | null; onSel: (id: string) => void; techs: TechDef[] }) {
  return (
    <>
      <div className="eyebrow" style={{ alignSelf: 'center' }}>
        {CATEGORY_LABEL[cat]}
      </div>
      {[1, 2, 3, 4, 5].map((tier) => (
        <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {techs
            .filter((t) => t.tier === tier)
            .map((t) => (
              <TechNode key={t.id} t={t} w={w} sel={sel === t.id} onSel={onSel} />
            ))}
        </div>
      ))}
    </>
  );
}

function TechNode({ t, w, sel, onSel }: { t: TechDef; w: World; sel: boolean; onSel: (id: string) => void }) {
  const civs = Object.values(w.civs);
  const knowers = civs.filter((c) => c.tech.known.includes(t.id));
  const researching = civs.filter((c) => c.tech.researching === t.id);
  const first = w.firstDiscoveries[t.id];
  return (
    <button className={`technode ${sel ? 'sel' : ''} ${knowers.length ? 'known' : ''}`} onClick={() => onSel(t.id)} data-testid="tech-node">
      <span className="name">{t.name}</span>
      <span className="meta">
        {knowers.map((c) => (
          <span key={c.id} className="dot" style={{ background: c.color }} />
        ))}
        {researching.map((c) => (
          <span key={c.id + 'r'} className="dot" style={{ border: `1px solid ${c.color}`, background: 'transparent' }} title={`${c.name} researching`} />
        ))}
        {first && <span className="muted" style={{ fontSize: 10 }}>★</span>}
      </span>
    </button>
  );
}

function TechPanel({ t, w, onClose }: { t: TechDef; w: World; onClose: () => void }) {
  const first = w.firstDiscoveries[t.id];
  const civs = Object.values(w.civs);
  return (
    <div className="panel sticky" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="eyebrow">
          {CATEGORY_LABEL[t.category]} · tier {t.tier}
        </div>
        <button className="link muted" onClick={onClose}>
          close
        </button>
      </div>
      <h3 style={{ margin: '6px 0', fontSize: 18 }}>{t.name}</h3>
      <p className="dim" style={{ marginTop: 0 }}>
        {t.description}
      </p>
      <dl className="kv">
        <dt>Research cost</dt>
        <dd className="mono">{t.cost}</dd>
        <dt>Requires</dt>
        <dd>{t.prereqs.length ? t.prereqs.map((p) => TECHS.find((x) => x.id === p)?.name ?? p).join(', ') : 'nothing'}</dd>
        {describeTechEffects(t).map((fx, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <dt>{fx.label}</dt>
            <dd>{fx.after}</dd>
          </span>
        ))}
      </dl>
      <div className="section">
        <div className="section-title">
          <h3>First discovery</h3>
        </div>
        {first ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>
              <CivLink id={first.civId} />, {formatDate(first.t, w.epochYear)}
            </span>
            {first.characterId && (
              <span className="muted">
                credited to <CharLink id={first.characterId} />
              </span>
            )}
            <EventLink id={first.eventId} />
          </div>
        ) : civs.some((c) => c.tech.known.includes(t.id)) ? (
          <span className="muted">Known since before Genesis.</span>
        ) : (
          <span className="muted">Not yet discovered.</span>
        )}
      </div>
      <div className="section">
        <div className="section-title">
          <h3>Status by civilisation</h3>
        </div>
        {civs.map((c) => {
          const known = c.tech.known.includes(t.id);
          const active = c.tech.researching === t.id;
          const prog = c.tech.progress + (c.tech.boosts[t.id] ?? 0);
          return (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                <span className="dot" style={{ background: c.color, marginRight: 6 }} />
                {c.adjective}
              </span>
              <span className={known ? 'good' : active ? 'warn' : 'muted'}>{known ? 'known' : active ? `researching ${Math.round((prog / t.cost) * 100)}%` : t.prereqs.every((p) => c.tech.known.includes(p)) ? 'available' : 'locked'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Exploration({ w }: { w: World }) {
  const planets = Object.values(w.planets).filter((p) => p.regions.length);
  const landmarks = Object.values(w.settlements).flatMap((s) => s.landmarks.map((l) => ({ l, s })));
  const found = landmarks.filter(({ l }) => w.player.discoveredLandmarkIds.includes(l.id));
  const natural = w.player.discoveredLandmarkIds.filter((id) => id.includes(':'));
  return (
    <div className="section">
      <div className="section-title">
        <h3>Exploration</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          {found.length + natural.length} places visited by you · {w.player.conversations} conversations
        </span>
      </div>
      <div className="grid cols-2" style={{ gap: 28 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Charted regions
          </div>
          {planets.map((p) => {
            const ex = p.regions.filter((r) => r.explored).length;
            return (
              <div key={p.id} className="row" style={{ margin: '0 -12px' }} onClick={() => navigate(`universe/planet/${p.id}`)}>
                <div className="grow">
                  <div className="title">{p.name}</div>
                  <div className="bar" style={{ marginTop: 6 }}>
                    <i style={{ width: `${(ex / p.regions.length) * 100}%` }} />
                  </div>
                </div>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {ex}/{p.regions.length}
                </span>
              </div>
            );
          })}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Landmarks
          </div>
          {landmarks.map(({ l, s }) => {
            const seen = w.player.discoveredLandmarkIds.includes(l.id);
            return (
              <div key={l.id} className="row" style={{ margin: '0 -12px' }} onClick={() => navigate(`explorer/${s.id}`)}>
                <span className="dot" style={{ background: seen ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)' }} />
                <div className="grow">
                  <div className="title">{seen ? l.name : 'Undiscovered landmark'}</div>
                  <div className="sub">
                    {s.name} · {seen ? l.description : 'Visit in Explorer to reveal'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
