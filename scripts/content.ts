/**
 * Content compiler.
 *
 * Reads `content/<stream>/*.md`, validates each file against the authoring
 * format, and emits `src/content/generated.ts`. The app imports the generated
 * module, so no Markdown parser ships to the browser and a malformed article
 * fails the build rather than the page.
 *
 *   bun run content          compile once
 *   bun run content:check    compile in memory, report problems, write nothing
 *   bun run content -- --watch
 */
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { Glob } from "bun";
import { categories } from "../src/site.config";
import type { Post } from "../src/content/types";
import { ContentError, parseDocument } from "./markdown";

const ROOT = resolve(import.meta.dir, "..");
const CONTENT_DIR = resolve(ROOT, "content");
const OUT_FILE = resolve(ROOT, "src/content/generated.ts");

const slugToCategory = new Map(categories.map((c) => [c.slug, c.id]));

export interface CompileResult {
  posts: Post[];
  errors: string[];
  drafts: string[];
  /** Slugs of declared categories that currently have no articles. */
  empty: string[];
}

export async function compile(): Promise<CompileResult> {
  const posts: Post[] = [];
  const errors: string[] = [];
  const drafts: string[] = [];

  const files = (
    await Array.fromAsync(new Glob("*/*.md").scan({ cwd: CONTENT_DIR }))
  ).sort();

  // A stray .md at the top level of content/ is almost always a misplaced
  // article, except for the format spec itself.
  const loose = await Array.fromAsync(
    new Glob("*.md").scan({ cwd: CONTENT_DIR }),
  );
  for (const file of loose) {
    if (file !== "FORMAT.md") {
      errors.push(
        `content/${file}  文章必须放在分类目录里，可用目录：${[...slugToCategory.keys()].join(", ")}`,
      );
    }
  }

  const seen = new Map<string, string>();

  for (const rel of files) {
    const display = `content/${rel.replace(/\\/g, "/")}`;
    const [dir, name] = rel.replace(/\\/g, "/").split("/") as [string, string];

    const category = slugToCategory.get(dir);
    if (!category) {
      errors.push(
        `${display}  目录 "${dir}" 不是已声明的分类。可用目录：${[...slugToCategory.keys()].join(", ")}`,
      );
      continue;
    }

    let doc;
    try {
      doc = parseDocument(
        await Bun.file(resolve(CONTENT_DIR, rel)).text(),
        display,
      );
    } catch (err) {
      errors.push(
        err instanceof ContentError ? err.message : `${display}  ${String(err)}`,
      );
      continue;
    }

    const slug = doc.frontmatter.slug ?? name.replace(/\.md$/, "");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      errors.push(
        `${display}  文件名 "${name}" 不能作为 slug。请用小写字母、数字和连字符，或在 frontmatter 里显式写 slug`,
      );
      continue;
    }

    if (doc.frontmatter.draft) {
      drafts.push(display);
      continue;
    }

    const key = `${category}/${slug}`;
    const previous = seen.get(key);
    if (previous) {
      errors.push(`${display}  slug "${slug}" 与 ${previous} 重复`);
      continue;
    }
    seen.set(key, display);

    posts.push({
      slug,
      category,
      title: doc.frontmatter.title,
      lede: doc.frontmatter.lede,
      date: doc.frontmatter.date,
      tags: doc.frontmatter.tags,
      blocks: doc.blocks,
      source: display,
    });
  }

  // An empty stream is reported but is deliberately NOT an error. Treating it
  // as one made deleting articles impossible to carry through: the failure
  // stopped the artefact from being rewritten, so the site kept serving the
  // posts that had just been removed. The category page renders an empty state
  // instead.
  const empty = categories
    .filter((c) => !posts.some((p) => p.category === c.id))
    .map((c) => c.slug);

  posts.sort(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );
  return { posts, errors, drafts, empty };
}

function render(posts: Post[]): string {
  return `// GENERATED FILE — do not edit.
// Produced from content/**/*.md by scripts/content.ts.
// Run \`bun run content\` to refresh, or just \`bun dev\` (it watches).

import type { Post } from "./types";

export const posts: Post[] = ${JSON.stringify(posts, null, 2)};
`;
}

export async function generate(): Promise<CompileResult> {
  const result = await compile();
  if (result.errors.length > 0) return result;
  await mkdir(resolve(ROOT, "src/content"), { recursive: true });
  await Bun.write(OUT_FILE, render(result.posts));
  return result;
}

function report(result: CompileResult, wrote: boolean): void {
  for (const draft of result.drafts) {
    console.log(`  draft  ${draft}  (已跳过)`);
  }
  if (result.errors.length > 0) {
    console.error(`\n内容校验失败，共 ${result.errors.length} 处：\n`);
    for (const err of result.errors) console.error(`  ${err}`);
    // Worth stating plainly: the previous artefact is still on disk, so the
    // site keeps serving the last version that compiled.
    console.error(
      `\n  ${relative(ROOT, OUT_FILE)} 未更新，网站仍在使用上一次编译成功的内容。\n`,
    );
    return;
  }
  const byCategory = categories
    .map((c) => {
      const n = result.posts.filter((p) => p.category === c.id).length;
      return `${c.slug} ${n}`;
    })
    .join(" · ");
  console.log(
    `  ${result.posts.length} 篇文章  (${byCategory})${wrote ? ` → ${relative(ROOT, OUT_FILE)}` : ""}`,
  );
  if (result.empty.length > 0) {
    console.log(`  空分类: ${result.empty.join(", ")}  (页面会显示占位状态)`);
  }
}

/** Regenerates on any change under content/. Never exits on a content error. */
export async function startWatcher(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await generate();
      if (result.errors.length > 0) {
        console.error(`\n[content] 校验失败，产物未更新：`);
        for (const err of result.errors) console.error(`  ${err}`);
      } else {
        const suffix =
          result.empty.length > 0 ? `，空分类 ${result.empty.join(", ")}` : "";
        console.log(
          `[content] 已重新编译 ${result.posts.length} 篇${suffix}`,
        );
      }
    } finally {
      running = false;
    }
  };

  await run();

  watch(CONTENT_DIR, { recursive: true }, (_event, filename) => {
    if (filename && !filename.endsWith(".md")) return;
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  });
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--watch")) {
    await startWatcher();
    console.log("[content] 监听 content/ 中…  Ctrl+C 退出");
  } else if (args.includes("--check")) {
    const result = await compile();
    report(result, false);
    process.exit(result.errors.length === 0 ? 0 : 1);
  } else {
    const result = await generate();
    report(result, result.errors.length === 0);
    process.exit(result.errors.length === 0 ? 0 : 1);
  }
}
