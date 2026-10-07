import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

/** Better Intra PWA — deployed to Cloudflare Pages at m.betterintra.com. */
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
