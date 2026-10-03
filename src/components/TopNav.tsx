import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { categories, site } from "../site.config";

const sections = [
  { to: "/", label: "首页", idx: "00", key: "home" },
  ...categories.map((c) => ({
    to: `/${c.slug}`,
    label: c.titleEn,
    idx: c.index,
    key: c.id,
  })),
];

export function TopNav() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${stuck ? " is-stuck" : ""}`}>
      <div className="shell nav__inner">
        <NavLink to="/" className="nav__mark" aria-label={`${site.name} — 首页`}>
          <span className="nav__glyph" aria-hidden="true" />
          <span className="nav__name">{site.name}</span>
          <span className="nav__name nav__name--short">{site.monogram}</span>
        </NavLink>

        <nav aria-label="站点分区">
          <ul className="nav__list">
            {sections.map((s) => (
              <li key={s.key}>
                <NavLink
                  to={s.to}
                  end={s.to === "/"}
                  data-accent-key={s.key}
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
