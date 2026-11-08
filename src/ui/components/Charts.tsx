import { useMemo, useState } from 'react';

export interface Series {
  label: string;
  color: string;
  values: { x: number; y: number }[];
}

interface LineChartProps {
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  xFormat?: (v: number) => string;
  yMin?: number;
  yMax?: number;
}

/** Lightweight SVG line chart with hover readout. */
export function LineChart({ series, height = 180, format = (v) => v.toFixed(0), xFormat = (v) => String(v), yMin, yMax }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values);
  const { x0, x1, y0, y1 } = useMemo(() => {
    if (!all.length) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of all) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    if (yMin !== undefined) y0 = yMin;
    if (yMax !== undefined) y1 = yMax;
    if (y1 - y0 < 1e-9) {
      y1 += 1;
      y0 -= 1;
    }
    const padY = (y1 - y0) * 0.08;
    return { x0, x1: x1 === x0 ? x0 + 1 : x1, y0: yMin ?? y0 - padY, y1: yMax ?? y1 + padY };
  }, [all, yMin, yMax]);
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  if (!all.length) return <div className="empty">Not enough data yet — history accumulates as time passes.</div>;
  const ticks = [0, 0.5, 1].map((f) => y0 + (y1 - y0) * f);
  const hx = hover !== null ? x0 + ((hover - pad.l) / (W - pad.l - pad.r)) * (x1 - x0) : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(((e.clientX - r.left) / r.width) * W);
        }}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgba(132,170,230,0.08)" />
            <text x={pad.l - 8} y={sy(t) + 3} textAnchor="end" fontSize="10" fill="#6c7c97" fontFamily="JetBrains Mono, monospace">
              {format(t)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} fontSize="10" fill="#6c7c97" fontFamily="JetBrains Mono, monospace">
          {xFormat(x0)}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize="10" fill="#6c7c97" textAnchor="end" fontFamily="JetBrains Mono, monospace">
          {xFormat(x1)}
        </text>
        {series.map((s) => {
          if (!s.values.length) return null;
          const d = s.values.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
          const area = `${d}L${sx(s.values[s.values.length - 1].x)},${sy(y0)}L${sx(s.values[0].x)},${sy(y0)}Z`;
          return (
            <g key={s.label}>
              {series.length === 1 && <path d={area} fill={s.color} opacity={0.07} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover !== null && hover > pad.l && hover < W - pad.r && <line x1={hover} x2={hover} y1={pad.t} y2={H - pad.b} stroke="rgba(132,170,230,0.25)" />}
      </svg>
      {hx !== null && hover! > pad.l && hover! < W - pad.r && (
        <div className="panel" style={{ position: 'absolute', top: 4, left: `${Math.min(70, (hover! / W) * 100)}%`, padding: '6px 9px', fontSize: 11, pointerEvents: 'none' }}>
          <div className="muted mono">{xFormat(hx)}</div>
          {series.map((s) => {
            const p = nearest(s.values, hx);
            return p ? (
              <div key={s.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="dot" style={{ background: s.color }} />
                <span className="dim">{s.label}</span>
                <span className="mono">{format(p.y)}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="chip-row" style={{ marginTop: 6 }}>
          {series.map((s) => (
            <span key={s.label} className="tag">
              <span className="dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function nearest(values: { x: number; y: number }[], x: number) {
  let best = values[0];
  let d = Infinity;
  for (const v of values) {
    const dd = Math.abs(v.x - x);
    if (dd < d) {
      d = dd;
      best = v;
    }
  }
  return best;
}

export function Sparkline({ values, color = '#6fd6ff', width = 90, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const r = max - min || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / r) * (height - 4)).toFixed(1)}`).join('');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} />
    </svg>
  );
}

/** Horizontal contribution bars (positive/negative) for transparent breakdowns. */
export function Breakdown({ items, unit = '' }: { items: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 54px', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span className="dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {i.label}
          </span>
          <div style={{ position: 'relative', height: 6, background: 'rgba(132,170,230,0.06)', borderRadius: 3 }}>
            <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'rgba(132,170,230,0.2)' }} />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                borderRadius: 3,
                background: i.value >= 0 ? 'var(--good)' : 'var(--bad)',
                left: i.value >= 0 ? '50%' : `${50 - (Math.abs(i.value) / max) * 50}%`,
                width: `${(Math.abs(i.value) / max) * 50}%`,
                opacity: 0.8,
              }}
            />
          </div>
          <span className={`mono ${i.value >= 0 ? 'good' : 'bad'}`} style={{ textAlign: 'right' }}>
            {i.value >= 0 ? '+' : ''}
            {i.value.toFixed(1)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Meter({ value, max = 100, color, label, right }: { value: number; max?: number; color?: string; label?: string; right?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color ?? (pct > 66 ? 'var(--good)' : pct > 33 ? 'var(--accent)' : 'var(--warn)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span className="dim">{label}</span>
          <span className="mono">{right ?? Math.round(value)}</span>
        </div>
      )}
      <div className="bar">
        <i style={{ width: `${pct}%`, background: c }} />
      </div>
    </div>
  );
}
