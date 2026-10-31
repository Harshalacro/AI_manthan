import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { relativeAge, stateName, tierColour, TIER_LABELS, TIER_ORDER } from '../lib/format';
import { pickPlain, t } from '../lib/i18n';

/**
 * Application chrome: the IRIS mark, water rule, masthead, alert ticker and footer.
 *
 * IRIS is built for people, not departments: the look is light on water - white
 * surfaces, a sky-blue accent, ocean-navy type - so the only warm colours on
 * screen are IMD's warning tiers. A "Prototype" badge sits in the masthead and a
 * standing disclaimer in the footer; official warnings still come from IMD / CWC.
 */

/** The IRIS emblem. While data is in flight, ripples spread out from it. */
export function IrisMark({ size = 26, spinning = false, className = '' }) {
  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }}>
      {spinning && (
        <>
          <span className="absolute inset-0 animate-ripple rounded-full border-2 border-saffron-400" aria-hidden="true" />
          <span className="absolute inset-0 animate-ripple rounded-full border-2 border-saffron-400 [animation-delay:1.3s]" aria-hidden="true" />
        </>
      )}
      <img src="/iris-mark.png" alt="IRIS" width={size} height={size} className="relative h-full w-full object-contain" draggable="false" />
    </span>
  );
}

/** The thin flowing sky-to-teal line under the masthead. */
export function WaveRule({ className = '' }) {
  return <div className={`wave-rule h-[3px] w-full shrink-0 ${className}`} aria-hidden="true" />;
}

// One wave period per 1440 units, drawn twice across a 2880-wide SVG so the
// layer can slide by half its width and loop seamlessly.
function wavePath(y, amp) {
  let d = `M0 ${y}`;
  for (let i = 0; i < 4; i += 1) {
    const x = i * 720;
    const s = i % 2 ? amp : -amp;
    d += ` C${x + 240} ${y + s} ${x + 480} ${y + s} ${x + 720} ${y}`;
  }
  return `${d} L2880 200 L0 200 Z`;
}

// Fills per tone, back to front: light (sign-in sea), dark (faint texture on a
// midnight panel) and flood (high water rising into a panel).
const SEA = {
  light: ['#8FD0EE', '#4FB0DE', '#1A8CC4', '#0F5E8A'],
  dark: ['rgba(255,255,255,0.03)', 'rgba(125,211,252,0.05)', 'rgba(125,211,252,0.09)', 'rgba(125,211,252,0.02)'],
  flood: ['rgba(56,160,215,0.22)', 'rgba(40,140,200,0.32)', 'rgba(70,175,225,0.55)', 'rgba(20,90,140,0.75)'],
};

/**
 * Drifting layered sea along the bottom of its (relative) parent, in one of the
 * tones above, or in explicit `fills` (four colours, back to front).
 */
export function WaveSea({ height = 220, className = '', tone = 'light', fills = null }) {
  const id = useId().replace(/:/g, '');
  const fill = fills ?? SEA[tone] ?? SEA.light;
  return (
    <div className={`iris-sea ${className}`} style={{ height }} aria-hidden="true">
      <svg className="l1" viewBox="0 0 2880 200" preserveAspectRatio="none">
        <path d={wavePath(70, 34)} fill={fill[0]} />
      </svg>
      <svg className="l2" viewBox="0 0 2880 200" preserveAspectRatio="none">
        <path d={wavePath(105, 26)} fill={fill[1]} />
      </svg>
      <svg className="l3" viewBox="0 0 2880 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={fill[2]} />
            <stop offset="1" stopColor={fill[3]} />
          </linearGradient>
        </defs>
        <path d={wavePath(140, 18)} fill={`url(#${id}-front)`} />
      </svg>
    </div>
  );
}

