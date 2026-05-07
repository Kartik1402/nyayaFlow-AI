export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 20px 80px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        surface: '#f8fafc',
        panel: '#ffffff',
        brand: '#0f172a',
      },
    },
  },
  plugins: [],
}
