# Atlas 项目代码审查 TODO

> 生成日期：2026-05-27  
> 范围：`apps/api`、`apps/web`、`packages/shared`、根配置文件  
> 目标：记录当前项目中的冗余、规范、权限、性能和架构合理性问题，便于后续逐项整改。

## 总体结论

当前项目整体结构清晰，属于 Bun + TypeScript monorepo：

- `apps/api`：后端 API、SQLite/Drizzle、权限、审计、文档管理。
- `apps/web`：React/Vite 前端。
- `packages/shared`：共享 schema、类型和 HTML metadata 工具。

项目方向是合理的，但目前仍处在“原型迁移到产品化”的中间状态：

- 后端结构相对清楚，但存在权限泄漏、N+1 查询、缺少索引、部分默认值重复等问题。
- 前端功能较完整，但大量核心文件使用 `// @ts-nocheck`，并且 Biome 排除了 `apps/web/src/**/*.tsx`，导致 lint/typecheck 覆盖不足。
- `/spaces` 接口负载过重，承担了空间目录、文档列表和文档正文 bootstrap 的职责。
- 前端存在大文件、重复样式映射、持续 DOM 扫描和 idle `requestAnimationFrame` 等维护与效率问题。

---

## P0：必须优先修复

### TODO 1：保留匿名可见上锁目录，但修复目录响应字段过度暴露

**严重程度：P0 / 权限边界与信息暴露风险**

**相关文件：**

- `apps/api/src/lib/permissions.ts:174-183`
- `apps/api/src/routes/spaces.ts:24-44`
- `apps/api/src/routes/spaces.ts:47-86`

**问题说明：**

产品需求是：未登录用户可以看到所有目录，目录呈现上锁状态；点击上锁目录或文档时，右侧展示“请登录”页面；登录后再按对应权限展示对应内容。

因此，这里的问题不是“匿名用户绝对不能看到目录”，而是当前 `/spaces` 给匿名用户返回的非公开文档字段过多。`listDirectoryDocuments()` 对匿名用户返回所有未删除文档：

```ts
export async function listDirectoryDocuments(user: User | undefined, space?: SpaceRow) {
  if (!user) {
    const spaceScope = space ? [eq(documents.spaceId, space.id)] : [];
    return db
      .select()
      .from(documents)
      .where(and(isNull(documents.deletedAt), ...spaceScope));
  }

  return listReadableDocuments(user, space);
}
```

这能满足“目录可发现”的需求，但后续 `toDoc()` 会返回过多真实文档元信息。对未登录用户来说，当前可能暴露：

- 文档 ID
- 空间 ID
- 标题
- 描述
- 作者 ID
- 作者名
- 更新时间
- 可见性
- 标签
- skillVersion
- deletedAt

如果产品只要求“看到上锁目录”，这些字段明显超出了需求。更合理的模型是：目录可发现，但内容不可读，敏感元信息不可见。

**整改建议：**

- 保留匿名用户可见所有空间/目录的能力，用于实现“上锁目录”体验。
- 对匿名用户返回专用的 locked directory DTO，不直接复用完整 `toDoc()` 输出。
- 匿名用户可返回的字段建议限制为：
  - `id`
  - `spaceId`
  - `title`：仅当产品明确允许访客看到真实标题时返回；否则返回统一文案，例如 `登录后查看`
  - `locked: true`
  - `canRead: false`
  - `canEdit: false`
- 匿名用户不应返回：
  - `html`
  - `desc`
  - `author`
  - `authorName`
  - `updated`
  - `tags`
  - `visibility`
  - `skillVersion`
  - `deletedAt`
- 点击 locked 文档时，前端根据 `canRead: false` 或 `locked: true` 展示“请登录后查看内容”，不要尝试展示正文。
- 登录用户继续按现有权限规则展示：
  - public：可读
  - invite：空间成员或文档成员可读
  - private：作者或 admin 可读
  - 无权限：展示上锁或无权限页面
