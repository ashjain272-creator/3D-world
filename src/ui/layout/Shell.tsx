import { useEffect, type ReactNode } from 'react';
import { navigate, useRoute } from '../../state/router';
import { getWorld, useApp, useWorldVersion } from '../../state/store';
import { SPEEDS, formatDate, toDate } from '../../sim/time';
import { findEvent, fullName } from '../../sim/world';
import { Icon, Logo } from '../components/Icons';
import { Toasts } from '../components/common';
import { sim } from '../../state/runner';
import { ambient } from '../../audio/ambient';
import { useAmbientAudio } from '../../audio/useAmbient';

const NAV = [
  { id: 'universe', label: 'Universe', icon: Icon.Universe, key: '1' },
  { id: 'explorer', label: 'Explorer', icon: Icon.Explorer, key: '2' },
  { id: 'civilizations', label: 'Civs', icon: Icon.Civs, key: '3' },
  { id: 'characters', label: 'People', icon: Icon.Characters, key: '4' },
  { id: 'history', label: 'History', icon: Icon.History, key: '5' },
  { id: 'discoveries', label: 'Discovery', icon: Icon.Discoveries, key: '6' },
  { id: 'creator', label: 'Creator', icon: Icon.Creator, key: '7' },
];

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const setSpeed = useApp((s) => s.setSpeed);
  useAmbientAudio();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (route.section === 'explorer' && document.pointerLockElement) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const nav = NAV.find((n) => n.key === e.key);
      if (nav && route.section !== 'explorer') {
        navigate(nav.id);
        return;
      }
      if (e.key === ' ' && route.section !== 'explorer') {
        e.preventDefault();
        const s = useApp.getState();
        s.setSpeed(s.speed === 0 ? 1 : 0);
      }
      if ((e.key === '+' || e.key === '=') && route.section !== 'explorer') setSpeed(Math.min(5, useApp.getState().speed + 1));
      if ((e.key === '-' || e.key === '_') && route.section !== 'explorer') setSpeed(Math.max(0, useApp.getState().speed - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.section, setSpeed]);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="rail-logo" onClick={() => navigate('universe')} title="Universe overview">
          <Logo />
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`rail-item ${route.section === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)} title={`${n.label} (${n.key})`} data-nav={n.id}>
            <n.icon />
            {n.label}
          </button>
        ))}
        <div className="rail-spacer" />
        <button className={`rail-item ${route.section === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} data-nav="settings">
          <Icon.Settings />
          Settings
        </button>
      </nav>
      <header className="topbar">
        <Breadcrumbs />
        <FollowWidget />
        <div className="topbar-spacer" />
        <SoundToggle />
        <TimeControl />
      </header>
      <main className="main">{children}</main>
      <Toasts />
    </div>
  );
}

