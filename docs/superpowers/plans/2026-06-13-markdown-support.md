# Markdown 文档支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Atlas 现有 HTML 文档体系之外，新增完整的 Markdown 文档支持（上传 / 新建 / 编辑 / 阅读 / 分享 / 复制），渲染保真度对齐 VSCode 预览。

**Architecture:** 文档新增 `format` 列（`html | markdown`，默认 `html`），原始内容仍存 `documents.html` 列由 `format` 解释。前端用 markdown-it 全家桶 + KaTeX + Mermaid + DOMPurify 做嵌入式主题渲染（懒加载），阅读页与编辑器共用同一渲染器；权限模型完全不变。

**Tech Stack:** Bun 1.3.14 / Hono / Drizzle / bun:sqlite（后端），React 19 + Vite 6（前端），markdown-it、highlight.js、katex、mermaid、dompurify。

参考设计 spec：`docs/superpowers/specs/2026-06-13-markdown-support-design.md`

---

## 文件结构

**新建：**
- `packages/shared/src/markdown-metadata.ts` — 轻量正则版 Markdown 标题/摘要提取（无重型依赖）。
- `apps/web/src/markdown/renderer.ts` — markdown-it 渲染器 + DOMPurify 净化 + `enhance()`（mermaid/katex 后处理），全部懒加载。
- `apps/web/src/markdown/copy.ts` — 复制源码 / 复制带格式。
- `apps/web/src/markdown/markdown.css` — `.md-body` 主题排版 + 高亮/KaTeX/警告框样式。
- `apps/web/src/views/markdown-reader.tsx` — 阅读用渲染组件。
- `apps/web/src/views/markdown-editor-dialog.tsx` — 实时分栏编辑器。

**修改：**
- `packages/shared/src/index.ts` — `FormatSchema` + schema 字段 + 导出 metadata。
- `apps/api/src/db/schema.ts` — `documents.format` 列。
- `apps/api/src/lib/html-limits.ts` — 泛化为内容大小校验。
- `apps/api/src/routes/documents.ts` — 格式感知 create/update/upload + 序列化 `format`。
- `apps/api/src/db/seed-data.ts` / `seed.ts` — 全语法示例 markdown 文档。
- `apps/web/src/data-hooks.ts` — 类型透传 `format`（如需）。
- `apps/web/src/views/reader-view.tsx` — 按 format 分支 + 编辑/复制按钮。
- `apps/web/src/views/public-document-view.tsx` — 按 format 分支。
- `apps/web/src/views-admin/upload-view.tsx` — 接受 `.md`。
- `apps/web/src/views/admin-docs-view.tsx` — 新建分流 + 编辑路由。
- `apps/web/src/main.tsx`（或入口）— 引入 `markdown.css`。

---

## Task 1: 共享 — FormatSchema 与 schema 字段

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 加入 FormatSchema 与文档字段**

在 `VisibilitySchema` 定义之后加入：

```ts
export const FormatSchema = z.enum(['html', 'markdown']);
export type Format = z.infer<typeof FormatSchema>;
```

在 `DocumentSchema` 的 object 里（`visibility` 之后）加入：

```ts
  format: FormatSchema.default('html'),
```

在 `CreateDocumentSchema` 的 object 里（`visibility` 之后）加入：

```ts
  format: FormatSchema.default('html'),
```

`UpdateDocumentSchema = CreateDocumentSchema.partial()` 会自动带上可选 `format`，无需改动。

- [ ] **Step 2: 校验类型编译**

Run: `bun run --filter @atlas/shared typecheck`
Expected: PASS（无错误输出）

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add document format schema field"
```

---

## Task 2: 共享 — Markdown 元数据提取（TDD）

**Files:**
- Create: `packages/shared/src/markdown-metadata.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/markdown-metadata.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `packages/shared/src/markdown-metadata.test.ts`：

