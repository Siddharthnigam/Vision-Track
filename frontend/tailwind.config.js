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
        "glow-sm": "0 0 12px rgba(239, 68, 68, 0.25)",
        glow: "0 0 20px rgba(239, 68, 68, 0.35)",
        "glow-lg": "0 0 35px rgba(239, 68, 68, 0.45)",
        "glow-inner":
          "inset 0 0 24px rgba(239, 68, 68, 0.08), 0 0 20px rgba(239, 68, 68, 0.35)",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      keyframes: {
        pulseglow: {
          "0%, 100%": { opacity: "1", filter: "drop-shadow(0 0 6px rgba(239,68,68,0.8))" },
          "50%": { opacity: "0.55", filter: "drop-shadow(0 0 2px rgba(239,68,68,0.3))" },
        },
      },
      animation: {
        pulseglow: "pulseglow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};