function Breadcrumbs() {
  const route = useRoute();
  useWorldVersion();
  const w = getWorld();
  const items: { label: string; to?: string }[] = [{ label: w.galaxy.name, to: 'universe' }];
  const sec = route.section;
  const p = route.parts;
  if (sec === 'universe') {
    if (p[0] === 'system' && w.systems[p[1]]) items.push({ label: w.systems[p[1]].name });
    if (p[0] === 'planet' && w.planets[p[1]]) {
      const pl = w.planets[p[1]];
      items.push({ label: w.systems[pl.systemId]?.name ?? '', to: `universe/system/${pl.systemId}` });
      items.push({ label: pl.name, to: p[2] ? `universe/planet/${pl.id}` : undefined });
      if (p[2] && w.settlements[p[2]]) items.push({ label: w.settlements[p[2]].name });
    }
  } else {
    const label = { explorer: 'Explorer', civilizations: 'Civilizations', characters: 'Characters', history: 'History', discoveries: 'Discoveries', creator: 'Creator Console', settings: 'Settings' }[sec] ?? sec;
    items.push({ label, to: p.length ? sec : undefined });
    if (sec === 'civilizations' && p[0] && w.civs[p[0]]) items.push({ label: w.civs[p[0]].name });
    if (sec === 'characters' && p[0] && w.characters[p[0]]) items.push({ label: fullName(w.characters[p[0]]) });
    if (sec === 'history' && p[0]) items.push({ label: findEvent(w, p[0])?.title ?? 'Event' });
    if (sec === 'explorer' && p[0]) {
      const s = w.settlements[p[0]];
      if (s) items.push({ label: s.name });
      else if (w.planets[p[0]]) items.push({ label: `${w.planets[p[0]].name} · ${w.planets[p[0]].regions[Number(p[1])]?.name ?? (w.planets[p[0]].regions.length ? 'wilds' : 'cloud platforms')}` });
    }
  }
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {i > 0 && <span className="sep">/</span>}
          {it.to && i < items.length - 1 ? <button onClick={() => navigate(it.to!)}>{it.label}</button> : <span className="here">{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

function TimeControl() {
  useWorldVersion();
  const speed = useApp((s) => s.speed);
  const setSpeed = useApp((s) => s.setSpeed);
  const w = getWorld();
  const d = toDate(w.time, w.epochYear);
  const hh = String(d.hour).padStart(2, '0');
  const mm = String(d.minute).padStart(2, '0');
  return (
    <div className="timectl" data-testid="time-control">
      <div className="clock">
        <div className="date mono" data-testid="sim-date">
          {formatDate(w.time, w.epochYear)}
        </div>
        <div className="tod mono">
          {hh}:{mm} · {SPEEDS[speed].label}
        </div>
      </div>
      <div className="speeds" role="group" aria-label="Simulation speed">
        {SPEEDS.map((s) => (
          <button key={s.id} className={speed === s.id ? 'on' : ''} onClick={() => setSpeed(s.id)} title={`${s.label}${s.rate ? ` — ${s.rate >= 1440 ? `${s.rate / 1440} day(s)` : `${s.rate} min`} per second` : ''}`} data-speed={s.id}>
            {s.id === 0 ? <Icon.Pause style={{ width: 11, height: 11, verticalAlign: -1 }} /> : s.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function FollowWidget() {
  useWorldVersion();
  const route = useRoute();
  const w = getWorld();
  const id = w.player.followedCharacterId;
  const c = id ? w.characters[id] : undefined;
  if (!c || route.section === 'explorer' || (route.section === 'characters' && route.parts[0] === id)) return null;
  return (
    <div className="follow-widget panel" onClick={() => navigate(`characters/${c.id}`)} data-testid="follow-widget">
      <div className="avatar" style={{ background: w.civs[c.civId]?.color ?? '#6fd6ff', width: 30, height: 30, fontSize: 13 }}>
        {c.givenName[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="eyebrow" style={{ fontSize: 9.5 }}>Following</div>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fullName(c)}
          {!c.alive && ' †'}
        </div>
        <div className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.alive ? c.activity.description : 'Has passed away'} · {w.settlements[c.settlementId]?.name}
        </div>
      </div>
      <button
        className="btn sm ghost"
        onClick={(e) => {
          e.stopPropagation();
          void sim.exec({ type: 'player', action: { type: 'follow', characterId: null } });
        }}
        aria-label="Stop following"
      >
        <Icon.Close style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
}

function SoundToggle() {
  const on = useApp((s) => s.settings.audioEnabled);
  const update = useApp((s) => s.updateSettings);
  return (
    <button
      className="btn sm ghost sound-toggle"
      data-testid="audio-toggle"
      aria-pressed={on}
      title={on ? 'Mute ambient sound' : 'Turn on ambient sound'}
      onClick={() => {
        if (!on) ambient.enable();
        update({ audioEnabled: !on });
      }}
    >
      {on ? <Icon.Sound style={{ width: 16, height: 16 }} /> : <Icon.Muted style={{ width: 16, height: 16 }} />}
    </button>
  );
}
