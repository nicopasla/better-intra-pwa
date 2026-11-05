import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const MOCK_STUB = fileURLToPath(new URL("./mock.stub.ts", import.meta.url));

/**
 * Fixtures are dev-only: production builds resolve every `mock.ts` import to
 * the stub, so the real module (and everything it imports) never reaches the
 * bundle.
 */
function stubMockInBuild(): Plugin {
  return {
    name: "better-intra:stub-mock",
    apply: "build",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer && /(^|\/)mock\.ts$/.test(source)) return MOCK_STUB;
      return null;
    },
  };
}

/** Better Intra PWA — deployed to Cloudflare Workers static assets at mobile.betterintra.com. */
export default defineConfig({
  plugins: [tailwindcss(), stubMockInBuild()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
