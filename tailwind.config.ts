import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "#0b0e14",
          panel: "#12151d",
          raised: "#181c26",
          border: "#222735",
        },
        brand: {
          DEFAULT: "#3ecf8e",
          dim: "#2aa670",
          faint: "rgba(62, 207, 142, 0.12)",
        },
        ink: {
          DEFAULT: "#e8ecf8",
          soft: "#8b93ad",
          faint: "#5b6178",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      transitionTimingFunction: {
        // strong curves — the CSS built-ins are too weak for deliberate motion
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out-strong": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
