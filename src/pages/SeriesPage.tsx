import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { getSeriesPosts, postPath } from "../content";
import { formatDate, readingMinutes } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { categoryById, site, type SeriesMeta } from "../site.config";

/**
 * A series index: the whole run laid out in reading order.
 *
 * Deliberately not a copy of the category listing. The category page is a
 * reverse-chronological pile you dip into; this is a sequence with a first
 * instalment, so the numbers are the loudest thing on the row and the dates
 * are demoted to meta.
 */
export function SeriesPage({ meta }: { meta: SeriesMeta }) {
  const root = useRef<HTMLDivElement>(null);
  const category = categoryById[meta.category];
  const posts = useMemo(
    () => getSeriesPosts(meta.category, meta.slug),
    [meta.category, meta.slug],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${meta.title} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline();
      tl.from(".series__eyebrow > *", {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
      })
        .from(".series__title", { y: 24, opacity: 0, duration: 0.7 }, 0.06)
        .from(".series__intro", { y: 18, opacity: 0, duration: 0.7 }, 0.16)
        .from(
          ".series__item",
          { y: 18, opacity: 0, duration: 0.55, stagger: 0.06 },
          0.26,
        );
    });

    return () => mm.revert();
  }, [meta]);

  return (
    <div className="page page--reading" data-accent={category.id}>
      <div className="shell blog" ref={root}>
        <header className="blog__masthead">
          <span className="index-num">{category.index}</span>
          <p className="blog__masthead-title">
            {category.title}
            <span className="blog__masthead-en">{category.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">
            {String(posts.length).padStart(2, "0")} Parts
          </span>
        </header>

        <div className="series">
          <div className="series__eyebrow">
            <span className="label label--ink">Series</span>
            <span className="series__eyebrow-sep" aria-hidden="true" />
            <span className="label">{meta.titleEn}</span>
          </div>

          <h1 className="series__title">{meta.title}</h1>
          <p className="series__intro">{meta.intro}</p>

          {posts.length === 0 ? (
            // Declared but empty. Same reasoning as an empty category: the
            // sidebar and the config still point here, so a placeholder beats a
            // 404 that reads as a broken link.
            <div className="blog__empty">
              <p className="blog__empty-note">
                这个专栏还没有文章。在{" "}
                <code>
                  content/{category.slug}/{meta.slug}/
                </code>{" "}
                下新建 <code>.md</code> 文件，并在 frontmatter 里写{" "}
                <code>order: 1</code>、<code>order: 2</code> 决定次序。
              </p>
            </div>
          ) : (
            <ol className="series__list">
              {posts.map((post) => (
                <li className="series__item" key={post.slug}>
                  <Link to={postPath(post)} className="series__link">
                    <span className="series__num index-num">
                      {String(post.order).padStart(2, "0")}
                    </span>
                    <span className="series__body">
                      <span className="series__item-title">{post.title}</span>
                      <span className="series__lede">{post.lede}</span>
                      <span className="series__meta">
                        <span className="label">{formatDate(post.date)}</span>
                        <span
                          className="series__meta-sep"
                          aria-hidden="true"
                        />
                        <span className="label">
                          {readingMinutes(post.blocks)} min read
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <div className="series__foot">
            <Link to={`/${category.slug}`} className="toc__back">
              ← {category.title}
            </Link>
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