```ts
import { describe, expect, test } from 'bun:test';
import { extractMarkdownMetadata } from './markdown-metadata';

describe('extractMarkdownMetadata', () => {
  test('takes title from first ATX heading and summary from first paragraph', () => {
    const md = `# 部署清单\n\n这是**第一段**正文，用作摘要。\n\n## 小节\n更多内容`;
    const { title, summary } = extractMarkdownMetadata(md, { fallbackTitle: 'x.md' });
    expect(title).toBe('部署清单');
    expect(summary).toBe('这是第一段正文，用作摘要。');
  });

  test('falls back to provided title when no heading exists', () => {
    const md = `只是一段普通文字，没有标题。`;
    const { title, summary } = extractMarkdownMetadata(md, { fallbackTitle: 'notes.md' });
    expect(title).toBe('notes');
    expect(summary).toBe('只是一段普通文字，没有标题。');
  });

  test('skips code fences when finding the summary', () => {
    const md = '# T\n\n```js\nconst x = 1;\n```\n\n真正的摘要段落。';
    const { summary } = extractMarkdownMetadata(md, {});
    expect(summary).toBe('真正的摘要段落。');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test packages/shared/src/markdown-metadata.test.ts`
Expected: FAIL（`Cannot find module './markdown-metadata'`）

- [ ] **Step 3: 实现提取器**

创建 `packages/shared/src/markdown-metadata.ts`：

```ts
const TITLE_PLACEHOLDERS = new Set(['untitled', 'new document', '未命名文章', '无标题']);

function normalizeFallbackTitle(value = '') {
  return value
    .replace(/\.(md|markdown)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip the most common inline Markdown markers so the summary reads as plain text.
function stripInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1') // bold/italic/strike
    .replace(/^>+\s?/g, '') // blockquote markers
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max).trim()}...`;
}

export function extractMarkdownMetadata(
  md: string,
  options: { fallbackTitle?: string; maxSummaryLength?: number } = {},
) {
  const maxSummaryLength = options.maxSummaryLength ?? 180;
  const fallbackTitle = normalizeFallbackTitle(options.fallbackTitle);
  const lines = md.replace(/\r\n/g, '\n').split('\n');

  let headingTitle = '';
  let inFence = false;
  const paragraphLines: string[] = [];
  let summary = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const atx = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (atx && !headingTitle) {
      headingTitle = atx[1].trim();
      continue;
    }

    if (!summary) {
      if (line.trim() === '') {
        if (paragraphLines.length) summary = stripInline(paragraphLines.join(' '));
        continue;
      }
      // Skip heading/list/table/quote markers when collecting the first prose paragraph.
      if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||---|\*\*\*)/.test(line)) {
        if (paragraphLines.length) summary = stripInline(paragraphLines.join(' '));
        continue;
      }
      paragraphLines.push(line.trim());
    }
  }
  if (!summary && paragraphLines.length) summary = stripInline(paragraphLines.join(' '));

  const rawTitle = [headingTitle, fallbackTitle].find(
    (item) => item && !TITLE_PLACEHOLDERS.has(item.toLowerCase()),
  );
  const title = rawTitle ? truncate(rawTitle, 200) : fallbackTitle;

  return { title, summary: summary ? truncate(summary, maxSummaryLength) : '' };
}
```

- [ ] **Step 4: 从 index 导出**

在 `packages/shared/src/index.ts` 顶部、`extractHtmlMetadata` 导出行旁加入：

```ts
export { extractMarkdownMetadata } from './markdown-metadata';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test packages/shared/src/markdown-metadata.test.ts`
Expected: PASS（3 个用例全过）

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/markdown-metadata.ts packages/shared/src/markdown-metadata.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add lightweight markdown metadata extractor"
```

---

## Task 3: API — documents.format 列与迁移

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: 迁移文件（由 `db:generate` 生成）

- [ ] **Step 1: 在 schema 增加 format 列**

在 `documents` 表定义里、`visibility` 列之后加入：

```ts
    format: text('format', { enum: ['html', 'markdown'] }).notNull().default('html'),
```

- [ ] **Step 2: 生成迁移**

Run: `bun run --filter @atlas/api db:generate`
Expected: 在 `apps/api/src/db/migrations/` 下生成新迁移，含 `ALTER TABLE \`documents\` ADD \`format\` text DEFAULT 'html' NOT NULL;`

- [ ] **Step 3: 应用迁移并重置种子**

Run: `bun run --filter @atlas/api db:migrate`
Expected: 迁移成功，无报错

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/migrations
git commit -m "feat(api): add format column to documents"
```

---

## Task 4: API — 内容大小校验泛化

**Files:**
- Modify: `apps/api/src/lib/html-limits.ts`

- [ ] **Step 1: 新增泛化函数，保留旧名兼容**

把文件改为：

```ts
import { badRequest } from './http-error';

const MAX_CONTENT_BYTES = 8 * 1024 * 1024;

// Atlas does NOT sanitize stored content at rest. HTML is rendered inside a
// sandboxed iframe; Markdown is sanitized at render time on the client. This
// helper only enforces an upload size limit.
export function validateContentForStorage(content: string) {
  const size = new TextEncoder().encode(content).byteLength;
  if (size > MAX_CONTENT_BYTES) {
    throw badRequest(`内容超出 ${MAX_CONTENT_BYTES / 1024 / 1024} MB 上限。`);
  }
  return { content, size };
}

// Backwards-compatible alias used by existing HTML routes.
export function validateHtmlForStorage(html: string) {
  const { content, size } = validateContentForStorage(html);
  return { html: content, size };
}
```

- [ ] **Step 2: 校验类型**

Run: `bun run --filter @atlas/api typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/html-limits.ts
git commit -m "refactor(api): generalize content size validation"
```

---

## Task 5: API — 文档路由格式感知（TDD）

**Files:**
- Modify: `apps/api/src/routes/documents.ts`
- Test: `apps/api/src/server.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `apps/api/src/server.test.ts` 的 `describe('Atlas API', ...)` 内追加：

```ts
  test('creates a markdown document and infers metadata by markdown rules', async () => {
    const admin = await loginAs();
    const md = '# Markdown 标题\n\n这是 markdown 摘要段落。\n\n- 列表项';
    const create = await request('/documents', {
      method: 'POST',
      body: JSON.stringify({
        spaceId: 's1',
        title: '',
        visibility: 'private',
        format: 'markdown',
        html: md,
      }),
      headers: { 'content-type': 'application/json', ...admin.headers },
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };

    const res = await request(`/documents/${created.id}`, { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as ApiDoc & { format: string };
    expect(body.format).toBe('markdown');
    expect(body.title).toBe('Markdown 标题');
    expect(body.desc).toBe('这是 markdown 摘要段落。');
    expect(body.html).toBe(md);
  });

  test('uploads a .md file and stores it as markdown', async () => {
    const admin = await loginAs();
    const md = '# 上传的 MD\n\n上传摘要。';
    const form = new FormData();
    form.set('file', new File([md], 'guide.md', { type: 'text/markdown' }));
    form.set('spaceId', 's1');
    form.set('visibility', 'private');

    const upload = await request('/documents/upload', {
      method: 'POST',
      body: form,
      headers: admin.headers,
    });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as { id: string };

    const res = await request(`/documents/${created.id}`, { headers: { cookie: admin.cookie } });
    const body = (await res.json()) as ApiDoc & { format: string };
    expect(body.format).toBe('markdown');
    expect(body.title).toBe('上传的 MD');
    expect(body.html).toBe(md);
  });
```

并在文件顶部 `type ApiDoc` 定义里加入 `format?: string;` 字段（若 TS 报缺字段）。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test apps/api/src/server.test.ts`
Expected: FAIL（`format` 为 undefined / 上传 .md 被拒为「Only .html」）

- [ ] **Step 3: 路由实现 — 引入按格式提取器**

在 `apps/api/src/routes/documents.ts` 顶部 import 处，把 `extractHtmlMetadata` 那行改为：

```ts
import {
  CreateDocumentSchema,
  extractHtmlMetadata,
  extractMarkdownMetadata,
  SetDocumentMemberRoleSchema,
  UpdateDocumentSchema,
  UpdateDocumentShareSchema,
} from '@atlas/shared';
```

并把 `validateHtmlForStorage` 的 import 改为同时引入泛化函数：

```ts
import { validateContentForStorage } from '../lib/html-limits';
```

在 `toDoc` helper 里、`tags` 之后加入 `format`：

```ts
    format: row.doc.format,
```

在文件内（`toDoc` 之后）加入按格式选择提取器的 helper：

```ts
function extractMetadata(
  format: 'html' | 'markdown',
  content: string,
  fallbackTitle: string,
) {
  return format === 'markdown'
    ? extractMarkdownMetadata(content, { fallbackTitle })
    : extractHtmlMetadata(content, { fallbackTitle });
}
```

- [ ] **Step 4: 路由实现 — create（POST /）**

把 `.post('/', ...)` 处理体替换为：

```ts
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    const body = CreateDocumentSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    const checked = validateContentForStorage(body.html);
    const metadata = extractMetadata(body.format, body.html, body.title);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title || metadata.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      format: body.format,
      html: checked.content,
      dot: body.dot,
      tags: body.tags,
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.create',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, title: body.title, format: body.format },
    });
    return c.json({ id, stored: { size: checked.size } }, 201);
  })
