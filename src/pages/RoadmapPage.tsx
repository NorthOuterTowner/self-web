import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  bridges,
  clusterById,
  clusterOrder,
  requiresMap,
  roadmapSource,
  skillById,
  skillGraph,
  skillLayout,
  statusMeta,
  tally,
  type ClusterId,
  type Skill,
  type SkillStatus,
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
 * "these are separate figures"; they are not — the whole point is that you
 * can see 基站集成 reaching back into 桌面 for PySide.
 *
 * Nothing in the geometry is random. Box widths come from label length and
 * odd columns sit slightly lower, which is enough to break the grid without
 * the figure changing between renders.
 */

const NODE_H = 52;
const GAP_X = 18;
const GAP_Y = 58;
const ROW = NODE_H + GAP_Y;
/** Odd columns drop by this much, for rhythm. */
const BRICK = 14;
/** Space between two clusters' bands. Close enough to read as adjacent. */
const BAND_GAP = 52;
/** Breathing room between a cluster's nodes and its field's edge. */
const HULL_PAD = 20;

const MIN_W = 112;
const MAX_W = 216;

/** Rough advance width in em: CJK is full width, Latin about half. */
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  }
  return w;
}

function widthOf(skill: Skill): number {
  const zh = textWidth(skill.label) * 13;
  const en = textWidth(skill.labelEn) * 6.8;
  return Math.min(MAX_W, Math.max(MIN_W, Math.ceil(Math.max(zh, en)) + 26));
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
    const [cluster, layerText] = k.split(":") as [ClusterId, string];
    const layer = Number(layerText);
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
  const [focus, setFocus] = useState<string | null>(null);
  const counts = useMemo(() => tally(), []);
  const geo = useMemo(place, []);

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
          {(Object.keys(statusMeta) as SkillStatus[]).map((status) => (
            <div key={status} data-status={status}>
              <dt className="label">{statusMeta[status].title}</dt>
              <dd className="index-num">{counts[status]}</dd>
            </div>
          ))}
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

        <p className="rm__hint label">
          纵向是前置深度，横向按组分带。连线是知识依赖，不是我学习的顺序 ——
          跨组的那几条会穿过色域。悬停任意一项，看它压在什么上面。
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
            onMouseLeave={() => setFocus(null)}
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
                  onFocus={() => setFocus(skill.id)}
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
                <p className="rm__group-note">{meta.note}</p>
                <ol className="rm__list">
                  {own.map((skill) => (
                    <li className="rm__row" key={skill.id}>
                      <span className="rm__row-head">
                        <span className="rm__row-title">{skill.label}</span>
                        <span
                          className="label rm__row-status"
                          data-status={skill.status}
                        >
                          {statusMeta[skill.status].title}
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
                      {skill.detail && (
                        <span className="rm__row-note">{skill.detail}</span>
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
            ← 这些状态是怎么来的：{roadmapSource.title}
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
  onFocus,
}: {
  skill: Skill;
  spot: Spot;
  role: string;
  onFocus: () => void;
}) {
  const meta = clusterById.get(skill.cluster)!;
  const reqs = skill.requires
    .map((id) => skillById.get(id)?.label ?? id)
    .join("、");

  const shared = {
    className: "rm__node",
    "data-tone": meta.tone,
    "data-status": skill.status,
    "data-role": role,
    style: {
      left: `${spot.x}px`,
      top: `${spot.y}px`,
      width: `${spot.w}px`,
      height: `${NODE_H}px`,
    } as CSSProperties,
    onMouseEnter: onFocus,
    onFocus,
    title: [
      `${skill.label} · ${statusMeta[skill.status].title}`,
      reqs && `需要：${reqs}`,
      skill.detail,
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const body = (
    <>
      <span className="rm__node-label">{skill.label}</span>
      <span className="rm__node-en label">{skill.labelEn}</span>
      {skill.link && <span className="rm__node-dot" aria-hidden="true" />}
    </>
  );

  return skill.link ? (
    <Link to={skill.link} {...shared}>
      {body}
    </Link>
  ) : (
    <div {...shared} tabIndex={0}>
      {body}
    </div>
  );
}
