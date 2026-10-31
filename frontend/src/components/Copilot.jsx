import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { tierColour } from '../lib/format';
import { IrisMark, Sparkle } from './Chrome';

/**
 * IRIS Copilot — a chat drawer over the live risk snapshot.
 *
 * The backend grounds every answer in the current data table and falls back to a
 * deterministic answerer with no LLM key, so the drawer is always usable. The
 * provider badge on each reply says which one answered, so an officer can tell a
 * Claude/Gemini phrasing from the offline rule-based one.
 */

const SUGGESTIONS = {
  en: [
    'Where is flood risk highest right now?',
    'Which locations on the Brahmaputra need attention?',
    'Why is Patna at its current level?',
    'Which places show unusual conditions?',
  ],
  hi: [
    'अभी बाढ़ का जोखिम सबसे अधिक कहाँ है?',
    'असम की स्थिति क्या है?',
    'पटना का जोखिम स्तर क्यों है?',
    'कहाँ असामान्य परिस्थितियाँ हैं?',
  ],
};

/** Minimal formatting: bullets and paragraphs, nothing that could inject HTML. */
function Rich({ text, lang }) {
  const lines = text.split('\n');
  return (
    <div className={`space-y-1 text-[12px] leading-relaxed ${lang === 'hi' ? 'font-devanagari' : ''}`}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const bullet = /^([•\-*]|\d+\.)\s+/.test(trimmed);
        const content = trimmed.replace(/^([•\-*]|\d+\.)\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1');
        return bullet ? (
          <div key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500" />
            <span>{content}</span>
          </div>
        ) : (
          <p key={i}>{content}</p>
        );
      })}
    </div>
  );
}

