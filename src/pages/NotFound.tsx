import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "../components/SiteFooter";
import { sections } from "../lib/sections";
import { site } from "../site.config";

/**
 * Not Found, with a map of the site.
 *
 * The map is the top bar's own list, icons included, so it can never fall
 * behind it again. It used to list the three categories by hand and say
 * "下面是现有的三条记录线" — true when written, and wrong as soon as Skills,
 * Roadmap and Notes were added.
 *
 * No separate "← 返回首页": 首页 is the first tile.
 */
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
          <p>链接可能已经改变，或者从未存在过。下面是站内现有的全部入口。</p>
        </div>

        <nav className="sitemap" aria-label="站内入口">
          <ul className="sitemap__list">
            {sections.map(({ icon: Glyph, ...s }) => (
              <li key={s.key}>
                <Link
                  to={s.to}
                  className="sitemap__item"
                  data-accent-key={s.key}
                  style={s.style}
                >
                  {Glyph && (
                    <Glyph className="sitemap__icon" aria-hidden="true" />
                  )}
                  <span className="sitemap__title">{s.title}</span>
                  {/* 首页 has the same name in both, so it gets one line. */}
                  {s.label !== s.title && (
                    <span className="sitemap__en">{s.label}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <SiteFooter />
    </div>
  );
}
