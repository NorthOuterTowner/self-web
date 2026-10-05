/**
 * Single place to edit the site's identity and navigation.
 */

export const site = {
  /** Shown in the nav as the wordmark. */
  name: "Nils Lidén",
  /** Compact monogram for small screens. */
  monogram: "N.L.",
  /** The hero line, typed out once on first paint. */
  heroLine: "Connecting Everything",
  /** Second hero line, typed after the first one finishes. */
  heroLineTwo: "This is Nils Lidén",
  heroSub:
    "BLOG Collection By Telecommunications Integration Engineer and Software Engineering Student",
  email: "hello@example.com",
  github: "https://github.com/NorthOuterTowner",
  linkedin: "https://www.linkedin.com/in/ruize-li-185964383/",
  /** Footer line. */
  since: 2026,
} as const;

export type CategoryId = "journal" | "computing" | "comms";

export interface CategoryMeta {
  id: CategoryId;
  /** Route segment. */
  slug: string;
  /** Chinese display name. */
  title: string;
  /** Latin subtitle — Swiss style leans on the bilingual pairing. */
  titleEn: string;
  /** One line shown on the card and in the blog header. */
  summary: string;
  /** Long form intro on the category page. */
  intro: string;
  /** Card sequence number. */
  index: string;
  /** Grid position on the home page: left | center | right. */
  position: "left" | "center" | "right";
}

export const categories: CategoryMeta[] = [
  {
    id: "journal",
    slug: "journal",
    title: "个人感受记录",
    titleEn: "Journal",
    summary: "在学习和生活的过程中留下的碎片",
    intro:
      "Everything Meaningful By Everyone",
    index: "01",
    position: "left",
  },
  {
    id: "computing",
    slug: "computing",
    title: "计算机技术博客",
    titleEn: "Computing",
    summary: "计算机科学与软件工程的架构",
    intro:
      "Computer Science Build Everything on the Internet.",
    index: "02",
    position: "center",
  },
  {
    id: "comms",
    slug: "comms",
    title: "通信工程博客",
    titleEn: "Communications",
    summary: "从信号与系统，到真正的通信基站。",
    intro:
      "Telecommunications Connect Everything with Each Other.",
    index: "03",
    position: "right",
  },
];

export const categoryById: Record<CategoryId, CategoryMeta> = categories.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<CategoryId, CategoryMeta>,
);

export function isCategoryId(value: string | undefined): value is CategoryId {
  return value === "journal" || value === "computing" || value === "comms";
}

/* ------------------------------------------------------------------ *
 * Series — 专栏
 * ------------------------------------------------------------------ */

/**
 * A series is an ordered run of articles meant to be read front to back.
 *
 * Membership comes from the filesystem, not from here: a subdirectory of a
 * category directory *is* a series, and every `.md` inside it belongs to it.
 *
 *     content/computing/web-arch/intro.md   → series "web-arch"
 *     content/computing/stream.md           → no series, a standalone piece
 *
 * This table only carries the things a directory name cannot express — the
 * display names and the blurbs. Declaring it is mandatory: an undeclared
 * subdirectory fails the build rather than silently inventing a title from the
 * folder name, which is the same bargain categories already make.
 *
 * Ordering inside a series comes from each article's `order` frontmatter, not
 * from the date — a series is a reading sequence, and the newest instalment
 * belongs last.
 */
export interface SeriesMeta {
  /**
   * Both the URL segment and the directory name under `content/<category>/`.
   * These are deliberately the same string so there is nothing to keep in
   * sync; the compiler checks that the directory exists in the declaration.
   */
  slug: string;
  /** The category the series lives in, i.e. its parent directory. */
  category: CategoryId;
  /** Chinese display name. */
  title: string;
  /** Latin subtitle, to match the categories' bilingual pairing. */
  titleEn: string;
  /** One line, shown in the sidebar and above the article title. */
  summary: string;
  /** Long form intro, shown on the series index page. */
  intro: string;
}

export const series: SeriesMeta[] = [
  {
    slug: "web-arch",
    category: "computing",
    title: "Web 架构专栏",
    titleEn: "Web Architecture",
    summary: "讨论现代 Web 架构",
    intro: "讨论现代 Web 架构",
  },
  {
    slug: "machine-learning",
    category: "computing",
    title: "机器学习理论",
    titleEn: "Machine Learning Theories",
    summary: "记录各种不同的 ML 理论与应用",
    intro: "不仅包括当下最为流行的 Transformer 或者 LLM"
  },
];

/** Series declared under a given category, in declaration order. */
export function seriesIn(category: CategoryId): SeriesMeta[] {
  return series.filter((s) => s.category === category);
}

export function getSeries(
  category: CategoryId,
  slug: string | undefined,
): SeriesMeta | undefined {
  if (!slug) return undefined;
  return series.find((s) => s.category === category && s.slug === slug);
}

/* ------------------------------------------------------------------ *
 * Others — 杂谈
 * ------------------------------------------------------------------ */

/**
 * The scattered notes that sit outside the three streams.
 *
 * Not a fourth category, and not for tidiness' sake: `CategoryMeta.position`
 * is typed `"left" | "center" | "right"` and the home page ring has exactly
 * three stations which it walks with `mod3`. A fourth category would take the
 * ring apart. More to the point, these pieces have a different shape — no
 * standfirst, no reading order, no sidebar — so they get their own type.
 *
 * Notes live in `content/others/*.md` and are addressed at `/others/<slug>`.
 */
export const others = {
  /** Route segment, also the directory name under content/. */
  slug: "others",
  title: "杂谈",
  titleEn: "Scattered Notes",
  summary: "格言、诗词、生活里的小发现",
  intro:
    "不成篇的内容。",
  /** Shown under the constellation, explaining how to read the field. */
  axisNote: "点下任意一点星光",
} as const;

export type NoteKindId =
  | "aphorism"
  | "poem"
  | "ci"
  | "sonnet"
  | "tip"
  | "musing";

export interface NoteKindMeta {
  id: NoteKindId;
  /** Chinese display name. */
  title: string;
  titleEn: string;
  /**
   * Which design token colours the dot. There are four accent tones and six
   * genres, so the three verse forms share one: on the field they read as a
   * single family, and the popover names the exact form.
   */
  tone: "ink" | "fjord" | "clay" | "birch";
}

export const noteKinds: NoteKindMeta[] = [
  { id: "aphorism", title: "格言", titleEn: "Aphorism", tone: "ink" },
  { id: "poem", title: "古诗", titleEn: "Classical Verse", tone: "clay" },
  { id: "ci", title: "词", titleEn: "Ci", tone: "clay" },
  { id: "sonnet", title: "十四行诗", titleEn: "Sonnet", tone: "clay" },
  { id: "tip", title: "生活小 tips", titleEn: "Practical Note", tone: "birch" },
  { id: "musing", title: "生活小感悟", titleEn: "Musing", tone: "fjord" },
];

export const noteKindById: Record<NoteKindId, NoteKindMeta> = noteKinds.reduce(
  (acc, k) => {
    acc[k.id] = k;
    return acc;
  },
  {} as Record<NoteKindId, NoteKindMeta>,
);

export function isNoteKindId(value: unknown): value is NoteKindId {
  return (
    typeof value === "string" && noteKinds.some((k) => k.id === value)
  );
}

/** Every declared genre id, for error messages in the content compiler. */
export const noteKindIds: string[] = noteKinds.map((k) => k.id);
