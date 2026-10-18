/**
 * The gated page's crypto, shared by the two sides that must agree on it:
 * `scripts/secret.ts`, which seals the page, and `pages/SecretPage.tsx`,
 * which opens it. One file, so a change to the normalisation or the key
 * derivation cannot land on one side only — that would lock everyone out
 * with no error to read.
 *
 * ---- The shape of it ---------------------------------------------------
 *
 * Envelope encryption, the way a disk encryptor does it. The page is
 * encrypted once under a random content key; that content key is then
 * encrypted once per reader, under a key derived from what that reader
 * knows. So ten readers cost one copy of the page plus ten 60-byte slots,
 * rather than ten copies of the page.
 *
 * Opening it is trial decryption: derive a key from what was typed, then try
 * it against every slot. AES-GCM authenticates, so a slot either opens or
 * fails — there is nothing else to store to tell the two apart, and no way
 * to tell from the file which slot belongs to whom.
 *
 * ---- What this does and does not buy ----------------------------------
 *
 * Everything here is public: the code, the parameters, the ciphertext. The
 * only secret is what the reader types. A name plus a birthday is worth
 * perhaps 30 bits against someone who does not know the author, which
 * Argon2id at 64 MB stretches into months of GPU time. Against someone who
 * does know the author it is worth very little: they can guess ten names and
 * already know the birthdays. This keeps the page away from crawlers and
 * passers-by. It is not a secret-keeper.
 */

/** Argon2id parameters, written into the envelope so they can change later. */
export interface KdfParams {
  alg: "argon2id";
  /** Memory, in KiB. */
  m: number;
  /** Passes. */
  t: number;
  /** Lanes. */
  p: number;
  /** Base64. Shared by every slot, so a reader's attempt costs one hash. */
  salt: string;
}

export interface Envelope {
  v: 1;
  kdf: KdfParams;
  /**
   * The wrapped content key, once per reader, shuffled, and padded out with
   * random slots that open for nobody — so the file does not say how many
   * readers there are.
   */
  slots: string[];
  /** The page itself, sealed under the content key. */
  body: string;
}

/**
 * How much work one attempt costs.
 *
 * Both numbers are bought with the reader's patience, and they buy different
 * things. Memory is what blunts a GPU: at 128 MiB a card with 24 GB can hold
 * a couple of hundred of these at once, where it would run tens of thousands
 * of a memory-light hash in parallel. Passes are the straight sequential
 * cost, which no amount of hardware shortens.
 *
 * 128 MiB × 70 passes measured about ten seconds in Edge on the machine this
 * was written on, and fourteen on the first attempt after a cold load, when
 * the worker's WASM still has to be fetched and compiled. A phone will be
 * several times that. It is fifty times the cost of the settings this started
 * with, which were 64 MiB × 3 and came back in under 300 ms — fast enough
 * that a list of a few thousand plausible names was an afternoon's work for
 * anyone who cared to try.
 *
 * Ten seconds is a great deal to ask of someone typing their own name, and it
 * is only bearable because the page says what it is doing while it happens;
 * see `components/SecretProgress.tsx`, which also explains why the work moved
 * to a worker.
 *
 * It is also the whole defence. A name and a birthday is perhaps 30 bits, and
 * 30 bits only survives a determined guesser if each guess is expensive: at
 * ten seconds and 128 MiB a guess, a GPU that could run a hundred of these
 * at once still needs years for the space, where a cheap hash would clear it
 * over a lunch break.
 *
 * Changing these does nothing to a file that is already sealed. The
 * parameters are written into the envelope and read back out of it, so this
 * only takes effect on the next `bun run secret` — which is also the only
 * way to raise the cost for everyone, since the old envelope would otherwise
 * keep handing out the old numbers.
 */
export const KDF_DEFAULTS: Omit<KdfParams, "salt"> = {
  alg: "argon2id",
  m: 131072,
  t: 70,
  p: 1,
};

/**
 * A guess at how long `kdf` will take, in milliseconds.
 *
 * Only the progress bar reads this, and only to decide how fast to move. It
 * is not a deadline and nothing waits for it: the page opens when the key
 * comes back, early or late. If this guess is short the bar sits at 99% until
 * the work lands; if it is long the bar jumps to 100% and the page opens
 * mid-sentence. Both are honest, which is the point of not having the
 * animation decide anything.
 *
 * The constant is measured, not derived. Argon2id's cost is linear in memory
 * × passes, so one number calibrates the lot. Timed in headless Edge on the
 * machine this was written on, warm — the same worker already compiled, the
 * clocks already up:
 *
 *     128 MiB ×  30     4.6 – 6.1 s      (3840 MiB·passes)
 *     128 MiB ×  60     9.0 s            (7680)
 *     128 MiB ×  80    10.8 – 11.8 s     (10240)
 *     128 MiB × 100    14.6 – 16.6 s     (12800)
 *     128 MiB × 120    15.3 – 16.3 s     (15360)
 *
 * which is about 1.1 ms per MiB·pass. The number below is half again that,
 * because the attempt that matters is the first one on a freshly loaded page,
 * and that one also fetches and compiles the worker's WASM: the same
 * derivation that runs in 11.8 s warm took 16.2 s cold. Pacing to the slower
 * case is the right way to be wrong. A bar that guessed short holds at 99%
 * and looks stuck; one that guessed long jumps to 100% a little early, which
 * nobody minds.
 */