export default function Copilot({ lang, open, onClose, onSelectLocation, locations = [], prompt = null, onPromptUsed }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // The parent passes a fresh onClose each render; reading it through a ref keeps
  // the Escape listener bound once per open instead of being torn down and
  // re-added on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    api.aiStatus().then(setStatus).catch(() => {});
    const focus = setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(focus);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // A question handed in from elsewhere (e.g. a suggestion chip) is asked once.
  useEffect(() => {
    if (open && prompt) {
      ask(prompt);
      onPromptUsed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await api.copilot(q, history, /[ऀ-ॿ]/.test(q) ? 'hi' : lang);
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, provider: res.provider, model: res.model }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: err.message, provider: 'error' }]);
    } finally {
      setBusy(false);
    }
  }

  // Place names mentioned in the latest answer become one-tap chips.
  const lastAnswer = [...messages].reverse().find((m) => m.role === 'assistant');
  const mentioned = lastAnswer
    ? locations.filter((l) => lastAnswer.content.includes(l.name) || (l.name_hi && lastAnswer.content.includes(l.name_hi))).slice(0, 6)
    : [];

  const provider = status?.llm?.preferred;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-navy-800/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-ink-700 bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="IRIS Copilot"
        aria-hidden={!open}
      >
        <header className="relative overflow-hidden bg-gradient-to-br from-midnight-700 via-midnight-900 to-midnight-950 px-4 py-4 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-aurora-violet/40 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-aurora-cyan/30 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/95 shadow-[0_0_24px_rgba(34,211,238,0.45)]">
            <IrisMark size={30} spinning={busy} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className={`flex items-center gap-2 text-[15px] font-bold ${lang === 'hi' ? 'font-devanagari' : ''}`}>
              {lang === 'hi' ? 'आइरिस एआई सहायक' : 'IRIS AI'}
              <span className="ai-chip px-2 py-0 text-[9px]">
                <Sparkle size={9} /> {lang === 'hi' ? 'लाइव' : 'Live data'}
              </span>
            </h2>
            <p className="truncate text-[10.5px] text-white/75">
              {provider
                ? `${provider} · ${status.llm.models[provider]} · ${lang === 'hi' ? 'लाइव आँकड़ों पर आधारित' : 'grounded in live data'}`
                : lang === 'hi'
                  ? 'ऑफ़लाइन मोड · लाइव आँकड़ों पर आधारित'
                  : 'Offline mode · grounded in live data (add a free Gemini/Groq key for full AI)'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
          </div>
        </header>
        <div className="h-[2px] w-full animate-shimmer bg-[linear-gradient(90deg,#6D5DFC,#22D3EE,#2DD4BF,#6D5DFC)] bg-[length:200%_100%]" aria-hidden="true" />

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#F4F3FF] via-ink-950 to-ink-950 p-4 scrollbar-thin">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="ai-frame rounded-2xl p-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-aurora-ink">
                  <Sparkle size={12} /> {lang === 'hi' ? 'नमस्ते' : 'Hello'}
                </div>
                <p className={`text-[12.5px] leading-relaxed text-ink-200 ${lang === 'hi' ? 'font-devanagari' : ''}`}>
                  {lang === 'hi'
                    ? 'नमस्ते! मैं 41 निगरानी स्थानों के लाइव बाढ़ जोखिम आँकड़ों से उत्तर देता हूँ। हिंदी या अंग्रेज़ी में पूछें।'
                    : 'Namaste! I answer from the live flood-risk data for all 41 monitored locations. Ask in English or Hindi.'}
                </p>
              </div>
              <div className="grid gap-2">
                {SUGGESTIONS[lang].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className={`group flex items-center gap-2 rounded-xl border border-aurora-violet/20 bg-white px-3 py-2 text-left text-[12px] font-medium text-ink-200 shadow-sm transition hover:-translate-y-px hover:border-aurora-violet/50 hover:shadow-md ${lang === 'hi' ? 'font-devanagari' : ''}`}
                  >
                    <Sparkle size={12} className="shrink-0 text-aurora-violet transition group-hover:rotate-45" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className={`max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-chakra-500 to-saffron-700 px-3.5 py-2 text-[12.5px] text-white shadow-md ${/[ऀ-ॿ]/.test(m.content) ? 'font-devanagari' : ''}`}>
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex animate-fade-up justify-start gap-2">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-aurora-violet to-aurora-cyan text-white shadow" aria-hidden="true">
                  <Sparkle size={13} />
                </span>
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-aurora-violet/15 bg-white px-3.5 py-2.5 text-ink-100 shadow-sm">
                  <Rich text={m.content} lang={/[ऀ-ॿ]/.test(m.content) ? 'hi' : 'en'} />
                  {m.provider && (
                    <div className="mt-2 flex items-center gap-1.5 border-t border-ink-800 pt-1.5 text-[9.5px] uppercase tracking-wider text-ink-500">
                      <span className={`h-1.5 w-1.5 rounded-full ${m.provider === 'offline' ? 'bg-ink-500' : m.provider === 'error' ? 'bg-risk-red' : 'bg-indiagreen-400'}`} />
                      {m.provider === 'offline' ? (lang === 'hi' ? 'ऑफ़लाइन नियम-आधारित' : 'offline rule-based') : m.provider}
                      {m.model && m.provider !== 'offline' && <span className="normal-case tracking-normal">· {m.model}</span>}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 animate-pulse place-items-center rounded-full bg-gradient-to-br from-aurora-violet to-aurora-cyan text-white" aria-hidden="true">
                <Sparkle size={13} />
              </span>
              <span className="text-aurora animate-shimmer bg-[length:200%_100%] text-[12px] font-semibold">
                {lang === 'hi' ? 'लाइव आँकड़े पढ़ रहा हूँ…' : 'Reading the live data…'}
              </span>
            </div>
          )}

          {mentioned.length > 0 && !busy && (
            <div className="flex flex-wrap gap-1.5">
              {mentioned.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    onSelectLocation(l.id);
                    onClose();
                  }}
                  className="chip border-ink-700 bg-white text-ink-200 hover:border-chakra-500"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: tierColour(l.tier) }} />
                  {lang === 'hi' && l.name_hi ? l.name_hi : l.name} →
                </button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-ink-700 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={lang === 'hi' ? 'प्रश्न पूछें…' : 'Ask about any city, state or river…'}
            className={`min-w-0 flex-1 rounded-full border border-ink-700 bg-ink-850 px-4 py-2.5 text-[12.5px] text-ink-100 placeholder:text-ink-500 focus:border-aurora-violet focus:ring-2 focus:ring-aurora-violet/15 ${lang === 'hi' ? 'font-devanagari' : ''}`}
            maxLength={2000}
          />
          <button type="submit" className="btn-ai h-10 w-10 px-0 disabled:opacity-50" disabled={busy || !input.trim()} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" className="relative" />
            </svg>
          </button>
        </form>
      </aside>
    </>
  );
}

