/**
 * Strict Markdown subset parser for article content.
 *
 * This is deliberately NOT a general Markdown implementation. The site renders
 * a fixed set of blocks, so the parser accepts exactly the constructs that map
 * onto them and rejects everything else with a file:line error. The point is
 * that an unsupported construct fails the build instead of silently
 * disappearing from the page.
 *
 * The authoring contract lives in `content/FORMAT.md`.
 */
import type { Block, Inline } from "../src/content/types";

export class ContentError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    readonly detail: string,
  ) {
    super(`${file}:${line}  ${detail}`);
    this.name = "ContentError";
  }
}

export interface Frontmatter {
  title: string;
  lede: string;
  date: string;
  tags: string[];
  slug?: string;
  draft?: boolean;
}

export interface ParsedDoc {
  frontmatter: Frontmatter;
  blocks: Block[];
}

const ALLOWED_KEYS = new Set([
  "title",
  "lede",
  "date",
  "tags",
  "slug",
  "draft",
]);

/* ------------------------------------------------------------------ *
 * Line joining
 * ------------------------------------------------------------------ */

// Ranges covering CJK ideographs, kana, fullwidth forms and CJK punctuation.
const CJK =
  /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/;

/**
 * Folds the lines of one paragraph into a single string.
 *
 * Markdown normally joins wrapped lines with a space, which inserts a visible
 * gap in CJK text. When the characters on both sides of the break are CJK the
 * lines are joined with nothing instead, so prose can be hard-wrapped in the
 * editor without changing how it renders.
 */
export function joinLines(lines: string[]): string {
  return lines.reduce((acc, next) => {
    if (acc === "") return next;
    const left = acc.at(-1) ?? "";
    const right = next.at(0) ?? "";
    const glue = CJK.test(left) && CJK.test(right) ? "" : " ";
    return acc + glue + next;
  }, "");
}

/* ------------------------------------------------------------------ *
 * Inline markers
 * ------------------------------------------------------------------ */

