import type { Config } from "tailwindcss";

// ACIS design language: warm paper, ink-blue type, and one colour for each of the three models.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F2EA",
        card: "#FFFDF9",
        line: "#E4DDD0",
        ink: { DEFAULT: "#17202A", soft: "#47525E", faint: "#6F7A86" },
        career: { DEFAULT: "#26418F", ink: "#1F3478", soft: "#E8ECF8" },     // Career model
        learning: { DEFAULT: "#0E7C7B", ink: "#0A5F5E", soft: "#DFF1EF" },   // Learning model
        growth: { DEFAULT: "#B96A0B", ink: "#7E4604", soft: "#F9ECD7" },     // Growth model
        danger: { DEFAULT: "#B3372F", soft: "#FBE9E7" },
        ok: { DEFAULT: "#2F7D4F", soft: "#E3F2E8" },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', "Georgia", "serif"],
        sans: ['"Inter Variable"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px", md: "8px", lg: "10px" },
      boxShadow: { card: "0 1px 0 rgba(23,32,42,0.04)", lift: "0 6px 24px -12px rgba(23,32,42,0.25)" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        draw: { from: { strokeDashoffset: "400" }, to: { strokeDashoffset: "0" } },
      },
      animation: { "fade-up": "fade-up .45s ease-out both", draw: "draw 1.6s ease-out both" },
    },
  },
  plugins: [],
};
export default config;
