/**
 * The roadmap graph. HAND-AUTHORED — nothing rewrites this file.
 *
 * Three rules hold this together.
 *
 * 1. `requires` is knowledge dependency, authored from domain knowledge, with
 *    nothing to do with anyone's history. React sits above DOM → JavaScript
 *    whether or not the person who wrote this learned them in that order.
 *    The test for an edge: set every status to "planned" and ask whether the
 *    graph is still a usable path for a stranger. If an edge only makes sense
 *    as "I happened to do X first", it belongs in the prose, not here.
 *
 * 2. A node is either a named technology or a named discipline with a
 *    literature behind it. Not a pedagogical step invented to bridge two
 *    real things. An earlier draft had 编程基础 and 指针与内存模型 as nodes;
 *    neither is a module anyone studies or ships — they were scaffolding for
 *    my own edges, which is exactly how this kind of graph goes wrong.
 *
 * 3. Clusters are separate worlds, laid out separately. 通信 and 软件 share a
 *    handful of tools and almost no concepts; drawing them in one grid implies
 *    a relationship that is not there. Cross-cluster edges exist and are
 *    recorded, but they are the exception and are marked as such.
 *
 * `status` is the only part that is about one particular person, and it comes
 * from `content/journal/learning.md`.
 */

import { layerDag } from "../lib/dag";

export type SkillStatus = "done" | "learning" | "planned" | "dropped";

export type ClusterId = "lang" | "web" | "server" | "ml" | "comm" | "app";

export interface Skill {
  id: string;
  label: string;
  labelEn: string;
  cluster: ClusterId;
  status: SkillStatus;
  /** Knowledge dependencies. May point into another cluster. */
  requires: string[];
  detail?: string;
  /** An article on this site that covers it. */
  link?: string;
}

export interface ClusterMeta {
  id: ClusterId;
  title: string;
  titleEn: string;
  tone: "ink" | "fjord" | "clay" | "birch";
  /** One line on what holds this group together. */
  note: string;
}

export const clusters: ClusterMeta[] = [
  {
    id: "lang",
    title: "语言与系统",
    titleEn: "Languages & Systems",
    tone: "ink",
    note: "下面所有组都从这里取东西。它自己几乎不依赖别人。",
  },
  {
    id: "web",
    title: "Web 与前端",
    titleEn: "Web & Frontend",
    tone: "fjord",
    note: "两个根：HTML/CSS 不需要编程，JavaScript 不需要排版。它们在 DOM 汇合。",
  },
  {
    id: "server",
    title: "服务端与数据",
    titleEn: "Server & Data",
    tone: "clay",
    note: "跨组前置最多的一组，语言、协议、系统三头都要借。",
  },
  {
    id: "ml",
    title: "智能",
    titleEn: "Intelligence",
    tone: "fjord",
    note: "入口是数学而不是代码，所以它和前端那条线没有交集。",
  },
  {
    id: "comm",
    title: "通信与硬件",
    titleEn: "Communications & Hardware",
    tone: "birch",
    note: "和软件那几组真正的交集只有测试和脚本，概念上不相通。",
  },
  {
    id: "app",
    title: "桌面与移动",
    titleEn: "Desktop & Mobile",
    tone: "clay",
    note: "靠语言组供给，自己不向外输出。两条分支都搁下了。",
  },
];

export const clusterById = new Map(clusters.map((c) => [c.id, c]));

export const statusMeta: Record<SkillStatus, { title: string }> = {
  done: { title: "已掌握" },
  learning: { title: "正在学" },
  planned: { title: "计划" },
  dropped: { title: "放下了" },
};

