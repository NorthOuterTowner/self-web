/**
 * Headless render smoke test.
 *
 * Boots Edge in headless mode against a running server and asserts that React
 * actually mounted and that the page-specific markup exists in the rendered
 * DOM. A build that compiles but throws inside a GSAP effect still fails here,
 * because the error unmounts the tree and #root comes back empty.
 *
 *   bun run scripts/smoke.ts http://localhost:3000
 */
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const origin = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");

interface Case {
  path: string;
  /** Substrings that must appear in the rendered DOM. */
  expect: string[];
}

const cases: Case[] = [
  {
    path: "/",
    expect: [
      "hero__display",
      "Connecting Everything",
      "streams__row",
      "个人感受记录",
      "计算机技术博客",
      "通信工程博客",
      "stream__accent",
      "smooth-content",
    ],
  },
  {
    path: "/journal",
    expect: ["toc__entry", "article__title", "prose", "把一天切成三块"],
  },
  {
    path: "/computing/false-sharing",
    expect: [
      "缓存行、伪共享",
      "toc__anchor",
      'id="h-',
      "prose__note",
      "article__nav",
    ],
  },
  {
    path: "/comms/ldpc-and-polar",
    expect: ["LDPC", "blockquote", "toc__entry"],
  },
  {
    path: "/nope/does-not-exist",
    expect: ["Not Found"],
  },
];

/** Console output worth failing on. GSAP reports bad targets this way. */
const CONSOLE_PATTERNS = [
  "Uncaught",
  "GSAP target",
  "Invalid property",
  "missing plugin",
  "Warning: ",
  "Error: ",
];

async function dumpDom(url: string): Promise<{ dom: string; noise: string[] }> {
  const profile = join(tmpdir(), `smoke-${Math.random().toString(36).slice(2)}`);
  const proc = Bun.spawn(
    [
      EDGE,
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--disable-extensions",
      `--user-data-dir=${profile}`,
      "--enable-logging=stderr",
      "--log-level=0",
      // Give React and the GSAP entrance timelines time to run.
      "--virtual-time-budget=5000",
      "--dump-dom",
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [dom, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  const noise = err
    .split("\n")
    .filter((line) => CONSOLE_PATTERNS.some((p) => line.includes(p)))
    .map((line) => line.trim());

  return { dom, noise };
}

let failures = 0;

for (const testCase of cases) {
  const url = `${origin}${testCase.path}`;
  const { dom, noise } = await dumpDom(url);

  const missing = testCase.expect.filter((needle) => !dom.includes(needle));
  const rootEmpty = /<div id="root"><\/div>/.test(dom);
  const ok = missing.length === 0 && !rootEmpty && noise.length === 0;

  if (ok) {
    console.log(`PASS  ${testCase.path}`);
  } else {
    failures++;
    console.log(`FAIL  ${testCase.path}`);
    if (rootEmpty) console.log("        #root is empty — the app did not mount");
    if (missing.length) console.log(`        missing: ${missing.join(", ")}`);
    for (const line of noise.slice(0, 6)) {
      console.log(`        console: ${line}`);
    }
    console.log(`        dom length: ${dom.length}`);
  }
}

console.log(
  `\n${cases.length - failures}/${cases.length} routes rendered  (${origin})`,
);
process.exit(failures === 0 ? 0 : 1);
