import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CategoryOutline, Post } from "../content";
import { postPath, seriesPath } from "../content";
import type { Heading } from "../content/types";
import { formatDate } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import type { CategoryMeta, SeriesMeta } from "../site.config";

/** Pixels of breathing room below the fixed nav when scrolling to a heading. */
const ANCHOR_OFFSET = 92;

/**
 * Tracks which heading the reader is currently under.
 * A rAF-throttled scroll read beats IntersectionObserver here because it gives
 * a single unambiguous answer: the last heading above the offset line.
 */
function useActiveHeading(headings: Heading[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (headings.length === 0) {
      setActive(null);
      return;
    }

    let frame = 0;

    const measure = () => {
      frame = 0;
      let current = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - ANCHOR_OFFSET <= 1) {
          current = h.id;
        } else {
          break;
        }
      }
      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings]);

  return active;
}

function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  setupGsap();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.scrollIntoView();
    return;
  }

  gsap.to(window, {
    duration: 0.75,
    ease: "power2.inOut",
    scrollTo: { y: el, offsetY: ANCHOR_OFFSET, autoKill: true },
  });
}

/**
 * One row in the sidebar. `num` is the displayed index: a series uses the
 * article's own `order` so the sidebar and the series index agree, while the
 * loose list just counts down the page.
 */
