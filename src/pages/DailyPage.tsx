import { useEffect, useRef, useState } from "react";
import {
  dayKey,
  loadDailyMonth,
  monthKey,
  type DailyEntry,
} from "../content/daily";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { dailyIcons } from "../lib/icons";
import { daily, site } from "../site.config";

/**
 * The daily log: a month calendar and, beside it, what the days held.
 *
 * Nothing but the calendar and the panel. Clicking a day selects it (ink
 * ground, white figure) and shows it in the panel; only one day is selected
 * at a time, and clicking it again lets it go. With nothing selected the panel
 * lists the whole month. Data is fetched one month at a time from
 * `/data/daily/YYYY-MM.json` — see `content/daily.ts`.
 */

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
/** Six weeks always, so stepping between months never changes the height. */
const CELLS = 42;

type MonthState =
  | { status: "loading" }
  | { status: "ready"; entries: Map<number, DailyEntry> }
  | { status: "error" };

function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

/** Monday-first column of the 1st, and the month's length. */
function monthShape(y: number, m: number) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const length = new Date(y, m + 1, 0).getDate();
  return { lead, length };
}

/** `m` is 0-based. Returns the bare character: 一 … 日. */
function weekdayOf(y: number, m: number, d: number): string {
  return WEEKDAYS[(new Date(y, m, d).getDay() + 6) % 7]!;
}

function Status({ month, empty }: { month: MonthState | undefined; empty: string }) {
  if (!month || month.status === "loading") {
    return <p className="daily__empty label">Loading…</p>;
  }
  if (month.status === "error") {
    return <p className="daily__empty">记录没能加载，稍后再试。</p>;
  }
  return <p className="daily__empty">{empty}</p>;
}

