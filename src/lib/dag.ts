/**
 * Layered layout for a prerequisite graph.
 *
 * A learning path is a DAG, not a line: a topic can need several things before
 * it, and can itself be needed by several others. Laying that out means three
 * steps, and each one has a trap worth naming.
 */

export interface DagInput {
  id: string;
  /** Ids this node depends on. */
  requires: string[];
}

export interface Placed<T> {
  node: T;
  /** Row. 0 means nothing comes before it. */
  layer: number;
  /** Column within the row. */
  slot: number;
}

export interface Layout<T> {
  nodes: Placed<T>[];
  /** Number of rows. */
  layers: number;
  /** Widest row, in nodes. */
  width: number;
  /** Edges that survived validation, parent -> child. */
  edges: Array<{ from: string; to: string }>;
  /**
   * Data problems, reported rather than thrown.
   *
   * A cycle or a dangling id is an authoring mistake, but throwing would take
   * the whole page down over one bad line. The page shows these instead —
   * same bargain the content compiler makes with an empty category.
   */
  errors: string[];
}

/**
 * Assigns each node a row, then orders each row to keep the edges readable.
 *
 * @param items Nodes in declaration order; that order breaks ties.
 */
export function layerDag<T extends DagInput>(
  items: T[],
  passes = 6,
): Layout<T> {
  const errors: string[] = [];
  const byId = new Map<string, T>();

  for (const item of items) {
    if (byId.has(item.id)) {
      errors.push(`节点 id "${item.id}" 重复`);
      continue;
    }
    byId.set(item.id, item);
  }

  // Drop edges pointing at nothing. Keeping them would silently shift layers
  // and leave an arrow going nowhere.
  const requires = new Map<string, string[]>();
  for (const item of byId.values()) {
    const kept: string[] = [];
    for (const dep of item.requires) {
      if (!byId.has(dep)) {
        errors.push(`"${item.id}" 的前置 "${dep}" 不存在`);
        continue;
      }
      if (dep === item.id) {
        errors.push(`"${item.id}" 把自己当成了前置`);
        continue;
      }
      kept.push(dep);
    }
    requires.set(item.id, kept);
  }

  /* ---- 1. Rows -------------------------------------------------------- *
   * Longest path from a root, not shortest.
   *
   * With A→C and A→B→C, the shortest path would put C one row below A, where
   * it would sit level with B — its own prerequisite — and the edge B→C would
   * run sideways or backwards. Taking the longest path guarantees every node
   * is strictly below everything it needs.                                 */

  const layer = new Map<string, number>();
  const state = new Map<string, "open" | "closed">();
  const inCycle = new Set<string>();

  const depth = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;

    if (state.get(id) === "open") {
      // Back edge: this is not a DAG any more.
      inCycle.add(id);
      return 0;
    }
    state.set(id, "open");

    let best = 0;
    for (const dep of requires.get(id) ?? []) {
      best = Math.max(best, depth(dep) + 1);
    }

    state.set(id, "closed");
    layer.set(id, best);
    return best;
  };

  for (const id of byId.keys()) depth(id);

  if (inCycle.size > 0) {
    errors.push(
      `存在环，涉及：${[...inCycle].join(", ")} —— 前置关系必须是有向无环的`,
    );
  }

  /* ---- 2. Columns ----------------------------------------------------- *
   * Barycentre ordering, alternating downwards and upwards.
   *
   * Each pass puts a node near the average column of its neighbours in the
   * row above (or below), which is the standard cheap way to cut edge
   * crossings. Declaration order is the tiebreak, so authoring order still
   * shows through and the result is deterministic — no randomness, so the
   * graph looks the same on every render.                                  */

  const rows: string[][] = Array.from(
    { length: Math.max(0, ...[...layer.values()].map((l) => l + 1)) },
    () => [],
  );
  const declared = new Map<string, number>();
  items.forEach((item, i) => declared.set(item.id, i));

  for (const id of byId.keys()) rows[layer.get(id)!]!.push(id);
  for (const row of rows) {
    row.sort((a, b) => declared.get(a)! - declared.get(b)!);
  }

  const children = new Map<string, string[]>();
  for (const [id, deps] of requires) {
    for (const dep of deps) {
      if (!children.has(dep)) children.set(dep, []);
      children.get(dep)!.push(id);
    }
  }

  const slotOf = new Map<string, number>();
  const reindex = () => {
    for (const row of rows) {
      row.forEach((id, i) => slotOf.set(id, i));
    }
  };
  reindex();

  const barycentre = (id: string, neighbours: string[]): number | undefined => {
    if (neighbours.length === 0) return undefined;
    let sum = 0;
    for (const n of neighbours) sum += slotOf.get(n) ?? 0;
    return sum / neighbours.length;
  };

  for (let pass = 0; pass < passes; pass++) {
    const downwards = pass % 2 === 0;
    // Downward passes read the row above, so they have to run top to bottom;
    // upward passes read the row below and run the other way.
    const order = downwards
      ? rows.map((_, i) => i)
      : rows.map((_, i) => rows.length - 1 - i);

    for (const r of order) {
      const row = rows[r]!;
      const keys = new Map<string, number>();
      for (const id of row) {
        const refs = downwards
          ? (requires.get(id) ?? [])
          : (children.get(id) ?? []);
        keys.set(id, barycentre(id, refs) ?? slotOf.get(id)!);
      }
      row.sort(
        (a, b) =>
          keys.get(a)! - keys.get(b)! || declared.get(a)! - declared.get(b)!,
      );
      reindex();
    }
  }

  /* ---- 3. Result ------------------------------------------------------ */

  const nodes: Placed<T>[] = [];
  for (const row of rows) {
    row.forEach((id, slot) => {
      nodes.push({ node: byId.get(id)!, layer: layer.get(id)!, slot });
    });
  }

  const edges: Array<{ from: string; to: string }> = [];
  for (const [id, deps] of requires) {
    for (const dep of deps) edges.push({ from: dep, to: id });
  }

  return {
    nodes,
    layers: rows.length,
    width: Math.max(0, ...rows.map((r) => r.length)),
    edges,
    errors,
  };
}

/**
 * Ids reachable from `id` by walking prerequisites backwards.
 *
 * Used to light up everything a topic rests on when it is hovered — the thing
 * a DAG can show that a list cannot.
 */
export function ancestorsOf(
  id: string,
  requires: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [...(requires.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(requires.get(next) ?? []));
  }
  return seen;
}

/** Ids that depend on `id`, directly or not. */
export function descendantsOf(
  id: string,
  requires: Map<string, string[]>,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const [node, deps] of requires) {
    for (const dep of deps) {
      if (!children.has(dep)) children.set(dep, []);
      children.get(dep)!.push(node);
    }
  }
  const seen = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return seen;
}
