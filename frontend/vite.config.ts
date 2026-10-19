import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The backend serves this directory; see STATIC_DIR in backend/app/main.py.
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
  server: {
    port: 5173,
    // In development the SPA runs on Vite and the API on uvicorn, so cookies
    // and the CSRF header have to survive a same-origin proxy rather than CORS.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8470",
        changeOrigin: false,
      },
    },
  },
});
