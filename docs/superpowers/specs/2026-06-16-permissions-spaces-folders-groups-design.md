# Atlas 权限 / 空间 / 文件夹 / 权限组 重构设计

- 日期：2026-06-16
- 状态：已与用户确认，待落实现计划
- 范围：后端数据模型与鉴权（`apps/api`）、共享契约（`packages/shared`）、前端管理后台与目录树（`apps/web`）

## 1. 背景与动机

当前模型存在四类问题：

1. **全局角色名存实亡**：`members.role` 的 `editor` / `viewer` 几乎不参与任何鉴权，实际只有 `admin` 有意义。
2. **空间是扁平的，没有文件夹**：文档 `documents.spaceId` 直连空间，无法组织层级；新建文章无法选择路径。
3. **私人空间是装饰**：`spaces.personal` 字段存在但不参与鉴权，没有真正的隔离。
4. **可见性概念含糊、权限维护零散**：`visibility = invite` 与"空间成员可见"语义重复；单文档授权在共享空间里无意义；admin 需要逐人、逐空间、逐文档手动维护权限，没有"组"的概念。

目标：用一套连贯的模型同时解决这四点，并保持**阅读页左侧的动效与交互不变**。

## 2. 已确认的设计决策

| 决策点 | 选择 | 含义 |
| --- | --- | --- |
| 权限组形态 | **A+B 混合** | 组既携带"对空间/文件夹的授权"（A），也携带"全局能力开关"（B） |
| 文件夹权限 | **Z：默认继承 + 可选私有** | 文件夹默认继承空间访问；单个文件夹可设 `restricted`，设后空间授权不穿透，需显式授权 |
| 私人空间暴露 | **P：仅逐文档 / 公开链接** | 私人空间整体永远私密、不可整体授权；对外只能逐文档授权或发布公开链接 |
| 可见性模型 | **inherit + restricted 两态 + 独立发布** | 去掉 `invite`；站内可见性与对外发布（share_links）彻底正交 |
| 落地顺序 | 地基 → 私人空间 → 文件夹 → 可见性 → 权限组 → 清理 | 见第 7 节 |

## 3. 数据模型

变更图例：**新增** / **改动** / **不动**。

### 3.1 改动的表

**`members`（改动）**
- `role` 收敛为 `admin | member`（去掉 `editor` / `viewer` 两个无实权的全局档）。
- 全局能力不再挂在 `role` 上，改由"组的 capabilities"携带。
- 约束：工作区必须始终保留至少一个 `admin`（沿用现有保护逻辑）。

**`spaces`（改动）**
- `personal: boolean` 真正参与鉴权（不再是装饰）。
- 新增 `ownerId: text → members.id`（仅私人空间非空），标识私人空间归属人。

**`documents`（改动）**
- 新增 `folderId: text | null → folders.id`（`null` = 挂在空间根）。
- 新增 `access: 'inherit' | 'restricted'`，取代旧 `visibility`：
  - `inherit`（默认）：跟随所在文件夹/空间的可见性。
  - `restricted`：即使在共享空间内，也仅作者 + admin + 被显式授权该文档的人/组可见。
- 旧 `visibility` 字段在迁移后由 `access` + share_links 取代（清理阶段移除）。

### 3.2 新增的表

**`groups`（新增）**
- `id, name`
- `capabilities`：全局能力开关集合（建议 JSON 或独立列），初始集合：
  - `createSpace`（创建空间）
  - `manageMembers`（管理成员）
  - `manageGroups`（管理权限组）
  - `publish`（对外发布 / 公开链接）

**`group_members`（新增）**
- `groupId → groups.id`，`memberId → members.id`，主键 `(groupId, memberId)`。
- 多对多：把人放进组。

**`folders`（新增）**
- `id, spaceId → spaces.id, parentId → folders.id | null`（可嵌套）。
- `restricted: boolean`（私有文件夹开关）。
- `name, order`（同级排序）。

**`grants`（新增，统一授权表）**
- `subjectType: 'group' | 'member'`，`subjectId`
- `targetType: 'space' | 'folder' | 'document'`，`targetId`
- `role: 'editor' | 'viewer'`
- 取代并合并现有 `spaceMembers` + `documentMembers`。
- 建议索引：按 `subjectId`、按 `(targetType, targetId)`，以支撑两个方向的查询（"某人有哪些授权" / "某资源被授权给谁"）。

### 3.3 不动的表

- `share_links`：继续承载对外发布 / 公开链接，与站内可见性彻底正交。
- `sessions`、`audit_logs`：不动（审计 action 会新增组/文件夹相关条目）。

## 4. 鉴权求解（permissions.ts 重写核心）

### 4.1 有效授权（effective grant）

用户对某目标的**有效角色** = `max(` 直接授权给该用户的 grant，该用户**所在任意组**被授予的 grant `)`。
- 组授权与直接授权**叠加取最高**（`editor > viewer`）。
- 下文"有 grant"均指有效授权。

### 4.2 读权限求解顺序（自上而下，命中即停）

1. 文档已软删除（`deletedAt`）→ **拒绝**（admin 回收站路径除外）。
2. 存在有效的公开 share_link / 已发布 → **放行**（独立通道，匿名访客也走这里）。
3. 用户是 `admin` → **放行**。
4. 用户是作者，或是该（私人）空间的 `ownerId` → **放行**。
5. 文档 `access = restricted` → 仅当用户对**该文档**有 grant 时放行；否则**拒绝并停止**（不再继承空间/文件夹）。
6. 文档 `access = inherit` → 从文档所在**文件夹链**向上求解至**空间**：
   - 遇到 `restricted` 私有文件夹：空间级授权**不穿透**，必须对该文件夹（或更深层）有 grant 才放行。
   - 普通文件夹：透明继承，对**空间**有 grant 即放行。
   - **私人空间**：除 `ownerId` 外无人持有空间级 grant，因此 `inherit` 文档对他人天然不可见（他人仅能通过逐文档 grant 访问，即落回第 5 步形态）。
