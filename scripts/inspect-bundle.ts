/**
 * Build-output inspector. Verifies that the GitHub Pages build actually
 * contains the pieces the deploy depends on, rather than trusting flags.
 *
 * Usage: bun run scripts/inspect-bundle.ts
 */
import { Glob } from "bun";

const expectedBase = process.argv[2] ?? "/self-web";

if (!(await Bun.file("dist/index.html").exists())) {
  console.error("no dist/index.html — run `bun run build:pages` first");
  process.exit(1);
}
const html = await Bun.file("dist/index.html").text();

/**
 * The entry bundle is whichever script index.html loads — not "the first
 * .js in dist/". There is more than one now (`secret-worker.js` sits beside
 * it), and glob order is whatever the filesystem returns: alphabetical on
 * Windows, so the entry happened to come first locally, and directory order
 * on the Linux runner, where it did not.
 */
const entry = html.match(/<script[^>]*\ssrc="([^"]+\.js)"/)?.[1];
if (!entry) {
  console.error("dist/index.html loads no script");
  process.exit(1);
}
const entryFile = `dist/${entry.replace(/^.*\//, "")}`;
if (!(await Bun.file(entryFile).exists())) {
  console.error(`index.html loads ${entry}, but ${entryFile} does not exist`);
  process.exit(1);
}
const js = await Bun.file(entryFile).text();

const cssFiles = await Array.fromAsync(new Glob("dist/*.css").scan());
const css = cssFiles[0] ? await Bun.file(cssFiles[0]).text() : "";

const workerFile = Bun.file("dist/secret-worker.js");
const worker = (await workerFile.exists()) ? await workerFile.text() : "";

const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

const checks: Array<[string, boolean, string]> = [
  [
    "html: asset urls prefixed",
    count(html, `href="${expectedBase}/`) + count(html, `src="${expectedBase}/`) >= 3,
    `expected css/js/icon under ${expectedBase}/`,
  ],
  [
    "html: utf-8 content intact",
    html.includes("计算机技术"),
    "meta description should keep its Chinese text",
  ],
  [
    "js: basename injected",
    count(js, expectedBase) > 0,
    `__BASE_PATH__ should be replaced with "${expectedBase}"`,
  ],
  [
    "js: react in production mode",
    !js.includes("react-dom.development") &&
      count(js, "Minified React error") > 0,
    "process.env.NODE_ENV define should select the prod build",
  ],
  ["js: gsap bundled", count(js, "ScrollTrigger") > 0, "ScrollTrigger missing"],
  [
    "js: scrollsmoother bundled",
    count(js, "ScrollSmoother") > 0,
    "ScrollSmoother missing",
  ],
  [
    "js: secret worker emitted",
    // The page asks for this URL by name; without the file the gate falls
    // back to deriving on the main thread and freezes for the whole wait.
    worker.length > 0 && count(worker, "onmessage") > 0,
    "dist/secret-worker.js missing — see the second Bun.build in scripts/build.ts",
  ],
  ["css: tokens emitted", count(css, "--fjord") > 0, "design tokens missing"],
  [
    "css: all layers emitted",
    ["--fjord", ".nav__", ".hero__", ".stream", ".toc__", ".prose"].every((s) =>
      css.includes(s),
    ),
    "one of the stylesheet layers did not make it into the bundle",
  ],
  [
    "404 fallback present",
    await Bun.file("dist/404.html").exists(),
    "dist/404.html is required for deep links on GitHub Pages",
  ],
];

let failed = 0;
for (const [name, ok, hint] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${hint}`}`);
  if (!ok) failed++;
}

console.log(
  `\n${checks.length - failed}/${checks.length} checks passed  (js ${entryFile.replace("dist/", "")} ${(js.length / 1024).toFixed(0)} KB, worker ${(worker.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`,
);

process.exit(failed === 0 ? 0 : 1);