const SAFE_SCHEME = /^(https?:|mailto:|\/|#|\.)/;

function assertSafeHref(href: string, file: string, line: number): void {
  if (!SAFE_SCHEME.test(href)) {
    throw new ContentError(
      file,
      line,
      `链接地址 "${href}" 不被允许。只接受 http(s)://、mailto:、站内绝对路径 /…、锚点 #… 或相对路径 ./…`,
    );
  }
}

export function parseInline(
  raw: string,
  file: string,
  line: number,
): Inline[] {
  const nodes: Inline[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf !== "") {
      nodes.push({ type: "text", text: buf });
      buf = "";
    }
  };

  while (i < raw.length) {
    const ch = raw[i]!;

    // Backslash escapes the next character.
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) {
        throw new ContentError(file, line, "行尾有孤立的反斜杠");
      }
      buf += next;
      i += 2;
      continue;
    }

    // `code` — contents are literal, no nested markers.
    if (ch === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end === -1) {
        throw new ContentError(file, line, "行内代码的反引号没有闭合");
      }
      flush();
      nodes.push({ type: "code", text: raw.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // **strong**
    if (raw.startsWith("**", i)) {
      const end = raw.indexOf("**", i + 2);
      if (end === -1) {
        throw new ContentError(file, line, "** 没有闭合");
      }
      flush();
      nodes.push({
        type: "strong",
        children: parseInline(raw.slice(i + 2, end), file, line),
      });
      i = end + 2;
      continue;
    }

    // *em*
    if (ch === "*") {
      const end = raw.indexOf("*", i + 1);
      if (end === -1) {
        throw new ContentError(
          file,
          line,
          "* 没有闭合；字面星号请写成 \\*",
        );
      }
      flush();
      nodes.push({
        type: "em",
        children: parseInline(raw.slice(i + 1, end), file, line),
      });
      i = end + 1;
      continue;
    }

    // [text](href)
    if (ch === "[") {
      const close = raw.indexOf("]", i + 1);
      if (close === -1 || raw[close + 1] !== "(") {
        throw new ContentError(
          file,
          line,
          "链接必须写成 [文字](地址)；字面方括号请写成 \\[",
        );
      }
      const paren = raw.indexOf(")", close + 2);
      if (paren === -1) {
        throw new ContentError(file, line, "链接的右括号没有闭合");
      }
      const href = raw.slice(close + 2, paren).trim();
      if (href === "") {
        throw new ContentError(file, line, "链接地址为空");
      }
      assertSafeHref(href, file, line);
      const label = raw.slice(i + 1, close);
      if (label.trim() === "") {
        throw new ContentError(file, line, "链接文字为空");
      }
      flush();
      nodes.push({
        type: "link",
        href,
        children: parseInline(label, file, line),
      });
      i = paren + 1;
      continue;
    }

    if (ch === "]") {
      throw new ContentError(
        file,
        line,
        "出现未配对的 ]；字面方括号请写成 \\]",
      );
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

/* ------------------------------------------------------------------ *
 * Frontmatter
 * ------------------------------------------------------------------ */

function asDateString(value: unknown): string | undefined {
  // Bun.YAML resolves an unquoted 2026-10-03 to a Date.
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.trim();
  return undefined;
}

function parseFrontmatter(
  raw: string,
  file: string,
  startLine: number,
): Frontmatter {
  let data: unknown;
  try {
    data = Bun.YAML.parse(raw);
  } catch (err) {
    throw new ContentError(
      file,
      startLine,
      `frontmatter 不是合法的 YAML：${(err as Error).message}`,
    );
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new ContentError(file, startLine, "frontmatter 必须是键值对");
  }
  const obj = data as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ContentError(
        file,
        startLine,
        `frontmatter 出现未知字段 "${key}"。可用字段：${[...ALLOWED_KEYS].join(", ")}`,
      );
    }
  }

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (title === "") {
    throw new ContentError(file, startLine, "frontmatter 缺少 title");
  }

  const lede = typeof obj.lede === "string" ? obj.lede.trim() : "";
  if (lede === "") {
    throw new ContentError(file, startLine, "frontmatter 缺少 lede（导语）");
  }

  const date = asDateString(obj.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ContentError(
      file,
      startLine,
      "frontmatter 的 date 必须是 YYYY-MM-DD",
    );
  }
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new ContentError(file, startLine, `date "${date}" 不是真实日期`);
  }

  let tags: string[] = [];
  if (obj.tags !== undefined) {
    if (
      !Array.isArray(obj.tags) ||
      obj.tags.some((t) => typeof t !== "string" || t.trim() === "")
    ) {
      throw new ContentError(
        file,
        startLine,
        "tags 必须是非空字符串数组，例如 tags: [Runtime, Bun]",
      );
    }
    tags = (obj.tags as string[]).map((t) => t.trim());
  }

  const frontmatter: Frontmatter = { title, lede, date, tags };

  if (obj.slug !== undefined) {
    if (typeof obj.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(obj.slug)) {
      throw new ContentError(
        file,
        startLine,
        "slug 只能用小写字母、数字和连字符，且以字母或数字开头",
      );
    }
    frontmatter.slug = obj.slug;
  }

  if (obj.draft !== undefined) {
    if (typeof obj.draft !== "boolean") {
      throw new ContentError(file, startLine, "draft 必须是 true 或 false");
    }
    frontmatter.draft = obj.draft;
  }

  return frontmatter;
}

/* ------------------------------------------------------------------ *
 * Block structure
 * ------------------------------------------------------------------ */

