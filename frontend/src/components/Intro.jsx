import { useEffect, useState } from 'react';
import { WaveSea } from './Chrome';

/**
 * Opening intro: ripples spread, the IRIS emblem surfaces, the name rises letter
 * by letter, then the sea rolls in and lifts away to reveal the app.
 *
 * Plays once per browser session (sessionStorage), ~3 s, and any click or key
 * skips it. With reduced motion it shows briefly and fades.
 */

const SEEN_KEY = 'iris.introSeen';
const LENGTH_MS = 3400;
const EXIT_MS = 700;

function alreadySeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Intro({ lang }) {
  const [phase, setPhase] = useState(() => (alreadySeen() ? 'done' : 'play'));

  useEffect(() => {
    if (phase !== 'play') return undefined;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* non-fatal */
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => setPhase('exit'), reduced ? 900 : LENGTH_MS);
    const skip = () => setPhase('exit');
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', skip);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'exit') return undefined;
    const id = setTimeout(() => setPhase('done'), EXIT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      className={`iris-intro iris-sky fixed inset-0 z-[6000] grid cursor-pointer place-items-center overflow-hidden ${phase === 'exit' ? 'iris-intro-exit' : ''}`}
      onClick={() => setPhase('exit')}
      role="presentation"
    >
      {/* ripples spreading from the centre */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden="true">
        {[0, 0.45, 0.9, 1.35].map((d) => (
          <span key={d} className="iris-intro-ring absolute rounded-full border border-saffron-400/60" style={{ animationDelay: `${d}s` }} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pb-24 text-center">
        <img src="/iris-mark.png" alt="" width="387" height="356" className="iris-intro-mark h-auto w-[170px] sm:w-[220px]" draggable="false" />
        <h1 className="mt-4 flex font-display text-[54px] font-semibold leading-none text-chakra-500 sm:text-[72px]" aria-label="IRIS">
          {['I', 'R', 'I', 'S'].map((ch, i) => (
            <span key={i} className="iris-intro-letter inline-block px-[0.12em]" style={{ animationDelay: `${0.9 + i * 0.12}s` }} aria-hidden="true">
              {ch}
            </span>
          ))}
        </h1>
        <div className="iris-intro-line mt-4 h-px w-48 bg-gradient-to-r from-transparent via-saffron-500 to-transparent" aria-hidden="true" />
        <p className="iris-intro-tag mt-4 font-display text-[13px] font-semibold uppercase tracking-[0.34em] text-chakra-400 sm:text-[16px]">
          {lang === 'hi' ? 'एकीकृत वर्षा एवं जलभराव प्रहरी' : 'Integrated Rainfall & Inundation Sentinel'}
        </p>
      </div>

      <div className="iris-intro-sea pointer-events-none absolute inset-x-0 bottom-0">
        <WaveSea height={240} />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPhase('exit');
        }}
        className="absolute bottom-5 right-5 z-20 rounded-full border border-white/50 bg-white/20 px-4 py-1.5 text-[12px] font-bold text-white backdrop-blur transition hover:bg-white/35"
      >
        {lang === 'hi' ? 'छोड़ें' : 'Skip'} →
      </button>
    </div>
  );
}
