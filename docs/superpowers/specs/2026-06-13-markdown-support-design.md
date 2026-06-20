# Markdown 文档支持 — 设计方案

- 状态：已确认（brainstorming 阶段产出）
- 日期：2026-06-13
- 范围：在现有 HTML 文档体系之外，新增对 Markdown 文档的完整支持（上传、新建、编辑、阅读、分享、复制）。

## 1. 目标与非目标

### 目标
- 文档支持两种格式：`html`（现状）与 `markdown`（新增），二者在同一套空间 / 权限 / 分享 / 回收站体系内并存。
- 可以**上传 `.md` 文件**，也可以在**独立的分栏编辑器**里新建 / 编辑 Markdown 内容并发布。
- 阅读页对 Markdown 做**嵌入式主题化渲染**（套用 Atlas 排版，文字可选中 / 搜索 / 打印），并提供：
  - **编辑按钮**（有写权限者可就地编辑并保存发布）。
  - **复制按钮**（可选「复制源码」或「复制带格式」）。
- 编辑器同样提供复制按钮（源码 / 带格式）。
- **支持尽可能全的 Markdown 语法**，达到 VSCode 预览级别的保真度：GFM（表格、删除线、自动链接、任务列表）、代码高亮、数学公式（KaTeX）、图表（Mermaid）、脚注、定义列表、上下标 / 高亮标记、emoji、标题锚点 + 目录（TOC）、GitHub 风格警告框（alerts）。
- 保持现有 UI 风格，交互含优雅动效。

### 非目标
- 不做 Markdown 的所见即所得（WYSIWYG）富文本编辑——编辑器是「源码 + 实时预览」分栏。
- 不改动权限模型、分享链接、回收站、审计等既有机制的语义。
- 不重命名现有 `documents.html` 列（控制改动半径）。
- 不为 HTML 阅读页新增编辑按钮（HTML 仍走现有后台编辑路径）；编辑按钮仅给 Markdown 阅读页。

## 2. 架构决策与取舍

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 阅读页渲染 | **嵌入式主题渲染**（Markdown→安全 HTML→渲染进阅读卡片） | 文字可选中 / 搜索 / 打印，贴合 Atlas 风格，"VSCode 预览感" 最强。Markdown 是受控渲染，净化后内联安全。HTML 文档仍走 sandbox iframe 不变。 |
| 编辑器布局 | **实时分栏**（左源码 / 右预览，滚动同步） | 最符合「像 VSCode 预览」的诉求；窄屏回退切页。 |
| 渲染位置 | **前端**渲染（markdown-it 全家桶） | 阅读页与编辑器共用同一渲染器；实时预览零延迟；渲染栈不进后端。 |
| 内容存储 | 复用现有 `documents.html` 列存原始内容，新增 `format` 列区分 | 避免迁移大文本列；`format` 决定如何解释内容。 |
| 安全 | 渲染期 `DOMPurify` 净化 + Mermaid 严格模式 | Markdown 允许内嵌原始 HTML，且内联进 App DOM，必须防 XSS。 |
| 体积 | markdown 模块整体动态 `import()` 懒加载 | 不拖累登录 / 主包；mermaid / katex 仅按需加载。 |

## 3. 数据与共享契约

### 3.1 DB schema（`apps/api/src/db/schema.ts`）
- `documents` 表新增列：
  ```ts
  format: text('format', { enum: ['html', 'markdown'] }).notNull().default('html'),
  ```
- 通过 `db:generate` 生成迁移（`ALTER TABLE documents ADD COLUMN format ...`），再 `db:migrate` / `db:seed`。现有文档默认 `html`，向后兼容。
- 原始内容（HTML 或 Markdown 源码）仍存 `html` 列，由 `format` 决定解释方式。代码注释说明该列承载「原始内容」。

### 3.2 共享 schema（`packages/shared/src/index.ts`）
- 新增 `FormatSchema = z.enum(['html', 'markdown'])` 与类型。
- `DocumentSchema` 增加 `format: FormatSchema.default('html')`。
- `CreateDocumentSchema` 增加 `format: FormatSchema.default('html')`。
- `UpdateDocumentSchema` 由 `CreateDocumentSchema.partial()` 自动带上 `format`（允许更新格式，通常不变）。

