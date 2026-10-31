import { useEffect, useMemo, useState } from 'react';
import StateSky, { SCENES } from './StateSky';
import { canonicalState, compactPopulation, compass, directionGlyph, stateName, tierColour, TIER_LABELS, TIER_ORDER, weatherInfo } from '../lib/format';

/**
 * A state on the States page. At rest it is the sky over the state right now,
 * animated (rain, thunderstorm, clear sun, night...), with the risk score in its
 * IMD level colour on a light chip. Hover opens it for as long as the pointer stays; a click pins
 * it open. Open, it turns white and shows the full numbers plus a small map of
 * the state shaded by its level, with every monitored town on it.
 */

const hi = (lang) => (lang === 'hi' ? 'font-devanagari' : '');

/** WMO weather code to the animation drawn behind the tile. */
export function weatherKind(code, isDay = true) {
  if (code == null) return 'clear';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return code <= 57 ? 'drizzle' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return 'cloud';
  return isDay ? 'clear' : 'night';
}

let geoPromise = null;
export const loadStatesGeo = () => (geoPromise ??= fetch('/geo/india-states.geojson').then((r) => r.json()));

function useStateShape(state) {
  const [shape, setShape] = useState(null);
  useEffect(() => {
    let alive = true;
    loadStatesGeo()
      .then((gj) => {
        const f = gj.features.find((x) => canonicalState(x.properties.st_nm) === canonicalState(state));
        if (alive) setShape(f ?? false);
      })
      .catch(() => alive && setShape(false));
    return () => {
      alive = false;
    };
  }, [state]);
  return shape;
}

