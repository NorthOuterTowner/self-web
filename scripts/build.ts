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

/**
 * The gated page's Argon2id worker, built as its own entry point.
 *
 * Bun's bundler does not follow `new Worker(new URL("./x.ts", import.meta.url))`
 * — the path survives verbatim into the output and nothing is emitted for it,
 * so the browser would request a `.ts` file and receive the SPA fallback.
 * Naming it here is what puts a real script at the URL the page asks for.
 *
 * Unhashed on purpose: the page has to be able to write the URL down. The
 * message protocol is the only thing it has to agree with the bundle about,
 * and a reader holding a stale copy of this file from cache still gets a
 * correct answer, because the parameters travel in the message rather than
 * being compiled in.
 */
const worker = await Bun.build({
  entrypoints: ["./src/lib/secretWorker.ts"],
  outdir,
  target: "browser",
  format: "esm",
  minify: true,
  naming: "secret-worker.[ext]",
  publicPath: `${base}/`,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!worker.success) {
  for (const log of worker.logs) console.error(log);
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

// Content images. The bundler only walks the graph rooted at src/index.html,
// so anything referenced from Markdown alone has to be carried over by hand —
// otherwise it is simply missing from the deploy.
let mediaBytes = 0;
for (const asset of content.assets) {
  const bytes = await Bun.file(asset.from).bytes();
  await Bun.write(`${outdir}/${asset.to}`, bytes);
  mediaBytes += bytes.length;
}

// Daily log months. Fetched by URL at runtime, one month at a time, so they
// stay out of the bundle; re-serialised to drop the authoring whitespace.
let dailyBytes = 0;
for (const file of content.daily) {
  const json = JSON.stringify(await Bun.file(file.from).json());
  await Bun.write(`${outdir}/${file.to}`, json);
  dailyBytes += Buffer.byteLength(json);
}
mediaBytes += dailyBytes;

// Word lists for /game, validated and stripped to bare words by the content
// compiler. One file per field under its category's folder, fetched only when
// a draw lands on it, so the lists never grow the bundle or the first load.
// Bun.write creates the category folders.
let randomBytes = 0;
for (const list of content.random) {
  await Bun.write(`${outdir}/${list.to}`, list.body);
  randomBytes += Buffer.byteLength(list.body);
}
mediaBytes += randomBytes;

const built = [...result.outputs, ...worker.outputs];
const total = built.reduce((n, o) => n + o.size, 0) + mediaBytes;
for (const out of built) {
  console.log(
    `  ${out.path.replace(/^.*[\\/]/, "").padEnd(24)} ${(out.size / 1024).toFixed(1).padStart(8)} KB  ${out.kind}`,
  );
}
console.log(
  `  ${"404.html".padEnd(24)} ${(indexHtml.size / 1024).toFixed(1).padStart(8)} KB  spa-fallback`,
);
for (const asset of content.assets) {
  const size = Bun.file(asset.from).size;
  console.log(
    `  ${asset.to.replace(/^.*\//, "").padEnd(24)} ${(size / 1024).toFixed(1).padStart(8)} KB  media`,
  );
}
console.log(
  `  ${`data/random/ (${content.random.length} 个小类)`.padEnd(24)} ${(randomBytes / 1024).toFixed(1).padStart(8)} KB  random`,
);
if (content.daily.length > 0) {
  console.log(
    `  ${`data/daily/ (${content.daily.length} 个月)`.padEnd(24)} ${(dailyBytes / 1024).toFixed(1).padStart(8)} KB  daily`,
  );
}
console.log(
  `\nbase path: ${base || "/"}   total: ${(total / 1024).toFixed(1)} KB`,
);
