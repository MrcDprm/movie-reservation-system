/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gunmetal: {
          950: '#07070b',
          900: '#0a0a0f',
          850: '#0e0e16',
          800: '#12121a',
          700: '#1a1a26',
          600: '#242433',
        },
        silver: {
          100: '#f0f0f5',
          200: '#d4d4dc',
          300: '#a8a8b8',
          400: '#7a7a8c',
        },
        neon: {
          blue: '#3b82f6',
          purple: '#a855f7',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        display: ['"Orbitron"', 'system-ui', 'sans-serif'],
        body: ['"Exo 2"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(59, 130, 246, 0.15)',
        'glow-purple': '0 0 40px rgba(168, 85, 247, 0.2)',
      },
      backgroundImage: {
        'mesh':
          'radial-gradient(at 20% 20%, rgba(59,130,246,0.12) 0px, transparent 50%), radial-gradient(at 80% 10%, rgba(168,85,247,0.1) 0px, transparent 45%), radial-gradient(at 50% 80%, rgba(34,211,238,0.08) 0px, transparent 50%)',
        'gradient-border': 'linear-gradient(135deg, #3b82f6, #a855f7, #22d3ee)',
        'btn-gradient': 'linear-gradient(135deg, #1e40af 0%, #7c3aed 50%, #0891b2 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.45s ease-out forwards',
        'pulse-border': 'pulseBorder 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseBorder: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
