/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lake: { DEFAULT: '#0B6E5C', dark: '#084F42', soft: '#DDEEE9' },
        sun: { DEFAULT: '#F5B700', soft: '#FFF3C9' },
        ink: '#17302B',
        paper: '#F2F5F3',
        mist: '#D9E3DF',
        brick: '#B3412C',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Public Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
