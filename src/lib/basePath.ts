/**
 * Router basename.
 *
 * GitHub Pages project sites are served from /<repo>/, so the router's basename
 * has to match the bundler's --public-path. `__BASE_PATH__` is substituted at
 * build time by the `build:pages` script; in dev the identifier does not exist
 * at all, which is why the guard uses `typeof` — that form is legal on an
 * undeclared identifier and evaluates to "undefined" instead of throwing.
 */
declare const __BASE_PATH__: string | undefined;

function readInjectedBase(): string {
  return typeof __BASE_PATH__ === "string" ? __BASE_PATH__ : "";
}

/** "" in dev, "/self-web" on GitHub Pages. Never has a trailing slash. */
export const BASE_PATH: string = readInjectedBase().replace(/\/+$/, "");

/** Prefix an app-absolute path with the basename. For non-router URLs. */
export function withBase(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${clean}`;
}
