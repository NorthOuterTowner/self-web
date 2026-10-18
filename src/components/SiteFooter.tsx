import { Link } from "react-router-dom";
import { socialIcons } from "../lib/icons";
import { secret, site } from "../site.config";

/**
 * The marks are Phosphor's GitHub and LinkedIn logos.
 *
 * These used to be hand-drawn, and the GitHub one was git's branch graph
 * rather than the Octocat, because getting that mark right needs the real
 * path data and approximating a logo is worse than not using it. Phosphor
 * ships the real marks, so that is no longer a trade-off.
 *
 * They still add no external asset: each icon is a component that renders
 * inline SVG, bundled with the rest of the JS. And the regular weight is an
 * outline, so it keeps the hairline look the hand-drawn pair was going for —
 * the filled brand logo would sit heavier than anything else in the footer.
 *
 * The third is the lock, which is a route rather than an outside link, so
 * the row holds both kinds: `to` for somewhere on this site, `href` for
 * somewhere else.
 */
const LINKS: Array<{
  label: string;
  href?: string;
  to?: string;
  Icon: (typeof socialIcons)[keyof typeof socialIcons];
}> = [
  { label: "GitHub", href: site.github, Icon: socialIcons.github },
  { label: "LinkedIn", href: site.linkedin, Icon: socialIcons.linkedin },
  { label: secret.label, to: `/${secret.slug}`, Icon: socialIcons.secret },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <span className="label label--ink">{site.name}</span>
        <span className="label">
          © {site.since}–{new Date().getFullYear()}
        </span>

        <ul className="site-footer__social">
          {LINKS.map(({ label, href, to, Icon }) => (
            <li key={label}>
              {to ? (
                <Link className="site-footer__link" to={to}>
                  <Icon className="site-footer__icon" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ) : (
                <a
                  className="site-footer__link"
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Icon className="site-footer__icon" aria-hidden="true" />
                  <span>{label}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
