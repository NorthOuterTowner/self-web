import { site } from "../site.config";

/**
 * Footer icons are drawn inline rather than pulled from an icon set: the site
 * ships no external assets, and at 15px a hairline mark in the same stroke
 * weight as the nav glyph sits better than a filled brand logo would.
 *
 * The GitHub one is git's own branch graph, not the Octocat. Reproducing that
 * mark accurately means having the real path data, which is not something to
 * approximate — and with the word GITHUB set beside it there is nothing
 * ambiguous about where the link goes. Drop the official SVG in and it can be
 * swapped for the real thing.
 */
function GitBranchIcon() {
  return (
    <svg
      className="site-footer__icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="4.5" cy="3.4" r="1.9" />
      <circle cx="4.5" cy="12.6" r="1.9" />
      <circle cx="12" cy="3.4" r="1.9" />
      <path d="M4.5 5.3v5.4" />
      <path d="M12 5.3v1.0a2.1 2.1 0 0 1-2.1 2.1H6.6a2.1 2.1 0 0 0-2.1 2.1" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg
      className="site-footer__icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.2" y="1.2" width="13.6" height="13.6" rx="2.8" />
      {/* i */}
      <circle className="is-solid" cx="5" cy="5.4" r="0.95" />
      <path d="M5 7.3v4.3" />
      {/* n */}
      <path d="M8 11.6V7.3" />
      <path d="M8 9.1a1.75 1.75 0 0 1 3.5 0v2.5" />
    </svg>
  );
}

const SOCIAL = [
  { label: "GitHub", href: site.github, Icon: GitBranchIcon },
  { label: "LinkedIn", href: site.linkedin, Icon: LinkedInIcon },
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
          {SOCIAL.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                className="site-footer__link"
                href={href}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Icon />
                <span>{label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
