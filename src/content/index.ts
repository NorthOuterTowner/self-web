import type { CategoryId, SeriesMeta } from "../site.config";
import { categoryById, others, seriesIn } from "../site.config";
import { notes as generatedNotes, posts as generated } from "./generated";
import type { Note, Post } from "./types";

/**
 * Query layer over the compiled content.
 *
 * `generated.ts` is produced from content/**\/*.md by scripts/content.ts and
 * already arrives sorted newest first. Series ordering is derived here rather
 * than baked in, so the artefact keeps exactly one canonical order.
 */

export const allPosts: Post[] = generated;

export const postsByCategory: Record<CategoryId, Post[]> = {
  journal: allPosts.filter((p) => p.category === "journal"),
  computing: allPosts.filter((p) => p.category === "computing"),
  comms: allPosts.filter((p) => p.category === "comms"),
};

export function getPosts(category: CategoryId): Post[] {
  return postsByCategory[category];
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

/**
 * The one place a post's URL is constructed.
 *
 * A series article carries an extra path segment, so building these by hand at
 * each link site means every new link is a chance to drop the segment and
 * produce a 404 that only shows up for grouped articles.
 */
export function postPath(post: Post): string {
  const base = categoryById[post.category].slug;
  return post.series
    ? `/${base}/${post.series}/${post.slug}`
    : `/${base}/${post.slug}`;
}

/** URL of a series index page. */
export function seriesPath(category: CategoryId, seriesSlug: string): string {
  return `/${categoryById[category].slug}/${seriesSlug}`;
}

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

/**
 * A standalone article, i.e. one addressed by `/<category>/<slug>`.
 *
 * Series articles are excluded on purpose: they live one segment deeper, and
 * matching them here would make `/computing/intro` resolve to an article whose
 * real address is `/computing/web-arch/intro`.
 */
export function getPost(
  category: CategoryId,
  slug: string | undefined,
): Post | undefined {
  const posts = postsByCategory[category];
  if (!slug) return posts[0];
  return posts.find((p) => !p.series && p.slug === slug);
}

/** Articles of one series, in reading order. */
export function getSeriesPosts(
  category: CategoryId,
  seriesSlug: string,
): Post[] {
  return postsByCategory[category]
    .filter((p) => p.series === seriesSlug)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getSeriesPost(
  category: CategoryId,
  seriesSlug: string,
  slug: string | undefined,
): Post | undefined {
  const posts = getSeriesPosts(category, seriesSlug);
  if (!slug) return posts[0];
  return posts.find((p) => p.slug === slug);
}

/** Articles in a category that belong to no series, newest first. */
export function getStandalone(category: CategoryId): Post[] {
  return postsByCategory[category].filter((p) => !p.series);
}

/* ------------------------------------------------------------------ *
 * Outline
 * ------------------------------------------------------------------ */

export interface SeriesGroup {
  meta: SeriesMeta;
  /** In reading order. Never empty — empty series are dropped. */
  posts: Post[];
}

/**
 * How a category's articles are arranged for listing: series first, as ordered
 * runs, then whatever stands on its own.
 *
 * Series come first because they are the part a reader can work through; the
 * loose pieces are a reverse-chronological tail.
 */
export interface CategoryOutline {
  series: SeriesGroup[];
  standalone: Post[];
  /** Total articles, series and standalone together. */
  total: number;
}

export function getOutline(category: CategoryId): CategoryOutline {
  const groups: SeriesGroup[] = [];
  for (const meta of seriesIn(category)) {
    const posts = getSeriesPosts(category, meta.slug);
    if (posts.length > 0) groups.push({ meta, posts });
  }
  const standalone = getStandalone(category);
  return {
    series: groups,
    standalone,
    total: postsByCategory[category].length,
  };
}

/* ------------------------------------------------------------------ *
 * Neighbours
 * ------------------------------------------------------------------ */

/**
 * Previous / next for the article currently on screen.
 *
 * Inside a series this walks the series in reading order, which is the whole
 * point of grouping: "next" should mean the next instalment, not whatever
 * unrelated piece happens to be adjacent by date. Standalone articles keep
 * walking the category's other standalone articles by date.
 */
export function getNeighbours(post: Post) {
  const pool = post.series
    ? getSeriesPosts(post.category, post.series)
    : getStandalone(post.category);
  const i = pool.findIndex((p) => p.slug === post.slug);
  return {
    prev: i > 0 ? pool[i - 1] : undefined,
    next: i >= 0 && i < pool.length - 1 ? pool[i + 1] : undefined,
  };
}

export type { Post };

/* ------------------------------------------------------------------ *
 * Notes — 杂谈
 * ------------------------------------------------------------------ */

/** Every note, newest first. */
export const allNotes: Note[] = generatedNotes;

export function notePath(note: Note): string {
  return `/${others.slug}/${note.slug}`;
}

export function getNote(slug: string | undefined): Note | undefined {
  if (!slug) return undefined;
  return allNotes.find((n) => n.slug === slug);
}

/**
 * Previous / next within the notes, by date.
 *
 * "Previous" means older here, matching the direction the constellation's
 * time axis runs, so paging backwards walks leftwards across the field.
 */
export function getNoteNeighbours(note: Note) {
  const i = allNotes.findIndex((n) => n.slug === note.slug);
  return {
    prev: i > 0 ? allNotes[i - 1] : undefined,
    next: i >= 0 && i < allNotes.length - 1 ? allNotes[i + 1] : undefined,
  };
}

export type { Note };
