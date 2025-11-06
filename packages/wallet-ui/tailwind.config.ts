import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#1B1F24",
        trustBlue: "#2E77D0",
        emerald: "#2AD49A",
        sand: "#E5E2DC"
      },
      fontFamily: {
        sans: ["Inter", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["DM Mono", "JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