/** The state outline as an SVG path plus a projector for towns, fitted to a 300-wide box. */
function project(feature) {
  const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const W = 300;
  const s = W / Math.max((maxX - minX) * k, 1e-6);
  const H = Math.min(220, Math.max(90, (maxY - minY) * s));
  const scale = Math.min(s, H / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * k * scale) / 2;
  const oy = (H - (maxY - minY) * scale) / 2;
  const pt = (lon, lat) => [ox + (lon - minX) * k * scale, oy + (maxY - lat) * scale];
  const d = polys
    .map((poly) => poly.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${pt(x, y).map((v) => v.toFixed(1)).join(' ')}`).join('') + 'Z').join(''))
    .join('');
  return { d, pt, W, H };
}

function StateShape({ state, tier, towns }) {
  const shape = useStateShape(state);
  const geo = useMemo(() => (shape ? project(shape) : null), [shape]);
  if (shape === false) return null;
  if (!geo) return <div className="h-[120px] animate-pulse rounded-lg bg-ink-850" />;
  const c = tierColour(tier);
  return (
    <svg viewBox={`0 0 ${geo.W} ${geo.H}`} className="w-full" role="img" aria-label={state}>
      <path d={geo.d} fill={c} fillOpacity="0.28" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      {towns.map((t) => {
        const [x, y] = geo.pt(t.lon, t.lat);
        return (
          <circle key={t.id} cx={x} cy={y} r={t.tier === 'green' ? 3 : 4.5} fill={tierColour(t.tier)} stroke="#fff" strokeWidth="1.2">
            <title>{`${t.name} · ${Math.round(t.score)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export default function StateCard({ s, lang, gauges, towns, replayDate, onViewState }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const L = (en, hiText) => (lang === 'hi' ? hiText : en);
  const colour = tierColour(s.tier);
  const wx = replayDate ? null : s.weather;
  const info = wx ? weatherInfo(wx.code, wx.is_day) : null;
  const kind = wx ? weatherKind(wx.code, wx.is_day) : 'clear';
  const onDark = SCENES[kind]?.dark ?? true;
  const ink = open ? '#0F2F4F' : onDark ? '#fff' : '#14123A';
  const sub = open ? '#33485C' : onDark ? 'rgba(255,255,255,.88)' : '#2D2B52';
  const shadow = !open && onDark ? '0 1px 2px rgba(0,0,0,.55), 0 0 10px rgba(0,0,0,.25)' : undefined;
  const g = gauges;

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border transition-shadow ${open ? 'border-ink-700 bg-white shadow-lg' : 'border-transparent'} ${pinned ? 'ring-2 ring-chakra-500/40' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {!open && <StateSky kind={kind} seed={s.state} />}

      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        aria-expanded={open}
        className="relative z-10 flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[16px] font-extrabold ${hi(lang)}`} style={{ color: ink, textShadow: shadow }}>
            {stateName(s.state, lang)}
          </span>
          {info && (
            <span className={`mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold ${hi(lang)}`} style={{ color: sub, textShadow: shadow }}>
              <span className="text-[16px] leading-none" aria-hidden="true">{info.icon}</span>
              <b>{Math.round(wx.temp_c)}°C</b> · {L(info.en, info.hi)}
            </span>
          )}
        </span>
        <span className={`text-right ${open ? '' : 'rounded-2xl bg-white/90 px-2.5 py-1.5 shadow-md'}`}>
          <span className="block font-mono text-[30px] font-extrabold leading-none" style={{ color: colour }}>
            {s.score.toFixed(0)}
          </span>
          <span className={`text-[10.5px] font-bold uppercase tracking-wide ${hi(lang)}`} style={{ color: colour }}>
            {L(TIER_LABELS[s.tier].en, TIER_LABELS[s.tier].hi)} {directionGlyph(s.direction?.key)}
          </span>
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2.5 border-t border-ink-800 px-4 pb-4 pt-3">
            <div className="text-[11px] text-ink-500">
              {s.locations} {L('monitored places', 'निगरानी स्थान')}
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-ink-800">
              {TIER_ORDER.map((t) => (s.counts[t] ? <span key={t} style={{ width: `${(100 * s.counts[t]) / s.locations}%`, background: tierColour(t) }} /> : null))}
            </div>
            <div className={`truncate text-[11.5px] text-ink-300 ${hi(lang)}`}>
              {L('Highest', 'सर्वाधिक')}: <b className="text-ink-100">{lang === 'hi' && s.worst.name_hi ? s.worst.name_hi : s.worst.name}</b>
              {s.worst.river ? ` · ${s.worst.river}` : ''}
            </div>
            <div className="grid grid-cols-3 gap-1.5 border-t border-ink-800 pt-2 text-center">
              <div>
                <div className="font-mono text-base font-bold text-risk-red">{replayDate ? '—' : g?.danger ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wide text-ink-500">{L('CWC danger', 'खतरा गेज')}</div>
              </div>
              <div>
                <div className="font-mono text-base font-bold text-risk-orange">{replayDate ? '—' : g?.warning ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wide text-ink-500">{L('CWC warning', 'चेतावनी गेज')}</div>
              </div>
              <div>
                <div className="font-mono text-base font-bold text-chakra-500">{compactPopulation(s.population_at_risk)}</div>
                <div className="text-[9px] uppercase tracking-wide text-ink-500">{L('at risk', 'जोखिम में')}</div>
              </div>
            </div>
            {wx && (
              <div className={`flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-ink-850 px-2.5 py-1.5 text-[11px] text-ink-400 ${hi(lang)}`}>
                <span>{L('Now at', 'अभी')} {lang === 'hi' && wx.place_hi ? wx.place_hi : wx.place}</span>
                <span>💧 <b className="text-ink-200">{wx.humidity_pct ?? '—'}%</b></span>
                <span>💨 <b className="text-ink-200">{wx.wind_kmh != null ? Math.round(wx.wind_kmh) : '—'} km/h</b> {compass(wx.wind_dir_deg)}</span>
                <span>🌡️ <b className="text-ink-200">{Math.round(wx.temp_min_c)}–{Math.round(wx.temp_max_c)}°</b></span>
                {wx.raining_places > 0 && (
                  <span className="font-semibold text-chakra-500">🌧️ {L(`raining at ${wx.raining_places}`, `${wx.raining_places} स्थानों पर बारिश`)}</span>
                )}
              </div>
            )}
            {g?.worst?.above_danger_m > 0 && (
              <div className="rounded bg-risk-red/10 px-2 py-1 text-[10.5px] font-semibold text-risk-red">
                {g.worst.name}: +{g.worst.above_danger_m} m {L('above danger', 'खतरे के निशान से ऊपर')}
              </div>
            )}
            {open && <StateShape state={s.state} tier={s.tier} towns={towns} />}
            <button type="button" onClick={() => onViewState(s.state)} className="btn btn-primary w-full justify-center py-2 text-[12.5px]">
              {L('Open state view →', 'राज्य दृश्य खोलें →')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
