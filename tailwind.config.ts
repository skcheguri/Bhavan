/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            DEFAULT: '#C1512F',
            light: '#FBF0E9',
            dark: '#9C3F23',
          },
          sage: {
            DEFAULT: '#7A8B6F',
            light: '#F0F3ED',
            dark: '#5F6E56',
          },
          charcoal: '#2B2420',
          offwhite: '#FBF7F1',
          lightgray: '#F3ECE1',
        },
        fontFamily: {
          sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        },
      },
    },
    plugins: [],
  }