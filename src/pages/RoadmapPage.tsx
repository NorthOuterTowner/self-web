import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  bridges,
  clusterById,
  clusterOrder,
  levels,
  requiresMap,
  roadmapSource,
  skillById,
  skillGraph,
  skillLayout,
  tally,
  type ClusterId,
  type Skill,
} from "../content/roadmap";
import { ancestorsOf, descendantsOf } from "../lib/dag";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { roadmap, site } from "../site.config";

/**
 * The roadmap: one canvas, clustered.
 *
 * Rows are global — layer N means "N steps of prerequisites deep" everywhere
 * on the figure — so an edge between two clusters is a real curve like any
 * other. Columns are banded by cluster, so each group occupies a vertical
 * territory and the groups sit side by side as neighbours.
 *
 * What makes a group read as a group is a faint field behind it plus the
 * proximity of its members, not a rule across the page. A divider would say
 * "these are separate figures"; they are not — the edges between groups are
 * the point, and they have to stay visible.
 *
 * Nothing in the geometry is random. Box widths come from label length and
 * odd columns sit slightly lower, which is enough to break the grid without
 * the figure changing between renders.
 */

/** One line of label plus the box's padding. */
const NODE_H = 36;
const GAP_X = 18;
const GAP_Y = 58;
const ROW = NODE_H + GAP_Y;
/** Odd columns drop by this much, for rhythm. */
const BRICK = 14;
/** Space between two clusters' bands. Close enough to read as adjacent. */
const BAND_GAP = 52;
/** Breathing room between a cluster's nodes and its field's edge. */
const HULL_PAD = 20;

/**
 * Low on purpose. A floor near 112px was room for an English second line; with
 * only the label to fit, a high floor would give every short name — C, Git,
 * Qt, DOM — the same box, and the graph would go back to the uniform grid
 * the varied widths are there to break up.
 */
const MIN_W = 56;

/**
 * A box's horizontal chrome. Must match `.rm__node` in roadmap.css: 12px of
 * padding each side, a 2px rule on the left and a 1px rule on the right.
 *
 * Exactness matters here. A Chinese name is exactly 13px a character, so the
 * estimate below is exact for it, and a chrome figure one short — this was 26
 * — leaves every all-Chinese box 1px narrower than its own name: the browser
 * swaps the last character for an ellipsis.
 */
const CHROME = 12 + 12 + 2 + 1;

/** Extra right padding on a box with an article, to keep its dot clear. */
const DOT_ROOM = 8;

/** Rough advance width in em: CJK is full width, Latin about half. */
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  }
  return w;
}

/**
 * A box's width, for placing it.
 *
 * Still a guess for Latin names: real widths depend on the visitor's font,
 * and capitals run wider than half an em, so a name like MongoDB can need a
 * few pixels more. That cannot cut a label off any more — `.rm__node` has
 * `min-width: max-content`, so the box grows to fit — it only eats into the
 * gap to the next box.
 *
 * No upper clamp, for the same reason: a clamp here would only make the
 * placement wrong, since the box would grow past it anyway.
 */
function widthOf(skill: Skill): number {
  const text = Math.ceil(textWidth(skill.label) * 13);
  return Math.max(MIN_W, text + CHROME + (skill.link ? DOT_ROOM : 0));
}

interface Spot {
  x: number;
  y: number;
  w: number;
}

