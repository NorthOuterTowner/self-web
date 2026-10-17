import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { sections } from "../lib/sections";
import { site } from "../site.config";

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
            {sections.map(({ icon: Glyph, ...s }) => (
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
                  {/* Decorative: the label beside it already names the link. */}
                  {Glyph && <Glyph className="nav__icon" aria-hidden="true" />}
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
