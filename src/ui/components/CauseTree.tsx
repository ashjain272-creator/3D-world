import { useState } from 'react';
import type { HistoryEvent } from '../../sim/types';
import { formatDate } from '../../sim/time';
import { navigate } from '../../state/router';
import { getWorld } from '../../state/store';
import { resolveEvent, useArchiveUpdates } from '../../state/historyClient';
import { CATEGORY_COLORS } from './common';

/**
 * Collapsible causal tree. Walks causes (backward) or consequences (forward)
 * up to `maxDepth` levels; the first `openDepth` levels start expanded.
 * Archived events are loaded on demand.
 */
export function CauseTree({ root, direction, maxDepth = 6, openDepth = 2 }: { root: HistoryEvent; direction: 'back' | 'forward'; maxDepth?: number; openDepth?: number }) {
  useArchiveUpdates();
  const ids = direction === 'back' ? root.causeIds : root.consequenceIds;
  if (!ids.length) return <div className="muted" style={{ fontSize: 13 }}>{direction === 'back' ? (root.root ? 'A root event: it has no prior cause in history.' : 'No recorded causes.') : 'No later events cite this one — yet.'}</div>;
  return (
    <ul className="ctree" data-testid={`cause-tree-${direction}`}>
      {ids.map((id) => (
        <Node key={id} id={id} depth={1} direction={direction} maxDepth={maxDepth} openDepth={openDepth} trail={[root.id]} />
      ))}
    </ul>
  );
}

function Node({ id, depth, direction, maxDepth, openDepth, trail }: { id: string; depth: number; direction: 'back' | 'forward'; maxDepth: number; openDepth: number; trail: string[] }) {
  const [open, setOpen] = useState(depth < openDepth);
  const r = resolveEvent(id);
  if (r === 'loading') return <li className="ctree-node muted">Loading archived event…</li>;
  if (r === 'missing') return <li className="ctree-node muted">An event outside recorded history</li>;
  const e = r;
  const next = (direction === 'back' ? e.causeIds : e.consequenceIds).filter((x) => !trail.includes(x));
  const canOpen = next.length > 0 && depth < maxDepth;
  const w = getWorld();
  return (
    <li className="ctree-node" data-depth={depth}>
      <div className="ctree-row">
        <button className={`ctree-toggle ${canOpen ? '' : 'leaf'}`} onClick={() => canOpen && setOpen(!open)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
          {canOpen ? (open ? '−' : '+') : '·'}
        </button>
        <span className="dot" style={{ background: CATEGORY_COLORS[e.category] }} />
        <button className="link ctree-title" onClick={() => navigate(`history/${e.id}`)}>
          {e.title}
        </button>
        <span className="mono muted ctree-date">{formatDate(e.t, w.epochYear)}</span>
        {e.compactedCount ? <span className="tag">summary of {e.compactedCount}</span> : null}
        {(e.rootSource ?? e.source) === 'creator' && <span className="tag accent">creator</span>}
      </div>
      {open && canOpen && (
        <ul className="ctree">
          {next.slice(0, 8).map((n) => (
            <Node key={n} id={n} depth={depth + 1} direction={direction} maxDepth={maxDepth} openDepth={openDepth} trail={[...trail, e.id]} />
          ))}
          {next.length > 8 && <li className="ctree-node muted">…and {next.length - 8} more</li>}
        </ul>
      )}
    </li>
  );
}
