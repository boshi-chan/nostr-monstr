/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{svelte,ts,js}'],
  theme: {
    extend: {
      colors: {
        primary: '#f59e5b',
        secondary: '#FFB261',
        accent: '#f59e5b',
        dark: '#13151a',
        'dark-light': '#16181d',
        'dark-lighter': '#1a1c22',
        'dark-border': '#1f252e',
        'text-soft': '#F2F2F2',
        'text-muted': '#A6A6A6',
        surface: '#16181d',
        'surface-elevated': '#1a1c22',
        bg: {
          primary: '#13151a',
          secondary: '#16181d',
          tertiary: '#1a1c22',
        },
        text: {
          primary: '#F2F2F2',
          secondary: '#F2F2F2',
          tertiary: '#A6A6A6',
        },
      },
      boxShadow: {
        glow: '0 20px 45px -18px rgba(245, 158, 91, 0.55)',
        inset: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.04)',
      },
      backgroundImage: {
        'panel-gradient':
          'linear-gradient(145deg, rgba(245, 158, 91, 0.12) 0%, rgba(19, 21, 26, 0) 60%)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
}
