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
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, basename, sep } from "node:path";
import { Glob } from "bun";
import { categories } from "../src/site.config";
import type { Post } from "../src/content/types";
import { IMAGE_EXTENSIONS, imageSize } from "./image";
import { ContentError, parseDocument } from "./markdown";

const ROOT = resolve(import.meta.dir, "..");
const CONTENT_DIR = resolve(ROOT, "content");
const OUT_FILE = resolve(ROOT, "src/content/generated.ts");
/**
 * Written as JSON rather than a TypeScript module on purpose. The dev server
 * needs to re-read it every time the watcher rewrites it, and importing a
 * module that keeps changing under `--hot` segfaulted Bun 1.3.13. Data read
 * through Bun.file has no such interaction, and it can never be pulled into
 * the browser bundle by accident either.
 */
const ASSET_FILE = resolve(ROOT, "src/content/assets.json");

/** Where copied images live, both in dist/ and in the URL. */
const MEDIA_DIR = "media";

const slugToCategory = new Map(categories.map((c) => [c.slug, c.id]));

/** An image an article referenced, resolved and ready to be copied. */
export interface Asset {
  /** Absolute path on disk. */
  from: string;
  /** Path inside dist/, e.g. `media/amam-1a2b3c4d.png`. */
  to: string;
}

export interface CompileResult {
  posts: Post[];
  errors: string[];
  drafts: string[];
  /** Slugs of declared categories that currently have no articles. */
  empty: string[];
  /** Images to copy into the build output. Deduplicated by content hash. */
  assets: Asset[];
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
  /** Keyed by absolute source path, so one image used twice is copied once. */
  const assets = new Map<string, Asset>();

  /**
   * Turns an image reference in a .md file into a public URL, and records the
   * file so the build can copy it.
   *
   * Nothing else in the pipeline would pick these up: the bundler only walks
   * the graph that starts at src/index.html, so an image mentioned only in
   * Markdown would be absent from dist/ and 404 in production. Resolving and
   * copying here is what makes that not happen — and a missing file becomes a
   * build error rather than a broken image on the page.
   */
  const makeResolver =
    (mdPath: string, display: string) =>
    (ref: string, line: number) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//")) {
        throw new ContentError(
          display,
          line,
          `图片不支持外部地址 "${ref}"。请把文件放进仓库再用相对路径引用，这样它会被一起构建和部署`,
        );
      }
      if (ref.startsWith("/")) {
        throw new ContentError(
          display,
          line,
          `图片路径要相对于当前 .md 文件写，例如 ./amam.png，而不是 "${ref}"`,
        );
      }

      const absolute = resolve(dirname(mdPath), ref);
      if (!absolute.startsWith(ROOT + sep)) {
        throw new ContentError(
          display,
          line,
          `图片 "${ref}" 指到了仓库外面，无法随站点一起部署`,
        );
      }

      const ext = extname(absolute).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        throw new ContentError(
          display,
          line,
          `"${ext || ref}" 不是支持的图片格式。可用：${[...IMAGE_EXTENSIONS].join(" ")}`,
        );
      }

      // Synchronous because the parser calls this inline; these are a handful
      // of small files per build.
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        throw new ContentError(
          display,
          line,
          `找不到图片 ${relative(ROOT, absolute).replace(/\\/g, "/")}`,
        );
      }
      const bytes = new Uint8Array(readFileSync(absolute));

      const existing = assets.get(absolute);
      let to: string;
      if (existing) {
        to = existing.to;
      } else {
        const hash = Bun.hash(bytes).toString(16).padStart(16, "0").slice(0, 8);
        const stem = basename(absolute, ext).replace(/[^a-zA-Z0-9-]+/g, "-");
        to = `${MEDIA_DIR}/${stem}-${hash}${ext}`;
        assets.set(absolute, { from: absolute, to });
      }

      const size = imageSize(bytes);
      return {
        src: `/${to}`,
        ...(size ? { width: size.width, height: size.height } : {}),
      };
    };

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

    const mdPath = resolve(CONTENT_DIR, rel);
    let doc;
    try {
      doc = parseDocument(await Bun.file(mdPath).text(), display, {
        resolveImage: makeResolver(mdPath, display),
      });
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
  return { posts, errors, drafts, empty, assets: [...assets.values()] };
}

function render(posts: Post[]): string {
  return `// GENERATED FILE — do not edit.
// Produced from content/**/*.md by scripts/content.ts.
// Run \`bun run content\` to refresh, or just \`bun dev\` (it watches).

import type { Post } from "./types";

export const posts: Post[] = ${JSON.stringify(posts, null, 2)};
`;
}

/**
 * Manifest consumed by the dev server so it can serve content images from
 * their original location. The production build copies the files into dist/
 * instead, so this module is never imported by the browser bundle.
 */
function renderAssets(assets: Asset[]): string {
  const entries = Object.fromEntries(assets.map((a) => [`/${a.to}`, a.from]));
  return `${JSON.stringify(entries, null, 2)}\n`;
}

export async function generate(): Promise<CompileResult> {
  const result = await compile();
  if (result.errors.length > 0) return result;
  await mkdir(resolve(ROOT, "src/content"), { recursive: true });
  await Bun.write(OUT_FILE, render(result.posts));
  await Bun.write(ASSET_FILE, renderAssets(result.assets));
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
  if (result.assets.length > 0) {
    console.log(`  ${result.assets.length} 张图片待复制到 dist/${MEDIA_DIR}/`);
  }
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
