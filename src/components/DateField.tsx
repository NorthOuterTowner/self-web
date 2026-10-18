import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * A date typed in three boxes: YYYY / MM / DD.
 *
 * Written because `<input type="date">` is the wrong control for a birthday
 * that has to match a string on the other side of a key derivation. Chrome's
 * year segment takes six digits and never moves on by itself, Firefox's is a
 * free text box with a locale-shaped placeholder, and Safari's is a spinner —
 * so what a reader sees, and whether four digits is enough to reach the
 * month, depends on which browser they happen to be in. None of them say
 * anything at all until the whole thing is filled.
 *
 * Three boxes of fixed width say the shape of the answer before anything is
 * typed, and the caret moves on when a box is full, which is the behaviour
 * everyone already knows from typing a card number.
 *
 * Only digits go in, and only as many as fit. A month cannot start with a 2
 * and a day cannot start with a 4, so a single digit in those cases is
 * already the whole number: it is padded and the caret moves on. Everything
 * else is settled when the box is left — `3` becomes `03`, `13` becomes `12`,
 * a 31st of February becomes the 29th or the 28th depending on the year.
 */

export interface DateParts {
  /** Exactly what was typed, digits only, never longer than its box. */
  year: string;
  month: string;
  day: string;
}

export const EMPTY_DATE: DateParts = { year: "", month: "", day: "" };

type Part = keyof DateParts;

const ORDER: readonly Part[] = ["year", "month", "day"];
const WIDTH: Record<Part, number> = { year: 4, month: 2, day: 2 };
const PLACEHOLDER: Record<Part, string> = {
  year: "YYYY",
  month: "MM",
  day: "DD",
};

/**
 * The earliest year the field will accept. Not a guess at anyone's age — just
 * far enough back that a plausible birthday is never refused, and close
 * enough that a slipped digit (`0199`, `9199`) is caught at the door rather
 * than becoming a key that opens nothing.
 */
