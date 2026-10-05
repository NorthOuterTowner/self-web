/**
 * Entry point: mounts the router and pulls in the stylesheet layers.
 * Referenced from src/index.html, which is also the bundler's entry.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { BASE_PATH } from "./lib/basePath";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/nav.css";
import "./styles/hero.css";
import "./styles/cards.css";
import "./styles/others.css";
import "./styles/blog.css";

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Reuse the root across hot reloads in dev; create a fresh one in a build.
// `import.meta.hot.data` must be accessed directly — Bun rejects it when the
// value is read through a variable ("cannot be used indirectly").
// https://bun.com/docs/bundler/hot-reloading#import-meta-hot-data
if (import.meta.hot) {
  (import.meta.hot.data.root ??= createRoot(elem)).render(app);
} else {
  createRoot(elem).render(app);
}
