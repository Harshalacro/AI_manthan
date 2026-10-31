import { useEffect, useState } from 'react';
import { href } from '../lib/router';
import { stateName, tierColour, TIER_LABELS } from '../lib/format';
import { Sparkle, TIER_GLOW as GLOW, WaterTank } from '../components/Chrome';
import WeatherScene, { sceneFor, WeatherChip } from '../components/WeatherScene';

/**
 * "My locality": the home screen for a citizen account.
 *
 * Built from the same live briefing as the officials' "My area", scoped by the
 * server to the resident's home district, but written for residents: how serious
 * it is, what to do, which roads to avoid, what is coming, and who to call. The
 * control-room tools (advisory drafts, planning, notifications) are not here and
 * the server refuses them for citizen accounts.
 */

const RESIDENT_ACTION = {
  red: { en: 'Danger — follow official instructions now', hi: 'खतरा — अभी आधिकारिक निर्देशों का पालन करें' },
  orange: { en: 'Be prepared to act', hi: 'कार्रवाई के लिए तैयार रहें' },
  yellow: { en: 'Stay alert', hi: 'सतर्क रहें' },
  green: { en: 'No flood risk right now', hi: 'अभी बाढ़ का ख़तरा नहीं' },
};
const INK = { red: '#A50F1A', orange: '#B4530F', yellow: '#7A5E00', green: '#0A6E31' };
// How full the water gauge in the hero looks for each tier.
const LEVEL = { green: 18, yellow: 42, orange: 66, red: 88 };

const KIND = {
  place: { en: 'Flood risk', hi: 'बाढ़ जोखिम' },
  gauge: { en: 'River above danger', hi: 'नदी खतरे से ऊपर' },
  wave: { en: 'Flood wave coming', hi: 'बाढ़ लहर आ रही' },
  official: { en: 'Official warning', hi: 'आधिकारिक चेतावनी' },
};
const HELPLINES = [
  ['112', 'National emergency', 'राष्ट्रीय आपात नंबर'],
  ['1078', 'NDMA disaster helpline', 'NDMA आपदा हेल्पलाइन'],
  ['1070', 'State emergency operations centre', 'राज्य आपात संचालन केंद्र'],
  ['1077', 'District emergency operations centre', 'ज़िला आपात संचालन केंद्र'],
];

function Card({ title, icon, children }) {
  return (
    <section className="glass-card group overflow-hidden rounded-2xl transition hover:-translate-y-0.5">
      <h2 className="flex items-center gap-2.5 border-b border-white/70 bg-gradient-to-r from-white/70 to-white/10 px-4 py-3 text-[14px] font-extrabold text-chakra-500">
        {icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-saffron-500 to-indiagreen-500 text-[13px] text-white shadow-sm" aria-hidden="true">
            {icon}
          </span>
        )}
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Reveals text a few characters at a time, like the model writing it. */
function useTyped(text) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(text.length);
      return undefined;
    }
    setN(0);
    const id = setInterval(() => setN((v) => Math.min(text.length, v + 3)), 16);
    return () => clearInterval(id);
  }, [text]);
  return text.slice(0, n);
}

