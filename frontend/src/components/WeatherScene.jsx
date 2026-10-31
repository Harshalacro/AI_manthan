import { useEffect, useId, useState } from 'react';
import { weatherInfo } from '../lib/format';
import { RainCanvas, WaveSea } from './Chrome';

/**
 * Live sky behind the hero panels: the backdrop follows the actual weather and
 * risk for the user's area.
 *
 *   storm   thunderstorm codes - near-black sky, heavy rain, lightning
 *   rain    drizzle / rain / showers - rain-grey sky, falling rain
 *   cloud   overcast or fog - grey-blue sky, drifting clouds
 *   fresh   clear by day with no risk - emerald sky, sun, white clouds
 *   sun     clear by day with some risk - bright blue sky, a slow-turning sun
 *   night   clear by night - stars and a moon
 *
 * Independently, Orange or Red risk raises the sea: high, fast waves along the
 * bottom. Everything is decoration under the text; with reduced motion the
 * scene holds still.
 */

// Each sky has its own palette: background, the calm sea along the bottom
// (back to front) and its clouds - tone, how many, and how low they hang.
const SKY = {
  fresh: {
    bg: 'linear-gradient(125deg,#064E3B 0%,#0B6B5A 45%,#14907C 100%)',
    sea: ['rgba(167,243,208,0.08)', 'rgba(110,231,183,0.12)', 'rgba(167,243,208,0.18)', 'rgba(16,120,100,0.10)'],
    clouds: { top: '#FFFFFF', bottom: '#D9F5EC', opacity: 0.9, count: 3, low: false },
  },
  sun: {
    bg: 'linear-gradient(125deg,#0A4A86 0%,#1468AE 50%,#2A8FD0 100%)',
    sea: ['rgba(186,230,253,0.08)', 'rgba(125,211,252,0.12)', 'rgba(186,230,253,0.18)', 'rgba(14,90,150,0.10)'],
    clouds: { top: '#FFFFFF', bottom: '#DCEFFC', opacity: 0.9, count: 3, low: false },
  },
  cloud: {
    bg: 'linear-gradient(125deg,#1E2733 0%,#334155 50%,#4A5A6E 100%)',
    sea: ['rgba(203,213,225,0.05)', 'rgba(203,213,225,0.08)', 'rgba(226,232,240,0.12)', 'rgba(71,85,105,0.10)'],
    clouds: { top: '#CBD5E1', bottom: '#8A99AD', opacity: 0.55, count: 5, low: false },
  },
  rain: {
    bg: 'linear-gradient(125deg,#141C27 0%,#243244 50%,#324458 100%)',
    sea: ['rgba(148,163,184,0.06)', 'rgba(148,163,184,0.10)', 'rgba(186,200,215,0.14)', 'rgba(51,65,85,0.12)'],
    clouds: { top: '#64748B', bottom: '#2F3B4C', opacity: 0.85, count: 5, low: true },
  },
  storm: {
    bg: 'linear-gradient(125deg,#09080F 0%,#1B1830 50%,#2B2445 100%)',
    sea: ['rgba(167,139,250,0.05)', 'rgba(167,139,250,0.08)', 'rgba(196,181,253,0.12)', 'rgba(46,36,80,0.15)'],
    clouds: { top: '#3B3654', bottom: '#120F1F', opacity: 0.95, count: 6, low: true },
  },
  night: {
    bg: 'linear-gradient(125deg,#0A0E2E 0%,#1E1B4B 50%,#2E2A6E 100%)',
    sea: ['rgba(165,180,252,0.05)', 'rgba(165,180,252,0.08)', 'rgba(199,210,254,0.12)', 'rgba(49,46,129,0.12)'],
    clouds: { top: '#4C4A86', bottom: '#25235A', opacity: 0.55, count: 2, low: false },
  },
};

// WMO weather codes, as Open-Meteo reports them.
const STORM = [95, 96, 99];
const RAIN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
const CLOUD = [3, 45, 48, 71, 73, 75, 77, 85, 86];
const RANK = { storm: 4, rain: 3, cloud: 2, sun: 1, night: 1 };


function skyFor(w) {
  if (!w || w.code == null) return null;
  if (STORM.includes(w.code)) return 'storm';
  if (RAIN.includes(w.code) || (w.precip_mm ?? 0) >= 0.5) return 'rain';
  if (CLOUD.includes(w.code)) return 'cloud';
  return w.is_day === false ? 'night' : 'sun';
}

/**
 * Scene for a set of places: the most dramatic sky among them, and a flood sea
 * when the given tier is Orange or Red. `weather` is the place whose conditions
 * the chip describes.
 */
export function sceneFor(places = [], tier = 'green') {
  let sky = null;
  let weather = null;
  for (const p of places) {
    const s = skyFor(p.weather);
    if (s && (!sky || RANK[s] > RANK[sky])) {
      sky = s;
      weather = p.weather;
    }
  }
  if (!sky) {
    const h = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
    sky = h >= 6 && h < 18 ? 'sun' : 'night';
  }
  // Clear skies over a place with no risk get the fresh green palette.
  if (sky === 'sun' && tier === 'green') sky = 'fresh';
  const scene = { sky, flood: tier === 'red' || tier === 'orange', severe: tier === 'red', weather };
  return { ...scene, ...previewOverride() };
}