### 3.3 Markdown 元数据提取（`packages/shared/src/markdown-metadata.ts`，新增）
- `extractMarkdownMetadata(md, { fallbackTitle?, maxSummaryLength? }) => { title, summary }`。
- **轻量正则实现，不依赖 markdown-it**（保持后端 / shared 无重型依赖）：
  - title：首个 ATX 标题（`# ...`）或 setext 标题；否则 fallbackTitle。
  - summary：首个非空、非标题、非代码围栏的段落，剥离常见行内 Markdown 标记（`*_`` `[]()` 等），截断。
  - 复用 `extractHtmlMetadata` 同款占位标题判定 / 截断风格，保持一致。
- 从 `packages/shared/src/index.ts` 导出。

## 4. 后端（`apps/api`）

### 4.1 内容大小校验（`apps/api/src/lib/html-limits.ts`）
- 将 `validateHtmlForStorage` 泛化或新增 `validateContentForStorage(content)`（同样 8MB 字节上限，错误文案泛化为「内容」）。HTML 路径继续可用。

### 4.2 文档路由（`apps/api/src/routes/documents.ts`）
- 引入按 `format` 选择元数据提取器的 helper：`format === 'markdown'` 用 `extractMarkdownMetadata`，否则 `extractHtmlMetadata`。
- `toDoc` 序列化输出新增 `format` 字段（含 `includeHtml` 一致逻辑）。
- `POST /`（create）：从 body 读取 `format`，落库 `format`，按格式提取 title/summary，复用内容大小校验。
- `PATCH /:id`（update）：支持更新 `format`；当 `html`（内容）变更时按**目标格式**（body.format ?? doc.format）选提取器补全缺省 title/desc。
- `POST /upload`：
  - 接受 `.md` / `.markdown`（`text/markdown`、`text/x-markdown`）以及现有 `.html` / `.htm`。
  - 按扩展名 / MIME 判定 `format`；Markdown 用 `extractMarkdownMetadata`，title 缺省去掉 `.md` 后缀。
  - 默认 tags 改为按格式（如 markdown → `['uploaded']`，沿用现状即可）。
  - 落库 `format`。
- 其余路由（trash / restore / share / permanent 等）无需改动语义。

### 4.3 种子数据（`apps/api/src/db/seed-data.ts`）
- 新增 1 篇 `format: 'markdown'` 的示例文档，内容覆盖「全语法」：标题、列表、任务列表、表格、删除线、代码高亮、脚注、定义列表、上下标、emoji、警告框（alert）、KaTeX 行内 / 块级公式、Mermaid 图。用于演示与手动核对渲染保真度。
- 现有文档显式补 `format: 'html'`（或依赖默认值）。

## 5. 前端（`apps/web`）

### 5.1 渲染内核 `apps/web/src/markdown/renderer.ts`（新增）
- 配置 `markdown-it`（开启 `html`、`linkify`、`typographer`），挂载插件：
  - 核心 GFM：表格、删除线（core/`markdown-it` 选项 + 插件补齐）、自动链接（linkify）。
  - `markdown-it-task-lists`（任务列表）、`markdown-it-footnote`（脚注）、`markdown-it-deflist`（定义列表）、`markdown-it-sub` / `markdown-it-sup`（上下标）、`markdown-it-mark` / `markdown-it-ins`（高亮 / 插入）、`markdown-it-emoji`（emoji）、`markdown-it-anchor` + `markdown-it-table-of-contents`（锚点 + TOC）、GitHub alerts 插件（警告框）。
  - 代码高亮：`highlight.js`（`highlight` 回调）；`mermaid` 代码块标记为占位、跳过高亮，留待 enhancer。
  - 数学：KaTeX 的 markdown-it 插件（采用 VSCode 同款 `@vscode/markdown-it-katex` 或等价），渲染 `$...$` / `$$...$$`。
- 导出：
  - `renderMarkdown(src: string): string` —— markdown-it 渲染 → `DOMPurify.sanitize`（允许 KaTeX / MathML / SVG 所需标签属性）→ 返回安全 HTML 字符串。Mermaid 块以受控占位元素（如 `<pre class="md-mermaid">源码</pre>`）形式保留，不经 DOMPurify 破坏。
  - `enhance(container: HTMLElement): Promise<void>` —— 对已插入 DOM 的容器执行后处理：找到 mermaid 占位节点，`mermaid.run({ securityLevel: 'strict' })` 渲染为 SVG。（KaTeX 在渲染期已出 HTML，无需后处理；若改为占位策略则同处理。）
- **依赖整体懒加载**：模块内部对 `mermaid` / `katex` / `highlight.js` 用动态 `import()`，渲染器首次使用时加载；`renderer.ts` 自身也可被消费方动态导入，避免进登录 / 主包。

### 5.2 复制逻辑 `apps/web/src/markdown/copy.ts`（新增，阅读 / 编辑共用）
- `copyMarkdownSource(src)`：`navigator.clipboard.writeText(src)`（`text/plain`）。
- `copyMarkdownRich(src)`：`renderMarkdown(src)` 得到安全 HTML →
  `navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': srcBlob })])`，
  粘贴进 Word / 飞书 / 邮件 / Notion 保留排版。
