/**
 * Where everything on the roadmap canvas goes.
 *
 * Each group is laid out on its own, as one clump: a small tech tree read
 * left to right, every prerequisite in a column before what it unlocks. The
 * clumps are then packed into columns like a masonry wall, in the order the
 * groups are written, each into whichever column is shortest so far.
 *
 * Nothing here is random, so the figure is the same on every render. Pure:
 * topics in, numbers out. The page draws them.
 */

import type { ClusterId, Skill } from "../content/roadmap";
import { layerDag } from "./dag";

/** A box's height: one line of label plus its padding. */
export const NODE_H = 36;
/** Between two boxes stacked in one column. */
const ROW_GAP = 12;
const PITCH = NODE_H + ROW_GAP;
/** Between two columns of a clump. The wires turn in here. */
const COL_GAP = 36;
/** Between a field's edge and the boxes in it. */
const FIELD_PAD = 16;
/** From a field's top edge to its first row. The group's name sits in it. */
const LABEL_H = 38;
/** A field is never narrower than this, so its name always fits. */
const MIN_CARD_W = 220;

/**
 * Loose topics: ones with no prerequisite and nothing depending on them
 * inside their own group. Their edges all leave the group, so in the tree
 * they would be boxes with no wires. They go in a row of their own under it,
 * a little further down than the rows are from each other.
 */
const LOOSE_DROP = 18;
const LOOSE_GAP = 10;
/** The loose row wraps at the tree's width, or at this if the tree is narrower. */
const LOOSE_WRAP_MIN = 400;

/** Between two fields, side by side and one above the other. */
const CARD_GAP_X = 36;
const CARD_GAP_Y = 30;

/**
 * Low on purpose. A high floor would give every short name — C, Git, Qt,
 * DOM — the same box, and the clumps would turn back into a uniform grid.
 */
const MIN_W = 56;

/**
 * A box's horizontal chrome. Must match `.rm__node` in roadmap.css: 12px of
 * padding each side, a 2px rule on the left and a 1px rule on the right.
 * A Chinese name is exactly 13px a character, so one pixel short here and
 * the browser swaps an all-Chinese name's last character for an ellipsis.
 */
const CHROME = 12 + 12 + 2 + 1;

/**
 * Extra right padding on a box with an article: room for its dot, and for
 * the → that replaces the dot while the box is locked. Matches
 * `.rm__node[data-linked]`.
 */
export const LINK_ROOM = 14;

/** Rough advance width in em: CJK is full width, Latin about half. */
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  }
  return w;
}

/**
 * A box's width, for placing it. Still a guess for Latin names, which depend
 * on the visitor's font. A wrong guess cannot cut a label off — `.rm__node`
 * has `min-width: max-content` — it only eats into the gap after the box.
 */
export function widthOf(skill: Skill): number {
  const text = Math.ceil(textWidth(skill.label) * 13);
  return Math.max(MIN_W, text + CHROME + (skill.link ? LINK_ROOM : 0));
}

export interface Box {
  x: number;
  y: number;
  w: number;
}

/** One edge inside a group, as SVG path data relative to its field. */
export interface Wire {
  from: string;
  to: string;
  d: string;
}

/** One group, laid out, in coordinates relative to its own field. */
export interface Card {
  id: ClusterId;
  w: number;
  h: number;
  boxes: Map<string, Box>;
  wires: Wire[];
}

export interface PlacedCard {
  card: Card;
  x: number;
  y: number;
}

/** The whole canvas. */
export interface Sheet {
  cards: PlacedCard[];
  /** Every box, in canvas coordinates. */
  at: Map<string, Box>;
  width: number;
  height: number;
}

interface Edge {
  from: string;
  to: string;
}

/* ---- One clump ------------------------------------------------------ */

/**
 * A long wire skips at least one column. It runs straight along its parent's
 * row and turns in the last gap if that row is empty all the way; failing
 * that, it turns in the first gap and runs along its child's row; failing
 * both, it is a plain curve. The cost below and the drawing both use this,
 * so the layout is scored on the wires it will actually draw.
 */
type LongRoute = "along-parent" | "along-child" | "direct";

