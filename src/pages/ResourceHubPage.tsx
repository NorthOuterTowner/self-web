import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { countLinks, loadLinkShelf } from "../content/links";
import {
  getLinkShelf,
  linkShelves,
  randomFieldList,
  resourceEntries,
  resourceEntryPath,
  resourceHub,
  site,
  type ResourceEntryMeta,
} from "../site.config";

/**
 * The hub at `/resource`: one small card per entry in `resourceEntries`.
 *
 * The cards are sized for a long row, not for the four there are now — the
 * grid fills columns of a fixed minimum width, so a fifth or a fifteenth
 * entry just wraps, and none of them ever stretches to fill the page.
 *
 * A shelf's link count needs its JSON, so the hub fetches every shelf in the
 * background. The files are small and cached, so opening a shelf afterwards
 * costs nothing; until a count arrives, or if it fails, the corner is blank.
 */
export function ResourceHubPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${resourceHub.title} — ${site.name}`;

    let live = true;
    for (const shelf of linkShelves) {
      loadLinkShelf(shelf.slug).then(
        (groups) =>
          live && setCounts((c) => ({ ...c, [shelf.slug]: countLinks(groups) })),
        () => {},
      );
    }
    return () => {
      live = false;
    };
  }, []);

  /** The count in the card's corner: fields for the draw, links for a shelf. */
  const countLabel = (entry: ResourceEntryMeta): string => {
    if (!getLinkShelf(entry.slug)) return `${randomFieldList.length} Fields`;
    const n = counts[entry.slug];
    return n === undefined ? "" : `${n} Links`;
  };

  return (
    <div className="page page--reading">
      <div className="shell hub">
        <header className="blog__masthead">
          <h1 className="blog__masthead-title">
            {resourceHub.title}
            <span className="blog__masthead-en">{resourceHub.titleEn}</span>
          </h1>
          <span className="label blog__masthead-count">
            {String(resourceEntries.length).padStart(2, "0")} Entries
          </span>
        </header>

        <p className="hub__intro">{resourceHub.intro}</p>

        <ul className="hub__grid">
          {resourceEntries.map((entry, i) => (
            <li key={entry.slug}>
              <Link to={resourceEntryPath(entry)} className="hub__card">
                <span className="hub__top">
                  <span className="label">{String(i + 1).padStart(2, "0")}</span>
                  <span className="label">{countLabel(entry)}</span>
                </span>
                <span className="hub__title">{entry.title}</span>
                <span className="hub__en">{entry.titleEn}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="note__foot">
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
