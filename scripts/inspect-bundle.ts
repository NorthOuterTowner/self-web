/**
 * Build-output inspector. Verifies that the GitHub Pages build actually
 * contains the pieces the deploy depends on, rather than trusting flags.
 *
 * Usage: bun run scripts/inspect-bundle.ts
 */
import { Glob } from "bun";

const expectedBase = process.argv[2] ?? "/self-web";

const jsFiles = await Array.fromAsync(new Glob("dist/*.js").scan());
const cssFiles = await Array.fromAsync(new Glob("dist/*.css").scan());

if (jsFiles.length === 0) {
  console.error("no js in dist/ — run `bun run build:pages` first");
  process.exit(1);
}

const js = await Bun.file(jsFiles[0]!).text();
const css = cssFiles[0] ? await Bun.file(cssFiles[0]).text() : "";
const html = await Bun.file("dist/index.html").text();

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
  `\n${checks.length - failed}/${checks.length} checks passed  (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`,
);

process.exit(failed === 0 ? 0 : 1);
