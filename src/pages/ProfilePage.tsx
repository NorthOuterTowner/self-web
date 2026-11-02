import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { withBase } from "../lib/basePath";
import { profile, site } from "../site.config";

/**
 * The résumé at `/profile`, reached from the footer.
 *
 * The text lives in `content/profile.html`, a hand-maintained HTML fragment
 * (it started life as LaTeX). It is fetched at runtime from
 * `/data/profile.html` — the build copies it there, the dev server reads it
 * from disk on every request — so it stays out of the bundle and an edit
 * shows up on reload without a rebuild.
 *
 * Injected as markup on purpose: the file is the site owner's own, it is the
 * whole point of the page, and `innerHTML` does not run <script> tags anyway.
 * Layout, type and colour all come from `styles/profile.css`, scoped to
 * `.cv`, so the fragment only has to carry structure.
 */

type State =
  | { status: "loading" }
  | { status: "ready"; html: string }
  | { status: "error" };

let cache: Promise<string> | undefined;

function loadProfile(): Promise<string> {
  cache ??= fetch(withBase("/data/profile.html"))
    .then(async (res) => {
      // On Pages a missing file is a 404 whose body is the SPA itself.
      if (!res.ok) throw new Error(`profile: HTTP ${res.status}`);
      return res.text();
    })
    .catch((error: unknown) => {
      cache = undefined;
      throw error;
    });
  return cache;
}

export function ProfilePage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${profile.title} — ${site.name}`;

    let live = true;
    loadProfile().then(
      (html) => live && setState({ status: "ready", html }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="page page--reading">
      <div className="shell profile">
        {state.status === "ready" ? (
          <article
            className="cv"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        ) : (
          <div className="cv">
            <h1 className="sr-only">{profile.title}</h1>
            <p className={state.status === "loading" ? "label" : "profile__error"}>
              {state.status === "loading" ? "Loading…" : "简介没能加载，稍后再试。"}
            </p>
          </div>
        )}

        <div className="profile__foot">
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