- 为匿名访问 `/spaces` 添加测试，确认：
  - 能看到目录结构。
  - 非公开文档不返回正文。
  - 非公开文档不返回超出 locked DTO 的敏感字段。

**验收标准：**

- 未登录请求 `/spaces` 时，可以看到所有空间/目录，并能区分 locked 状态。
- 未登录用户不能获得非公开文档正文。
- 未登录用户不能获得非公开文档的描述、作者、更新时间、标签、skillVersion 等敏感元信息。
- 点击 locked 目录或文档时，前端展示“请登录后查看内容”。
- 登录后按用户权限展示对应内容。
- 测试覆盖 public/private/invite 三类文档，以及未登录、已登录无权限、已登录有权限三类访问场景。

---

### TODO 2：修复分享设置接口泄露文档 ID 是否存在的问题

**严重程度：P0 / 安全风险**

**相关文件：**

- `apps/api/src/routes/documents.ts:329-338`
- `apps/api/src/server.test.ts:364-366`

**问题说明：**

当前 `GET /documents/:id/share` 逻辑：

```ts
const [doc] = await db
  .select()
  .from(documents)
  .where(and(eq(documents.id, c.req.param('id')), isNull(documents.deletedAt)));
if (!doc) throw notFound();

const canManage = canManageDocumentShare(user, doc);
if (!canManage) return c.json(emptyShareState(doc.id));
```

如果文档不存在，接口返回 `404`；如果文档存在但用户无权限，接口返回 `200 + emptyShareState()`。这会允许调用者探测某个私有文档 ID 是否存在。

**整改建议：**

- 对无管理权限用户返回 `404` 或 `403`，不要返回空分享状态。
- 更推荐：分享管理接口只允许有管理权限的用户访问；无权限时统一返回 `404`，避免存在性探测。
- 对现有测试中“未授权返回空分享状态”的断言进行更新。

**验收标准：**

- 未授权用户访问存在文档和不存在文档时，响应不应泄露可区分的存在性信息。
- 作者/admin 仍然可以正常读取分享设置。
- 测试覆盖匿名、普通成员、作者、admin 四类身份。

---

## P1：质量与架构优先整改

### TODO 3：恢复前端核心代码的 lint/typecheck 覆盖

**严重程度：P1 / 代码质量风险**

**相关文件：**

- `biome.json:13`
- `apps/web/src/app.tsx:1`
- `apps/web/src/data-hooks.ts:1`
- `apps/web/src/views.tsx:1`
- `apps/web/src/views-admin.tsx:1`
- `apps/web/src/auth.tsx:1`
- `apps/web/src/chrome.tsx:1`
- `apps/web/src/dialogs.tsx:1`
- `apps/web/src/tweaks-panel.tsx:1`

**问题说明：**

`biome.json` 排除了整个前端 TSX：

```json
"!apps/web/src/**/*.tsx"
```

同时多个核心文件使用 `// @ts-nocheck`。这导致：

- 类型错误无法暴露。
- 未使用变量、错误 props、错误字段名不容易被发现。
- 重构缺少安全网。
- `bun run lint` 的结果无法代表真实前端质量。

**整改建议：**

分阶段推进，不要一次性移除所有 `@ts-nocheck`：

1. 先让 Biome 覆盖更小、更容易修的文件。
2. 优先移除小文件的 `@ts-nocheck`：
   - `apps/web/src/url-utils.ts`
   - `apps/web/src/labels.ts`
   - `apps/web/src/api-client.ts`
   - `apps/web/src/data-hooks.ts`
   - `apps/web/src/dialogs.tsx`
3. 再处理中大型组件：
   - `apps/web/src/chrome.tsx`
   - `apps/web/src/auth.tsx`
4. 最后处理大文件：
   - `apps/web/src/views-admin.tsx`
   - `apps/web/src/views.tsx`
   - `apps/web/src/app.tsx`

**验收标准：**

