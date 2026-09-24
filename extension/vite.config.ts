import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: { "@meritio/shared": path.resolve(__dirname, "../shared/src/index.ts") },
  },
  build: {
    rollupOptions: {
      input: { preview: path.resolve(__dirname, "src/preview/index.html") },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
