import type { CategoryId } from "../site.config";

/**
 * Content model.
 *
 * Articles are authored as Markdown in `content/<stream>/*.md` and compiled to
 * this structure at build time by `scripts/content.ts`. The runtime never sees
 * Markdown and never renders raw HTML: every node below maps to a React
 * element, so there is no injection surface in the content path.
 *
 * See `content/FORMAT.md` for the authoring format.
 */

/**
 * A MathML element tree, produced at build time by rendering LaTeX through
 * KaTeX and converting its MathML output against a tag and attribute
 * whitelist. Keys are terse because this gets serialised into the generated
 * module once per formula: `t` tag, `a` attributes, `c` children.
 *
 * Storing a tree rather than a markup string is what keeps the content path
 * free of dangerouslySetInnerHTML.
 */
export type MathNode =
  | string
  | { t: string; a?: Record<string, string>; c?: MathNode[] };

/** Inline nodes, produced from the inline markers of the format. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  /** `$…$`. `tex` is kept for the TOC, reading estimate and copy-paste. */
  | { type: "math"; nodes: MathNode[]; tex: string }
  /**
   * A hard line break inside a paragraph, from a backslash at end of line.
   *
   * Carries nothing: it is a position, not content. Distinct from a `verse`
   * block, which is a whole different register — this is for prose that
   * happens to need one break, such as an address or a pair of lines that
   * belong to the same paragraph.
   */
  | { type: "break" };

/**
 * One entry in a list. `children` holds blocks that were indented underneath
 * the item — most often a fenced code sample, sometimes a further paragraph or
 * a nested list.
 */
export interface ListItem {
  content: Inline[];
  children?: Block[];
}

export type TableAlign = "left" | "center" | "right";

export type Block =
  | { type: "p"; content: Inline[] }
  | {
      type: "table";
      /** Header cells. */
      head: Inline[][];
      /** Body rows, each the same length as `head`. */
      rows: Inline[][][];
      /** Per column alignment, same length as `head`. */
      align: TableAlign[];
    }
  | { type: "h2"; content: Inline[] }
  | { type: "h3"; content: Inline[] }
  | { type: "ul"; items: ListItem[] }
  | { type: "ol"; items: ListItem[] }
  | { type: "quote"; content: Inline[]; cite?: string }
  | { type: "code"; lang?: string; code: string }
  | { type: "note"; content: Inline[] }
  | {
      type: "figure";
      /**
       * Root-relative URL of the copied asset, e.g. `/media/amam-1a2b3c4d.png`.
       * The renderer runs it through `withBase()` so it works both in dev and
       * under the GitHub Pages sub-path.
       */
      src: string;
      alt: string;
      caption?: Inline[];
      /** Intrinsic size, so the box is reserved before the bytes arrive. */
      width?: number;
      height?: number;
    }
  /** `$$…$$` on its own lines. */
  | { type: "mathBlock"; nodes: MathNode[]; tex: string }
  /**
   * A poem, from a ```verse fence. One entry per line, so the breaks survive
   * — a paragraph would join them. An empty entry is a stanza break.
   */
  | { type: "verse"; lines: Inline[][] }
  | { type: "hr" };

export interface Post {
  slug: string;
  category: CategoryId;
  title: string;
  /** Standfirst paragraph, set larger than the body. */
  lede: string;
  /** ISO date (YYYY-MM-DD), used for display and sorting. */
  date: string;
  /** Keywords from frontmatter, shown as tags. */
  tags: string[];
  blocks: Block[];
  /** Source file, relative to the repo root. Useful in error messages. */
  source: string;
  /**
   * Slug of the series this article belongs to, taken from the directory it
   * sits in. Absent for standalone articles, which is most of them.
   *
   * `series` and `order` are either both present or both absent — the compiler
   * refuses to emit one without the other, so the UI can branch on `series`
   * alone and treat `order` as given.
   */
  series?: string;
  /** 1-based position inside the series. */
  order?: number;
}

/**
 * A note — one of the scattered short pieces under `content/others/`.
 *
 * Deliberately not a `Post`. The shape of the content differs, so the shape of
 * the record does too: a 40-character aphorism has no standfirst to write, no
 * place in a reading sequence, and nothing for a table of contents to index.
 * Folding these into `Post` would mean every page that renders a Post has to
 * ask "but is it actually a note?".
 */
