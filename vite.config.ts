import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

const WORKER_ORIGIN = "https://api.betterintra.com";
const MOCK_STUB = fileURLToPath(new URL("./mock.stub.ts", import.meta.url));
const CAMPUS_DIR = fileURLToPath(new URL("../campuses", import.meta.url));

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
 * Dev-only: serve the repo's `campuses/` folder before the `/gh/` proxy, so map
 * edits (including new files) can be tested without pushing them to GitHub.
 */
function localCampuses(): Plugin {
  const root = normalize(CAMPUS_DIR);
  const types: Record<string, string> = {
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  return {
    name: "better-intra:local-campuses",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || "").split("?")[0];
        if (!path.startsWith("/gh/campuses/")) return next();
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        let rel: string;
        try {
          rel = decodeURIComponent(path.slice("/gh/campuses/".length));
        } catch {
          return next();
        }
        const file = normalize(join(root, rel));
        if (!file.startsWith(root + sep)) return next();
        void readFile(file)
          .then((data) => {
            const ext = file.slice(file.lastIndexOf("."));
            res.setHeader(
              "Content-Type",
              types[ext] ?? "application/octet-stream",
            );
            res.setHeader("Cache-Control", "no-store");
            res.end(req.method === "HEAD" ? undefined : data);
          })
          .catch(() => next());
      });
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
  plugins: [localCampuses(), tailwindcss(), stubMockInBuild()],
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
