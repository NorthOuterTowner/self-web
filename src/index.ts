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

const server = serve({
  routes: {
    // SPA fallback — matches the 404.html trick used on GitHub Pages.
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