export const skillGraph: Skill[] = [
  /* ---- 语言与系统 ------------------------------------------------------ */
  { id: "c", label: "C", labelEn: "C", cluster: "lang", status: "done", requires: [] },
  {
    id: "oop",
    label: "面向对象程序设计",
    labelEn: "OOP",
    cluster: "lang",
    status: "done",
    requires: [],
    detail: "封装、继承、多态、接口设计。一门独立的课，不是某种语言的特性",
  },
  {
    id: "python",
    label: "Python",
    labelEn: "Python",
    cluster: "lang",
    status: "done",
    requires: [],
  },
  { id: "git", label: "Git", labelEn: "Git", cluster: "lang", status: "done", requires: [] },
  {
    id: "testing",
    label: "软件测试",
    labelEn: "Software Testing",
    cluster: "lang",
    status: "done",
    requires: [],
    detail: "单元、集成、压测。JMeter",
  },
  {
    id: "cpp",
    label: "C++",
    labelEn: "C++",
    cluster: "lang",
    status: "done",
    requires: ["c", "oop"],
    detail: "C++11/17/20、模板、RAII",
  },
  {
    id: "java",
    label: "Java",
    labelEn: "Java",
    cluster: "lang",
    status: "done",
    requires: ["oop"],
    detail: "JVM、集合、泛型",
  },
  {
    id: "dsa",
    label: "数据结构与算法",
    labelEn: "Data Structures",
    cluster: "lang",
    status: "done",
    requires: ["c"],
    link: "/computing/data-structure/skip-list",
  },
  {
    id: "os",
    label: "操作系统",
    labelEn: "Operating Systems",
    cluster: "lang",
    status: "done",
    requires: ["c"],
    detail: "进程与线程、调度、虚拟内存、文件系统",
  },
  {
    id: "linux",
    label: "Linux",
    labelEn: "Linux",
    cluster: "lang",
    status: "done",
    requires: ["os"],
    detail: "命令行、权限、进程管理、Shell",
  },
  {
    id: "concurrency",
    label: "并发编程",
    labelEn: "Concurrency",
    cluster: "lang",
    status: "done",
    requires: ["os"],
    detail: "锁、原子操作、伪共享",
  },
  {
    id: "network",
    label: "计算机网络",
    labelEn: "Networking",
    cluster: "lang",
    status: "done",
    requires: ["os"],
    detail: "分层模型、TCP、DNS、TLS",
  },
  {
    id: "docker",
    label: "Docker",
    labelEn: "Docker",
    cluster: "lang",
    status: "done",
    requires: ["linux"],
    detail: "镜像分层、命名空间与 cgroups",
  },
  {
    id: "security",
    label: "网络安全",
    labelEn: "Security",
    cluster: "lang",
    status: "done",
    requires: ["network", "linux"],
    detail: "Wireshark、Burp Suite",
  },
  {
    id: "cicd",
    label: "CI/CD",
    labelEn: "CI/CD",
    cluster: "lang",
    status: "done",
    requires: ["git", "docker", "testing"],
    detail: "Jenkins、Gerrit、流水线与配置分层",
    link: "/computing/web-arch/arch-config",
  },
  {
    id: "nexus",
    label: "制品仓库",
    labelEn: "Artifact Registry",
    cluster: "lang",
    status: "planned",
    requires: ["cicd"],
    detail: "Nexus、JFrog",
  },
  {
    id: "algo-contest",
    label: "算法竞赛",
    labelEn: "Competitive Programming",
    cluster: "lang",
    status: "dropped",
    requires: ["dsa"],
    detail: "大一想打蓝桥和 ACM，当时的作息撑不住",
  },

  /* ---- Web 与前端 ------------------------------------------------------ */
  {
    id: "html-css",
    label: "HTML 与 CSS",
    labelEn: "HTML / CSS",
    cluster: "web",
    status: "done",
    requires: [],
    detail: "文档结构、盒模型、布局。不需要会编程，所以是独立的根",
  },
  {
    id: "js",
    label: "JavaScript",
    labelEn: "JavaScript",
    cluster: "web",
    status: "done",
    requires: [],
    detail: "原型、闭包、事件循环",
  },
  {
    id: "ts",
    label: "TypeScript",
    labelEn: "TypeScript",
    cluster: "web",
    status: "done",
    requires: ["js"],
    detail: "结构化类型、泛型、类型推导",
  },
  {
    id: "dom",
    label: "DOM",
    labelEn: "DOM",
    cluster: "web",
    status: "done",
    requires: ["html-css", "js"],
    detail: "渲染流程、事件模型、重排与重绘。两个根在这里汇合",
    link: "/computing/web-arch/bs-evolution",
  },
  {
    id: "http",
    label: "HTTP",
    labelEn: "HTTP",
    cluster: "web",
    status: "done",
    requires: ["network"],
  },
  {
    id: "websocket",
    label: "WebSocket",
    labelEn: "WebSocket",
    cluster: "web",
    status: "done",
    requires: ["http"],
  },
  {
    id: "vite",
    label: "前端构建工具链",
    labelEn: "Build Tooling",
    cluster: "web",
    status: "done",
    requires: ["js"],
    detail: "npm / pnpm、Vite、Bun、模块打包",
  },
  {
    id: "vue",
    label: "Vue",
    labelEn: "Vue",
    cluster: "web",
    status: "done",
    requires: ["dom", "vite"],
    detail: "Vue 2/3、Composition API、Pinia",
  },
  {
    id: "react",
    label: "React",
    labelEn: "React",
    cluster: "web",
    status: "done",
    requires: ["dom", "vite"],
  },
  {
    id: "angular",
    label: "Angular",
    labelEn: "Angular",
    cluster: "web",
    status: "done",
    requires: ["dom", "ts"],
    detail: "依赖注入、RxJS",
  },
  {
    id: "uniapp",
    label: "跨端与小程序",
    labelEn: "Cross-platform",
    cluster: "web",
    status: "done",
    requires: ["vue"],
    detail: "uni-app、微信小程序",
  },
  {
    id: "playwright",
    label: "Playwright",
    labelEn: "Playwright",
    cluster: "web",
    status: "done",
    requires: ["dom", "ts"],
    detail: "Guru 那个 agent group 的执行层",
  },

  /* ---- 服务端与数据 ---------------------------------------------------- */
  {
    id: "db",
    label: "数据库系统原理",
    labelEn: "Database Systems",
    cluster: "server",
    status: "done",
    requires: [],
    detail: "关系代数、索引结构、事务与隔离级别、日志与恢复",
    link: "/computing/database/mysql",
  },
  {
    id: "mysql",
    label: "MySQL",
    labelEn: "MySQL",
    cluster: "server",
    status: "done",
    requires: ["db"],
  },
  {
    id: "redis",
    label: "Redis",
    labelEn: "Redis",
    cluster: "server",
    status: "done",
    requires: ["db"],
    detail: "数据结构、过期策略、缓存一致性",
  },
  {
    id: "mongodb",
    label: "MongoDB",
    labelEn: "MongoDB",
    cluster: "server",
    status: "done",
    requires: ["db"],
  },
  {
    id: "orm",
    label: "ORM",
    labelEn: "ORM",
    cluster: "server",
    status: "done",
    requires: ["db", "oop"],
    detail: "Sequelize、MyBatis。对象模型和关系模型的阻抗不匹配",
  },
  {
    id: "node",
    label: "Node.js",
    labelEn: "Node.js",
    cluster: "server",
    status: "done",
    requires: ["js"],
    detail: "事件循环、流、模块系统",
    link: "/computing/stream",
  },
  {
    id: "express",
    label: "Express",
    labelEn: "Express",
    cluster: "server",
    status: "done",
    requires: ["node", "http"],
  },
  {
    id: "spring",
    label: "Spring Boot",
    labelEn: "Spring Boot",
    cluster: "server",
    status: "done",
    requires: ["java", "http"],
    detail: "IoC、Spring MVC、MyBatis",
  },
  {
    id: "fastapi",
    label: "Flask 与 FastAPI",
    labelEn: "Python Web",
    cluster: "server",
    status: "done",
    requires: ["python", "http"],
    detail: "WSGI 和 ASGI 的区别是这里的关键",
  },
  {
    id: "auth",
    label: "认证协议",
    labelEn: "Auth Protocols",
    cluster: "server",
    status: "done",
    requires: ["http"],
    detail: "JWT、OAuth 2.0、Spring Security",
  },
  {
    id: "distributed",
    label: "分布式系统",
    labelEn: "Distributed Systems",
    cluster: "server",
    status: "planned",
    requires: ["network", "concurrency"],
    detail: "一致性、分区容错、共识",
  },
  {
    id: "kafka",
    label: "Kafka",
    labelEn: "Kafka",
    cluster: "server",
    status: "planned",
    requires: ["distributed"],
    detail: "分区、偏移量、投递语义",
  },
  {
    id: "flink",
    label: "Flink",
    labelEn: "Flink",
    cluster: "server",
    status: "planned",
    requires: ["kafka"],
    detail: "窗口、水位线、状态。CDC",
  },
  {
    id: "doris",
    label: "Doris",
    labelEn: "Doris",
    cluster: "server",
    status: "planned",
    requires: ["distributed", "db"],
    detail: "列存与预聚合。Superset",
  },
  {
    id: "elk",
    label: "ElasticSearch 栈",
    labelEn: "ELK",
    cluster: "server",
    status: "planned",
    requires: ["distributed"],
    detail: "ElasticSearch、Logstash、Kibana",
  },

  /* ---- 智能 ------------------------------------------------------------ */
  {
    id: "linalg",
    label: "线性代数",
    labelEn: "Linear Algebra",
    cluster: "ml",
    status: "done",
    requires: [],
  },
  {
    id: "prob",
    label: "概率论与数理统计",
    labelEn: "Probability",
    cluster: "ml",
    status: "done",
    requires: [],
  },
  {
    id: "ml",
    label: "机器学习",
    labelEn: "Machine Learning",
    cluster: "ml",
    status: "done",
    requires: ["linalg", "prob", "python"],
    detail: "集成学习、特征工程、评估指标",
    link: "/computing/machine-learning/machine-learning",
  },
  {
    id: "dl",
    label: "深度学习",
    labelEn: "Deep Learning",
    cluster: "ml",
    status: "done",
    requires: ["ml"],
    detail: "反向传播、CNN、Transformer。MXNet、TensorFlow",
  },
  {
    id: "agent",
    label: "LLM 与 Agent",
    labelEn: "LLM & Agents",
    cluster: "ml",
    status: "done",
    requires: ["dl", "http"],
    detail: "工具调用、多智能体编排。Dify",
  },

  /* ---- 通信与硬件 ------------------------------------------------------ */
  {
    id: "signals",
    label: "信号与系统",
    labelEn: "Signals & Systems",
    cluster: "comm",
    status: "learning",
    requires: [],
    detail: "傅里叶变换、滤波、采样",
  },
  {
    id: "comm-theory",
    label: "通信原理",
    labelEn: "Communication Theory",
    cluster: "comm",
    status: "learning",
    requires: ["signals"],
    detail: "链路预算、编码、调制、多址",
  },
  {
    id: "rf",
    label: "射频与功放",
    labelEn: "RF & PA",
    cluster: "comm",
    status: "learning",
    requires: ["comm-theory"],
    detail: "AM-AM 特性、增益压缩、滤波器",
    link: "/comms/trx-rru",
  },
  {
    id: "radio",
    label: "基站集成与测试",
    labelEn: "Radio Integration",
    cluster: "comm",
    status: "learning",
    requires: ["rf", "testing", "pyside"],
    detail: "RadioPilot 做的事：测试、数据分析、校验",
  },
  {
    id: "gnss",
    label: "卫星定位",
    labelEn: "GNSS",
    cluster: "comm",
    status: "dropped",
    requires: ["signals"],
  },

  /* ---- 桌面与移动 ------------------------------------------------------ */
  {
    id: "qt",
    label: "Qt",
    labelEn: "Qt",
    cluster: "app",
    status: "done",
    requires: ["cpp"],
    detail: "信号与槽、事件循环、主线程约束",
  },
  {
    id: "pyside",
    label: "PySide",
    labelEn: "PySide",
    cluster: "app",
    status: "done",
    requires: ["qt", "python"],
    detail: "RadioPilot 的桌面端",
  },
  {
    id: "kotlin",
    label: "Kotlin",
    labelEn: "Kotlin",
    cluster: "app",
    status: "dropped",
    requires: ["java"],
    detail: "学过一个假期，后来再没碰",
  },
  {
    id: "android",
    label: "Android",
    labelEn: "Android",
    cluster: "app",
    status: "dropped",
    requires: ["kotlin"],
    detail: "项目用的是 Java + XML，Compose 没用上，之后就搁下了",
  },
];

