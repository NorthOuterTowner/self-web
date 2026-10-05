import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { ArticleBody } from "../components/ArticleBody";
import { allNotes, getNote, getNoteNeighbours, notePath } from "../content";
import { formatDate } from "../content/types";
import { gsap, setupGsap } from "../lib/gsapSetup";
import { noteKindById, others, site, type NoteKindId } from "../site.config";
import { NotFound } from "./NotFound";

/**
 * Reading one note.
 *
 * No sidebar and no table of contents: these pieces are a few lines long, so
 * an index of their sections would be longer than the sections. What replaces
 * it is the genre, the date and the length — the same three facts the
 * constellation uses to place the dot you arrived from.
 */
export function NotePage() {
  const { slug } = useParams();
  const root = useRef<HTMLDivElement>(null);
  const note = getNote(slug);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    if (!note) return;
    document.title = `${note.title} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;

    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline();
      tl.from(".note__eyebrow > *", {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.05,
      })
        .from(".note__title", { y: 24, opacity: 0, duration: 0.7 }, 0.06)
        .from(
          [".note__lede", ".prose > *"],
          { y: 16, opacity: 0, duration: 0.6, stagger: 0.05 },
          0.16,
        );
    });

    return () => mm.revert();
  }, [note]);

  if (!note) return <NotFound />;

  const kind = noteKindById[note.kind as NoteKindId];
  const { prev, next } = getNoteNeighbours(note);

  return (
    <div className="page page--reading" data-accent-tone={kind.tone}>
      <div className="shell note" ref={root}>
        <header className="blog__masthead">
          <Link to={`/${others.slug}`} className="blog__masthead-title">
            {others.title}
            <span className="blog__masthead-en">{others.titleEn}</span>
          </Link>
          <span className="label blog__masthead-count">{kind.title}</span>
        </header>

        <article className="note__body">
          <div className="note__eyebrow">
            <span className="label">{kind.titleEn}</span>
            <span className="note__eyebrow-sep" aria-hidden="true" />
            <span className="label">{formatDate(note.date)}</span>
            <span className="note__eyebrow-sep" aria-hidden="true" />
            <span className="label">{note.chars} 字</span>
          </div>

          <h1 className="note__title">{note.title}</h1>
          {/* Someone else's piece. Marked up as a byline rather than folded
              into the title, so it reads as a credit and not as a subtitle. */}
          {note.author && (
            <p className="note__author">
              <span className="label">By</span>
              {note.author}
            </p>
          )}
          {note.lede && <p className="note__lede">{note.lede}</p>}

          <ArticleBody blocks={note.blocks} />

          {note.tags.length > 0 && (
            <ul className="article__tags">
              {note.tags.map((tag) => (
                <li className="article__tag" key={tag}>
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <nav className="article__nav" aria-label="更早 / 更晚">
            {prev && (
              <Link to={notePath(prev)} className="article__nav-item">
                <span className="label">← 更早</span>
                <span className="article__nav-title">{prev.title}</span>
              </Link>
            )}
            {next && (
              <Link
                to={notePath(next)}
                className="article__nav-item article__nav-item--next"
              >
                <span className="label">更晚 →</span>
                <span className="article__nav-title">{next.title}</span>
              </Link>
            )}
          </nav>

          <div className="note__foot">
            <Link to={`/${others.slug}`} className="toc__back">
              ← 全部杂谈
            </Link>
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}

/**
 * All notes, grouped by genre.
 *
 * The home page's field is organised by when and how long; this page is
 * organised by what kind of thing it is. Two different questions, so two
 * different arrangements rather than the same list twice.
 */
export function OthersIndex() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${others.title} — ${site.name}`;

    setupGsap();
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia(scope);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".others-index__group", {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.07,
      });
    });
    return () => mm.revert();
  }, []);

  const groups = Object.values(noteKindById)
    .map((kind) => ({
      kind,
      notes: allNotes.filter((n) => n.kind === kind.id),
    }))
    .filter((g) => g.notes.length > 0);

  return (
    <div className="page page--reading">
      <div className="shell others-index" ref={root}>
        <header className="blog__masthead">
          <p className="blog__masthead-title">
            {others.title}
            <span className="blog__masthead-en">{others.titleEn}</span>
          </p>
          <span className="label blog__masthead-count">
            {String(allNotes.length).padStart(2, "0")} Notes
          </span>
        </header>

        <p className="others__intro">{others.intro}</p>

        {groups.map(({ kind, notes }) => (
          <section className="others-index__group" key={kind.id}>
            <p className="toc__heading">
              <span className="toc__heading-label">{kind.title}</span>
              <span className="toc__heading-rule" aria-hidden="true" />
              <span className="toc__heading-count">
                {String(notes.length).padStart(2, "0")}
              </span>
            </p>
            <ol className="others__list others__list--always">
              {notes.map((note) => (
                <li key={note.slug}>
                  <Link
                    to={notePath(note)}
                    className="others__row"
                    data-tone={kind.tone}
                  >
                    <span className="others__row-kind label">
                      {note.chars} 字
                    </span>
                    <span className="others__row-title">{note.title}</span>
                    <span className="others__row-meta label">
                      {formatDate(note.date)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <div className="note__foot">
          <Link to="/" className="toc__back">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
