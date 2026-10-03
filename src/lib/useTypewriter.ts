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

/**
 * Types `text` out exactly once and then stops for good.
 *
 * Deliberately not a loop: the hero line is written on arrival and stays put.
 * Guards against React's double-invoked effects in StrictMode so the animation
 * cannot restart or interleave with itself.
 */
export function useTypewriter(
  text: string,
  options: { speed?: number; startDelay?: number; jitter?: number } = {},
): TypewriterState {
  const { speed = 58, startDelay = 420, jitter = 26 } = options;

  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  // Survives StrictMode remounts, so the line is only ever animated once.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (prefersReducedMotion()) {
      setTyped(text);
      setDone(true);
      return;
    }

    const chars = Array.from(text);
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      index += 1;
      setTyped(chars.slice(0, index).join(""));

      if (index >= chars.length) {
        setDone(true);
        return;
      }

      // A small random variance reads as a hand rather than a metronome,
      // with a longer pause after a space to suggest word boundaries.
      const isSpace = chars[index - 1] === " ";
      const delay = speed + Math.random() * jitter + (isSpace ? 90 : 0);
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, startDelay);
    return () => clearTimeout(timer);
  }, [text, speed, startDelay, jitter]);

  return { typed, done };
}