export interface Note {
  slug: string;
  /** Genre, declared in `site.config.ts`. Drives the dot's tone. */
  kind: string;
  title: string;
  /** ISO date (YYYY-MM-DD). The constellation's horizontal axis. */
  date: string;
  /** Optional one-liner. Most notes are shorter than their own standfirst. */
  lede?: string;
  /**
   * Who wrote it, when that is not the site's author.
   *
   * Absent means "mine". Present means this is someone else's piece — a poem
   * copied out, a line worth keeping — and the attribution has to be part of
   * the record rather than smuggled into the title, so that every surface
   * that shows the note shows the credit too.
   */
  author?: string;
  tags: string[];
  blocks: Block[];
  source: string;
  /**
   * Length, measured at build time by `textLength` — one unit per CJK
   * character or per Latin word.
   *
   * The constellation's vertical axis. `readingMinutes` cannot serve here:
   * it floors at 1 and divides by 340, so every note from 20 to 300
   * characters reports "1 min" and the whole field would collapse onto one
   * row. Precomputed rather than derived in the browser so the layout does
   * not have to walk every note's blocks on each render.
   */
  chars: number;
}

/** Everything a block tree says, as one string. */
function collectText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "p":
      case "h2":
      case "h3":
      case "note":
      case "quote":
        out.push(inlineText(b.content));
        break;
      case "ul":
      case "ol":
        for (const item of b.items) {
          out.push(inlineText(item.content));
          if (item.children) out.push(collectText(item.children));
        }
        break;
      case "verse":
        for (const line of b.lines) out.push(inlineText(line));
        break;
      case "table":
        for (const cell of b.head) out.push(inlineText(cell));
        for (const row of b.rows) {
          for (const cell of row) out.push(inlineText(cell));
        }
        break;
      case "figure":
        if (b.caption) out.push(inlineText(b.caption));
        break;
      case "code":
      case "mathBlock":
      case "hr":
        break;
    }
  }
  return out.join("\n");
}

/** CJK ideographs, kana, and the fullwidth / CJK punctuation blocks. */
const RE_CJK =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
/** A run of Latin letters or digits, i.e. one word. */
const RE_WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/**
 * Length of a note, in units that are comparable across scripts.
 *
 * One CJK character is one unit, and so is one Latin word — because a word is
 * what a character is the rough equivalent of. Counting raw characters would
 * make an English sonnet five times "longer" than a Chinese ci of the same
 * substance, and on the constellation's vertical axis that is not a nuance:
 * a single Shakespeare would stretch the domain far enough to flatten every
 * Chinese note into a band along the top.
 *
 * Distinct from `readingMinutes`, which keeps its own weighting (code is
 * skimmed, a figure costs a line) because it answers a different question.
 */
export function textLength(blocks: Block[]): number {
  const text = collectText(blocks);
  const cjk = text.match(RE_CJK)?.length ?? 0;
  const words = text.match(RE_WORD)?.length ?? 0;
  return cjk + words;
}

/** An entry in the in-article table of contents. */
export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Flattens inline nodes to plain text, for the TOC and reading estimates. */
export function inlineText(nodes: Inline[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
      case "code":
        out += node.text;
        break;
      case "math":
        out += node.tex;
        break;
      case "break":
        // Flattened to a newline so the text still reads as two lines in a
        // tooltip or a copy-paste, and counts as one character for length.
        out += "\n";
        break;
      case "strong":
      case "em":
      case "link":
        out += inlineText(node.children);
        break;
    }
  }
  return out;
}

/**
 * Derives heading anchors from block position so ids are stable and
 * collision free regardless of language (CJK headings included).
 */
export function headingId(blockIndex: number): string {
  return `h-${blockIndex}`;
}

export function extractHeadings(blocks: Block[]): Heading[] {
  const out: Heading[] = [];
  blocks.forEach((block, i) => {
    if (block.type === "h2" || block.type === "h3") {
      out.push({
        id: headingId(i),
        text: inlineText(block.content),
        level: block.type === "h2" ? 2 : 3,
      });
    }
  });
  return out;
}

export function readingMinutes(blocks: Block[]): number {
  // ~340 CJK characters per minute is a reasonable reading pace.
  return Math.max(1, Math.round(countChars(blocks) / 340));
}

/** Recursive so blocks nested under list items are counted too. */
function countChars(blocks: Block[]): number {
  let chars = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "p":
      case "h2":
      case "h3":
      case "note":
      case "quote":
        chars += inlineText(b.content).length;
        break;
      case "ul":
      case "ol":
        for (const item of b.items) {
          chars += inlineText(item.content).length;
          if (item.children) chars += countChars(item.children);
        }
        break;
      case "code":
        // Code is skimmed rather than read.
        chars += b.code.length / 2;
        break;
      case "mathBlock":
        // A displayed formula costs about a line of reading.
        chars += 40;
        break;
      case "table":
        for (const cell of b.head) chars += inlineText(cell).length;
        for (const row of b.rows) {
          for (const cell of row) chars += inlineText(cell).length;
        }
        break;
      case "figure":
        // Looking at a figure costs about as long as a line of text.
        chars += 40 + (b.caption ? inlineText(b.caption).length : 0);
        break;
      case "verse":
        for (const line of b.lines) chars += inlineText(line).length;
        break;
      case "hr":
        break;
    }
  }
  return chars;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}
