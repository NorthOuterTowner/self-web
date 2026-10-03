/**
 * One-off: turns content/journal/learning.html into learning.md, keeping only
 * the Chinese halves and conforming to content/FORMAT.md.
 */

const SRC = "content/journal/learning.html";
const OUT = "content/journal/learning.md";

const raw = await Bun.file(SRC).text();

let body = raw.slice(raw.indexOf("<body>") + 6, raw.lastIndexOf("</body>"));

// Page furniture: the inline stylesheet and the language switcher.
body = body
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<input[^>]*>/g, "")
  .replace(/<div class="lang-switch"[\s\S]*?<\/div>/, "");

// Drop the English halves, then unwrap the Chinese ones. The divs are flat
// (86 zh + 85 en + 1 switcher == every div in the file), so a non-greedy match
// cannot swallow a nested block.
body = body
  .replace(/<div class="en">[\s\S]*?<\/div>/g, "")
  .replace(/<div class="zh">([\s\S]*?)<\/div>/g, "$1");

if (/<div\b/.test(body)) {
  console.error("还有未处理的 div，停下来人工检查");
  process.exit(1);
}

/* ---- inline conversion ------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&amp;": "&",
};

function decode(s: string): string {
  return s.replace(
    /&(?:quot|apos|#39|lt|gt|nbsp|mdash|ndash|hellip|amp);/g,
    (m) => ENTITIES[m] ?? m,
  );
}

/** Characters the strict parser treats as inline markers. */
function escapeText(s: string): string {
  return s.replace(/([\\`*\[\]])/g, "\\$1");
}

type SpanKind = "label" | "spoiler" | "highlight" | "plain";

function spanKind(attrs: string): SpanKind {
  if (/font-weight:\s*100/.test(attrs)) return "label";
  if (/background-color:\s*#000/.test(attrs)) return "spoiler";
  if (/background-color:\s*yellow/.test(attrs)) return "highlight";
  return "plain";
}

/**
 * Walks one block's inner HTML and emits the markdown subset.
 * Text nodes are escaped; only the markers below are emitted unescaped.
 */
function inlineToMarkdown(html: string): string {
  let out = "";
  let i = 0;
  // Stack of closing strings, so nesting comes back out in the right order.
  const closers: string[] = [];

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(decode(html.slice(i)));
      break;
    }
    out += escapeText(decode(html.slice(i, lt)));

    const gt = html.indexOf(">", lt);
    if (gt === -1) break;
    const tag = html.slice(lt + 1, gt);
    i = gt + 1;

    if (tag.startsWith("/")) {
      out += closers.pop() ?? "";
      continue;
    }

    const name = (/^([a-z0-9]+)/i.exec(tag)?.[1] ?? "").toLowerCase();

    switch (name) {
      case "code": {
        // Code spans are literal, so the body is taken verbatim.
        const end = html.indexOf("</code>", i);
        const inner = decode(html.slice(i, end === -1 ? undefined : end));
        out += `\`${inner.trim()}\``;
        i = end === -1 ? html.length : end + 7;
        break;
      }
      case "strong":
        out += "**";
        closers.push("**");
        break;
      case "del":
        // No strikethrough in the format; the word is kept and marked.
        out += "";
        closers.push("（划掉）");
        break;
      case "span": {
        const kind = spanKind(tag);
        if (kind === "highlight") {
          out += "**";
          closers.push("**");
        } else if (kind === "spoiler") {
          // The original hid these behind black-on-black text. There is no
          // spoiler marker in the format, so they are set apart instead.
          out += "*";
          closers.push("*");
        } else if (kind === "label") {
          out += "**";
          closers.push("**");
        } else {
          closers.push("");
        }
        break;
      }
      case "br":
        out += " ";
        break;
      default:
        closers.push("");
        break;
    }
  }

  return out.replace(/\s+/g, " ").trim();
}

/** Keeps a paragraph's first character from reading as a block marker. */
function guardLineStart(s: string): string {
  return s.replace(/^([#>|!+-]|\d+\.)/, "\\$1");
}

/* ---- block conversion -------------------------------------------------- */

interface Block {
  tag: string;
  html: string;
}

const blocks: Block[] = [];
for (const m of body.matchAll(
  /<(h[1-6]|p)>([\s\S]*?)<\/\1>|<(hr)\s*\/?>/g,
)) {
  if (m[3]) {
    blocks.push({ tag: "hr", html: "" });
  } else {
    blocks.push({ tag: m[1]!.toLowerCase(), html: m[2]! });
  }
}

const lines: string[] = [];
let title = "";
let lede = "";
let pendingMeta: string[] = [];

const flushMeta = () => {
  if (pendingMeta.length === 0) return;
  lines.push("");
  for (const item of pendingMeta) lines.push(`- ${item}`);
  pendingMeta = [];
};

for (const block of blocks) {
  const md = block.tag === "hr" ? "" : inlineToMarkdown(block.html);

  if (block.tag === "h1") {
    title = md.replace(/\\/g, "");
    continue;
  }

  // The Tech / SW rows are h5 in the source. The format stops at h3, and they
  // are really per-section metadata, so consecutive ones become one list.
  if (block.tag === "h5") {
    pendingMeta.push(md.replace(/^——\s*/, "").trim());
    continue;
  }

  flushMeta();

  switch (block.tag) {
    case "h2":
      lines.push("", `## ${md}`);
      break;
    case "h3":
      lines.push("", `### ${md}`);
      break;
    case "hr":
      lines.push("", "---");
      break;
    case "p": {
      if (md === "") break;
      // First Chinese paragraph becomes the standfirst.
      if (lede === "") {
        lede = md.replace(/\\/g, "");
        break;
      }
      lines.push("", guardLineStart(md));
      break;
    }
    default:
      break;
  }
}
flushMeta();

const frontmatter = [
  "---",
  "title: 我的学习过程与学习方法",
  `lede: ${lede}`,
  "date: 2026-10-03",
  "tags: [学习, 回顾, 成长]",
  "---",
].join("\n");

const markdown = `${frontmatter}\n${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;

await Bun.write(OUT, markdown);

console.log(`原 h1: ${title}`);
console.log(`lede:  ${lede.slice(0, 48)}…`);
console.log(`块数:  ${blocks.length}  →  ${markdown.split("\n").length} 行`);
console.log(`写入:  ${OUT}`);
