import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The dialog that stands in front of the reader while the key is derived.
 *
 * Ten seconds of silence reads as a broken page, so the wait is narrated. Be
 * clear about what the narration is: the four lines are a script and the
 * percentage is theatre. The real work is one indivisible Argon2id call that
 * cannot report on itself — it either finishes or it does not — so there is
 * nothing truthful to show but a spinner, and a spinner for ten seconds tells
 * the reader less than this does.
 *
 * What the dialog does not do is cost the reader a single second. The wait is
 * the key derivation and nothing else: the page opens the moment the worker
 * answers, whatever the bar happens to say at the time. The script is paced
 * to `expected` — a calibrated guess at the derivation, from
 * `expectedMs` — so on the machine it was measured on the two finish together
 * and the bar is not caught out. When the guess is wrong it is the bar that
 * gives way, in one of two directions: short, and it holds at `HOLD` until
 * the answer lands; long, and it jumps to 100% mid-sentence and gets out of
 * the way. Neither case delays anything.
 *
 * The timing is deliberately uneven. A bar that advances at a constant rate
 * for ten seconds is read as a countdown, and then every pause looks like a
 * fault; one that moves in bursts and stalls is read as work, which is what
 * this is. Nothing here is on a round number, and the script is re-rolled per
 * attempt, so two attempts do not look like a recording.
 */

const STAGES = [
  "开始身份提取工作...",
  "获取密钥中...",
  "资源文件解密...",
  "执行最终验证中...",
] as const;

/** Where the bar waits when the script is done and the work is not. */
const HOLD = 99;

/**
 * How long 100% stays on screen before the page replaces it, in ms.
 *
 * The only delay in here, and it is this short because it buys one thing:
 * without it the bar's last jump and the page swap land on the same frame,
 * and the reader sees the number go from 73 to a different page.
 */
const SETTLE = 200;

interface Point {
  /** ms since the attempt began. */
  t: number;
  pct: number;
}

interface Script {
  /** When each stage's line appears, in ms. `stages[0]` is always 0. */
  stages: number[];
  /** The bar's path, as corners to interpolate between. */
  points: Point[];
  /** When the last point is reached. */
  total: number;
}

const rand = (low: number, high: number) => low + Math.random() * (high - low);

/**
 * Rolls one attempt's worth of timing, paced to last about `expected` ms.
 *
 * The four stages split that evenly, give or take a tenth. Inside a stage the
 * bar is given three unequal steps: the time is split one way and the
 * distance another, so a step that owns half the clock might cover a
 * twentieth of the bar. That mismatch is the whole effect — it is what makes
 * the thing stall and then lurch.
 */
function roll(expected: number): Script {
  // Shares that always sum to one, in a random order.
  const shuffled = (shares: number[]) =>
    shares
      .map((share) => ({ share, where: Math.random() }))
      .sort((a, b) => a.where - b.where)
      .map((x) => x.share);

  const points: Point[] = [{ t: 0, pct: 0 }];
  const stages: number[] = [];

  // The bar is a little past a quarter when the second line appears, and so
  // on — ahead of the stages rather than level with them, which reads as
  // progress being made rather than as four equal quarters.
  const arrive = [rand(26, 31), rand(52, 58), rand(76, 82), rand(95, 97.5)];

  // A stage's share of the whole, loose enough that the four are visibly
  // different lengths. Floored, so a fast machine still shows all four lines
  // rather than flashing them.
  const share = Math.max(900, expected / STAGES.length);

  let at = 0;
  let pct = 0;
  for (let stage = 0; stage < STAGES.length; stage++) {
    stages.push(at);

    const span = share * rand(0.88, 1.12);
    const target = arrive[stage]!;
    const climb = target - pct;
    // Three steps: one that owns half the clock, one that owns a sixth, one
    // that owns a third — and, separately, one that covers most of the
    // distance, one that covers almost none, one that covers the rest. Which
    // share lands on which step is random, so a long stall sometimes comes
    // before the lurch and sometimes after.
    const clock = shuffled([0.52, 0.17, 0.31]);
    const distance = shuffled([0.62, 0.07, 0.31]);

    let walked = 0;
    for (let step = 0; step < 3; step++) {
      at += span * clock[step]!;
      walked += distance[step]! * climb;
      points.push({ t: at, pct: pct + walked });
    }

    pct = target;
    at += rand(60, 240); // a beat between stages
  }

  return { stages, points, total: points[points.length - 1]!.t };
}