interface Hull {
  id: ClusterId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bands the global layout by cluster.
 *
 * Each cluster gets a horizontal band as wide as its busiest row. Within a
 * row, that cluster's nodes are centred inside its own band, which is what
 * keeps a group together vertically even where it only has one node in a
 * given row.
 */
function place() {
  const layerOf = new Map<string, number>();
  const slotOf = new Map<string, number>();
  for (const p of skillLayout.nodes) {
    layerOf.set(p.node.id, p.layer);
    // The global barycentre order is kept as the within-band order, so
    // related nodes stay near each other inside a cluster too.
    slotOf.set(p.node.id, p.slot);
  }

  const runs = new Map<string, Skill[]>();
  const key = (cluster: ClusterId, layer: number) => `${cluster}:${layer}`;

  for (const skill of skillGraph) {
    const k = key(skill.cluster, layerOf.get(skill.id) ?? 0);
    const run = runs.get(k) ?? [];
    run.push(skill);
    runs.set(k, run);
  }
  for (const run of runs.values()) {
    run.sort((a, b) => (slotOf.get(a.id) ?? 0) - (slotOf.get(b.id) ?? 0));
  }

  const runWidth = (run: Skill[]) =>
    run.reduce((sum, s) => sum + widthOf(s) + GAP_X, 0) - GAP_X;

  // Band width = widest row this cluster has anywhere.
  const bandW = new Map<ClusterId, number>();
  for (const cluster of clusterOrder) {
    let widest = MIN_W;
    for (let layer = 0; layer < skillLayout.layers; layer++) {
      const run = runs.get(key(cluster, layer));
      if (run) widest = Math.max(widest, runWidth(run));
    }
    bandW.set(cluster, widest);
  }

  const bandX = new Map<ClusterId, number>();
  let cursor = 0;
  for (const cluster of clusterOrder) {
    bandX.set(cluster, cursor);
    cursor += bandW.get(cluster)! + BAND_GAP;
  }
  const canvasW = Math.max(0, cursor - BAND_GAP);

  const at = new Map<string, Spot>();
  for (const [k, run] of runs) {
    // Split at the last colon. The layer is a number, but the cluster key is a
    // group's title, and nothing stops a title from containing one.
    const cut = k.lastIndexOf(":");
    const cluster: ClusterId = k.slice(0, cut);
    const layer = Number(k.slice(cut + 1));
    const band = bandX.get(cluster)!;
    let x = band + (bandW.get(cluster)! - runWidth(run)) / 2;
    run.forEach((skill, i) => {
      const w = widthOf(skill);
      at.set(skill.id, { x, y: layer * ROW + (i % 2) * BRICK, w });
      x += w + GAP_X;
    });
  }

  // A field per cluster, from the bounding box of its own nodes. A box rather
  // than a concave hull: the bands do not interleave, so a box never swallows
  // a neighbour's node, and it stays legible as a quiet backdrop.
  const hulls: Hull[] = [];
  for (const cluster of clusterOrder) {
    const own = skillGraph
      .filter((s) => s.cluster === cluster)
      .map((s) => at.get(s.id))
      .filter((s): s is Spot => !!s);
    if (own.length === 0) continue;

    const x0 = Math.min(...own.map((s) => s.x));
    const x1 = Math.max(...own.map((s) => s.x + s.w));
    const y0 = Math.min(...own.map((s) => s.y));
    const y1 = Math.max(...own.map((s) => s.y + NODE_H));

    hulls.push({
      id: cluster,
      x: x0 - HULL_PAD,
      y: y0 - HULL_PAD,
      w: x1 - x0 + HULL_PAD * 2,
      h: y1 - y0 + HULL_PAD * 2,
    });
  }

  return {
    at,
    hulls,
    canvasW,
    canvasH: skillLayout.layers * ROW - GAP_Y + BRICK,
  };
}

export function RoadmapPage() {
  const root = useRef<HTMLDivElement>(null);

  /**
   * Two sources for the topic being shown. `hovered` follows the pointer and
   * keyboard focus; `locked` is set by a click and holds until another click
   * moves or releases it. A lock wins, so while one is set the highlighted
   * chain stays put however the pointer moves.
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const focus = locked ?? hovered;

  const counts = useMemo(() => tally(), []);
  const geo = useMemo(place, []);

  // The locked topic's article, if it has one, and the box to hang its link
  // under. See `.rm__open`.
  const lockedTopic = locked ? skillById.get(locked) : undefined;
  const lockedLink = lockedTopic?.link;
  const openAt =
    lockedTopic && lockedLink ? geo.at.get(lockedTopic.id) : undefined;

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
   * Clicking a topic locks it, which also moves a lock off whatever held it.
   * Clicking the locked one again releases it.
   *
   * Releasing clears the hover too. The pointer is still on that box, so
   * otherwise the highlight would pass straight from the lock to the hover
   * on the same box, and the second click would look like it did nothing.
   * The hover comes back by itself once the pointer leaves and returns.
   */
  const pick = (id: string) => {
    if (locked === id) {
      setLocked(null);
      setHovered(null);
    } else {
      setLocked(id);
    }
  };

  /**
   * While something is locked, a click anywhere that is not a topic box
   * releases it, and so does Esc.
   *
   * On the document rather than the canvas so that "anywhere else" really is
   * anywhere: a click beside the canvas, on the legend or the text around it,
   * would never reach a canvas listener. Clicks on the fields and wires do
   * land on the canvas, since neither takes pointer events.
   *
   * Topic boxes are skipped by checking the target, not by stopping
   * propagation in their handlers, so the rule lives in one place. That also
   * covers the click that set the lock: React can attach this listener while
   * that same click is still on its way up to the document.
   */
  useEffect(() => {
    if (!locked) return;

    const release = () => {
      setLocked(null);
      // Hover is sticky inside the canvas — it only clears when the pointer
      // leaves it — so without this the last box the pointer crossed would
      // light up the instant the lock let go.
      setHovered(null);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      // The 读文章 link is skipped too: it navigates away, and releasing the
      // lock first would pull the link out from under the click.
      if (
        target instanceof Element &&
        target.closest(".rm__node, .rm__open")
      ) {
        return;
      }
      release();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") release();
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
      // Transform only. `opacity` is CSS-owned here for the hover dimming,
      // and animating it from both sides left staggered nodes frozen
      // part-way — which once rendered this page blank.
      gsap.from(".rm__node", {
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

        {skillLayout.errors.length > 0 && (
          <div className="rm__errors">
            <p className="label">图数据有问题</p>
            <ul>
              {skillLayout.errors.map((err) => (
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

        <div className="rm__canvas-wrap">
          <div
            className="rm__canvas"
            style={
              {
                width: `${geo.canvasW}px`,
                height: `${geo.canvasH}px`,
              } as CSSProperties
            }
            onMouseLeave={() => setHovered(null)}
          >
            {/* Fields first, so everything else sits on top of them. */}
            {geo.hulls.map((hull) => {
              const meta = clusterById.get(hull.id)!;
              return (
                <div
                  className="rm__field"
                  key={hull.id}
                  data-tone={meta.tone}
                  style={
                    {
                      left: `${hull.x}px`,
                      top: `${hull.y}px`,
                      width: `${hull.w}px`,
                      height: `${hull.h}px`,
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
              viewBox={`0 0 ${geo.canvasW} ${geo.canvasH}`}
              aria-hidden="true"
              focusable="false"
            >
              {skillLayout.edges.map(({ from, to }) => {
                const a = geo.at.get(from);
                const b = geo.at.get(to);
                if (!a || !b) return null;

                const x1 = a.x + a.w / 2;
                const y1 = a.y + NODE_H;
                const x2 = b.x + b.w / 2;
                const y2 = b.y;
                const mid = (y2 - y1) / 2;

                const crossing =
                  skillById.get(from)?.cluster !== skillById.get(to)?.cluster;
                // Both ends on the focused chain. Lighting an edge with only
                // one end on it points at a dimmed node, which reads as a bug.
                const lit = highlight ? inChain(from) && inChain(to) : false;

                return (
                  <path
                    key={`${from}->${to}`}
                    className={`rm__edge${crossing ? " is-crossing" : ""}${
                      lit ? " is-active" : ""
                    }${highlight && !lit ? " is-dim" : ""}`}
                    d={`M ${x1} ${y1} C ${x1} ${y1 + mid}, ${x2} ${y2 - mid}, ${x2} ${y2}`}
                  />
                );
              })}
            </svg>

            {skillGraph.map((skill) => {
              const spot = geo.at.get(skill.id);
              if (!spot) return null;
              return (
                <NodeBox
                  key={skill.id}
                  skill={skill}
                  spot={spot}
                  role={roleOf(skill.id)}
                  isLocked={locked === skill.id}
                  onHover={() => setHovered(skill.id)}
                  onPick={() => pick(skill.id)}
                />
              );
            })}

            {/* The way into a locked topic's article. A second click on the
                box releases it, so the article needs a target of its own. */}
            {lockedTopic && lockedLink && openAt && (
              <Link
                to={lockedLink}
                className="rm__open"
                style={
                  {
                    left: `${openAt.x}px`,
                    top: `${openAt.y + NODE_H + 6}px`,
                  } as CSSProperties
                }
              >
                读文章
                <span aria-hidden="true">→</span>
                <span className="sr-only">：{lockedTopic.label}</span>
              </Link>
            )}
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
  spot,
  role,
  isLocked,
  onHover,
  onPick,
}: {
  skill: Skill;
  spot: Spot;
  role: string;
  isLocked: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const meta = clusterById.get(skill.cluster)!;
  // `requires` already holds labels, so there is nothing to look up.
  const reqs = skill.requires.join("、");

  const shared = {
    className: "rm__node",
    "data-tone": meta.tone,
    // Drives the fill. See the level scale in roadmap.css.
    "data-level": skill.level,
    // Widens the right padding for the dot; see DOT_ROOM.
    "data-linked": skill.link ? "true" : undefined,
    "data-role": role,
    style: {
      left: `${spot.x}px`,
      top: `${spot.y}px`,
      width: `${spot.w}px`,
      height: `${NODE_H}px`,
    } as CSSProperties,
    onMouseEnter: onHover,
    onFocus: onHover,
    title: [`${skill.label} · 掌握 ${skill.level}/10`, reqs && `需要：${reqs}`]
      .filter(Boolean)
      .join("\n"),
  };

  const body = (
    <>
      <span className="rm__node-label">{skill.label}</span>
      {/* On the canvas the level is only a colour; this says it in words. */}
      <span className="sr-only">，掌握 {skill.level}/10</span>
      {skill.link && <span className="rm__node-dot" aria-hidden="true" />}
    </>
  );

  if (skill.link) {
    return (
      <Link
        to={skill.link}
        {...shared}
        onClick={(event) => {
          // A plain click locks and releases like any other box; with a
          // pointer, the article opens from the 读文章 link that appears under
          // the box while it is locked. Two kinds of click still go through
          // as the link this is: keyboard activation (detail is 0), and a
          // modified click asking for a new tab or window.
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
    );
  }

  // A button rather than a focusable div: Enter and Space work, the locked
  // state is announced, and the cursor says it can be clicked.
  return (
    <button type="button" {...shared} aria-pressed={isLocked} onClick={onPick}>
      {body}
    </button>
  );
}
