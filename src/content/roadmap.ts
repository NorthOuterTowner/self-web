/**
 * The roadmap graph. HAND-AUTHORED — nothing rewrites this file.
 *
 * ---- Filling it in -----------------------------------------------------
 *
 * One line per topic, written under the group it belongs to:
 *
 *     { label: "C++", level: 6, requires: ["C", "面向对象程序设计"] },
 *
 *   label     The name on the box. It is also how other topics point at
 *             this one in their `requires`, so it has to be unique, and
 *             renaming a topic means renaming it wherever it is required.
 *   level     How well I know it: a whole number from 0 to 10, which
 *             colours the box — 0 white, 5 light blue, 10 purple. Something
 *             on the plan but not started is 0. Anything else, 11 or 6.5, is
 *             a type error, so `bun run typecheck` and CI catch it.
 *   requires  Optional. The topics this one rests on, by label, from any
 *             group. Leave it out for a starting point.
 *   link      Optional. An article on this site; the box gets a dot. A
 *             click locks it like any other box, and while it is locked the
 *             dot turns into a → that opens the article.
 *
 * A topic's group is the one it is written under. Each group is drawn as one
 * clump: its own topics, each prerequisite to the left of what it unlocks.
 * The clumps are packed into columns in the order they are written here,
 * each into whichever column is shortest so far, so moving a group moves its
 * clump and never changes what the graph says.
 *
 * Edges inside a group are always drawn. Edges between groups only appear
 * while a hovered or locked topic's chain runs through them: drawn all the
 * time, they would cross the whole page.
 *
 * Mistakes in the graph itself do not fail the build. A `requires` name that
 * matches no topic, a label used twice, or a cycle shows up in a box at the
 * top of the roadmap page, naming the topic, and the rest still draws.
 *
 * ---- What belongs in it -------------------------------------------------
 *
 * 1. `requires` is knowledge dependency, authored from domain knowledge, with
 *    nothing to do with anyone's history. React sits above DOM → JavaScript
 *    whether or not the person who wrote this learned them in that order.
 *    The test for an edge: set every level to 0 and ask whether the graph is
 *    still a usable path for a stranger. If an edge only makes sense as "I
 *    happened to do X first", it belongs in the prose, not here.
 *
 * 2. A topic is a named technology, or a named discipline with a literature
 *    behind it. Not a step invented to bridge two real things: an earlier
 *    draft had 编程基础 and 指针与内存模型, and neither is something anyone
 *    studies or ships — they were scaffolding for edges, which is exactly
 *    how this kind of graph goes wrong.
 *
 * 3. Groups are separate worlds. 通信 and 软件 share a handful of tools and
 *    almost no concepts, and the page draws them apart. Cross-group edges
 *    exist, but they are the exception: the page shows them only for the
 *    chain being looked at.
 *
 * `level` is the only part about one particular person. The story behind it
 * is in `content/journal/learning.md`.
 */

import { layerDag } from "../lib/dag";