function Entry({
  post,
  num,
  active,
}: {
  post: Post;
  num: number;
  active: boolean;
}) {
  return (
    <li>
      <Link
        to={postPath(post)}
        className={`toc__entry${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <span className="toc__entry-num">{String(num).padStart(2, "0")}</span>
        <span>
          {post.title}
          <span className="toc__entry-date">{formatDate(post.date)}</span>
        </span>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Folding a series
 * ------------------------------------------------------------------ */

/**
 * Which series the reader has folded away, kept across navigations and
 * reloads.
 *
 * Only the folded ones are stored, so the default is "open" and a series added
 * later is never hidden by a stale record. Wrapped in try/catch because
 * localStorage throws outright in some privacy modes rather than just failing
 * to persist.
 */
const FOLD_KEY = "toc:folded-series";

function readFolded(): Record<string, true> {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFolded(next: Record<string, true>): void {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(next));
  } catch {
    /* persistence is a nicety, not a requirement */
  }
}

/**
 * A series in the sidebar, foldable from the header.
 *
 * The title stays a link to the series index — folding is a separate control,
 * because collapsing the group and opening the group's page are two different
 * intentions and one target cannot serve both.
 *
 * Height is animated rather than toggled so the rest of the sidebar slides
 * instead of jumping. The list is `inert` while folded, which keeps its links
 * out of the tab order; a visually hidden group that still catches focus is
 * worse than no folding at all.
 */
function SeriesGroup({
  categoryId,
  meta,
  posts,
  isActive,
}: {
  categoryId: CategoryMeta["id"];
  meta: SeriesMeta;
  posts: Post[];
  isActive: (post: Post) => boolean;
}) {
  const key = `${categoryId}/${meta.slug}`;
  const holdsActive = posts.some(isActive);

  const [open, setOpen] = useState(() => {
    // The run you are reading is always open: folding it would hide your own
    // position in the sequence.
    if (holdsActive) return true;
    return !readFolded()[key];
  });

  const listRef = useRef<HTMLUListElement>(null);
  const settled = useRef(false);

  // Navigating into a folded series unfolds it, and that sticks — you are in
  // this series now, so the earlier preference no longer describes intent.
  useEffect(() => {
    if (!holdsActive || open) return;
    setOpen(true);
    const store = readFolded();
    delete store[key];
    writeFolded(store);
  }, [holdsActive, open, key]);

  /**
   * `overflow` is owned here rather than in the stylesheet because it is
   * animation state: clipping is required while the height is mid-flight and
   * while folded, but a permanently clipped list would cut the focus ring off
   * the entries once it is open and settled.
   *
   * A layout effect, so a group that starts folded is already folded on first
   * paint instead of flashing open — the same reason the card ring places
   * itself before paint.
   */
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    // First paint lands in the resting state directly. Animating from it would
    // play a fold-open on every page load, which is noise rather than motion.
    if (!settled.current || reduced) {
      settled.current = true;
      gsap.set(
        el,
        open
          ? { height: "auto", opacity: 1, overflow: "" }
          : { height: 0, opacity: 0, overflow: "hidden" },
      );
      return;
    }

    setupGsap();
    gsap.set(el, { overflow: "hidden" });
    gsap.to(el, {
      height: open ? "auto" : 0,
      opacity: open ? 1 : 0,
      duration: open ? 0.42 : 0.32,
      ease: open ? "power3.out" : "power3.inOut",
      overwrite: "auto",
      onComplete: () => {
        if (open) gsap.set(el, { overflow: "" });
      },
    });
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const store = readFolded();
    if (next) delete store[key];
    else store[key] = true;
    writeFolded(store);
  };

  const listId = `toc-series-${categoryId}-${meta.slug}`;

  return (
    <nav className="toc__group" aria-label={`专栏 ${meta.title}`}>
      <p className="toc__heading">
        <Link
          to={seriesPath(categoryId, meta.slug)}
          className="toc__heading-link"
        >
          {meta.title}
        </Link>
        <span className="toc__heading-rule" aria-hidden="true" />
        <span className="toc__heading-count">
          {String(posts.length).padStart(2, "0")}
        </span>
        <button
          type="button"
          className="toc__fold"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
        >
          <span className="sr-only">
            {open ? `收起专栏 ${meta.title}` : `展开专栏 ${meta.title}`}
          </span>
          {/* A plus that drops its vertical stroke when open, becoming a minus.
              Same device as the mobile summary's ::after, drawn as lines so the
              change can be animated instead of swapped. */}
          <svg
            className="toc__fold-icon"
            width="9"
            height="9"
            viewBox="0 0 9 9"
            aria-hidden="true"
          >
            <line x1="0.5" y1="4.5" x2="8.5" y2="4.5" />
            <line
              className="toc__fold-bar"
              x1="4.5"
              y1="0.5"
              x2="4.5"
              y2="8.5"
            />
          </svg>
        </button>
      </p>

      <ul
        className="toc__series-list"
        id={listId}
        ref={listRef}
        inert={!open}
      >
        {posts.map((post) => (
          <Entry
            key={post.slug}
            post={post}
            num={post.order ?? 0}
            active={isActive(post)}
          />
        ))}
      </ul>
    </nav>
  );
}

interface Props {
  category: CategoryMeta;
  outline: CategoryOutline;
  activePost: Post;
  headings: Heading[];
}

export function TableOfContents({
  category,
  outline,
  activePost,
  headings,
}: Props) {
  const activeHeading = useActiveHeading(headings);

  // Always expanded on desktop; a disclosure on narrow screens.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 980,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 981px)");
    const apply = () => {
      if (mq.matches) setOpen(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const isActive = (post: Post) =>
    post.slug === activePost.slug && post.series === activePost.series;

  // With no series declared the sidebar collapses to exactly what it was
  // before: one "Entries" list covering the whole category.
  const grouped = outline.series.length > 0;

  return (
    <aside className="toc" aria-label="目录">
      <details
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="toc__mobile-summary">
          <span className="index-num">{category.index}</span>
          <span className="label label--ink">目录 / Contents</span>
        </summary>

        <div className="toc__panel">
          {/* Series first — they are the part that can be read through. */}
          {outline.series.map(({ meta, posts }) => (
            <SeriesGroup
              key={meta.slug}
              categoryId={category.id}
              meta={meta}
              posts={posts}
              isActive={isActive}
            />
          ))}

          {outline.standalone.length > 0 && (
            <nav className="toc__group" aria-label="单篇文章">
              <p className="toc__heading">
                <span className="toc__heading-label">
                  {grouped ? "Singles" : "Entries"}
                </span>
                <span className="toc__heading-rule" aria-hidden="true" />
                <span className="toc__heading-count">
                  {String(outline.standalone.length).padStart(2, "0")}
                </span>
              </p>
              <ul>
                {outline.standalone.map((post, i) => (
                  <Entry
                    key={post.slug}
                    post={post}
                    num={i + 1}
                    active={isActive(post)}
                  />
                ))}
              </ul>
            </nav>
          )}

          {headings.length > 0 && (
            <nav className="toc__group" aria-label="本页小节">
              <p className="toc__heading">
                <span className="toc__heading-label">Contents</span>
                <span className="toc__heading-rule" aria-hidden="true" />
                <span className="toc__heading-count">
                  {String(headings.length).padStart(2, "0")}
                </span>
              </p>
              <div className="toc__anchors">
                {headings.map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    onClick={() => scrollToHeading(h.id)}
                    className={`toc__anchor${
                      h.level === 3 ? " toc__anchor--sub" : ""
                    }${activeHeading === h.id ? " is-current" : ""}`}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </details>
    </aside>
  );
}
