/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Live Oaks Tennis Association heritage palette (sampled from the club crest).
        // `green` is overridden so the whole app — which uses green-* as the brand
        // color throughout — adopts the muted forest green of the crest. `lota` is an
        // explicit alias to the same scale.
        green: {
          50: '#f1f5ef',
          100: '#e2eae0',
          200: '#c4d4c1',
          300: '#9bb597',
          400: '#6b8e68',
          500: '#4a7049',
          600: '#375d3a', // primary crest green
          700: '#2c4a2e',
          800: '#233a25',
          900: '#1b2d1d',
        },
        lota: {
          50: '#f1f5ef',
          100: '#e2eae0',
          200: '#c4d4c1',
          300: '#9bb597',
          400: '#6b8e68',
          500: '#4a7049',
          600: '#375d3a',
          700: '#2c4a2e',
          800: '#233a25',
          900: '#1b2d1d',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
    },
  },
  plugins: [],
}
