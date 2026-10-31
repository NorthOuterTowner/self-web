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
  {
    slug: "data-structure",
    category: "computing",
    title: "数据结构理论",
    titleEn: "Data Structure Theories",
    summary: "描述各种不同的数据结构及其应用",
    intro: "通过该专栏，记录常用的数据结构。"
  },
  {
    slug: "database",
    category: "computing",
    title: "数据库系统",
    titleEn: "Database System",
    summary: "数据库系统的基本介绍和对应的原理",
    intro: "尽管MySQL是当前最为广泛流行的db之一，但了解各种不同的SQL和NoSQL有助于软件工程师应对不同的情况。"
  },
  {
    slug: "git-use",
    category: "computing",
    title: "版本控制",
    titleEn: "Version Control",
    summary: "介绍版本控制的工作原理和工作事项",
    intro: "本专栏将以Git为基础详细介绍在代码协作过程中的协作模式以及工作中可能遇到的小问题"
  }
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
  summary: "诗词、生活里的小发现、向内和向外的想法",
  intro:
    "不成篇的内容。",
  /** Shown under the constellation, explaining how to read the field. */
  axisNote: "点下任意一点星光",
} as const;

export type NoteKindId = "poem" | "tip" | "musing" | "outlook";

export interface NoteKindMeta {
  id: NoteKindId;
  /** Chinese display name. */
  title: string;
  titleEn: string;
  /**
   * Which design token colours the dot.
   *
   * Four genres, four accent tones, one each — so on the constellation a
   * colour names a kind outright and there is nothing to disambiguate in the
   * popover. Keep it that way: a fifth genre would either have to share a
   * tone, which breaks the mapping, or add a token the whole site then has to
   * answer for.
   *
   *   clay   诗            poem
   *   birch  能照着做的     tip
   *   fjord  向内          musing
   *   ink    向外          outlook
   */
  tone: "ink" | "fjord" | "clay" | "birch";
}

