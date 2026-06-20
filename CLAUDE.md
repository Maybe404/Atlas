# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库工作时提供指引。

## 技术栈与工具链

Atlas 是一个「空间 / 权限管理」的文档协作后台：前端 React 19 + Vite 6，后端 Hono + Drizzle + `bun:sqlite`。**Bun 1.3.14 同时是运行时、包管理器和测试运行器**——不依赖 Node / npm / Docker。Bun workspaces 串联 `apps/*` 和 `packages/*`，`@atlas/shared` 通过 `workspace:*` 被两端共享。不支持 Windows（`bun:sqlite` 需要 WSL2）。

所有文章内容都存在 SQLite 里，生产环境**备份数据库文件即可**。

## 常用命令

```bash
bun install                                  # 安装依赖（自动串联 workspaces）
bun run --filter @atlas/api db:migrate       # 应用已提交的迁移
bun run --filter @atlas/api db:seed          # 重置库 + 载入 demo 演示数据
bun run --filter @atlas/api db:create-admin  # 用环境变量创建/重置首个管理员（生产用）
bun dev                                       # 先迁移，再同时跑 web + api
bun dev:web / bun dev:api                      # 只跑一端（api 启动前会先迁移）
bun run build / bun run typecheck              # 全 workspace 构建 / 类型检查
bun run lint / bun run fmt                      # Biome 检查 / 格式化
bun test apps/api/src                          # 跑 API 测试
bun test apps/api/src/server.test.ts           # 跑单个测试文件
```

改完 `apps/api/src/db/schema.ts` 后：`db:generate` → `db:migrate` → `db:seed`，再重跑 `bun test apps/api/src`。

开发时 Web 跑在 `:5173`，API 跑在 `:3000`。Vite 把 `/api/*` 代理到 `:3000`，所以**前端所有请求都带 `/api` 前缀**。Demo 登录（seed 之后）：任意 seed 邮箱（如管理员 `lin@atlas.team`，其余成员 `chen@atlas.team` 等）+ 密码 `atlas-demo-password`。

## 架构

### 权限模型（核心，在 `apps/api/src/lib/permissions.ts` 内强制，不在路由里）

经过多轮重构，当前模型由三块组成：

1. **全局角色**只有 `admin` / `member` 两种（`members.role`）。`admin` 拥有一切；`member` 的额外能力来自其所属分组。
2. **能力（capabilities）挂在分组（groups）上**，而不是个人。能力枚举：`createSpace` / `manageMembers` / `manageGroups` / `publish`（见 `packages/shared` 的 `CapabilitySchema`）。成员通过 `group_members` 加入分组，从而继承该组的能力与授权。用 `getMemberCapabilities` + `requireCapability` 做能力校验。
3. **授权（grants）是唯一的访问关系表**（`grants` 表）。每条 grant 是一条边：`subject`（`group` | `member`）→ `target`（`space` | `folder` | `document`），`role` 为 `viewer` | `editor`。空间成员、文件夹访问、单文档授权全部统一在这一张表里——**旧的 `space_members` / `document_members` 表已删除**（迁移 0010–0012 的 Phase 4–6 重构）。所有授权读写都走 `apps/api/src/lib/grants.ts`，不要直接操作表。

**文档访问 = 站内可达性 + 对外公开，两者正交：**

- 站内：`documents.access` 为 `inherit`（沿文件夹 / 空间链继承访问）或 `restricted`（仅作者 + admin + 显式 grant）。**没有 `public` / `invite` / `private` 这些旧值了**——`visibility` 字段已被移除。
- 对外：通过**分享链接**（`share_links` 表）公开，需要 `publish` 能力。一篇文档可生成带 token 的链接，可启用/吊销、设过期、控制是否显示作者、是否允许搜索引擎索引，并记录访问次数。匿名访问走 `publicDocumentByToken`。

读写校验请用现成的 `require*` 助手（`requireSpaceAccess` / `requireSpaceEditor` / `requireFolderEditor` / `requireDocumentRead` / `requireDocumentEditor` / `requireDocumentShareManager`）和列表助手（`listReadableSpaces` / `listReadableDocuments` / `listDirectoryDocuments`），不要自己重新推导访问逻辑。一次请求内可用 `loadPermissionLookup` 预载该用户的授权视图，避免重复查询。软删除文档（`deletedAt`）在除 admin 回收站外的所有地方都被排除。

### 空间与文件夹

- **个人空间**：每个成员自动 provision 一个私有空间（`lib/personal-space.ts`），`spaces.ownerId` 标识归属。
- **文件夹**支持嵌套（`folders.parentId`），文档通过 `documents.folderId` 归入文件夹，构成目录树。文件夹可移动、可软删除到回收站（`deletedAt` / `purgeAfter` / `trashedUnderFolderId`）。路由见 `routes/folders.ts`。

