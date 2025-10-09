import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', ...fontFamily.sans]
      },
      colors: {
        brand: {
          50: '#f5f9ff',
          100: '#e0edff',
          200: '#bfd6ff',
          300: '#99bcff',
          400: '#6695ff',
          500: '#3b6fff',
          600: '#2550e6',
          700: '#1f43b3',
          800: '#1c3a8f',
          900: '#182e66'
        }
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      },
      boxShadow: {
        soft: '0 20px 45px rgba(28, 58, 143, 0.16)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};

export default config;
