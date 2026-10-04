/**
 * LaTeX → MathML element tree, at build time.
 *
 * KaTeX runs as a devDependency during the content compile, so nothing about
 * it reaches the browser: no script, no stylesheet, no font files. MathML is
 * rendered natively by the browser, which is the whole reason for choosing it
 * over KaTeX's HTML+CSS output.
 *
 * The MathML string is converted into a serialisable tree instead of being
 * stored as markup, so the renderer can build real React elements and the
 * content path stays free of dangerouslySetInnerHTML. Conversion enforces a
 * whitelist and throws on anything outside it, which means an unexpected
 * construct fails the build rather than silently disappearing from the page.
 */
import katex from "katex";
import type { MathNode } from "../src/content/types";

export class MathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MathError";
  }
}

/** Every element KaTeX's MathML output is known to emit, plus near neighbours. */
const ALLOWED_TAGS = new Set([
  "math",
  "semantics",
  "annotation",
  "mrow",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "mspace",
  "msub",
  "msup",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "munder",
  "mover",
  "munderover",
  "mmultiscripts",
  "mprescripts",
  "none",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "merror",
]);

const ALLOWED_ATTRS = new Set([
  "xmlns",
  "display",
  "displaystyle",
  "scriptlevel",
  "mathvariant",
  "mathcolor",
  "mathsize",
  "stretchy",
  "fence",
  "separator",
  "form",
  "lspace",
  "rspace",
  "minsize",
  "maxsize",
  "accent",
  "accentunder",
  "movablelimits",
  "width",
  "height",
  "depth",
  "voffset",
  "linethickness",
  "columnalign",
  "rowalign",
  "columnspacing",
  "rowspacing",
  "columnlines",
  "notation",
  "encoding",
  "class",
]);

/** KaTeX paints unsupported commands in this colour instead of throwing. */
const ERROR_COLOUR = "#cc0000";

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
};

const decode = (s: string): string =>
  s.replace(/&(?:lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m] ?? m);

interface Building {
  t: string;
  a: Record<string, string>;
  c: MathNode[];
}

/**
 * Minimal XML reader. KaTeX's output is well formed, has no comments or CDATA,
 * and escapes its text, so a tokeniser this small is sufficient — and anything
 * it cannot account for throws.
 */
function parseMathml(src: string, tex: string): MathNode[] {
  const root: MathNode[] = [];
  const stack: Building[] = [];

  const put = (node: MathNode) => {
    const top = stack.at(-1);
    (top ? top.c : root).push(node);
  };

  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf("<", i);

    if (lt === -1) {
      const text = decode(src.slice(i));
      if (text !== "") put(text);
      break;
    }

    if (lt > i) {
      const text = decode(src.slice(i, lt));
      if (text !== "") put(text);
    }

    const gt = src.indexOf(">", lt);
    if (gt === -1) throw new MathError(`MathML 标签没有闭合: ${tex}`);

    let raw = src.slice(lt + 1, gt);
    i = gt + 1;

    // Closing tag
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (!open || open.t !== name) {
        throw new MathError(`MathML 标签嵌套不匹配 (${name}): ${tex}`);
      }
      const node: { t: string; a?: Record<string, string>; c?: MathNode[] } = {
        t: open.t,
      };
      if (Object.keys(open.a).length > 0) node.a = open.a;
      if (open.c.length > 0) node.c = open.c;
      const parent = stack.at(-1);
      (parent ? parent.c : root).push(node);
      continue;
    }

    const selfClosing = raw.endsWith("/");
    if (selfClosing) raw = raw.slice(0, -1);

    const name = /^([a-zA-Z]+)/.exec(raw)?.[1];
    if (!name) throw new MathError(`无法解析 MathML 标签: ${raw}`);
    if (!ALLOWED_TAGS.has(name)) {
      throw new MathError(
        `MathML 出现白名单外的元素 <${name}>，公式: ${tex}。确认它安全后把它加进 scripts/math.ts 的 ALLOWED_TAGS`,
      );
    }

    const attrs: Record<string, string> = {};
    for (const m of raw.slice(name.length).matchAll(
      /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g,
    )) {
      const key = m[1]!;
      if (!ALLOWED_ATTRS.has(key)) {
        throw new MathError(
          `MathML 出现白名单外的属性 ${key}，公式: ${tex}。确认它安全后把它加进 scripts/math.ts 的 ALLOWED_ATTRS`,
        );
      }
      attrs[key] = decode(m[2]!);
    }

    if (selfClosing) {
      const node: { t: string; a?: Record<string, string> } = { t: name };
      if (Object.keys(attrs).length > 0) node.a = attrs;
      put(node);
    } else {
      stack.push({ t: name, a: attrs, c: [] });
    }
  }

  if (stack.length > 0) {
    throw new MathError(`MathML 有未闭合的元素: ${tex}`);
  }
  return root;
}

export function renderMath(tex: string, display: boolean): MathNode[] {
  const source = tex.trim();
  if (source === "") throw new MathError("公式内容为空");

  let out: string;
  try {
    out = katex.renderToString(source, {
      output: "mathml",
      displayMode: display,
      throwOnError: true,
      strict: "error",
      // Disables \href, \url and \includegraphics. They then render as literal
      // red text, which the colour check below turns into a build failure.
      trust: false,
    });
  } catch (err) {
    throw new MathError(`${(err as Error).message}  ←  ${source}`);
  }

  if (out.includes(ERROR_COLOUR)) {
    throw new MathError(
      `公式里有 KaTeX 不支持或不信任的命令，它会被渲染成红色字面文本: ${source}`,
    );
  }

  const start = out.indexOf("<math");
  const end = out.lastIndexOf("</math>");
  if (start === -1 || end === -1) {
    throw new MathError(`KaTeX 没有产出 <math> 元素: ${source}`);
  }

  return parseMathml(out.slice(start, end + "</math>".length), source);
}
