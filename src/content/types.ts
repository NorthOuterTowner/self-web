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
  | { type: "math"; nodes: MathNode[]; tex: string };

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