/** 0 is not started; 10 is as well as I know anything. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Every level, low to high. The page draws its colour key from this. */
export const levels: Level[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Tone = "ink" | "fjord" | "clay" | "birch";

/** One topic, as written below. */
interface TopicEntry {
  label: string;
  level: Level;
  requires?: string[];
  link?: string;
}

/** One group, as written below. */
interface GroupEntry {
  title: string;
  titleEn: string;
  tone: Tone;
  topics: TopicEntry[];
}

const groups: GroupEntry[] = [
  {
    title: "语言与系统",
    titleEn: "Languages & Systems",
    tone: "ink",
    topics: [
      { label: "C", level: 6 },
      { label: "Python", level: 8 },
      { label: "Git", level: 6 },
      { label: "软件测试", level: 5 },
      { label: "C++", level: 6, requires: ["C"] },
      { label: "Java", level: 5 },
      {
        label: "数据结构与算法",
        level: 8,
        requires: ["C++"],
        link: "/computing/data-structure/skip-list",
      },
      { label: "操作系统", level: 4 },
      { label: "Linux", level: 5, requires: ["操作系统"] },
      { label: "计算机网络", level: 6, requires: ["操作系统"] },
      { label: "Docker", level: 4, requires: ["Linux"] },
      { label: "网络安全", level: 5, requires: ["计算机网络", "Linux"] },
      {
        label: "CI/CD",
        level: 6,
        requires: ["Git", "软件测试"],
        link: "/computing/web-arch/arch-config",
      },
      {
        label: "K8s",
        level: 1,
        requires: ["CI/CD", "Docker"]
      }
    ],
  },
  {
    title: "服务端与数据",
    titleEn: "Server & Data",
    tone: "clay",
    topics: [
      { label: "数据库系统", level: 8, link: "/computing/database/mysql" },
      { label: "MySQL", level: 7, requires: ["数据库系统"] },
      { label: "Redis", level: 8, requires: ["数据库系统"] },
      { label: "MongoDB", level: 5, requires: ["数据库系统"] },
      { label: "ORM", level: 5, requires: ["数据库系统"] },
      { label: "Node.js", level: 8, requires: ["JavaScript"], link: "/computing/stream" },
      { label: "Express", level: 8, requires: ["Node.js", "HTTP"] },
      { label: "Spring Boot", level: 5, requires: ["Java", "HTTP"] },
      { label: "Flask 与 FastAPI", level: 7, requires: ["Python", "HTTP"] },
      { label: "Auth", level: 7, requires: ["HTTP"] },
      { label: "微服务", level: 4, requires: ["计算机网络"] },
      { label: "分布式系统", level: 3, requires: ["计算机网络"] },
      { label: "Kafka", level: 1, requires: ["分布式系统"] },
      { label: "Flink", level: 0, requires: ["Kafka"] },
      { label: "Doris", level: 0, requires: ["分布式系统", "数据库系统"] },
      { label: "ElasticSearch", level: 2, requires: ["分布式系统"] },
    ],
  },
  {
    title: "Web 与前端",
    titleEn: "Web & Frontend",
    tone: "fjord",
    topics: [
      { label: "HTML & CSS", level: 6 },
      { label: "JavaScript", level: 8 },
      { label: "TypeScript", level: 8, requires: ["JavaScript"] },
      {
        label: "DOM",
        level: 7,
        requires: ["HTML & CSS", "JavaScript"],
        link: "/computing/web-arch/bs-evolution",
      },
      { label: "HTTP", level: 7, requires: ["计算机网络"] },
      { label: "WebSocket", level: 4, requires: ["HTTP"] },
      { label: "前端构建工具链", level: 2, requires: ["JavaScript"] },
      { label: "Vue", level: 8, requires: ["DOM", "前端构建工具链"] },
      { label: "React", level: 2, requires: ["DOM", "前端构建工具链"] },
      { label: "Angular", level: 4, requires: ["DOM", "TypeScript"] },
      { label: "uniapp", level: 5, requires: ["Vue"] },
      { label: "Playwright", level: 7, requires: ["DOM", "TypeScript"] },
    ],
  },
  {
    title: "智能",
    titleEn: "Intelligence",
    tone: "fjord",
    topics: [
      { label: "线性代数", level: 5 },
      { label: "微积分", level: 5 },
      { label: "概率论与数理统计", level: 4 },
      {
        label: "机器学习",
        level: 7,
        requires: ["线性代数", "概率论与数理统计", "Python", "微积分"],
        link: "/computing/machine-learning/machine-learning",
      },
      { label: "深度学习", level: 6, requires: ["机器学习"] },
      { label: "LLM 与 Agent", level: 9, requires: ["深度学习", "HTTP"] },
    ],
  },
  {
    title: "桌面与移动端",
    titleEn: "Desktop & Mobile",
    tone: "clay",
    topics: [
      { label: "Qt", level: 7, requires: ["C++", "Python"] },
      { label: "PySide", level: 7, requires: ["Qt", "Python"] },
      { label: "Kotlin", level: 2, requires: ["Java"] },
      { label: "Android", level: 2, requires: ["Kotlin"] },
      { label: "Electron", level: 3, requires: ["Vue"] },
      { label: "tauri", level: 1, requires: ["Electron"] }
    ],
  },
  {
    title: "通信与硬件",
    titleEn: "Communications & Hardware",
    tone: "birch",
    topics: [
      { label: "信号与系统", level: 1 },
      { label: "数字信号处理", level: 1 },
      { label: "通信原理", level: 1, requires: ["信号与系统", "数字信号处理"] },
      { label: "射频与功放", level: 1, requires: ["通信原理"], link: "/comms/trx-rru" },
      { label: "基站集成与校验", level: 3, requires: ["射频与功放"] },
      { label: "6G", level: 1, requires: ["信号与系统"] }
    ],
  },
];

export const roadmapSource = {
  to: "/journal/learning",
  title: "我的学习过程与学习方法",
} as const;

/* ------------------------------------------------------------------ *
 * Derived from the above. Nothing below needs editing.
 * ------------------------------------------------------------------ */

/** A group's title doubles as its key: nothing outside this file names it. */
export type ClusterId = string;

export interface ClusterMeta {
  id: ClusterId;
  title: string;
  titleEn: string;
  tone: Tone;
}

export interface Skill {
  /** The label. `requires` names topics by label, so the label is the key. */
  id: string;
  label: string;
  cluster: ClusterId;
  level: Level;
  requires: string[];
  link?: string;
}

export const clusters: ClusterMeta[] = groups.map((g) => ({
  id: g.title,
  title: g.title,
  titleEn: g.titleEn,
  tone: g.tone,
}));

export const clusterById = new Map(clusters.map((c) => [c.id, c]));

/**
 * The order the groups are written in. The canvas packs its clumps in this
 * order, and the legend and the list view use it too, so on a phone the
 * groups come in the same order as on a desktop.
 */
export const clusterOrder: ClusterId[] = clusters.map((c) => c.id);

export const skillGraph: Skill[] = groups.flatMap((g) =>
  g.topics.map((t) => ({
    id: t.label,
    label: t.label,
    cluster: g.title,
    level: t.level,
    requires: t.requires ?? [],
    link: t.link,
  })),
);

export const skillById = new Map(skillGraph.map((s) => [s.id, s]));

export const requiresMap = new Map<string, string[]>(
  skillGraph.map((s) => [s.id, s.requires]),
);

/**
 * The whole graph, checked once: unknown names, repeated labels and cycles,
 * including a cycle that runs between groups. Where each box goes is worked
 * out per group, in `lib/roadmapLayout.ts`.
 */
export const skillLayout = layerDag(skillGraph);

/** Everything the page reports in its error box. */
export const roadmapErrors: string[] = skillLayout.errors;

/** Edges whose two ends live in different groups. The exceptions. */
export const bridges = skillGraph.flatMap((s) =>
  s.requires
    .filter((id) => skillById.get(id)?.cluster !== s.cluster)
    .map((id) => ({ from: id, to: s.id })),
);

export interface RoadmapTally {
  total: number;
  /** Mean level across every topic, 0–10. */
  average: number;
  /** Topics at level 0: on the map, not started. */
  untouched: number;
}

export function tally(): RoadmapTally {
  let sum = 0;
  let untouched = 0;
  for (const skill of skillGraph) {
    sum += skill.level;
    if (skill.level === 0) untouched++;
  }
  return {
    total: skillGraph.length,
    average: skillGraph.length > 0 ? sum / skillGraph.length : 0,
    untouched,
  };
}