const RE_FENCE = /^```(.*)$/;
const RE_HEADING = /^(#{1,6})(\s*)(.*)$/;
const RE_UL = /^-\s+(.*)$/;
const RE_OL = /^(\d+)\.\s+(.*)$/;
const RE_QUOTE = /^>\s?(.*)$/;
const RE_CITE = /^(?:--|—)\s+(.+)$/;
const RE_NOTE = /^\[!NOTE\]\s*$/i;

/** True when a line opens a block construct, so a paragraph must not absorb it. */
function startsBlock(line: string): boolean {
  return (
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    line.startsWith(">") ||
    line.trim() === "---"
  );
}

function rejectKnownUnsupported(
  line: string,
  file: string,
  lineNo: number,
): void {
  if (/^\s+\S/.test(line)) {
    throw new ContentError(
      file,
      lineNo,
      "行首有缩进。本格式不支持缩进代码块或多级列表；代码请用 ``` 围栏",
    );
  }
  if (/^[*+]\s/.test(line)) {
    throw new ContentError(file, lineNo, "无序列表只能用 `- `，不要用 * 或 +");
  }
  if (line.startsWith("|")) {
    throw new ContentError(
      file,
      lineNo,
      "不支持表格。请改用列表，或把表格放进 ``` 围栏当作纯文本",
    );
  }
  if (line.startsWith("![")) {
    throw new ContentError(file, lineNo, "不支持图片");
  }
  if (/^<[a-z!/]/i.test(line)) {
    throw new ContentError(file, lineNo, "不支持内嵌 HTML");
  }
  if (/^={3,}\s*$/.test(line)) {
    throw new ContentError(
      file,
      lineNo,
      "不支持 setext 标题。请用 ## 或 ###",
    );
  }
}

