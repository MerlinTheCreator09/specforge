// Obsidian palette from the Stitch design (frontend from stitch / obsidian).
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#090a0f", surface: "#090a0f", "surface-container-lowest": "#090a0f", "surface-container-low": "#0d0f15",
        "surface-container": "#11131a", "surface-container-high": "#181b24", "surface-container-highest": "#1e2230",
        "on-surface": "#f3f4f6", "on-surface-variant": "#9ca3af", outline: "#4b5563", "outline-variant": "#262936",
        primary: "#a78bfa", "primary-container": "#8b5cf6", "on-primary": "#090a0f", "secondary-fixed": "#2e2554",
        tertiary: "#34d399", "tertiary-container": "#065f46", error: "#ef4444", "error-container": "#3b1111", "on-error-container": "#fca5a5",
        warning: "#f59e0b",
      },
      fontFamily: { sans: ["Geist", "sans-serif"], mono: ["Geist Mono", "monospace"] },
      fontSize: {
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.03em", fontWeight: "600" }],
        "label-md": ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
        "label-lg": ["13px", { lineHeight: "18px", letterSpacing: "0.01em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "18px" }], "body-md": ["13px", { lineHeight: "20px" }], "body-lg": ["15px", { lineHeight: "24px" }],
        "headline-sm": ["16px", { lineHeight: "24px", letterSpacing: "-0.005em", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.015em", fontWeight: "600" }],
      },
    },
  },
  plugins: [],
};