export const roadmapSource = {
  to: "/journal/learning",
  title: "我的学习过程与学习方法",
} as const;

export const skillById = new Map(skillGraph.map((s) => [s.id, s]));

export const requiresMap = new Map<string, string[]>(
  skillGraph.map((s) => [s.id, s.requires]),
);

/**
 * Left-to-right order of the clusters' bands on the canvas.
 *
 * Everything is drawn on one canvas — the clusters are neighbours, not
 * chapters — so this order is what decides how far a cross-cluster edge has
 * to travel. Chosen to put the heaviest bridges between adjacent bands:
 * 语言与系统 feeds 服务端 five times and sits next to it, and 桌面 sits
 * between 语言 and 通信 because 基站集成 needs PySide.
 *
 * A tunable constant. Reordering it only changes how tangled the long edges
 * look, never what the graph says.
 */
export const clusterOrder: ClusterId[] = [
  "ml",
  "lang",
  "server",
  "web",
  "app",
  "comm",
];

/**
 * One layout over the whole graph.
 *
 * Layered globally rather than per cluster: the rows have to mean the same
 * thing everywhere for a cross-cluster edge to be drawable, and an earlier
 * version that laid each cluster out alone could not show those edges at all.
 * Clustering is then applied horizontally by the page, which bands the slots
 * by cluster — see `clusterOrder`.
 */
export const skillLayout = layerDag(skillGraph);

/** Edges whose two ends live in different clusters. The exceptions. */
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