- Biome 不再整体排除 `apps/web/src/**/*.tsx`。
- 至少第一批小文件不再使用 `@ts-nocheck`。
- `bun run typecheck` 和 `bun run lint` 可以稳定执行。

---

### TODO 4：瘦身 `/spaces` 接口，避免返回所有文档 HTML

**严重程度：P1 / 性能与架构风险**

**相关文件：**

- `apps/api/src/routes/spaces.ts:47-62`
- `apps/api/src/routes/spaces.ts:64-86`
- `apps/web/src/data-hooks.ts:24-27`
- `apps/web/src/data-hooks.ts:58-65`

**问题说明：**

`/spaces` 当前返回空间 children，并且对可读文档包含 `html`：

```ts
...toDoc(doc, author, { includeHtml: canRead, canRead })
```

前端把 `/spaces` 当成核心 bootstrap query：

```ts
const spacesQuery = useQuery({
  queryKey: atlasKeys.spaces,
  queryFn: () => apiGet('/spaces'),
});
```

mutation 后又会广泛 invalidation：

```ts
queryClient.invalidateQueries({ queryKey: atlasKeys.spaces })
```

这会导致任何文档/空间变更后，都可能重新拉取所有空间、所有文档元信息以及所有可读 HTML 内容。

**整改建议：**

- `/spaces` 只返回空间和文档轻量元信息，不返回 `html`。
- 文档正文通过 `GET /documents/:id` 按需加载。
- Reader 进入某篇文档时再请求正文。
- mutation 后只 invalidation 相关 query，避免全量刷新。
- 如果需要目录页显示摘要，摘要应来自 `desc` 或专门的 lightweight summary 字段，而不是整篇 HTML。

**验收标准：**

- `/spaces` 响应中不包含文档 `html`。
- Reader 页面仍能正常加载文档正文。
- 创建/更新/删除文档后只刷新必要数据。
- 大文档存在时，打开首页/目录不会传输所有正文。

---

### TODO 5：治理文档列表和空间 children 的 N+1 查询

**严重程度：P1 / 性能风险**

**相关文件：**

- `apps/api/src/routes/documents.ts:55-68`
- `apps/api/src/routes/documents.ts:93-97`
- `apps/api/src/routes/spaces.ts:47-61`
- `apps/api/src/routes/spaces.ts:75-84`
- `apps/api/src/lib/permissions.ts:22-29`
- `apps/api/src/lib/permissions.ts:44-56`
- `apps/api/src/lib/permissions.ts:68-79`

**问题说明：**

`hydrateDoc()` 每条文档额外查询一次 space 和 author：

```ts
async function hydrateDoc(doc: typeof documents.$inferSelect) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, doc.spaceId));
  const [author] = await db.select().from(members).where(eq(members.id, doc.authorId));
  return toDoc({ doc, space, author });
}
```

`/spaces` 构建 children 时也会对每个文档分别查询 author、canRead、canEdit。权限 helper 内部又会查询 space membership 或 document membership。

**整改建议：**

- 文档列表用 join 一次取出 doc + space + author。
- 空间 children 使用批量查询，按 `spaceId` 聚合。
- 对当前用户的 space roles、document members 批量预取成 map。
- 权限判断尽量使用已预取的数据，而不是每条文档都访问 DB。

**验收标准：**

- `/documents` 不再随着文档数量线性增加 author/space 查询次数。
- `/spaces` 不再对每个文档单独查询 author 和权限。
- 数据量增加时，接口耗时增长更平滑。

---

### TODO 6：补充常用查询索引

**严重程度：P1 / 数据库性能风险**

**相关文件：**

- `apps/api/src/db/schema.ts:13-21`
- `apps/api/src/db/schema.ts:32-51`
- `apps/api/src/db/schema.ts:86-104`
- `apps/api/src/db/migrations/0000_illegal_silver_sable.sql`

**问题说明：**

当前 schema 主要有主键和 unique 约束，缺少实际查询路径常用的二级索引。常见过滤和 join 字段包括：

