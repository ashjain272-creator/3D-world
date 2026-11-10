import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { glowSprite } from '../cosmos/planetTexture';
import { Rng } from '../sim/rng';
import { type GenerationReport } from '../sim/generate/universe';
import { randomSeed } from '../state/seed';
import { createUniverse, WARMUP_DAYS } from '../state/boot';
import { startRunner } from '../state/runner';
import { useApp } from '../state/store';
import { Logo } from './components/Icons';

/** Particles that drift as a nebula and then condense into a spiral galaxy. */
function Genesis({ progress }: { progress: React.MutableRefObject<number> }) {
  const N = 16000;
  const { geo, from, to } = useMemo(() => {
    const rng = new Rng('intro');
    const from = new Float32Array(N * 3);
    const to = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = rng.next() * 2 - 1;
      const th = rng.next() * Math.PI * 2;
      const r = 120 + rng.next() * 380;
      const s = Math.sqrt(1 - u * u);
      from[i * 3] = Math.cos(th) * s * r;
      from[i * 3 + 1] = u * r * 0.7;
      from[i * 3 + 2] = Math.sin(th) * s * r;
      const arm = i % 3;
      const rr = Math.pow(rng.next(), 0.8) * 260;
      const a = (arm / 3) * Math.PI * 2 + rr / 85 + rng.normal(0, 0.25);
      to[i * 3] = Math.cos(a) * rr;
      to[i * 3 + 1] = rng.normal(0, 4 + (1 - rr / 260) * 8);
      to[i * 3 + 2] = Math.sin(a) * rr;
      c.set(rr < 60 ? '#ffe7c2' : rng.chance(0.08) ? '#ff9ec7' : '#7fb8ff').lerp(new THREE.Color('#ffffff'), rng.next() * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(from.slice(), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geo, from, to };
  }, []);
  const pts = useRef<THREE.Points>(null);
  useFrame(({ camera, clock }) => {
    const t = progress.current;
    const e = t * t * (3 - 2 * t);
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i++) pos[i] = from[i] + (to[i] - from[i]) * e;
    geo.attributes.position.needsUpdate = true;
    if (pts.current) pts.current.rotation.y = clock.elapsedTime * (0.03 + e * 0.05);
    const dist = 700 - e * 280;
    camera.position.set(0, 120 + e * 160, dist);
    camera.lookAt(0, 0, 0);
  });
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points ref={pts} geometry={geo}>
      <pointsMaterial size={2.6} vertexColors map={glowSprite()} transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

const LINES = ['In the beginning there was only a seed —', 'a single number, holding every star, every world, every life to come.'];

export function Intro() {
  const [stage, setStage] = useState<'lines' | 'title' | 'generating' | 'done'>('lines');
  const [seed, setSeed] = useState(randomSeed());
  const [log, setLog] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const progress = useRef(0);
  const target = useRef(0.08);
  const setPhase = useApp((s) => s.setPhase);
  const toast = useApp((s) => s.toast);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      progress.current += (target.current - progress.current) * 0.02;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (stage !== 'lines') return;
    const timers = [setTimeout(() => setLineIdx(1), 2300), setTimeout(() => setStage('title'), 5200)];
    return () => timers.forEach(clearTimeout);
  }, [stage]);

  const begin = async (skip = false) => {
    setStage('generating');
    target.current = 0.35;
    const lines: string[] = [];
    const push = async (s: string, wait: number) => {
      lines.push(s);
      setLog([...lines]);
      if (!skip) await new Promise((r) => setTimeout(r, wait));
    };
    try {
      let report: GenerationReport | undefined;
      await push(`Seed “${seed}” accepted`, 500);
      await createUniverse(seed.trim() || randomSeed(), (st, r) => {
        if (st === 'generated') report = r;
      });
      if (!report) throw new Error('Generation failed');
      target.current = 0.6;
      await push(`Igniting ${report.systems} stars across the spiral arms`, 650);
      await push(`Accreting ${report.planets} worlds and their moons`, 650);
      target.current = 0.8;
      await push(`${report.civilizations} civilisations rise across ${report.settlements} settlements`, 700);
      await push(`${report.inhabitants} individuals awaken, each with a mind of their own`, 700);
      await push(`${report.chronicleEvents} chapters of ancient history recorded`, 650);
      target.current = 1;
      await push(`The first ${WARMUP_DAYS} days unfold…`, 900);
      setStage('done');
      if (!skip) await new Promise((r) => setTimeout(r, 900));
      await startRunner();
      setPhase('ready');
    } catch (e) {
      toast({ kind: 'error', title: 'Generation failed', body: (e as Error).message });
      setStage('title');
    }
  };

  return (
    <div className="intro" data-testid="intro">
      <Canvas camera={{ position: [0, 120, 700], fov: 55, far: 4000 }} dpr={[1, 2]}>
        <color attach="background" args={['#010207']} />
        <Genesis progress={progress} />
      </Canvas>
      <div className={`intro-veil ${stage === 'done' ? 'out' : ''}`}>
        {stage === 'lines' && (
          <div className="intro-lines">
            {LINES.slice(0, lineIdx + 1).map((l) => (
              <p key={l} className="intro-line">
                {l}
              </p>
            ))}
          </div>
        )}
        {stage === 'title' && (
          <div className="intro-title">
            <Logo size={54} />
            <h1>GENESIS</h1>
            <p>A living universe — generated from a seed, simulated in real time, yours to explore, observe and shape.</p>
            <div className="intro-seed">
              <label className="eyebrow" htmlFor="seed">
                Universe seed
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="seed" className="input mono" value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
                <button className="btn ghost" onClick={() => setSeed(randomSeed())} title="Randomise">
                  ↻
                </button>
              </div>
            </div>
            <button className="btn primary lg" onClick={() => begin(false)} data-testid="begin">
              Begin Genesis
            </button>
          </div>
        )}
        {(stage === 'generating' || stage === 'done') && (
          <div className="intro-log mono">
            {log.map((l, i) => (
              <div key={i} className="intro-log-line">
                <span className="muted">{String(i + 1).padStart(2, '0')}</span> {l}
              </div>
            ))}
          </div>
        )}
        {stage !== 'generating' && stage !== 'done' && (
          <button className="intro-skip" onClick={() => begin(true)} data-testid="skip-intro">
            Skip introduction →
          </button>
        )}
      </div>
    </div>
  );
}
