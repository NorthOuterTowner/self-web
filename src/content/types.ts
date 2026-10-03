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

/** Inline nodes, produced from the inline markers of the format. */
export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "p"; content: Inline[] }
  | { type: "h2"; content: Inline[] }
  | { type: "h3"; content: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "quote"; content: Inline[]; cite?: string }
  | { type: "code"; lang?: string; code: string }
  | { type: "note"; content: Inline[] }
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
        for (const item of b.items) chars += inlineText(item).length;
        break;
      case "code":
        // Code is skimmed rather than read.
        chars += b.code.length / 2;
        break;
      case "hr":
        break;
    }
  }
  // ~340 CJK characters per minute is a reasonable reading pace.
  return Math.max(1, Math.round(chars / 340));
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}.${m}.${d}`;
}
