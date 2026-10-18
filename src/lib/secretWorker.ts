/**
 * Opens the gated page off the main thread.
 *
 * Argon2id at these settings is ten seconds of straight computation, and
 * `hash-wasm` is synchronous: run on the main thread it freezes everything,
 * including the dialog that is supposed to be reporting on it. A progress bar
 * that cannot repaint is worse than no progress bar, so the work moves here
 * and the page is left free to animate.
 *
 * This file is its own bundle entry point — see the second `Bun.build` call
 * in `scripts/build.ts` and the `/secret-worker.js` route in `src/index.ts`.
 * Bun's bundler does not rewrite `new Worker(new URL("./x.ts", ...))`: it
 * leaves the TypeScript path in the output and emits nothing, so the browser
 * would ask the server for a `.ts` file and get the SPA fallback instead.
 * Naming the entry point explicitly is what makes the worker exist.
 *
 * The ciphertext is not bundled in here. It arrives in the message, so the
 * 140 KB envelope is not shipped twice.
 */

import { deriveKey, openEnvelope, type Envelope } from "./secretKey";

/** What the page sends. */
export interface OpenRequest {
  /** Already through `normalizeIdentity` — this side does not second-guess it. */
  identity: string;
  envelope: Envelope;
}

/** What comes back. `html: null` means no slot opened: wrong name or date. */
export type OpenReply =
  | { ok: true; html: string | null }
  | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<OpenRequest>) => {
  const post = (reply: OpenReply) =>
    (self as unknown as Worker).postMessage(reply);

  try {
    const { identity, envelope } = event.data;
    const key = await deriveKey(identity, envelope.kdf);
    post({ ok: true, html: (await openEnvelope(envelope, key)) ?? null });
  } catch (error) {
    // Anything thrown here is a bug or a browser that cannot do the work —
    // out of memory on the 128 MiB allocation, most likely. The page falls
    // back to deriving on its own thread when it sees this.
    post({ ok: false, error: error instanceof Error ? error.message : "failed" });
  }
};
