import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1717,
    proxy: {
      "/api": { target: "http://localhost:2727", changeOrigin: true },
      "/health": { target: "http://localhost:2727", changeOrigin: true },
    },
  },
});
