import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../content";
import type { Heading } from "../content/types";
import { formatDate } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import type { CategoryMeta } from "../site.config";

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

interface Props {
  category: CategoryMeta;
  posts: Post[];
  activeSlug: string;
  headings: Heading[];
}

export function TableOfContents({
  category,
  posts,
  activeSlug,
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
          <nav className="toc__group" aria-label="文章列表">
            <span className="label label--ink toc__heading">
              Entries · {String(posts.length).padStart(2, "0")}
            </span>
            <ul>
              {posts.map((post, i) => (
                <li key={post.slug}>
                  <Link
                    to={`/${category.slug}/${post.slug}`}
                    className={`toc__entry${
                      post.slug === activeSlug ? " is-active" : ""
                    }`}
                    aria-current={post.slug === activeSlug ? "page" : undefined}
                  >
                    <span className="toc__entry-num">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {post.title}
                      <span className="toc__entry-date">
                        {formatDate(post.date)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {headings.length > 0 && (
            <nav className="toc__group" aria-label="本页小节">
              <span className="label label--ink toc__heading">On this page</span>
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
