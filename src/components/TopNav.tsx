import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { categories, navExtras, site } from "../site.config";

interface Section {
  to: string;
  label: string;
  idx: string;
  key: string;
  /**
   * Set only for the extras. Categories get their accent from the
   * `[data-accent-key]` rules already in nav.css; driving the extras from a
   * custom property instead keeps `navExtras` the only file to edit when one
   * is added.
   */
  style?: CSSProperties;
}

/**
 * Nav order: home, the three streams, then everything that is a destination
 * without being a stream.
 *
 * The split matters because the home page ring is built from `categories` and
 * has exactly three stations — so "in the nav" and "has a card" have to be
 * separate lists, or adding a link takes the ring apart.
 */
const sections: Section[] = [
  { to: "/", label: "首页", idx: "00", key: "home" },
  ...categories.map((c) => ({
    to: `/${c.slug}`,
    label: c.titleEn,
    idx: c.index,
    key: c.id,
  })),
  ...navExtras.map((e) => ({
    to: e.to,
    label: e.label,
    idx: e.idx,
    key: e.key,
    style: { "--accent-dot": `var(--${e.tone})` } as CSSProperties,
  })),
];

export function TopNav() {
  const [stuck, setStuck] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Brings the current section into view when the bar is scrollable.
   *
   * Without this, arriving at a section whose link sits off to the right
   * leaves the bar showing no active item at all — the indicator is there,
   * just not on screen. Reads the DOM rather than tracking which link is
   * active in state, because `NavLink` already decides that and duplicating
   * the matching logic would be a second source of truth.
   *
   * `nearest` so it only moves when it has to, and no smooth scrolling under
   * reduced motion.
   */
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(".nav__link.is-active");
    if (!el || !list.current) return;
    // Nothing to do when everything already fits.
    if (list.current.scrollWidth <= list.current.clientWidth) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [pathname]);

  return (
    <header className={`nav${stuck ? " is-stuck" : ""}`}>
      <div className="shell nav__inner">
        <NavLink to="/" className="nav__mark" aria-label={`${site.name} — 首页`}>
          <span className="nav__glyph" aria-hidden="true" />
          <span className="nav__name">{site.name}</span>
          <span className="nav__name nav__name--short">{site.monogram}</span>
        </NavLink>

        {/* `nav__sections` is the flex item in `.nav__inner`, so it — not the
            list inside it — is what has to be allowed to shrink for the bar
            to scroll on narrow screens. See nav.css. */}
        <nav className="nav__sections" aria-label="站点分区">
          <ul className="nav__list" ref={list}>
            {sections.map((s) => (
              <li key={s.key}>
                <NavLink
                  to={s.to}
                  end={s.to === "/"}
                  data-accent-key={s.key}
                  style={s.style}
                  className={({ isActive }) =>
                    `nav__link${isActive ? " is-active" : ""}`
                  }
                >
                  <span className="nav__link-idx" aria-hidden="true">
                    {s.idx}
                  </span>
                  <span>{s.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