function parseBlocks(lines: string[], file: string, offset: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  /** 1-based line number in the original file. */
  const lineNo = (idx: number) => offset + idx + 1;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i++;
      continue;
    }

    rejectKnownUnsupported(line, file, lineNo(i));

    // ---- fenced code ------------------------------------------------
    const fence = RE_FENCE.exec(line);
    if (fence) {
      const info = fence[1]!.trim();
      if (info !== "" && !/^[a-z0-9+#.-]+$/i.test(info)) {
        throw new ContentError(
          file,
          lineNo(i),
          `围栏后只能跟语言名，收到 "${info}"`,
        );
      }
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j]!.trimEnd() === "```") {
          closed = true;
          break;
        }
        body.push(lines[j]!);
        j++;
      }
      if (!closed) {
        throw new ContentError(file, lineNo(i), "``` 代码围栏没有闭合");
      }
      const block: Block = info
        ? { type: "code", lang: info, code: body.join("\n") }
        : { type: "code", code: body.join("\n") };
      blocks.push(block);
      i = j + 1;
      continue;
    }

    // ---- thematic break ---------------------------------------------
    if (line.trim() === "---") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ---- headings ----------------------------------------------------
    const heading = RE_HEADING.exec(line);
    if (heading) {
      const hashes = heading[1]!;
      const gap = heading[2]!;
      const text = heading[3]!.trim();

      if (hashes.length === 1) {
        throw new ContentError(
          file,
          lineNo(i),
          "不要用 # 一级标题，它由 frontmatter 的 title 承担。小节从 ## 开始",
        );
      }
      if (hashes.length > 3) {
        throw new ContentError(
          file,
          lineNo(i),
          `只支持 ## 和 ###，收到 ${hashes.length} 级标题`,
        );
      }
      if (gap === "") {
        throw new ContentError(file, lineNo(i), "标题的 # 后面需要一个空格");
      }
      if (text === "") {
        throw new ContentError(file, lineNo(i), "标题内容为空");
      }
      blocks.push({
        type: hashes.length === 2 ? "h2" : "h3",
        content: parseInline(text, file, lineNo(i)),
      });
      i++;
      continue;
    }

    // ---- blockquote / note ------------------------------------------
    if (line.startsWith(">")) {
      const raw: string[] = [];
      const firstLine = lineNo(i);
      let j = i;
      while (j < lines.length && lines[j]!.startsWith(">")) {
        raw.push(RE_QUOTE.exec(lines[j]!)?.[1] ?? "");
        j++;
      }

      if (raw[0] !== undefined && RE_NOTE.test(raw[0])) {
        const body = raw.slice(1).filter((l) => l.trim() !== "");
        if (body.length === 0) {
          throw new ContentError(file, firstLine, "[!NOTE] 后面没有内容");
        }
        blocks.push({
          type: "note",
          content: parseInline(joinLines(body), file, firstLine),
        });
        i = j;
        continue;
      }

      const body = raw.filter((l) => l.trim() !== "");
      let cite: string | undefined;
      const last = body.at(-1);
      if (last !== undefined) {
        const citeMatch = RE_CITE.exec(last);
        if (citeMatch) {
          cite = citeMatch[1]!.trim();
          body.pop();
        }
      }
      if (body.length === 0) {
        throw new ContentError(file, firstLine, "引用块没有正文");
      }
      const quote: Block = cite
        ? {
            type: "quote",
            content: parseInline(joinLines(body), file, firstLine),
            cite,
          }
        : { type: "quote", content: parseInline(joinLines(body), file, firstLine) };
      blocks.push(quote);
      i = j;
      continue;
    }

    // ---- unordered list ---------------------------------------------
    if (RE_UL.test(line)) {
      const items: Inline[][] = [];
      let j = i;
      while (j < lines.length) {
        const current = lines[j]!;
        if (current.trim() === "") break;
        const match = RE_UL.exec(current);
        if (!match) {
          rejectKnownUnsupported(current, file, lineNo(j));
          throw new ContentError(
            file,
            lineNo(j),
            "列表项必须各占一行、以 `- ` 开头；列表与其他内容之间要空一行",
          );
        }
        const text = match[1]!.trim();
        if (text === "") {
          throw new ContentError(file, lineNo(j), "列表项内容为空");
        }
        items.push(parseInline(text, file, lineNo(j)));
        j++;
      }
      blocks.push({ type: "ul", items });
      i = j;
      continue;
    }

    // ---- ordered list -----------------------------------------------
    if (RE_OL.test(line)) {
      const items: Inline[][] = [];
      let expected = 1;
      let j = i;
      while (j < lines.length) {
        const current = lines[j]!;
        if (current.trim() === "") break;
        const match = RE_OL.exec(current);
        if (!match) {
          rejectKnownUnsupported(current, file, lineNo(j));
          throw new ContentError(
            file,
            lineNo(j),
            "有序列表项必须各占一行、以 `1. ` 这样的序号开头",
          );
        }
        const num = Number(match[1]);
        if (num !== expected) {
          throw new ContentError(
            file,
            lineNo(j),
            `有序列表的序号必须从 1 开始连续递增，这里应该是 ${expected}.，收到 ${num}.`,
          );
        }
        const text = match[2]!.trim();
        if (text === "") {
          throw new ContentError(file, lineNo(j), "列表项内容为空");
        }
        items.push(parseInline(text, file, lineNo(j)));
        expected++;
        j++;
      }
      blocks.push({ type: "ol", items });
      i = j;
      continue;
    }

    // ---- paragraph ---------------------------------------------------
    {
      const firstLine = lineNo(i);
      const buf: string[] = [];
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== "") {
        const current = lines[j]!;
        if (j > i && startsBlock(current)) {
          throw new ContentError(
            file,
            lineNo(j),
            "段落和其他块之间必须空一行",
          );
        }
        rejectKnownUnsupported(current, file, lineNo(j));
        buf.push(current.trim());
        j++;
      }
      blocks.push({
        type: "p",
        content: parseInline(joinLines(buf), file, firstLine),
      });
      i = j;
    }
  }

  return blocks;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function parseDocument(source: string, file: string): ParsedDoc {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  if (lines[0]?.trim() !== "---") {
    throw new ContentError(
      file,
      1,
      "文件必须以 --- 开头，接 YAML frontmatter",
    );
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new ContentError(file, 1, "frontmatter 的结束分隔线 --- 没有找到");
  }

  const frontmatter = parseFrontmatter(
    lines.slice(1, end).join("\n"),
    file,
    2,
  );
  const blocks = parseBlocks(lines.slice(end + 1), file, end + 1);

  if (blocks.length === 0) {
    throw new ContentError(file, end + 1, "文章正文为空");
  }

  return { frontmatter, blocks };
}
