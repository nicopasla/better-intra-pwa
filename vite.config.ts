import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

/** Better Intra PWA — deployed to Cloudflare Workers static assets at mobile.betterintra.com. */
export default defineConfig({
  plugins: [tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    fs: {
      // `?mock` imports the real cluster maps straight from ../campuses.
      allow: [".."],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});