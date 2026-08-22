export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 20px 80px rgba(0, 0, 0, 0.4)',
        lime: '0 0 20px rgba(190, 242, 100, 0.15)',
      },
      colors: {
        darkbg: '#090D14',
        graphite: '#111722',
        slateface: '#1C2433',
        limeaccent: '#bef264',
        limehover: '#a3e635',
        surface: '#090D14',
        panel: '#111722',
        brand: '#bef264',
      },
    },
  },
  plugins: [],
}
