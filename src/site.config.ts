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
    "一个关于计算、通信与日常感受的记录处。用结构化的方式，把分散的知识连成网络。",
  email: "hello@example.com",
  github: "https://github.com/NorthOuterTowner",
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
    summary: "关于阅读、独处与节奏的碎片，不追求结论。",
    intro:
      "这里放不需要被验证的东西：读完一本书后的残留、搬到新城市的第一个冬天、以及一些关于如何安排时间的失败实验。",
    index: "01",
    position: "left",
  },
  {
    id: "computing",
    slug: "computing",
    title: "计算机技术博客",
    titleEn: "Computing",
    summary: "系统、编译与运行时，偏向把抽象层拆开看的那类笔记。",
    intro:
      "主线是「为什么它是这样设计的」。涉及运行时与打包工具、并发模型、以及一些把性能问题定位到具体指令的过程记录。",
    index: "02",
    position: "center",
  },
  {
    id: "comms",
    slug: "comms",
    title: "通信工程博客",
    titleEn: "Communications",
    summary: "从信号与信道出发，到协议栈与无线组网的工程笔记。",
    intro:
      "通信是一门把物理约束翻译成工程余量的学科。这里记录调制与编码、链路预算、以及 5G NR 物理层里那些容易被跳过的细节。",
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