/** Where the bar is at `elapsed`, following the script's corners. */
function along(script: Script, elapsed: number): number {
  const { points } = script;
  if (elapsed >= script.total) return points[points.length - 1]!.pct;

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!;
    const to = points[i]!;
    if (elapsed > to.t) continue;
    const span = to.t - from.t;
    const k = span <= 0 ? 1 : (elapsed - from.t) / span;
    // Eased at both ends, so a corner is a bend rather than a kink.
    const smooth = k * k * (3 - 2 * k);
    return from.pct + (to.pct - from.pct) * smooth;
  }
  return points[points.length - 1]!.pct;
}

export interface SecretProgressProps {
  /** `working` while the key is being derived; `failed` when it will not open. */
  phase: "working" | "failed";
  /** Why it failed, in the reader's words. Only read when `phase` is failed. */
  failure: string;
  /**
   * Roughly how long the derivation will take, in ms. Paces the bar, and
   * nothing else — see the note at the top of this file.
   */
  expected: number;
  /** True once the page has actually been decrypted. Lets the bar finish. */
  opened: boolean;
  /** Called once the bar has reached 100% and held there. */
  onReveal: () => void;
  /** Escape, or the button. Only offered while working. */
  onCancel: () => void;
  /** Dismisses the failure. */
  onDismiss: () => void;
}

export function SecretProgress({
  phase,
  failure,
  expected,
  opened,
  onReveal,
  onCancel,
  onDismiss,
}: SecretProgressProps) {
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  // Rolled once per mount — the dialog is mounted for exactly one attempt.
  const script = useRef<Script | null>(null);
  script.current ??= roll(expected);

  // `onReveal` must not be a dependency of the animation: it changes on every
  // render of the page, and restarting the loop would restart the bar.
  const reveal = useRef(onReveal);
  reveal.current = onReveal;
  const isOpened = useRef(opened);
  isOpened.current = opened;

  useEffect(() => {
    if (phase !== "working") return;

    const plan = script.current!;
    const began = performance.now();
    let frame = 0;
    let handedOver = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = now - began;

      // Checked before anything else: the work finishing is the end of the
      // wait, whatever the script was in the middle of. Nothing here is
      // allowed to hold the page back by so much as a frame.
      if (isOpened.current) {
        setPct(100);
        handedOver ||= window.setTimeout(() => reveal.current(), SETTLE);
        return;
      }

      const reached = plan.stages.filter((at) => elapsed >= at).length;
      setStage(Math.max(0, reached - 1));

      if (elapsed < plan.total) {
        setPct(along(plan, elapsed));
        return;
      }

      // Out of script, still working. Creep, slowly, and never arrive.
      const over = elapsed - plan.total;
      const last = plan.points[plan.points.length - 1]!;
      setPct(Math.min(HOLD, last.pct + over / 1600));
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (handedOver) clearTimeout(handedOver);
    };
  }, [phase]);

  // The dialog is the only thing on screen that matters while it is up.
  useEffect(() => {
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (phase === "working") onCancel();
      else onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, onCancel, onDismiss]);

  const failed = phase === "failed";
  const shown = Math.round(pct);

  return createPortal(
    <div className="veil" role="presentation">
      <div
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby="dlg-stage"
        tabIndex={-1}
        ref={panel}
        data-failed={failed || undefined}
      >
        <p className="label dlg__kicker">{failed ? "verification" : "argon2id"}</p>
        <h2 className="dlg__title" id="dlg-title">
          {failed ? "打开加密区失败" : "正在验证中..."}
        </h2>

        {failed ? (
          <>
            <p className="dlg__stage" id="dlg-stage">
              {failure}
            </p>
            <div className="dlg__foot">
              <button className="dlg__button" type="button" onClick={onDismiss}>
                返回
              </button>
            </div>
          </>
        ) : (
          <>
            {/* One line swapped in place, rather than a list that ticks
                itself off: this is not a checklist the reader is meant to
                audit, it is a note about what is happening now. */}
            <p className="dlg__stage" id="dlg-stage">
              {STAGES[stage]}
            </p>

            <div
              className="dlg__meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={shown}
              aria-label="验证进度"
            >
              {/* Scaled rather than resized: `transform` is composited, so
                  the bar keeps moving even if the main thread is busy — which
                  it is, on a browser that would not give us a worker. */}
              <span
                className="dlg__fill"
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </div>

            <div className="dlg__foot">
              <p className="dlg__pct">
                <span className="dlg__num">{shown}</span>%
              </p>
              <button className="dlg__button" type="button" onClick={onCancel}>
                取消
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
