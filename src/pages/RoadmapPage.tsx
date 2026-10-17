import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import {
  bridges,
  clusterById,
  clusterOrder,
  levels,
  requiresMap,
  roadmapErrors,
  roadmapSource,
  skillById,
  skillGraph,
  tally,
  type Skill,
} from "../content/roadmap";
import { ancestorsOf, descendantsOf } from "../lib/dag";
import { gsap, setupGsap } from "../lib/gsapSetup";
import {
  NODE_H,
  crossPath,
  fitColumns,
  layoutCards,
  pack,
  type Box,
} from "../lib/roadmapLayout";
import { roadmap, site } from "../site.config";

/**
 * The roadmap: every group as its own clump, the clumps packed together.
 *
 * Inside a clump, a topic sits in the column after everything it needs, so
 * each one reads left to right as a small tech tree. Chains of single steps
 * run in a straight line; a topic with several prerequisites sits between
 * them. Where it all goes is worked out in `lib/roadmapLayout.ts`.
 *
 * The clumps sit close but apart, each on its own field: close because they
 * are one body of knowledge, apart because they hardly touch. The edges
 * between groups are shown only for the chain being looked at. Drawn all the
 * time, seventeen long curves would cross every clump on the page.
 */

/** Laid out once. Only how the clumps are packed depends on the screen. */
const cards = layoutCards(skillGraph, clusterOrder);

