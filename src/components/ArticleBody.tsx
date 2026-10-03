import type { Block, Inline } from "../content/types";
import { headingId } from "../content/types";

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

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return node.text;

          case "code":
            return <code key={i}>{node.text}</code>;

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

export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="prose">
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
                {block.items.map((item, j) => (
                  <li key={j}>
                    <span>
                      <InlineNodes nodes={item} />
                    </span>
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <span>
                      <InlineNodes nodes={item} />
                    </span>
                  </li>
                ))}
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
    </div>
  );
}
