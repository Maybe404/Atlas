# Atlas

空间管理与权限的管理后台。前端 React 19 + Vite 6 + TypeScript；后端 Hono + Drizzle + SQLite（`bun:sqlite`）；运行时与包管理统一用 **Bun 1.3.14**；Bun workspaces 把 `apps/*` 和 `packages/*` 串起来。

## 完成度

当前是「**可本地使用的全栈 MVP**」状态，核心读写链路已经接到真实 SQLite 数据库：

- ✅ 前端 UI 已接真实 API：React Query 拉取空间、文档、成员、权限、回收站、Skill 版本与分享状态，CRUD 通过 mutation 同步到 SQLite。
- ✅ URL 路由已落地：Reader、管理、上传、设置、公开链接都有可刷新地址。
- ✅ Hono + Drizzle + SQLite 迁移已生成并验证，`db:migrate` / `db:seed` 可直接初始化。
- ✅ 登录与 session 已有可用实现：密码登录、30 天 cookie session、双提交 CSRF token；未登录时按游客处理，只返回公开文章。
- ✅ 空间与文档权限真实执行：空间/文档查询按当前用户过滤，写操作要求 editor/admin 权限；文档可额外按成员分享 viewer/editor。
- ✅ HTML 上传已接后端：`multipart/form-data` 上传、8 MB 大小限制、自动识别标题/摘要，并保存原始 HTML 供 iframe sandbox 原样展示。
- ✅ 回收站、Skill 版本、分享链接已有表和接口，UI 已接入恢复、过期清理、切换版本、公开链接与成员分享。
- ✅ 分享链接支持到期、撤销、重置 token、访问计数、最近访问时间和 `allowIndexing` 标记。
- ✅ 审计日志已记录登录/登出、空间、成员、文档、分享、Skill 变更，可通过管理员接口查看最近 100 条。
- ✅ API 核心路径已有 Bun 测试：空间列表、上传原文保存与元数据识别、密码登录、CSRF、权限矩阵、软删除/恢复、公开链接到期/撤销/轮换、回收站过期清理。
- ⚠️ 仍是 MVP：没有邮箱验证/SSO/组织级邀请流；前端 e2e、生产级 CSP/资源代理、完整审计查询 UI 仍待补。

## 本地环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| **Bun** | **≥ 1.3.14** | 必需。运行时 + 包管理 + 测试器。`brew install oven-sh/bun/bun` 或 `curl -fsSL https://bun.sh/install \| bash` |
| 操作系统 | macOS / Linux / WSL2 | Windows 原生不支持 `bun:sqlite`，请用 WSL2 |
| Git | 任意 | 仅用于版本管理 |
| 浏览器 | 现代 Evergreen | 前端依赖原生 ES2023、CSS backdrop-filter；Safari ≥ 17 / Chrome ≥ 120 |
| 字体 | 系统装好 SF Pro / -apple-system 即可 | 中文走在线 Noto Sans SC（首屏需要外网） |

**不需要装：** Node.js、npm/pnpm/yarn、Python、Docker、SQLite CLI、`better-sqlite3` 编译工具链。Bun 自带 SQLite，依赖由 workspace 统一安装。

可选：

- 装 **Biome** VS Code 扩展（`biomejs.biome`）获得保存即格式化。
- 装 **TablePlus** / DBeaver / `sqlite3` 命令行，方便查看 `apps/api/data/atlas.sqlite`。

## 启动

```bash
# 1. 装依赖
bun install

# 2. 初始化数据库并灌入示例数据
bun run --filter @atlas/api db:migrate
bun run --filter @atlas/api db:seed

# 3. 起开发服（会先自动应用已提交迁移）
bun dev

# 或分别启动
bun dev:web
bun dev:api
```

前端在 `http://localhost:5173`，API 在 `http://localhost:3000`。开发时 Vite proxy 会把 `/api/*` 转发到 `:3000`，所以前端代码统一调用 `/api/...`。

示例入口：

