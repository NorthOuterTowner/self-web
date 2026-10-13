import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { ArticleBody } from "../components/ArticleBody";
import { HeadingNav } from "../components/TableOfContents";
import {
  allResources,
  getResource,
  getResourceNeighbours,
  resourcePath,
} from "../content";
import { extractHeadings, formatDate, readingMinutes } from "../content/types";
import type { Resource } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import {
  resourceKindById,
  resourceKinds,
  site,
  skills,
  type ResourceKindId,
} from "../site.config";
import { NotFound } from "./NotFound";

/**
 * The deck.
 *
 * Reference material does not want a grid of equal cards — it wants to look
 * like the pile on a desk, newest on top. So the sheets sit almost square
 * with each other and the ones underneath are nudged just enough that you can
 * count them, which is the one thing a single card can never tell you.
 *
 * The offsets are hand-placed, not generated. Same reasoning as the marks
 * behind the card ring: a random scatter reads as sloppy, six chosen
 * positions read as a pile someone actually put down.
 */

/** Per-depth offsets, index 0 being the sheet on top. */
interface Lie {
  /** px */
  x: number;
  y: number;
  /** degrees */
  rot: number;
  /** How much of the page's own colour is left; deeper sheets go greyer. */
  tint: number;
}

const LIE: Lie[] = [
  { x: 0, y: 0, rot: 0, tint: 0 },
  { x: 7, y: 9, rot: 0.8, tint: 14 },
  { x: -6, y: 18, rot: -1.1, tint: 26 },
  { x: 11, y: 27, rot: 1.5, tint: 36 },
  { x: -3, y: 35, rot: -0.6, tint: 44 },
  { x: 5, y: 43, rot: 1.1, tint: 50 },
];

/** Sheets drawn in the pile. Beyond this the list below is the way in. */
const VISIBLE = LIE.length;

/** How far the pile fans out when you reach for it. */
const FAN = 2.1;