function longRoute(
  from: { row: number; col: number },
  to: { row: number; col: number },
  occupied: Set<string>,
): LongRoute {
  const clear = (row: number) => {
    for (let c = from.col + 1; c < to.col; c++) {
      if (occupied.has(`${c}:${row}`)) return false;
    }
    return true;
  };
  if (clear(from.row)) return "along-parent";
  if (clear(to.row)) return "along-child";
  return "direct";
}

const occupiedCells = (row: Map<string, number>, col: Map<string, number>) =>
  new Set([...row].map(([id, r]) => `${col.get(id)}:${r}`));

/** A crossing costs as much as two rows of bend. */
const CROSSING = 2;
/** A long wire with no straight run left. */
const BLOCKED = 4;

/**
 * How untidy a row assignment is: rows of bend summed over the wires, two for
 * each pair of wires that cross, and one for each row of height.
 */
function untidiness(
  row: Map<string, number>,
  col: Map<string, number>,
  edges: Edge[],
): number {
  let total = Math.max(-1, ...row.values()) + 1;
  const occupied = occupiedCells(row, col);
  // Each wire's part in each gap it passes: [gap, row on the left, row on the right].
  const spans: Array<[number, number, number]> = [];

  for (const { from, to } of edges) {
    const a = { row: row.get(from)!, col: col.get(from)! };
    const b = { row: row.get(to)!, col: col.get(to)! };
    if (b.col <= a.col) continue;
    total += Math.abs(a.row - b.row);

    if (b.col === a.col + 1) {
      spans.push([a.col, a.row, b.row]);
      continue;
    }
    const route = longRoute(a, b, occupied);
    if (route === "along-parent") {
      for (let g = a.col; g < b.col - 1; g++) spans.push([g, a.row, a.row]);
      spans.push([b.col - 1, a.row, b.row]);
    } else if (route === "along-child") {
      spans.push([a.col, a.row, b.row]);
      for (let g = a.col + 1; g < b.col; g++) spans.push([g, b.row, b.row]);
    } else {
      total += BLOCKED;
    }
  }

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const [g1, l1, r1] = spans[i]!;
      const [g2, l2, r2] = spans[j]!;
      // Opposite order on the two sides of the gap. Sharing an end is a fork
      // or a merge, not a crossing.
      if (g1 === g2 && (l1 - l2) * (r1 - r2) < 0) total += CROSSING;
    }
  }
  return total;
}

/** Closes up rows that nothing sits on. */
function compact(row: Map<string, number>): Map<string, number> {
  const used = [...new Set(row.values())].sort((a, b) => a - b);
  const to = new Map(used.map((r, i) => [r, i]));
  return new Map([...row].map(([id, r]) => [id, to.get(r)!]));
}

/** Swaps the contents of rows `a` and `b`, in the given columns only. */
function swapRows(
  row: Map<string, number>,
  col: Map<string, number>,
  cols: Set<number>,
  a: number,
  b: number,
): Map<string, number> {
  const next = new Map(row);
  for (const [id, r] of row) {
    if (!cols.has(col.get(id)!)) continue;
    if (r === a) next.set(id, b);
    else if (r === b) next.set(id, a);
  }
  return next;
}

