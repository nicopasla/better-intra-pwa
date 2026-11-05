import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const WORKER_ORIGIN = "https://api.betterintra.com";
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

/**
 * Dev-only: the worker rejects requests whose `Origin` is localhost unless the
 * deployment sets `ALLOW_LOCAL_DEV`, so worker calls (`/api`, `/gh`) go through
 * the dev server and lose that header on the way out.
 */
function workerProxy(): ProxyOptions {
  return {
    target: WORKER_ORIGIN,
    changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyReq", (req) => req.removeHeader("origin"));
    },
  };
}

/** Better Intra PWA — deployed to Cloudflare Workers static assets at mobile.betterintra.com. */
export default defineConfig({
  plugins: [tailwindcss(), stubMockInBuild()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      "/api/": workerProxy(),
      "/gh/": workerProxy(),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
