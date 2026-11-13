import { fileURLToPath } from 'node:url'

const site = (p) => fileURLToPath(new URL(`./site/${p}`, import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [site('index.html'), site('src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        cobalt: 'rgb(var(--cobalt) / <alpha-value>)',
        sky: 'rgb(var(--sky) / <alpha-value>)',
        coral: 'rgb(var(--coral) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
        night: 'rgb(var(--night) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        pop: { from: { transform: 'scale(.92)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        rise: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        pop: 'pop .22s cubic-bezier(.2,.8,.2,1) both',
        rise: 'rise .25s ease-out both',
      },
    },
  },
  plugins: [],
}
