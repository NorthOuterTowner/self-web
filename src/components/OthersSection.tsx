import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { allNotes, notePath } from "../content";
import { formatDate, type Note } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import {
  dayNumber,
  scaleFrom,
  separate,
  yearTicks,
  type Placed,
} from "../lib/scales";
import { noteKindById, others, type NoteKindId } from "../site.config";

/**
 * The notes field: every scattered piece as one point of light.
 *
 * This is a scatter plot wearing a starfield. Position is not decorative —
 * horizontal is the date it was written, vertical is how long it is — which is
 * what keeps it on the right side of the line from the rest of the site: a
 * field of randomly placed dots would be a lottery you click at, with no way
 * to find a piece again or to see that you wrote nothing all spring.
 *
 * The points breathe but do not drift, matching the marks already behind the
 * card ring. Drift is the one thing here that would actually fight the grid.
 */

/** Gap between a star and its popover, and the popover's margin to the edge. */
const GAP = 14;
const EDGE = 12;

interface Point extends Placed<Note> {
  tone: string;
  /** Dot radius in px, from the note's length. Shorter notes are smaller. */
  size: number;
  /** Negative delay so neighbours never breathe in step. */
  delay: number;
}

/**
 * One star plus its popover.
 *
 * The popover is the platform's own: `popover="auto"` brings light-dismiss,
 * Esc, top-layer stacking and "opening one closes the other" with no code.
 * What it does not bring is placement — CSS anchor positioning is still not
 * everywhere — so the position is written on open from the star's rect, and
 * kept in step while the page scrolls underneath.
 */