```

- [ ] **Step 5: 路由实现 — upload（POST /upload）**

把 `.post('/upload', ...)` 内的文件类型校验与元数据段替换为以下逻辑（其余表单读取保持）：

```ts
    if (!(file instanceof File)) throw badRequest('Upload requires a file field.');
    const isMarkdown =
      /\.(md|markdown)$/i.test(file.name) || /^text\/(x-)?markdown\b/i.test(file.type || '');
    const isHtml = /\.html?$/i.test(file.name) || /^text\/html\b/i.test(file.type || '');
    if (!isMarkdown && !isHtml) {
      throw badRequest('只支持上传 .html 或 .md 文件。');
    }
    const format: 'html' | 'markdown' = isMarkdown ? 'markdown' : 'html';
    const content = await file.text();
    const metadata = extractMetadata(
      format,
      content,
      title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
    );
    const body = CreateDocumentSchema.parse({
      title: title || metadata.title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
      desc: descText,
      spaceId,
      visibility,
      format,
      html: content,
      tags: ['uploaded'],
      dot: 'accent',
    });

    await requireSpaceEditor(user, body.spaceId);
    const checked = validateContentForStorage(body.html);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      format: body.format,
      html: checked.content,
      dot: body.dot,
      tags: body.tags,
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.upload',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, filename: file.name, format },
    });

    return c.json({ id, filename: file.name, stored: { size: checked.size } }, 201);
```

（删除原来局部的 `const html = await file.text();`、原 `extractHtmlMetadata` 调用、原 `validateHtmlForStorage` 调用与第二个 `db.insert`，避免重复插入。）

- [ ] **Step 6: 路由实现 — update（PATCH /:id）**

把 `.patch('/:id', ...)` 内处理 `body.html` 的分支替换为：

```ts
    if (body.html !== undefined) {
      patch.html = validateContentForStorage(body.html).content;
      const format = body.format ?? doc.format;
      if (body.format !== undefined) patch.format = body.format;
      const metadata = extractMetadata(format, body.html, body.title ?? doc.title);
      if (body.title === undefined && metadata.title) patch.title = metadata.title;
      if (body.desc === undefined && metadata.summary) patch.desc = metadata.summary;
    } else if (body.format !== undefined) {
      patch.format = body.format;
    }
```

- [ ] **Step 7: 运行测试确认通过**

Run: `bun test apps/api/src/server.test.ts`
Expected: PASS（含新增 2 个用例与原有 HTML 用例全部通过）

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/documents.ts apps/api/src/server.test.ts
git commit -m "feat(api): format-aware document create/update/upload"
```

---

## Task 6: 种子 — 全语法示例 Markdown 文档

**Files:**
- Modify: `apps/api/src/db/seed-data.ts`
- Modify: `apps/api/src/db/seed.ts`

- [ ] **Step 1: 扩展 FixtureDocument 类型并新增 markdown 文档**

在 `seed-data.ts` 的 `FixtureDocument` 类型里加入两个可选字段：

```ts
  format?: 'html' | 'markdown';
  content?: string;
```

在第一个空间（`s1`）的 `children` 数组末尾追加一篇 markdown 文档（id 取未使用值，如 `'dmd1'`）：

```ts
        {
          id: 'dmd1',
          title: 'Markdown 语法总览',
          desc: '覆盖 GFM、代码高亮、公式、图表、脚注与警告框的演示文档。',
          author: 'u1',
          updated: '2024-06',
          visibility: 'public',
          dot: 'moss',
          tags: ['markdown', 'demo'],
          format: 'markdown',
          content: [
            '# Markdown 语法总览',
            '',
            '普通段落，含 **加粗**、*斜体*、~~删除线~~、`行内代码` 与 [链接](https://example.com)。',
            '',
            '## 列表与任务',
            '- 无序项 A',
            '- 无序项 B',
            '',
            '- [x] 已完成任务',
            '- [ ] 待办任务',
            '',
            '## 表格',
            '| 语法 | 支持 |',
            '| --- | --- |',
            '| 表格 | ✅ |',
            '| 公式 | ✅ |',
            '',
            '## 代码高亮',
            '```ts',
            'const greet = (name: string): string => `hi ${name}`;',
            '```',
            '',
            '## 数学公式',
            '行内 $E = mc^2$，块级：',
            '',
            '$$\\int_0^1 x^2 \\,dx = \\tfrac{1}{3}$$',
            '',
            '## 图表',
            '```mermaid',
            'graph LR; A[开始] --> B{判断}; B -->|是| C[结束];',
            '```',
            '',
            '## 警告框',
            '> [!NOTE]',
            '> 这是一个 GitHub 风格的提示框。',
            '',
            '## 脚注',
            '正文带脚注[^1]。',
            '',
            '[^1]: 这是脚注内容。',
            '',
          ].join('\n'),
        },
```

- [ ] **Step 2: 种子插入支持 format/content**

在 `seed.ts` 的文档插入循环里，把 `format` 与内容来源接上。把 `db.insert(documents).values({ ... })` 改为：

```ts
    await db.insert(documents).values({
      id: doc.id,
      spaceId: sp.id,
      authorId: doc.author,
      title: doc.title,
      desc: doc.desc ?? '',
      visibility: doc.visibility,
      format: doc.format ?? 'html',
      dot: doc.dot as string,
      tags: doc.tags ?? [],
      html: doc.format === 'markdown' ? (doc.content ?? '') : sampleHtml(doc),
      updated: doc.updated,
    });
```

- [ ] **Step 3: 重置并验证种子**

Run: `bun run --filter @atlas/api db:seed`
Expected: 成功，无报错

Run: `bun test apps/api/src/server.test.ts`
Expected: PASS（种子文档不破坏既有断言）

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed-data.ts apps/api/src/db/seed.ts
git commit -m "feat(api): seed a full-syntax markdown demo document"
```

---

## Task 7: Web — 安装 Markdown 依赖

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 安装运行时依赖**

Run:
```bash
cd apps/web && bun add markdown-it highlight.js katex @vscode/markdown-it-katex mermaid dompurify markdown-it-footnote markdown-it-deflist markdown-it-sub markdown-it-sup markdown-it-mark markdown-it-ins markdown-it-task-lists markdown-it-emoji markdown-it-anchor markdown-it-table-of-contents markdown-it-github-alerts
```
Expected: 写入 `apps/web/package.json` 的 dependencies

- [ ] **Step 2: 安装类型依赖（dev）**

Run:
```bash
cd apps/web && bun add -d @types/markdown-it @types/dompurify
```
Expected: 写入 devDependencies

- [ ] **Step 3: Commit**

```bash
cd ../.. && git add apps/web/package.json bun.lock
git commit -m "build(web): add markdown rendering dependencies"
```

---

## Task 8: Web — Markdown 渲染器

**Files:**
- Create: `apps/web/src/markdown/renderer.ts`

- [ ] **Step 1: 实现渲染器（懒加载内部依赖）**

创建 `apps/web/src/markdown/renderer.ts`：

