/**
 * Types for hash-wasm's argon2-only bundle.
 *
 * The package ships declarations for its root, but not for the per-algorithm
 * files, and `lib/secretKey.ts` imports one of those on purpose — the root
 * drags in twenty hashes' worth of embedded WASM. Rather than describe
 * `argon2id` again here, this points at the declaration the package already
 * has, so the signature cannot drift from the real one.
 */
declare module "hash-wasm/dist/argon2.umd.min.js" {
  export const argon2id: typeof import("hash-wasm").argon2id;
  export const argon2i: typeof import("hash-wasm").argon2i;
  export const argon2d: typeof import("hash-wasm").argon2d;
  export const argon2Verify: typeof import("hash-wasm").argon2Verify;
}
