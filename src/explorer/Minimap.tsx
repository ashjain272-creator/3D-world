import { useEffect, useRef } from 'react';
import type { Layout } from './layout';
import { npcPositions, playerState } from './explorerStore';
import type { TerrainData } from './terrain';

const BASE = 360; // px for the whole terrain
const VIEW = 260; // world units shown

/** Top-down minimap: pre-rendered terrain/city base plus live markers. */
export function Minimap({ t, layout, discovered, civColor }: { t: TerrainData; layout: Layout; discovered: string[]; civColor: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const disc = useRef(discovered);
  disc.current = discovered;

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = c.height = BASE;
    const g = c.getContext('2d')!;
    const img = g.createImageData(BASE, BASE);
    const scale = t.size / BASE;
    let min = Infinity,
      max = -Infinity;
    for (const h of t.heights) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    for (let py = 0; py < BASE; py++) {
      for (let px = 0; px < BASE; px++) {
        const x = -t.size / 2 + px * scale;
        const z = -t.size / 2 + py * scale;
        const h = t.height(x, z);
        const rel = (h - min) / Math.max(1, max - min);
        let r = 30 + rel * 70,
          gg = 44 + rel * 70,
          b = 52 + rel * 60;
        if (t.waterLevel !== null && h < t.waterLevel) {
          r = 18;
          gg = 42;
          b = 70;
        }
        const i = (py * BASE + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const toPx = (v: number) => (v + t.size / 2) / scale;
    g.strokeStyle = 'rgba(200,220,255,0.35)';
    for (const s of layout.streets) {
      g.lineWidth = Math.max(1, s.w / scale);
      g.beginPath();
      g.moveTo(toPx(s.a[0]), toPx(s.a[1]));
      g.lineTo(toPx(s.b[0]), toPx(s.b[1]));
      g.stroke();
    }
    g.fillStyle = 'rgba(210,225,245,0.75)';
    for (const b of layout.buildings) {
      const w = (b.rot ? b.d : b.w) / scale;
      const d = (b.rot ? b.w : b.d) / scale;
      g.fillRect(toPx(b.x) - w / 2, toPx(b.z) - d / 2, Math.max(1, w), Math.max(1, d));
    }
    base.current = c;
  }, [t, layout]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d')!;
    const size = cv.width;
    const scale = t.size / BASE;
    const draw = () => {
      if (!base.current) return;
      g.clearRect(0, 0, size, size);
      g.save();
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#05080f';
      g.fillRect(0, 0, size, size);
      const viewPx = VIEW / scale;
      const sx = (playerState.x + t.size / 2) / scale - viewPx / 2;
      const sz = (playerState.z + t.size / 2) / scale - viewPx / 2;
      g.globalAlpha = 0.9;
      g.drawImage(base.current, sx, sz, viewPx, viewPx, 0, 0, size, size);
      g.globalAlpha = 1;
      const k = size / VIEW;
      const toScreen = (x: number, z: number): [number, number] => [(x - playerState.x) * k + size / 2, (z - playerState.z) * k + size / 2];
      for (const l of layout.landmarks) {
        const [x, y] = toScreen(l.x, l.z);
        const found = disc.current.includes(l.id);
        g.fillStyle = found ? '#6fd6ff' : '#f4c26b';
        g.beginPath();
        g.moveTo(x, y - 5);
        g.lineTo(x + 4, y);
        g.lineTo(x, y + 5);
        g.lineTo(x - 4, y);
        g.closePath();
        g.fill();
      }
      for (const p of npcPositions.values()) {
        const [x, y] = toScreen(p.x, p.z);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fill();
      }
      // player arrow (points along facing)
      g.translate(size / 2, size / 2);
      g.rotate(-playerState.yaw + Math.PI);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(0, 2);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
      g.strokeStyle = civColor;
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#a7b5cc';
      g.font = '600 10px Inter, sans-serif';
      g.textAlign = 'center';
      g.fillText('N', size / 2, 12);
    };
    const id = window.setInterval(draw, 100);
    draw();
    return () => window.clearInterval(id);
  }, [t, layout, civColor]);

  return <canvas ref={ref} width={180} height={180} className="minimap" data-testid="minimap" />;
}
