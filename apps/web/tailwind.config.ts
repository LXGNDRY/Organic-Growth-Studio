import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { brand: { 50: "#fdf4ff", 100: "#fae8ff", 500: "#d946ef", 600: "#c026d3", 700: "#a21caf" } } } },
  plugins: [],
};
export default config;