export function RoadmapPage() {
  const root = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  /**
   * Two sources for the topic being shown. `hovered` follows the pointer and
   * keyboard focus, and clears the moment either leaves the box; `locked` is
   * set by a click and holds until another click moves or releases it. A lock
   * wins, so while one is set the highlighted chain stays put however the
   * pointer moves.
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const focus = locked ?? hovered;

  /** Two columns of clumps where they fit; measured, so it follows the window. */
  const [columns, setColumns] = useState(2);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      // Hidden under 900px, where the list view takes over: keep the last
      // value rather than packing for a width of 0.
      if (el.clientWidth > 0) setColumns(fitColumns(cards, el.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const counts = useMemo(() => tally(), []);
  const sheet = useMemo(() => pack(cards, columns), [columns]);

  const highlight = useMemo(() => {
    if (!focus) return null;
    return {
      up: ancestorsOf(focus, requiresMap),
      down: descendantsOf(focus, requiresMap),
    };
  }, [focus]);

  const inChain = (id: string): boolean =>
    !!highlight &&
    (id === focus || highlight.up.has(id) || highlight.down.has(id));

  const roleOf = (id: string): string => {
    if (!highlight) return "idle";
    if (id === focus) return "focus";
    if (highlight.up.has(id)) return "prereq";
    if (highlight.down.has(id)) return "unlocks";
    return "dim";
  };

  /**
   * Lit when both ends are on the chain. Lighting an edge with only one end
   * on it points at a dimmed box, which reads as a bug.
   */
  const wireClass = (from: string, to: string, crossing: boolean): string => {
    const lit = highlight ? inChain(from) && inChain(to) : false;
    return `rm__edge${crossing ? " is-crossing" : ""}${lit ? " is-active" : ""}${
      highlight && !lit ? " is-dim" : ""
    }`;
  };

  /**
   * Clicking a topic locks it, which also moves a lock off whatever held it.
   * Clicking the locked one again releases it.
   *
   * Releasing clears the hover too. The pointer is still on that box, so
   * otherwise the highlight would pass straight from the lock to the hover
   * on the same box, and the second click would look like it did nothing.
   * The hover comes back once the pointer leaves the box and returns.
   */
  const pick = (id: string) => {
    if (locked === id) {
      setLocked(null);
      setHovered(null);
    } else {
      setLocked(id);
    }
  };

  /** Only clears the hover if it is still this box's. */
  const leave = (id: string) => setHovered((h) => (h === id ? null : h));

  /**
   * While something is locked, a click anywhere that is not a topic box
   * releases it, and so does Esc.
   *
   * On the document rather than the canvas so that "anywhere else" really is
   * anywhere, the legend and the text around the canvas included. Topic boxes
   * are skipped by checking the target rather than by stopping propagation,
   * which also covers the click that set the lock: React can attach this
   * listener while that same click is still on its way up.
   *
   * Hover is left alone. It already follows the pointer box by box, so after
   * a release whatever is under the pointer is exactly what should show.
   */
  useEffect(() => {
    if (!locked) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      // The → into an article is skipped too: it navigates away, and
      // releasing the lock first would pull it out from under the click.
      if (
        target instanceof Element &&
        target.closest(".rm__node, .rm__open")
      ) {
        return;
      }
      setLocked(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLocked(null);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [locked]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${roadmap.title} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Transform only, and on the slots rather than the boxes. `opacity` on
      // the boxes is CSS-owned for the dimming, and animating it from both
      // sides once froze them part-way and rendered this page blank.
      gsap.from(".rm__slot", {
        y: 12,
        duration: 0.45,
        ease: "power2.out",
        stagger: 0.008,
        scrollTrigger: { trigger: ".rm__canvas-wrap", start: "top 92%" },
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div className="page page--reading">
      <div className="shell roadmap" ref={root}>
        <header className="blog__masthead">
          <p className="blog__masthead-title">
            {roadmap.title}
            <span className="blog__masthead-en">{roadmap.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">
            {counts.total} Topics
          </span>
        </header>

        <p className="others__intro">{roadmap.intro}</p>

        {roadmapErrors.length > 0 && (
          <div className="rm__errors">
            <p className="label">图数据有问题</p>
            <ul>
              {roadmapErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <dl className="rm__tally">
          <div>
            <dt className="label">平均掌握</dt>
            <dd className="index-num">
              {counts.average.toFixed(1)}
              <span className="rm__tally-of">/10</span>
            </dd>
          </div>
          <div>
            <dt className="label">未开始</dt>
            <dd className="index-num">{counts.untouched}</dd>
          </div>
          <div>
            <dt className="label">跨组依赖</dt>
            <dd className="index-num">{bridges.length}</dd>
          </div>
        </dl>

        <ul className="rm__legend">
          {clusterOrder.map((id) => {
            const meta = clusterById.get(id)!;
            return (
              <li key={id} data-tone={meta.tone}>
                <span className="rm__swatch" aria-hidden="true" />
                {meta.title}
              </li>
            );
          })}
        </ul>

        {/* The colour key, and under it what the numbers mean. Both stay on
            narrow screens, unlike the group legend: the list view shows
            "掌握 6/10" and the same swatches. */}
        <div className="rm__scale">
          <span className="label">掌握程度</span>
          <span className="rm__scale-end">0</span>
          <span className="rm__scale-bar" aria-hidden="true">
            {levels.map((n) => (
              <span className="rm__scale-cell" data-level={n} key={n} />
            ))}
          </span>
          <span className="rm__scale-end">10</span>
        </div>

        <p className="rm__hint label">
          1 为略有了解，知道如何开始学习；
          2~3 为可以进行进一步学习之后了解如何投入工程的知识水平；
          4~5 为可以投入工程，但是需要再进行一些 study；
          6~8 为可以立刻投入使用当中；
          9~10 为精通。
        </p>

        <p className="rm__note label">
          悬停或点击一项，看它的前置和后续；跨组的连线只在这时出现。带圆点的项点击锁定后，点框里的 → 读文章。
        </p>

        <div className="rm__canvas-wrap" ref={wrap}>
          <div
            className="rm__canvas"
            style={
              {
                width: `${sheet.width}px`,
                height: `${sheet.height}px`,
              } as CSSProperties
            }
          >
            {/* Fields first, so everything else sits on top of them. */}
            {sheet.cards.map(({ card, x, y }) => {
              const meta = clusterById.get(card.id)!;
              return (
                <div
                  className="rm__field"
                  key={card.id}
                  data-tone={meta.tone}
                  style={
                    {
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${card.w}px`,
                      height: `${card.h}px`,
                    } as CSSProperties
                  }
                >
                  <span className="rm__field-name">
                    {meta.title}
                    <span className="rm__field-en">{meta.titleEn}</span>
                  </span>
                </div>
              );
            })}

            <svg
              className="rm__wires"
              viewBox={`0 0 ${sheet.width} ${sheet.height}`}
              aria-hidden="true"
              focusable="false"
            >
              {sheet.cards.map(({ card, x, y }) => (
                <g key={card.id} transform={`translate(${x} ${y})`}>
                  {card.wires.map((wire) => (
                    <path
                      key={`${wire.from}->${wire.to}`}
                      className={wireClass(wire.from, wire.to, false)}
                      d={wire.d}
                    />
                  ))}
                </g>
              ))}

              {/* Between groups. Always in the DOM so they can fade both
                  ways; CSS keeps them invisible until they are lit. */}
              {bridges.map(({ from, to }) => {
                const a = sheet.at.get(from);
                const b = sheet.at.get(to);
                if (!a || !b) return null;
                return (
                  <path
                    key={`${from}->${to}`}
                    className={wireClass(from, to, true)}
                    d={crossPath(a, b)}
                  />
                );
              })}
            </svg>

            {skillGraph.map((skill) => {
              const box = sheet.at.get(skill.id);
              if (!box) return null;
              return (
                <NodeBox
                  key={skill.id}
                  skill={skill}
                  box={box}
                  role={roleOf(skill.id)}
                  isLocked={locked === skill.id}
                  onHover={() => setHovered(skill.id)}
                  onLeave={() => leave(skill.id)}
                  onPick={() => pick(skill.id)}
                />
              );
            })}
          </div>
        </div>

        {/* Under 900px the canvas is wider than the screen and the curves stop
            being legible, so the same graph is stated in words. */}
        <div className="rm__list-view">
          {clusterOrder.map((id) => {
            const meta = clusterById.get(id)!;
            const own = skillGraph.filter((s) => s.cluster === id);
            return (
              <section key={id} data-tone={meta.tone}>
                <p className="toc__heading">
                  <span className="toc__heading-label">{meta.title}</span>
                  <span className="toc__heading-rule" aria-hidden="true" />
                  <span className="toc__heading-count">
                    {String(own.length).padStart(2, "0")}
                  </span>
                </p>
                <ol className="rm__list">
                  {own.map((skill) => (
                    <li className="rm__row" key={skill.id}>
                      <span className="rm__row-head">
                        <span className="rm__row-title">{skill.label}</span>
                        <span className="label rm__row-level">
                          <span
                            className="rm__row-swatch"
                            data-level={skill.level}
                            aria-hidden="true"
                          />
                          掌握 {skill.level}/10
                        </span>
                      </span>
                      {skill.requires.length > 0 && (
                        <span className="rm__row-reqs label">
                          需要 ·{" "}
                          {skill.requires
                            .map((rid) => {
                              const dep = skillById.get(rid);
                              if (!dep) return rid;
                              return dep.cluster === skill.cluster
                                ? dep.label
                                : `${dep.label}↗`;
                            })
                            .join("、")}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>

        <div className="note__foot">
          <Link to={roadmapSource.to} className="toc__back">
            ← 这些掌握程度背后的经历：{roadmapSource.title}
          </Link>
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function NodeBox({
  skill,
  box,
  role,
  isLocked,
  onHover,
  onLeave,
  onPick,
}: {
  skill: Skill;
  box: Box;
  role: string;
  isLocked: boolean;
  onHover: () => void;
  onLeave: () => void;
  onPick: () => void;
}) {
  const meta = clusterById.get(skill.cluster)!;
  // `requires` already holds labels, so there is nothing to look up.
  const reqs = skill.requires.join("、");

  const shared = {
    className: "rm__node",
    // Widens the right padding for the dot; see LINK_ROOM.
    "data-linked": skill.link ? "true" : undefined,
    "data-role": role,
    style: { width: `${box.w}px`, height: `${NODE_H}px` } as CSSProperties,
    onMouseEnter: onHover,
    onMouseLeave: onLeave,
    onFocus: onHover,
    onBlur: onLeave,
    title: [`${skill.label} · 掌握 ${skill.level}/10`, reqs && `需要：${reqs}`]
      .filter(Boolean)
      .join("\n"),
  };

  const body = (
    <>
      <span className="rm__node-label">{skill.label}</span>
      {/* On the canvas the level is only a colour; this says it in words. */}
      <span className="sr-only">，掌握 {skill.level}/10</span>
      {skill.link && !isLocked && (
        <span className="rm__node-dot" aria-hidden="true" />
      )}
    </>
  );

  return (
    // The slot carries position, group tone and level, so the → below
    // inherits the same colours as the box it sits in.
    <div
      className="rm__slot"
      data-tone={meta.tone}
      data-level={skill.level}
      style={{ left: `${box.x}px`, top: `${box.y}px` } as CSSProperties}
    >
      {skill.link ? (
        <Link
          to={skill.link}
          {...shared}
          onClick={(event) => {
            // A plain click locks and releases like any other box; with a
            // pointer, the article opens from the → that takes the dot's
            // place while the box is locked. Two kinds of click still go
            // through as the link this is: keyboard activation (detail is
            // 0), and a modified click asking for a new tab or window.
            if (
              event.detail === 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            onPick();
          }}
        >
          {body}
        </Link>
      ) : (
        // A button rather than a focusable div: Enter and Space work, the
        // locked state is announced, and the cursor says it can be clicked.
        <button
          type="button"
          {...shared}
          aria-pressed={isLocked}
          onClick={onPick}
        >
          {body}
        </button>
      )}

      {/* The way into a locked topic's article. A second click on the box
          releases it, so the article needs a target of its own. */}
      {skill.link && isLocked && (
        <Link
          to={skill.link}
          className="rm__open"
          aria-label={`读文章：${skill.label}`}
          title="读文章"
        >
          →
        </Link>
      )}
    </div>
  );
}
