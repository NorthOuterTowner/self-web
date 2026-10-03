/**
 * Serves ./dist the way GitHub Pages does, so the production bundle can be
 * checked before pushing:
 *
 *   - everything is mounted under a base path (default /self-web)
 *   - unknown paths return 404.html with a 404 status, which is exactly what
 *     GitHub Pages does and what the client router recovers from
 *
 *   bun run preview            # http://localhost:4173/self-web/
 *   bun run preview -- --base ''
 */
import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const base = arg("base", "/self-web").replace(/\/+$/, "");
const port = Number(arg("port", "4173"));
const root = normalize(join(import.meta.dir, "..", "dist"));

if (!existsSync(join(root, "index.html"))) {
  console.error("dist/index.html not found — run `bun run build:pages` first");
  process.exit(1);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function contentType(path: string): string {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : TYPES[path.slice(dot)]) ?? "application/octet-stream";
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    if (base && !pathname.startsWith(`${base}/`) && pathname !== base) {
      return Response.redirect(`${base}/`, 302);
    }

    pathname = base ? pathname.slice(base.length) : pathname;
    if (pathname === "" || pathname === "/") pathname = "/index.html";

    // Keep the request inside dist/.
    const resolved = normalize(join(root, pathname));
    if (resolved.startsWith(root) && existsSync(resolved) && statSync(resolved).isFile()) {
      return new Response(Bun.file(resolved), {
        headers: { "content-type": contentType(resolved) },
      });
    }

    // GitHub Pages behaviour for unknown paths.
    return new Response(Bun.file(join(root, "404.html")), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`preview: http://localhost:${server.port}${base}/`);
