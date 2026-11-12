import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  countLinks,
  loadLinkShelf,
  type LinkGroup,
  type LinkItem,
} from "../content/links";
import { shelfIcons } from "../lib/icons";
import {
  getLinkShelf,
  resourceHub,
  site,
  type LinkShelfMeta,
} from "../site.config";
import { NotFound } from "./NotFound";

/**
 * One link shelf (资源库 / 工具站 / To Read): a search bar, then the shelf's
 * groups, each a grid of small link cards. The data is
 * `content/links/<shelf>.json`, fetched when the page opens — see
 * `content/links.ts`.
 *
 * Search runs on every keystroke over what is already in memory — the
 * shelves are hand-written and will stay in the hundreds at most. The query
 * is split on whitespace and every term has to match (case-insensitive), so
 * "git 教程" narrows rather than widens. Two scopes: the title alone, which
 * is the default because it is what people remember; or title, description
 * and url together, for "the one on github.com" or "the one about cron".
 */

type Scope = "title" | "all";

type State =
  | { status: "loading" }
  | { status: "ready"; groups: LinkGroup[] }
  | { status: "error" };

const SCOPES: { id: Scope; label: string }[] = [
  { id: "title", label: "仅标题" },
  { id: "all", label: "标题 + 描述 + 链接" },
];

/** "developer.mozilla.org", shown under the card so the destination is visible. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function haystack(link: LinkItem, scope: Scope): string {
  const parts =
    scope === "title"
      ? [link.title]
      : [link.title, link.description ?? "", link.url];
  return parts.join("\n").toLowerCase();
}

function filterGroups(
  groups: LinkGroup[],
  terms: string[],
  scope: Scope,
): LinkGroup[] {
  return groups
    .map((g) => ({
      category: g.category,
      links:
        terms.length === 0
          ? g.links
          : g.links.filter((link) => {
              const text = haystack(link, scope);
              return terms.every((t) => text.includes(t));
            }),
    }))
    .filter((g) => g.links.length > 0);
}

export function LinkShelfPage() {
  const { slug } = useParams();
  const shelf = getLinkShelf(slug);
  return shelf ? <Shelf key={shelf.slug} shelf={shelf} /> : <NotFound />;
}

function Shelf({ shelf }: { shelf: LinkShelfMeta }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("title");
  const inputId = useId();
  const Search = shelfIcons.search;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${shelf.title} — ${site.name}`;

    let live = true;
    loadLinkShelf(shelf.slug).then(
      (groups) => live && setState({ status: "ready", groups }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [shelf]);

  const groups = state.status === "ready" ? state.groups : [];
  const total = countLinks(groups);

  const terms = useMemo(
    () => query.toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );
  const shown = useMemo(
    () => filterGroups(groups, terms, scope),
    [groups, terms, scope],
  );
  const searching = terms.length > 0;

  let body: ReactNode;
  if (state.status === "loading") {
    body = <p className="label shelf__empty">Loading…</p>;
  } else if (state.status === "error") {
    body = <p className="shelf__empty">没能加载，稍后再试。</p>;
  } else if (shown.length === 0) {
    body = (
      <p className="shelf__empty">
        {searching
          ? scope === "title"
            ? "没有标题匹配的链接。可以换成「标题 + 描述 + 链接」再试试。"
            : "没有匹配的链接。"
          : `这里还没有链接。在 content/links/${shelf.slug}.json 里添加。`}
      </p>
    );
  } else {
    body = shown.map((group) => (
      <section className="shelf__group" key={group.category}>
        <h2 className="shelf__heading">
          <span>{group.category}</span>
          <span className="shelf__heading-rule" aria-hidden="true" />
          <span className="label">
            {String(group.links.length).padStart(2, "0")}
          </span>
        </h2>
        <ul className="shelf__grid">
          {group.links.map((link) => (
            <li key={`${link.title}|${link.url}`}>
              <LinkCard link={link} />
            </li>
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <div className="page page--reading">
      <div className="shell shelf">
        <header className="blog__masthead">
          <h1 className="blog__masthead-title">
            {shelf.title}
            <span className="blog__masthead-en">{shelf.titleEn}</span>
          </h1>
          {state.status === "ready" && (
            <span className="label blog__masthead-count">
              {String(total).padStart(2, "0")} Links
            </span>
          )}
        </header>

        <div className="shelf__search" role="search">
          <label htmlFor={inputId} className="sr-only">
            搜索{shelf.title}
          </label>
          <div className="shelf__field">
            <Search className="shelf__icon" aria-hidden="true" />
            <input
              id={inputId}
              type="search"
              className="shelf__input"
              placeholder={
                scope === "title" ? "按标题搜索…" : "搜索标题、描述或链接…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="shelf__scopes" role="radiogroup" aria-label="搜索范围">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={scope === s.id}
                className="shelf__scope"
                onClick={() => setScope(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {body}

        <div className="note__foot">
          <Link to={`/${resourceHub.slug}`} className="toc__back">
            ← 全部{resourceHub.title}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The url was checked to be http(s) by `parseLinkShelf`, so it is safe as an href. */
function LinkCard({ link }: { link: LinkItem }) {
  return (
    <a
      className="shelf__card"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="shelf__title">{link.title}</span>
      {link.description && (
        <span className="shelf__note">{link.description}</span>
      )}
      <span className="shelf__host">
        {hostOf(link.url)}
        <span aria-hidden="true"> ↗</span>
      </span>
      <span className="sr-only">（在新标签页打开）</span>
    </a>
  );
}
