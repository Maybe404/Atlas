# Atlas

空间管理与权限的管理后台。前端 React 19 + Vite 6 + TypeScript；后端 Hono + Drizzle + SQLite（`bun:sqlite`）；运行时与包管理统一用 **Bun 1.3.14**；Bun workspaces 把 `apps/*` 和 `packages/*` 串起来。

## 完成度

当前是「**前端原型 + 后端骨架**」状态：

- ✅ 前端 UI 完整可交互（数据来自内存中的 `ATLAS_DATA` 示例，刷新不持久化）
- ✅ Bun monorepo / Vite / TS / Biome / Drizzle schema / Hono 路由骨架
- ⚠️ 后端只有 `/spaces`、`/documents` 基础 CRUD，未跑过迁移
- ❌ 前端没接 API（还在用内存 fixtures）
- ❌ 没有路由、鉴权、权限执行、文件上传、HTML 清洗、回收站、分享链接
- ❌ 没有测试

详见末尾「[还没做的事](#还没做的事)」。

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

# 2. 初始化数据库（仅首次或 schema 变更后）
bun run --filter @atlas/api db:generate   # 生成 SQL 迁移文件
bun run --filter @atlas/api db:migrate    # 应用迁移到 ./apps/api/data/atlas.sqlite
bun run --filter @atlas/api db:seed       # 用 ATLAS_DATA 灌示例数据

# 3. 起开发服
bun dev                                   # 同时跑 web (:5173) 和 api (:3000)
# 或分别：
bun dev:web                               # 只跑前端，访问 http://localhost:5173
bun dev:api                               # 只跑后端，验证 http://localhost:3000/health
```

前端在 `:5173`，开发时通过 Vite proxy 把 `/api/*` 转发到 `:3000`。

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
│   │       └── api-client.ts                Hono RPC 客户端（端到端类型）
│   └── api/        后端 (Hono + Drizzle + bun:sqlite)
│       ├── src/server.ts                    导出 AppRouter 类型给前端
│       ├── src/routes/{spaces,documents}.ts
│       └── src/db/{schema,client,migrate,seed}.ts
├── packages/
│   └── shared/     共享 Zod schema、领域类型、ATLAS_DATA fixtures
├── package.json    Bun workspaces 根
├── bunfig.toml
├── biome.json
└── tsconfig.base.json
```

## 说明

- 前端代码扁平在 `apps/web/src/` 下，每个 `.tsx` 顶部带 `// @ts-nocheck`，先跑起来；后续逐文件去掉、补 props 类型。
- `packages/shared/src/fixtures.ts` 是前后端共享的示例数据（旧 `src/data.js` 的 TS 版本，去掉 `window.ATLAS_DATA` 包装，改 `export const ATLAS_DATA`）。
- API 用 `bun:sqlite` 原生驱动，无需 `better-sqlite3`。Drizzle schema 在 `apps/api/src/db/schema.ts`。
- 端到端类型：`apps/api/src/server.ts` 导出 `AppRouter`，`apps/web/src/api-client.ts` 用 `hc<AppRouter>` 拿到完整类型推导。

## 还没做的事

按优先级排：

1. **前后端连线** —— 引入 `QueryClientProvider`，把组件里 `useState(() => ATLAS_DATA.tree)` 这类换成 `useQuery(['spaces'], () => api.spaces.$get())`。CRUD 接 `useMutation`。
2. **路由** —— 当前 `view` 字符串切换不带 URL，刷新即丢。装 TanStack Router 或 React Router。
3. **鉴权与当前用户** —— API 现在所有写操作硬编码 `authorId: 'u1'`。需要 login、session、`c.get('user')`。可选 Better Auth / Lucia 继任方案。
4. **权限执行** —— `space_members` 表建了但**查询时没按当前用户过滤**。需要在每个 list/get 路由里 `join space_members where memberId = ctx.user.id`。
5. **上传 + HTML sanitize skill** —— 前端的上传 UI 是模拟的；后端没有 multipart 路由、没有 sanitize 实现、没有 skill 版本表。
6. **回收站 / Skill 版本管理 / 分享链接** —— UI 都有，后端零实现。
7. **错误处理与日志** —— 现在 Zod 解析失败直接 500；加 `app.onError` 统一返回 `{ code, message }`。
8. **测试** —— `bun test` 框架已自带，但还没写任何用例。
9. **逐文件去掉 `@ts-nocheck`**，补 props/state 的类型。

## 常见问题

**Q: `bun install` 报 `Cannot find module '@atlas/shared'`?**
不会发生 —— Bun 自动 link workspace。如果真碰到，删掉 `node_modules` 和 `bun.lock` 重装。

**Q: `bun:sqlite` 在 Windows 报错？**
原生不支持，必须用 WSL2。

**Q: 改了 `apps/api/src/db/schema.ts` 后怎么办？**
跑 `bun run --filter @atlas/api db:generate` 生成新迁移，再 `db:migrate` 应用。
