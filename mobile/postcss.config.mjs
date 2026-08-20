import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.dirname(fileURLToPath(import.meta.url));

const postcssConfig = {
  plugins: {
    tailwindcss: { config: path.resolve(mobileRoot, "tailwind.config.ts") },
    autoprefixer: {},
  },
};

export default postcssConfig;
