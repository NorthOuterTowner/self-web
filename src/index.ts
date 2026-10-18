/**
 * Dev / self-hosted server.
 *
 * The deployed artefact on GitHub Pages is static, so this server exists only
 * to mirror that behaviour locally: every route resolves to index.html and the
 * client router takes over.
 */
import index from "./index.html";
import { serve } from "bun";

// In development the Markdown in content/ is compiled on startup and on every
// save; the regenerated module then triggers Bun's hot reload. Loaded lazily so
// the build scripts never reach production.
if (process.env.NODE_ENV !== "production") {
  const { startWatcher } = await import("../scripts/content");
  await startWatcher();
}

/**
 * Content images, served from where they sit on disk.
 *
 * The production build copies these into dist/media/; in development the
 * manifest written by the content compiler is enough to find them, so nothing
 * has to be duplicated on every save.
 */
async function media(req: Request): Promise<Response> {
  const path = decodeURIComponent(new URL(req.url).pathname);

  // Read as data, not as a module. The content watcher rewrites this file on
  // every save, and importing it under `--hot` crashed Bun 1.3.13 with a
  // segfault; Bun.file re-reads from disk with no module-graph involvement.
  let assets: Record<string, string>;
  try {
    assets = await Bun.file("./src/content/assets.json").json();
  } catch {
    return new Response("asset manifest not built yet", { status: 503 });
  }

  const file = assets[path];
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Bun.file(file), {
    headers: { "cache-control": "no-cache" },
  });
}

/**
 * The gated page's Argon2id worker.
 *
 * `src/index.html` is the only thing the dev server bundles, and the worker is
 * not in its import graph — it is loaded by URL, because Bun's bundler does
 * not rewrite `new Worker(new URL("./x.ts", import.meta.url))`. So it is
 * compiled here on first request, the same way `scripts/build.ts` compiles it
 * for the deploy, and kept for the life of the process: it is a second of
 * bundling, and nothing but a restart changes its contents in practice.
 */
let workerJs: Promise<string> | undefined;

function secretWorker(): Promise<Response> {
  workerJs ??= Bun.build({
    entrypoints: ["./src/lib/secretWorker.ts"],
    target: "browser",
    format: "esm",
  }).then(async (built) => {
    if (!built.success) throw new AggregateError(built.logs, "worker build");
    return built.outputs[0]!.text();
  });

  return workerJs.then(
    (js) =>
      new Response(js, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-cache",
        },
      }),
    (error) => {
      // Reset, so a fixed syntax error does not need a server restart.
      workerJs = undefined;
      console.error("secret worker build failed:", error);
      return new Response("worker build failed", { status: 500 });
    },
  );
}

const server = serve({
  routes: {
    "/media/*": media,
    "/secret-worker.js": secretWorker,

    // SPA fallback — matches the 404.html trick used on GitHub Pages.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
