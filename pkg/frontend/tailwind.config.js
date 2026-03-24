/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../test/frontend/src/**/*.{js,ts,jsx,tsx}",
    "../../test/frontend/**/*.html",
  ],
  // Scope theme variables to all elements (for nested approach)
  theme: {
    themeRoot: "*",
  },
}
