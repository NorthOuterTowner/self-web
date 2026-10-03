import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link } from "react-router-dom";
import { getPosts } from "../content";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { categories } from "../site.config";

/**
 * The three streams sit on a ring with exactly three stations. The centre one
 * is the visual anchor; the other two are parked behind it, one down-left and
 * one up-right, each partly occluded by the centre card.
 *
 * Stations are listed in cycle order, so advancing by one step moves every
 * card to the next entry and the card that was up-right lands in the centre:
 *
 *     UPPER_RIGHT -> CENTER -> LOWER_LEFT -> (wraps to UPPER_RIGHT)
 *
 * Dragging down-left advances; dragging up-right reverses.
 */
const UPPER_RIGHT = 0;
const CENTER = 1;
const LOWER_LEFT = 2;

interface Station {
  /** Offset in units of the stage's horizontal step. */
  x: number;
  /** Offset in units of the stage's (smaller) vertical step. */
  y: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

const STATIONS: Station[] = [
  { x: 1, y: -1, scale: 0.76, opacity: 0.82, zIndex: 10 },
  { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 30 },
  { x: -1, y: 1, scale: 0.76, opacity: 0.82, zIndex: 20 },
];

/** Where each stream starts out, taken from its declared home position. */
const START_STATION: Record<"left" | "center" | "right", number> = {
  right: UPPER_RIGHT,
  center: CENTER,
  left: LOWER_LEFT,
};

const ORDER = categories;
const HOME = ORDER.map((c) => START_STATION[c.position]);

const mod3 = (n: number): number => ((n % 3) + 3) % 3;

/** Fraction of a full step that has to be dragged before it commits. */
const COMMIT_AT = 0.28;

const TRANSIT = 0.72;

interface Metrics {
  dx: number;
  dy: number;
  /** Drag distance, in px, that equals one full step. */
  travel: number;
}

/**
 * The horizontal step is derived from the card's own width rather than the
 * stage's, so the amount of the parked cards that disappears behind the centre
 * one stays constant across breakpoints. At 0.71x the card width roughly a
 * fifth of each parked card is covered; the second term then caps the offset so
 * they do not slide too far off a narrow stage.
 */
function measure(stage: HTMLElement, card: HTMLElement | null): Metrics {
  const w = stage.clientWidth;
  const cardW = card?.offsetWidth ?? w * 0.3;
  const dx = Math.min(cardW * 0.71, w * 0.34);
  return {
    dx,
    dy: Math.min(dx * 0.3, 90),
    travel: Math.max(150, Math.min(w * 0.34, 300)),
  };
}

function ArrowRight() {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" fill="none" aria-hidden="true">
      <path
        d="M0 4h20M17 1l3.2 3-3.2 3"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function CardsSection() {
  const root = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  // Rotation is mirrored into a ref because the pointer handlers run outside
  // React's render cycle and need the current value, not a captured one.
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);

  const metrics = useRef<Metrics>({ dx: 0, dy: 0, travel: 240 });
  const inTransit = useRef(false);
  const [dragging, setDragging] = useState(false);

  const drag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    progress: 0,
    /** Set once the pointer has travelled far enough to count as a drag. */
    moved: false,
  });

  const reduced = useRef(false);
  useEffect(() => {
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
  }, []);

  /** Writes every card to its resting station. */
  const settle = useCallback((animate: boolean) => {
    const m = metrics.current;
    ORDER.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;
      const station = STATIONS[mod3(HOME[i]! + rotationRef.current)]!;
      const vars = {
        x: station.x * m.dx,
        y: station.y * m.dy,
        scale: station.scale,
        opacity: station.opacity,
      };
      if (animate && !reduced.current) {
        gsap.to(el, {
          ...vars,
          duration: 0.42,
          ease: "power3.out",
          overwrite: "auto",
          onComplete: () => {
            gsap.set(el, { zIndex: station.zIndex });
          },
        });
      } else {
        gsap.set(el, { ...vars, zIndex: station.zIndex });
      }
    });
  }, []);

  /** Moves the ring one station in either direction. */
  const rotateBy = useCallback(
    (step: 1 | -1) => {
      const m = metrics.current;
      const next = rotationRef.current + step;
      const duration = reduced.current ? 0.001 : TRANSIT;
      inTransit.current = true;

      ORDER.forEach((_, i) => {
        const el = cardRefs.current[i];
        if (!el) return;
        const from = STATIONS[mod3(HOME[i]! + rotationRef.current)]!;
        const to = STATIONS[mod3(HOME[i]! + next)]!;

        // A card moving into the centre rides above everything for the whole
        // trip; any other card stays at the lower of its two depths, so it
        // travels behind the centre card instead of across it.
        gsap.set(el, {
          zIndex:
            mod3(HOME[i]! + next) === CENTER
              ? Math.max(from.zIndex, to.zIndex)
              : Math.min(from.zIndex, to.zIndex),
        });

        gsap.to(el, {
          x: to.x * m.dx,
          y: to.y * m.dy,
          scale: to.scale,
          opacity: to.opacity,
          duration,
          ease: "power3.inOut",
          overwrite: "auto",
          onComplete: () => {
            gsap.set(el, { zIndex: to.zIndex });
          },
        });
      });

      rotationRef.current = next;
      setRotation(next);
      gsap.delayedCall(duration, () => {
        inTransit.current = false;
      });
    },
    [],
  );

  /** Live feedback while the pointer is held down. */
  const paintDrag = useCallback((progress: number) => {
    const m = metrics.current;
    const direction = progress >= 0 ? 1 : -1;
    const t = Math.min(Math.abs(progress), 1);

    ORDER.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;
      const current = mod3(HOME[i]! + rotationRef.current);
      const upcoming = mod3(current + direction);
      const a = STATIONS[current]!;
      const b = STATIONS[upcoming]!;

      gsap.set(el, {
        x: (a.x + (b.x - a.x) * t) * m.dx,
        y: (a.y + (b.y - a.y) * t) * m.dy,
        scale: a.scale + (b.scale - a.scale) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
        zIndex:
          upcoming === CENTER
            ? Math.max(a.zIndex, b.zIndex)
            : Math.min(a.zIndex, b.zIndex),
      });
    });
  }, []);

  const bringToCentre = useCallback(
    (index: number) => {
      const station = mod3(HOME[index]! + rotationRef.current);
      if (station === CENTER) return;
      rotateBy(station === UPPER_RIGHT ? 1 : -1);
    },
    [rotateBy],
  );

  // Place the cards before first paint so they never flash stacked.
  useLayoutEffect(() => {
    setupGsap();
    const stage = stageRef.current;
    if (!stage) return;
    metrics.current = measure(stage, cardRefs.current[0] ?? null);
    settle(false);
  }, [settle]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      metrics.current = measure(stage, cardRefs.current[0] ?? null);
      if (!drag.current.active) settle(false);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [settle]);

  /* ---- Pointer handling -------------------------------------------- *
   * Press and hold, then drag. Nothing moves on hover alone.           */

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;

    // Clear the record before any early return. Leaving `moved` set from the
    // previous gesture would make the next click look like the tail of a drag
    // and get swallowed.
    d.active = false;
    d.moved = false;
    d.progress = 0;

    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (inTransit.current) return;

    d.active = true;
    d.pointerId = event.pointerId;
    d.startX = event.clientX;
    d.startY = event.clientY;

    // Pointer capture is NOT taken here on purpose. Capturing retargets the
    // following `click` to the capturing element, so the card's <a> would
    // never receive it and the links would silently stop working. Capture is
    // claimed in onPointerMove, once the gesture is known to be a drag — at
    // which point losing the click is exactly what we want.
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || event.pointerId !== d.pointerId) return;

    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;

    // A few pixels of slop so a sloppy click is still a click.
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      setDragging(true);
      // Now that this is definitely a drag, take the pointer so the gesture
      // survives leaving the stage — and so the trailing click is absorbed
      // rather than following a link.
      try {
        stageRef.current?.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best effort */
      }
    }

    // Mouse follows the ring's own diagonal: down-left advances.
    // Touch is read horizontally instead, because the stage leaves vertical
    // panning to the browser (touch-action: pan-y) so the page can still
    // scroll past the cards.
    const along =
      event.pointerType === "mouse" ? (-dx + dy) / Math.SQRT2 : -dx;

    d.progress = gsap.utils.clamp(-1, 1, along / metrics.current.travel);
    paintDrag(d.progress);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || event.pointerId !== d.pointerId) return;

    d.active = false;
    setDragging(false);
    if (d.moved) {
      try {
        stageRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }

    if (Math.abs(d.progress) >= COMMIT_AT) {
      rotateBy(d.progress > 0 ? 1 : -1);
    } else if (d.moved) {
      settle(true);
    }
    d.progress = 0;
  };

  const onCardClick =
    (index: number) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
      // detail === 0 means the activation came from the keyboard, which should
      // follow the link rather than spin the ring.
      if (event.detail === 0) return;

      if (drag.current.moved) {
        event.preventDefault();
        return;
      }

      const station = mod3(HOME[index]! + rotationRef.current);
      if (station !== CENTER) {
        event.preventDefault();
        bringToCentre(index);
      }
      // The centred card is a plain link: let it navigate.
    };

  /* ---- Entrance ----------------------------------------------------- *
   * Scroll animation is applied to the wrapper, never to the cards: the
   * cards' own transforms belong to the ring logic.                     */

  useEffect(() => {
    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".streams__head > *", {
        y: 26,
        opacity: 0,
        duration: 0.85,
        stagger: 0.09,
        scrollTrigger: { trigger: ".streams__head", start: "top 86%" },
      });

      gsap.from(".streams__stage", {
        y: 70,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: ".streams__carousel", start: "top 84%" },
      });

      gsap.from(".streams__dial", {
        y: 20,
        opacity: 0,
        duration: 0.7,
        scrollTrigger: { trigger: ".streams__carousel", start: "top 72%" },
      });

      gsap.to(".stream__accent", {
        scaleX: 1,
        duration: 0.9,
        stagger: 0.08,
        ease: "power2.inOut",
        scrollTrigger: { trigger: ".streams__carousel", start: "top 80%" },
      });
    });

    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(".stream__accent", { scaleX: 1 });
    });

    // Gentle parallax on the whole stage so the block drifts with the scroll.
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 861px)", () => {
      gsap.to(".streams__stage", {
        yPercent: -6,
        ease: "none",
        scrollTrigger: {
          trigger: ".streams__carousel",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.8,
        },
      });
    });

    return () => mm.revert();
  }, []);

  const centred = ORDER.find((_, i) => mod3(HOME[i]! + rotation) === CENTER);

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
            Three Streams
          </h2>
          <span className="label section-head__meta">
            {String(ORDER.length).padStart(2, "0")} / Sections
          </span>
        </div>

        <div className="streams__carousel">
          <div
            className={`streams__stage${dragging ? " is-dragging" : ""}`}
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {ORDER.map((c, i) => {
              const posts = getPosts(c.id);
              const latest = posts[0];
              const station = mod3(HOME[i]! + rotation);
              const isCentre = station === CENTER;

              return (
                <Link
                  to={`/${c.slug}`}
                  key={c.id}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  className="stream"
                  data-accent={c.id}
                  data-station={
                    station === CENTER
                      ? "centre"
                      : station === UPPER_RIGHT
                        ? "upper-right"
                        : "lower-left"
                  }
                  draggable={false}
                  onClick={onCardClick(i)}
                  aria-label={
                    isCentre
                      ? `${c.title} — ${posts.length} 篇，打开`
                      : `${c.title} — ${posts.length} 篇，移到中间`
                  }
                >
                  <span className="stream__accent" aria-hidden="true" />

                  <div className="stream__top">
                    <span className="index-num">{c.index}</span>
                    <span className="label">{c.titleEn}</span>
                    <span className="stream__dot" aria-hidden="true" />
                  </div>

                  <h3 className="stream__title">{c.title}</h3>
                  <p className="stream__summary">{c.summary}</p>

                  {latest && (
                    <div className="stream__latest">
                      <span className="label">Latest</span>
                      <span className="stream__latest-title">
                        {latest.title}
                      </span>
                    </div>
                  )}

                  <div className="stream__foot">
                    <span className="stream__count">
                      <span className="index-num">
                        {String(posts.length).padStart(2, "0")}
                      </span>
                      <span className="stream__count-unit">篇</span>
                    </span>
                    <span className="stream__arrow">
                      {isCentre ? "Enter" : "Focus"}
                      <ArrowRight />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="streams__dial">
            <button
              type="button"
              className="streams__nudge"
              onClick={() => rotateBy(-1)}
              aria-label="上一条记录线"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M13 13L3.4 3.4M3 8.5V3h5.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                />
              </svg>
            </button>

            <ol className="streams__ticks">
              {ORDER.map((c, i) => {
                const active = mod3(HOME[i]! + rotation) === CENTER;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`streams__tick${active ? " is-active" : ""}`}
                      data-accent={c.id}
                      aria-current={active ? "true" : undefined}
                      onClick={() => bringToCentre(i)}
                    >
                      <span aria-hidden="true">{c.index}</span>
                      <span className="sr-only">{c.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              className="streams__nudge"
              onClick={() => rotateBy(1)}
              aria-label="下一条记录线"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 3l9.6 9.6M13 7.5V13H7.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                />
              </svg>
            </button>

            <p className="label streams__hint">
              按住拖拽切换 · 当前 {centred?.titleEn}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
