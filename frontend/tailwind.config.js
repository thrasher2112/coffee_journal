/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#1b1614',
        espresso: '#3b2924',
        crema: '#f8f1e8',
        caramel: '#c89c73',
        moss: '#56645d',
        ember: '#a8563c'
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 10px 35px rgba(0,0,0,0.35)'
      }
    }
  },
  plugins: []
};