- `http://localhost:5173/spaces/s1/docs/d1`：Reader
- `http://localhost:5173/admin/docs`：文档管理
- `http://localhost:5173/admin/upload`：HTML 上传
- `http://localhost:5173/admin/settings`：空间、成员、权限、回收站、Skill 设置
- `http://localhost:5173/share/demo-d1-public-link`：公开分享链接示例

Seed 后示例账号如下，所有账号使用同一个演示密码：

| 姓名 | 邮箱 | 角色 | 密码 |
|---|---|---|---|
| 林知远 | `lin@atlas.team` | `admin` | `atlas-demo-password` |
| 陈夏 | `chen@atlas.team` | `editor` | `atlas-demo-password` |
| 柳明 | `liu@atlas.team` | `editor` | `atlas-demo-password` |
| 苏渡 | `su@atlas.team` | `editor` | `atlas-demo-password` |
| 何远 | `he@atlas.team` | `viewer` | `atlas-demo-password` |
| 周珩 | `zhou@atlas.team` | `editor` | `atlas-demo-password` |
| 黎安 | `li@atlas.team` | `editor` | `atlas-demo-password` |
| 吴秋 | `wu@atlas.team` | `viewer` | `atlas-demo-password` |
| 郑书 | `zheng@atlas.team` | `editor` | `atlas-demo-password` |
| 韩奕 | `han@atlas.team` | `viewer` | `atlas-demo-password` |
| 叶清 | `ye@atlas.team` | `editor` | `atlas-demo-password` |
| 冯之 | `feng@atlas.team` | `viewer` | `atlas-demo-password` |

未带 session cookie 时，API 会按游客处理：只能读取公开文章。通过 `/auth/login` 登录后会设置真实 `atlas_session` cookie 和 `atlas_csrf` cookie。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `bun dev` | 应用已提交迁移，然后同时启动 web 和 api |
| `bun dev:web` | 只启动 Vite 前端 |
| `bun dev:api` | 应用已提交迁移，然后只启动 Hono API |
| `bun run build` | 构建所有 workspace |
| `bun run typecheck` | 跑所有 TypeScript 类型检查 |
| `bun test apps/api/src` | 跑 API 测试 |
| `bun run --filter @atlas/api db:generate` | 根据 Drizzle schema 生成迁移 |
| `bun run --filter @atlas/api db:migrate` | 应用已提交迁移 |
| `bun run --filter @atlas/api db:seed` | 用 fixtures 重置并灌入示例数据 |
| `bun run lint` | Biome 检查 |
| `bun run fmt` | Biome 格式化 |

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | API 监听端口 |
| `DATABASE_URL` | `apps/api/data/atlas.sqlite` | SQLite 文件路径。测试会覆盖到 `apps/api/data/test-atlas.sqlite` |

生产部署前建议显式设置 `DATABASE_URL`，并把 `secure` cookie、可信 origin、HTTPS、CSP、静态资源策略一起梳理。

## 目录

```text
.
├── apps/
│   ├── web/        前端 (Vite + React 19 + TS)
│   │   ├── index.html
│   │   ├── public/embedded-sample.html      ReaderView iframe 用
│   │   └── src/
│   │       ├── main.tsx                     入口
│   │       ├── app.tsx                      根组件 App + Dock
│   │       ├── chrome.tsx                   Topbar / Sidebar / 图标 / 动画列表
│   │       ├── views.tsx                    ReaderView / PublicDocumentView / AdminDocsView
│   │       ├── views-admin.tsx              AdminUploadView / AdminSettingsView
│   │       ├── dialogs.tsx                  CmdK / ShareDialog / SpaceManagerDialog / ToastWrap
│   │       ├── tweaks-panel.tsx             浮层调参面板
│   │       ├── styles.css
│   │       ├── api-client.ts                fetch API helper + CSRF header
│   │       └── data-hooks.ts                React Query 查询与 mutation
│   └── api/        后端 (Hono + Drizzle + bun:sqlite)
│       ├── src/server.ts                    Hono app + CORS + logger + error handler
│       ├── src/routes/{auth,members,spaces,documents}.ts
│       ├── src/lib/{auth,permissions,html-limits,audit,serializers,...}.ts
│       └── src/db/{schema,client,migrate,seed,migrations}.ts
├── packages/
│   └── shared/     共享 Zod schema、领域类型、ATLAS_DATA fixtures
├── package.json    Bun workspaces 根
├── bunfig.toml
├── biome.json
└── tsconfig.base.json
```

