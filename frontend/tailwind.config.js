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
          orange: '#E07B3C',
          cream: '#FDF8F3',
          dark: '#2D2D2D',
        }
      }
    },
  },
  plugins: [],
}
