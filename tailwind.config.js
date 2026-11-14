/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', surface2: 'var(--surface-2)', line: 'var(--line)',
        ink: 'var(--ink)', muted: 'var(--muted)', primary: 'var(--primary)', 'primary-ink': 'var(--primary-ink)',
        gold: 'var(--gold)', 'gold-ink': 'var(--gold-ink)', teal: 'var(--teal)', coral: 'var(--coral)',
        navy: 'var(--navy)', good: 'var(--good)', bad: 'var(--bad)', 'good-bg': 'var(--good-bg)', 'bad-bg': 'var(--bad-bg)',
      },
      fontFamily: { display: 'var(--font-display)', sans: 'var(--font-ui)' },
      borderRadius: { card: '20px', tile: '14px' },
      boxShadow: { card: '0 2px 0 var(--line), 0 12px 32px -18px var(--shadow)', pop: '0 18px 50px -20px var(--shadow)' },
      maxWidth: { stage: '1040px', col: '560px' },
    },
  },
  plugins: [],
};
