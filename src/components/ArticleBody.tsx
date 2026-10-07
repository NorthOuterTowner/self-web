import { createElement, type ReactNode } from "react";
import type { Block, Inline, ListItem, MathNode } from "../content/types";
import { headingId, inlineText } from "../content/types";
import { withBase } from "../lib/basePath";

const RE_CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/**
 * Whether a verse line is Latin-only.
 *
 * Drives a `lang="en"` on the line, which is what lets the stylesheet slant
 * Latin verse without slanting Chinese verse — synthesised oblique CJK is
 * genuinely ugly, and `:lang()` cannot work off the document root here
 * because that is `zh-CN`. Marking the language is also just correct for
 * screen readers and hyphenation.
 */
function isLatinVerse(line: Inline[]): boolean {
  const text = inlineText(line).trim();
  return text.length > 0 && !RE_CJK.test(text);
}

/**
 * Renders the compiled block tree.
 *
 * Every node becomes a React element, so content never passes through
 * dangerouslySetInnerHTML. Link hrefs are validated at compile time by
 * scripts/markdown.ts, which rejects anything outside http(s)/mailto and
 * in-site paths.
 */

function isExternal(href: string): boolean {
  return /^https?:/.test(href);
}

/**
 * Builds the MathML subtree as React elements.
 *
 * React DOM recognises `math` and switches to the MathML namespace for its
 * descendants, so createElement is enough — the alternative would have been to
 * inject the markup string, which this exists to avoid. The tree was already
 * checked against a tag and attribute whitelist when it was compiled.
 */
function mathNodes(nodes: MathNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") return node;
    return createElement(
      node.t,
      { key: i, ...node.a },
      node.c ? mathNodes(node.c) : undefined,
    );
  });
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return node.text;

          case "code":
            return <code key={i}>{node.text}</code>;

          case "math":
            return (
              <span className="math math--inline" key={i}>
                {mathNodes(node.nodes)}
              </span>
            );

          case "strong":
            return (
              <strong key={i}>
                <InlineNodes nodes={node.children} />
              </strong>
            );

          case "em":
            return (
              <em key={i}>
                <InlineNodes nodes={node.children} />
              </em>
            );

          case "link":
            return (
              <a
                key={i}
                className="prose__link"
                href={node.href}
                {...(isExternal(node.href)
                  ? { target: "_blank", rel: "noreferrer noopener" }
                  : {})}
              >
                <InlineNodes nodes={node.children} />
              </a>
            );

          default: {
            const _never: never = node;
            return _never;
          }
        }
      })}
    </>
  );
}

function ListItems({ items }: { items: ListItem[] }) {
  return (
    <>
      {items.map((item, j) => (
        <li key={j}>
          <span>
            <InlineNodes nodes={item.content} />
          </span>
          {item.children && (
            <div className="prose__nested">
              <Blocks blocks={item.children} />
            </div>
          )}
        </li>
      ))}
    </>
  );
}

/**
 * Recursive so a list item can carry its own blocks — a code sample under a
 * numbered step, most of the time.
 *
 * Heading ids come from the block index, which is only meaningful at the top
 * level; the compiler rejects headings inside list items for that reason, so
 * nested calls never produce one.
 */
function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} id={headingId(i)}>
                <InlineNodes nodes={block.content} />
              </h2>
            );

          case "h3":
            return (
              <h3 key={i} id={headingId(i)}>
                <InlineNodes nodes={block.content} />
              </h3>
            );

          case "p":
            return (
              <p key={i}>
                <InlineNodes nodes={block.content} />
              </p>
            );

          case "ul":
            return (
              <ul key={i}>
                <ListItems items={block.items} />
              </ul>
            );

          case "ol":
            return (
              <ol key={i}>
                <ListItems items={block.items} />
              </ol>
            );

          case "quote":
            return (
              <blockquote key={i}>
                <p>
                  <InlineNodes nodes={block.content} />
                </p>
                {block.cite && <footer>{block.cite}</footer>}
              </blockquote>
            );

          case "code":
            return (
              <pre key={i}>
                {block.lang && (
                  <span className="prose__code-lang">{block.lang}</span>
                )}
                <code>{block.code}</code>
              </pre>
            );

          case "note":
            return (
              <aside key={i} className="prose__note">
                <span className="label">Note</span>
                <InlineNodes nodes={block.content} />
              </aside>
            );

          case "mathBlock":
            return (
              <div className="math math--block" key={i}>
                {mathNodes(block.nodes)}
              </div>
            );

          // Each line is its own element rather than one block with <br>s, so
          // a line that wraps on a narrow screen can be indented as a
          // continuation instead of looking like a new line of the poem.
          case "verse":
            return (
              <div className="prose__verse" key={i}>
                {block.lines.map((line, k) =>
                  line.length === 0 ? (
                    <span className="prose__verse-break" key={k} />
                  ) : (
                    <p
                      className="prose__verse-line"
                      lang={isLatinVerse(line) ? "en" : undefined}
                      key={k}
                    >
                      <InlineNodes nodes={line} />
                    </p>
                  ),
                )}
              </div>
            );

          case "figure":
            return (
              <figure className="prose__figure" key={i}>
                <img
                  className="prose__figure-img"
                  src={withBase(block.src)}
                  alt={block.alt}
                  /* Intrinsic size reserves the box before the bytes land, so
                     the article does not reflow under ScrollTrigger. */
                  width={block.width}
                  height={block.height}
                  loading="lazy"
                  decoding="async"
                />
                {block.caption && (
                  <figcaption className="prose__figure-caption">
                    <InlineNodes nodes={block.caption} />
                  </figcaption>
                )}
              </figure>
            );

          case "table":
            return (
              // The wrapper is what scrolls; tabindex lets a keyboard user
              // reach a table that is wider than the column.
              <div
                className="prose__table-wrap"
                key={i}
                tabIndex={0}
                role="group"
              >
                <table className="prose__table">
                  <thead>
                    <tr>
                      {block.head.map((cell, c) => (
                        <th key={c} scope="col" data-align={block.align[c]}>
                          <InlineNodes nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} data-align={block.align[c]}>
                            <InlineNodes nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "hr":
            return <hr key={i} />;

          default: {
            // Exhaustiveness guard: adding a block type without handling it
            // becomes a compile error rather than a silent blank.
            const _never: never = block;
            return _never;
          }
        }
      })}
    </>
  );
}

export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose">
      <Blocks blocks={blocks} />
    </div>
  );
}
