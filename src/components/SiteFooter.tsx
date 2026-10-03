import { site } from "../site.config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <span className="label label--ink">{site.name}</span>
        <span className="label">
          © {site.since}–{new Date().getFullYear()}
        </span>
        <span className="label site-footer__spacer">
          <a
            className="link"
            href={site.github}
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
        </span>
        <span className="label">Bun · React · GSAP</span>
      </div>
    </footer>
  );
}