function NoteStar({ point, index }: { point: Point; index: number }) {
  const note = point.item;
  const starRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = `note-pop-${note.slug}`;
  const kind = noteKindById[note.kind as NoteKindId];

  useEffect(() => {
    const star = starRef.current;
    const pop = popRef.current;
    if (!star || !pop) return;

    const place = () => {
      const s = star.getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      const cx = s.left + s.width / 2;
      const cy = s.top + s.height / 2;

      // Prefer down-right of the star, flip when that would run off screen.
      let left = cx + GAP;
      if (left + p.width > window.innerWidth - EDGE) {
        left = cx - GAP - p.width;
      }
      let top = cy + GAP;
      if (top + p.height > window.innerHeight - EDGE) {
        top = cy - GAP - p.height;
      }

      pop.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - p.width - EDGE))}px`;
      pop.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - p.height - EDGE))}px`;
    };

    // `toggle` does not bubble, so this is wired per popover rather than
    // delegated — and through addEventListener rather than a React prop, so it
    // does not depend on how the running React version maps the event.
    const onToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === "open";
      if (!open) {
        window.removeEventListener("scroll", place);
        window.removeEventListener("resize", place);
        return;
      }
      place();
      // The popover is in the top layer, so it is positioned against the
      // viewport and has to be re-placed as the field scrolls past.
      window.addEventListener("scroll", place, { passive: true });
      window.addEventListener("resize", place, { passive: true });
    };

    pop.addEventListener("toggle", onToggle);
    return () => {
      pop.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        ref={starRef}
        className="note-star"
        data-tone={point.tone}
        popoverTarget={id}
        style={
          {
            left: `${point.x * 100}%`,
            top: `${point.y * 100}%`,
            "--star-size": `${point.size}px`,
            "--star-delay": `${point.delay}s`,
          } as CSSProperties
        }
      >
        <span className="sr-only">
          {kind.title}：{note.title}
          {note.author ? `，${note.author}` : ""}，{formatDate(note.date)}，
          {note.chars} 字
        </span>
      </button>

      <div
        ref={popRef}
        id={id}
        popover="auto"
        className="note-pop"
        data-tone={point.tone}
      >
        <span className="note-pop__accent" aria-hidden="true" />

        <div className="note-pop__top">
          <span className="index-num">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="label">{kind.titleEn}</span>
          <span className="note-pop__dot" aria-hidden="true" />
        </div>

        <p className="note-pop__title">{note.title}</p>
        {/* Attribution sits directly under the title, before the standfirst:
            whose words these are changes how the next line reads. */}
        {note.author && <p className="note-pop__author">{note.author}</p>}
        {note.lede && <p className="note-pop__lede">{note.lede}</p>}

        {note.tags.length > 0 && (
          <ul className="note-pop__tags">
            {note.tags.slice(0, 3).map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}

        <div className="note-pop__foot">
          <span className="label note-pop__meta">
            {formatDate(note.date)} · {note.chars} 字
          </span>
          <Link to={notePath(note)} className="note-pop__read label">
            Read →
          </Link>
        </div>
      </div>
    </>
  );
}

export function OthersSection() {
  const root = useRef<HTMLElement>(null);

  /**
   * Domains are measured from the notes, padded outwards, and only then used
   * to place anything — so the field fills itself at any size of collection
   * and nothing ends up sitting on a rule. See `lib/scales.ts`.
   */
  const { points, xTicks, yLabels } = useMemo(() => {
    const days = allNotes.map((n) => dayNumber(n.date));
    const lengths = allNotes.map((n) => n.chars);

    // A week of headroom at minimum on the time axis, five characters on the
    // length axis — enough that a single note is not pinned to a corner.
    const x = scaleFrom(days, { pad: 0.1, minPad: 7 });
    const y = scaleFrom(lengths, { pad: 0.14, minPad: 5, floor: 0 });

    const longest = Math.max(1, ...lengths);

    const raw: Point[] = allNotes.map((note, i) => ({
      item: note,
      x: x.t(dayNumber(note.date)),
      // Short notes ride high: the vertical axis counts upwards from nothing.
      y: y.t(note.chars),
      tone: noteKindById[note.kind as NoteKindId].tone,
      size: 2 + Math.round((note.chars / longest) * 3),
      delay: -Number(((i * 1.37) % 7).toFixed(2)),
    }));

    return {
      // Data first, then the smallest nudge that keeps every dot hittable.
      points: separate(raw, 0.05).map((p, i) => ({ ...raw[i]!, x: p.x, y: p.y })),
      xTicks: yearTicks(x),
      yLabels: {
        top: Math.max(0, Math.round(y.min)),
        bottom: Math.round(y.max),
      },
    };
  }, []);

  useEffect(() => {
    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".others__head > *", {
        y: 26,
        opacity: 0,
        duration: 0.85,
        stagger: 0.09,
        scrollTrigger: { trigger: ".others__head", start: "top 86%" },
      });

      gsap.from(".others__frame", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: ".others__frame", start: "top 86%" },
      });

      // The stars arrive in date order, so the field draws itself left to
      // right and the time axis is legible before you read the labels.
      gsap.from(".note-star", {
        scale: 0,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
        stagger: { each: 0.03, from: "start" },
        scrollTrigger: { trigger: ".others__frame", start: "top 78%" },
      });
    });

    return () => mm.revert();
  }, []);

  if (allNotes.length === 0) return null;

  return (
    <section
      className="others"
      id="others"
      ref={root}
      aria-labelledby="others-title"
    >
      <div className="shell">
        <div className="others__head section-head">
          <span className="label label--ink">{others.titleEn}</span>
          <h2 className="section-head__title" id="others-title">
            {others.title}
          </h2>
          <span className="label section-head__meta">
            {String(allNotes.length).padStart(2, "0")} / Notes
          </span>
        </div>

        <p className="others__intro">{others.intro}</p>

        {/* ---- The field. Swapped for a list below 760px, where a 5px
                target is not something a finger can hit. ---- */}
        <div className="others__frame">
          <p className="others__axis-note label">{others.axisNote}</p>

          <div className="others__plot">
            <div className="others__y-axis" aria-hidden="true">
              <span>{yLabels.top} 字</span>
              <span>{yLabels.bottom} 字</span>
            </div>

            <div className="others__field">
              {points.map((point, i) => (
                <NoteStar key={point.item.slug} point={point} index={i} />
              ))}
            </div>
          </div>

          <div className="others__x-axis" aria-hidden="true">
            {xTicks.map((tick) => (
              <span
                className="others__tick"
                key={tick.label}
                style={{ left: `${tick.at * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        {/* The list is not a fallback bolted on afterwards: it is the same
            notes, and on a narrow screen or with motion turned down it is the
            primary view. */}
        <ol className="others__list">
          {allNotes.map((note) => {
            const kind = noteKindById[note.kind as NoteKindId];
            return (
              <li key={note.slug}>
                <Link
                  to={notePath(note)}
                  className="others__row"
                  data-tone={kind.tone}
                >
                  <span className="others__row-kind label">{kind.title}</span>
                  <span className="others__row-title">
                    {note.title}
                    {note.author && (
                      <span className="others__row-author">{note.author}</span>
                    )}
                  </span>
                  <span className="others__row-meta label">
                    {formatDate(note.date)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="others__foot">
          <Link to={`/${others.slug}`} className="others__all label">
            All notes →
          </Link>
        </div>
      </div>
    </section>
  );
}
