import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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

/**
 * Decorative marks scattered behind the ring.
 *
 * Positions are hand placed, not random. The cards are opaque, so anything
 * dropped in the middle is simply never seen; the ring occupies roughly
 * x 19–81%, which leaves the two side bands plus a block at the upper left and
 * another at the lower right — the diagonal opposite the ring's own
 * lower-left/upper-right axis. Keeping the marks there turns them into a
 * constellation in the margin rather than a texture behind the content.
 *
 * `d` is the breathing duration in seconds and `t` a negative delay, so the
 * marks are already out of step on the first frame instead of pulsing in
 * unison.
 */
interface Spark {
  x: number;
  y: number;
  /** Dot diameter in px; ignored by crosses. */
  s: number;
  tone: "ink" | "fjord" | "clay" | "birch";
  d: number;
  t: number;
  cross?: true;
}

const SPARKS: Spark[] = [
  // Left band
  { x: 4.5, y: 14, s: 2, tone: "ink", d: 6.5, t: -0.4 },
  { x: 9, y: 27, s: 1, tone: "ink", d: 8, t: -3.1 },
  { x: 3, y: 41, s: 3, tone: "fjord", d: 5.5, t: -1.8, cross: true },
  { x: 12.5, y: 52, s: 1, tone: "ink", d: 7.2, t: -4.6 },
  { x: 6, y: 68, s: 2, tone: "clay", d: 6, t: -2.3 },
  { x: 14, y: 79, s: 1, tone: "ink", d: 9, t: -5.9 },
  { x: 8, y: 91, s: 2, tone: "ink", d: 7.8, t: -0.9 },

  // Upper-left block, above the lower-left card
  { x: 22, y: 7, s: 1, tone: "ink", d: 7.5, t: -2.7 },
  { x: 31, y: 17, s: 2, tone: "birch", d: 6.2, t: -5.2 },
  { x: 26.5, y: 28, s: 3, tone: "clay", d: 5.8, t: -3.6, cross: true },
  { x: 37, y: 5, s: 1, tone: "ink", d: 8.6, t: -1.2 },
  { x: 19, y: 22, s: 1, tone: "fjord", d: 6.8, t: -6.4 },

  // Thin strips above and below the centre card
  { x: 47, y: 3.5, s: 2, tone: "ink", d: 7, t: -4.1 },
  { x: 55, y: 96, s: 1, tone: "ink", d: 8.2, t: -2.0 },

  // The lower-right block is left clear on purpose — the elk constellation
  // lives there and loose dots around it only read as noise.

  // Right band
  { x: 87, y: 11, s: 2, tone: "ink", d: 6.9, t: -2.9 },
  { x: 94, y: 24, s: 1, tone: "clay", d: 8.4, t: -4.8 },
  { x: 90, y: 45, s: 3, tone: "ink", d: 5.6, t: -1.1, cross: true },
  { x: 96.5, y: 58, s: 1, tone: "ink", d: 7.7, t: -6.1 },
  { x: 88, y: 76, s: 2, tone: "birch", d: 6.4, t: -3.3 },
  { x: 95, y: 89, s: 1, tone: "ink", d: 8.8, t: -1.9 },
];

/**
 * Elk constellation, as points and edges in a 160×120 field.
 *
 * Inline SVG rather than an image: it is a list of coordinates, it stays crisp
 * at any size, it takes its colour from the design tokens, and every star can
 * breathe on its own. A raster would be a separate hashed asset that can do
 * none of that.
 *
 * Three things make the figure read as a deer rather than a stick man, and the
 * first attempt had none of them:
 *
 *   1. The body is a closed outline — back, chest, belly and rump enclose an
 *      area. A single spine line reads as a skeleton.
 *   2. Four legs, each with a joint, and the rear pair carries the hock bend
 *      that is specific to deer.
 *   3. The antlers are a dense thicket of short branches. They hold most of
 *      the line count on purpose; they are what the eye identifies first.
 *
 * The stance is deliberately horizontal. The clear block this sits in is wider
 * than it is tall, so an upright deer would not fit without shrinking the
 * whole figure into mush.
 */
