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
   * It used to be `el.scrollIntoView({ behavior: "smooth", inline: "nearest" })`
   * on every route change, and on iOS that locked the bar: a smooth
   * programmatic scroll on a scroll-snap container — including the zero-length
   * one fired for 首页, which is always already in view — could leave WebKit
   * treating the container as mid-animation, and it then ignored the finger.
   * Cold-loading /game worked because that scroll had real distance to cover
   * and finished; going to 首页 broke it again. So now:
   *
   *   - nothing happens when the active link is already fully visible, which
   *     is always the case for 首页;
   *   - otherwise the list's own `scrollLeft` is set, instantly. No animation
   *     for the touch to fight, and unlike `scrollIntoView` it cannot scroll
   *     any ancestor (the window included) as a side effect.
   */
  useEffect(() => {
    const bar = list.current;
    const el = bar?.querySelector<HTMLElement>(".nav__link.is-active");
    if (!bar || !el) return;
    // Nothing to do when everything already fits.
    if (bar.scrollWidth <= bar.clientWidth) return;

    const box = bar.getBoundingClientRect();
    const link = el.getBoundingClientRect();
    // The right edge carries a fade (see nav.css); a link under it counts as
    // hidden, or the active item could sit there half-dimmed.
    const fade = parseFloat(getComputedStyle(bar).getPropertyValue("--nav-fade")) || 0;
    const overLeft = link.left - box.left;
    const overRight = link.right - (box.right - fade);
    if (overLeft < 0) bar.scrollLeft += overLeft;
    else if (overRight > 0) bar.scrollLeft += overRight;
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
