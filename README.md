# Atlas

空间管理与权限的管理后台。前端 React 19 + Vite 6 + TypeScript；后端 Hono + Drizzle + SQLite（`bun:sqlite`）；运行时与包管理统一用 **Bun 1.3.14**；Bun workspaces 把 `apps/*` 和 `packages/*` 串起来。

## 完成度

当前是「**可本地使用的全栈 MVP**」状态：

- ✅ 前端 UI 已接真实 API：React Query 拉取空间、文档、成员、权限，CRUD 通过 mutation 同步到 SQLite
- ✅ URL 路由已落地：Reader、管理、上传、设置、公开链接都有可刷新地址
- ✅ Hono + Drizzle + SQLite 迁移已生成并验证，`db:migrate` / `db:seed` 可直接初始化
- ✅ 当前用户与 session 已有最小实现：`/auth/login`、`/auth/me`、cookie session；未登录时本地默认使用 demo 用户林知远
- ✅ 空间权限真实执行：空间/文档查询按当前用户过滤，写操作要求 editor/admin 权限
- ✅ HTML 上传与清洗已接后端：`multipart/form-data` 上传、清洗 `<script>` / 事件属性 / `javascript:` URL，并保存清洗后的 HTML
- ✅ 回收站、Skill 版本、分享链接已有表和接口，UI 已接入恢复、切换版本、公开链接与成员分享
- ⚠️ 仍是 MVP：认证没有密码/SSO，HTML sanitize 是内置轻量实现，不是完整安全审计级清洗器
- ✅ API 核心路径已有 Bun 测试：空间列表、上传清洗、软删除/恢复、公开链接
- ⚠️ 前端 e2e 与更完整的权限矩阵测试仍待补充

## 本地环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| **Bun** | **≥ 1.3.14** | 必需。运行时 + 包管理 + 测试器。`brew install oven-sh/bun/bun` 或 `curl -fsSL https://bun.sh/install \| bash` |
| 操作系统 | macOS / Linux / WSL2 | Windows 原生不支持 `bun:sqlite`，请用 WSL2 |
| Git | 任意 | 仅用于版本管理 |
| 浏览器 | 现代 Evergreen | 前端依赖原生 ES2023、CSS backdrop-filter；Safari ≥ 17 / Chrome ≥ 120 |
| 字体 | 系统装好 SF Pro / -apple-system 即可 | 中文走在线 Noto Sans SC（首屏需要外网） |

**不需要装：** Node.js、npm/pnpm/yarn、Python、Docker、SQLite CLI、`better-sqlite3` 编译工具链。Bun 自带 SQLite，所有依赖纯 JS。

可选：
- 装 **Biome** VS Code 扩展（`biomejs.biome`）获得保存即格式化
- 装 **TablePlus** / DBeaver / `sqlite3` 命令行，方便看 `./apps/api/data/atlas.sqlite`

## 启动

```bash
# 1. 装依赖（首次约 15 秒）
bun install

# 2. 初始化数据库（首次运行）
bun run --filter @atlas/api db:migrate    # 应用已提交迁移到 ./apps/api/data/atlas.sqlite
bun run --filter @atlas/api db:seed       # 用 ATLAS_DATA 灌示例数据、权限、分享链接、skill 版本

# 3. 起开发服
bun dev                                   # 同时跑 web (:5173) 和 api (:3000)
# 或分别：
bun dev:web                               # 只跑前端，访问 http://localhost:5173
bun dev:api                               # 只跑后端，验证 http://localhost:3000/health
```

前端在 `:5173`，开发时通过 Vite proxy 把 `/api/*` 转发到 `:3000`。示例入口：

- `http://localhost:5173/spaces/s1/docs/d1`：Reader
- `http://localhost:5173/admin/docs`：文档管理
- `http://localhost:5173/admin/upload`：HTML 上传
- `http://localhost:5173/admin/settings`：空间、成员、权限、回收站、Skill 设置
- `http://localhost:5173/share/demo-d1-public-link`：公开分享链接示例