const ELK_POINTS = {
  // Closed body outline, facing right. Roughly 3:1 long to deep — a shorter
  // torso than this reads as a dog.
  withers: [88, 50],
  backMid: [66, 47],
  rumpTop: [40, 50],
  rumpBack: [30, 58],
  bellyRear: [40, 70],
  bellyMid: [64, 73],
  chestLow: [88, 70],
  chestFront: [95, 58],

  // Neck as a clean four-sided wedge. The first attempt also ran a jaw line
  // back into the neck, which put three strokes through one small area and
  // turned the head into a knot.
  neckBack: [96, 40],
  neckFront: [104, 46],
  head: [112, 30],
  muzzle: [124, 34],

  // Antlers: two beams sweeping back and forward with spikes off each, plus a
  // crown between them. Their total span is held close to the torso length;
  // wider than that and the animal looks like it is carrying an aerial.
  // Weighted backwards, the way an elk's rack actually sits: the back beam
  // reaches further than the front one, so the mass sits over the body
  // instead of hanging out in front of the nose.
  antlerBase: [110, 23],
  beamB1: [99, 18],
  beamB2: [86, 13],
  beamB3: [73, 9],
  spikeB1: [97, 9],
  spikeB2: [83, 5],
  spikeB3: [69, 4],
  beamF1: [119, 19],
  beamF2: [128, 14],
  beamF3: [136, 10],
  spikeF1: [120, 10],
  spikeF2: [130, 6],
  spikeF3: [138, 4],
  crownLow: [110, 15],
  crownTip: [109, 5],

  // Legs run nearly twice the torso depth and sit at the ends of the body,
  // which is most of what separates a deer from a sheep.
  foreNearKnee: [90, 90],
  foreNearHoof: [88, 112],
  foreFarKnee: [78, 88],
  foreFarHoof: [74, 110],
  hindNearKnee: [38, 88],
  hindNearHock: [45, 99],
  hindNearHoof: [41, 113],
  hindFarKnee: [56, 89],
  hindFarHoof: [58, 111],

  tail: [25, 46],
} as const;

type ElkPoint = keyof typeof ELK_POINTS;

const ELK_EDGES: Array<[ElkPoint, ElkPoint]> = [
  // Body, closed
  ["withers", "backMid"],
  ["backMid", "rumpTop"],
  ["rumpTop", "rumpBack"],
  ["rumpBack", "bellyRear"],
  ["bellyRear", "bellyMid"],
  ["bellyMid", "chestLow"],
  ["chestLow", "chestFront"],
  ["chestFront", "withers"],

  // Neck and head
  ["withers", "neckBack"],
  ["neckBack", "head"],
  ["chestFront", "neckFront"],
  ["neckFront", "head"],
  ["head", "muzzle"],

  // Antlers
  ["head", "antlerBase"],
  ["antlerBase", "beamB1"],
  ["beamB1", "beamB2"],
  ["beamB2", "beamB3"],
  ["beamB1", "spikeB1"],
  ["beamB2", "spikeB2"],
  ["beamB3", "spikeB3"],
  ["antlerBase", "beamF1"],
  ["beamF1", "beamF2"],
  ["beamF2", "beamF3"],
  ["beamF1", "spikeF1"],
  ["beamF2", "spikeF2"],
  ["beamF3", "spikeF3"],
  ["antlerBase", "crownLow"],
  ["crownLow", "crownTip"],

  // Legs
  ["chestLow", "foreNearKnee"],
  ["foreNearKnee", "foreNearHoof"],
  ["chestLow", "foreFarKnee"],
  ["foreFarKnee", "foreFarHoof"],
  ["bellyRear", "hindNearKnee"],
  ["hindNearKnee", "hindNearHock"],
  ["hindNearHock", "hindNearHoof"],
  ["bellyRear", "hindFarKnee"],
  ["hindFarKnee", "hindFarHoof"],

  // Tail
  ["rumpTop", "tail"],
];

/** Brightest: silhouette corners, antler tips, hooves. */
const ELK_BRIGHT = new Set<ElkPoint>([
  "withers",
  "rumpTop",
  "bellyMid",
  "head",
  "muzzle",
  "spikeB3",
  "spikeF3",
  "crownTip",
  "foreNearHoof",
  "hindNearHoof",
]);