/** Ring of places by tier, total in the middle. */
export function TierRing({ counts, size = 116, label }) {
  const order = ['red', 'orange', 'yellow', 'green'];
  const total = order.reduce((n, t) => n + (counts[t] || 0), 0) || 1;
  const r = 44;
  const c = 2 * Math.PI * r;
  const gap = order.filter((t) => counts[t]).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        {order.map((t) => {
          const n = counts[t] || 0;
          if (!n) return null;
          const len = (n / total) * c;
          const seg = (
            <circle
              key={t}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={TIER_GLOW[t]}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[30px] font-extrabold leading-none text-white">{total}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{label}</div>
        </div>
      </div>
    </div>
  );
}

// IMD tiers brightened to stay legible on midnight panels.
export const TIER_GLOW = { red: '#FF6B76', orange: '#FFA25C', yellow: '#FFD84D', green: '#4ADE80' };

function LiveDot({ refreshing }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      <span
        className={`absolute inline-flex h-full w-full rounded-full ${
          refreshing ? 'bg-saffron-400' : 'bg-indiagreen-300'
        } opacity-70 ${refreshing ? 'animate-ping' : ''}`}
      />
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          refreshing ? 'bg-saffron-500' : 'bg-indiagreen-400'
        }`}
      />
    </span>
  );
}

export function LangToggle({ lang, onChange, tone = 'light' }) {
  const onDark = tone === 'dark';
  return (
    <div
      className={`flex items-center rounded-md p-0.5 ${
        onDark ? 'bg-white/15' : 'border border-ink-700 bg-ink-850'
      }`}
      role="group"
      aria-label="Language"
    >
      {[
        ['en', 'English'],
        ['hi', 'हिंदी'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={lang === key}
          className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
            lang === key
              ? onDark
                ? 'bg-white text-chakra-500'
                : 'bg-saffron-500 text-white shadow-sm'
              : onDark
                ? 'text-white/80 hover:text-white'
                : 'text-ink-400 hover:text-ink-100'
          } ${key === 'hi' ? 'font-devanagari' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Text-size control, the A- / A / A+ pattern Indian government portals carry
 * under the GIGW accessibility guidelines. Applied as page zoom, because the
 * dashboard's dense type is set in fixed pixel sizes that a root font-size
 * change would not reach.
 */
function TextSizeControl({ lang }) {
  const [zoom, setZoom] = useState(() => {
    try {
      return Number(localStorage.getItem('jd.zoom')) || 1;
    } catch {
      return 1;
    }
  });
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
    try {
      localStorage.setItem('jd.zoom', String(zoom));
    } catch {
      /* non-fatal */
    }
  }, [zoom]);

  const steps = [
    [0.9, 'A-', lang === 'hi' ? 'छोटा पाठ' : 'Smaller text'],
    [1, 'A', lang === 'hi' ? 'सामान्य पाठ' : 'Normal text'],
    [1.1, 'A+', lang === 'hi' ? 'बड़ा पाठ' : 'Larger text'],
  ];
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Text size">
      {steps.map(([value, label, title]) => (
        <button
          key={label}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={zoom === value}
          onClick={() => setZoom(value)}
          className={`min-w-[22px] rounded px-1 py-0.5 text-[10.5px] font-bold transition ${
            zoom === value ? 'bg-white text-chakra-500 shadow-sm' : 'text-ink-400 hover:bg-white/70 hover:text-chakra-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Masthead({
  lang,
  onLangChange,
  meta,
  refreshing,
  onRefresh,
  onOpenSystem,
  onOpenCopilot,
  onOpenTour,
  user,
  onLogout,
  children,
}) {
  // A local ticking clock, so "updated 3 min ago" ages visibly between refreshes
  // instead of freezing at whatever the last API response said.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const ageSeconds = meta ? meta.age_seconds + tick * 15 : null;

  return (
    <header className="relative z-20 shrink-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-chakra-500 focus:shadow"
      >
        {lang === 'hi' ? 'मुख्य सामग्री पर जाएँ' : 'Skip to main content'}
      </a>

      {/* utility strip — a pale sky band */}
      <div className="border-b border-white/60 bg-gradient-to-r from-saffron-50/70 via-white/50 to-saffron-50/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-1 lg:px-5">
          <span className={`truncate text-[10.5px] font-medium text-ink-400 ${lang === 'hi' ? 'font-devanagari' : ''}`}>
            {lang === 'hi'
              ? 'बाढ़ पूर्वानुमान अनुसंधान प्रोटोटाइप · आधिकारिक चेतावनी हेतु IMD / CWC देखें'
              : 'Flood forecasting research prototype · For official warnings see IMD / CWC'}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-3" data-tour="access">
            <span className="hidden sm:block">
              <TextSizeControl lang={lang} />
            </span>
            <span className="hidden h-3.5 w-px bg-ink-700 sm:block" aria-hidden="true" />
            <LangToggle lang={lang} onChange={onLangChange} />
          </div>
        </div>
      </div>

      {/* identity row — white */}
      <div className="glass-bar">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <IrisMark size={46} spinning={refreshing} />
            <div className="min-w-0 leading-tight">
              <div className="flex items-baseline gap-2">
                <h1 className="font-display text-[28px] font-semibold leading-none tracking-[0.18em] text-chakra-500">
                  IRIS
                </h1>
                <span className="chip border-saffron-500/50 bg-saffron-50 px-2 py-0.5 text-[10px] text-saffron-300">
                  {t(lang, 'prototype')}
                </span>
              </div>
              <p className={`truncate text-[11.5px] font-medium text-ink-400 ${lang === 'hi' ? 'font-devanagari' : ''}`}>
                {t(lang, 'tagline')}
                <span className="text-ink-600"> · </span>
                <span className="text-indiagreen-300">{lang === 'hi' ? 'एआई/एमएल सक्षम' : 'AI/ML enabled'}</span>
              </p>
            </div>
          </div>

          <div className="mx-auto hidden min-w-0 flex-1 md:block" data-tour="search">{children}</div>

          <div className="ml-auto flex items-center gap-2">
            {meta && meta.weather_mode && meta.weather_mode !== 'live' ? (
              // Weather source unavailable (e.g. over its daily quota): say so, and
              // that gauges and official alerts are still updating.
              <div
                className="hidden items-center gap-2 rounded-lg border border-risk-orange/40 bg-risk-orange/[0.07] px-2.5 py-1.5 sm:flex"
                data-tour="live"
                title={
                  lang === 'hi'
                    ? 'मौसम स्रोत अभी उपलब्ध नहीं; नदी गेज व आधिकारिक चेतावनियाँ लाइव हैं'
                    : `Weather source unavailable${meta.weather_pause_kind ? ` (${meta.weather_pause_kind} limit reached)` : ''}. River gauges and official alerts are still live; scores update when they change.`
                }
              >
                <LiveDot refreshing={refreshing} />
                <div className="leading-tight">
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-risk-orange">
                    {lang === 'hi' ? 'गेज लाइव · मौसम रुका' : 'Gauges live · weather paused'}
                  </div>
                  <div className="font-mono text-[11px] text-ink-300">
                    {lang === 'hi' ? 'मौसम ' : 'weather '}
                    {relativeAge(meta.weather_age_seconds + tick * 15, lang)}
                    {meta.weather_paused_until &&
                      ` · ${lang === 'hi' ? 'फिर' : 'resumes'} ${new Date(meta.weather_paused_until).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="hidden items-center gap-2 rounded-lg border border-indiagreen-500/30 bg-indiagreen-500/[0.06] px-2.5 py-1.5 sm:flex"
                data-tour="live"
                title={lang === 'hi' ? 'आँकड़े अपने-आप अद्यतन होते हैं' : 'Data updates automatically — no need to refresh'}
              >
                <LiveDot refreshing={refreshing} />
                <div className="leading-tight">
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-indiagreen-300">
                    {refreshing ? t(lang, 'refreshing') : lang === 'hi' ? 'लाइव · स्वतः अद्यतन' : 'Live · auto-updates'}
                  </div>
                  <div className="font-mono text-[11px] text-ink-300">
                    {meta ? relativeAge(ageSeconds, lang) : '—'}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn-ai"
              onClick={onOpenCopilot}
              data-tour="copilot"
              title={lang === 'hi' ? 'आइरिस एआई से पूछें' : 'Ask IRIS AI'}
              aria-label={lang === 'hi' ? 'आइरिस एआई' : 'Ask IRIS AI'}
            >
              <Sparkle size={15} className="relative text-aurora-cyan" />
              <span className={`relative hidden sm:inline ${lang === 'hi' ? 'font-devanagari' : ''}`}>
                {lang === 'hi' ? 'आइरिस एआई' : 'Ask IRIS AI'}
              </span>
            </button>

            {onOpenTour && (
              <button
                type="button"
                className="btn"
                onClick={onOpenTour}
                data-tour="tutorial"
                title={lang === 'hi' ? 'ट्यूटोरियल: हर सुविधा चरण-दर-चरण' : 'Tutorial: every feature, step by step'}
                aria-label={lang === 'hi' ? 'ट्यूटोरियल' : 'Tutorial'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span className={`hidden xl:inline ${lang === 'hi' ? 'font-devanagari' : ''}`}>{lang === 'hi' ? 'ट्यूटोरियल' : 'Tutorial'}</span>
              </button>
            )}

            <button
              type="button"
              className="btn"
              data-tour="system"
              onClick={onOpenSystem}
              title={t(lang, 'howItWorks')}
              aria-label={t(lang, 'howItWorks')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="2" />
                <path d="M12 10.6v6M12 7.6h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>

            {user && (
              <div className="flex items-center gap-2 border-l border-ink-700 pl-2" data-tour="account">
                <div className={`hidden text-right leading-tight lg:block ${lang === 'hi' ? 'font-devanagari' : ''}`}>
                  <div className="max-w-[180px] truncate text-[12.5px] font-bold text-chakra-500">{user.area}</div>
                  <div className="text-[10.5px] text-ink-500">
                    {user.roleLabel}
                    {user.demo ? (lang === 'hi' ? ' · डेमो' : ' · demo') : ''}
                  </div>
                </div>
                <button type="button" className="btn px-2.5 text-[12px]" onClick={onLogout} title={lang === 'hi' ? 'बाहर निकलें' : 'Sign out'}>
                  {lang === 'hi' ? 'बाहर निकलें' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <WaveRule />
    </header>
  );
}

/**
 * Scrolling advisory ticker.
 *
 * The list is duplicated and the track translated -50%, which is what makes the
 * loop seamless; `aria-hidden` on the clone keeps screen readers from reading
 * every alert twice.
 */
export function AlertTicker({ lang, worst = [], summary }) {
  const items = useMemo(() => {
    const rows = worst.map((w) => ({
      key: w.id,
      tier: w.tier,
      text: `${lang === 'hi' && w.name_hi ? w.name_hi : w.name}, ${stateName(
        w.state,
        lang,
      )} — ${w.score.toFixed(0)}/100 ${
        lang === 'hi' ? TIER_LABELS[w.tier]?.hi ?? '' : TIER_LABELS[w.tier]?.en ?? ''
      }${w.river ? ` · ${w.river}` : ''}`,
    }));
    return rows.length ? rows : [{ key: 'none', tier: 'green', text: pickPlain(lang, summary) }];
  }, [worst, lang, summary]);

  const Row = ({ ariaHidden }) => (
    <div
      className="flex shrink-0 items-center gap-7 pr-7"
      aria-hidden={ariaHidden ? 'true' : undefined}
    >
      {items.map((it) => (
        <span key={it.key} className="flex shrink-0 items-center gap-2 text-[11.5px] font-medium">
          <span
            className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white/80"
            style={{ background: tierColour(it.tier) }}
          />
          <span className={lang === 'hi' ? 'font-devanagari' : ''}>{it.text}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div data-tour="ticker" className="relative z-10 flex shrink-0 items-stretch bg-gradient-to-r from-saffron-500 to-saffron-400 text-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2 bg-chakra-500 px-3 py-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-saffron-400" />
        <span className={`text-[10px] font-bold uppercase tracking-[0.14em] text-white ${lang === 'hi' ? 'font-devanagari' : ''}`}>
          {lang === 'hi' ? 'ताज़ा सलाह' : 'Latest advisory'}
        </span>
      </div>
      <div className="group relative flex-1 overflow-hidden py-1.5 text-white">
        <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
          <Row />
          <Row ariaHidden />
        </div>
        {/* Fade the ends so text does not collide with the chrome. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-saffron-500 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-saffron-400 to-transparent" />
      </div>
    </div>
  );
}

export function TierLegend({ lang, counts, compact = false }) {
  return (
    <div className={`flex ${compact ? 'gap-2' : 'gap-3'} flex-wrap items-center`}>
      {TIER_ORDER.map((tier) => (
        <div key={tier} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: tierColour(tier) }}
            aria-hidden="true"
          />
          <span className={`text-[10.5px] text-ink-300 ${lang === 'hi' ? 'font-devanagari' : ''}`}>
            {lang === 'hi' ? TIER_LABELS[tier].hi : TIER_LABELS[tier].en}
          </span>
          {counts && (
            <span className="font-mono text-[10.5px] font-semibold text-ink-100">
              {counts[tier] ?? 0}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function Footer({ lang, system, meta }) {
  const disclaimer = system?.app
    ? lang === 'hi'
      ? system.app.disclaimer_hi
      : system.app.disclaimer_en
    : '';

  return (
    <footer data-tour="footer" className="relative z-10 shrink-0 bg-gradient-to-r from-chakra-500 via-chakra-400 to-[#0E4F6E] px-4 py-2 text-white lg:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* basis-full below lg: sharing a row with the shrink-0 run stats
            squeezed this paragraph to one word per line on a phone */}
        <p
          className={`basis-full text-[10.5px] leading-snug text-white/80 lg:min-w-0 lg:flex-1 lg:basis-auto ${
            lang === 'hi' ? 'font-devanagari' : ''
          }`}
        >
          {disclaimer}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-white/70">
          {meta && (
            <>
              <span>run #{meta.run_id}</span>
              <span className="text-white/30">·</span>
              <span>{meta.locations} loc</span>
              <span className="text-white/30">·</span>
              <span>{(meta.duration_ms / 1000).toFixed(1)}s</span>
              <span className="text-white/30">·</span>
              <span>GloFAS {meta.climatology_years}</span>
            </>
          )}
          {system?.app && (
            <>
              <span className="text-white/30">·</span>
              <span>v{system.app.version}</span>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Four-point sparkle: the mark for anything the AI says or does. */
export function Sparkle({ size = 14, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M12 2.5l2.1 5.6 5.6 2.1-5.6 2.1L12 17.9l-2.1-5.6-5.6-2.1 5.6-2.1L12 2.5zM19 15.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Floating "Ask IRIS AI" orb, bottom-right on every signed-in page. */
export function AiOrb({ lang, onClick }) {
  const label = lang === 'hi' ? 'आइरिस एआई से पूछें' : 'Ask IRIS AI';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group fixed bottom-14 right-4 z-[1500] flex items-center gap-2 sm:bottom-16 sm:right-6"
    >
      <span className={`pointer-events-none hidden translate-x-2 rounded-full bg-midnight-900/90 px-3 py-1.5 text-[12px] font-bold text-white opacity-0 shadow-lg backdrop-blur transition group-hover:translate-x-0 group-hover:opacity-100 sm:block ${lang === 'hi' ? 'font-devanagari' : ''}`}>
        {label}
      </span>
      <span className="relative grid h-14 w-14 place-items-center">
        <span className="absolute inset-0 animate-ripple rounded-full bg-aurora-violet/30" aria-hidden="true" />
        <span className="absolute inset-0 animate-orb rounded-full bg-[conic-gradient(from_0deg,#6D5DFC,#22D3EE,#2DD4BF,#1A8CC4,#6D5DFC)] blur-[1px]" aria-hidden="true" />
        <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-midnight-700 via-midnight-900 to-midnight-950" aria-hidden="true" />
        <span className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,0.45),transparent_55%)]" aria-hidden="true" />
        <Sparkle size={22} className="relative text-white transition group-hover:scale-110 group-hover:rotate-12" />
      </span>
    </button>
  );
}

/**
 * Round water-level window: the water sits at `level` (0-100) and is tinted
 * with the risk colour, with two slowly turning surfaces for motion.
 */
export function WaterTank({ level, colour, size = 120, children }) {
  const style = { width: size, height: size, '--level': Math.max(6, Math.min(94, level)), '--water': `linear-gradient(180deg, ${colour}, ${colour}CC)` };
  return (
    <div className="iris-tank shrink-0" style={style}>
      <div className="iris-tank-water back" />
      <div className="iris-tank-water" />
      <div className="relative z-10 grid h-full w-full place-items-center text-center text-white">{children}</div>
    </div>
  );
}

/**
 * Canvas rain: individual drops in three depth layers, each a streak fading in
 * from its tail, slanted by a slowly gusting wind. Drops landing near the sea
 * leave a small spreading ripple. Off when the user prefers reduced motion.
 */
export function RainCanvas({ density = 1, className = '', tone = 'light' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const ctx = canvas.getContext('2d');
    // Streak colour: blue-grey on a light sky, pale silver on a dark one.
    const streak = tone === 'dark' ? '190,215,240' : '70,125,170';
    // Far, middle, near: smaller, slower and fainter the further away.
    const LAYERS = [
      { share: 0.5, len: [8, 14], speed: [520, 680], width: 0.8, alpha: [0.12, 0.22] },
      { share: 0.35, len: [14, 22], speed: [720, 900], width: 1.1, alpha: [0.22, 0.34] },
      { share: 0.15, len: [24, 36], speed: [980, 1200], width: 1.5, alpha: [0.3, 0.46] },
    ];
    const rand = (a, b) => a + Math.random() * (b - a);
    let w = 0;
    let h = 0;
    let drops = [];
    const splashes = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;

    function spawn(layer, anywhere) {
      return {
        layer,
        x: rand(-0.1 * w, 1.1 * w),
        y: anywhere ? rand(-h, h) : rand(-120, -20),
        len: rand(...layer.len),
        speed: rand(...layer.speed),
        alpha: rand(...layer.alpha),
        // Near drops reach further down, so they land on the closer water.
        floor: h * rand(layer === LAYERS[2] ? 0.86 : 0.74, layer === LAYERS[2] ? 1 : 0.9),
      };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(260, (w * h) / 5200) * density);
      drops = [];
      LAYERS.forEach((layer) => {
        for (let i = 0; i < Math.round(count * layer.share); i += 1) drops.push(spawn(layer, true));
      });
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // Wind gusts: a slow wander between about 6 and 16 degrees of slant.
      const wind = 0.11 + 0.07 * Math.sin(t * 0.35) + 0.03 * Math.sin(t * 1.3);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';

      for (const d of drops) {
        const vx = d.speed * wind;
        d.x += vx * dt;
        d.y += d.speed * dt;
        const tailX = d.x - (vx / d.speed) * d.len;
        const tailY = d.y - d.len;
        const g = ctx.createLinearGradient(tailX, tailY, d.x, d.y);
        g.addColorStop(0, `rgba(${streak},0)`);
        g.addColorStop(0.7, `rgba(${streak},${d.alpha * 0.8})`);
        g.addColorStop(1, `rgba(225,242,252,${Math.min(1, d.alpha * 1.6)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = d.layer.width;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();

        if (d.y >= d.floor) {
          if (d.layer !== LAYERS[0] && splashes.length < 90) splashes.push({ x: d.x, y: d.y, r: 0.5, life: 1, big: d.layer === LAYERS[2] });
          Object.assign(d, spawn(d.layer, false));
        } else if (d.x > w * 1.15) {
          d.x -= w * 1.25;
        }
      }

      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const s = splashes[i];
        s.life -= dt * 2.4;
        s.r += dt * (s.big ? 26 : 16);
        if (s.life <= 0) {
          splashes.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(240,250,255,${0.55 * s.life})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r, s.r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [density, tone]);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true" />;
}
