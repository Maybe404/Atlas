# Atlas

空间管理与权限的管理后台。前端 React 19 + Vite 6 + TypeScript；后端 Hono + Drizzle + SQLite（`bun:sqlite`）；运行时与包管理统一用 **Bun 1.3.14**；Bun workspaces 把 `apps/*` 和 `packages/*` 串起来。

## 目录

```
.
├── apps/
│   ├── web/        前端 (Vite + React 19 + TS)
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx               入口
│   │       ├── app.tsx                根组件 App + Dock
│   │       ├── chrome.tsx             Topbar / Sidebar / 图标 / 动画列表
│   │       ├── views.tsx              ReaderView / SpaceIndexView / AdminDocsView
│   │       ├── views-admin.tsx        AdminUploadView / AdminSettingsView
│   │       ├── dialogs.tsx            CmdK / ShareDialog / SpaceManagerDialog / ToastWrap
│   │       ├── tweaks-panel.tsx       浮层调参面板
│   │       ├── styles.css
│   │       └── api-client.ts          Hono RPC 客户端（端到端类型）
│   └── api/        后端 (Hono + Drizzle + bun:sqlite)
│       ├── src/server.ts              导出 AppRouter 类型给前端
│       ├── src/routes/
│       └── src/db/
├── packages/
│   └── shared/     共享 Zod schema、领域类型、ATLAS_DATA fixtures
├── package.json    Bun workspaces 根
├── bunfig.toml
├── biome.json
└── tsconfig.base.json
```

## 启动

```bash
bun install                                # 装所有 workspace 依赖
bun run --filter @atlas/api db:generate    # 生成 SQL 迁移
bun run --filter @atlas/api db:migrate     # 应用迁移到 ./apps/api/data/atlas.sqlite
bun run --filter @atlas/api db:seed        # 用 ATLAS_DATA 灌示例数据

bun dev                                    # 同时跑 web (:5173) 和 api (:3000)
# 或分别：
bun dev:web
bun dev:api
```

前端在 `:5173`，开发时通过 Vite proxy 把 `/api/*` 转发到 `:3000`。

## 说明

- 前端代码扁平在 `apps/web/src/` 下，每个 .tsx 顶部带 `// @ts-nocheck`，先跑起来；后续逐文件去掉、补 props 类型。
- `packages/shared/src/fixtures.ts` 是前后端共享的示例数据（旧 `src/data.js` 的 TS 版本，去掉 `window.ATLAS_DATA` 包装，改 `export const ATLAS_DATA`）。
- API 用 `bun:sqlite` 原生驱动，无需 `better-sqlite3`。Drizzle schema 在 `apps/api/src/db/schema.ts`。
- 端到端类型：`apps/api/src/server.ts` 导出 `AppRouter`，`apps/web/src/api-client.ts` 用 `hc<AppRouter>` 拿到完整类型推导。
- `apps/web/public/embedded-sample.html` 给 ReaderView 的 `<iframe>` 用。

## 下一步建议

1. `bun install`，`bun dev` 看页面渲染。
2. 引入 TanStack Router / TanStack Query，把当前 `view` 字符串切换换成路由。
3. 把 `AdminDocsView` 等组件里的 useState 数据接到 `api.documents.$get()`。
4. 逐文件去掉 `@ts-nocheck` 并补 props 类型。
