import { useEffect } from "react";
import { Link } from "react-router-dom";
import { site, type StubMeta } from "../site.config";

/**
 * A declared destination that has nothing behind it yet.
 *
 * Reuses the empty-category layout rather than inventing a "coming soon"
 * treatment: that state already exists in this design, it already reads as a
 * deliberate placeholder instead of a failure, and borrowing it means no new
 * CSS to maintain for a page that is meant to be replaced.
 *
 * Deliberately not a 404. A nav link that leads to Not Found tells the reader
 * the site is broken; this tells them the section is coming, which is true.
 */
export function StubPage({ meta }: { meta: StubMeta }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${meta.title} — ${site.name}`;
  }, [meta]);

  return (
    <div className="page page--reading">
      <div className="shell blog">
        <header className="blog__masthead">
          <p className="blog__masthead-title">
            {meta.title}
            <span className="blog__masthead-en">{meta.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">Soon</span>
        </header>

        <div className="blog__empty">
          <p className="blog__empty-lede">{meta.intro}</p>
          <p className="blog__empty-note">
            这一节还没有建起来。
          </p>
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