/** The selected day. */
function DayPanel({
  y,
  m,
  d,
  month,
}: {
  y: number;
  /** 0-based. */
  m: number;
  d: number;
  month: MonthState | undefined;
}) {
  const entry = month?.status === "ready" ? month.entries.get(d) : undefined;

  return (
    <div className="daily__panel" role="region" aria-labelledby="daily-day">
      <h2 className="daily__panel-title" id="daily-day">
        {m + 1}月{d}日
        <span className="label daily__panel-week">星期{weekdayOf(y, m, d)}</span>
      </h2>

      {entry ? (
        <ol className="daily__things">
          {entry.things.map((thing, i) => (
            <li key={i}>
              <span className="index-num">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="daily__thing">{thing}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Status month={month} empty="这一天没有记录。" />
      )}
    </div>
  );
}

/** The month on screen, every recorded day in order. */
function MonthList({
  y,
  m,
  month,
  onPick,
}: {
  y: number;
  /** 0-based. */
  m: number;
  month: MonthState | undefined;
  onPick: (day: number) => void;
}) {
  const days =
    month?.status === "ready"
      ? [...month.entries.values()].sort((a, b) => a.day - b.day)
      : [];

  return (
    <div className="daily__month-list" role="region" aria-labelledby="daily-month-title">
      <h2 className="daily__panel-title" id="daily-month-title">
        {m + 1}月
      </h2>
      {days.length === 0 ? (
        <Status month={month} empty="这个月还没有记录。" />
      ) : (
        <ol className="daily__days">
          {days.map((entry) => (
            <li key={entry.day}>
              <button
                type="button"
                className="daily__day-row"
                onClick={() => onPick(entry.day)}
              >
                <span className="daily__day-date">
                  <span className="index-num">
                    {String(entry.day).padStart(2, "0")}
                  </span>
                  <span className="label">{weekdayOf(y, m, entry.day)}</span>
                </span>
                <span className="daily__day-things">
                  {entry.things.map((thing, i) => (
                    <span className="daily__thing" key={i}>
                      {thing}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DailyPage() {
  const root = useRef<HTMLDivElement>(null);
  const today = todayParts();
  const todayKey = dayKey(today.y, today.m, today.d);

  const [view, setView] = useState({ y: today.y, m: today.m });
  const [months, setMonths] = useState<Record<string, MonthState>>({});
  /** Day of month within `view`, or null. Only ever one. */
  const [selected, setSelected] = useState<number | null>(null);

  const viewKey = monthKey(view.y, view.m);
  const current = months[viewKey];

  // Fetch the month on screen, once. The loader keeps its own cache, so
  // returning to a month is instant and never refetched.
  useEffect(() => {
    let live = true;
    setMonths((all) =>
      all[viewKey]?.status === "ready"
        ? all
        : { ...all, [viewKey]: { status: "loading" } },
    );
    loadDailyMonth(viewKey).then(
      (entries) => {
        if (live) {
          setMonths((all) => ({
            ...all,
            [viewKey]: { status: "ready", entries },
          }));
        }
      },
      () => {
        if (live) {
          setMonths((all) => ({ ...all, [viewKey]: { status: "error" } }));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [viewKey]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${daily.label} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".daily__body", {
        y: 24,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      });
    });
    return () => mm.revert();
  }, []);

  /** Select a day, or let it go if it is already the selected one. */
  const pick = (d: number) => setSelected((cur) => (cur === d ? null : d));

  const step = (delta: number) => {
    setSelected(null);
    setView(({ y, m }) => {
      const date = new Date(y, m + delta, 1);
      return { y: date.getFullYear(), m: date.getMonth() };
    });
  };

  const { lead, length } = monthShape(view.y, view.m);
  const entries = current?.status === "ready" ? current.entries : undefined;
  const isThisMonth = view.y === today.y && view.m === today.m;
  const PrevIcon = dailyIcons.prev;
  const NextIcon = dailyIcons.next;

  return (
    <div className="page page--reading">
      <div
        className="shell daily"
        ref={root}
        onKeyDown={(event) => {
          if (event.key === "Escape") setSelected(null);
        }}
      >
        <h1 className="sr-only">日常</h1>

        <div className="daily__body grid12">
          <div className="daily__cal">
            <div className="daily__bar">
              <button
                type="button"
                className="daily__step"
                onClick={() => step(-1)}
                aria-label="上个月"
              >
                <PrevIcon className="daily__icon" />
              </button>
              <p className="daily__month" aria-live="polite">
                <span className="daily__year">{view.y}</span>
                <span className="daily__mon">
                  {String(view.m + 1).padStart(2, "0")}
                </span>
              </p>
              <button
                type="button"
                className="daily__step"
                onClick={() => step(1)}
                aria-label="下个月"
              >
                <NextIcon className="daily__icon" />
              </button>
              <button
                type="button"
                className="daily__today label"
                onClick={() => {
                  setSelected(null);
                  setView({ y: today.y, m: today.m });
                }}
                disabled={isThisMonth}
              >
                Today
              </button>
            </div>

            <div className="daily__week" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>

            <div
              className="daily__grid"
              role="group"
              aria-label={`${view.y}年${view.m + 1}月`}
              aria-busy={current?.status === "loading"}
            >
              {Array.from({ length: CELLS }, (_, i) => {
                const d = i - lead + 1;
                if (d < 1 || d > length) {
                  return <span className="daily__pad" key={`pad-${i}`} />;
                }
                const key = dayKey(view.y, view.m, d);
                const has = entries?.has(d) ?? false;
                return (
                  <button
                    type="button"
                    key={key}
                    className="daily__day"
                    data-today={key === todayKey || undefined}
                    data-has={has || undefined}
                    aria-pressed={selected === d}
                    aria-label={`${view.m + 1}月${d}日${has ? "，有记录" : ""}`}
                    onClick={(event) => {
                      // Double click has no meaning here. Its second click
                      // is dropped, so it acts as one click rather than
                      // selecting and immediately releasing the day.
                      if (event.detail > 1) return;
                      pick(d);
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="daily__side">
            {selected !== null ? (
              <DayPanel
                y={view.y}
                m={view.m}
                d={selected}
                month={current}
              />
            ) : (
              <MonthList
                y={view.y}
                m={view.m}
                month={current}
                onPick={pick}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