/** Mid-weight: joints where a line changes direction. */
const ELK_MID = new Set<ElkPoint>([
  "backMid",
  "chestLow",
  "chestFront",
  "bellyRear",
  "rumpBack",
  "antlerBase",
  "beamB1",
  "beamB3",
  "beamF1",
  "beamF3",
  "foreNearKnee",
  "hindNearHock",
  "foreFarHoof",
  "hindFarHoof",
]);

const ELK_NAMES = Object.keys(ELK_POINTS) as ElkPoint[];

function ElkConstellation() {
  return (
    <svg
      className="elk"
      viewBox="0 0 160 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {ELK_EDGES.map(([a, b], i) => {
        const from = ELK_POINTS[a];
        const to = ELK_POINTS[b];
        return (
          <line
            key={i}
            className="elk__link"
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
          />
        );
      })}

      {ELK_NAMES.map((name, i) => {
        const [x, y] = ELK_POINTS[name];
        return (
          <circle
            key={name}
            className="elk__star"
            cx={x}
            cy={y}
            r={ELK_BRIGHT.has(name) ? 1.9 : ELK_MID.has(name) ? 1.4 : 1}
            style={
              {
                // Spread over a 7s cycle so neighbours never pulse together.
                "--spark-delay": `${-((i * 1.37) % 7).toFixed(2)}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </svg>
  );
}

function Sparks() {
  return (
    <div className="streams__sparks" aria-hidden="true">
      <ElkConstellation />

      {SPARKS.map((spark, i) => (
        <span
          key={i}
          className={`spark${spark.cross ? " spark--cross" : ""}`}
          data-tone={spark.tone}
          style={{
            left: `${spark.x}%`,
            top: `${spark.y}%`,
            "--spark-size": `${spark.s}px`,
            "--spark-dur": `${spark.d}s`,
            "--spark-delay": `${spark.t}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
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
    /** Whether this gesture took *explicit* capture (mouse only, see below). */
    captured: false,
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
    d.captured = false;
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
      //
      // Mouse only. Touch and pen pointers are already captured implicitly by
      // their pointerdown target, which here is the card's own <a>. Calling
      // setPointerCapture on the stage would *move* that capture, and the
      // browser announces the handoff with a `lostpointercapture` on the <a>
      // that bubbles up to this very stage. That used to land on endDrag and
      // tear the gesture down roughly 10px in, which is why dragging worked
      // with a mouse and did nothing under a finger.
      if (event.pointerType === "mouse") {
        try {
          stageRef.current?.setPointerCapture(event.pointerId);
          d.captured = true;
        } catch {
          /* capture is best effort */
        }
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
    if (d.captured) {
      d.captured = false;
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

    // The constellation draws itself when the section comes into view. Each
    // edge is dashed by its own measured length, so the stroke travels the
    // line instead of fading in place.
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 861px)", () => {
      const links = gsap.utils.toArray<SVGLineElement>(".elk__link");
      links.forEach((line) => {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      });

      gsap.to(links, {
        strokeDashoffset: 0,
        duration: 0.9,
        stagger: 0.07,
        ease: "power2.inOut",
        scrollTrigger: { trigger: ".streams__carousel", start: "top 78%" },
      });

      gsap.from(".elk__star", {
        opacity: 0,
        scale: 0.4,
        duration: 0.5,
        stagger: 0.05,
        ease: "power2.out",
        scrollTrigger: { trigger: ".streams__carousel", start: "top 78%" },
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

      // The marks drift the other way, which is what separates them into
      // their own depth instead of looking stuck to the cards.
      gsap.to(".streams__sparks", {
        yPercent: 9,
        ease: "none",
        scrollTrigger: {
          trigger: ".streams__carousel",
          start: "top bottom",
          end: "bottom top",
          scrub: 1.1,
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
            // pointerup and pointercancel are the only two ways a gesture
            // ends, and the spec dispatches lostpointercapture *after* both of
            // them — so listening for it adds nothing and, on touch, fires
            // mid-gesture when implicit capture changes hands. See the note in
            // onPointerMove.
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <Sparks />

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

          </div>
        </div>
      </div>
    </section>
  );
}
