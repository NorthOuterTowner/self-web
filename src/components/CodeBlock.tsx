import { useEffect, useRef, useState } from "react";
import { copyIcons } from "../lib/icons";

type CopyState = keyof typeof copyIcons;

/**
 * Puts `text` on the clipboard and reports whether that worked.
 *
 * Two routes, because the async Clipboard API only exists in a secure
 * context: https, or localhost. Opening the dev server from a phone over the
 * LAN is plain http, and there `navigator.clipboard` is simply undefined. The
 * deployed site is https and takes the first route; the second covers that
 * case, and browsers that refuse the first for permission reasons.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* denied, or the document lost focus: try the old route */
    }
  }
  return legacyCopy(text);
}

/**
 * `execCommand("copy")` from an off-screen textarea. Deprecated, but still
 * supported everywhere, and the only thing that works outside a secure
 * context.
 */
function legacyCopy(text: string): boolean {
  // Selecting the textarea takes focus. Without handing it back, a keyboard
  // user who pressed the button would land at the top of the document.
  const previous = document.activeElement as HTMLElement | null;

  const area = document.createElement("textarea");
  area.value = text;
  // readonly keeps the on-screen keyboard from opening on a phone, and 16px
  // stops iOS from zooming in when the field takes focus. Off-screen rather
  // than display: none, because a hidden element cannot be selected.
  area.readOnly = true;
  Object.assign(area.style, {
    position: "fixed",
    top: "0",
    left: "-9999px",
    fontSize: "16px",
    opacity: "0",
  });
  document.body.appendChild(area);

  let ok = false;
  try {
    area.select();
    // iOS Safari does not select a readonly field from select() alone.
    area.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  area.remove();
  previous?.focus();
  return ok;
}

/**
 * A fenced code block with a copy button.
 *
 * Copies `code`, the source string from the compiled block, rather than
 * reading the rendered DOM: that is exactly what was inside the fence, and it
 * cannot pick up the language label or the button's own text.
 *
 * The button is visible all the time, not revealed on hover. Hover does not
 * exist on a phone, and the skills page is meant to be copied from on one.
 */
export function CodeBlock({ lang, code }: { lang?: string; code: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const reset = useRef<number | undefined>(undefined);

  // Navigating away within the feedback window would otherwise leave the
  // pending reset to fire on an unmounted block.
  useEffect(() => () => window.clearTimeout(reset.current), []);

  const onCopy = async () => {
    const ok = await copyText(code);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(reset.current);
    // Failure stays up longer: it asks the reader to do something.
    reset.current = window.setTimeout(() => setState("idle"), ok ? 1800 : 3200);
  };

  const Glyph = copyIcons[state];

  return (
    <pre>
      <span className="prose__code-head">
        {lang && <span className="prose__code-lang">{lang}</span>}
        <button
          type="button"
          className="prose__copy"
          data-state={state}
          onClick={onCopy}
        >
          <Glyph className="prose__copy-icon" aria-hidden="true" />
          {state === "copied" ? (
            "已复制"
          ) : state === "failed" ? (
            "复制失败"
          ) : (
            <>
              复制
              {/* The visible word stays short; the accessible name says what
                  is being copied, and still starts with the word you see. */}
              <span className="sr-only">代码</span>
            </>
          )}
        </button>
      </span>
      <code>{code}</code>
      {/* Announces the result. A separate region rather than the button's own
          text, so the reset back to 复制 is not read out as well. */}
      <span className="sr-only" role="status">
        {state === "copied"
          ? "代码已复制到剪贴板"
          : state === "failed"
            ? "复制失败，请手动选择代码"
            : ""}
      </span>
    </pre>
  );
}
