import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    publicDir: "public",
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                sidepanel: resolve(__dirname, "sidepanel.html"),
                "service-worker": resolve(__dirname, "src/service-worker.ts"),
                "content-script": resolve(__dirname, "src/content-script.ts"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
            },
        },
    },
});
