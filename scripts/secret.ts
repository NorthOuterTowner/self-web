/**
 * Seals `private/secret.html` into `src/content/secret.enc.json`.
 *
 *     bun run secret
 *
 * Run it by hand whenever the page or the roster changes, and commit the
 * result. The two inputs live in `private/`, which is gitignored, and the
 * output is the only one of the three that is committed and deployed — the
 * host serves static files, so the ciphertext has to be uploaded, while the
 * plaintext and the roster never need to be, because the key comes from what
 * a reader types rather than from the server.
 *
 * The crypto itself is in `src/lib/secretKey.ts`, shared with the page that
 * opens this, so the two cannot drift apart.
 */

import { randomBytes } from "node:crypto";
import {
  KDF_DEFAULTS,
  b64,
  deriveKey,
  normalizeIdentity,
  pad,
  seal,
  type Envelope,
} from "../src/lib/secretKey";

/** One reader, as written in `private/roster.json`. */
interface RosterEntry {
  /** Yours to read; never hashed, never shipped. */
  note?: string;
  /**
   * Every spelling this person might type. Each one becomes its own slot,
   * which is how 陳 against 陈, or Lü against Lv, is handled: normalisation
   * cannot fold different characters together, so both are enrolled.
   */
  names: string[];
  /** YYYY-MM-DD. */
  birthday: string;
}

/**
 * Slots are padded out to this many with random bytes, so the file does not
 * announce how many readers there are. Raise it if the roster ever gets
 * longer; every slot costs 60 bytes and one AES call per attempt.
 *
 * Neither cost is worth trading anything for. The salt is shared, so an
 * attempt is still one Argon2id however many slots there are; only the AES
 * tries scale. Measured under Bun: 16 slots 0.9 ms, 100 slots 4.3 ms, 1000
 * slots 45 ms, against a derivation of around ten seconds. So the KDF's cost
 * is not reduced to pay for the padding: there is nothing to pay for.
 */
const SLOT_COUNT = 100;

const PLAINTEXT = "private/secret.html";
const ROSTER = "private/roster.json";
const OUT = "src/content/secret.enc.json";

function fail(message: string): never {
  console.error(`secret: ${message}`);
  process.exit(1);
}

const html = await Bun.file(PLAINTEXT)
  .text()
  .catch(() => fail(`${PLAINTEXT} 读不到。明文放这里，它不会进仓库`));

const roster: RosterEntry[] = await Bun.file(ROSTER)
  .json()
  .catch(() => fail(`${ROSTER} 读不到或不是合法 JSON`));

if (!Array.isArray(roster) || roster.length === 0) {
  fail(`${ROSTER} 是空的，至少要有一个人`);
}

// Every (name, birthday) pair, flattened, with the dates checked here rather
// than at the door: a typo in the roster would otherwise show up as nothing
// more than a reader who cannot get in.
const identities: Array<{ note: string; identity: string }> = [];
for (const [i, entry] of roster.entries()) {
  const who = entry.note ?? `#${i + 1}`;
  if (!Array.isArray(entry.names) || entry.names.length === 0) {
    fail(`${who} 没有 names`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.birthday ?? "")) {
    fail(`${who} 的 birthday 要写成 YYYY-MM-DD，现在是 ${entry.birthday}`);
  }
  for (const name of entry.names) {
    if (name.trim() === "") fail(`${who} 有一个空名字`);
    identities.push({
      note: who,
      identity: normalizeIdentity(name, entry.birthday),
    });
  }
}

const seen = new Map<string, string>();
for (const { note, identity } of identities) {
  const first = seen.get(identity);
  // Two readers who normalise to the same string would share a slot, which
  // works but means one of them is enrolled twice over and the roster is
  // lying about its size.
  if (first) fail(`${note} 和 ${first} 规范化之后完全一样，去掉一个`);
  seen.set(identity, note);
}

if (identities.length > SLOT_COUNT) {
  fail(
    `一共 ${identities.length} 个名字，超过了 ${SLOT_COUNT} 个槽位，把 SLOT_COUNT 调大`,
  );
}

const kdf = { ...KDF_DEFAULTS, salt: b64.encode(randomBytes(16)) };
const contentKey = new Uint8Array(randomBytes(32));

const slots: string[] = [];
for (const { note, identity } of identities) {
  console.log(`  派生 ${note}`);
  slots.push(await seal(await deriveKey(identity, kdf), contentKey));
}

// Decoys. The same length as a real slot, and they open for nobody, since
// no key was ever derived for them.
const width = slots[0]!.length;
while (slots.length < SLOT_COUNT) {
  slots.push(b64.encode(new Uint8Array(randomBytes((width * 3) / 4))));
}

// Fisher-Yates, so the order says nothing about the order of the roster.
for (let i = slots.length - 1; i > 0; i--) {
  const j = randomBytes(1)[0]! % (i + 1);
  [slots[i], slots[j]] = [slots[j]!, slots[i]!];
}

const envelope: Envelope = {
  v: 1,
  kdf,
  slots,
  body: await seal(contentKey, pad(html)),
};

await Bun.write(OUT, `${JSON.stringify(envelope, null, 2)}\n`);

const size = (await Bun.file(OUT).arrayBuffer()).byteLength;
console.log(
  `secret: ${OUT}  ${identities.length} 个名字 / ${roster.length} 人，共 ${SLOT_COUNT} 个槽，${(size / 1024).toFixed(1)} KB`,
);
console.log("secret: 把这个文件提交上去，private/ 里的两个文件留在本地");
