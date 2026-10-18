/**
 * One attempt at the door, from the page's point of view.
 *
 * Hides which thread did the work. The worker is tried first; if it cannot be
 * created or fails for any reason, the same functions run on this thread
 * instead. The fallback is slower to look at — nothing repaints while it runs
 * — but it opens the page, which is the part that matters, and it means a
 * browser that refuses workers (or a build that somehow shipped without one)
 * degrades rather than breaks.
 */

import { withBase } from "./basePath";
import { deriveKey, openEnvelope, type Envelope } from "./secretKey";
import type { OpenReply, OpenRequest } from "./secretWorker";

/** Thrown into `html` when the reader walks away mid-attempt. */
export const CANCELLED = Symbol("cancelled");

export interface Attempt {
  /** The page if a slot opened, `null` if none did. */
  html: Promise<string | null>;
  /** Stop waiting. `html` rejects with `CANCELLED`. */
  cancel: () => void;
}

/** Built by `scripts/build.ts`; served by `src/index.ts` in development. */
const WORKER_URL = withBase("/secret-worker.js");

export function attemptOpen(identity: string, envelope: Envelope): Attempt {
  let worker: Worker | undefined;
  let finish: ((found: string | null) => void) | undefined;
  let fail: ((reason: unknown) => void) | undefined;

  const done = (found: string | null) => {
    const settle = finish;
    finish = undefined;
    fail = undefined;
    worker?.terminate();
    worker = undefined;
    settle?.(found);
  };

  const give = (reason: unknown) => {
    const settle = fail;
    finish = undefined;
    fail = undefined;
    worker?.terminate();
    worker = undefined;
    settle?.(reason);
  };

  const html = new Promise<string | null>((resolve, reject) => {
    finish = resolve;
    fail = reject;

    const inThread = async () => {
      // Two yields before the thread is taken away, so the dialog that
      // reports on this has painted at least once. Without them the page can
      // freeze while still showing the form and the "打开" button, which
      // looks like a click that did nothing.
      await new Promise((paint) => requestAnimationFrame(paint));
      await new Promise((settle) => setTimeout(settle, 0));
      const key = await deriveKey(identity, envelope.kdf);
      return (await openEnvelope(envelope, key)) ?? null;
    };

    /** The worker could not do it. Do it here instead. */
    const withoutWorker = (why: unknown) => {
      if (!finish) return;
      console.warn("secret: worker unavailable, deriving on this thread", why);
      worker?.terminate();
      worker = undefined;
      inThread().then(
        (found) => done(found),
        (error) => give(error),
      );
    };

    try {
      worker = new Worker(WORKER_URL, { type: "module" });
    } catch (error) {
      withoutWorker(error);
      return;
    }

    worker.onmessage = (event: MessageEvent<OpenReply>) => {
      const reply = event.data;
      if (reply.ok) done(reply.html);
      else withoutWorker(reply.error);
    };

    // Fires when the script itself will not load — a 404 on the worker URL,
    // which is what a missing build step looks like from in here.
    worker.onerror = (event) => {
      event.preventDefault();
      withoutWorker(event.message || "worker error");
    };

    const request: OpenRequest = { identity, envelope };
    worker.postMessage(request);
  });

  // Nobody is obliged to look at a rejection they asked for.
  html.catch(() => {});

  return { html, cancel: () => give(CANCELLED) };
}