/** The briefing card: a plain summary assembled from the live brief, typed out. */
function AiBrief({ lang, text, questions, onAsk }) {
  const typed = useTyped(text);
  const done = typed.length >= text.length;
  return (
    <section className="ai-frame rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ai-chip">
          <Sparkle size={11} /> IRIS AI
        </span>
        <span className="text-[12px] font-semibold text-ink-500">{lang === 'hi' ? 'आपके इलाके का सारांश, लाइव आँकड़ों से' : 'Your briefing, written from live data'}</span>
      </div>
      <p className="mt-3 min-h-[3.2em] text-[15.5px] leading-relaxed text-ink-100" aria-label={text}>
        <span aria-hidden="true">{typed}</span>
        {!done && <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-aurora-violet" aria-hidden="true" />}
      </p>
      {onAsk && (
        <div className="mt-4 flex flex-wrap gap-2">
          {questions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-aurora-violet/25 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-aurora-ink shadow-sm transition hover:-translate-y-px hover:border-aurora-violet/60 hover:shadow-md"
            >
              <Sparkle size={11} className="transition group-hover:rotate-45" />
              {q}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CitizenHome({ lang, user, brief, error, onRetry, onOpenCopilot, onAsk }) {
  const L = (en, hi) => (lang === 'hi' ? hi : en);
  const hiFont = lang === 'hi' ? 'font-devanagari' : '';

  if (error && !brief) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="rounded-xl border border-risk-red/40 bg-white p-4 text-[13px] text-risk-red">{error}</p>
        <button type="button" className="btn btn-primary mt-3" onClick={onRetry}>{L('Try again', 'पुनः प्रयास करें')}</button>
      </div>
    );
  }
  if (!brief) return <div className="p-10 text-center text-[13px] text-ink-400">{L('Checking your area…', 'आपके क्षेत्र की जाँच हो रही है…')}</div>;

  const place = brief.places[0];
  const tier = place?.tier ?? 'green';
  const colour = tierColour(tier);
  const resident = brief.resident ?? { en: [], hi: [], routes: [] };
  const steps = (resident[lang] ?? resident.en).filter((x) => !x.startsWith('Avoid these roads') && !x.startsWith('इन सड़कों से बचें'));
  const coming = brief.coming_next.places.find((c) => c.id === place?.id);
  const wave = brief.coming_next.waves.find((w) => w.id === place?.id);
  const tz = { timeZone: 'Asia/Kolkata' };
  const updated = new Date(brief.computed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', ...tz });
  const area = `${user.district}, ${stateName(user.state, lang)}`;
  const glow = GLOW[tier];
  const scene = sceneFor(place ? [place] : [], tier);

  // The briefing is assembled only from fields in the live brief - nothing new is
  // inferred - so it can never say more than the data does.
  const reason = place && tier !== 'green' ? (lang === 'hi' ? place.reason_hi : place.reason_en) : null;
  const briefText = [
    L(`${user.district} is at ${TIER_LABELS[tier].en}: ${RESIDENT_ACTION[tier].en.toLowerCase()}.`, `${user.district} ${TIER_LABELS[tier].hi} स्तर पर है: ${RESIDENT_ACTION[tier].hi}।`),
    reason && L(`Main reason: ${reason}.`, `मुख्य कारण: ${reason}।`),
    coming
      ? L(`Risk may rise to ${TIER_LABELS[coming.to].en} in about ${coming.in_hours} hours.`, `लगभग ${coming.in_hours} घंटे में जोखिम ${TIER_LABELS[coming.to].hi} तक बढ़ सकता है।`)
      : L('No worsening is expected over the next 3 days.', 'अगले 3 दिनों में स्थिति बिगड़ने की आशंका नहीं।'),
    wave && L(`High water on the ${wave.river} could arrive in about ${wave.eta_h.p50} hours.`, `${wave.river} का ऊँचा पानी लगभग ${wave.eta_h.p50} घंटे में पहुँच सकता है।`),
    resident.routes?.length > 0 && L(`Avoid ${resident.routes.slice(0, 2).join(' and ')}.`, `${resident.routes.slice(0, 2).join(' व ')} से बचें।`),
    brief.alerts.length > 0
      ? L(`${brief.alerts.length} active warning${brief.alerts.length > 1 ? 's' : ''} listed below.`, `नीचे ${brief.alerts.length} सक्रिय चेतावनी।`)
      : L('There are no active warnings for your area.', 'आपके क्षेत्र के लिए कोई सक्रिय चेतावनी नहीं।'),
  ]
    .filter(Boolean)
    .join(' ');
  const questions = [
    L(`Is it safe to travel in ${user.district} today?`, `क्या आज ${user.district} में यात्रा सुरक्षित है?`),
    L(`Why is ${user.district} at this level?`, `${user.district} इस स्तर पर क्यों है?`),
    L('Which nearby rivers are rising?', 'पास की कौन सी नदियाँ बढ़ रही हैं?'),
  ];

  return (
    <div id="main-content" className={`mx-auto w-full max-w-[1100px] space-y-5 px-4 py-5 ${hiFont}`}>
      {/* ---------------------------------------------------------- status */}
      <section className="relative overflow-hidden rounded-[28px] bg-midnight-900 text-white shadow-[0_24px_60px_-30px_rgba(4,14,28,0.7)] ring-1 ring-white/5">
        <WeatherScene scene={scene} />

        <div className="relative flex flex-wrap items-center gap-6 px-6 py-7 sm:px-8">
          <WaterTank level={LEVEL[tier]} colour={colour} size={128}>
            <div>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" aria-hidden="true">
                <path d={tier === 'green' ? 'M5 12l5 5L20 7' : 'M12 3l9.5 17h-19L12 3zM12 10v4M12 17.5h.01'} />
              </svg>
              <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em]">{L(TIER_LABELS[tier].en, TIER_LABELS[tier].hi)}</div>
            </div>
          </WaterTank>
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: glow }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: glow }} />
              </span>
              {L('Live · your area', 'लाइव · आपका क्षेत्र')}
              {user.name ? <span className="normal-case tracking-normal text-white/60">· {user.name}</span> : null}
              <WeatherChip weather={scene.weather} lang={lang} />
            </div>
            <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{area}</h1>
            <p className="mt-1.5 text-[18px] font-semibold" style={{ color: glow }}>{L(RESIDENT_ACTION[tier].en, RESIDENT_ACTION[tier].hi)}</p>
            {reason && (
              <p className="mt-1.5 text-[13.5px] text-white/70">
                {L('Main reason', 'मुख्य कारण')}: {reason}
              </p>
            )}
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-3 border-t border-white/15 bg-white/[0.07] px-6 py-3 backdrop-blur-md sm:px-8">
          <span className="text-[12.5px] text-white/60">{L(`Updated ${updated} IST · updates automatically`, `अद्यतन ${updated} IST · स्वतः अद्यतन`)}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            {onOpenCopilot && (
              <button type="button" onClick={onOpenCopilot} className="btn-ai text-[12.5px]">
                <Sparkle size={13} className="relative text-aurora-cyan" />
                <span className="relative">{L('Ask about my area', 'मेरे क्षेत्र के बारे में पूछें')}</span>
              </button>
            )}
            {place && (
              <a href={href(`/hotspots/${place.id}`)} className="glass-dark inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold text-white transition hover:bg-white/20">
                {L('Street-level map', 'गली-स्तर नक्शा')} →
              </a>
            )}
          </span>
        </div>
      </section>

      <AiBrief lang={lang} text={briefText} questions={questions} onAsk={onAsk} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* ------------------------------------------------------ what to do */}
          <Card icon="✓" title={L('What you should do', 'आपको क्या करना चाहिए')}>
            {resident.routes?.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 text-[12.5px] font-bold text-ink-200">{L('Avoid these roads', 'इन सड़कों से बचें')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {resident.routes.map((r) => (
                    <span key={r} className="rounded-md border border-risk-red/30 bg-white px-2 py-0.5 text-[12.5px] font-semibold text-risk-red">⛔ {r}</span>
                  ))}
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {steps.map((x) => (
                <li key={x} className="flex gap-2 text-[13.5px] leading-snug text-ink-200">
                  <span className="text-saffron-500" aria-hidden="true">•</span>
                  {x}
                </li>
              ))}
            </ul>
          </Card>

          {/* -------------------------------------------------- coming next */}
          <Card icon="◷" title={L('Next 3 days', 'अगले 3 दिन')}>
            <ul className="space-y-2 text-[13.5px] text-ink-200">
              <li>
                {coming
                  ? L(
                      `Risk may rise to ${TIER_LABELS[coming.to].en} in about ${coming.in_hours} hours.`,
                      `लगभग ${coming.in_hours} घंटे में जोखिम ${TIER_LABELS[coming.to].hi} तक बढ़ सकता है।`,
                    )
                  : L('No worsening is expected in the next 3 days.', 'अगले 3 दिनों में स्थिति बिगड़ने की आशंका नहीं।')}
              </li>
              {wave && (
                <li>
                  {L(
                    `High water on the ${wave.river} may reach here in about ${wave.eta_h.p50} hours (between ${wave.eta_h.p10} and ${wave.eta_h.p90} h).`,
                    `${wave.river} नदी का ऊँचा पानी लगभग ${wave.eta_h.p50} घंटे में यहाँ पहुँच सकता है (${wave.eta_h.p10}–${wave.eta_h.p90} घंटे)।`,
                  )}
                </li>
              )}
            </ul>
          </Card>

          {/* ------------------------------------------------------ warnings */}
          <Card icon="!" title={L('Warnings for your area', 'आपके क्षेत्र की चेतावनियाँ')}>
            {brief.alerts.length === 0 ? (
              <p className="text-[13.5px] font-semibold text-indiagreen-300">{L('No warnings for your area right now.', 'अभी आपके क्षेत्र के लिए कोई चेतावनी नहीं।')}</p>
            ) : (
              <ul className="space-y-3">
                {brief.alerts.map((al) => (
                  <li key={al.id} className="rounded-xl border border-white/80 bg-white/60 p-3" style={{ borderLeft: `4px solid ${tierColour(al.level)}` }}>
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-ink-500">{L(KIND[al.kind]?.en ?? '', KIND[al.kind]?.hi ?? '')}</div>
                    <div className="mt-0.5 text-[14.5px] font-bold text-ink-100">{L(al.title_en, al.title_hi)}</div>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-300">{L(al.detail_en, al.detail_hi)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------- helplines */}
        <div className="space-y-5">
          <Card icon="☎" title={L('In an emergency', 'आपातकाल में')}>
            <ul className="space-y-2.5">
              {HELPLINES.map(([n, en, hi]) => (
                <li key={n}>
                  <a href={`tel:${n}`} className="flex items-baseline gap-3 rounded-lg px-1 hover:bg-ink-850">
                    <span className="w-14 shrink-0 font-mono text-[18px] font-extrabold text-chakra-500">{n}</span>
                    <span className="text-[12.5px] text-ink-300">{L(en, hi)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          <p className="glass-card rounded-xl p-3 text-[11.5px] leading-relaxed text-ink-500">
            {L(
              'IRIS is a research prototype, not an official warning. Always follow instructions from IMD, CWC, your State Disaster Management Authority and local officials.',
              'आइरिस एक शोध प्रोटोटाइप है, आधिकारिक चेतावनी नहीं। हमेशा IMD, CWC, राज्य आपदा प्रबंधन प्राधिकरण व स्थानीय अधिकारियों के निर्देशों का पालन करें।',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
