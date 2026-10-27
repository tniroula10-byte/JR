import type { Config } from 'tailwindcss';

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
          950: '#070913',
          900: '#0B0F1F',
          800: '#0F1424',
          700: '#161F36',
          600: '#1E2946'
        },
        brand: {
          DEFAULT: '#8B5CF6',
          light: '#A78BFA',
          dark: '#7C3AED',
          glow: 'rgba(139, 92, 246, 0.35)'
        }
      },
      boxShadow: {
        'violet-glow': '0 0 22px -2px rgba(139, 92, 246, 0.4)',
        'violet-subtle': '0 4px 20px -4px rgba(139, 92, 246, 0.2)'
      }
    }
  },
  plugins: []
};

export default config;