/* ---------------------------------------------------- national ML insights */

export function NationalInsights({ lang, onSelectLocation, runId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .insights()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [runId]);

  if (error) return <p className="p-3 text-[11px] text-risk-red">{error}</p>;
  if (!data) return <p className="p-3 text-[11px] text-ink-500">…</p>;

  const Row = ({ r, right, sub }) => (
    <li>
      <button
        type="button"
        onClick={() => onSelectLocation(r.id)}
        className="flex w-full items-center gap-2.5 border-b border-ink-800 px-3 py-1.5 text-left hover:bg-ink-850"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tierColour(r.tier) }} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[11.5px] font-semibold text-ink-100 ${lang === 'hi' ? 'font-devanagari' : ''}`}>
            {lang === 'hi' && r.name_hi ? r.name_hi : r.name}
          </span>
          {sub && <span className={`block truncate text-[10px] text-ink-500 ${lang === 'hi' ? 'font-devanagari' : ''}`}>{sub}</span>}
        </span>
        <span className="shrink-0 font-mono text-[11px] font-bold text-chakra-500">{right}</span>
      </button>
    </li>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="kicker px-3 pb-1 pt-2">{lang === 'hi' ? 'सबसे असामान्य (आइसोलेशन फ़ॉरेस्ट)' : 'Most unusual (anomaly model)'}</div>
      <ul>
        {data.anomalies.slice(0, 5).map((r) => (
          <Row
            key={r.id}
            r={r}
            right={r.anomaly_score?.toFixed(0)}
            sub={r.unusual_features?.map((f) => (lang === 'hi' ? f.label_hi : f.label_en)).join(', ')}
          />
        ))}
      </ul>

      {data.analog_ranking.length > 0 && (
        <>
          <div className="kicker px-3 pb-1 pt-3">{lang === 'hi' ? 'ऐतिहासिक एनालॉग बाढ़ संभावना' : 'Historical-analog flood probability'}</div>
          <ul>
            {data.analog_ranking.slice(0, 5).map((r) => (
              <Row key={r.id} r={r} right={`${(r.knn_flood_probability * 100).toFixed(0)}%`} sub={r.top_analog?.headline} />
            ))}
          </ul>
        </>
      )}

      {data.model_disagreements.length > 0 && (
        <>
          <div className="kicker px-3 pb-1 pt-3">{lang === 'hi' ? 'जहाँ मॉडल असहमत हैं — पुनः देखें' : 'Where the models disagree — look twice'}</div>
          <ul>
            {data.model_disagreements.map((r) => (
              <Row
                key={r.id}
                r={r}
                right={`${r.gap > 0 ? '+' : ''}${r.gap.toFixed(0)}`}
                sub={lang === 'hi' ? `नियम ${r.score.toFixed(0)} बनाम k-NN ${(r.knn_flood_probability * 100).toFixed(0)}%` : `rules ${r.score.toFixed(0)} vs k-NN ${(r.knn_flood_probability * 100).toFixed(0)}%`}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