const EARLIEST_YEAR = 1900;

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one, and the Date
  // constructor knows about leap years — including the 1900 and 2100 cases
  // that a `% 4` test gets wrong.
  return new Date(year, month, 0).getDate();
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** True once all three boxes hold a date that exists. */
export function isDateComplete(date: DateParts): boolean {
  const year = Number(date.year);
  const month = Number(date.month);
  const day = Number(date.day);
  if (date.year.length !== 4 || date.month === "" || date.day === "") {
    return false;
  }
  if (year < EARLIEST_YEAR || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** `YYYY-MM-DD`, which is what the key derivation is expecting. */
export function formatDate(date: DateParts): string {
  const month = date.month.padStart(2, "0");
  const day = date.day.padStart(2, "0");
  return `${date.year}-${month}-${day}`;
}

interface DateFieldProps {
  value: DateParts;
  onChange: (next: DateParts) => void;
  disabled?: boolean;
  /** Ties the whole group to one visible label. */
  labelledBy: string;
}

export function DateField({
  value,
  onChange,
  disabled = false,
  labelledBy,
}: DateFieldProps) {
  const boxes = useRef<Partial<Record<Part, HTMLInputElement | null>>>({});

  /**
   * The value as of the last write, not as of the last render.
   *
   * Needed because one gesture can write twice before React paints once.
   * Filling the year moves the caret to the month, and moving the caret
   * blurs the year, so `settle("year")` runs *inside* the year's own change
   * handler — where the `value` prop is still the three digits that were
   * there before the fourth was typed. Read from the prop, it would see an
   * unfinished year and leave `0199` alone, and a month settling the same
   * way would clamp `02` back to `01`.
   */
  const latest = useRef(value);
  latest.current = value;

  /** Every write goes through here, so the ref cannot fall behind. */
  const put = (next: DateParts) => {
    latest.current = next;
    onChange(next);
  };

  const focus = (part: Part, caret: "start" | "end" = "start") => {
    const box = boxes.current[part];
    if (!box) return;
    box.focus();
    // Called after `focus()`, so it overrides the select-all in the focus
    // handler. `WIDTH.year` is past the end of any box; browsers clamp it,
    // which saves having to know the length — the box may be one digit
    // shorter than it looks, if this call follows an `onChange` that React
    // has not yet painted.
    const at = caret === "end" ? WIDTH.year : 0;
    box.setSelectionRange(at, at);
  };

  const next = (part: Part): Part | undefined =>
    ORDER[ORDER.indexOf(part) + 1];
  const previous = (part: Part): Part | undefined =>
    ORDER[ORDER.indexOf(part) - 1];

  /** Typed into one box. */
  const type = (part: Part, raw: string) => {
    const digits = raw.replace(/\D/gu, "").slice(0, WIDTH[part]);

    // A month that starts with 2–9, or a day that starts with 4–9, cannot
    // have a second digit: the number is finished as soon as it is begun.
    const single =
      digits.length === 1 &&
      ((part === "month" && Number(digits) > 1) ||
        (part === "day" && Number(digits) > 3));

    const written = single ? digits.padStart(2, "0") : digits;
    put({ ...latest.current, [part]: written });

    if (written.length === WIDTH[part]) {
      const after = next(part);
      if (after) focus(after);
    }
  };

  /** Left a box. Pad and pull into range, so what is shown is what is meant. */
  const settle = (part: Part) => {
    const now = latest.current;
    const digits = now[part];
    if (digits === "") return;

    if (part === "year") {
      // A half-typed year is left alone: padding `19` to `0019` would be
      // inventing a date, and clamping it to 1900 would be worse.
      if (digits.length < 4) return;
      const pulled = clamp(
        Number(digits),
        EARLIEST_YEAR,
        new Date().getFullYear(),
      );
      if (pulled !== Number(digits)) put({ ...now, year: `${pulled}` });
      return;
    }

    if (part === "month") {
      const month = clamp(Number(digits), 1, 12);
      const settled = { ...now, month: `${month}`.padStart(2, "0") };
      // A day already typed may no longer exist in the month now chosen.
      if (settled.day !== "" && now.year.length === 4) {
        const last = daysInMonth(Number(now.year), month);
        settled.day = `${clamp(Number(settled.day), 1, last)}`.padStart(2, "0");
      }
      put(settled);
      return;
    }

    const last =
      now.year.length === 4 && now.month !== ""
        ? daysInMonth(Number(now.year), Number(now.month))
        : 31;
    put({
      ...now,
      day: `${clamp(Number(digits), 1, last)}`.padStart(2, "0"),
    });
  };

  const key = (part: Part, event: KeyboardEvent<HTMLInputElement>) => {
    const box = event.currentTarget;
    const atStart = box.selectionStart === 0 && box.selectionEnd === 0;
    const atEnd =
      box.selectionStart === box.value.length &&
      box.selectionEnd === box.value.length;

    if (event.key === "Backspace" && atStart) {
      const before = previous(part);
      if (!before) return;
      event.preventDefault();
      // Reach back and rub out the last digit of the box behind, which is
      // what holding backspace through a card number does.
      const now = latest.current;
      put({ ...now, [before]: now[before].slice(0, -1) });
      focus(before, "end");
      return;
    }

    if (event.key === "ArrowLeft" && atStart) {
      const before = previous(part);
      if (!before) return;
      event.preventDefault();
      focus(before, "end");
      return;
    }

    if (event.key === "ArrowRight" && atEnd) {
      const after = next(part);
      if (!after) return;
      event.preventDefault();
      focus(after);
      return;
    }

    // `/`, `-` and `.` are all things a hand reaches for between the parts of
    // a date. Take any of them as "done with this box".
    if ("/-. ".includes(event.key) && box.value !== "") {
      event.preventDefault();
      settle(part);
      const after = next(part);
      if (after) focus(after);
    }
  };

  /**
   * A whole date pasted into any box fills all three. Without this, pasting
   * `1999-03-07` into the year would leave `1999` and nothing else, since
   * each box keeps only the digits that fit.
   */
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const parts = text.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/u);
    if (!parts) return;
    event.preventDefault();
    put({
      year: parts[1]!,
      month: parts[2]!.padStart(2, "0"),
      day: parts[3]!.padStart(2, "0"),
    });
    focus("day", "end");
  };

  return (
    <div
      className="datefield"
      role="group"
      aria-labelledby={labelledBy}
      data-disabled={disabled || undefined}
    >
      {ORDER.map((part, i) => (
        <span className="datefield__slot" key={part}>
          {i > 0 && (
            <span className="datefield__sep" aria-hidden="true">
              /
            </span>
          )}
          <input
            ref={(box) => {
              boxes.current[part] = box;
            }}
            className={`datefield__box datefield__box--${part}`}
            type="text"
            // `numeric` rather than `tel`: a phone pad on iOS, without the
            // `+ * #` keys that cannot go in a date anyway.
            inputMode="numeric"
            // Nudges Safari's autofill and iOS's keyboard towards digits.
            pattern="[0-9]*"
            autoComplete={
              part === "year"
                ? "bday-year"
                : part === "month"
                  ? "bday-month"
                  : "bday-day"
            }
            aria-label={{ year: "年", month: "月", day: "日" }[part]}
            placeholder={PLACEHOLDER[part]}
            maxLength={WIDTH[part]}
            size={WIDTH[part]}
            disabled={disabled}
            value={value[part]}
            onChange={(e) => type(part, e.target.value)}
            onKeyDown={(e) => key(part, e)}
            onPaste={paste}
            onBlur={() => settle(part)}
            // Clicking a full box replaces it rather than landing mid-number,
            // the way a native date segment does.
            onFocus={(e) => e.target.select()}
          />
        </span>
      ))}
    </div>
  );
}
