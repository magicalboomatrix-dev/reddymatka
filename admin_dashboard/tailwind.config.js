/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef9ec',
          100: '#fcefc9',
          200: '#f9dd8e',
          300: '#f5c54e',
          400: '#f2b327',
          500: '#eb950e',
          600: '#d07109',
          700: '#ad500b',
          800: '#8d3f10',
          900: '#743410',
        },
        dark: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#454545',
          900: '#1a1a1a',
          950: '#0e0e0e',
        }
      }
    },
  },
  plugins: [],
}