- `documents.spaceId`
- `documents.authorId`
- `documents.visibility`
- `documents.deletedAt`
- `shareLinks.documentId`
- `sessions.expiresAt`
- `auditLogs.actorId`
- `auditLogs.targetId`

**整改建议：**

优先增加：

- `documents.spaceId`
- `documents.deletedAt`
- `documents.visibility`
- `documents.authorId`
- `shareLinks.documentId`
- `sessions.expiresAt`

视查询情况增加复合索引：

- `(spaceId, deletedAt)`
- `(visibility, deletedAt)`
- `(authorId, deletedAt)`

**验收标准：**

- Drizzle schema 中定义索引。
- 生成并应用迁移。
- 常用列表、回收站、分享链接查询可利用索引。

---

## P2：中期优化

### TODO 7：增加空间成员批量权限更新接口

**严重程度：P2 / 性能与一致性风险**

**相关文件：**

- `apps/web/src/views-admin.tsx:747-758`
- `apps/api/src/routes/spaces.ts:171-196`

**问题说明：**

当前前端批量设置空间权限时，会对每个成员发起一次请求：

```ts
targets.forEach(m => setMemberSpaceRole(m.id, space.id, role, { silent: true }));
```

这会导致：

- 成员多时瞬间发出大量 HTTP 请求。
- 部分成功、部分失败的状态难处理。
- 多次缓存刷新。
- 审计日志过于碎片化。

**整改建议：**

- 新增批量接口，例如 `PUT /spaces/:id/members`。
- 请求体示例：

```ts
{
  updates: [
    { memberId: 'm1', role: 'viewer' },
    { memberId: 'm2', role: null }
  ]
}
```

- 后端在事务中完成 delete/insert。
- 前端一次请求、一次 toast、一次 query invalidation。

**验收标准：**

- “全部设为仅读”和“清空”只发一个请求。
- 失败时能整体提示。
- 成功后只刷新相关空间成员数据。

---

### TODO 8：拆分前端大文件，降低维护成本

**严重程度：P2 / 可维护性风险**

**相关文件：**

- `apps/web/src/views-admin.tsx`
- `apps/web/src/views.tsx`
- `apps/web/src/chrome.tsx`
- `apps/web/src/app.tsx`

**问题说明：**

当前多个前端文件过重：

- `views-admin.tsx`：约 984 行
- `views.tsx`：约 862 行
- `chrome.tsx`：约 483 行
- `app.tsx`：约 457 行

尤其 `views-admin.tsx` 同时包含：

- 上传流程
- 文档管理
- 空间权限管理
- 成员行渲染
- 设置 UI
- 批量权限操作

这会增加改动冲突、类型迁移和局部测试难度。

**整改建议：**

优先拆 `views-admin.tsx`：

- `apps/web/src/views-admin/upload-view.tsx`
- `apps/web/src/views-admin/documents-view.tsx`
- `apps/web/src/views-admin/settings-view.tsx`
- `apps/web/src/views-admin/space-permissions.tsx`
- `apps/web/src/views-admin/components/*`

拆分原则：

- 不为了行数强行拆。
- 优先拆职责清晰、props 边界明确的区域。
- 配合移除 `@ts-nocheck`，拆一个 typed 一个。

**验收标准：**

- `views-admin.tsx` 明显瘦身，只保留路由/组合职责。
- 拆出的子组件有明确 props 类型。
- 行为不变，管理页可正常使用。

---

### TODO 9：统一前端颜色、dot、accent 映射

**严重程度：P2 / 一致性与冗余问题**

**相关文件：**

- `apps/web/src/views.tsx:15-20`
- `apps/web/src/views-admin.tsx:13-18`
- `apps/web/src/chrome.tsx:329`
- `apps/web/src/views-admin.tsx:745`

**问题说明：**

存在多个相似但不完全统一的映射逻辑：

- `dotClass`
- `dotClass2`
- `SPACE_COLOR_MAP`
- accent 颜色映射