- 无 `ClipboardItem` 的旧浏览器：退化为只复制源码，并提示「已复制源码」。
- 返回 / 抛出供 UI 显示 ✓「已复制」反馈。

### 5.3 样式（`apps/web/src/styles.css` 或 `markdown/markdown.css`）
- 新增 `.md-body` 主题化排版：标题层级、段落、列表 / 任务列表、表格、引用、代码块 / 行内代码、分割线、链接、图片、脚注、警告框（alert，按类型配色）、TOC，全部对齐 Atlas 设计 token（`--ink-*`、`--canvas`、`--pearl`、`--blue`、`--font-display`、`--font-mono` 等）。
- 引入 highlight.js 主题（贴近 Atlas 配色）与 KaTeX 样式。
- 复制 / 编辑按钮复用现有 `pill-btn` / `btn` 样式与动效；编辑器分栏、滚动同步、悬浮态等动效与现有编辑器一致。

### 5.4 阅读组件 `apps/web/src/views/markdown-reader.tsx`（新增）
- 接收原始 Markdown 内容，调用渲染器输出 HTML 注入 `.md-body` 容器，挂载后调用 `enhance`。
- 处理加载态（懒加载渲染器期间显示「正在渲染…」）与空内容兜底。
- 文字可选中；滚动事件转发给 `onChromeScroll`（与现有阅读页 chrome 行为一致）。

### 5.5 阅读页 `apps/web/src/views/reader-view.tsx`（改）
- 按 `detailDoc.format` 分支：`markdown` → `<MarkdownReader>`；`html` → 现有 sandbox iframe（不变）。
- meta 栏（仅 markdown 且 `doc.canEdit`）新增 **「编辑」按钮**：点击就地打开 `MarkdownEditorDialog` 覆盖层；保存走 `updateDocument` 并刷新。
- meta 栏（markdown）新增 **「复制」按钮**：下拉 / 二选一「复制源码」「复制带格式」，复用 5.2，反馈 ✓「已复制」。
- 既有「链接」「分享」按钮保留。

### 5.6 公开分享页 `apps/web/src/views/public-document-view.tsx`（改）
- 按 `doc.format` 分支：`markdown` → `<MarkdownReader>`（只读，无编辑按钮，可保留复制按钮）；`html` → 现有 iframe。

### 5.7 编辑器 `apps/web/src/views/markdown-editor-dialog.tsx`（新增）
- 与现有 `HTMLEditorDialog` 并存、复用其弹窗骨架 / 动效 / 空间选择器 / 标题摘要 / Cmd+S / Esc。
- **实时分栏**：左 `<textarea>` 源码（行号 gutter）、右 `.md-body` 实时预览（防抖渲染 + `enhance`），**滚动同步**。窄屏（媒体查询）回退为「源码 / 预览」切页。
- 顶部工具栏含 **复制按钮**（源码 / 带格式）。
- `isNew` 区分新建 / 编辑；保存回调 `onSave(content, patch)`，patch 含 `format: 'markdown'`。
- 元数据：用 `extractMarkdownMetadata` 在保存时补全缺省 title/desc（与 HTML 编辑器对称）。

