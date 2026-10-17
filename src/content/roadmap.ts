/**
 * The roadmap graph. HAND-AUTHORED — nothing rewrites this file.
 *
 * ---- Filling it in -----------------------------------------------------
 *
 * One line per topic, written under the group it belongs to:
 *
 *     { label: "C++", status: "done", requires: ["C", "面向对象程序设计"] },
 *
 *   label     The name on the box. It is also how other topics point at
 *             this one in their `requires`, so it has to be unique, and
 *             renaming a topic means renaming it wherever it is required.
 *   status    "done" | "learning" | "planned" | "dropped"
 *   requires  Optional. The topics this one rests on, by label, from any
 *             group. Leave it out for a starting point.
 *   link      Optional. An article on this site: the box links to it and
 *             gets a dot in its corner.
 *
 * A topic's group is the one it is written under. Groups are drawn left to
 * right in the order they appear here, and this order puts the heaviest
 * cross-group edges between neighbours: 语言与系统 feeds 服务端 five times and
 * sits next to it, and 桌面 sits next to 通信 because 基站集成 needs PySide.
 * Reordering only changes how tangled the long edges look, never what the
 * graph says.
 *
 * Mistakes do not fail the build. A `requires` name that matches no topic, a
 * label used twice, or a cycle shows up in a box at the top of the roadmap
 * page, naming the topic, and the rest of the graph still draws.
 *
 * ---- What belongs in it -------------------------------------------------
 *
 * 1. `requires` is knowledge dependency, authored from domain knowledge, with
 *    nothing to do with anyone's history. React sits above DOM → JavaScript
 *    whether or not the person who wrote this learned them in that order.
 *    The test for an edge: set every status to "planned" and ask whether the
 *    graph is still a usable path for a stranger. If an edge only makes sense
 *    as "I happened to do X first", it belongs in the prose, not here.
 *
 * 2. A topic is a named technology, or a named discipline with a literature
 *    behind it. Not a step invented to bridge two real things: an earlier
 *    draft had 编程基础 and 指针与内存模型, and neither is something anyone
 *    studies or ships — they were scaffolding for edges, which is exactly
 *    how this kind of graph goes wrong.
 *
 * 3. Groups are separate worlds. 通信 and 软件 share a handful of tools and
 *    almost no concepts, and the page draws them apart. Cross-group edges
 *    exist and are drawn, but they are the exception and are marked as such.
 *
 * `status` is the only part about one particular person, and it comes from
 * `content/journal/learning.md`.
 */

import { layerDag } from "../lib/dag";

export type SkillStatus = "done" | "learning" | "planned" | "dropped";

type Tone = "ink" | "fjord" | "clay" | "birch";

/** One topic, as written below. */
interface TopicEntry {
  label: string;
  status: SkillStatus;
  requires?: string[];
  link?: string;
}

/** One group, as written below. */
interface GroupEntry {
  title: string;
  titleEn: string;
  tone: Tone;
  /** One line on what holds the group together. Shown in the list view. */
  note: string;
  topics: TopicEntry[];
}

