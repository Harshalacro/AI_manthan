import { useEffect, useMemo, useRef } from 'react';

/**
 * A small animated sky for a card background, picked from the WMO weather code
 * (see `weatherKind` in StateCard), in the spirit of Google Weather's cards:
 * flat sky colour and clean clouds. Rain is drawn procedurally on a canvas over a
 * deep blue night-rain sky: slanted streaks of mixed length and depth plus fine
 * spray. Storms add a lightning bolt and a flash; clear days get the sun on the
 * left; nights get a moon and stars.
 *
 * Everything animates in CSS (index.css, `.sky-*`); positions come from a seeded
 * random so a card looks the same on every render.
 */

export const SCENES = {
  storm: { bg: 'radial-gradient(120% 90% at 70% 0%,#2A3B5E 0%,#14213A 55%,#0B1426 100%)', dark: true },
  rain: { bg: 'radial-gradient(120% 90% at 70% 0%,#2F4A73 0%,#182C4B 55%,#0E1B31 100%)', dark: true },
  drizzle: { bg: 'radial-gradient(120% 90% at 70% 0%,#3A5884 0%,#22395E 55%,#172A47 100%)', dark: true },
  cloud: { bg: 'linear-gradient(180deg,#1C3F6E 0%,#27507F 60%,#356291 100%)', dark: true },
  fog: { bg: 'linear-gradient(180deg,#8C9CAE 0%,#A6B3C1 60%,#BFC9D3 100%)', dark: false },
  snow: { bg: 'linear-gradient(180deg,#7E9CC0 0%,#A3BCD8 60%,#C6D6E8 100%)', dark: false },
  clear: { bg: 'linear-gradient(180deg,#2F8DE4 0%,#5AAEF0 55%,#9FD3FA 100%)', dark: true },
  night: { bg: 'linear-gradient(180deg,#0B1433 0%,#18264D 60%,#2A3A66 100%)', dark: true },
};

function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Cloud colours: lit top, shaded base, and the highlight on each puff.
const CLOUD_TONES = {
  light: { top: '#FFFFFF', base: '#B4C6DD', glow: 'rgba(255,255,255,0.95)' },
  dark: { top: '#8592AC', base: '#2A3244', glow: 'rgba(176,188,212,0.7)' },
  grey: { top: '#C9D3E0', base: '#6E7C92', glow: 'rgba(235,240,248,0.8)' },
};

/**
 * One cloud, drawn once into its own small canvas: a flat base with five to
 * seven round puffs on top (bigger in the middle, so every cloud has its own
 * clear silhouette), shaded from a lit top to a darker base, with a soft
 * highlight on the upper-left of each puff.
 */
function cloudSprite(rnd, w, tone, dpr) {
  const h = w * 0.55;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * dpr);
  cv.height = Math.ceil(h * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const baseY = h * 0.78;
  const n = 5 + Math.floor(rnd() * 3);
  const puffs = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const mid = 1 - Math.abs(t - 0.5) * 1.6;
    const r = h * (0.16 + 0.2 * mid + rnd() * 0.08);
    return { x: w * (0.14 + t * 0.72) + (rnd() - 0.5) * w * 0.05, y: baseY - r * (0.55 + rnd() * 0.35), r };
  });

  // silhouette
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(w * 0.08, baseY - h * 0.22, w * 0.84, h * 0.22, h * 0.11);
  g.fill();
  for (const p of puffs) {
    g.beginPath();
    g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    g.fill();
  }

  // shading, painted only inside the silhouette
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, 0, 0, baseY);
  shade.addColorStop(0, tone.top);
  shade.addColorStop(0.55, tone.top);
  shade.addColorStop(1, tone.base);
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  for (const p of puffs) {
    const hl = g.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.4, 0, p.x - p.r * 0.35, p.y - p.r * 0.4, p.r * 0.9);
    hl.addColorStop(0, tone.glow);
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, w, h);
  }
  return { cv, w, h };
}

/**
 * Layered clouds on a canvas: far clouds small, faint and slow, near clouds
 * larger and slower-moving across the top right, so depth reads like a real
 * sky and the state name on the left stays clear.
 */