```ts
// Markdown 渲染内核：markdown-it 全家桶 → DOMPurify 净化 → enhance() 跑 mermaid。
// 整模块经动态 import 懒加载，避免拖累主包。

let mdInstance: import('markdown-it').default | null = null;

async function getMarkdownIt() {
  if (mdInstance) return mdInstance;
  const [
    { default: MarkdownIt },
    { default: hljs },
    { default: footnote },
    { default: deflist },
    { default: sub },
    { default: sup },
    { default: mark },
    { default: ins },
    { default: taskLists },
    emojiMod,
    { default: anchor },
    { default: toc },
    { default: katex },
    githubAlerts,
  ] = await Promise.all([
    import('markdown-it'),
    import('highlight.js'),
    import('markdown-it-footnote'),
    import('markdown-it-deflist'),
    import('markdown-it-sub'),
    import('markdown-it-sup'),
    import('markdown-it-mark'),
    import('markdown-it-ins'),
    import('markdown-it-task-lists'),
    import('markdown-it-emoji'),
    import('markdown-it-anchor'),
    import('markdown-it-table-of-contents'),
    import('@vscode/markdown-it-katex'),
    import('markdown-it-github-alerts'),
  ]);

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code: string, lang: string) {
      // Mermaid 代码块留作占位，交给 enhance() 渲染。
      if (lang === 'mermaid') {
        return `<pre class="md-mermaid">${md.utils.escapeHtml(code)}</pre>`;
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${
            hljs.highlight(code, { language: lang }).value
          }</code></pre>`;
        } catch {
          /* fall through */
        }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
    },
  });

  md.use(footnote)
    .use(deflist)
    .use(sub)
    .use(sup)
    .use(mark)
    .use(ins)
    .use(taskLists, { enabled: true, label: true })
    .use(emojiMod.full ?? emojiMod.default ?? emojiMod)
    .use(anchor, { permalink: anchor.permalink?.headerLink?.() })
    .use(toc, { includeLevel: [2, 3] })
    .use(katex.default ?? katex)
    .use(githubAlerts.default ?? githubAlerts);

  mdInstance = md;
  return md;
}

export async function renderMarkdown(src: string): Promise<string> {
  const [md, { default: DOMPurify }] = await Promise.all([
    getMarkdownIt(),
    import('dompurify'),
  ]);
  const rawHtml = md.render(src ?? '');
  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    // 保留 mermaid 占位与 KaTeX/标题锚点所需属性。
    ADD_ATTR: ['class', 'style', 'id', 'aria-hidden', 'target', 'rel'],
  });
}

// 对已插入 DOM 的容器做后处理：把 mermaid 占位渲染成 SVG。
export async function enhance(container: HTMLElement): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('pre.md-mermaid');
  if (blocks.length === 0) return;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
  let i = 0;
  for (const block of blocks) {
    const source = block.textContent ?? '';
    try {
      const { svg } = await mermaid.render(`md-mermaid-${Date.now()}-${i++}`, source);
      const wrap = document.createElement('div');
      wrap.className = 'md-mermaid-rendered';
      wrap.innerHTML = svg;
      block.replaceWith(wrap);
    } catch {
      block.classList.add('md-mermaid-error');
    }
  }
}
```

- [ ] **Step 2: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS（如个别插件无类型，按需在 `loose-types.ts` 旁加 `declare module 'markdown-it-xxx';` 的最小声明文件 `apps/web/src/markdown/shims.d.ts`）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/markdown/renderer.ts apps/web/src/markdown/shims.d.ts 2>/dev/null
git commit -m "feat(web): markdown renderer with katex/mermaid/sanitize"
```

---

## Task 9: Web — 复制（源码 / 带格式）

**Files:**
- Create: `apps/web/src/markdown/copy.ts`

- [ ] **Step 1: 实现复制逻辑**

创建 `apps/web/src/markdown/copy.ts`：

```ts
import { renderMarkdown } from './renderer';

export async function copyMarkdownSource(src: string): Promise<void> {
  await navigator.clipboard.writeText(src ?? '');
}

// 复制带格式：写入 text/html（渲染后净化的 HTML）+ text/plain 兜底。
export async function copyMarkdownRich(src: string): Promise<void> {
  const html = await renderMarkdown(src);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([src ?? ''], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  // 旧浏览器退化：只复制源码。
  await navigator.clipboard.writeText(src ?? '');
}
```

- [ ] **Step 2: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/markdown/copy.ts
git commit -m "feat(web): markdown copy as source or rich html"
```

---

## Task 10: Web — `.md-body` 主题样式

**Files:**
- Create: `apps/web/src/markdown/markdown.css`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: 写样式**

创建 `apps/web/src/markdown/markdown.css`（对齐 Atlas token；保持克制的留白与层级）：

```css
@import 'highlight.js/styles/github.css';
@import 'katex/dist/katex.min.css';