## API 速查

所有前端请求都走 `/api` 前缀；下面列的是后端真实路由。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/health` | 健康检查 |
| `GET` | `/auth/me` | 当前用户、session 与 CSRF 状态 |
| `POST` | `/auth/login` | 密码登录，body: `{ email, password }` |
| `POST` | `/auth/logout` | 删除当前 session |
| `GET` | `/auth/audit` | 管理员查看最近 100 条审计日志 |
| `GET` | `/spaces` | 当前用户可读空间及其文档 |
| `POST` | `/spaces` | 管理员创建空间 |
| `PATCH` | `/spaces/:id` | 空间 editor/admin 更新空间 |
| `DELETE` | `/spaces/:id` | 管理员删除空间 |
| `GET` | `/spaces/:id/members` | 查看空间成员角色 |
| `PUT` | `/spaces/:id/members/:memberId` | 管理员设置空间 viewer/editor/null |
| `GET` | `/documents` | 当前用户可读文档 |
| `GET` | `/documents/trash` | 管理员查看回收站 |
| `POST` | `/documents/trash/purge-expired` | 管理员清理到期回收站项目 |
| `GET` | `/documents/public/:token` | 公开分享链接读取文档 |
| `GET` | `/documents/:id` | 读取单篇文档 |
| `POST` | `/documents` | 在可编辑空间创建文档 |
| `POST` | `/documents/upload` | 上传 HTML、识别标题摘要并保存原文 |
| `PATCH` | `/documents/:id` | 文档 editor 更新文档 |
| `DELETE` | `/documents/:id` | 文档 editor 移入回收站 |
| `POST` | `/documents/:id/restore` | 管理员恢复回收站文档 |
| `DELETE` | `/documents/:id/permanent` | 管理员永久删除文档 |
| `GET` | `/documents/:id/share` | 查看文档分享状态 |
| `PATCH` | `/documents/:id/share` | 更新公开链接、成员分享、轮换 token |
| `PUT` | `/documents/:id/members/:memberId` | 设置文档 viewer/editor/null |
| `GET` | `/members` | 管理员查看成员 |
| `GET` | `/members/permissions` | 管理员查看空间权限矩阵 |
| `PATCH` | `/members/:id` | 管理员更新成员姓名或工作区角色 |

非 `GET` 请求在 cookie session 下必须带 `X-Atlas-CSRF` header，值来自 `atlas_csrf` cookie。

## 权限模型

Atlas 有三层权限：

- 工作区角色：`admin`、`editor`、`viewer`。当前只有 `admin` 能管理成员、空间、回收站、Skill 和审计日志。
- 空间角色：`editor`、`viewer`、`null`。空间 editor 可在该空间创建/修改文档；viewer 只能读。
- 文档成员角色：`editor`、`viewer`、`null`。文档成员分享可以给没有空间权限的人单篇访问权。

读取文档时，公开文章对任何人可读；受邀文章对管理员、作者、空间成员或文档成员可读；私密文章仅管理员和作者可读。编辑文档时，公开/受邀文章允许管理员、作者、空间 editor 或文档 editor 可写；私密文章仅管理员和作者可写。软删除后的文档不再从普通读取接口返回，只能由管理员从回收站恢复或永久删除。

## 数据库与迁移

Drizzle schema 在 `apps/api/src/db/schema.ts`，迁移文件在 `apps/api/src/db/migrations/`。默认数据库文件在 `apps/api/data/atlas.sqlite`，`client.ts` 和 `migrate.ts` 都按 API 包目录定位默认路径，所以无论从仓库根目录还是 `apps/api` 目录执行脚本都一致。

改 schema 后：

```bash
bun run --filter @atlas/api db:generate
bun run --filter @atlas/api db:migrate
bun run --filter @atlas/api db:seed
```

`db:seed` 会清空并重灌示例数据、空间权限、文档成员、公开链接和 Skill 版本。测试会创建独立的 `test-atlas.sqlite` 并在结束后删除。

## 安全边界

已实现：

- 密码登录使用 `Bun.password` 校验 bcrypt hash。
- session cookie 为 `HttpOnly`、`SameSite=Lax`，有效期 30 天。
- 真实 session 写请求要求 `X-Atlas-CSRF` header；前端 `api-client.ts` 自动从 `atlas_csrf` cookie 注入。
- 成员响应会剔除 `passwordHash`。
- **HTML 不做服务端清洗（no server-side sanitization）**：上传的 HTML 原样入库（仅做 8 MB 大小校验，见 `apps/api/src/lib/html-limits.ts`），阅读页与预览页用 iframe `sandbox="allow-scripts allow-forms allow-popups"` 隔离原始 HTML。由于沙箱**不含** `allow-same-origin`，文档脚本拿不到父页的 cookie/localStorage——**这个 sandbox iframe 是唯一的隔离边界**。文档脚本被有意允许在沙箱内运行以保持原始交互效果，因此切勿移除 sandbox，也不要给文档来源以 same-origin 信任。
- 公开链接支持禁用、撤销、到期、token 轮换、访问统计；已删除或过期文档不可公开访问。
- 关键写操作会写入 `audit_logs`。

仍需上线前处理：

- HTTPS 下把 cookie `secure` 打开，并把 CORS origin 从 localhost 改成部署域名白名单。
- 增加 CSP、iframe sandbox 策略评审、外链资源代理/下载策略、HTML 恶意样本回归集。
- 加邮箱验证、找回密码、邀请流、SSO/OIDC 或接入成熟 auth 服务。
- 给审计日志做筛选、分页和前端查看 UI。

## 说明

- 前端代码扁平在 `apps/web/src/` 下，大部分 `.tsx` 仍保留 `// @ts-nocheck`，后续可以逐文件补 props/state 类型。
- `packages/shared/src/fixtures.ts` 现在只用于 `db:seed` 生成示例数据库；运行时前端不再读 fixtures。
- API 用 `bun:sqlite` 原生驱动，无需 `better-sqlite3`。
- 前端 API 调用集中在 `apps/web/src/api-client.ts` 和 `apps/web/src/data-hooks.ts`，避免把后端 `bun:sqlite` 类型拖入浏览器工程。

