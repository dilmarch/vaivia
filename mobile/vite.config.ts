import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

const mobileRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = path.resolve(mobileRoot, "..");

export default defineConfig(({ mode }) => {
  const publicEnvironment = loadEnv(mode, repositoryRoot, [
    "NEXT_PUBLIC_SUPABASE_",
    "VITE_MOBILE_",
  ]);

  const supabaseUrl =
    publicEnvironment.VITE_MOBILE_SUPABASE_URL ||
    publicEnvironment.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const supabasePublishableKey =
    publicEnvironment.VITE_MOBILE_SUPABASE_PUBLISHABLE_KEY ||
    publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "The mobile build requires browser-safe Supabase URL and publishable key values.",
    );
  }
  if (
    supabasePublishableKey.startsWith("sb_secret_") ||
    /service[_-]?role/i.test(supabasePublishableKey)
  ) {
    throw new Error("The mobile build cannot use a Supabase server secret.");
  }

  const mobileConfig = {
    supabaseUrl,
    supabasePublishableKey,
    apiBaseUrl:
      mode === "production"
        ? "https://vaivia.app"
        : publicEnvironment.VITE_MOBILE_API_BASE_URL || "https://vaivia.app",
  };

  return {
    root: mobileRoot,
    base: "./",
    envDir: repositoryRoot,
    publicDir: false,
    plugins: [react()],
    resolve: {
      alias: {
        "@": repositoryRoot,
      },
    },
    define: {
      __VAIVIA_MOBILE_CONFIG__: JSON.stringify(mobileConfig),
    },
    build: {
      outDir: path.resolve(mobileRoot, "dist"),
      emptyOutDir: true,
    },
  };
});
