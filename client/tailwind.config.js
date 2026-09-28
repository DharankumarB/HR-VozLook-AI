/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#F6F7FB',
          100: '#E7E9F2',
          200: '#C9CDDB',
          300: '#A2A8BC',
          400: '#7C849C',
          500: '#5B637A',
          600: '#404759',
          700: '#2A3040',
          800: '#1A1F2B',
          900: '#101319',
          950: '#07070C',
        },
        surface: {
          DEFAULT: '#0E1017',
          soft: '#12151E',
          raised: '#171A25',
        },
        accent: {
          DEFAULT: '#7C5CFF',
          soft: '#9B86FF',
          deep: '#5A3FE0',
        },
        neon: {
          DEFAULT: '#22D3EE',
          soft: '#67E8F9',
        },
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.35), 0 18px 60px -20px rgba(124,92,255,0.55)',
        card: '0 24px 60px -32px rgba(0,0,0,0.9)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(1200px 600px at 50% -10%, rgba(124,92,255,0.18), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(34,211,238,0.10), transparent 55%)',
        'accent-sheen': 'linear-gradient(135deg, rgba(124,92,255,0.95) 0%, rgba(90,63,224,0.9) 45%, rgba(34,211,238,0.85) 100%)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.25)', opacity: '0' },
          '100%': { transform: 'scale(1.25)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.24,0,0.38,1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
}
