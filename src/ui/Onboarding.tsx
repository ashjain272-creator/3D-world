import { navigate } from '../state/router';
import { getWorld, useApp } from '../state/store';
import { Icon } from './components/Icons';

export function Onboarding() {
  const done = useApp((s) => s.setOnboardingDone);
  const w = getWorld();
  const civ = Object.values(w.civs)[0];
  const capital = civ ? w.settlements[civ.settlementIds[0]] : undefined;
  const go = (path: string) => {
    done(true);
    navigate(path);
  };
  return (
    <div className="onboard panel" data-testid="onboarding">
      <div className="eyebrow">Welcome, Creator</div>
      <h3>{w.galaxy.name} is alive</h3>
      <p>
        {Object.keys(w.civs).length} civilisations and {Object.values(w.characters).filter((c) => c.alive).length} individuals are already living their lives. Time flows on its own — use the controls at the top right to pause or accelerate it.
      </p>
      <div className="modes">
        <button className="mode" onClick={() => go('universe')}>
          <Icon.Universe />
          <div>
            <b>Observe</b>
            <span>Zoom from the galaxy into systems, worlds and settlements.</span>
          </div>
          <Icon.Arrow style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        </button>
        <button className="mode" onClick={() => capital && go(`explorer/${capital.id}`)}>
          <Icon.Explorer />
          <div>
            <b>Explore</b>
            <span>Walk the streets of {capital?.name ?? 'a city'} and meet its people.</span>
          </div>
          <Icon.Arrow style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        </button>
        <button className="mode" onClick={() => go('civilizations')}>
          <Icon.Civs />
          <div>
            <b>Study</b>
            <span>Economies, politics, technology and diplomacy — with the reasons behind them.</span>
          </div>
          <Icon.Arrow style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        </button>
        <button className="mode" onClick={() => go('creator')}>
          <Icon.Creator />
          <div>
            <b>Influence</b>
            <span>Create worlds, spark discoveries, broker treaties — and watch the consequences.</span>
          </div>
          <Icon.Arrow style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        </button>
      </div>
      <button className="btn sm ghost" onClick={() => done(true)} data-testid="onboarding-dismiss">
        Dismiss
      </button>
    </div>
  );
}
