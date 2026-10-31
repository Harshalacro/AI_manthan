/**
 * Design tokens for IRIS — Integrated Rainfall & Inundation Sentinel.
 *
 * Two palettes live here and they must not be confused:
 *
 *   `saffron` / `indiagreen` / `chakra` are the *identity* colours. The names are
 *   historical (kept so components did not need rewriting); the values are now
 *   IRIS's water palette, taken from the logo: `chakra` is the deep-ocean ink of
 *   the wordmark, `saffron` is the sky-blue accent, `indiagreen` the teal of the
 *   ripple rings. Used for chrome, headings, buttons and links.
 *
 *   `risk` is the *semantic* scale, taken from IMD's operational four-colour
 *   warning convention. These are never used decoratively — if something is
 *   orange in this app it means IMD Orange, "be prepared". A water-blue identity
 *   keeps the warning colours the only warm hues on screen.
 *
 * Theme: light. White surfaces on a pale sky wash, ocean-navy text. The `ink`
 * scale keeps its semantic roles (950 = page, 900 = panel, 100 = strongest text).
 * Accent shades used *as text* (200-300 level) are deepened to pass WCAG AA on white.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        saffron: {
          50: '#EEF8FD',
          100: '#D7EEF9',
          200: '#0A5577', // text on white (hover)
          300: '#0C6589', // text on white
          400: '#2A9FD3',
          500: '#1A8CC4', // primary sky
          600: '#147AAD',
          700: '#0F6390',
          800: '#0B4C6D',
          900: '#073449',
        },
        indiagreen: {
          300: '#0E7069', // text on white
          400: '#14857C',
          500: '#0F766E', // ripple teal
          600: '#0B5C56',
          700: '#07403C',
        },
        chakra: {
          300: '#1F5C86',
          400: '#174A70',
          500: '#0F2F4F', // ocean navy (wordmark)
          600: '#0A223A',
        },
        navy: {
          50: '#EEF5FB',
          100: '#DBE9F4',
          500: '#1E4A6E',
          600: '#173A58',
          700: '#112C44',
          800: '#0B1E30',
        },
        // AI accent: anything the model writes or answers carries this gradient,
        // so "the machine is talking" is recognisable at a glance.
        aurora: {
          violet: '#6D5DFC',
          indigo: '#4F46E5',
          cyan: '#22D3EE',
          mint: '#2DD4BF',
          ink: '#4338CA', // violet as text on white
        },
        // High-contrast surface for hero bands and the AI orb.
        midnight: {
          700: '#12304F',
          800: '#0B2038',
          900: '#071628',
          950: '#040E1C',
        },
        risk: {
          green: '#0B8A3D',
          yellow: '#C99700', // IMD yellow, darkened enough to read as text on white
          orange: '#E4701E',
          red: '#C1121F',
        },
        ink: {
          950: '#F1F7FB', // page
          900: '#FFFFFF', // panel
          850: '#F6FAFD', // inset / input
          800: '#EAF2F8', // hover, bar track
          750: '#E1EBF3',
          700: '#D3E1EC', // borders
          600: '#AFC3D3',
          500: '#62788D', // kicker
          400: '#4A6075', // secondary text
          300: '#33485C',
          200: '#203447',
          100: '#0D1E30', // primary text
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        devanagari: ['Noto Sans Devanagari', 'Nirmala UI', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(13,30,48,0.05), 0 10px 28px -18px rgba(15,47,79,0.22)',
        glow: '0 0 0 1px rgba(26,140,196,0.35), 0 6px 20px -8px rgba(26,140,196,0.45)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'chakra-spin': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'wave-drift': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'wave-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(6px)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.55' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        orb: {
          to: { transform: 'rotate(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'sheen': {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.2,0.6,0.35,1) infinite',
        ticker: 'ticker 48s linear infinite',
        'chakra-spin': 'chakra-spin 9s linear infinite',
        'fade-up': 'fade-up 0.32s ease-out both',
        sheen: 'sheen 2.2s ease-in-out infinite',
        shimmer: 'shimmer 3.2s ease-in-out infinite',
        orb: 'orb 8s linear infinite',
        ripple: 'ripple 2.6s cubic-bezier(0.2,0.6,0.35,1) infinite',
        float: 'float 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
