import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../../state/router';
import { getWorld, useApp } from '../../state/store';
import { formatDate } from '../../sim/time';
import { findEvent, fullName } from '../../sim/world';
import type { EventCategory, HistoryEvent } from '../../sim/types';
import { Icon } from './Icons';

export function CivLink({ id }: { id: string }) {
  const civ = getWorld().civs[id];
  if (!civ) return <span className="muted">unknown</span>;
  return (
    <button className="link" onClick={() => navigate(`civilizations/${id}`)} style={{ color: civ.color }}>
      {civ.name}
    </button>
  );
}

export function CharLink({ id, short }: { id: string; short?: boolean }) {
  const c = getWorld().characters[id];
  if (!c) return <span className="muted">unknown</span>;
  return (
    <button className="link" onClick={() => navigate(`characters/${id}`)} style={{ opacity: c.alive ? 1 : 0.7 }}>
      {short ? c.givenName : fullName(c)}
      {!c.alive && ' †'}
    </button>
  );
}

export function SettlementLink({ id }: { id: string }) {
  const s = getWorld().settlements[id];
  if (!s) return <span className="muted">unknown</span>;
  return (
    <button className="link" onClick={() => navigate(`universe/planet/${s.planetId}/${s.id}`)}>
      {s.name}
    </button>
  );
}

export function PlanetLink({ id }: { id: string }) {
  const p = getWorld().planets[id];
  if (!p) return <span className="muted">unknown</span>;
  return (
    <button className="link" onClick={() => navigate(`universe/planet/${id}`)}>
      {p.name}
    </button>
  );
}

export function EventLink({ id }: { id: string }) {
  const e = findEvent(getWorld(), id);
  if (!e) return <span className="muted">a forgotten event</span>;
  return (
    <button className="link" onClick={() => navigate(`history/${id}`)}>
      {e.title}
    </button>
  );
}

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  founding: '#6fd6ff',
  discovery: '#9d8bff',
  economy: '#f4c26b',
  politics: '#ff9f6a',
  diplomacy: '#6fe3a5',
  culture: '#ff8ac4',
  population: '#a7b5cc',
  environment: '#7fcf7a',
  exploration: '#5fd4ff',
  personal: '#8a9bb8',
  intervention: '#ffffff',
  cosmic: '#b8c8ff',
};

export function EventRow({ e, onClick, compact }: { e: HistoryEvent; onClick?: () => void; compact?: boolean }) {
  const w = getWorld();
  return (
    <div className="row" onClick={onClick ?? (() => navigate(`history/${e.id}`))} style={{ alignItems: 'flex-start' }}>
      <span className="dot" style={{ background: CATEGORY_COLORS[e.category], marginTop: 7, opacity: 0.4 + e.importance * 0.12 }} />
      <div className="grow">
        <div className="title" style={{ whiteSpace: compact ? 'nowrap' : 'normal' }}>
          {e.title}
        </div>
        <div className="sub">
          {formatDate(e.t, w.epochYear)} · {e.category}
          {e.source !== 'simulation' && <span> · {e.source === 'creator' ? 'creator' : 'chronicle'}</span>}
        </div>
      </div>
      <Importance n={e.importance} />
    </div>
  );
}

export function Importance({ n }: { n: number }) {
  return (
    <span style={{ display: 'flex', gap: 2, marginTop: 7 }} title={`Importance ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} style={{ width: 3, height: 8, borderRadius: 1, background: i <= n ? 'var(--accent)' : 'rgba(132,170,230,0.12)' }} />
      ))}
    </span>
  );
}

export function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => {
            if (t.eventId) navigate(`history/${t.eventId}`);
            dismiss(t.id);
          }}
        >
          <div className="t">{t.title}</div>
          {t.body && <div className="b">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon.Search style={{ position: 'absolute', left: 10, top: 9, width: 16, height: 16, color: 'var(--muted)' }} />
      <input className="input" style={{ paddingLeft: 32, width: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/** Re-render a component every `ms` (for clocks / live activity text). */
export function useTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return n;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function moodLabel(m: number): { text: string; cls: string } {
  if (m > 50) return { text: 'Elated', cls: 'good' };
  if (m > 20) return { text: 'Content', cls: 'good' };
  if (m > -10) return { text: 'Steady', cls: 'dim' };
  if (m > -40) return { text: 'Troubled', cls: 'warn' };
  return { text: 'Despairing', cls: 'bad' };
}