// Demo/preview: ?sky=fresh|sun|cloud|rain|storm|night and ?flood=1|0 in the page URL
// force a scene, so every look can be shown whatever today's weather is.
function previewOverride() {
  try {
    const q = new URLSearchParams(window.location.search);
    const out = {};
    if (SKY[q.get('sky')]) out.sky = q.get('sky');
    if (q.has('flood')) out.flood = out.severe = q.get('flood') === '1';
    return out;
  } catch {
    return {};
  }
}

/** Small "⛈ Thunderstorm · 27°" pill for the hero. */
export function WeatherChip({ weather, lang }) {
  if (!weather || weather.code == null) return null;
  const wx = weatherInfo(weather.code, weather.is_day);
  return (
    <span className="glass-dark inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold normal-case tracking-normal text-white/90">
      <span aria-hidden="true">{wx.icon}</span>
      {lang === 'hi' ? wx.hi : wx.en}
      {weather.temp_c != null && <span className="text-white/60">· {Math.round(weather.temp_c)}°</span>}
    </span>
  );
}

function Lightning() {
  const [strike, setStrike] = useState(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let id;
    const next = () => {
      id = setTimeout(() => {
        setStrike({ key: Date.now(), x: 15 + Math.random() * 70, flip: Math.random() > 0.5 });
        next();
      }, 2500 + Math.random() * 5500);
    };
    next();
    return () => clearTimeout(id);
  }, []);
  if (!strike) return null;
  return (
    <div key={strike.key} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="iris-flash absolute inset-0" />
      <svg
        className="iris-bolt absolute top-0 h-[78%]"
        style={{ left: `${strike.x}%`, transform: strike.flip ? 'scaleX(-1)' : undefined }}
        viewBox="0 0 60 200"
        preserveAspectRatio="xMidYMin meet"
      >
        <path d="M34 0 L22 62 L36 66 L16 128 L30 131 L8 200 L46 112 L31 108 L50 54 L36 50 L46 0 Z" fill="#EAF4FF" />
      </svg>
    </div>
  );
}

function Sun() {
  return (
    <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72" aria-hidden="true">
      <div className="iris-sun-rays absolute inset-0 rounded-full" />
      <div className="absolute inset-[30%] rounded-full bg-[radial-gradient(circle,#FFF6C8_0%,#FFD45C_45%,rgba(255,180,60,0)_72%)] shadow-[0_0_80px_30px_rgba(255,200,80,0.35)]" />
    </div>
  );
}

// Fixed star field so it does not reshuffle on every render.
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 37.7) % 100,
  y: (i * 23.3) % 70,
  s: i % 7 === 0 ? 2.2 : i % 3 === 0 ? 1.6 : 1.1,
  d: (i % 9) * 0.45,
}));

function Night() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {STARS.map((st, i) => (
        <span
          key={i}
          className="iris-star absolute rounded-full bg-white"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }}
        />
      ))}
      <div className="absolute right-12 top-7 h-16 w-16 rounded-full bg-[radial-gradient(circle_at_35%_35%,#FFFFFF,#DCE7F5_60%,#B8C9DE)] shadow-[0_0_50px_12px_rgba(220,235,255,0.25)]">
        <span className="absolute left-4 top-6 h-2.5 w-2.5 rounded-full bg-[#C4D3E6]" />
        <span className="absolute left-9 top-3 h-1.5 w-1.5 rounded-full bg-[#C4D3E6]" />
      </div>
    </div>
  );
}

// Cloud lanes: vertical position, size, drift time and start offset. Spread
// out so clouds never bunch up at the start.
const LANES = [
  ['2%', 1.0, '70s', '-10s'],
  ['18%', 0.7, '95s', '-55s'],
  ['-4%', 1.3, '120s', '-85s'],
  ['30%', 0.85, '80s', '-35s'],
  ['8%', 1.15, '105s', '-20s'],
  ['24%', 0.95, '88s', '-70s'],
];

/** Puffy cumulus, lit from above, drifting across in parallax lanes. */
function Clouds({ palette, id }) {
  const { top, bottom, opacity, count, low } = palette;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={`${id}-cloud`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.15" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
        </defs>
      </svg>
      {LANES.slice(0, count).map(([y, scale, dur, delay], i) => (
        <div
          key={i}
          className="iris-cloud absolute"
          style={{ top: low ? `calc(${y} - 6%)` : y, animationDuration: dur, animationDelay: delay, opacity }}
        >
          <svg width={220 * scale} height={90 * scale} viewBox="0 0 220 90" style={{ filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.18))' }}>
            <path
              d="M38 82 C14 82 6 62 20 52 C14 34 36 22 52 32 C58 12 92 6 106 26 C118 10 152 12 158 36 C182 30 204 46 196 64 C212 70 206 84 190 84 Z"
              fill={`url(#${id}-cloud)`}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

export default function WeatherScene({ scene }) {
  const { sky, flood, severe } = scene;
  const palette = SKY[sky];
  const id = useId().replace(/:/g, '');
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 transition-[background] duration-1000" style={{ background: palette.bg }} />
      {(sky === 'sun' || sky === 'fresh') && <Sun />}
      {sky === 'night' && <Night />}
      <Clouds palette={palette.clouds} id={id} />
      {sky === 'storm' && <Lightning />}
      <WaveSea fills={flood ? null : palette.sea} tone={flood ? 'flood' : 'dark'} height={flood ? (severe ? 190 : 160) : 120} className={flood ? 'iris-sea-fast' : ''} />
      {(sky === 'rain' || sky === 'storm') && <RainCanvas tone="dark" density={sky === 'storm' ? 1.4 : 0.8} />}
    </div>
  );
}
