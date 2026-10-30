import { useEffect, useRef, useState } from "react";
import { FieldPicker } from "../components/FieldPicker";
import { loadRandomField, prefetchRandomField } from "../content/random";
import {
  game,
  getRandomField,
  randomCategories,
  randomFieldList,
  site,
  type RandomFieldKey,
} from "../site.config";

/**
 * The word draw: tick some fields in the picker, press the button, and a term
 * from one of them flickers for five seconds before it settles.
 *
 * The result is decided the moment the button is pressed, in two steps:
 * first a field (小类) among the ticked ones, uniformly; then a word within
 * it, uniformly. The unit is the field, not the category: categories differ
 * in breadth, and a broad one gets its fair share by being split into more
 * fields, not by having a longer list. The five seconds are only the show:
 * random words from the same list, each held a little longer than the last,
 * so the flicker slows into the answer instead of stopping dead. With
 * reduced motion the answer appears as soon as the list is in.
 *
 * Only the drawn field's list is fetched. See `content/random.ts`.
 */

const SPIN_MS = 5000;
/** Hold time of a word at the start and at the very end of the spin. */
const HOLD_FIRST_MS = 45;
const HOLD_LAST_MS = 420;

type Phase = "idle" | "loading" | "spinning" | "done" | "error";

const ALL_KEYS: RandomFieldKey[] = randomFieldList.map((f) => f.key);

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** A random word that is not `prev`, so every tick visibly changes. */
function pickOther(words: readonly string[], prev: string | null): string {
  if (words.length < 2) return words[0]!;
  let word = pickOne(words);
  while (word === prev) word = pickOne(words);
  return word;
}

/** What the picker button and the stage say about the current selection. */
function describe(selected: ReadonlySet<RandomFieldKey>): string {
  if (selected.size === ALL_KEYS.length) return "全部领域";
  if (selected.size === 1) {
    const [only] = selected;
    return getRandomField(only!)?.label ?? "";
  }
  // Exactly one whole category, and nothing else.
  const whole = randomCategories.find(
    (c) =>
      c.fields.length === selected.size &&
      c.fields.every((f) => selected.has(`${c.id}/${f.id}`)),
  );
  if (whole) return whole.title;
  return `${selected.size} 个小类`;
}

export function GamePage() {
  const [selected, setSelected] = useState<Set<RandomFieldKey>>(
    () => new Set(ALL_KEYS),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [word, setWord] = useState<string | null>(null);
  /** The field the current or last draw came from. */
  const [drawnField, setDrawnField] = useState<RandomFieldKey | null>(null);
  /** Bumped on every displayed word, to restart the jump animation. */
  const [tick, setTick] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Identifies the live draw; a stale fetch or tick checks it and bails. */
  const run = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${game.title} — ${site.name}`;
    return () => {
      run.current++;
      clearTimeout(timer.current);
    };
  }, []);

  const busy = phase === "loading" || phase === "spinning";
  /** In declaration order, so the pool does not depend on tick order. */
  const pool = ALL_KEYS.filter((k) => selected.has(k));
  const summary = describe(selected);

  const draw = () => {
    if (busy || pool.length === 0) return;

    // Step one: the field. Step two, once its list is in: the word.
    const key = pickOne(pool);
    const current = ++run.current;
    const startedAt = performance.now();
    clearTimeout(timer.current);
    setDrawnField(key);
    setPhase("loading");

    loadRandomField(key).then(
      (words) => {
        if (current !== run.current) return;
        const final = pickOne(words);

        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        if (reduce) {
          setWord(final);
          setTick((n) => n + 1);
          setPhase("done");
          return;
        }

        setPhase("spinning");
        let shown: string | null = null;
        const step = () => {
          if (current !== run.current) return;
          // Measured from the press, so time spent fetching counts toward
          // the five seconds rather than adding to them.
          const t = (performance.now() - startedAt) / SPIN_MS;
          if (t >= 1) {
            setWord(final);
            setTick((n) => n + 1);
            setPhase("done");
            return;
          }
          shown = pickOther(words, shown);
          setWord(shown);
          setTick((n) => n + 1);
          // Cubic ease-in on the hold: fast for most of the run, then a
          // visible slowdown in the last second or so.
          const hold = HOLD_FIRST_MS + (HOLD_LAST_MS - HOLD_FIRST_MS) * t ** 3;
          timer.current = setTimeout(step, hold);
        };
        step();
      },
      () => {
        if (current === run.current) setPhase("error");
      },
    );
  };

  // With several fields ticked, the drawn one stays hidden until the word
  // lands, so the reveal is one moment rather than two.
  const drawn = drawnField ? getRandomField(drawnField) : undefined;
  const fieldLabel =
    pool.length === 1
      ? summary
      : (phase === "done" || phase === "error") && drawn
        ? drawn.label
        : summary;

  let display: string;
  if (phase === "error") display = "没能加载";
  else if (phase === "loading" || word === null) display = "?";
  else display = word;

  return (
    <div className="page page--reading">
      <div className="shell game">
        <header className="blog__masthead">
          <h1 className="blog__masthead-title">
            {game.title}
            <span className="blog__masthead-en">Word draw</span>
          </h1>
          <span className="label blog__masthead-count">
            {ALL_KEYS.length} Fields
          </span>
        </header>

        <div className="game__bar">
          <span className="label">领域</span>
          <button
            type="button"
            className="game__pick"
            aria-haspopup="dialog"
            disabled={busy}
            onClick={() => setPickerOpen(true)}
          >
            {summary}
            <span className="game__pick-n">
              {pool.length} / {ALL_KEYS.length}
            </span>
          </button>
        </div>

        <FieldPicker
          open={pickerOpen}
          selected={selected}
          onClose={() => setPickerOpen(false)}
          onConfirm={(next) => {
            setSelected(next);
            setPickerOpen(false);
            if (next.size === 1) prefetchRandomField([...next][0]!);
            if (phase === "error") setPhase("idle");
          }}
        />

        <div className="game__stage" data-phase={phase} aria-hidden="true">
          <p className="label game__field">{fieldLabel}</p>
          <p className="game__word">
            <span className="game__glyph" key={tick}>
              {display}
            </span>
          </p>
        </div>

        {/* The flicker is hidden from screen readers; only the answer is
            announced, once. */}
        <p className="sr-only" aria-live="polite">
          {phase === "done" && word && drawn
            ? `抽到：${word}，来自${drawn.label}`
            : phase === "error"
              ? "词库没能加载，稍后再试。"
              : ""}
        </p>

        <div className="game__foot">
          <button
            type="button"
            className="game__draw"
            onClick={draw}
            disabled={busy || pool.length === 0}
          >
            {busy ? "抽取中…" : phase === "done" ? "再抽一个" : "抽一个"}
          </button>
        </div>
      </div>
    </div>
  );
}