### 文档内容

- 文档有 `format` 字段：`html` 或 `markdown`。
- Markdown 在前端 `apps/web/src/markdown/` 渲染，支持 **mermaid 图表**、**KaTeX 公式**、代码高亮（highlight.js），并用 DOMPurify 清洗。元数据提取见 `packages/shared/src/markdown-metadata.ts`。
- 上传的 HTML 在**沙箱 iframe** 中渲染；`packages/shared/src/html-metadata.ts` 从中提取标题 / 摘要。

### 请求流程（`apps/api/src/server.ts`）

全局中间件顺序：`logger → cors → authMiddleware → csrfMiddleware`，随后挂载路由：`/auth`、`/spaces`、`/documents`、`/folders`、`/members`、`/groups`。错误集中在 `app.onError` 处理——抛 `HttpError`（用 `lib/http-error.ts` 的 `forbidden()` / `notFound()` / `unauthorized()`）或让 `ZodError` 冒泡，两者都映射为 JSON `{ code, message }`。**不要在路由里手写错误响应。**

### Auth / CSRF（`apps/api/src/lib/auth.ts`）

会话用 `atlas_session` cookie（HttpOnly、SameSite=Lax、30 天）或 `Bearer` token。非 GET 请求需带 `X-Atlas-CSRF` 头，匹配会话的 CSRF token（`/auth/login` 例外）；前端 `api-client.ts` 从 `atlas_csrf` cookie 自动注入。未认证请求以访客身份继续（只能看公开文档）——路由用 `requireUser(c.get('user'))` 把关。生产下 cookie 自动加 `Secure`。

### 共享契约（`packages/shared/src/index.ts`）

Zod schema + 推导出的领域类型是两端唯一的真相来源（`Role` / `Capability` / `Access` / `Format` / `Group` / `Folder` / `Document` / 各种 `Create*` `Update*` 等）。Seed 演示数据在 `apps/api/src/db/seed-data.ts`。

### 前端（`apps/web/src/`）

- 服务端状态全部走 React Query（`data-hooks.ts`）；`api-client.ts` 是唯一的 fetch 层（把 `bun:sqlite` 类型挡在浏览器构建之外）。
- 视图分目录组织：阅读 / 编辑类在 `views/`（如 `reader-view`、`markdown-editor-dialog`、`html-editor-dialog`、`public-document-view`、`space-index-view`），后台管理在 `views-admin/`（`general` / `members` / `groups` / `permissions` / `spaces` / `trash` 等 pane）。
- 阅读进度（最后阅读位置 + 滚动恢复）见 `reader-progress.ts`；主题 token、外观微调分别在 `theme-tokens.ts`、`tweaks-panel.tsx`。
- URL 路由用 react-router。`.tsx` 受 typecheck 和 Biome 覆盖；原型期的宽松类型集中在 `loose-types.ts`。

## 生产部署

- 配置全部从环境变量读取（见 `.env.example` 与 `lib/env.ts`），代码里不硬编码任何敏感值。
- `NODE_ENV=production`（或 `BUN_ENV` / `ATLAS_ENV`）会：启用 Secure cookie、**单端口同时托管 SPA + API**（`server.ts` 的 static serving，浏览器调 `/api/*` 由同进程剥前缀转给 API）、阻止 demo seed、并选用 `data/prod` 数据目录。
- 数据库路径解析（`lib/db-path.ts`）：`DATABASE_URL`（最高优先级，钉死具体文件）> `ATLAS_DATA_DIR/<prod|dev>/atlas.sqlite` > 默认 `apps/api/data/<prod|dev>/atlas.sqlite`。路径相对 API 包目录解析，所以从仓库根或 `apps/api` 跑脚本行为一致。
- 首个管理员用 `db:create-admin` 创建，密码来自 `ATLAS_ADMIN_PASSWORD`（必填，≥8 位）。
- 其它常用环境变量：`PORT`、`ATLAS_CORS_ORIGIN`（单端口下保持不设）、`ATLAS_TRUST_PROXY`（反代后置 1，让登录限流按真实 IP）、登录限流 `ATLAS_LOGIN_RATE_LIMIT_*`、`ATLAS_CSP`（CSP 覆盖）。`ATLAS_ALLOW_SEED=true` 才允许在生产跑 seed（**会清空全部数据，慎用**）。

## 约定

- Biome：单引号、加分号、2 空格缩进、行宽 100。`biome.json` 排除生成 / 构建目录、`*.html`、`apps/web/src/styles.css`、迁移 meta。
- TS 严格模式开 `noUncheckedIndexedAccess`；使用 `.ts` 扩展名导入（`allowImportingTsExtensions`）和 `verbatimModuleSyntax`（类型一律用 `import type`）。
- 测试用独立的 `test-atlas.sqlite`（可用 `DATABASE_URL` 覆盖）。