export function SkillsPage() {
  const root = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(false);

  const deck = allResources.slice(0, VISIBLE);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${skills.title} — ${site.name}`;
  }, []);

  /**
   * Entrance: the sheets land one after another, from the bottom of the pile
   * up, so it reads as a stack being set down rather than as cards dealt.
   *
   * Transform and `box-shadow` only — no opacity. This page is the sheets, so
   * an entrance that fades them in makes the content conditional on a tween
   * finishing. A slide degrades to "slightly offset", which is survivable.
   */
  useEffect(() => {
    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".sheet", {
        y: 44,
        rotate: 0,
        duration: 0.7,
        ease: "power3.out",
        // `from: "end"` so the deepest sheet settles first and the newest one
        // arrives last, on top.
        stagger: { each: 0.07, from: "end" },
      });
      gsap.from(".skills__head > *", {
        y: 22,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
      });
    });
    return () => mm.revert();
  }, []);

  /**
   * Hovering the pile fans it, which is what makes the sheets underneath
   * reachable — before this they were a texture, not a target.
   *
   * Driven from one state flag rather than per-sheet CSS hover: the sheets
   * overlap, so a per-sheet hover would fire as the pointer crossed each edge
   * and the pile would twitch.
   */
  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setupGsap();
    const sheets = gsap.utils.toArray<HTMLElement>(".sheet", el);
    sheets.forEach((sheet, i) => {
      const lie = LIE[i] ?? LIE[LIE.length - 1]!;
      gsap.to(sheet, {
        x: lifted ? lie.x * FAN : lie.x,
        y: lifted ? lie.y * FAN : lie.y,
        rotate: lifted ? lie.rot * FAN : lie.rot,
        duration: 0.5,
        ease: "power3.out",
        overwrite: "auto",
      });
    });
  }, [lifted]);

  if (allResources.length === 0) {
    return (
      <div className="page page--reading">
        <div className="shell blog">
          <header className="blog__masthead">
            <p className="blog__masthead-title">
              {skills.title}
              <span className="blog__masthead-en">{skills.titleEn}</span>
            </p>
            <span className="label blog__masthead-count">00 Sheets</span>
          </header>
          <div className="blog__empty">
            <p className="blog__empty-lede">{skills.intro}</p>
            <p className="blog__empty-note">
              还没有内容。在 <code>content/{skills.slug}/</code> 下新建{" "}
              <code>.md</code>，frontmatter 里写{" "}
              <code>kind: skill</code> 或 <code>kind: prompt</code>。
            </p>
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--reading">
      <div className="shell skills" ref={root}>
        <header className="blog__masthead">
          <p className="blog__masthead-title">
            {skills.title}
            <span className="blog__masthead-en">{skills.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">
            {String(allResources.length).padStart(2, "0")} Sheets
          </span>
        </header>

        <div className="skills__head">
          <p className="others__intro">{skills.intro}</p>
          <ul className="skills__kinds">
            {resourceKinds.map((kind) => (
              <li key={kind.id} data-tone={kind.tone}>
                <span className="skills__kind-name">{kind.title}</span>
                <span className="skills__kind-note">{kind.note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* The pile. Pointer events are on the wrapper so crossing between
            overlapping sheets does not re-trigger the fan. */}
        <div
          className={`skills__stack${lifted ? " is-lifted" : ""}`}
          ref={stack}
          onMouseEnter={() => setLifted(true)}
          onMouseLeave={() => setLifted(false)}
          onFocus={() => setLifted(true)}
          onBlur={() => setLifted(false)}
        >
          {deck.map((resource, i) => (
            <Sheet key={resource.slug} resource={resource} depth={i} />
          ))}

          {allResources.length > VISIBLE && (
            <p className="skills__more label" aria-hidden="true">
              + {allResources.length - VISIBLE}
            </p>
          )}
        </div>

        {/* The full set. Not a fallback: the pile shows the newest few, this
            is how you find a particular one. */}
        <ol className="skills__list">
          {allResources.map((resource) => {
            const kind = resourceKindById[resource.kind as ResourceKindId];
            return (
              <li key={resource.slug}>
                <Link
                  to={resourcePath(resource)}
                  className="skills__row"
                  data-tone={kind.tone}
                >
                  <span className="skills__row-kind label">{kind.title}</span>
                  <span className="skills__row-title">{resource.title}</span>
                  <span className="skills__row-meta label">
                    {formatDate(resource.date)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="note__foot">
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function Sheet({
  resource,
  depth,
}: {
  resource: Resource;
  depth: number;
}) {
  const lie = LIE[depth] ?? LIE[LIE.length - 1]!;
  const kind = resourceKindById[resource.kind as ResourceKindId];

  return (
    <Link
      to={resourcePath(resource)}
      className="sheet"
      data-tone={kind.tone}
      style={
        {
          // The resting lie. GSAP takes these over on hover; they are here so
          // the pile is correct before any JS runs.
          transform: `translate(${lie.x}px, ${lie.y}px) rotate(${lie.rot}deg)`,
          zIndex: LIE.length - depth,
          "--sheet-tint": `${lie.tint}%`,
          "--sheet-depth": depth,
        } as CSSProperties
      }
    >
      <span className="sheet__edge" aria-hidden="true" />

      <div className="sheet__top">
        <span className="label sheet__kind">{kind.title}</span>
        <span className="label sheet__date">{formatDate(resource.date)}</span>
      </div>

      <h2 className="sheet__title">{resource.title}</h2>
      {resource.use && <p className="sheet__use">{resource.use}</p>}
      <p className="sheet__lede">{resource.lede}</p>

      <div className="sheet__foot">
        <span className="label">
          {readingMinutes(resource.blocks)} min read
        </span>
        <span className="label sheet__open">打开 →</span>
      </div>
    </Link>
  );
}

/**
 * Reading one skill or prompt.
 *
 * Deliberately the blog layout: sibling list on the left, headings under it,
 * body on the right. These are read the same way an article is, and a reader
 * who has learned that layout once should not have to learn a second one.
 */
export function ResourcePage() {
  const { slug } = useParams();
  const root = useRef<HTMLDivElement>(null);
  const resource = getResource(slug);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (!resource) return;
    document.title = `${resource.title} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline();
      tl.from(".article__eyebrow > *", {
        y: 14,
        duration: 0.5,
        stagger: 0.05,
      })
        .from(".article__title", { y: 24, duration: 0.7 }, 0.06)
        .from(".article__lede", { y: 18, duration: 0.7 }, 0.16);
    });
    return () => mm.revert();
  }, [resource]);

  if (!resource) return <NotFound />;

  const kind = resourceKindById[resource.kind as ResourceKindId];
  const headings = extractHeadings(resource.blocks);
  const { prev, next } = getResourceNeighbours(resource);

  return (
    <div className="page page--reading" data-accent-tone={kind.tone}>
      <div className="shell blog" ref={root}>
        <header className="blog__masthead">
          <Link to={`/${skills.slug}`} className="blog__masthead-title">
            {skills.title}
            <span className="blog__masthead-en">{skills.titleEn}</span>
          </Link>
          <span className="label blog__masthead-count">
            {String(allResources.length).padStart(2, "0")} Sheets
          </span>
        </header>

        <div className="blog__body">
          <aside className="toc" aria-label="目录">
            <div className="toc__panel">
              {resourceKinds.map((meta) => {
                const own = allResources.filter((r) => r.kind === meta.id);
                if (own.length === 0) return null;
                return (
                  <nav
                    className="toc__group"
                    key={meta.id}
                    aria-label={meta.title}
                  >
                    <p className="toc__heading">
                      <span className="toc__heading-label">{meta.title}</span>
                      <span className="toc__heading-rule" aria-hidden="true" />
                      <span className="toc__heading-count">
                        {String(own.length).padStart(2, "0")}
                      </span>
                    </p>
                    <ul>
                      {own.map((item, i) => (
                        <li key={item.slug}>
                          <Link
                            to={resourcePath(item)}
                            className={`toc__entry${
                              item.slug === resource.slug ? " is-active" : ""
                            }`}
                            aria-current={
                              item.slug === resource.slug ? "page" : undefined
                            }
                          >
                            <span className="toc__entry-num">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>
                              {item.title}
                              <span className="toc__entry-date">
                                {formatDate(item.date)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                );
              })}

              <HeadingNav headings={headings} />

              <Link to={`/${skills.slug}`} className="toc__back">
                ← 全部 {skills.title}
              </Link>
            </div>
          </aside>

          <article className="article">
            <div className="article__eyebrow">
              <span className="label">{kind.titleEn}</span>
              <span className="article__eyebrow-sep" aria-hidden="true" />
              <span className="label">{formatDate(resource.date)}</span>
              <span className="article__eyebrow-sep" aria-hidden="true" />
              <span className="label">
                {readingMinutes(resource.blocks)} min read
              </span>
            </div>

            <h1 className="article__title">{resource.title}</h1>
            {resource.use && (
              <p className="skills__use label">用途 · {resource.use}</p>
            )}
            <div className="article__lede">
              <p>{resource.lede}</p>
            </div>

            <ul className="article__tags">
              {resource.tags.map((tag) => (
                <li className="article__tag" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>

            <ArticleBody blocks={resource.blocks} />

            <nav className="article__nav" aria-label="更早 / 更晚">
              {prev && (
                <Link to={resourcePath(prev)} className="article__nav-item">
                  <span className="label">← 更晚</span>
                  <span className="article__nav-title">{prev.title}</span>
                </Link>
              )}
              {next && (
                <Link
                  to={resourcePath(next)}
                  className="article__nav-item article__nav-item--next"
                >
                  <span className="label">更早 →</span>
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
