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
import {
  categories,
  isNoteKindId,
  noteKindIds,
  others,
  series,
  seriesIn,
} from "../src/site.config";
import type { Note, Post } from "../src/content/types";
import { textLength } from "../src/content/types";
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
  /** Short pieces from content/others/, newest first. */
  notes: Note[];
  errors: string[];
  drafts: string[];
  /** Slugs of declared categories that currently have no articles. */
  empty: string[];
  /** `category/slug` of declared series that currently have no articles. */
  emptySeries: string[];
  /** Images to copy into the build output. Deduplicated by content hash. */
  assets: Asset[];
}

export async function compile(): Promise<CompileResult> {
  const posts: Post[] = [];
  const errors: string[] = [];
  const drafts: string[] = [];

  /**
   * One scan, then classify by depth. The layout only has three legal shapes:
   *
   *   FORMAT.md                      the spec itself
   *   <category>/<name>.md           a standalone article
   *   <category>/<series>/<name>.md  an instalment of a series
   *
   * Anything deeper is a mistake worth naming, because a third level of
   * nesting has nowhere to go in the URL.
   */
  const scanned = (
    await Array.fromAsync(new Glob("**/*.md").scan({ cwd: CONTENT_DIR }))
  ).sort();

  interface Found {
    /** Path relative to content/, forward slashes. */
    rel: string;
    category: ReturnType<typeof slugToCategory.get>;
    /** Declared series slug, or undefined for a standalone article. */
    seriesSlug?: string;
    name: string;
  }

  const files: Found[] = [];
  /** Paths under content/others/, handled by a separate pass below. */
  const noteFiles: string[] = [];

  for (const raw of scanned) {
    const rel = raw.replace(/\\/g, "/");
    const display = `content/${rel}`;
    const parts = rel.split("/");
    const dirs = [...slugToCategory.keys(), others.slug].join(", ");

    // A stray .md at the top level of content/ is almost always a misplaced
    // article, except for the format spec itself.
    if (parts.length === 1) {
      if (rel !== "FORMAT.md") {
        errors.push(`${display}  文章必须放在分类目录里，可用目录：${dirs}`);
      }
      continue;
    }

    if (parts.length > 3) {
      errors.push(
        `${display}  目录最多两层：分类目录，以及分类下的专栏目录。再往下嵌套无法映射到 URL`,
      );
      continue;
    }

    const categorySlug = parts[0]!;

    // content/others/ is a flat bucket of short pieces, not a category, so it
    // leaves the article pipeline here and gets its own pass further down.
    if (categorySlug === others.slug) {
      if (parts.length !== 2) {
        errors.push(
          `${display}  杂谈是平铺的，不分子目录。请直接放在 content/${others.slug}/ 下`,
        );
        continue;
      }
      noteFiles.push(rel);
      continue;
    }

    const category = slugToCategory.get(categorySlug);
    if (!category) {
      errors.push(
        `${display}  目录 "${categorySlug}" 不是已声明的分类。可用目录：${dirs}`,
      );
      continue;
    }

    if (parts.length === 2) {
      files.push({ rel, category, name: parts[1]! });
      continue;
    }

    // Three parts: the middle one has to be a series declared for this
    // category. Guessing a title from the folder name instead would mean a
    // typo silently produces a new, unstyled, unlisted section.
    const seriesSlug = parts[1]!;
    const declared = seriesIn(category).map((s) => s.slug);
    if (!declared.includes(seriesSlug)) {
      errors.push(
        `${display}  "${seriesSlug}" 不是 ${categorySlug} 下已声明的专栏。` +
          (declared.length > 0
            ? `可用专栏：${declared.join(", ")}`
            : `${categorySlug} 目前没有声明任何专栏，请先在 src/site.config.ts 的 series 里加一条 { slug: "${seriesSlug}", category: "${category}", … }`),
      );
      continue;
    }

    files.push({ rel, category, seriesSlug, name: parts[2]! });
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

  for (const found of files) {
    const { rel, name, seriesSlug } = found;
    const category = found.category!;
    const display = `content/${rel}`;

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

    // `order` and series membership have to agree. Accepting an `order` on a
    // standalone article would mean writing a field that does nothing, which
    // is exactly the "wrote it but the page ignored it" failure the format is
    // built to avoid.
    // `kind` belongs to杂谈 only. Same reasoning as `order` on a standalone
    // article: a field that parses but does nothing is worse than an error.
    if (doc.frontmatter.kind !== undefined) {
      errors.push(
        `${display}  kind 只用于杂谈。要么把文件移到 content/${others.slug}/ 下，要么删掉 kind`,
      );
      continue;
    }

    // Articles are the site author's by definition, so there is nobody else to
    // credit. Attribution inside an article belongs to a quote block.
    if (doc.frontmatter.author !== undefined) {
      errors.push(
        `${display}  author 只用于杂谈（抄录别人的诗文）。文章里要标出处请用引用块的 -- 出处`,
      );
      continue;
    }

    const { order } = doc.frontmatter;
    if (seriesSlug && order === undefined) {
      errors.push(
        `${display}  专栏里的文章必须写 order，它决定阅读次序。专栏 "${seriesSlug}" 内从 1 开始连续编号`,
      );
      continue;
    }
    if (!seriesSlug && order !== undefined) {
      errors.push(
        `${display}  order 只对专栏里的文章有意义。要么把文件移到 content/${category}/<专栏>/ 下，要么删掉 order`,
      );
      continue;
    }

    // Keyed by route, so the check reads as "two articles cannot claim the
    // same URL" — which is the thing that actually matters.
    const route = seriesSlug
      ? `${category}/${seriesSlug}/${slug}`
      : `${category}/${slug}`;
    const previous = seen.get(route);
    if (previous) {
      errors.push(`${display}  与 ${previous} 的地址 /${route} 重复`);
      continue;
    }
    seen.set(route, display);

    posts.push({
      slug,
      category,
      title: doc.frontmatter.title,
      lede: doc.frontmatter.lede,
      date: doc.frontmatter.date,
      tags: doc.frontmatter.tags,
      blocks: doc.blocks,
      source: display,
      ...(seriesSlug ? { series: seriesSlug, order } : {}),
    });
  }

  /* ---- Notes ---------------------------------------------------------- *
   * A separate pass because the contract differs: `kind` is required and
   * `lede` is not, there is no series or order, and the record that comes out
   * carries a character count for the constellation's vertical axis.        */

  const notes: Note[] = [];
  const seenNotes = new Map<string, string>();

  for (const rel of noteFiles) {
    const display = `content/${rel}`;
    const name = rel.split("/")[1]!;
    const mdPath = resolve(CONTENT_DIR, rel);

    let doc;
    try {
      doc = parseDocument(await Bun.file(mdPath).text(), display, {
        resolveImage: makeResolver(mdPath, display),
        doc: "note",
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

    if (doc.frontmatter.order !== undefined) {
      errors.push(`${display}  杂谈没有次序，不要写 order`);
      continue;
    }

    // The genre is what colours the dot and labels the popover, so an
    // undeclared one would render as an unstyled, unnamed point.
    const kind = doc.frontmatter.kind;
    if (kind === undefined) {
      errors.push(
        `${display}  杂谈必须写 kind（体裁）。可用：${noteKindIds.join(", ")}`,
      );
      continue;
    }
    if (!isNoteKindId(kind)) {
      errors.push(
        `${display}  kind "${kind}" 不是已声明的体裁。可用：${noteKindIds.join(", ")}`,
      );
      continue;
    }

    const previous = seenNotes.get(slug);
    if (previous) {
      errors.push(`${display}  与 ${previous} 的地址 /${others.slug}/${slug} 重复`);
      continue;
    }
    seenNotes.set(slug, display);

    notes.push({
      slug,
      kind,
      title: doc.frontmatter.title,
      date: doc.frontmatter.date,
      tags: doc.frontmatter.tags,
      blocks: doc.blocks,
      source: display,
      chars: textLength(doc.blocks),
      ...(doc.frontmatter.lede ? { lede: doc.frontmatter.lede } : {}),
      ...(doc.frontmatter.author ? { author: doc.frontmatter.author } : {}),
    });
  }

  notes.sort(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );

  /* ---- Series level checks -------------------------------------------- *
   * These need the whole set, so they run after the per-file pass.        */

  for (const s of series) {
    const members = posts.filter(
      (p) => p.category === s.category && p.series === s.slug,
    );
    if (members.length === 0) continue;

    // 1..N, continuous, no duplicates — the same contract ordered lists already
    // have in the format. A series numbered 1,2,4 would render a "第 4 篇，共 3
    // 篇", and a duplicate 2 would make "上一篇" ambiguous.
    const orders = members.map((p) => p.order!).sort((a, b) => a - b);
    const expected = orders.map((_, i) => i + 1);
    if (orders.join(",") !== expected.join(",")) {
      const detail = members
        .slice()
        .sort((a, b) => a.order! - b.order!)
        .map((p) => `${p.order} ${p.source}`)
        .join("\n      ");
      errors.push(
        `专栏 ${s.category}/${s.slug}  order 必须是 1…${members.length} 连续不重复，当前是 ${orders.join(", ")}：\n      ${detail}`,
      );
    }
  }

  // A series index lives at /<category>/<slug>, which is the same shape as a
  // standalone article's URL. One of the two would shadow the other, and which
  // one won would depend on route order rather than on anything the author can
  // see.
  for (const s of series) {
    const clash = posts.find(
      (p) => p.category === s.category && !p.series && p.slug === s.slug,
    );
    if (clash) {
      errors.push(
        `${clash.source}  slug "${s.slug}" 与同分类下的专栏同名，两者都会占用 /${s.category}/${s.slug}。请改文章的 slug 或改专栏的 slug`,
      );
    }
  }

  // An empty stream is reported but is deliberately NOT an error. Treating it
  // as one made deleting articles impossible to carry through: the failure
  // stopped the artefact from being rewritten, so the site kept serving the
  // posts that had just been removed. The category page renders an empty state
  // instead.
  const empty = categories
    .filter((c) => !posts.some((p) => p.category === c.id))
    .map((c) => c.slug);

  // Same bargain for a declared-but-empty series: reported, not fatal, so that
  // emptying one out is a change you can actually ship.
  const emptySeries = series
    .filter(
      (s) =>
        !posts.some((p) => p.category === s.category && p.series === s.slug),
    )
    .map((s) => `${s.category}/${s.slug}`);

  // Newest first, which is the category listing order. Series pages re-sort by
  // `order` in the query layer — storing one canonical order here and deriving
  // the other keeps the generated module from depending on view concerns.
  posts.sort(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );
  return {
    posts,
    notes,
    errors,
    drafts,
    empty,
    emptySeries,
    assets: [...assets.values()],
  };
}

function render(posts: Post[], notes: Note[]): string {
  return `// GENERATED FILE — do not edit.
// Produced from content/**/*.md by scripts/content.ts.
// Run \`bun run content\` to refresh, or just \`bun dev\` (it watches).

import type { Note, Post } from "./types";

export const posts: Post[] = ${JSON.stringify(posts, null, 2)};

export const notes: Note[] = ${JSON.stringify(notes, null, 2)};
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
  await Bun.write(OUT_FILE, render(result.posts, result.notes));
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
  const grouped = result.posts.filter((p) => p.series).length;
  if (grouped > 0) {
    const bySeries = series
      .map((s) => {
        const n = result.posts.filter(
          (p) => p.category === s.category && p.series === s.slug,
        ).length;
        return n > 0 ? `${s.category}/${s.slug} ${n}` : undefined;
      })
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${grouped} 篇在专栏里  (${bySeries})`);
  }
  if (result.emptySeries.length > 0) {
    console.log(
      `  空专栏: ${result.emptySeries.join(", ")}  (页面会显示占位状态)`,
    );
  }
  if (result.notes.length > 0) {
    const lengths = result.notes.map((n) => n.chars);
    const dates = result.notes.map((n) => n.date).sort();
    console.log(
      `  ${result.notes.length} 则杂谈  (${dates[0]} … ${dates[dates.length - 1]}，` +
        `${Math.min(...lengths)}–${Math.max(...lengths)} 字)`,
    );
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