## 还没做的事

按优先级排：

1. **前端 e2e** —— 用 Playwright 覆盖登录、上传、分享、回收站、权限切换和公开链接关键路径。
2. **生产级鉴权体验** —— 邮箱验证、邀请成员、找回密码、SSO/OIDC、session 管理页面和登录 UI。
3. **HTML 安全加固** —— CSP、资源代理、下载/图片白名单、恶意样本测试集、iframe sandbox 权限复核。
4. **审计与分享 UI 完整化** —— 审计日志筛选/分页、公开访问统计图、noindex meta 落到公开页面 HTML。
5. **回收站策略细化** —— 定时任务调度、永久删除确认 UI、空间删除时的文档迁移或阻止策略。
6. **逐文件去掉 `@ts-nocheck`**，补 props/state 类型，并把前端原型组件拆出更稳定的数据边界。

## 常见问题

**Q: `bun install` 报 `Cannot find module '@atlas/shared'`?**
不会发生 —— Bun 自动 link workspace。如果真碰到，删掉 `node_modules` 和 `bun.lock` 重装。

**Q: `bun:sqlite` 在 Windows 报错？**
原生不支持，必须用 WSL2。

**Q: 不登录可以看到什么？**
未登录时是游客身份，只能查看公开文章。受邀和私密文章需要登录后按空间权限、单篇邀请、作者或管理员身份判断。

**Q: 改了 `apps/api/src/db/schema.ts` 后怎么办？**
跑 `bun run --filter @atlas/api db:generate` 生成新迁移，再 `db:migrate` 应用。改完建议接着跑 `bun test apps/api/src`。
