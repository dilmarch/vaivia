import type { Config } from "tailwindcss";
import sharedConfig from "../tailwind.config";

export default {
  ...sharedConfig,
  content: [
    "./mobile/**/*.{js,ts,jsx,tsx}",
    "./components/ui/button.tsx",
    "./lib/utils.ts",
  ],
} satisfies Config;
