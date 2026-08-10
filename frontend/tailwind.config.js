/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#050505",
        surface: "#0d0d0e",
        edge: "#1f1f23",
        crimson: "#dc2626",
        neon: "#ef4444",
      },
      boxShadow: {
        "glow-sm": "none",
        glow: "none",
        "glow-lg": "none",
        "glow-inner": "none",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      keyframes: {
        pulseglow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        pulseglow: "pulseglow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};