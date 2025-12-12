/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./**/*.{js,ts,jsx,tsx}",
    "./contents/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./popup.tsx",
    "./background.ts"
  ],
  theme: {
    extend: {
      colors: {
        // Dub.co style - grayscale focused
        gray: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#e5e5e5",
          500: "#737373",
          700: "#404040",
          900: "#171717"
        }
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "zoom-in-95": "zoomIn95 0.2s ease-in-out",
        "slide-in-right": "slideInRight 0.3s ease-out"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        zoomIn95: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" }
        }
      }
    }
  },
  plugins: []
}

