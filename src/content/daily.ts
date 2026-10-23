/**
 * Daily log: what a day was spent on.
 *
 * Authored as one JSON file per month in `content/daily/YYYY-MM.json`. The
 * file name carries the year and month, so each item only says which day:
 *
 *   [
 *     { "day": 4, "thing": "写完功放评价的测试流程" },
 *     { "day": 23, "thing": ["在首页加了日历", "秋招面试准备"] }
 *   ]
 *
 * `thing` is one string or a list of them. These files are not compiled into
 * the bundle: the build copies them to `dist/data/daily/` and the calendar fetches
 * only the month on screen, so page weight stays flat as months pile up.
 *
 * Validated at build time by `scripts/daily.ts`; the runtime goes through the
 * same `parseDailyMonth` below.
 */

import { withBase } from "../lib/basePath";

/** One day's entry, after parsing. */
export interface DailyEntry {
  day: number;
  /** Always a list once parsed, whichever form the file used. */
  things: string[];
}

/** `2026-10` for October 2026. `month` is 0-based, as in `Date`. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** `2026-10-03`. `month` is 0-based. */
export function dayKey(year: number, month: number, day: number): string {
  return `${monthKey(year, month)}-${String(day).padStart(2, "0")}`;
}

export const MONTH_FILE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Days in a `YYYY-MM` month. */
function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
}

/**
 * Checks one month's data. Returns the entries keyed by day of month, plus a
 * message per problem. Shared by the build-time validator and the runtime
 * loader, so both agree on what a valid file is.
 */
export function parseDailyMonth(
  month: string,
  data: unknown,
): { entries: Map<number, DailyEntry>; errors: string[] } {
  const entries = new Map<number, DailyEntry>();
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push("顶层必须是数组");
    return { entries, errors };
  }

  const last = daysIn(month);

  data.forEach((raw, i) => {
    const at = `第 ${i + 1} 项`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      errors.push(`${at} 必须是对象`);
      return;
    }
    const item = raw as Record<string, unknown>;

    const unknown = Object.keys(item).filter((k) => k !== "day" && k !== "thing");
    if (unknown.length > 0) {
      errors.push(`${at} 有未知字段：${unknown.join(", ")}，只能写 day 和 thing`);
      return;
    }

    const day = item.day;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > last) {
      errors.push(`${at} 的 day 必须是 1 到 ${last} 的整数`);
      return;
    }
    if (entries.has(day)) {
      errors.push(`${at} 的 day ${day} 重复`);
      return;
    }

    const thing = item.thing;
    const list =
      typeof thing === "string"
        ? [thing]
        : Array.isArray(thing) && thing.every((t) => typeof t === "string")
          ? (thing as string[])
          : undefined;
    if (!list) {
      errors.push(`${at}（${day} 日）的 thing 必须是字符串或字符串数组`);
      return;
    }
    const things = list.map((t) => t.trim()).filter(Boolean);
    if (things.length === 0) {
      errors.push(`${at}（${day} 日）的 thing 是空的`);
      return;
    }

    entries.set(day, { day, things });
  });

  return { entries, errors };
}

/** Months already fetched, or in flight. A missing month is an empty map. */
const cache = new Map<string, Promise<Map<number, DailyEntry>>>();

/**
 * One month of entries, fetched on first ask and remembered for the session.
 *
 * A month with no file is not an error: GitHub Pages answers it with a 404
 * whose body is the SPA's HTML, so the status is checked before parsing.
 * A failed request is dropped from the cache so the next visit retries.
 */
export function loadDailyMonth(month: string): Promise<Map<number, DailyEntry>> {
  const hit = cache.get(month);
  if (hit) return hit;

  const request = fetch(withBase(`/data/daily/${month}.json`))
    .then(async (res) => {
      if (res.status === 404) return new Map<number, DailyEntry>();
      if (!res.ok) throw new Error(`daily ${month}: HTTP ${res.status}`);
      return parseDailyMonth(month, await res.json()).entries;
    })
    .catch((error: unknown) => {
      cache.delete(month);
      throw error;
    });

  cache.set(month, request);
  return request;
}