.md-body {
  color: var(--ink-1, #1d1d1f);
  font-size: 15px;
  line-height: 1.72;
  letter-spacing: -0.01em;
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 4px 80px;
  word-wrap: break-word;
}
.md-body h1, .md-body h2, .md-body h3, .md-body h4 {
  font-family: var(--font-display, inherit);
  letter-spacing: -0.022em;
  line-height: 1.25;
  margin: 1.8em 0 0.6em;
}
.md-body h1 { font-size: 26px; margin-top: 0.2em; }
.md-body h2 { font-size: 20px; }
.md-body h3 { font-size: 17px; }
.md-body p { margin: 0 0 1em; }
.md-body a { color: var(--blue, #2f6df6); text-decoration: none; }
.md-body a:hover { text-decoration: underline; }
.md-body ul, .md-body ol { padding-left: 1.4em; margin: 0 0 1em; }
.md-body li { margin: 0.25em 0; }
.md-body li.task-list-item { list-style: none; margin-left: -1.4em; padding-left: 1.4em; }
.md-body li.task-list-item input { margin-right: 0.5em; }
.md-body blockquote {
  margin: 0 0 1em; padding: 0.4em 1em;
  border-left: 3px solid var(--hairline-2, #e5e3df);
  color: var(--ink-3, #555);
}
.md-body code {
  font-family: var(--font-mono, monospace);
  font-size: 0.88em;
  background: var(--pearl, #f1f0ee);
  padding: 0.15em 0.4em; border-radius: 5px;
}
.md-body pre {
  margin: 0 0 1.2em; padding: 14px 16px;
  background: var(--pearl, #f6f5f3);
  border: 1px solid var(--hairline-2, #e5e3df);
  border-radius: 10px; overflow-x: auto;
  font-size: 13px; line-height: 1.6;
}
.md-body pre code { background: none; padding: 0; }
.md-body table {
  border-collapse: collapse; width: 100%; margin: 0 0 1.2em; font-size: 14px;
}
.md-body th, .md-body td {
  border: 1px solid var(--hairline-2, #e5e3df); padding: 7px 12px; text-align: left;
}
.md-body th { background: var(--pearl, #f6f5f3); font-weight: 600; }
.md-body img { max-width: 100%; border-radius: 8px; }
.md-body hr { border: none; border-top: 1px solid var(--hairline-2, #e5e3df); margin: 2em 0; }
.md-body .md-mermaid-rendered { margin: 0 0 1.2em; text-align: center; }
.md-body .md-mermaid-error { color: #c0392b; }
/* GitHub alerts */
.md-body .markdown-alert {
  border-left: 4px solid var(--blue, #2f6df6);
  background: var(--pearl, #f6f5f3);
  padding: 10px 16px; border-radius: 8px; margin: 0 0 1.2em;
}
.md-body .markdown-alert-title { font-weight: 600; margin-bottom: 4px; }
/* 脚注 */
.md-body .footnotes { font-size: 13px; color: var(--ink-3, #555); border-top: 1px solid var(--hairline-2,#e5e3df); margin-top: 2.4em; padding-top: 1em; }
```

- [ ] **Step 2: 在入口引入样式**

在 `apps/web/src/main.tsx` 顶部（与现有 `styles.css` import 旁）加入：

```ts
import './markdown/markdown.css';
```

- [ ] **Step 3: 校验构建可解析**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/markdown/markdown.css apps/web/src/main.tsx
git commit -m "feat(web): atlas-themed markdown body styles"
```

---

## Task 11: Web — MarkdownReader 组件

**Files:**
- Create: `apps/web/src/views/markdown-reader.tsx`

- [ ] **Step 1: 实现组件**

创建 `apps/web/src/views/markdown-reader.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react';
import { enhance, renderMarkdown } from '../markdown/renderer';
import type { Loose } from '../loose-types';

export function MarkdownReader({ content, onScroll }: Loose) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    renderMarkdown(content || '')
      .then((out) => {
        if (alive) {
          setHtml(out);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [content]);

  useEffect(() => {
    if (!loading && ref.current) enhance(ref.current);
  }, [loading, html]);

  if (loading) return <div className="app-state-banner">正在渲染 Markdown…</div>;
  return (
    <div className="md-scroll" onScroll={onScroll} style={{ height: '100%', overflow: 'auto' }}>
      {/* 内容已在 renderer 中经 DOMPurify 净化 */}
      <div className="md-body" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

- [ ] **Step 2: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/markdown-reader.tsx
git commit -m "feat(web): markdown reader component"
```

---

## Task 12: Web — Markdown 分栏编辑器

**Files:**
- Create: `apps/web/src/views/markdown-editor-dialog.tsx`

- [ ] **Step 1: 实现编辑器组件**

创建 `apps/web/src/views/markdown-editor-dialog.tsx`（复用现有 `HTMLEditorDialog` 的弹窗骨架与空间选择器交互；分栏 + 同步滚动 + 复制按钮）：

```tsx
import { extractMarkdownMetadata } from '@atlas/shared';
import { useEffect, useRef, useState } from 'react';
import { I } from '../chrome';
import { useDocument } from '../data-hooks';
import { copyMarkdownRich, copyMarkdownSource } from '../markdown/copy';
import { enhance, renderMarkdown } from '../markdown/renderer';
import type { Loose } from '../loose-types';
import { accentDot, dotClass } from './shared';

const _I = I;

export function MarkdownEditorDialog({ doc, spaces = [], onClose, onSave }: Loose) {
  const detailQuery = useDocument(doc.isNew ? null : doc.id, !doc.isNew);
  if (!doc.isNew && detailQuery.isLoading) {
    return (
      <div className="overlay editor-overlay">
        <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
          <div className="app-state-banner">正在加载文章正文…</div>
        </div>
      </div>
    );
  }
  if (!doc.isNew && (detailQuery.isError || !detailQuery.data)) {
    return (
      <div
        className="overlay editor-overlay"
        onMouseDown={(e: Loose) => {
          if (e.target.classList.contains('editor-overlay')) onClose();
        }}
      >
        <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
          <div className="app-state-banner">无法加载正文，可能没有编辑权限或文章已被删除。</div>
          <div style={{ padding: 16 }}>
            <button className="btn secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }
  const fullDoc = doc.isNew ? doc : { ...doc, ...detailQuery.data };
  return <MarkdownEditorBody doc={fullDoc} spaces={spaces} onClose={onClose} onSave={onSave} />;
}

function MarkdownEditorBody({ doc, spaces = [], onClose, onSave }: Loose) {
  const [md, setMd] = useState(doc.isNew ? '' : doc.html || '');
  const [title, setTitle] = useState(doc.title || '');
  const [desc, setDesc] = useState(doc.desc || '');
  const [titleTouched, setTitleTouched] = useState(Boolean(doc.title));
  const [spaceId, setSpaceId] = useState(doc.spaceId || (doc.isNew ? '' : 's1'));
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showSpaceRequired, setShowSpaceRequired] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState('');
  const [stacked, setStacked] = useState('split'); // 'split' | 'source' | 'preview' (窄屏)
  const [copied, setCopied] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const spaceWrapRef = useRef<Loose>(null);
  const selectedSpace = spaces.find((s: Loose) => s.id === spaceId);

  // 防抖渲染预览
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      renderMarkdown(md).then((out) => {
        if (alive) setPreview(out);
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [md]);

  useEffect(() => {
    if (previewRef.current) enhance(previewRef.current);
  }, [preview]);

  // 元数据：未手动改过标题时跟随首个标题
  useEffect(() => {
    const meta = extractMarkdownMetadata(md, { fallbackTitle: title || doc.title });
    if (!titleTouched && meta.title) setTitle(meta.title);
    if (!desc && meta.summary) setDesc(meta.summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [md]);

  useEffect(() => {
    if (!showSpacePicker) return;
    const onDoc = (e: Loose) => {
      if (!spaceWrapRef.current?.contains(e.target)) setShowSpacePicker(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showSpacePicker]);

  const syncScroll = () => {
    const ta = taRef.current;
    const pv = previewRef.current?.parentElement; // .md-preview wrapper
    if (!ta || !pv) return;
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight);
  };

  const save = () => {
    if (!spaceId) {
      setShowSpaceRequired(true);
      setShowSpacePicker(true);
      return;
    }
    const meta = extractMarkdownMetadata(md, { fallbackTitle: title || doc.title });
    const patch: Loose = { format: 'markdown' };
    const finalTitle = title.trim() || meta.title || doc.title || '未命名文章';
    const finalDesc = desc.trim() || meta.summary || doc.desc || '';
    if (finalTitle !== doc.title) patch.title = finalTitle;
    if (finalDesc !== (doc.desc || '')) patch.desc = finalDesc;
    if (spaceId !== doc.spaceId && selectedSpace) {
      patch.spaceId = selectedSpace.id;
      patch.spaceName = selectedSpace.name;
      patch.spaceAccent = selectedSpace.accent;
    }
    onSave(md, patch);
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: Loose) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const doCopy = async (mode: 'source' | 'rich') => {
    try {
      if (mode === 'source') await copyMarkdownSource(md);
      else await copyMarkdownRich(md);
      setCopied(mode);
      setTimeout(() => setCopied(''), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="overlay editor-overlay"
      onMouseDown={(e: Loose) => {
        if (e.target.classList.contains('editor-overlay')) onClose();
      }}
    >
      <div className="editor-dialog" onMouseDown={(e: Loose) => e.stopPropagation()}>
        <div className="editor-head">
          <div className="editor-title-wrap">
            <span className={`dot ${dotClass(doc.dot)}`} style={{ width: 8, height: 8 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="editor-title-row">
                <span className="editor-title-prefix">
                  {doc.isNew ? '新建 Markdown ·' : '编辑 Markdown ·'}
                </span>
                <input
                  className="editor-title-input"
                  value={title}
                  onChange={(e: Loose) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                    setDirty(true);
                  }}
                  placeholder="未命名文章"
                  spellCheck={false}
                />
              </div>
              <div className="editor-sub mono">
                {selectedSpace ? selectedSpace.name : '未选择空间'}/{doc.id}.md{' '}
                {dirty && <span style={{ color: 'var(--blue)' }}>· 未保存</span>}
              </div>
              <div
                ref={spaceWrapRef}
                className={`editor-space-field ${showSpaceRequired && !spaceId ? 'required-empty' : ''}`}
                style={{ marginTop: 8, position: 'relative', maxWidth: 320 }}
              >
                <span className="label">空间</span>
                <button
                  className="editor-space-trigger"
                  onClick={(e: Loose) => {
                    e.stopPropagation();
                    setShowSpacePicker((o: Loose) => !o);
                    setShowSpaceRequired(false);
                  }}
                >
                  {selectedSpace ? (
                    <>
                      <span className={`dot ${accentDot(selectedSpace.accent)}`} />
                      <span>{selectedSpace.name}</span>
                    </>
                  ) : (
                    <span style={{ color: 'var(--blue)' }}>选择空间…</span>
                  )}
                </button>
                {showSpacePicker && (
                  <div className="space-picker-pop" style={{ top: 'calc(100% + 4px)', left: 0 }}>
                    {spaces.map((s: Loose) => (
                      <div
                        key={s.id}
                        className={`space-picker-row ${s.id === spaceId ? 'active' : ''}`}
                        onClick={() => {
                          setSpaceId(s.id);
                          setDirty(true);
                          setShowSpacePicker(false);
                          setShowSpaceRequired(false);
                        }}
                      >
                        <span className={`dot ${accentDot(s.accent)}`} />
                        <span>{s.name}</span>
                        {s.id === spaceId && (
                          <span className="check">
                            <_I.check />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="editor-tabs">
            <button className="pill-btn ghost" onClick={() => doCopy('source')}>
              {copied === 'source' ? <_I.check /> : <_I.copy />}
              <span>{copied === 'source' ? '已复制' : '复制源码'}</span>
            </button>
            <button className="pill-btn ghost" onClick={() => doCopy('rich')}>
              {copied === 'rich' ? <_I.check /> : <_I.copy />}
              <span>{copied === 'rich' ? '已复制' : '带格式'}</span>
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <_I.close />
          </button>
        </div>

        <div className={`editor-body md-split md-split-${stacked}`}>
          <div className="md-split-source">
            <textarea
              ref={taRef}
              className="editor-source"
              value={md}
              onChange={(e: Loose) => {
                setMd(e.target.value);
                setDirty(true);
              }}
              onScroll={syncScroll}
              placeholder={doc.isNew ? '在此撰写 Markdown…' : ''}
              spellCheck={false}
            />
          </div>
          <div className="md-split-preview md-preview">
            <div className="md-body" ref={previewRef} dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>

        <div className="editor-foot">
          <div className="editor-foot-meta mono">
            <span>{md.length.toLocaleString()} 字符</span>
            <span className="sep">·</span>
            <span>{md.split('\n').length} 行</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button
              className="btn secondary md-narrow-only"
              onClick={() => setStacked(stacked === 'source' ? 'preview' : 'source')}
            >
              {stacked === 'source' ? '预览' : '编辑'}
            </button>
            <button className="btn primary" onClick={save}>
              <_I.check />
              <span>{doc.isNew ? '创建' : '保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 确认图标存在**

Run: `grep -n "copy" apps/web/src/chrome.tsx`
Expected: 找到 `copy` 图标导出；若不存在，在 `chrome.tsx` 的图标集合 `I` 中加一个 `copy` 图标（复制现有任一图标结构，换成两叠方块的 SVG 路径）。

- [ ] **Step 3: 加分栏样式**

在 `apps/web/src/styles.css` 末尾追加：

```css
.md-split { display: flex; gap: 0; height: 100%; min-height: 0; }
.md-split-source, .md-split-preview { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
.md-split-source { border-right: 1px solid var(--hairline-2, #e5e3df); }
.md-split-source .editor-source { height: 100%; width: 100%; border: 0; resize: none; }
.md-split-preview { padding: 18px 22px; background: var(--canvas, #fff); }
.md-narrow-only { display: none; }
@media (max-width: 880px) {
  .md-split { flex-direction: column; }
  .md-split-source, .md-split-preview { border-right: 0; }
  .md-split-split .md-split-source { display: block; }
  .md-split-source-only .md-split-preview, .md-split-source .md-split-preview { }
  .md-split-source.md-split-source .md-split-preview { display: none; }
  .md-narrow-only { display: inline-flex; }
  .md-split-preview.md-split-preview { }
}
```

简化原则：窄屏下由 `md-split-${stacked}` 控制只显示 source 或 preview，宽屏 `split` 同时显示。允许执行者按实际渲染微调媒体查询里的显隐规则（目标：≤880px 二选一显示并出现「编辑/预览」按钮）。

- [ ] **Step 4: 校验类型与样式**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/markdown-editor-dialog.tsx apps/web/src/styles.css apps/web/src/chrome.tsx
git commit -m "feat(web): live split-pane markdown editor with copy"
```

---

## Task 13: Web — 阅读页分支 + 编辑/复制按钮

**Files:**
- Modify: `apps/web/src/views/reader-view.tsx`

- [ ] **Step 1: 引入依赖与状态**

在 `reader-view.tsx` 顶部 import 区加入：

```tsx
import { MarkdownReader } from './markdown-reader';
import { MarkdownEditorDialog } from './markdown-editor-dialog';
import { copyMarkdownRich, copyMarkdownSource } from '../markdown/copy';
import { useUpdateDocument } from '../data-hooks';
```

（若 `data-hooks` 暴露的是聚合 `mutations`，则改为从 props 接收 `mutations`；本仓库 `ReaderView` 已是 `Loose` props，可由 `app.tsx` 传入 `mutations`。执行者按实际接线方式取 `updateDocument`。）

在 `ReaderView` 组件体内（`copied` state 旁）加入：

```tsx
  const [editing, setEditing] = useState(false);
  const [copiedMode, setCopiedMode] = useState('');
  const isMarkdown = detailDoc?.format === 'markdown';
  const doCopy = async (mode: 'source' | 'rich') => {
    try {
      const src = detailDoc?.html || '';
      if (mode === 'source') await copyMarkdownSource(src);
      else await copyMarkdownRich(src);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(''), 1400);
    } catch {}
  };
```

- [ ] **Step 2: meta 栏加按钮（仅 markdown）**

在主返回块的 meta 栏内、`allowed` 分享按钮附近加入：

```tsx
            {allowed && isMarkdown && (
              <>
                <button className="pill-btn ghost" onClick={() => doCopy('source')}>
                  {copiedMode === 'source' ? <_I.check /> : <_I.copy />}
                  <span>{copiedMode === 'source' ? '已复制' : '复制源码'}</span>
                </button>
                <button className="pill-btn ghost" onClick={() => doCopy('rich')}>
                  {copiedMode === 'rich' ? <_I.check /> : <_I.copy />}
                  <span>{copiedMode === 'rich' ? '已复制' : '带格式'}</span>
                </button>
                {detailDoc?.canEdit && (
                  <button className="pill-btn" onClick={() => setEditing(true)}>
                    <_I.edit />
                    <span>编辑</span>
                  </button>
                )}
              </>
            )}
```

（若 `_I.edit` 不存在，在 `chrome.tsx` 加一个铅笔图标 `edit`。）

- [ ] **Step 3: 正文按格式渲染**

把 `allowed` 分支里的 `<iframe ... srcDoc={detailDoc.html ...} />` 替换为：

```tsx
            isMarkdown ? (
              <MarkdownReader content={detailDoc.html || ''} onScroll={onChromeScroll} />
            ) : (
              <iframe
                ref={iframeRef}
                className="reader-iframe"
                srcDoc={detailDoc.html || '<!doctype html><html><body><p>暂无内容</p></body></html>'}
                title={detailDoc.title}
                sandbox="allow-scripts allow-forms allow-popups"
                onLoad={bindIframeScroll}
              />
            )
```

- [ ] **Step 4: 渲染编辑器覆盖层**

在 `ReaderView` 返回的最外层 `</div>` 之前加入：

```tsx
      {editing && (
        <MarkdownEditorDialog
          doc={detailDoc}
          spaces={spaces}
          onClose={() => setEditing(false)}
          onSave={(content: Loose, patch: Loose) => {
            const { spaceName, spaceAccent, ...rest } = patch || {};
            mutations.updateDocument(detailDoc.id, { ...rest, html: content });
            setEditing(false);
          }}
        />
      )}
```

（确保 `app.tsx` 把 `mutations` 传给 `ReaderView`；若未传，按 Step 1 注释接线。）

- [ ] **Step 5: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/reader-view.tsx apps/web/src/chrome.tsx apps/web/src/app.tsx
git commit -m "feat(web): markdown reader rendering with edit/copy actions"
```

---

## Task 14: Web — 公开分享页分支

**Files:**
- Modify: `apps/web/src/views/public-document-view.tsx`

- [ ] **Step 1: 按 format 分支渲染**

在 `public-document-view.tsx` 顶部 import 加入：

```tsx
import { MarkdownReader } from './markdown-reader';
```

把 `<iframe ... srcDoc={doc.html ...} />` 替换为：

```tsx
        {doc.format === 'markdown' ? (
          <MarkdownReader content={doc.html || ''} onScroll={onChromeScroll} />
        ) : (
          <iframe
            ref={iframeRef}
            className="reader-iframe"
            srcDoc={doc.html || '<!doctype html><html><body><p>暂无内容</p></body></html>'}
            title={doc.title}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        )}
```

- [ ] **Step 2: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/public-document-view.tsx
git commit -m "feat(web): render shared markdown documents"
```

---

## Task 15: Web — 上传支持 .md

**Files:**
- Modify: `apps/web/src/views-admin/upload-view.tsx`

- [ ] **Step 1: 接受 .md 并按扩展名判定格式**

- import 改为同时引入两个提取器与 MarkdownReader：

```tsx
import { extractHtmlMetadata, extractMarkdownMetadata } from '@atlas/shared';
import { MarkdownReader } from '../views/markdown-reader';
```

- `acceptFiles` 里识别格式（替换原 `find` 逻辑）：

```tsx
  const acceptFiles = useCallback((incoming: Loose) => {
    const file =
      Array.from(incoming || []).find((f: Loose) => /\.(html?|md|markdown)$/i.test(f.name)) ||
      incoming?.[0];
    if (!file) return;
    const isMd = /\.(md|markdown)$/i.test(file.name);
    setSelectedFile(file);
    setSelectedFormat(isMd ? 'markdown' : 'html');
    file.text().then((text: Loose) => {
      const meta = isMd
        ? extractMarkdownMetadata(text, { fallbackTitle: file.name })
        : extractHtmlMetadata(text, { fallbackTitle: file.name });
      setSelectedHtml(text);
      setMeta((m: Loose) => ({
        ...m,
        title: meta.title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
        desc: meta.summary || '',
      }));
    });
    // ...（进度条动画逻辑保持不变）
  }, []);
```

并加状态：`const [selectedFormat, setSelectedFormat] = useState('html');`

- `<input accept>` 与拖拽文案更新为：`accept=".html,.htm,.md,.markdown,text/html,text/markdown"`；标题文案改「上传文档（HTML / Markdown）」、副本 hint 改「支持 .html 或 .md 文件」。

- [ ] **Step 2: 审阅步骤的预览按格式渲染**

把 step 2 里的 `<iframe className="upload-html-preview" srcDoc={selectedHtml ...} />` 替换为：

```tsx
                    {selectedFormat === 'markdown' ? (
                      <div style={{ maxHeight: 360, overflow: 'auto' }}>
                        <MarkdownReader content={selectedHtml} />
                      </div>
                    ) : (
                      <iframe
                        className="upload-html-preview"
                        srcDoc={selectedHtml || '<!doctype html><html><body></body></html>'}
                        title="HTML 预览"
                        sandbox="allow-scripts allow-forms allow-popups"
                      />
                    )}
```

- [ ] **Step 3: 提交时透传 format**

在发布按钮的 `formData` 构造里加一行（后端按文件扩展名也会判定，这里冗余无害；保持显式）：

```tsx
                        formData.set('format', selectedFormat);
```

- [ ] **Step 4: 校验类型**

Run: `bun run --filter @atlas/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views-admin/upload-view.tsx
git commit -m "feat(web): accept markdown uploads with themed preview"
```

---

## Task 16: Web — 后台新建分流与编辑路由

**Files:**
- Modify: `apps/web/src/views/admin-docs-view.tsx`

- [ ] **Step 1: 引入 Markdown 编辑器与新建菜单状态**

import 加入：

```tsx
import { MarkdownEditorDialog } from './markdown-editor-dialog';
```

在组件内加状态：`const [showNewMenu, setShowNewMenu] = useState(false);`

- [ ] **Step 2: 「新建」改为格式选择**

把现有「新建文章」按钮替换为带下拉的两个选项（HTML / Markdown）。新建 Markdown 时设置 `format: 'markdown'`，复用现有 `setEditing({...})`，新增 `format` 字段：

```tsx
  const startNew = (format: 'html' | 'markdown') => {
    const defaultSpace = editableSpaces[0] || spaceOptions[0];
    setEditing({
      id: 'new',
      title: '',
      desc: '',
      author: 'u1',
      updated: '刚刚',
      visibility: 'private',
      dot: 'slate',
      tags: ['draft'],
      spaceId: defaultSpace?.id || 's1',
      spaceName: defaultSpace?.name || '工程',
      spaceAccent: defaultSpace?.accent || 'accent',
      html: '',
      format,
      isNew: true,
    });
    setShowNewMenu(false);
  };
```

把按钮区（`canCreate` 内）改为：

```tsx
              <div style={{ position: 'relative' }}>
                <button className="btn primary" onClick={() => setShowNewMenu((o) => !o)}>
                  <_I.plus width="13" height="13" />
                  <span>新建文章</span>
                </button>
                {showNewMenu && (
                  <div className="space-picker-pop" style={{ top: 'calc(100% + 4px)', right: 0 }}>
                    <div className="space-picker-row" onClick={() => startNew('markdown')}>
                      <span>新建 Markdown</span>
                    </div>
                    <div className="space-picker-row" onClick={() => startNew('html')}>
                      <span>新建 HTML</span>
                    </div>
                  </div>
                )}
              </div>
```

（保留现有 `onNavigate({ view: 'admin-upload' })` 的上传按钮。删除旧的 `startNewDoc`/直接新建调用，统一走 `startNew`。）

- [ ] **Step 3: saveDoc 透传 format**

把 `saveDoc` 里的 `createDocument` 调用补上 `format`，并用对应提取器：

```tsx
  const saveDoc = (content: Loose, patch: Loose = {}) => {
    if (!editing) return;
    const format = patch.format || editing.format || 'html';
    const metadata =
      format === 'markdown'
        ? extractMarkdownMetadata(content, { fallbackTitle: patch.title || editing.title })
        : extractHtmlMetadata(content, { fallbackTitle: patch.title || editing.title });
    const nextTitle = patch.title || metadata.title || editing.title || '未命名文章';
    const nextDesc = patch.desc || metadata.summary || editing.desc || '';
    if (editing.isNew) {
      mutations.createDocument({
        spaceId: patch.spaceId || editing.spaceId,
        title: nextTitle,
        desc: nextDesc,
        visibility: patch.visibility || editing.visibility || 'private',
        format,
        html: content,
        tags: editing.tags || ['draft'],
        dot: editing.dot || 'slate',
      });
    } else {
      const { spaceName, spaceAccent, ...rest } = patch;
      mutations.updateDocument(editing.id, {
        desc: nextDesc,
        ...rest,
        title: nextTitle,
        html: content,
      });
    }
    setEditing(null);
  };
```

并在 import 补 `extractMarkdownMetadata`（与现有 `extractHtmlMetadata` 同行）。

- [ ] **Step 4: 按 format 选择编辑器组件**

把底部 `<HTMLEditorDialog ... />` 渲染改为按格式分流：

```tsx
        {editing &&
          (editing.format === 'markdown' ? (
            <MarkdownEditorDialog
              doc={editing}
              spaces={spaceOptions}
              onClose={() => setEditing(null)}
              onSave={(content: Loose, patch: Loose) => saveDoc(content, patch)}
            />
          ) : (
            <HTMLEditorDialog
              doc={editing}
              spaces={spaceOptions}
              onClose={() => setEditing(null)}
              onSave={(html: Loose, patch: Loose) => saveDoc(html, patch)}
            />
          ))}
```

（保留原 `HTMLEditorDialog` 的其余 props 接线；`spaces` 用原来的同一变量。点击已有文章行的「编辑内容」无需改动，因为 `editing` 会带上该 doc 的 `format`。）

- [ ] **Step 5: 校验类型与 lint**

Run: `bun run --filter @atlas/web typecheck && bun run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/admin-docs-view.tsx
git commit -m "feat(web): route new/edit by document format"
```

---

## Task 17: 全量验证与手动核对

**Files:** 无（验证任务）

- [ ] **Step 1: 全量类型 / lint / 测试**

Run: `bun run typecheck && bun run lint && bun test apps/api/src`
Expected: 全部 PASS

- [ ] **Step 2: 启动并手动核对**

Run: `bun run --filter @atlas/api db:seed && bun dev`
然后用 `lin@atlas.team` / `atlas-demo-password` 登录，逐项核对：
- 打开种子里的「Markdown 语法总览」：标题、列表、任务列表、表格、代码高亮、KaTeX 行内/块级、Mermaid 图、警告框、脚注均正确渲染，文字可选中。
- 阅读页「复制源码」「带格式」：分别粘贴到纯文本与富文本（如飞书/Word）确认效果。
- 阅读页「编辑」按钮（有写权限）打开分栏编辑器，改内容保存后刷新生效。
- 后台「新建 Markdown」走分栏编辑器创建；「新建 HTML」仍走旧编辑器。
- 上传一个 `.md` 文件，审阅步骤是主题化预览，发布后阅读正常；上传 `.html` 行为不回归。
- 窄屏（拖窄窗口 ≤880px）编辑器回退为切页，「编辑/预览」按钮出现。

- [ ] **Step 3: 最终提交（如有微调）**

```bash
git add -A
git commit -m "chore: markdown support manual verification fixes"
```

---

## Self-Review 备注（写计划时已核对）

- **Spec 覆盖**：format 列(Task3)、shared schema/metadata(Task1-2)、内容校验(Task4)、路由(Task5)、种子(Task6)、渲染器(Task8)、复制(Task9)、样式(Task10)、阅读组件(Task11)、编辑器(Task12)、阅读页(Task13)、公开页(Task14)、上传(Task15)、入口(Task16) — 全部对应。
- **类型一致性**：`renderMarkdown`/`enhance`/`copyMarkdownSource`/`copyMarkdownRich`/`extractMarkdownMetadata`/`validateContentForStorage` 在定义与使用处签名一致；`format` 字段贯穿 schema→route→seed→前端。
- **已知执行者需判断点**（计划中已标注）：个别 markdown-it 插件可能缺类型 → 加 `shims.d.ts`；`ReaderView` 取 `mutations`/`updateDocument` 的接线方式按 app.tsx 实际；窄屏媒体查询显隐可按渲染微调；`_I.copy`/`_I.edit` 图标若缺则在 chrome.tsx 补。