7. 以上都未命中 → **拒绝**（fail-closed）。

### 4.3 写权限

走同一条链，但在放行点要求**有效角色 = `editor`**（第 5、6 步），作者与 admin 仍直接放行。

### 4.4 列表查询

- `listReadableSpaces` / `listReadableDocuments` 等需基于 `grants` + 文件夹链 + `access` 重写。
- 目录列举时，私有文件夹与 restricted 文档对无权用户呈现为"锁定"占位（沿用现有 `LockedDirectoryDocument` 形态），不泄露内容。

## 5. 管理后台信息架构

四个标签页，以"组"为中心：

1. **成员**：账号 CRUD、全局 `role`（admin/member）、所属组。
2. **权限组**（核心）：
   - 组对资源的授权（A）：可同时授权空间和文件夹（含私有文件夹），每条带角色。
   - 组的全局能力（B）：`createSpace / manageMembers / manageGroups / publish` 开关。
   - 组成员：加入 / 移除。
3. **空间**：空间 CRUD；空间的"访问"页改为展示"哪些**组 / 人**被授予了什么角色"（而非逐人列表）。
4. **回收站 / 审计**：沿用现有。

收益对比：N 人 × M 资源的逐项维护 → 建组 + 授权一次；新增成员入组后**零额外授权操作**即继承全部权限。

## 6. 前端其它影响

- **新建文章**：增加"路径选择"（空间 + 文件夹），写入 `documents.folderId`。
- **目录树**：空间下展开文件夹层级；私有文件夹 / restricted 文档对无权用户显示锁定占位。
- **可见性 UI**：文档设置里把三档 `public/invite/private` 替换为 `inherit/restricted` 两态 + 独立的"发布/公开链接"区。
- **阅读页左侧动效与交互保持不变**——仅目录数据多了层级，动效逻辑不改。

## 7. 迁移与分阶段落地

### 7.1 数据迁移映射（不丢权限）

每行 backfill **随对应阶段一起落**（不是在地基阶段一次性全做），"落地阶段"列标明时机：

| 现状 | 迁移到 | 落地阶段 |
| --- | --- | --- |
| `members.role = editor / viewer` | `member`（admin 保留） | 5（角色收敛时） |
| `spaceMembers(space, member, role)` | `grants`：member→space 直接授权 | 1（地基） |
| `documentMembers(doc, member, role)` | `grants`：member→document 直接授权 | 1（地基） |
| `spaces.personal = true` | 补 `ownerId`（由原空间 editor 成员推断；无法推断时由迁移脚本记录待人工指派） | 2 |
| 所有文档 | `folderId = null`（先全挂空间根） | 3（加列即默认） |
| `visibility = public` | `access = inherit` + 自动生成并启用一条公开 share_link | 4 |
| `visibility = invite` | `access = inherit`（语义不变：空间成员可见） | 4 |
| `visibility = private` | `access = restricted` | 4 |

> 行为安全约束：在第 4 阶段把 `access` 落地之前，鉴权链仍读旧 `visibility`；地基阶段（1）只迁成员表到 `grants`，`permissions.ts` 对可见性的判断保持原样，确保每一步都行为可回归。

### 7.2 落地顺序（依赖驱动，每阶段可独立上线）

1. **地基（必须先做）**：建 `grants` 表，backfill 两张成员表，重写 `permissions.ts` 改读 grants。**行为完全不变**的纯内部重构。
2. **私人空间隔离**：`personal` + `ownerId` 生效；新建成员时自动建私人空间；他人仅可逐文档 / 公开链接访问。
3. **文件夹 / 分组结构**：`folders` 表（可嵌套）+ `documents.folderId` + 新建文章选路径 + `restricted` 私有文件夹。阅读页左侧动效不变。
4. **可见性重定义**：UI 落地 `inherit / restricted`，去掉 `invite`；发布统一走 share_links。
5. **权限组 + 全局能力**：`groups` / `group_members` / capabilities；后台改为以组为中心四标签；全局 `role` 收敛为 admin/member。
6. **清理**：稳定后删除 `spaceMembers` / `documentMembers` 旧表与遗留字段（含旧 `visibility`）。

第 1 阶段是唯一"必须先做"的地基；2–5 相对独立，本设计按上表顺序执行。

## 8. 非目标（YAGNI）

- 不做任意深度的细粒度文件夹 ACL（仅 `restricted` 二态开关，见决策 Z）。
- 不把私人空间做成可整体转共享（决策 P）。
- 不引入跨工作区 / 多租户。
- 不改动阅读页左侧动效与交互。
- 不新增邮箱验证 / SSO（仍是 `README.md` 记录的已知缺口）。

## 9. 测试要点

- `permissions.ts` 求解链的单元测试：覆盖 7 步顺序、组叠加取最高、私有文件夹不穿透、私人空间隔离、restricted 截断。
- 迁移脚本的幂等性与"权限不丢"快照测试（迁移前后同一用户的可读/可写文档集合一致，public/invite/private 三类各取样）。
- 列表查询（`listReadable*`）在含文件夹层级与锁定占位时的正确性。
- 沿用 `bun test apps/api/src`；改 schema 后走 `db:generate → db:migrate → db:seed`。
