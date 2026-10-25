/**
 * Word lists for the draw at `/game`, fetched by URL one field at a time.
 *
 * Nothing here is in the bundle, and nothing is fetched when the page opens.
 * A field's list is requested only when a draw lands on it (or, for a single
 * field, as soon as it is picked in the select, so the draw starts warm), and
 * kept for the session. Every declared field is guaranteed to have a list:
 * `content:check` fails the build otherwise, so there is no index to fetch.
 *
 * Why the whole file rather than one line of it: a static host cannot serve
 * "line n". The only partial read is an HTTP Range request, which needs line
 * offsets known in advance, can split a multi-byte character, and is ignored
 * for gzipped responses. A list is ~4 KB as shipped and ~2 KB over the wire,
 * and the draw animation needs a stream of words to flicker through anyway.
 *
 * The build strips the lists to bare words joined by `\n` (see
 * `scripts/random.ts`), so reading one is a single `split`.
 */
import { withBase } from "../lib/basePath";
import type { RandomFieldId } from "../site.config";

const lists = new Map<RandomFieldId, Promise<string[]>>();

/**
 * One field's words, fetched on first ask and remembered for the session.
 * A failed request is forgotten so the next draw retries. On Pages a missing
 * file is a 404 whose body is the SPA's HTML, hence the status check.
 */
export function loadRandomField(id: RandomFieldId): Promise<string[]> {
  const hit = lists.get(id);
  if (hit) return hit;

  const request = fetch(withBase(`/data/random/${id}.txt`))
    .then(async (res) => {
      if (!res.ok) throw new Error(`random ${id}: HTTP ${res.status}`);
      const words = (await res.text()).split("\n").filter(Boolean);
      if (words.length === 0) throw new Error(`random ${id}: empty list`);
      return words;
    })
    .catch((error: unknown) => {
      lists.delete(id);
      throw error;
    });

  lists.set(id, request);
  return request;
}

/** Warm the cache without caring about the result. */
export function prefetchRandomField(id: RandomFieldId): void {
  loadRandomField(id).catch(() => {
    // A failed prefetch is retried by the draw itself.
  });
}
