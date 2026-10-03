import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { categories, site } from "../site.config";

export function NotFound() {
  useEffect(() => {
    document.title = `页面不存在 — ${site.name}`;
  }, []);

  return (
    <div className="page">
      <div className="shell blog">
        <header className="blog__masthead">
          <span className="index-num">404</span>
          <p className="blog__masthead-title">
            没有这个页面
            <span className="blog__masthead-en">Not Found</span>
          </p>
        </header>

        <div className="article__lede" style={{ borderTop: "none", marginTop: 0 }}>
          <p>链接可能已经改变，或者从未存在过。下面是现有的三条记录线。</p>
        </div>

        <nav className="toc__anchors" style={{ marginTop: "2rem" }}>
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/${c.slug}`}
              className="toc__anchor"
              data-accent={c.id}
            >
              {c.index} · {c.title}
            </Link>
          ))}
        </nav>

        <Link to="/" className="toc__back">
          ← 返回首页
        </Link>
      </div>
      <SiteFooter />
    </div>
  );
}