/** The columns spanned by the straight run of wires `id` sits on. */
function runColumns(
  id: string,
  row: Map<string, number>,
  col: Map<string, number>,
  edges: Edge[],
): Set<number> {
  const seen = new Set([id]);
  const stack = [id];
  while (stack.length > 0) {
    const at = stack.pop()!;
    for (const { from, to } of edges) {
      const other = from === at ? to : to === at ? from : undefined;
      if (other === undefined || seen.has(other)) continue;
      if (row.get(other) !== row.get(at)) continue;
      if (Math.abs(col.get(other)! - col.get(at)!) !== 1) continue;
      seen.add(other);
      stack.push(other);
    }
  }
  const cols = [...seen].map((s) => col.get(s)!);
  const lo = Math.min(...cols);
  const hi = Math.max(...cols);
  return new Set(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
}

/**
 * A first arrangement, as a tidy tree.
 *
 * Every topic hangs off one parent: its deepest prerequisite in the group,
 * then the one with the fewest other dependants, then the first one written.
 * A parent sits level with its first child, so a chain of single steps is a
 * straight line. Starting points that share descendants go next to each
 * other, and siblings are ordered by where all their parents sit.
 */
function tidyRows(
  ids: string[],
  parents: Map<string, string[]>,
  kids: Map<string, string[]>,
  col: Map<string, number>,
): Map<string, number> {
  const hang = new Map<string, string[]>(ids.map((id) => [id, []]));
  const roots: string[] = [];
  for (const id of ids) {
    const above = parents.get(id)!.filter((p) => col.get(p)! < col.get(id)!);
    if (above.length === 0) {
      roots.push(id);
      continue;
    }
    // Stable, so equal parents stay in the order `requires` lists them.
    const [main] = [...above].sort(
      (a, b) =>
        col.get(b)! - col.get(a)! || kids.get(a)!.length - kids.get(b)!.length,
    );
    hang.get(main!)!.push(id);
  }

  const below = (id: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...kids.get(id)!];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...kids.get(next)!);
    }
    return seen;
  };

  const ordered: string[] = [];
  const left = [...roots];
  while (left.length > 0) {
    let pick = 0;
    const last = ordered[ordered.length - 1];
    if (last !== undefined) {
      const mine = below(last);
      let most = 0;
      left.forEach((r, i) => {
        let shared = 0;
        for (const d of below(r)) if (mine.has(d)) shared++;
        if (shared > most) {
          most = shared;
          pick = i;
        }
      });
    }
    ordered.push(left.splice(pick, 1)[0]!);
  }

  const row = new Map<string, number>();
  const place = () => {
    row.clear();
    let next = 0;
    const visit = (id: string) => {
      row.set(id, next);
      const children = hang.get(id)!;
      if (children.length === 0) next++;
      for (const child of children) visit(child);
    };
    for (const r of ordered) visit(r);
  };
  place();

  const meanParentRow = (id: string) => {
    const ps = parents.get(id)!;
    return ps.reduce((sum, p) => sum + row.get(p)!, 0) / ps.length;
  };
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const [id, children] of hang) {
      const sorted = [...children].sort(
        (a, b) => meanParentRow(a) - meanParentRow(b),
      );
      if (sorted.some((c, i) => c !== children[i])) {
        hang.set(id, sorted);
        moved = true;
      }
    }
    if (!moved) break;
    place();
  }
  return row;
}

/**
 * Improves the tidy tree where a tree cannot express the graph — a topic
 * with several parents, say, which reads best between them rather than
 * hanging under one.
 *
 * Plain local search: for each topic, try swapping its row with every other
 * row, first in its own column, then across the whole straight run it sits
 * on, and keep the best change that makes the layout tidier. Repeat until
 * nothing does. Deterministic: fixed order, strict improvement only.
 */
