import type { Config } from 'tailwindcss';

const luxuryGreenPalette = {
  50: '#ECFDF5',
  100: '#D1FAE5',
  200: '#A7F3D0',
  300: '#6EE7B7',
  400: '#34D399',
  500: '#10B981',
  600: '#059669',
  700: '#047857',
  800: '#065F46',
  900: '#064E3B',
  950: '#022C22'
};

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: '#030604',
          900: '#060C09',
          800: '#0A140F',
          700: '#0F1F17',
          600: '#162D22'
        },
        violet: luxuryGreenPalette,
        purple: luxuryGreenPalette,
        indigo: luxuryGreenPalette,
        fuchsia: luxuryGreenPalette,
        brand: {
          DEFAULT: '#10B981',
          light: '#34D399',
          dark: '#059669',
          glow: 'rgba(16, 185, 129, 0.38)'
        }
      },
      boxShadow: {
        'violet-glow': '0 0 24px -2px rgba(16, 185, 129, 0.42)',
        'violet-subtle': '0 4px 20px -4px rgba(16, 185, 129, 0.22)'
      }
    }
  },
  plugins: []
};

export default config;
