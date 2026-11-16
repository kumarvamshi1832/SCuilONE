import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import os from "node:os";

// Relocate Vite pre-bundling cache away from drive D when space is constrained
const defaultCacheDir = path.join(os.tmpdir(), "scuilone-vite-cache");

export default defineConfig({
  plugins: [react()],
  cacheDir: process.env.VITE_CACHE_DIR || defaultCacheDir,
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        autoRewrite: true,
      },
    },
  },
});