## 目录

```
.
├── apps/
│   ├── web/        前端 (Vite + React 19 + TS)
│   │   ├── index.html
│   │   ├── public/embedded-sample.html      ReaderView iframe 用
│   │   └── src/
│   │       ├── main.tsx                     入口
│   │       ├── app.tsx                      根组件 App + Dock
│   │       ├── chrome.tsx                   Topbar / Sidebar / 图标 / 动画列表
│   │       ├── views.tsx                    ReaderView / SpaceIndexView / AdminDocsView
│   │       ├── views-admin.tsx              AdminUploadView / AdminSettingsView
│   │       ├── dialogs.tsx                  CmdK / ShareDialog / SpaceManagerDialog / ToastWrap
│   │       ├── tweaks-panel.tsx             浮层调参面板
│   │       ├── styles.css
│   │       ├── api-client.ts                fetch API helper
│   │       └── data-hooks.ts                React Query 查询与 mutation
│   └── api/        后端 (Hono + Drizzle + bun:sqlite)
│       ├── src/server.ts                    Hono app + CORS + logger + error handler
│       ├── src/routes/{auth,members,spaces,documents,skills}.ts
│       ├── src/lib/{auth,permissions,sanitize,...}.ts
│       └── src/db/{schema,client,migrate,seed,migrations}.ts
├── packages/
│   └── shared/     共享 Zod schema、领域类型、ATLAS_DATA fixtures
├── package.json    Bun workspaces 根
├── bunfig.toml
├── biome.json
└── tsconfig.base.json
```

## 说明

- 前端代码扁平在 `apps/web/src/` 下，大部分 `.tsx` 仍保留 `// @ts-nocheck`，后续可以逐文件补 props/state 类型。
- `packages/shared/src/fixtures.ts` 现在只用于 `db:seed` 生成示例数据库；运行时前端不再读 fixtures。
- API 用 `bun:sqlite` 原生驱动，无需 `better-sqlite3`。Drizzle schema 在 `apps/api/src/db/schema.ts`。
- 前端 API 调用集中在 `apps/web/src/api-client.ts` 和 `apps/web/src/data-hooks.ts`，避免把后端 `bun:sqlite` 类型拖入浏览器工程。
- 本地 demo 登录：未设置 cookie 时 API 自动使用 `u1`（林知远）；也可以 `POST /auth/login`，body 为 `{ "email": "lin@atlas.team" }`。

## 还没做的事

按优先级排：

1. **正式鉴权** —— 当前是 demo session：没有密码、邮箱验证、SSO、CSRF 策略、审计日志。上线前建议接 Better Auth / Auth.js / 自建 OIDC。
2. **强化 HTML sanitize** —— 目前是轻量内置清洗，适合 demo；上线前需要引入成熟 HTML sanitizer、CSP、资源代理、大小限制和恶意样本测试。
3. **测试** —— 继续扩展权限矩阵、鉴权边界、分享链接到期、前端关键路径 e2e。
4. **分享与公开访问细化** —— 到期任务、访问统计、公开页面 SEO/noindex、撤销链接审计。
5. **回收站保留策略** —— 30 天自动清理任务、永久删除确认、空间删除时的文档迁移策略。
6. **逐文件去掉 `@ts-nocheck`**，补 props/state 类型，并把前端原型组件拆出更稳定的数据边界。

## 常见问题

**Q: `bun install` 报 `Cannot find module '@atlas/shared'`?**
不会发生 —— Bun 自动 link workspace。如果真碰到，删掉 `node_modules` 和 `bun.lock` 重装。

**Q: `bun:sqlite` 在 Windows 报错？**
原生不支持，必须用 WSL2。

**Q: 改了 `apps/api/src/db/schema.ts` 后怎么办？**
跑 `bun run --filter @atlas/api db:generate` 生成新迁移，再 `db:migrate` 应用。