function refine(
  ids: string[],
  start: Map<string, number>,
  col: Map<string, number>,
  edges: Edge[],
): Map<string, number> {
  let row = compact(start);
  let score = untidiness(row, col, edges);

  for (let pass = 0; pass < 40; pass++) {
    let improved = false;
    for (const id of ids) {
      const height = Math.max(...row.values()) + 1;
      const own = row.get(id)!;
      const scopes = [new Set([col.get(id)!]), runColumns(id, row, col, edges)];
      let best: Map<string, number> | undefined;
      let bestScore = score;
      for (const cols of scopes) {
        for (let target = 0; target <= height; target++) {
          if (target === own) continue;
          const next = compact(swapRows(row, col, cols, own, target));
          const s = untidiness(next, col, edges);
          if (s < bestScore - 1e-9) {
            bestScore = s;
            best = next;
          }
        }
      }
      if (best) {
        row = best;
        score = bestScore;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return row;
}

/** The S between two points, turning halfway. Level points get a straight line. */
function bend(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `L ${x2} ${y2}`;
  const xm = (x1 + x2) / 2;
  return `C ${xm} ${y1}, ${xm} ${y2}, ${x2} ${y2}`;
}

function layoutCard(id: ClusterId, topics: Skill[]): Card {
  // First of each label only. A repeat is reported by the data module.
  const own: Skill[] = [];
  const here = new Set<string>();
  for (const t of topics) {
    if (here.has(t.id)) continue;
    here.add(t.id);
    own.push(t);
  }

  const parents = new Map<string, string[]>();
  const kids = new Map<string, string[]>();
  for (const t of own) {
    parents.set(t.id, []);
    kids.set(t.id, []);
  }
  for (const t of own) {
    for (const p of t.requires) {
      if (!here.has(p) || p === t.id || parents.get(t.id)!.includes(p)) continue;
      parents.get(t.id)!.push(p);
      kids.get(p)!.push(t.id);
    }
  }

  const isLoose = (t: Skill) =>
    parents.get(t.id)!.length === 0 && kids.get(t.id)!.length === 0;
  const loose = own.filter(isLoose);
  const tree = own.filter((t) => !isLoose(t));
  const ids = tree.map((t) => t.id);

  // Columns: longest path from a starting point, on this group's edges only.
  const col = new Map<string, number>();
  for (const p of layerDag(
    tree.map((t) => ({ id: t.id, requires: parents.get(t.id)! })),
  ).nodes) {
    col.set(p.node.id, p.layer);
  }

  const edges: Edge[] = tree.flatMap((t) =>
    parents.get(t.id)!.map((p) => ({ from: p, to: t.id })),
  );

  const row =
    tree.length > 0
      ? refine(ids, tidyRows(ids, parents, kids, col), col, edges)
      : new Map<string, number>();

  // Columns are as wide as their widest box; boxes sit flush left in them.
  const columns = Math.max(-1, ...col.values()) + 1;
  const colW: number[] = Array.from({ length: columns }, () => 0);
  for (const t of tree) {
    const c = col.get(t.id)!;
    colW[c] = Math.max(colW[c]!, widthOf(t));
  }
  const colX: number[] = [];
  let x = FIELD_PAD;
  for (let c = 0; c < columns; c++) {
    colX.push(x);
    x += colW[c]! + COL_GAP;
  }
  const colEnd = (c: number) => colX[c]! + colW[c]!;
  const treeW = columns > 0 ? x - COL_GAP - FIELD_PAD : 0;
  const rows = tree.length > 0 ? Math.max(...row.values()) + 1 : 0;
  const treeH = rows > 0 ? rows * PITCH - ROW_GAP : 0;

  const boxes = new Map<string, Box>();
  for (const t of tree) {
    boxes.set(t.id, {
      x: colX[col.get(t.id)!]!,
      y: LABEL_H + row.get(t.id)! * PITCH,
      w: widthOf(t),
    });
  }

  const wrap = Math.max(treeW, LOOSE_WRAP_MIN);
  let lx = 0;
  let ly = treeH > 0 ? treeH + ROW_GAP + LOOSE_DROP : 0;
  let looseW = 0;
  for (const t of loose) {
    const w = widthOf(t);
    if (lx > 0 && lx + w > wrap) {
      lx = 0;
      ly += PITCH;
    }
    boxes.set(t.id, { x: FIELD_PAD + lx, y: LABEL_H + ly, w });
    looseW = Math.max(looseW, lx + w);
    lx += w + LOOSE_GAP;
  }
  const contentH = loose.length > 0 ? ly + NODE_H : treeH;

  // Wires leave a box's right edge, run to the end of its column, and turn
  // in the gap, so every turn happens in the open and boxes in a column
  // never sit on top of a wire.
  const occupied = occupiedCells(row, col);
  const wires: Wire[] = edges.map(({ from, to }) => {
    const a = boxes.get(from)!;
    const b = boxes.get(to)!;
    const ca = col.get(from)!;
    const cb = col.get(to)!;
    const y1 = a.y + NODE_H / 2;
    const y2 = b.y + NODE_H / 2;
    const start = `M ${a.x + a.w} ${y1}`;

    let d: string;
    if (cb === ca + 1) {
      d = `${start} H ${colEnd(ca)} ${bend(colEnd(ca), y1, b.x, y2)}`;
    } else if (cb > ca + 1) {
      const route = longRoute(
        { row: row.get(from)!, col: ca },
        { row: row.get(to)!, col: cb },
        occupied,
      );
      if (route === "along-parent") {
        d = `${start} H ${colEnd(cb - 1)} ${bend(colEnd(cb - 1), y1, b.x, y2)}`;
      } else if (route === "along-child") {
        d = `${start} H ${colEnd(ca)} ${bend(colEnd(ca), y1, colX[ca + 1]!, y2)} H ${b.x}`;
      } else {
        d = crossPath(a, b);
      }
    } else {
      // Only inside a cycle, which the error box already reports.
      d = crossPath(a, b);
    }
    return { from, to, d };
  });

  return {
    id,
    w: Math.max(MIN_CARD_W, Math.max(treeW, looseW) + FIELD_PAD * 2),
    h: LABEL_H + contentH + FIELD_PAD,
    boxes,
    wires,
  };
}

/** Every group's clump, in the order given. Groups with no topics are skipped. */
export function layoutCards(skills: Skill[], order: ClusterId[]): Card[] {
  return order
    .map((id) => ({ id, topics: skills.filter((s) => s.cluster === id) }))
    .filter((g) => g.topics.length > 0)
    .map((g) => layoutCard(g.id, g.topics));
}

/* ---- The wall -------------------------------------------------------- */

/**
 * Packs the clumps into `columns` columns, in order, each into the shortest
 * column so far. A column is as wide as its widest clump, and clumps sit flush
 * left in it, the site's own alignment.
 */
export function pack(cards: Card[], columns: number): Sheet {
  const k = Math.max(1, Math.min(columns, cards.length));
  const heights: number[] = Array.from({ length: k }, () => 0);
  const lane: number[] = [];
  const tops: number[] = [];
  for (const card of cards) {
    let pick = 0;
    for (let i = 1; i < k; i++) if (heights[i]! < heights[pick]!) pick = i;
    lane.push(pick);
    tops.push(heights[pick]!);
    heights[pick]! += card.h + CARD_GAP_Y;
  }

  const laneW: number[] = Array.from({ length: k }, () => 0);
  cards.forEach((card, i) => {
    laneW[lane[i]!] = Math.max(laneW[lane[i]!]!, card.w);
  });
  const laneX: number[] = [];
  let x = 0;
  for (let i = 0; i < k; i++) {
    laneX.push(x);
    x += laneW[i]! + CARD_GAP_X;
  }

  const placed: PlacedCard[] = cards.map((card, i) => ({
    card,
    x: laneX[lane[i]!]!,
    y: tops[i]!,
  }));

  const at = new Map<string, Box>();
  for (const { card, x: cx, y: cy } of placed) {
    for (const [id, box] of card.boxes) {
      at.set(id, { x: cx + box.x, y: cy + box.y, w: box.w });
    }
  }

  return {
    cards: placed,
    at,
    width: cards.length > 0 ? x - CARD_GAP_X : 0,
    height: Math.max(0, Math.max(...heights) - CARD_GAP_Y),
  };
}

/** The most columns, up to `most`, whose wall fits in `available` pixels. */
export function fitColumns(cards: Card[], available: number, most = 3): number {
  for (let k = most; k > 1; k--) {
    if (pack(cards, k).width <= available) return k;
  }
  return 1;
}

/**
 * A wire between two boxes anywhere on the canvas, from `a` to `b`: side to
 * side when one is clear of the other horizontally, otherwise top to bottom.
 * Used for the edges between groups, which only show on hover or lock.
 */
export function crossPath(a: Box, b: Box): string {
  const ay = a.y + NODE_H / 2;
  const by = b.y + NODE_H / 2;

  if (b.x >= a.x + a.w) {
    const x1 = a.x + a.w;
    const x2 = b.x;
    const k = Math.max(24, (x2 - x1) / 2);
    return `M ${x1} ${ay} C ${x1 + k} ${ay}, ${x2 - k} ${by}, ${x2} ${by}`;
  }
  if (b.x + b.w <= a.x) {
    const x1 = a.x;
    const x2 = b.x + b.w;
    const k = Math.max(24, (x1 - x2) / 2);
    return `M ${x1} ${ay} C ${x1 - k} ${ay}, ${x2 + k} ${by}, ${x2} ${by}`;
  }

  const ax = a.x + a.w / 2;
  const bx = b.x + b.w / 2;
  const down = b.y > a.y;
  const y1 = down ? a.y + NODE_H : a.y;
  const y2 = down ? b.y : b.y + NODE_H;
  const k = Math.max(16, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return `M ${ax} ${y1} C ${ax} ${y1 + k}, ${bx} ${y2 - k}, ${bx} ${y2}`;
}
