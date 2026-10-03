import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { getPosts } from "../content";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { categories } from "../site.config";

/** Parallax strength per column, so the row drifts instead of moving as a slab. */
const DEPTH: Record<string, number> = {
  left: -5,
  center: -11,
  right: -7,
};

function ArrowRight() {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" fill="none" aria-hidden="true">
      <path d="M0 4h20M17 1l3.2 3-3.2 3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function CardsSection() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);

    // Scroll driven motion only where it is wanted: wide viewports with motion
    // enabled. Narrow screens get the stacked layout and no parallax.
    mm.add(
      "(prefers-reduced-motion: no-preference) and (min-width: 861px)",
      (ctx) => {
        gsap.from(".streams__head > *", {
          y: 26,
          opacity: 0,
          duration: 0.85,
          stagger: 0.09,
          scrollTrigger: { trigger: ".streams__head", start: "top 86%" },
        });

        const cards = (ctx.selector?.(".stream") ??
          gsap.utils.toArray(".stream")) as HTMLElement[];

        // Entrance wipe. The resting state is `inset(0%)` in CSS so GSAP has a
        // real value to animate back to — animating to `none` would not work.
        gsap.from(cards, {
          y: 84,
          opacity: 0,
          clipPath: "inset(0% 0% 100% 0%)",
          duration: 1.05,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: { trigger: ".streams__row", start: "top 82%" },
        });

        cards.forEach((card) => {
          const accent = card.querySelector<HTMLElement>(".stream__accent");
          if (accent) {
            gsap.to(accent, {
              scaleX: 1,
              duration: 0.9,
              ease: "power2.inOut",
              scrollTrigger: { trigger: card, start: "top 78%" },
            });
          }

          // Continuous parallax so the row drifts instead of moving as a slab.
          const depth = DEPTH[card.dataset.position ?? "left"] ?? -6;
          gsap.to(card, {
            yPercent: depth,
            ease: "none",
            scrollTrigger: {
              trigger: ".streams__row",
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
            },
          });
        });
      },
    );

    // No scroll animation in these cases, so the accent rules are set directly.
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".stream__accent", { scaleX: 1 });
    });

    mm.add("(max-width: 860px)", () => {
      gsap.set(".stream__accent", { scaleX: 1 });
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      className="streams"
      id="streams"
      ref={root}
      aria-labelledby="streams-title"
    >
      <div className="shell">
        <div className="streams__head section-head">
          <span className="label label--ink">Streams</span>
          <h2 className="section-head__title" id="streams-title">
            三条并行的记录线
          </h2>
          <span className="label section-head__meta">
            {String(categories.length).padStart(2, "0")} / Sections
          </span>
        </div>

        <div className="grid12 streams__row">
          {categories.map((c) => {
            const posts = getPosts(c.id);
            const latest = posts[0];
            return (
              <Link
                to={`/${c.slug}`}
                key={c.id}
                className="stream"
                data-accent={c.id}
                data-position={c.position}
                aria-label={`${c.title} — ${posts.length} 篇`}
              >
                <span className="stream__accent" aria-hidden="true" />

                <div className="stream__top">
                  <span className="index-num">{c.index}</span>
                  <span className="label">{c.position}</span>
                  <span className="stream__dot" aria-hidden="true" />
                </div>

                <h3 className="stream__title">{c.title}</h3>
                <span className="stream__title-en">{c.titleEn}</span>
                <p className="stream__summary">{c.summary}</p>

                {latest && (
                  <div className="stream__latest">
                    <span className="label">Latest</span>
                    <span className="stream__latest-title">{latest.title}</span>
                  </div>
                )}

                <div className="stream__foot">
                  {/* The numeral is mono, the CJK unit is not — mixing them in
                      one element made the glyph fall back and look clipped. */}
                  <span className="stream__count">
                    <span className="index-num">
                      {String(posts.length).padStart(2, "0")}
                    </span>
                    <span className="stream__count-unit">篇</span>
                  </span>
                  <span className="stream__arrow">
                    Enter
                    <ArrowRight />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