export function expectedMs(kdf: KdfParams): number {
  return (kdf.m / 1024) * kdf.t * 1.6;
}

/** Plaintext is padded up to a multiple of this, so its length says little. */
const BLOCK = 4096;

/**
 * Bytes backed by a plain ArrayBuffer.
 *
 * Stated because WebCrypto will not take a `Uint8Array<ArrayBufferLike>`:
 * that could be a view on a SharedArrayBuffer, which another thread could
 * rewrite underneath it mid-operation. Saying so once here is cheaper than
 * casting at every call.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export const b64 = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const byte of bytes) s += String.fromCharCode(byte);
    return btoa(s);
  },
  decode(text: string): Bytes {
    const s = atob(text);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  },
};

/**
 * What the typed name and birthday become before they are hashed.
 *
 * A name can be in any script, and the same name reaches this function in
 * more spellings than one would think. NFKC settles most of it: full-width
 * Ａ and half-width ｱ fold onto their ordinary forms, and a composed é and a
 * decomposed e + ´ become the same string — which matters because a Mac IME
 * and a Windows one disagree about that. Dropping every space covers
 * "Daniel Geng" against "DanielGeng", and lowercasing covers the rest of the
 * Latin names while leaving CJK and Arabic untouched.
 *
 * What it cannot settle is a different character: 陳 and 陈 are two
 * characters, not two spellings, and no normalisation unifies them. Same for
 * Lü against Lv against Lyu. Those are handled by enrolling a reader under
 * several names, one slot each — see `private/roster.json`.
 */
export function normalizeIdentity(name: string, birthday: string): string {
  const cleanName = name
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLowerCase();

  // Birthdays arrive with every separator anyone might reach for, and
  // sometimes without the leading zeros.
  const digits = birthday
    .normalize("NFKC")
    .match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/u);
  const date = digits
    ? `${digits[1]}-${digits[2]!.padStart(2, "0")}-${digits[3]!.padStart(2, "0")}`
    : birthday.normalize("NFKC").trim();

  // A separator that cannot occur in either half, so "ab" + "c" and "a" +
  // "bc" cannot derive the same key.
  return `${cleanName}\u0000${date}`;
}

/**
 * Argon2id over the normalised identity.
 *
 * Imported here rather than at the top of the file, and by the path to the
 * one algorithm rather than through the package root.
 *
 * `hash-wasm` bundles twenty-odd hash functions and embeds each one's WASM as
 * base64, so the root costs 211 KB minified — all of it in the entry chunk,
 * since this build does not split dynamic imports. The argon2-only bundle is
 * 29 KB. Everything else in there is a hash nothing on this site computes.
 *
 * The same import works under Bun, which is why the sealing script can share
 * this function. Its types come from `types/hash-wasm-argon2.d.ts`.
 */
export async function deriveKey(
  identity: string,
  kdf: KdfParams,
): Promise<Bytes> {
  const { argon2id } = await import("hash-wasm/dist/argon2.umd.min.js");
  const key = await argon2id({
    password: identity,
    salt: b64.decode(kdf.salt),
    memorySize: kdf.m,
    iterations: kdf.t,
    parallelism: kdf.p,
    hashLength: 32,
    outputType: "binary",
  });
  // hash-wasm types its output loosely; it allocates a fresh array, so this
  // is a plain buffer in fact, which is what WebCrypto needs. See `Bytes`.
  return key as Bytes;
}

async function aesKey(raw: Bytes, use: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [use]);
}

/** iv ‖ ciphertext, base64. One blob rather than a pair of fields. */
export async function seal(key: Bytes, plaintext: Bytes): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(key, "encrypt"),
      plaintext,
    ),
  );
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return b64.encode(out);
}

/** The inverse. `undefined` means this key does not open this blob. */
export async function unseal(
  key: Bytes,
  blob: string,
): Promise<Bytes | undefined> {
  try {
    const bytes = b64.decode(blob);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, 12) },
      await aesKey(key, "decrypt"),
      bytes.subarray(12),
    );
    return new Uint8Array(plain);
  } catch {
    // A failed authentication tag, which is the expected answer for every
    // slot but one. Not an error worth propagating.
    return undefined;
  }
}

/** Length-prefixed and padded to a whole number of blocks. */
export function pad(text: string): Bytes {
  const body = new TextEncoder().encode(text);
  const total = Math.ceil((body.length + 4) / BLOCK) * BLOCK;
  const out = crypto.getRandomValues(new Uint8Array(total));
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

export function unpad(bytes: Uint8Array): string {
  const length = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(0);
  return new TextDecoder().decode(bytes.subarray(4, 4 + length));
}

/**
 * Tries one derived key against every slot, and on a hit returns the page.
 *
 * Every slot is tried even once one has opened, so the work does not depend
 * on which reader is at the door.
 */
export async function openEnvelope(
  envelope: Envelope,
  key: Bytes,
): Promise<string | undefined> {
  let contentKey: Bytes | undefined;
  for (const slot of envelope.slots) {
    const found = await unseal(key, slot);
    if (found && found.length === 32) contentKey = found;
  }
  if (!contentKey) return undefined;

  const body = await unseal(contentKey, envelope.body);
  return body && unpad(body);
}
