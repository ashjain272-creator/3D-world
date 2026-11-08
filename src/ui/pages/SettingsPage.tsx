import { useRef, useState, type ReactNode } from 'react';
import { exportWorld, importWorld } from '../../persistence/db';
import { randomSeed } from '../../sim/generate/universe';
import { formatDate } from '../../sim/time';
import { adoptWorld, replaceUniverse } from '../../state/boot';
import { saveNow } from '../../state/runner';
import { getWorld, useApp, useWorldVersion } from '../../state/store';
import type { Quality } from '../../state/settings';
import { Confirm } from '../components/common';

function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="label">{label}</div>
        {help && <div className="help">{help}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  useWorldVersion();
  const s = useApp((x) => x.settings);
  const update = useApp((x) => x.updateSettings);
  const toast = useApp((x) => x.toast);
  const setOnboarding = useApp((x) => x.setOnboardingDone);
  const w = getWorld();
  const [seed, setSeed] = useState(randomSeed());
  const [confirmNew, setConfirmNew] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const living = Object.values(w.characters).filter((c) => c.alive).length;
  return (
    <div className="page" data-testid="settings-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="page-title">Simulation & application</h1>
        </div>
      </div>
      <div style={{ maxWidth: 820 }}>
        <div className="section-title">
          <h3>Graphics</h3>
        </div>
        <Row label="Rendering quality" help="Shadows, vegetation density, particle counts and resolution.">
          <div className="speeds">
            {(['low', 'medium', 'high'] as Quality[]).map((q) => (
              <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => update({ quality: q })} style={{ textTransform: 'capitalize', minWidth: 70 }}>
                {q}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Interface refresh rate" help="How often screens update with simulation data.">
          <select className="input" value={s.uiRefreshHz} onChange={(e) => update({ uiRefreshHz: Number(e.target.value) })} style={{ width: '100%' }}>
            {[1, 2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n} per second
              </option>
            ))}
          </select>
        </Row>
        <div className="section-title" style={{ marginTop: 28 }}>
          <h3>Explorer controls</h3>
        </div>
        <Row label="Mouse sensitivity">
          <input type="range" min={0.3} max={2.5} step={0.1} value={s.mouseSensitivity} onChange={(e) => update({ mouseSensitivity: Number(e.target.value) })} style={{ width: '100%' }} />
        </Row>
        <Row label="Invert vertical look">
          <input type="checkbox" checked={s.invertY} onChange={(e) => update({ invertY: e.target.checked })} />
        </Row>
        <div className="section-title" style={{ marginTop: 28 }}>
          <h3>Simulation</h3>
        </div>
        <Row label="Notifications" help="Show a toast for events at or above this importance.">
          <select className="input" value={s.notifyImportance} onChange={(e) => update({ notifyImportance: Number(e.target.value) as 3 | 4 | 5 })} style={{ width: '100%' }}>
            <option value={3}>Notable (3+)</option>
            <option value={4}>Major (4+)</option>
            <option value={5}>Epochal only (5)</option>
          </select>
        </Row>
        <Row label="Progress while away" help="When you return, time catches up at real-time speed (10 sim-minutes per second away), up to a cap.">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={s.offlineProgress} onChange={(e) => update({ offlineProgress: e.target.checked })} />
            <select className="input" value={s.offlineCapDays} onChange={(e) => update({ offlineCapDays: Number(e.target.value) })} disabled={!s.offlineProgress} style={{ flex: 1 }}>
              {[7, 30, 90, 360].map((d) => (
                <option key={d} value={d}>
                  up to {d} days
                </option>
              ))}
            </select>
          </div>
        </Row>
        <Row label="Autosave" help="The universe is stored locally in your browser (IndexedDB).">
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" value={s.autosaveSeconds} onChange={(e) => update({ autosaveSeconds: Number(e.target.value) })} style={{ flex: 1 }}>
              {[15, 30, 60, 120].map((n) => (
                <option key={n} value={n}>
                  every {n}s
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={async () => {
                if (await saveNow()) toast({ kind: 'success', title: 'Universe saved' });
              }}
              data-testid="save-now"
            >
              Save now
            </button>
          </div>
        </Row>
        <Row label="Cinematic introduction" help="Play the intro when creating a new universe.">
          <input type="checkbox" checked={s.showIntro} onChange={(e) => update({ showIntro: e.target.checked })} />
        </Row>
        <Row label="Welcome guide">
          <button className="btn sm" onClick={() => setOnboarding(false)}>
            Show again
          </button>
        </Row>
        <div className="section-title" style={{ marginTop: 28 }}>
          <h3>Universe</h3>
        </div>
        <dl className="kv" style={{ margin: '12px 0 18px' }}>
          <dt>Galaxy</dt>
          <dd>{w.galaxy.name}</dd>
          <dt>Seed</dt>
          <dd className="mono">{w.seed}</dd>
          <dt>Current date</dt>
          <dd>{formatDate(w.time, w.epochYear, true)}</dd>
          <dt>Created</dt>
          <dd>{w.createdAtReal ? new Date(w.createdAtReal).toLocaleString() : '—'}</dd>
          <dt>Last saved</dt>
          <dd>{w.savedAtReal ? new Date(w.savedAtReal).toLocaleString() : '—'}</dd>
          <dt>Contents</dt>
          <dd>
            {Object.keys(w.systems).length} systems · {Object.keys(w.planets).length} planets · {Object.keys(w.civs).length} civilisations · {living} living inhabitants · {w.events.length} events
          </dd>
        </dl>
        <Row label="Export universe" help="Download the complete state as a JSON file.">
          <button
            className="btn"
            onClick={() => {
              const url = URL.createObjectURL(exportWorld(w));
              const a = document.createElement('a');
              a.href = url;
              a.download = `genesis-${w.seed}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
            }}
          >
            Export…
          </button>
        </Row>
        <Row label="Import universe" help="Replace the current universe with an exported file. Damaged files are rejected.">
          <button className="btn" onClick={() => file.current?.click()}>
            Import…
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                adoptWorld(await importWorld(f));
                toast({ kind: 'success', title: 'Universe imported' });
              } catch (err) {
                toast({ kind: 'error', title: 'Import failed', body: (err as Error).message });
              }
              e.target.value = '';
            }}
          />
        </Row>
        <Row label="Begin a new universe" help="Generates a fresh universe from a seed. The current one is permanently replaced.">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input mono" value={seed} onChange={(e) => setSeed(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn danger" onClick={() => setConfirmNew(true)} data-testid="new-universe">
              Generate
            </button>
          </div>
        </Row>
      </div>
      {confirmNew && (
        <Confirm
          title="Replace this universe?"
          body={`${w.galaxy.name} and its ${w.events.length.toLocaleString()} recorded events will be lost unless you export them first.`}
          danger
          confirmLabel="Replace universe"
          onCancel={() => setConfirmNew(false)}
          onConfirm={() => {
            setConfirmNew(false);
            void replaceUniverse(seed.trim() || randomSeed());
          }}
        />
      )}
    </div>
  );
}
