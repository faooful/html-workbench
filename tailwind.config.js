/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./renderer/src/**/*.{js,jsx}', './renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        panel: {
          DEFAULT: 'var(--panel)',
          subtle: 'var(--panel-subtle)',
          strong: 'var(--panel-strong)',
          hover: 'var(--panel-hover)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: 'var(--shadow)',
      },
    },
  },
  plugins: [],
}