const groups: GroupEntry[] = [
  {
    title: "智能",
    titleEn: "Intelligence",
    tone: "fjord",
    note: "入口是数学而不是代码，所以它和前端那条线没有交集。",
    topics: [
      { label: "线性代数", status: "done" },
      { label: "微积分", status: "done" },
      { label: "概率论与数理统计", status: "done" },
      {
        label: "机器学习",
        status: "done",
        requires: ["线性代数", "概率论与数理统计", "Python", "微积分"],
        link: "/computing/machine-learning/machine-learning",
      },
      { label: "深度学习", status: "done", requires: ["机器学习"] },
      { label: "LLM 与 Agent", status: "done", requires: ["深度学习", "HTTP"] },
    ],
  },
  {
    title: "语言与系统",
    titleEn: "Languages & Systems",
    tone: "ink",
    note: "下面所有组都从这里取东西。它自己几乎不依赖别人。",
    topics: [
      { label: "C", status: "done" },
      { label: "面向对象程序设计", status: "done" },
      { label: "Python", status: "done" },
      { label: "Git", status: "done" },
      { label: "软件测试", status: "done" },
      { label: "C++", status: "done", requires: ["C", "面向对象程序设计"] },
      { label: "Java", status: "done", requires: ["面向对象程序设计"] },
      {
        label: "数据结构与算法",
        status: "done",
        requires: ["C"],
        link: "/computing/data-structure/skip-list",
      },
      { label: "操作系统", status: "done", requires: ["C"] },
      { label: "Linux", status: "done", requires: ["操作系统"] },
      { label: "并发编程", status: "done", requires: ["操作系统"] },
      { label: "计算机网络", status: "done", requires: ["操作系统"] },
      { label: "Docker", status: "done", requires: ["Linux"] },
      { label: "网络安全", status: "done", requires: ["计算机网络", "Linux"] },
      {
        label: "CI/CD",
        status: "done",
        requires: ["Git", "Docker", "软件测试"],
        link: "/computing/web-arch/arch-config",
      },
      { label: "制品仓库", status: "planned", requires: ["CI/CD"] },
      { label: "算法竞赛", status: "dropped", requires: ["数据结构与算法"] },
    ],
  },
  {
    title: "服务端与数据",
    titleEn: "Server & Data",
    tone: "clay",
    note: "跨组前置最多的一组，语言、协议、系统三头都要借。",
    topics: [
      { label: "数据库系统原理", status: "done", link: "/computing/database/mysql" },
      { label: "MySQL", status: "done", requires: ["数据库系统原理"] },
      { label: "Redis", status: "done", requires: ["数据库系统原理"] },
      { label: "MongoDB", status: "done", requires: ["数据库系统原理"] },
      { label: "ORM", status: "done", requires: ["数据库系统原理", "面向对象程序设计"] },
      { label: "Node.js", status: "done", requires: ["JavaScript"], link: "/computing/stream" },
      { label: "Express", status: "done", requires: ["Node.js", "HTTP"] },
      { label: "Spring Boot", status: "done", requires: ["Java", "HTTP"] },
      { label: "Flask 与 FastAPI", status: "done", requires: ["Python", "HTTP"] },
      { label: "认证协议", status: "done", requires: ["HTTP"] },
      { label: "分布式系统", status: "planned", requires: ["计算机网络", "并发编程"] },
      { label: "Kafka", status: "planned", requires: ["分布式系统"] },
      { label: "Flink", status: "planned", requires: ["Kafka"] },
      { label: "Doris", status: "planned", requires: ["分布式系统", "数据库系统原理"] },
      { label: "ElasticSearch 栈", status: "planned", requires: ["分布式系统"] },
    ],
  },
  {
    title: "Web 与前端",
    titleEn: "Web & Frontend",
    tone: "fjord",
    note: "两个根：HTML/CSS 不需要编程，JavaScript 不需要排版。它们在 DOM 汇合。",
    topics: [
      { label: "HTML 与 CSS", status: "done" },
      { label: "JavaScript", status: "done" },
      { label: "TypeScript", status: "done", requires: ["JavaScript"] },
      {
        label: "DOM",
        status: "done",
        requires: ["HTML 与 CSS", "JavaScript"],
        link: "/computing/web-arch/bs-evolution",
      },
      { label: "HTTP", status: "done", requires: ["计算机网络"] },
      { label: "WebSocket", status: "done", requires: ["HTTP"] },
      { label: "前端构建工具链", status: "done", requires: ["JavaScript"] },
      { label: "Vue", status: "done", requires: ["DOM", "前端构建工具链"] },
      { label: "React", status: "done", requires: ["DOM", "前端构建工具链"] },
      { label: "Angular", status: "done", requires: ["DOM", "TypeScript"] },
      { label: "跨端与小程序", status: "done", requires: ["Vue"] },
      { label: "Playwright", status: "done", requires: ["DOM", "TypeScript"] },
    ],
  },
  {
    title: "桌面与移动",
    titleEn: "Desktop & Mobile",
    tone: "clay",
    note: "靠语言组供给，自己不向外输出。两条分支都搁下了。",
    topics: [
      { label: "Qt", status: "done", requires: ["C++"] },
      { label: "PySide", status: "done", requires: ["Qt", "Python"] },
      { label: "Kotlin", status: "dropped", requires: ["Java"] },
      { label: "Android", status: "dropped", requires: ["Kotlin"] },
    ],
  },
  {
    title: "通信与硬件",
    titleEn: "Communications & Hardware",
    tone: "birch",
    note: "和软件那几组真正的交集只有测试和脚本，概念上不相通。",
    topics: [
      { label: "信号与系统", status: "learning" },
      { label: "通信原理", status: "learning", requires: ["信号与系统"] },
      { label: "射频与功放", status: "learning", requires: ["通信原理"], link: "/comms/trx-rru" },
      {
        label: "基站集成与测试",
        status: "learning",
        requires: ["射频与功放", "软件测试", "PySide"],
      },
      { label: "卫星定位", status: "dropped", requires: ["信号与系统"] },
    ],
  },
];

export const statusMeta: Record<SkillStatus, { title: string }> = {
  done: { title: "已掌握" },
  learning: { title: "正在学" },
  planned: { title: "计划" },
  dropped: { title: "放下了" },
};

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
  note: string;
}

export interface Skill {
  /** The label. `requires` names topics by label, so the label is the key. */
  id: string;
  label: string;
  cluster: ClusterId;
  status: SkillStatus;
  requires: string[];
  link?: string;
}

export const clusters: ClusterMeta[] = groups.map((g) => ({
  id: g.title,
  title: g.title,
  titleEn: g.titleEn,
  tone: g.tone,
  note: g.note,
}));

export const clusterById = new Map(clusters.map((c) => [c.id, c]));

/** Left to right on the canvas: the order the groups are written in. */
export const clusterOrder: ClusterId[] = clusters.map((c) => c.id);

export const skillGraph: Skill[] = groups.flatMap((g) =>
  g.topics.map((t) => ({
    id: t.label,
    label: t.label,
    cluster: g.title,
    status: t.status,
    requires: t.requires ?? [],
    link: t.link,
  })),
);

export const skillById = new Map(skillGraph.map((s) => [s.id, s]));

export const requiresMap = new Map<string, string[]>(
  skillGraph.map((s) => [s.id, s.requires]),
);

/**
 * One layout over the whole graph.
 *
 * Layered globally rather than per group: the rows have to mean the same
 * thing everywhere for a cross-group edge to be drawable. The page then
 * bands the result horizontally by group, in `clusterOrder`.
 */
export const skillLayout = layerDag(skillGraph);

/** Edges whose two ends live in different groups. The exceptions. */
export const bridges = skillGraph.flatMap((s) =>
  s.requires
    .filter((id) => skillById.get(id)?.cluster !== s.cluster)
    .map((id) => ({ from: id, to: s.id })),
);

export interface RoadmapTally {
  total: number;
  done: number;
  learning: number;
  planned: number;
  dropped: number;
}

export function tally(): RoadmapTally {
  const counts = { done: 0, learning: 0, planned: 0, dropped: 0 };
  for (const skill of skillGraph) counts[skill.status]++;
  return { total: skillGraph.length, ...counts };
}
