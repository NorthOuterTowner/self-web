import { useEffect, useRef } from "react";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { useTypewriter } from "../lib/useTypewriter";
import { allPosts } from "../content";
import { categories, site } from "../site.config";

const GRID_COLUMNS = 12;

export function Hero() {
  const { typed, done } = useTypewriter(site.heroLine);
  const root = useRef<HTMLElement>(null);

  // Entrance: the grid draws itself, then the marginal data arrives.
  // The headline is handled by the typewriter, not by GSAP.
  useEffect(() => {
    setupGsap();
    const scope = root.current;
    if (!scope) return;

    // Scoped matchMedia: selector strings resolve inside `scope`, and
    // mm.revert() tears down every tween and media listener on unmount.
    const mm = gsap.matchMedia(scope);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline();

      tl.from(".hero__grid-line", {
        scaleY: 0,
        duration: 1.1,
        stagger: { each: 0.045, from: "start" },
        ease: "power2.inOut",
      })
        .from(
          ".hero__ring",
          { scale: 0.86, opacity: 0, duration: 1.6, stagger: 0.12 },
          0.1,
        )
        .from(".hero__dots", { opacity: 0, duration: 1.4 }, 0.2)
        .from(
          ".hero__eyebrow > *",
          { yPercent: 120, opacity: 0, duration: 0.7, stagger: 0.08 },
          0.35,
        )
        .from(
          [".hero__sub", ".hero__fact"],
          { y: 18, opacity: 0, duration: 0.8, stagger: 0.07 },
          1.1,
        )
        .from(".hero__cue", { opacity: 0, duration: 0.6 }, 1.5);
    });

    return () => mm.revert();
  }, []);

  return (
    <section className="hero" ref={root} aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden="true">
        <div className="hero__dots" />
        <div className="hero__ring" />
        <div className="hero__ring hero__ring--inner" />
        <div className="hero__grid">
          {Array.from({ length: GRID_COLUMNS }, (_, i) => (
            <div className="hero__grid-line" key={i} />
          ))}
        </div>
      </div>

      <div className="shell grid12 hero__body">
        <div className="hero__eyebrow">
          <span className="label label--ink">Index</span>
          <span className="hero__eyebrow-rule" />
          <span className="label">{String(new Date().getFullYear())}</span>
        </div>

        <h1 className="hero__display" id="hero-title">
          {/* Full line for assistive tech; the animated copy is decorative. */}
          <span className="sr-only">{site.heroLine}</span>
          <span aria-hidden="true">
            {typed}
            <span className={`hero__caret${done ? " is-done" : ""}`} />
          </span>
        </h1>

        <div className="hero__meta">
          <p className="hero__sub">{site.heroSub}</p>

          <dl className="hero__facts">
            <div className="hero__fact">
              <dt className="label">Streams</dt>
              <dd>{String(categories.length).padStart(2, "0")}</dd>
            </div>
            <div className="hero__fact">
              <dt className="label">Entries</dt>
              <dd>{String(allPosts.length).padStart(2, "0")}</dd>
            </div>
            <div className="hero__fact">
              <dt className="label">Latest</dt>
              <dd>{allPosts[0]?.date.replace(/-/g, ".")}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="hero__cue" aria-hidden="true">
        <span className="hero__cue-track" />
        <span className="label">Scroll</span>
      </div>
    </section>
  );
}