export const noteKinds: NoteKindMeta[] = [
  // 格言、古诗、词、十四行诗合成一类。它们在篇幅、语气和排版上是同一种东西 ——
  // 压缩过的、一句顶一段的写法 —— 分成几个 kind 只是在给同一族贴几张标签。
  // 具体是什么体裁，标题自己就说清楚了（「虞美人 · …」「Sonnet 18」）。
  { id: "poem", title: "诗词", titleEn: "Verse", tone: "clay" },
  { id: "tip", title: "生活小 tips", titleEn: "Practical Note", tone: "birch" },
  // 感悟按朝向拆开，而不是按长短。向内的是具体的、自己的，迷茫归在这里；
  // 向外的是宏观的，未来、世界、行业。同一件事往哪个方向想，读起来是两种东西。
  { id: "musing", title: "向内", titleEn: "Inward", tone: "fjord" },
  { id: "outlook", title: "向外", titleEn: "Outward", tone: "ink" },
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

/* ------------------------------------------------------------------ *
 * Top nav
 * ------------------------------------------------------------------ */

/**
 * Destinations in the top nav that are not categories.
 *
 * The nav used to be derived from `categories` alone, which tied two
 * unrelated decisions together: appearing in the nav, and owning a card on
 * the home page ring. The ring has exactly three stations and walks them with
 * `mod3`, so anything that wants a nav entry but no card has nowhere to go —
 * 杂谈 was the first case, reachable only from the home page band.
 *
 * Adding one is a single edit here. The accent is applied as an inline custom
 * property rather than another `[data-accent-key]` rule in `nav.css`, so this
 * list stays the only place to touch.
 */
export interface NavExtra {
  /** Stable key, used for React keys and the active-state hook. */
  key: string;
  to: string;
  /** Latin label, to match the categories' `titleEn` in the nav. */
  label: string;
  /**
   * Chinese name, matching the categories' `title`. The nav does not show
   * it; the 404 page's site map, which has room for both, does.
   */
  title: string;
  /**
   * Token that colours the icon and the underline while the entry is active.
   * The icon itself is chosen in `src/lib/icons.ts`, by `key` — kept out of
   * this file because the content compiler imports it and has no use for
   * React components.
   */
  tone: "ink" | "fjord" | "clay" | "birch";
}

/**
 * A destination that is in the nav but has no content pipeline behind it yet.
 *
 * Rendered by `pages/StubPage.tsx`, which reuses the empty-category layout.
 * The point is that the link is never dead: you get the masthead, the title
 * and a line saying it is not built, rather than a 404 or a blank screen that
 * reads as a bug.
 */
export interface StubMeta {
  slug: string;
  title: string;
  titleEn: string;
  /** One line under the title. Placeholder copy — rewrite when it is built. */
  intro: string;
}

export const skills: StubMeta = {
  slug: "skills",
  title: "Skill与Prompt",
  titleEn: "Skills and prompts",
  intro: "可复用的Skill与Prompt，按用途归档，便于查找和日常使用。",
};

/* ------------------------------------------------------------------ *
 * Resources — skill 与 prompt
 * ------------------------------------------------------------------ */

/**
 * The two things that live under `/skills`.
 *
 * One directory and one URL namespace, with the kind in frontmatter rather
 * than in the path. A skill and a prompt are the same shape of object — a
 * reusable piece of instruction with a title and a body — and they are
 * browsed together on one page, so splitting them across two directories
 * would buy nothing and cost a second route namespace.
 *
 * That is the opposite of the call made for 专栏, where the directory *is*
 * the grouping. The difference: a series is a place you put files, a kind is
 * a property of the file.
 */
export type ResourceKindId = "skill" | "prompt";

export interface ResourceKindMeta {
  id: ResourceKindId;
  title: string;
  titleEn: string;
  tone: "ink" | "fjord" | "clay" | "birch";
  /** One line on what belongs under this kind. */
  note: string;
}

export const resourceKinds: ResourceKindMeta[] = [
  {
    id: "skill",
    title: "Skill",
    titleEn: "Skill",
    tone: "fjord",
    note: "一套可复用的做法：什么时候用、步骤、以及容易踩的地方。",
  },
  {
    id: "prompt",
    title: "Prompt",
    titleEn: "Prompt",
    tone: "clay",
    note: "可以直接抄走的提示词，连同它假设的上下文和已知的失效场景。",
  },
];

export const resourceKindById: Record<ResourceKindId, ResourceKindMeta> =
  resourceKinds.reduce(
    (acc, k) => {
      acc[k.id] = k;
      return acc;
    },
    {} as Record<ResourceKindId, ResourceKindMeta>,
  );

export function isResourceKindId(value: unknown): value is ResourceKindId {
  return value === "skill" || value === "prompt";
}

export const resourceKindIds: string[] = resourceKinds.map((k) => k.id);

/**
 * No longer a stub — `pages/RoadmapPage.tsx` renders it from the stages in
 * `content/roadmap.ts`. It keeps the `StubMeta` shape because the page needs
 * exactly these four fields and nothing more.
 */
export const roadmap: StubMeta = {
  slug: "roadmap",
  title: "路线图",
  titleEn: "Roadmap",
  intro: "通过roadmap来绘制已经掌握的知识以及打算学的知识",
};

/**
 * The daily log at `/daily`: a calendar over `content/daily/YYYY-MM.json`,
 * rendered by `pages/DailyPage.tsx`. No masthead or intro, so only the wiring
 * lives here.
 */
export const daily = {
  slug: "daily",
  label: "Daily",
} as const;

/**
 * The word draw at `/game`, rendered by `pages/GamePage.tsx`.
 *
 * Two levels: a category (大类) is a folder, a field (小类) is one file in it,
 * `content/random/<category>/<field>.txt` — one term per line in double
 * quotes, blank lines allowed as separators. `content:check` fails on a
 * declared field with no file, a file or folder nobody declared, a malformed
 * line or a repeated word (see `scripts/random.ts`). The build writes each
 * list to `data/random/<category>/<field>.txt` stripped to bare words.
 *
 * The draw is uniform over the *fields* that are ticked, not the categories.
 * Categories differ wildly in breadth — 理学 spans five sciences, 教育学 is one
 * — so splitting a broad category into fields is how it gets its fair share.
 * A category with a single field lists just that one field in the picker.
 *
 * Ids are lowercase ASCII with hyphens: they are folder names, file names and
 * URL segments. Renaming one means renaming its folder or file too.
 */
export const game = {
  slug: "game",
  label: "Game",
  title: "随机词",
} as const;

export interface RandomFieldMeta {
  id: string;
  title: string;
}

export interface RandomCategoryMeta {
  id: string;
  title: string;
  fields: RandomFieldMeta[];
}

export const randomCategories: RandomCategoryMeta[] = [
  {
    id: "philosophy",
    title: "哲学",
    fields: [
      { id: "philosophy", title: "哲学" },
      { id: "logic", title: "逻辑学" },
      { id: "religious-studies", title: "宗教学" },
    ],
  },
  {
    id: "economics",
    title: "经济学",
    fields: [
      { id: "economics", title: "经济学" },
      { id: "finance", title: "金融学" },
      { id: "accounting", title: "会计学" },
      { id: "auditing", title: "审计学" },
    ],
  },
  {
    id: "law",
    title: "法学",
    fields: [
      { id: "law", title: "法学" },
      { id: "political-science", title: "政治学" },
      { id: "sociology", title: "社会学" },
      { id: "ethnology", title: "民族学" },
      { id: "public-security", title: "公安学" },
    ],
  },
  {
    id: "education",
    title: "教育学",
    fields: [
      { id: "education", title: "教育学" },
      { id: "psychology", title: "心理学" },
      { id: "sports-science", title: "体育学" },
    ],
  },
  {
    id: "literature",
    title: "文学",
    fields: [
      { id: "linguistics", title: "语言学" },
      { id: "ancient-literature", title: "中国古代语言文学" },
      { id: "modern-literature", title: "中国现当代语言文学" },
      { id: "foreign-literature", title: "外国语言文学" },
      { id: "journalism", title: "新闻传播学" },
    ],
  },
  {
    id: "history",
    title: "历史学",
    fields: [
      { id: "chinese-history", title: "中国史" },
      { id: "ancient-world-history", title: "世界上古史" },
      { id: "medieval-world-history", title: "世界中古史" },
      { id: "early-modern-world-history", title: "世界近代早期史" },
      { id: "modern-world-history", title: "世界近代史" },
      { id: "contemporary-world-history", title: "世界现当代史" },
      { id: "archaeology", title: "考古学" },
      { id: "historical-geography", title: "历史地理学" },
    ],
  },
  {
    id: "science",
    title: "理学",
    fields: [
      { id: "mathematics", title: "数学" },
      { id: "physics", title: "物理学" },
      { id: "chemistry", title: "化学" },
      { id: "astronomy", title: "天文学" },
      { id: "geography", title: "地理学" },
      { id: "atmospheric-science", title: "大气科学" },
      { id: "marine-science", title: "海洋科学" },
      { id: "earth-science", title: "地球科学" },
      { id: "biology", title: "生物学" },
      { id: "ecology", title: "生态学" },
    ],
  },
  {
    id: "engineering",
    title: "工学",
    fields: [
      { id: "mechanical", title: "力学与机械工程" },
      { id: "materials", title: "材料与冶金工程" },
      { id: "energy-power", title: "能源与动力工程" },
      { id: "electrical", title: "电气工程" },
      { id: "electronics-communication", title: "电子与通信工程" },
      { id: "computer-science", title: "计算机科学" },
      { id: "civil", title: "建筑与土木工程" },
      { id: "hydraulic", title: "水利工程" },
      { id: "geology-mining", title: "地质与矿业工程" },
      { id: "aerospace", title: "航空航天" },
      { id: "ordnance", title: "兵器科学与技术" },
      { id: "food-science", title: "食品科学" },
    ],
  },
  {
    id: "agriculture",
    title: "农学",
    fields: [
      { id: "crop-science", title: "作物学" },
      { id: "horticulture", title: "园艺学" },
      { id: "plant-protection", title: "植物保护" },
      { id: "animal-science", title: "畜牧学" },
      { id: "forestry", title: "林学" },
      { id: "fisheries", title: "水产" },
      { id: "grassland", title: "草学" },
    ],
  },
  {
    id: "medicine",
    title: "医学",
    fields: [
      { id: "basic-medicine", title: "基础医学" },
      { id: "clinical-medicine", title: "临床医学" },
      { id: "stomatology", title: "口腔医学" },
      { id: "public-health", title: "公共卫生与预防医学" },
      { id: "pharmacy", title: "药学" },
      { id: "tcm", title: "中医学" },
      { id: "nursing", title: "护理学" },
      { id: "forensic-medicine", title: "法医学" },
    ],
  },
  {
    id: "management",
    title: "管理学",
    fields: [
      { id: "library-information", title: "图书情报与档案管理" },
      { id: "logistics", title: "物流与供应链管理" },
      { id: "tourism", title: "旅游管理" },
    ],
  },
  {
    id: "arts",
    title: "艺术学",
    fields: [
      { id: "music-dance", title: "音乐与舞蹈学" },
      { id: "drama-film", title: "戏剧与影视学" },
      { id: "fine-arts", title: "美术与书法" },
      { id: "design", title: "设计学" },
      { id: "art-heritage", title: "艺术遗产" },
    ],
  },
];

/** `<category>/<field>`: the unit the draw picks from, and the file's path. */
export type RandomFieldKey = string;

/** One field, flattened with its category, as the page and the build use it. */
export interface RandomField {
  key: RandomFieldKey;
  categoryId: string;
  categoryTitle: string;
  id: string;
  title: string;
  /** "工学 · 计算机科学"; or just "哲学" for the field named after its category. */
  label: string;
}

export const randomFieldList: RandomField[] = randomCategories.flatMap((c) =>
  c.fields.map((f) => ({
    key: `${c.id}/${f.id}`,
    categoryId: c.id,
    categoryTitle: c.title,
    id: f.id,
    title: f.title,
    // A field named after its category (the only field of most categories,
    // and 工学's general list) would otherwise read "工学 · 工学".
    label: f.title === c.title ? c.title : `${c.title} · ${f.title}`,
  })),
);

const randomFieldByKey = new Map(randomFieldList.map((f) => [f.key, f]));

export function getRandomField(key: string): RandomField | undefined {
  return randomFieldByKey.get(key);
}

/** Exact match against the declared keys, which also rules out path tricks. */
export function isRandomFieldKey(value: unknown): value is RandomFieldKey {
  return typeof value === "string" && randomFieldByKey.has(value);
}

export const navExtras: NavExtra[] = [
  {
    key: "skills",
    to: `/${skills.slug}`,
    label: skills.titleEn,
    title: skills.title,
    tone: "fjord",
  },
  {
    key: "roadmap",
    to: `/${roadmap.slug}`,
    label: roadmap.titleEn,
    title: roadmap.title,
    tone: "clay",
  },
  {
    key: "others",
    to: `/${others.slug}`,
    label: "Notes",
    title: others.title,
    // 杂谈 spans all four genre tones, so no single accent is truthful. Ink
    // reads as "all of them" rather than picking a favourite.
    tone: "ink",
  },
  {
    key: "daily",
    to: `/${daily.slug}`,
    label: daily.label,
    title: "日常",
    tone: "birch",
  },
  {
    key: "game",
    to: `/${game.slug}`,
    label: game.label,
    title: game.title,
    // All four accents are taken; fjord is the coolest against daily's birch
    // sitting right beside it.
    tone: "fjord",
  },
];

/**
 * The gated page, reached from the lock in the footer.
 *
 * Deliberately absent from `sections`, and so from the top bar and from the
 * site map the 404 page prints. The code is public and the ciphertext is
 * public, so this hides nothing from anyone who looks — it just declines to
 * point the way.
 *
 * Only the wiring is here — the slug the router and the footer have to agree
 * on, and the word the lock is labelled with. What the page itself says is in
 * `pages/SecretPage.tsx`, next to the markup that says it: nobody editing a
 * sentence on one page should have to open the file that describes the whole
 * site.
 */
export const secret = {
  slug: "secret",
  label: "secret",
} as const;
