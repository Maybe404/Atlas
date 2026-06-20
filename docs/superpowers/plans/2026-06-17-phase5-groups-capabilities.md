# Phase 5 — 权限组 + 全局能力 实施计划

**Goal:** 引入 `groups` / `group_members` + 能力开关；有效授权 = max(直接成员授权, 所在组授权)；全局 `role` 收敛为 `admin/member`；后台改为以组为中心的四标签 IA。

**落地顺序:** 5a 后端 + 编译兜底 → 5b 前端 IA/组管理/编辑器 access。每提交 typecheck+lint+build+test 全绿。

---

## 5a 后端（本提交）

### 数据 / 契约
- `schema.ts`：
  - `groups(id, name, capabilities json, createdAt)`；`group_members(groupId, memberId, pk)` + memberId 索引。
  - `members.role` enum `['admin','editor','viewer']` → `['admin','member']`（drizzle text enum 无 DB CHECK，仅 TS；列 DDL 不变，只需数据 backfill）。
- 迁移 `0011_groups_capabilities.sql`：建两表 + 索引 + `UPDATE members SET role='member' WHERE role IN ('editor','viewer')`。snapshot/journal 手写（沿用 0010 流程）。
- `packages/shared`：`RoleSchema` → `['admin','member']`；`CapabilitySchema=['createSpace','manageMembers','manageGroups','publish']`；`GroupSchema`/`CreateGroupSchema`/`UpdateGroupSchema`/`SetGroupMembersSchema`/`SetGroupGrantsSchema`。`CreateMemberSchema.role.default('member')`。

### 鉴权
- `grants.ts`：`listGroupIdsForMember`、`listEffectiveGrants(memberId, groupIds)`（member 直授 + 组授权一把捞）、`setGroupGrant`、`listGroupGrants`、组 CRUD 辅助。
- `permissions.ts`：
  - `Capability`/`ALL_CAPABILITIES` 从 shared；`PermissionLookup` 加 `capabilities:Set<Capability>`。
  - `loadPermissionLookup`：载 member 的 groupIds；grant 折叠 = member 直授 ∪ 组授权，按 `editor>viewer` 取最高写入三张 role map；capabilities = 组能力并集（admin = 全集）。
  - `getMemberCapabilities(user)`、`requireCapability(caps,cap)`。
- 能力闸：`spaces` POST → `createSpace`；`members` 全路由 → `manageMembers`；`groups` 路由 → `manageGroups`；`canManageDocumentShare` = admin/author/(publish && canEdit)。admin 恒过。

### 路由 / seed / 测试
- `routes/groups.ts`：GET/POST/PATCH/DELETE `/groups`，PUT `/groups/:id/members`、PUT `/groups/:id/grants`。挂载 `server.ts`。
- `seed-data.ts`：role admin/member；新增 1~2 个组（如「编辑组」带 createSpace+publish、授 s1 editor）+ group_members。`seed.ts` 写组与组成员、组 grants。
- `server.test.ts`：组授权叠加取最高、组授权令成员可读/可写、能力闸（成员凭组 createSpace 建空间）、role 收敛断言。

### 前端编译兜底（最小，完整 IA 留 5b）
- `auth.tsx` ROLE_LABEL/颜色、`members-pane` 默认 role、`app.tsx` role 文案 → admin/member 不报类型错。

## 5b 前端（下一提交）
- 后台四标签：成员 / 权限组 / 空间 / 回收站·审计。
- 权限组管理 UI：能力开关 + 对空间/文件夹授权（含私有文件夹）+ 组成员增删。
- 空间「访问」页改为展示「组 / 人 被授予的角色」。
- 编辑器（html/md dialog）加 per-doc `access`（继承/受限）切换。
- 成员角色下拉 admin/member。
