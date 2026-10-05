/**
 * Axis scaling for the notes constellation.
 *
 * Both domains are measured from the notes that actually exist, so the field
 * fills itself whether there are four notes or four hundred. Two things that
 * a naive min/max gets wrong and this does not:
 *
 *   1. A point at the domain minimum lands exactly on the axis, where it
 *      reads as part of the rule rather than as data. Every domain is padded
 *      outwards before anything is mapped into it.
 *   2. When every note shares a value — one note, or twenty written the same
 *      day — the span is zero and `(v - min) / span` divides by zero, which
 *      collapses the whole field onto a single coordinate or produces NaN
 *      positions. The degenerate case is handled explicitly instead.
 */

export interface Scale {
  /** Padded domain, i.e. what the axis labels should say. */
  min: number;
  max: number;
  /** True when the measured values were all identical. */
  degenerate: boolean;
  /** Maps a value to 0..1 across the padded domain. */
  t(value: number): number;
}

export interface ScaleOptions {
  /**
   * Headroom at each end, as a fraction of the measured span.
   *
   * 0.12 means a set spanning 10 to 90 gets a domain of roughly 0.4 to 99.6,
   * so the extreme notes sit about a tenth of the way in from the rules
   * rather than on them.
   */
  pad?: number;
  /** Minimum headroom in domain units, used when the span is small or zero. */
  minPad?: number;
  /** Clamps the domain so it never goes below this, e.g. 0 characters. */
  floor?: number;
}

/**
 * Builds a padded scale from measured values.
 *
 * The pad is a fraction of the span rather than a fixed amount so it behaves
 * the same whether the axis is counting characters or days.
 */
export function scaleFrom(
  values: number[],
  { pad = 0.12, minPad = 1, floor }: ScaleOptions = {},
): Scale {
  if (values.length === 0) {
    // Nothing to place. Any domain will do; return a usable one so callers do
    // not have to special-case an empty field before they even get here.
    return { min: 0, max: 1, degenerate: true, t: () => 0.5 };
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  if (span === 0) {
    // One distinct value: give it a domain it can sit in the middle of. There
    // is no spread to show, and pretending otherwise by spreading identical
    // notes across the axis would be a lie about the data.
    const half = Math.max(minPad, Math.abs(low) * pad, 1);
    const min = floor !== undefined ? Math.max(floor, low - half) : low - half;
    return {
      min,
      max: low + half,
      degenerate: true,
      t: () => 0.5,
    };
  }

  const room = Math.max(span * pad, minPad);
  let min = low - room;
  if (floor !== undefined) min = Math.max(floor, min);
  const max = high + room;

  return {
    min,
    max,
    degenerate: false,
    t: (value: number) => {
      const unit = (value - min) / (max - min);
      return unit < 0 ? 0 : unit > 1 ? 1 : unit;
    },
  };
}

/** Days since the epoch for an ISO `YYYY-MM-DD`, the x axis unit. */
export function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
}

/** Back to an ISO date, for the axis tick labels. */
export function isoFromDay(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Keeping the dots clickable
 * ------------------------------------------------------------------ */

export interface Placed<T> {
  item: T;
  /** 0..1 within the field. */
  x: number;
  y: number;
}

/**
 * Nudges overlapping points apart until each has room to be hit.
 *
 * Not jitter: positions start from the data and move only as far as they must,
 * so the field still reads as a scatter of dates against lengths. Two notes
 * written a week apart at the same length would otherwise land on top of each
 * other and share one target, which is a worse lie about the data than a few
 * percent of displacement.
 *
 * Deterministic — no randomness anywhere — so the constellation looks
 * identical on every render and you can learn where things are.
 *
 * @param minDist Minimum separation, in units of the normalised field.
 */
export function separate<T>(
  points: Placed<T>[],
  minDist = 0.045,
  iterations = 24,
): Placed<T>[] {
  const out = points.map((p) => ({ ...p }));
  if (out.length < 2) return out;

  for (let pass = 0; pass < iterations; pass++) {
    let moved = false;

    for (let a = 0; a < out.length; a++) {
      for (let b = a + 1; b < out.length; b++) {
        const pa = out[a]!;
        const pb = out[b]!;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDist) continue;

        // Exactly coincident: there is no direction to push along, so pick one
        // from the pair's index. Deterministic, and it fans duplicates out
        // instead of stacking them all on the same axis.
        if (dist === 0) {
          const angle = ((a * 7 + b * 13) % 360) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }

        const push = (minDist - dist) / 2;
        const ux = (dx / dist) * push;
        const uy = (dy / dist) * push;

        pa.x -= ux;
        pa.y -= uy;
        pb.x += ux;
        pb.y += uy;
        moved = true;
      }
    }

    // Stay inside the field. Clamping every pass rather than once at the end
    // keeps a point pinned to an edge from being pushed further out and then
    // snapping back.
    for (const p of out) {
      p.x = p.x < 0.02 ? 0.02 : p.x > 0.98 ? 0.98 : p.x;
      p.y = p.y < 0.03 ? 0.03 : p.y > 0.97 ? 0.97 : p.y;
    }

    if (!moved) break;
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Ticks
 * ------------------------------------------------------------------ */

/**
 * Year boundaries inside a day-number domain, for the time axis.
 *
 * Years rather than a fixed number of evenly spaced ticks: a tick that says
 * "2026" is worth reading, one that says "2025-07-18" because it happens to be
 * a quarter of the way along is not. Falls back to the domain ends when the
 * notes span less than a year, so a new site still gets a labelled axis.
 */
export function yearTicks(scale: Scale): Array<{ at: number; label: string }> {
  const from = new Date(scale.min * 86400000).getUTCFullYear();
  const to = new Date(scale.max * 86400000).getUTCFullYear();

  const ticks: Array<{ at: number; label: string }> = [];
  for (let year = from; year <= to; year++) {
    const day = dayNumber(`${year}-01-01`);
    if (day < scale.min || day > scale.max) continue;
    ticks.push({ at: scale.t(day), label: String(year) });
  }

  if (ticks.length >= 2) return ticks;

  return [
    { at: 0, label: isoFromDay(Math.ceil(scale.min)).slice(0, 7) },
    { at: 1, label: isoFromDay(Math.floor(scale.max)).slice(0, 7) },
  ];
}
