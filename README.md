# self-web

个人网站。瑞士国际主义排版风格 + 北欧色调,静态部署到 GitHub Pages。

线上地址:<https://northoutertowner.github.io/self-web/>

## 结构

```
content/                ← 写文章的地方,Markdown + YAML frontmatter
  FORMAT.md             格式规范。写之前读这个
  journal/*.md          个人感受记录
  computing/*.md        计算机技术博客
  comms/*.md            通信工程博客
src/
  index.html          打包入口(Bun 以 HTML 为入口,资源图从这里展开)
  index.ts            本地开发服务器,路由回落到 index.html,并监听 content/
  frontend.tsx        React 入口,挂载路由并引入样式层
  App.tsx             路由表
  site.config.ts      站点名、Hero 文案、三条记录线的定义
  content/
    types.ts          Block / Inline 模型,与目录、阅读时长推导
    index.ts          查询层(按分类取文、上下篇)
    generated.ts      由 content/**/*.md 编译而来,gitignore,不要手改
  components/
    TopNav.tsx        固定顶栏
    Hero.tsx          首屏:网格背景 + 一次性打字动效
    SmoothScroll.tsx  ScrollSmoother 包装层(仅首页)
    CardsSection.tsx  三张卡片的环形轮播(拖拽/点击切换中心卡)
    TableOfContents.tsx 左侧目录,含当前小节高亮
    ArticleBody.tsx   块模型渲染
  pages/
    Home.tsx  CategoryPage.tsx  NotFound.tsx
  styles/
    tokens.css        设计令牌:配色、字阶、网格、动效曲线
    base.css          重置 + 全局排版 + 瑞士风格基础件
    nav.css  hero.css  cards.css  blog.css
scripts/
  markdown.ts         严格 Markdown 子集解析器
  content.ts          内容编译器:校验 content/**/*.md → src/content/generated.ts
  build.ts            构建(Bun.build API),构建前先编译内容
  preview.ts          按 GitHub Pages 的形态本地预览 dist
  inspect-bundle.ts   构建产物断言
  smoke.ts            无头浏览器渲染冒烟测试
```

## 命令

```bash
bun install

bun dev                # 开发服务器 http://localhost:3000,带 HMR,并监听 content/
bun run content:check  # 只校验文章格式,报出所有问题的文件和行号
bun run content        # 编译一次内容
bun run typecheck      # 先编译内容,再 tsc --noEmit

bun run build        # 构建到 dist/,根路径部署
bun run build:pages  # 构建到 dist/,基路径 /self-web/,并生成 404.html
bun run verify:pages # 断言产物:资源前缀、basename、生产版 React、404 回退
bun run preview      # 以 /self-web/ 形态本地预览 dist
bun run smoke        # 无头浏览器跑各路由,需先启动 preview 或 dev
```

验证一次完整的部署形态:

```bash
bun run build:pages
bun run verify:pages
bun run preview        # 另开一个终端
bun run smoke http://localhost:4173/self-web
```

## 部署

push 到 `main` 后由 `.github/workflows/deploy.yml` 自动构建部署。

仓库设置里需要把 **Settings → Pages → Build and deployment → Source** 设为
**GitHub Actions**。workflow 里的 `configure-pages` 带了 `enablement: true`,
没设过也会自动创建站点;但 Free 套餐的 private 仓库不支持 Pages,仓库需为 public。

### 基路径

项目站点挂在 `/<repo>/` 下,所以两处必须一致:

- `scripts/build.ts` 的 `publicPath` —— 决定 HTML / CSS / JS 里的资源路径前缀
- 注入的 `__BASE_PATH__` —— 决定 React Router 的 `basename`

两者都由 `bun run build:pages` 的 `--base /self-web` 一个参数推出。改仓库名时,
只需要改 `package.json` 里 `build:pages` 的那个值。换成用户主页仓库
(`northoutertowner.github.io`)时去掉该参数即可。

`dist/404.html` 是 `index.html` 的副本:GitHub Pages 没有服务端重写,
深链接(例如 `/self-web/computing/false-sharing`)冷启动时由它兜住,
再交给客户端路由接管。

## 写文章

在 `content/<分类>/` 下新建 `.md` 文件,文件名就是 URL 片段。完整规范在
**[content/FORMAT.md](content/FORMAT.md)**,简版:

```markdown
---
title: 标题
lede: 导语,排版上比正文大一号。
date: 2026-10-03
tags: [Runtime, Bun]
---

段落,可以用 `行内代码`、**强调**、[链接](https://example.com)。

## 小节标题会自动进入左侧目录

- 要点一
- 要点二

```ts
const a = 1;
```

> [!NOTE]
> 补充说明,带分类强调色底纹。
```

`bun dev` 会监听 `content/`,保存即热更新。

### 为什么不是通用 Markdown

解析器 (`scripts/markdown.ts`) 只接受规范里列出的构造,其余写法一律报错并指出
文件和行号。表格、图片、内嵌 HTML、缩进代码块、嵌套列表都会被拒绝。

这样换来三件事:不支持的写法不会被静默忽略成空白页面;浏览器端不需要加载
Markdown 解析器;内容路径上没有 `dangerouslySetInnerHTML`,链接地址在编译期
就挡掉了 `javascript:` 这类协议。

内容最终编译成 `src/content/types.ts` 里的 `Block` / `Inline` 树。要新增一种块,
三处都得改:`Block` 类型、`scripts/markdown.ts` 的解析分支、`ArticleBody.tsx` 的
渲染分支 —— 后者的 `switch` 有穷尽性检查,漏掉就是编译错误。

## 动效约定

- Hero 的两行字各打一次,打完即停,不循环。第二行等第一行写完才开始。
  实现见 `lib/useTypewriter.ts`:进度存在 ref 里允许续跑,而不是用标志位拦重复执行
  —— 后者会被 StrictMode 的双调用卡死(第一次的 cleanup 清掉定时器,第二次直接跳过)。
- 卡片是三站位的环形轮播,见 `components/CardsSection.tsx`。中间为视觉锚点,
  另两张分别停在左下与右上并被中间那张遮住一部分。环的循环顺序是
  `右上 → 中间 → 左下 → 右上`:向左下拖进一站,向右上拖退一站,点击侧边卡片
  则把它送到中间。卡片背景必须是不透明的,否则遮挡关系会变成一堆边框叠在一起。
  入场、强调线与视差都挂在舞台容器上,**不碰卡片自身的 transform** ——
  那部分归轮播逻辑独占,两边都写会打架。
- 触屏上舞台是 `touch-action: pan-y`,竖向留给浏览器滚页,所以触摸手势按横向
  分量判断方向;鼠标则按环本身的斜向判断。
- ScrollSmoother **只在首页启用**:它会给内容容器加 transform,
  导致博客页左侧目录的 `position: sticky` 失效。博客页用原生滚动。
- 全站尊重 `prefers-reduced-motion`:打字动效直接显示全文,
  滚动动效整条分支不注册,元素停在 CSS 的自然终态。
- `html` 上**没有** `scroll-behavior: smooth` —— 它会和 ScrollTrigger 冲突。
  目录锚点跳转走 GSAP ScrollToPlugin,并留出顶栏高度的偏移。
