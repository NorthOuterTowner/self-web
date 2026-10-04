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

const server = serve({
  routes: {
    "/media/*": media,

    // SPA fallback — matches the 404.html trick used on GitHub Pages.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
