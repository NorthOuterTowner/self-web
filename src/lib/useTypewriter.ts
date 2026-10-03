import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface TypewriterState {
  /** The characters typed so far. */
  typed: string;
  /** True once the full string has been written. Never flips back. */
  done: boolean;
}

export interface TypewriterOptions {
  /** Milliseconds per character. */
  speed?: number;
  /** Pause before the first character. */
  startDelay?: number;
  /** Random variance added per character. */
  jitter?: number;
  /**
   * Hold the animation until this is true. Used to chain lines: the second
   * line passes the first line's `done`.
   */
  enabled?: boolean;
}

/**
 * Types `text` out exactly once and then stops for good — no loop, no reset.
 *
 * Progress is kept in refs rather than guarded by a "has run" flag. That
 * matters because React double-invokes effects in StrictMode: a flag would let
 * the first run's cleanup cancel the timer while the second run skips setup,
 * and the line would never appear in development. Keeping the character count
 * outside React state means a remount resumes where it left off, and a line
 * that already finished is restored instantly instead of replayed.
 */
export function useTypewriter(
  text: string,
  options: TypewriterOptions = {},
): TypewriterState {
  const { speed = 58, startDelay = 420, jitter = 26, enabled = true } = options;

  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  const typedCount = useRef(0);
  const finished = useRef(false);
  const source = useRef(text);

  useEffect(() => {
    if (!enabled) return;

    // Editing the copy restarts the animation; it is not a resume.
    if (source.current !== text) {
      source.current = text;
      typedCount.current = 0;
      finished.current = false;
      setDone(false);
    }

    const chars = Array.from(text);

    if (finished.current) {
      setTyped(text);
      setDone(true);
      return;
    }

    if (prefersReducedMotion()) {
      typedCount.current = chars.length;
      finished.current = true;
      setTyped(text);
      setDone(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      typedCount.current += 1;
      const count = typedCount.current;
      setTyped(chars.slice(0, count).join(""));

      if (count >= chars.length) {
        finished.current = true;
        setDone(true);
        return;
      }

      // A small random variance reads as a hand rather than a metronome,
      // with a longer pause after a space to suggest word boundaries.
      const isSpace = chars[count - 1] === " ";
      timer = setTimeout(
        tick,
        speed + Math.random() * jitter + (isSpace ? 90 : 0),
      );
    };

    // Only wait out the opening pause on a genuine start, not on a resume.
    timer = setTimeout(tick, typedCount.current === 0 ? startDelay : speed);
    return () => clearTimeout(timer);
  }, [enabled, text, speed, startDelay, jitter]);

  return { typed, done };
}
