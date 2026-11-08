import { Component, lazy, Suspense, useRef, type ReactNode } from 'react';
import { useRoute, navigate } from '../state/router';
import { useApp } from '../state/store';
import { replaceUniverse, adoptWorld } from '../state/boot';
import { importWorld } from '../persistence/db';
import { randomSeed } from '../sim/generate/universe';
import { formatDuration } from '../sim/time';
import { Shell } from './layout/Shell';
import { Intro } from './Intro';
import { Onboarding } from './Onboarding';
import { Logo } from './components/Icons';
import { UniversePage } from './pages/UniversePage';

const ExplorerPage = lazy(() => import('./pages/ExplorerPage').then((m) => ({ default: m.ExplorerPage })));
const CivilizationsPage = lazy(() => import('./pages/CivilizationsPage').then((m) => ({ default: m.CivilizationsPage })));
const CharactersPage = lazy(() => import('./pages/CharactersPage').then((m) => ({ default: m.CharactersPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const DiscoveriesPage = lazy(() => import('./pages/DiscoveriesPage').then((m) => ({ default: m.DiscoveriesPage })));
const CreatorPage = lazy(() => import('./pages/CreatorPage').then((m) => ({ default: m.CreatorPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error) {
    console.error('[Genesis] view crashed', error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="page">
          <div className="empty">
            <h3 style={{ color: 'var(--text)' }}>This view hit a problem</h3>
            <p className="mono" style={{ fontSize: 12 }}>
              {this.state.error.message}
            </p>
            <p>The simulation keeps running. You can return to the universe overview.</p>
            <button className="btn" onClick={() => navigate('universe')}>
              Back to Universe
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

function Loading() {
  return (
    <div className="loading-veil">
      <div className="spinner" />
    </div>
  );
}

function Page() {
  const route = useRoute();
  let el: ReactNode;
  switch (route.section) {
    case 'explorer':
      el = <ExplorerPage />;
      break;
    case 'civilizations':
      el = <CivilizationsPage />;
      break;
    case 'characters':
      el = <CharactersPage />;
      break;
    case 'history':
      el = <HistoryPage />;
      break;
    case 'discoveries':
      el = <DiscoveriesPage />;
      break;
    case 'creator':
      el = <CreatorPage />;
      break;
    case 'settings':
      el = <SettingsPage />;
      break;
    default:
      el = <UniversePage />;
  }
  return (
    <ErrorBoundary resetKey={route.section + route.parts.join('/')}>
      <Suspense fallback={<Loading />}>{el}</Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  const phase = useApp((s) => s.phase);
  const onboardingDone = useApp((s) => s.onboardingDone);
  if (phase === 'boot')
    return (
      <div className="center-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Logo size={44} />
          <div className="spinner" />
        </div>
      </div>
    );
  if (phase === 'intro') return <Intro />;
  if (phase === 'generating')
    return (
      <div className="center-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <Logo size={44} />
          <div className="eyebrow">Generating universe</div>
          <div className="spinner" />
        </div>
      </div>
    );
  if (phase === 'catchup') return <Catchup />;
  if (phase === 'error') return <ErrorScreen />;
  return (
    <Shell>
      <Page />
      {!onboardingDone && <Onboarding />}
    </Shell>
  );
}

function Catchup() {
  const c = useApp((s) => s.catchup);
  const pct = c ? (c.doneMinutes / Math.max(1, c.totalMinutes)) * 100 : 0;
  return (
    <div className="center-screen">
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <Logo size={40} />
        <div className="eyebrow">While you were away</div>
        <div className="dim">The universe kept turning. Catching up {c ? formatDuration(c.totalMinutes) : ''} of history…</div>
        <div className="bar" style={{ width: '100%' }}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="muted mono" style={{ fontSize: 12 }}>
          {c?.eventsAdded ?? 0} events recorded
        </div>
      </div>
    </div>
  );
}

function ErrorScreen() {
  const error = useApp((s) => s.error);
  const file = useRef<HTMLInputElement>(null);
  const toast = useApp((s) => s.toast);
  return (
    <div className="center-screen">
      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        <Logo size={40} />
        <h2 style={{ margin: 0, fontWeight: 600 }}>The saved universe could not be opened</h2>
        <p className="dim" style={{ margin: 0 }}>
          {error}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          The damaged save has been quarantined in local storage. You can begin a new universe or import an exported one.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={() => replaceUniverse(randomSeed())}>
            Begin a new universe
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            Import save…
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
              } catch (err) {
                toast({ kind: 'error', title: 'Import failed', body: (err as Error).message });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