命名如 `dotClass2` 明显是迁移/临时痕迹，后续容易产生 UI 漂移。

**整改建议：**

- 新建前端内部主题 token 文件，例如 `apps/web/src/theme-tokens.ts`。
- 集中维护 dot/accent/color 映射。
- 统一命名，删除 `dotClass2` 这类临时命名。
- 暂不建议放入 `packages/shared`，除非 API 也需要这些 UI token。

**验收标准：**

- dot/accent 映射只有一个来源。
- 文档卡片、sidebar、admin settings 使用同一套映射。
- 删除重复函数。

---

### TODO 10：统一默认 `skillVersion`

**严重程度：P2 / 冗余与一致性问题**

**相关文件：**

- `apps/api/src/db/schema.ts:46`
- `apps/api/src/routes/documents.ts:149`
- `apps/api/src/routes/documents.ts:199`
- `apps/api/src/db/seed.ts:100`

**问题说明：**

默认值 `'1.2.4'` 在多个地方重复出现：

- 数据库 schema 默认值
- 创建文档接口
- 上传文档接口
- seed 数据

后续升级 sanitize/skill 版本时，容易漏改。

**整改建议：**

- 提取 `DEFAULT_SKILL_VERSION = '1.2.4'`。
- 创建/上传/seed 使用同一常量。
- 数据库默认值如果保留，需要明确它只是兜底；业务创建逻辑以常量为准。

**验收标准：**

- 业务代码中不再散落硬编码 `'1.2.4'`。
- 更新默认版本只需要改一个地方。

---

## P3：低优先级清理与体验优化

### TODO 11：移除 chrome 自动隐藏逻辑中的持续 DOM 扫描

**严重程度：P3 / 前端效率与可维护性问题**

**相关文件：**

- `apps/web/src/app.tsx:141-199`
- `apps/web/src/app.tsx:173-186`

**问题说明：**

当前自动隐藏逻辑每 500ms 扫描 DOM 并重新绑定滚动监听：

```ts
const attachTimer = setInterval(attachScroll, 500);
```

内部使用多个 `document.querySelectorAll(...)`。这是原型期常见方案，但长期运行不够优雅，也增加维护成本。

**整改建议：**

- 用 React ref 管理滚动容器。
- 或在对应 scroll container 组件上直接绑定 `onScroll`。
- 对 iframe scroll 监听单独封装，避免重复绑定。
- 至少去掉全局 500ms interval。

**验收标准：**

- 页面空闲时不再持续扫描 DOM。
- 切换视图后 chrome auto-hide 行为保持正常。
- 滚动时仍能立即隐藏 chrome。

---

### TODO 12：优化 DockItem 的持续 `requestAnimationFrame`

**严重程度：P3 / 前端效率问题**

**相关文件：**

- `apps/web/src/app.tsx:401-411`

**问题说明：**

`DockItem` 中 hover 放大效果使用持续 `requestAnimationFrame` 循环。即使 dock idle，也会产生不必要的帧回调。

**整改建议：**

- 只在鼠标进入 dock 区域时启动 rAF。
- 鼠标离开后 cancel rAF。
- 或改用 CSS transition / transform 实现 hover magnify。

**验收标准：**

- dock idle 时没有持续 rAF。
- hover 放大效果视觉不回退。

---

### TODO 13：优化分享弹窗的成员列表加载方式

**严重程度：P3 / 扩展性问题**

**相关文件：**

- `apps/api/src/routes/documents.ts:339-379`
- `apps/web/src/dialogs.tsx:177-188`

**问题说明：**

打开分享弹窗会加载：

- 当前分享链接
- 当前文档成员 roster
- 所有成员 `availableMembers`

小团队可以接受，但成员数增大后会变重。

**整改建议：**

- 如果成员规模可能变大，改为搜索式添加成员。
- 或对 `availableMembers` 做分页/懒加载。
- 当前阶段可先保留，但要标记为扩展性隐患。

**验收标准：**