function CloudCanvas({ tone = 'light', count = 6, seed, opacity = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let clouds = [];

    const make = () => {
      const rnd = seeded(`clouds-${seed}-${tone}`);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      clouds = Array.from({ length: count }, (_, i) => {
        const z = i / Math.max(1, count - 1); // 0 = far, 1 = near
        const cw = h * (1.1 + z * 1.5) * (0.85 + rnd() * 0.3);
        const sprite = cloudSprite(rnd, cw, CLOUD_TONES[tone], dpr);
        const near = z > 0.5;
        return {
          sprite,
          x: near ? w * (0.35 + rnd() * 0.6) - cw / 2 : rnd() * (w + cw) - cw,
          y: near ? -sprite.h * (0.25 + rnd() * 0.2) : -sprite.h * 0.35 + rnd() * h * 0.55,
          v: 0.05 + z * 0.12,
          a: (0.35 + z * 0.55) * opacity,
        };
      });
    };
    const size = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      make();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const cl of clouds) {
        ctx.globalAlpha = cl.a;
        ctx.drawImage(cl.sprite.cv, cl.x, cl.y, cl.sprite.w, cl.sprite.h);
        if (!still) {
          cl.x += cl.v;
          if (cl.x > w) cl.x = -cl.sprite.w;
        }
      }
      ctx.globalAlpha = 1;
    };
    size();
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (still) draw();
    else loop();
    const ro = new ResizeObserver(size);
    ro.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tone, count, seed, opacity]);
  return <canvas ref={ref} className="sky-canvas" />;
}

/**
 * Procedural rain: slanted streaks at three depths (far ones short, faint and
 * slow; near ones long and bright) and fine spray dots, redrawn every frame.
 */
function RainCanvas({ density = 1, seed }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const rnd = seeded(`rain-${seed}`);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let drops = [];
    let spray = [];
    const slant = 0.28;

    const make = () => {
      const area = (w * h) / 1000;
      drops = Array.from({ length: Math.round(area * 1.3 * density) }, () => {
        const z = rnd();
        return { x: rnd() * (w + 40), y: rnd() * h, len: 6 + z * 18, v: 2.2 + z * 5.5, a: 0.12 + z * 0.5, wd: 0.6 + z * 0.9 };
      });
      spray = Array.from({ length: Math.round(area * 0.45 * density) }, () => ({ x: rnd() * w, y: rnd() * h, r: 0.5 + rnd() * 1.1, v: 0.6 + rnd() * 1.2, a: 0.15 + rnd() * 0.35 }));
    };
    const size = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      make();
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(200,220,255,${d.a})`;
        ctx.lineWidth = d.wd;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * slant, d.y + d.len);
        ctx.stroke();
        if (!still) {
          d.y += d.v;
          d.x -= d.v * slant;
          if (d.y > h) {
            d.y = -d.len;
            d.x = rnd() * (w + 40);
          }
        }
      }
      for (const s of spray) {
        ctx.fillStyle = `rgba(220,235,255,${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (!still) {
          s.y += s.v;
          s.x -= s.v * slant;
          if (s.y > h) {
            s.y = -2;
            s.x = rnd() * w;
          }
        }
      }
    };
    size();
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    if (still) draw();
    else loop();
    const ro = new ResizeObserver(size);
    ro.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, seed]);
  return <canvas ref={ref} className="sky-canvas" />;
}

export default function StateSky({ kind, seed }) {
  const rnd = useMemo(() => seeded(`${seed}-${kind}`), [seed, kind]);
  const scene = SCENES[kind] ?? SCENES.clear;
  const wet = kind === 'rain' || kind === 'drizzle' || kind === 'storm';
  return (
    <div className="sky" style={{ background: scene.bg }} aria-hidden="true">
      {kind === 'clear' && (
        <span className="sky-sun">
          <span className="sky-sun-rays" />
        </span>
      )}
      {kind === 'night' && (
        <>
          <span className="sky-stars" />
          <span className="sky-moon" />
        </>
      )}
      {kind === 'cloud' && (
        <>
          {/* the sun stays hidden; only its light comes through the clouds */}
          <span className="sky-glow" />
          <CloudCanvas tone="light" count={7} seed={seed} opacity={0.75} />
        </>
      )}
      {kind === 'fog' && (
        <>
          <span className="sky-fog" />
          <span className="sky-fog sky-fog-2" />
        </>
      )}
      {kind === 'snow' && (
        <>
          <CloudCanvas tone="grey" count={4} seed={seed} />
          <span className="sky-snow" />
        </>
      )}
      {wet && (
        <>
          <CloudCanvas tone={kind === 'drizzle' ? 'grey' : 'dark'} count={kind === 'storm' ? 8 : 4} seed={seed} opacity={kind === 'drizzle' ? 0.6 : 0.85} />
          <RainCanvas density={kind === 'drizzle' ? 0.45 : kind === 'storm' ? 1.3 : 1} seed={seed} />
        </>
      )}
      {kind === 'storm' && (
        <>
          <svg className="sky-bolt" viewBox="0 0 24 48" style={{ left: `${30 + rnd() * 45}%` }}>
            <path d="M14 0 L4 26 H11 L7 48 L20 18 H12 L17 0 Z" fill="#FFE97A" />
          </svg>
          <span className="sky-flash" />
        </>
      )}
    </div>
  );
}
