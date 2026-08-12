import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/word-choice-trainer/",
  publicDir: "public",
  plugins: [react()],
  build: {
    outDir: "pages-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "pages/index.html",
    },
  },
});
