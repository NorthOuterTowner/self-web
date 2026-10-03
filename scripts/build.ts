/**
 * Static build.
 *
 * Uses the Bun.build() API rather than CLI flags: `--define` values need
 * nested quotes, and those do not survive the shell on every platform, which
 * silently produces a bundle with the wrong base path and a dev-mode React.
 * Passing a JS object removes that failure mode entirely.
 *
 *   bun run build          -> site rooted at /
 *   bun run build:pages    -> site rooted at /self-web/ (GitHub Pages project site)
 */
import { rm } from "node:fs/promises";
import { generate } from "./content";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/** "" for a root deploy, "/self-web" for a GitHub Pages project site. */
const base = arg("base", "").replace(/\/+$/, "");
const outdir = "./dist";

// Compile content first: a malformed article should fail the build here, with a
// file and line number, rather than ship a page with missing text.
const content = await generate();
if (content.errors.length > 0) {
  console.error(`内容校验失败，共 ${content.errors.length} 处：\n`);
  for (const err of content.errors) console.error(`  ${err}`);
  process.exit(1);
}
console.log(`  content: ${content.posts.length} 篇文章`);

await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir,
  target: "browser",
  minify: true,
  // Trailing slash matters: it is prepended to each hashed asset filename.
  publicPath: `${base}/`,
  define: {
    __BASE_PATH__: JSON.stringify(base),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  env: "BUN_PUBLIC_*",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// GitHub Pages has no server-side rewrite. Serving the same document for
// unknown paths lets the client router handle deep links such as
// /self-web/computing/false-sharing on a cold load.
const indexHtml = Bun.file(`${outdir}/index.html`);
if (!(await indexHtml.exists())) {
  console.error("build produced no index.html");
  process.exit(1);
}
await Bun.write(`${outdir}/404.html`, await indexHtml.bytes());

const total = result.outputs.reduce((n, o) => n + o.size, 0);
for (const out of result.outputs) {
  console.log(
    `  ${out.path.replace(/^.*[\\/]/, "").padEnd(24)} ${(out.size / 1024).toFixed(1).padStart(8)} KB  ${out.kind}`,
  );
}
console.log(
  `  ${"404.html".padEnd(24)} ${(indexHtml.size / 1024).toFixed(1).padStart(8)} KB  spa-fallback`,
);
console.log(
  `\nbase path: ${base || "/"}   total: ${(total / 1024).toFixed(1)} KB`,
);
