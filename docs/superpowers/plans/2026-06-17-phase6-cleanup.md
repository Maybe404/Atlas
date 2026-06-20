# Phase 6 收尾清理 Implementation Plan

**Goal:** 删除已被 grants 取代的死表 `space_members` / `document_members`，移除 schema 定义并生成 drop 迁移，完成权限重构收尾。

**Architecture:** Phase 1 起所有路由/permissions/seed/测试均已切到统一 `grants` 表，两张旧表自此零读写，仅 schema 定义与 DB 中空表残留。本阶段删定义 + drop 迁移。旧 `visibility` 列已在 0010 删净，无需再处理。

**Tech Stack:** Drizzle + bun:sqlite，drizzle-kit 生成迁移。

## Tasks
1. schema.ts 删除 `spaceMembers`、`documentMembers` 两表定义及其上方注释。
2. `db:generate` 生成 0012 drop 迁移（整表 drop 无 rename 歧义，预期非交互通过）；若 TUI 卡住则手写 drop + snapshot + journal（参照 0010 先例）。
3. `db:migrate` 应用，`db:seed` 重置，`bun test apps/api/src` 全绿。
4. typecheck / lint / build 全过。
5. commit（Phase 6 收尾）。
