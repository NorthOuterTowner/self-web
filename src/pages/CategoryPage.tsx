import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { ArticleBody } from "../components/ArticleBody";
import { TableOfContents } from "../components/TableOfContents";
import {
  getNeighbours,
  getOutline,
  getPost,
  getPosts,
  getSeriesPost,
  getSeriesPosts,
  postPath,
  seriesPath,
} from "../content";
import { extractHeadings, formatDate, readingMinutes } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { categoryById, getSeries, isCategoryId, site } from "../site.config";
import { NotFound } from "./NotFound";

export function CategoryPage() {
  const {
    category: categoryParam,
    series: seriesParam,
    slug,
  } = useParams();
  const root = useRef<HTMLDivElement>(null);

  const valid = isCategoryId(categoryParam);
  const category = valid ? categoryById[categoryParam] : undefined;
  const posts = useMemo(
    () => (valid ? getPosts(categoryParam) : []),
    [valid, categoryParam],
  );
  const outline = useMemo(
    () => (valid ? getOutline(categoryParam) : undefined),
    [valid, categoryParam],
  );

  // `seriesParam` is only set by the three-segment route, so its presence is
  // what distinguishes an instalment from a standalone piece.
  const seriesMeta =
    valid && seriesParam ? getSeries(categoryParam, seriesParam) : undefined;

  const post = !valid
    ? undefined
    : seriesParam
      ? // An undeclared series in the URL yields no meta and therefore no post,
        // which falls through to NotFound below.
        seriesMeta
        ? getSeriesPost(categoryParam, seriesParam, slug)
        : undefined
      : // Bare `/<category>` shows the newest article in the category; a slug
        // resolves against standalone articles only.
        getPost(categoryParam, slug);

  const headings = useMemo(
    () => (post ? extractHeadings(post.blocks) : []),
    [post],
  );

  // New article: back to the top, then a short entrance.
  useEffect(() => {
    if (!category) return;

    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = post
      ? `${post.title} — ${site.name}`
      : `${category.title} — ${site.name}`;

    if (!post) return;

    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline();
      tl.from(".article__eyebrow > *", {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
      })
        .from(".article__title", { y: 24, opacity: 0, duration: 0.7 }, 0.06)
        .from(".article__lede", { y: 18, opacity: 0, duration: 0.7 }, 0.16)
        // Only the first screenful is staggered; everything below the fold is
        // already in place by the time the reader scrolls to it.
        .from(
          [".article__tag", ".prose > *"],
          { y: 16, opacity: 0, duration: 0.55, stagger: 0.035 },
          0.24,
        );
    });

    return () => mm.revert();
  }, [post, category]);

  // Unknown stream in the URL.
  if (!valid || !category || !outline) {
    return <NotFound />;
  }

  // A declared stream with nothing written yet. This is a normal state, not an
  // error: the home page still links here, so it gets a placeholder rather
  // than a 404 that would read as a broken link.
  if (posts.length === 0) {
    return (
      <div className="page page--reading" data-accent={category.id}>
        <div className="shell blog">
          <header className="blog__masthead">
            <span className="index-num">{category.index}</span>
            <p className="blog__masthead-title">
              {category.title}
              <span className="blog__masthead-en">{category.titleEn}</span>
            </p>
            <span className="label blog__masthead-count">00 Entries</span>
          </header>

          <div className="blog__empty">
            <p className="blog__empty-lede">{category.intro}</p>
            <p className="blog__empty-note">
              这条记录线还没有文章。在 <code>content/{category.slug}/</code>{" "}
              下新建一个 <code>.md</code> 文件即可，格式见{" "}
              <code>content/FORMAT.md</code>。
            </p>
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Stream exists and has posts, but the requested address does not match one.
  if (!post) {
    return <NotFound />;
  }

  const { prev, next } = getNeighbours(post);
  const minutes = readingMinutes(post.blocks);
  const seriesTotal = post.series
    ? getSeriesPosts(category.id, post.series).length
    : 0;

  return (
    <div className="page page--reading" data-accent={category.id}>
      <div className="shell blog" ref={root}>
        <header className="blog__masthead">
          <span className="index-num">{category.index}</span>
          {/* The article headline is the page h1, so the stream name is not a
              heading — it is masthead furniture. */}
          <p className="blog__masthead-title">
            {category.title}
            <span className="blog__masthead-en">{category.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">
            {String(posts.length).padStart(2, "0")} Entries
          </span>
        </header>

        <div className="blog__body">
          <TableOfContents
            category={category}
            outline={outline}
            activePost={post}
            headings={headings}
          />

          <article className="article">
            {/* Where this sits in a reading sequence comes before the article's
                own metadata: it changes how you read what follows. */}
            {seriesMeta && post.series && (
              <div className="article__series">
                <Link
                  to={seriesPath(category.id, post.series)}
                  className="article__series-link"
                >
                  <span className="label label--ink">Series</span>
                  <span className="article__series-title">
                    {seriesMeta.title}
                  </span>
                </Link>
                <span className="label article__series-pos">
                  第 {post.order} / {seriesTotal} 篇
                </span>
              </div>
            )}

            <div className="article__eyebrow">
              <span className="label">{category.titleEn}</span>
              <span className="article__eyebrow-sep" aria-hidden="true" />
              <span className="label">{formatDate(post.date)}</span>
              <span className="article__eyebrow-sep" aria-hidden="true" />
              <span className="label">{minutes} min read</span>
            </div>

            <h1 className="article__title">{post.title}</h1>
            <div className="article__lede">
              <p>{post.lede}</p>
            </div>

            <ul className="article__tags">
              {post.tags.map((tag) => (
                <li className="article__tag" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>

            <ArticleBody blocks={post.blocks} />

            <nav
              className="article__nav"
              aria-label={
                post.series ? "专栏内的上一篇 / 下一篇" : "上一篇 / 下一篇"
              }
            >
              {prev && (
                <Link to={postPath(prev)} className="article__nav-item">
                  <span className="label">← 上一篇</span>
                  <span className="article__nav-title">{prev.title}</span>
                </Link>
              )}
              {next && (
                <Link
                  to={postPath(next)}
                  className="article__nav-item article__nav-item--next"
                >
                  <span className="label">下一篇 →</span>
                  <span className="article__nav-title">{next.title}</span>
                </Link>
              )}
            </nav>
          </article>
        </div>
      </div>
    </div>
  );
}