- 大成员列表下分享弹窗不会一次拉取全部成员。
- 添加成员体验仍然顺畅。

---

### TODO 14：清理 Biome 历史遗留排除项

**严重程度：P3 / 工程卫生问题**

**相关文件：**

- `biome.json:10-11`

**问题说明：**

当前 Biome 配置排除了不存在的历史文件：

```json
"!src/data.js",
"!tweaks-panel.jsx"
```

看起来是早期原型迁移遗留。

**整改建议：**

- 删除不存在文件的 exclude。
- 重新检查所有 `files.includes` 排除项。
- 每个排除项都应有明确原因。

**验收标准：**

- Biome 配置不包含无效历史路径。
- 排除项数量减少，含义清晰。

---

### TODO 15：统一 public share URL 来源

**严重程度：P3 / 一致性问题**

**相关文件：**

- `apps/api/src/routes/documents.ts:351-357`
- `apps/web/src/url-utils.ts:7-8`

**问题说明：**

API 返回 public share URL：

```ts
url: `/public/${link.token}`
```

前端又构造另一套路径：

```ts
/share/:token
```

当前前端可能忽略 API 返回的 URL，但这形成了两个来源，容易漂移。

**整改建议：**

- 明确最终分享 URL 规范：`/public/:token` 还是 `/share/:token`。
- API 和前端只保留一个来源。
- 如果 API 返回 URL，前端应直接使用；如果前端负责路由生成，API 只返回 token。

**验收标准：**

- 分享链接路径只有一个规范。
- 复制链接、打开公开页、API 返回值三者一致。

---

### TODO 16：检查构建产物和 SQLite 文件是否应被 git 跟踪

**严重程度：P3 / 仓库卫生问题**

**发现文件：**

- `apps/api/dist/server.js`
- `apps/web/dist/index.html`
- `apps/web/dist/embedded-sample.html`
- `apps/api/data/atlas.sqlite`
- `apps/api/data/atlas.sqlite-shm`
- `apps/api/data/atlas.sqlite-wal`

**问题说明：**

这些文件位于工作区内。当前审查未确认它们是否被 git 跟踪。如果已被跟踪，需要判断是否符合项目预期。

通常：

- `dist` 构建产物不应提交，除非项目有明确发布策略。
- SQLite 本地数据库通常不应提交。
- SQLite `-wal` / `-shm` 文件通常更不应提交。

**整改建议：**

- 使用 `git ls-files` 确认这些文件是否被跟踪。
- 如为本地运行产物，加入 `.gitignore`。
- 如为 demo 数据，改用明确命名并加说明。

**验收标准：**

- 仓库不跟踪无必要的本地构建产物和运行时数据库文件。
- `.gitignore` 覆盖 dist、SQLite WAL/SHM 等本地文件。

---

## 建议整改顺序

1. 保留匿名上锁目录体验，同时收紧 `/spaces` 对未登录用户返回的非公开文档字段。
2. 修复 `/documents/:id/share` 文档存在性泄漏问题。
3. 逐步恢复前端 lint/typecheck 覆盖。
4. 瘦身 `/spaces`，移除 HTML bootstrap。
5. 治理文档/空间接口 N+1 查询。
6. 添加关键数据库索引。
7. 增加空间成员批量权限更新接口。
8. 拆分 `views-admin.tsx` 等大文件。
9. 统一颜色映射、`skillVersion` 默认值和分享 URL。
10. 清理 DOM 扫描、idle rAF、Biome 历史 exclude、dist/sqlite 文件。

---

## 后续执行建议

建议每次只处理一类问题，避免大范围改动互相干扰：

- 安全修复单独提交。
- `/spaces` 响应结构变更单独提交。
- 类型检查恢复分批提交。
- DB 索引和迁移单独提交。
- 前端拆文件尽量保持行为不变，单独提交。

每个 TODO 完成后建议至少运行：

```bash
bun run typecheck
bun run lint
bun run test
```

涉及前端 UI 的改动还应启动应用手动验证主要路径。