### 5.8 入口
- `apps/web/src/views/admin-docs-view.tsx`（改）：
  - 「新建」按钮改为提供 **HTML / Markdown** 两个选项（小菜单或二级按钮）。
  - 按 `editing.format` 打开 `HTMLEditorDialog` 或 `MarkdownEditorDialog`；点击已有文章的「编辑内容」也按 `doc.format` 路由。
  - `saveDoc` 透传 `format` 给 `createDocument` / `updateDocument`。
- `apps/web/src/views-admin/upload-view.tsx`（改）：
  - 接受 `.md` / `.markdown`（拖拽与文件选择 `accept` 更新），按扩展名判定 `format`。
  - Markdown 用 `extractMarkdownMetadata`；审阅步骤的预览对 markdown 用 `<MarkdownReader>` 主题化渲染，对 html 用现有 iframe。
  - 文案从「上传 HTML 文档」泛化为「上传文档（HTML / Markdown）」。

### 5.9 数据 hooks（`apps/web/src/data-hooks.ts`）
- `createDocument` / `updateDocument` 已是泛型透传，仅需类型 / 调用处带上 `format`。`uploadDocument` 用 FormData，无需改签名。

## 6. 依赖
新增前端依赖（`apps/web`）：`markdown-it` 及上述插件、`highlight.js`、`katex` + markdown-it-katex 插件、`mermaid`、`dompurify`（含类型）。均经动态 `import()` 懒加载以隔离体积。后端 / shared **不新增**重型依赖（元数据提取走轻量正则）。

## 7. 安全
- Markdown 渲染输出一律经 `DOMPurify` 净化后才进 DOM；允许 KaTeX / MathML / SVG 所需的标签与属性白名单。
- Mermaid 以 `securityLevel: 'strict'` 渲染，输入受控（来自文档作者 / 有写权限者）。
- 存储层不做净化（与现有 HTML 路线一致：净化发生在渲染期）；上传仅做大小限制。
- 复制带格式写入的是**已净化**的 HTML。

## 8. 测试与验证
- **API 测试**（`apps/api/src/server.test.ts` 或新增）：
  - 创建 markdown 文档：`format` 持久化、按 markdown 提取 title/summary。
  - 更新 markdown 内容：缺省 title/desc 按 markdown 补全。
  - 上传 `.md`：`format = 'markdown'`、title 去后缀、大小限制生效。
  - 上传 `.html` 与既有行为不回归；权限校验对两种格式一致。
- **shared 单测**（可选）：`extractMarkdownMetadata` 标题 / 摘要 / 占位判定。
- **手动验证**：用「全语法」种子文档在阅读页 / 编辑器实时预览核对 GFM、代码高亮、KaTeX、Mermaid、脚注、警告框、TOC 等渲染保真度；验证两种复制模式粘贴到富文本 / 纯文本目标的结果；窄屏编辑器回退；编辑按钮权限可见性。
- `bun run typecheck` / `bun run lint` / `bun test apps/api/src` 通过。

## 9. 单元边界（便于拆分实现）
1. shared：`FormatSchema` + schema 字段 + `extractMarkdownMetadata`。
2. API：schema `format` 列 + 迁移。
3. API：`documents.ts` + 内容校验泛化（格式感知 create/update/upload）。
4. web：`markdown/renderer.ts`（纯渲染 + enhance，懒加载）。
5. web：`markdown/copy.ts`（源码 / 带格式复制）。
6. web：`.md-body` 样式 + 高亮 / KaTeX 主题。
7. web：`markdown-reader.tsx`。
8. web：`markdown-editor-dialog.tsx`（分栏 + 同步滚动 + 复制按钮）。
9. web：`reader-view.tsx`（分支 + 编辑 / 复制按钮）、`public-document-view.tsx`（分支）。
10. web：`upload-view.tsx`（.md 支持）、`admin-docs-view.tsx`（新建分流 + 编辑路由）。
11. 种子数据：全语法示例 markdown 文档。
