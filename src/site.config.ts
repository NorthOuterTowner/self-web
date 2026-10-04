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
