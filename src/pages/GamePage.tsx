import { useEffect, useRef, useState } from "react";
import { loadRandomField, prefetchRandomField } from "../content/random";
import {
  game,
  randomFields,
  site,
  type RandomFieldId,
} from "../site.config";

/**
 * The word draw: pick a field (or all of them), press the button, and a term
 * from that field's list flickers for five seconds before it settles.
 *
 * The result is decided the moment the button is pressed, in two steps:
 * first a field, uniformly; then a word within it, uniformly. So under 全领域
 * every field has the same chance however long its list is — a 450-word list
 * does not crowd out a 280-word one. The five seconds are only the show:
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

type Choice = RandomFieldId | "all";
type Phase = "idle" | "loading" | "spinning" | "done" | "error";

const fieldIds: RandomFieldId[] = randomFields.map((f) => f.id);
const fieldTitle = Object.fromEntries(
  randomFields.map((f) => [f.id, f.title]),
) as Record<RandomFieldId, string>;

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

export function GamePage() {
  const [choice, setChoice] = useState<Choice>("all");
  const [phase, setPhase] = useState<Phase>("idle");
  const [word, setWord] = useState<string | null>(null);
  /** The field the current or last draw came from. */
  const [drawnField, setDrawnField] = useState<RandomFieldId | null>(null);
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

  const draw = () => {
    if (busy) return;

    // Step one: the field. Step two, once its list is in: the word.
    const id = choice === "all" ? pickOne(fieldIds) : choice;
    const current = ++run.current;
    const startedAt = performance.now();
    clearTimeout(timer.current);
    setDrawnField(id);
    setPhase("loading");

    loadRandomField(id).then(
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

  // Under 全领域 the field stays hidden until the word lands, so the reveal
  // is one moment rather than two.
  const fieldLabel =
    choice !== "all"
      ? fieldTitle[choice]
      : (phase === "done" || phase === "error") && drawnField
        ? fieldTitle[drawnField]
        : "全领域";

  let display: string;
  if (phase === "error") display = "加载失败";
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
            {randomFields.length} Fields
          </span>
        </header>

        <div className="game__bar">
          <label className="label game__select-label" htmlFor="game-field">
            领域
          </label>
          <select
            id="game-field"
            className="game__select"
            value={choice}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as Choice;
              setChoice(next);
              if (next !== "all") prefetchRandomField(next);
              if (phase === "error") setPhase("idle");
            }}
          >
            <option value="all">全领域随机</option>
            {randomFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>

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
          {phase === "done" && word && drawnField
            ? `抽到的词语为：${word}，它来自${fieldTitle[drawnField]}`
            : phase === "error"
              ? "词库加载失败，稍后再试。"
              : ""}
        </p>

        <div className="game__foot">
          <button
            type="button"
            className="game__draw"
            onClick={draw}
            disabled={busy}
          >
            {busy ? "抽取中…" : phase === "done" ? "再抽一个" : "抽一个"}
          </button>
        </div>
      </div>
    </div>
  );
}
