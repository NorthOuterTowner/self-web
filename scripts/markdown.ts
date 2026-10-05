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
import type {
  Block,
  Inline,
  ListItem,
  TableAlign,
} from "../src/content/types";
import { MathError, renderMath } from "./math";

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
  /** Required for articles, optional for notes. Empty string when absent. */
  lede: string;
  date: string;
  tags: string[];
  slug?: string;
  draft?: boolean;
  /** Genre of a note. Required for notes, rejected on articles. */
  kind?: string;
  /** Attribution for a note that is someone else's. Notes only. */
  author?: string;
  /**
   * Position inside a series, 1-based. Only meaningful for articles that sit
   * in a series directory; `scripts/content.ts` is what enforces that pairing,
   * because only it knows where the file came from.
   */
  order?: number;
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
  "order",
  "kind",
  "author",
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

    // $math$ — LaTeX, rendered to MathML at build time. Checked before the
    // other markers so a formula's braces and carets are never read as
    // markdown; a literal dollar sign is written \$.
    if (ch === "$") {
      const end = raw.indexOf("$", i + 1);
      if (end === -1) {
        throw new ContentError(
          file,
          line,
          "行内公式的 $ 没有闭合；字面美元符号请写成 \\$",
        );
      }
      const tex = raw.slice(i + 1, end);
      flush();
      try {
        nodes.push({ type: "math", nodes: renderMath(tex, false), tex });
      } catch (err) {
        if (err instanceof MathError) {
          throw new ContentError(file, line, err.message);
        }
        throw err;
      }
      i = end + 1;
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

    // Images are block level only, so catch the inline form explicitly —
    // otherwise `![alt](src)` would quietly fall through to the link branch
    // and render as a stray "!" followed by a link.
    if (ch === "!" && raw.startsWith("![", i)) {
      throw new ContentError(
        file,
        line,
        "图片必须独占一行，不能插在段落中间；字面感叹号加方括号请写成 \\!\\[",
      );
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
  doc: "post" | "note" = "post",
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
  if (lede === "" && doc === "post") {
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

  // Only the shape is checked here. Whether the value names a declared genre
  // is a question about the site, and `scripts/content.ts` owns those — the
  // same split that keeps the series rules out of this module.
  if (obj.kind !== undefined) {
    if (typeof obj.kind !== "string" || obj.kind.trim() === "") {
      throw new ContentError(file, startLine, "kind 必须是非空字符串");
    }
    frontmatter.kind = obj.kind.trim();
  }

  if (obj.author !== undefined) {
    if (typeof obj.author !== "string" || obj.author.trim() === "") {
      throw new ContentError(file, startLine, "author 必须是非空字符串");
    }
    frontmatter.author = obj.author.trim();
  }

  if (obj.order !== undefined) {
    if (
      typeof obj.order !== "number" ||
      !Number.isInteger(obj.order) ||
      obj.order < 1
    ) {
      throw new ContentError(
        file,
        startLine,
        "order 必须是从 1 开始的正整数，它决定文章在专栏里的次序",
      );
    }
    frontmatter.order = obj.order;
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

/** `![alt](./path.png "optional caption")`, on a line of its own. */
const RE_FIGURE =
  /^!\[([^\]]*)\]\(\s*([^\s)"]+)(?:\s+"([^"]*)")?\s*\)\s*$/;

/**
 * Resolves an image reference against the file it was written in.
 *
 * Supplied by the content compiler, which is where the repository root and the
 * asset manifest live; keeping it out here means this module never touches the
 * filesystem for images.
 */
export interface ParseOptions {
  resolveImage?: (
    ref: string,
    line: number,
  ) => { src: string; width?: number; height?: number };
  /**
   * Which frontmatter contract to hold the file to. Defaults to `"post"`.
   *
   * Notes are short enough that a standfirst is usually longer than the piece,
   * so `lede` is optional for them and `kind` takes its place as required.
   * Branching here rather than relaxing the rules for everyone keeps the
   * long-form articles as strict as they were.
   */
  doc?: "post" | "note";
}

/** Index of the next line that is not blank, or -1 if there is none. */
function nextContentLine(lines: string[], from: number): number {
  let k = from;
  while (k < lines.length && lines[k]!.trim() === "") k++;
  return k < lines.length ? k : -1;
}

/**
 * Decides whether a blank line inside a list ends it.
 *
 * Blank lines between items ("loose" lists) are ordinary Markdown and read
 * better in long prose, so the list continues as long as the next line with
 * content is another item of the same kind.
 */
function listContinuesAfterBlank(
  lines: string[],
  from: number,
  pattern: RegExp,
): number {
  const k = nextContentLine(lines, from);
  if (k === -1 || !pattern.test(lines[k]!)) return -1;
  return k;
}

/** True when a line opens a block construct, so it ends any open paragraph. */
function startsBlock(line: string): boolean {
  return (
    line.trim() === "$$" ||
    RE_FIGURE.test(line.trim()) ||
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

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

/**
 * Splits one row into cells.
 *
 * Outer pipes are optional. A pipe is only a separator when it is neither
 * escaped nor inside a code span, so `` `a|b` `` and `a \| b` both survive as
 * single cells. The backslash is left in place for parseInline to consume.
 */
function splitRow(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let buf = "";
  let inCode = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "\\" && s[i + 1] === "|") {
      buf += "\\|";
      i++;
      continue;
    }
    if (ch === "`") {
      inCode = !inCode;
      buf += ch;
      continue;
    }
    if (ch === "|" && !inCode) {
      cells.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

/**
 * True for a row made only of dashes and colons.
 *
 * Three dashes minimum on purpose: a single `-` is a plausible cell value —
 * "not applicable" is written that way — and `| - | - |` would otherwise be
 * read as a separator instead of data.
 */
function isDelimiterRow(raw: string): boolean {
  if (!raw.includes("|") && !raw.includes("-")) return false;
  const cells = splitRow(raw);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function alignOf(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

/** End of the run of consecutive non-blank lines containing a pipe. */
function tableRunEnd(lines: string[], from: number): number {
  let k = from;
  while (k < lines.length && lines[k]!.trim() !== "" && lines[k]!.includes("|")) {
    k++;
  }
  return k;
}

/**
 * A run of pipe rows is only a table if it contains a delimiter row. That keeps
 * an ordinary sentence with a pipe in it from being swallowed, and means the
 * separator is what declares the intent.
 */
function looksLikeTable(lines: string[], from: number): boolean {
  const end = tableRunEnd(lines, from);
  if (end === from) return false;
  for (let k = from; k < end; k++) {
    if (isDelimiterRow(lines[k]!)) return true;
  }
  return false;
}

function parseTable(
  lines: string[],
  start: number,
  file: string,
  offset: number,
): { block: Block; next: number } {
  const lineNo = (idx: number) => offset + idx + 1;
  const end = tableRunEnd(lines, start);

  const run: Array<{ raw: string; index: number }> = [];
  for (let k = start; k < end; k++) run.push({ raw: lines[k]!, index: k });

  const delimiters = run.filter((r) => isDelimiterRow(r.raw));
  const content = run.filter((r) => !isDelimiterRow(r.raw));

  if (content.length === 0) {
    throw new ContentError(
      file,
      lineNo(start),
      "表格只有分隔行，没有任何内容行",
    );
  }

  const header = content[0]!;
  const headCells = splitRow(header.raw);
  if (headCells.length < 2) {
    throw new ContentError(
      file,
      lineNo(header.index),
      "表格至少要有两列，否则用列表更合适",
    );
  }

  // Alignment comes from the first delimiter row *after* the header. Extra
  // delimiter rows above and below are treated as decoration and dropped, so a
  // table drawn with full ASCII borders works as written.
  const separator = delimiters.find((d) => d.index > header.index);
  let align: TableAlign[] = headCells.map(() => "left");
  if (separator) {
    const cells = splitRow(separator.raw);
    if (cells.length !== headCells.length) {
      throw new ContentError(
        file,
        lineNo(separator.index),
        `分隔行有 ${cells.length} 个单元格，表头是 ${headCells.length} 个，两者必须一致`,
      );
    }
    align = cells.map(alignOf);
  }

  const rows = content.slice(1).map((r) => {
    const cells = splitRow(r.raw);
    if (cells.length !== headCells.length) {
      throw new ContentError(
        file,
        lineNo(r.index),
        `这一行有 ${cells.length} 个单元格，表头是 ${headCells.length} 个。` +
          "每行必须对齐；单元格里的竖线请写成 \\|",
      );
    }
    return cells.map((c) => parseInline(c, file, lineNo(r.index)));
  });

  return {
    block: {
      type: "table",
      head: headCells.map((c) => parseInline(c, file, lineNo(header.index))),
      rows,
      align,
    },
    next: end,
  };
}

const INDENT = /^([ \t]+)(.*)$/;

/**
 * Reads one list, including any blocks indented underneath its items.
 *
 * Indented content is the reason this is not a flat scan. Writing a numbered
 * list where each step carries a code sample is ordinary Markdown, and the
 * first version of this parser rejected it outright because it refused every
 * line that began with whitespace. Here the indented run is collected, the
 * common indent is stripped, and the result goes back through parseBlocks — so
 * a fence, a further paragraph or a nested list all work, and line numbers in
 * errors still point at the real file.
 */
function parseList(
  lines: string[],
  start: number,
  kind: "ul" | "ol",
  file: string,
  offset: number,
  options: ParseOptions,
): { items: ListItem[]; next: number } {
  const lineNo = (idx: number) => offset + idx + 1;
  const pattern = kind === "ul" ? RE_UL : RE_OL;
  const items: ListItem[] = [];
  let expected = 1;
  let j = start;

  /** Collects the indented run that belongs to the item just read. */
  const takeChildren = (from: number): { blocks: Block[]; next: number } => {
    const collected: Array<{ raw: string; index: number }> = [];
    let k = from;

    while (k < lines.length) {
      const current = lines[k]!;
      if (current.trim() === "") {
        // A blank line only continues the run if indented content follows.
        const after = nextContentLine(lines, k);
        if (after === -1 || !INDENT.test(lines[after]!)) break;
        collected.push({ raw: "", index: k });
        k++;
        continue;
      }
      if (!INDENT.test(current)) break;
      collected.push({ raw: current, index: k });
      k++;
    }

    // Trailing blanks belong to the gap after the run, not inside it.
    while (collected.length > 0 && collected.at(-1)!.raw.trim() === "") {
      collected.pop();
      k--;
    }
    if (collected.length === 0) return { blocks: [], next: from };

    const body = collected.filter((l) => l.raw.trim() !== "");
    const unit = Math.min(
      ...body.map((l) => INDENT.exec(l.raw)![1]!.replace(/\t/g, "    ").length),
    );
    const dedented = collected.map((l) =>
      l.raw === "" ? "" : l.raw.replace(/\t/g, "    ").slice(unit),
    );

    const blocks = parseBlocks(
      dedented,
      file,
      collected[0]!.index + offset,
      options,
    );
    for (const block of blocks) {
      if (block.type === "h2" || block.type === "h3") {
        throw new ContentError(
          file,
          lineNo(collected[0]!.index),
          "列表项里不能放小标题，否则左侧目录的层级会乱掉",
        );
      }
    }
    return { blocks, next: k };
  };

  while (j < lines.length) {
    const current = lines[j]!;

    if (current.trim() === "") {
      const resume = listContinuesAfterBlank(lines, j, pattern);
      if (resume === -1) break;
      j = resume;
      continue;
    }

    const match = pattern.exec(current);
    if (!match) {
      // Unsupported constructs still fail. Anything else simply closes the
      // list and becomes the next paragraph.
      rejectKnownUnsupported(current, file, lineNo(j));
      break;
    }

    if (kind === "ol") {
      const num = Number(match[1]);
      if (num !== expected) {
        throw new ContentError(
          file,
          lineNo(j),
          `有序列表的序号必须从 1 开始连续递增，这里应该是 ${expected}.，收到 ${num}.`,
        );
      }
      expected++;
    }

    const text = (kind === "ol" ? match[2]! : match[1]!).trim();
    if (text === "") {
      throw new ContentError(file, lineNo(j), "列表项内容为空");
    }

    const item: ListItem = { content: parseInline(text, file, lineNo(j)) };
    const children = takeChildren(j + 1);
    if (children.blocks.length > 0) item.children = children.blocks;
    items.push(item);
    j = children.next;
  }

  return { items, next: j };
}

function parseBlocks(
  lines: string[],
  file: string,
  offset: number,
  options: ParseOptions,
): Block[] {
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

      // `verse` is the one info string that is not a language. Poetry is the
      // only construct in this format where a line break is content rather
      // than typography: a paragraph joins its lines (see joinLines), which is
      // right for prose and destroys a poem. Reusing the fence rather than
      // inventing a delimiter keeps the format's surface the same size, and
      // unlike a real code fence the lines still get inline parsing.
      if (info === "verse") {
        const lines_ = body.map((l) => l.trimEnd());
        // Trim blank lines off both ends so the fence can breathe in the
        // source without pushing empty lines into the rendered stanza.
        while (lines_.length > 0 && lines_[0]!.trim() === "") lines_.shift();
        while (
          lines_.length > 0 &&
          lines_[lines_.length - 1]!.trim() === ""
        ) {
          lines_.pop();
        }
        if (lines_.length === 0) {
          throw new ContentError(file, lineNo(i), "verse 围栏是空的");
        }
        blocks.push({
          type: "verse",
          // A blank line is kept as an empty array: that is the stanza break,
          // and the renderer turns it into vertical space rather than a line.
          lines: lines_.map((l, k) =>
            l.trim() === "" ? [] : parseInline(l.trim(), file, lineNo(i + 1 + k)),
          ),
        });
        i = j + 1;
        continue;
      }

      const block: Block = info
        ? { type: "code", lang: info, code: body.join("\n") }
        : { type: "code", code: body.join("\n") };
      blocks.push(block);
      i = j + 1;
      continue;
    }

    // ---- displayed formula ------------------------------------------
    if (line.trim() === "$$") {
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j]!.trim() === "$$") {
          closed = true;
          break;
        }
        body.push(lines[j]!);
        j++;
      }
      if (!closed) {
        throw new ContentError(file, lineNo(i), "$$ 公式块没有闭合");
      }
      const tex = body.join("\n").trim();
      try {
        blocks.push({
          type: "mathBlock",
          nodes: renderMath(tex, true),
          tex,
        });
      } catch (err) {
        if (err instanceof MathError) {
          throw new ContentError(file, lineNo(i), err.message);
        }
        throw err;
      }
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

    // ---- figure ------------------------------------------------------
    const figure = RE_FIGURE.exec(line.trim());
    if (figure) {
      const alt = figure[1]!.trim();
      const ref = figure[2]!;
      const caption = figure[3]?.trim();

      if (alt === "") {
        throw new ContentError(
          file,
          lineNo(i),
          "图片必须写替代文字：![这里描述图片内容](./图片.png)。读屏软件和图片加载失败时都靠它",
        );
      }
      if (!options.resolveImage) {
        throw new ContentError(file, lineNo(i), "当前环境不支持图片");
      }

      const resolved = options.resolveImage(ref, lineNo(i));
      const block: Block = {
        type: "figure",
        src: resolved.src,
        alt,
        ...(resolved.width !== undefined ? { width: resolved.width } : {}),
        ...(resolved.height !== undefined ? { height: resolved.height } : {}),
        ...(caption
          ? { caption: parseInline(caption, file, lineNo(i)) }
          : {}),
      };
      blocks.push(block);
      i++;
      continue;
    }

    // ---- table -------------------------------------------------------
    if (line.includes("|") && looksLikeTable(lines, i)) {
      const table = parseTable(lines, i, file, offset);
      blocks.push(table.block);
      i = table.next;
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
      const list = parseList(lines, i, "ul", file, offset, options);
      blocks.push({ type: "ul", items: list.items });
      i = list.next;
      continue;
    }

    // ---- ordered list -----------------------------------------------
    if (RE_OL.test(line)) {
      const list = parseList(lines, i, "ol", file, offset, options);
      blocks.push({ type: "ol", items: list.items });
      i = list.next;
      continue;
    }

    // ---- paragraph ---------------------------------------------------
    {
      const firstLine = lineNo(i);
      const buf: string[] = [];
      let j = i;
      while (j < lines.length && lines[j]!.trim() !== "") {
        const current = lines[j]!;

        if (j > i) {
          // A row of dashes straight under text means a setext heading in most
          // Markdown dialects but a thematic break here. Too ambiguous to
          // guess at, so this one case still has to be spaced out.
          if (current.trim() === "---") {
            throw new ContentError(
              file,
              lineNo(j),
              "分隔线 --- 的上一行不能是正文，否则无法和 setext 标题区分；请空一行",
            );
          }
          // Anything else that opens a block just ends the paragraph. Writing
          // "…如下：" and dropping straight into a fence is how people
          // actually type, and a line starting with ``` or ## or - is not
          // ambiguous, so there is nothing to protect against here.
          if (startsBlock(current)) break;
          // A table needs the whole run to be recognised, so it cannot be
          // detected from a single line the way the others can.
          if (current.includes("|") && looksLikeTable(lines, j)) break;
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

export function parseDocument(
  source: string,
  file: string,
  options: ParseOptions = {},
): ParsedDoc {
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
    options.doc ?? "post",
  );
  const blocks = parseBlocks(lines.slice(end + 1), file, end + 1, options);

  if (blocks.length === 0) {
    throw new ContentError(file, end + 1, "文章正文为空");
  }

  return { frontmatter, blocks };
}
