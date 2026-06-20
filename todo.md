# Atlas 项目代码审查 TODO

> 生成日期：2026-05-27
> 复核日期：2026-05-29（逐项核对源码，更正 TODO 22 的错误前提，补充 TODO 4/12 的实际现状，详见各条内标注）
> 范围：`apps/api`、`apps/web`、`packages/shared`、根配置文件
> 目标：记录当前项目中的冗余、规范、权限、性能和架构合理性问题，便于后续逐项整改。
>
> 复核结论：TODO 1–21 的描述与当前源码一致，定级合理。主要更正集中在 TODO 22（fixtures 仍是 API seed 的数据源，不能直接删）。TODO 4 收尾后，`bun run typecheck`、`bun run lint`（0 error / 249 a11y warning）、`bun run test`（13 pass）当前均通过。

## 总体结论

当前项目整体结构清晰，属于 Bun + TypeScript monorepo：

- `apps/api`：后端 API、SQLite/Drizzle、权限、审计、文档管理。
- `apps/web`：React/Vite 前端。
- `packages/shared`：共享 schema、类型和 HTML metadata 工具。

项目方向是合理的，但仍处在“原型迁移到产品化”的中间状态：

- 后端结构相对清楚，但存在权限边界过宽、N+1 查询、认证生产化配置不足等问题（部分高危项已在 TODO 1/2/3/7/8 中完成）。
- TODO 3 已选择“承认不做服务端 sanitize，sandbox iframe 为唯一隔离边界”：`sanitize-html`、`skill_versions`、`/skills` 与 `skillVersion` 字段均已移除。
- TODO 4 已恢复前端核心 TSX 的 lint/typecheck 覆盖，`@ts-nocheck` 已清零；a11y 存量问题以 warning 保留。
- `/spaces` 接口承担了空间目录、文档列表和文档正文 bootstrap 的职责，负载过重。
- 前端有大文件、重复色映射、持续 DOM 扫描和 idle `requestAnimationFrame` 等可维护性与效率问题。
- `packages/shared/src/fixtures.ts`：旧原型静态数据与当前 seed/API 数据并存，已在 TODO 22 单独列出。

---

## P0：必须优先修复

### TODO 1：保留匿名可见上锁目录，但修复目录响应字段过度暴露 ✅ 已解决

**状态：已完成（2026-05-29）**

**方案与现状：**

`/spaces` 继续保留匿名可见所有未删除目录文档入口的产品体验，但对不可读文档改为返回 locked 最小 DTO：仅包含 `id`、`spaceId`、`title`、`locked: true`、`canRead: false`、`canEdit: false`。不可读文档不再返回 `html`、`desc`、`author`、`authorName`、`updated`、`visibility`、`tags`、`deletedAt` 等元信息；可读 public 文档仍返回正文。前端改为优先使用服务端 `canRead` / `locked` 渲染锁定态，Reader、空间卡片和 CmdK 均兼容 minimized locked 文档。API 测试已覆盖匿名 public/locked 响应字段边界。

**严重程度：P0 / 权限边界与信息暴露风险**

**相关文件：**

- `apps/api/src/lib/permissions.ts:175-185`
- `apps/api/src/routes/spaces.ts:25-46`
- `apps/api/src/routes/spaces.ts:48-63`

**问题说明：**

产品需求是：未登录用户可以看到所有目录，目录呈现上锁状态；点击上锁目录或文档时，右侧展示“请登录”页面；登录后再按权限展示对应内容。

因此问题不是“匿名用户绝对不能看到目录”，而是当前 `/spaces` 给匿名用户返回的非公开文档字段过多。`listDirectoryDocuments()` 对匿名用户返回所有未删除文档：

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

随后 `toDoc()` 会把非公开文档的元信息一并返回。匿名用户当前会拿到：

- 文档 ID、空间 ID
- 标题、描述
- 作者 ID、作者名
- 更新时间
- 可见性
- 标签
- dot（颜色标记）
- skillVersion
- deletedAt

`html` 因为 `canRead === false` 不会泄露，但其它字段明显超出了“可发现的上锁目录”所需要的最小信息。

**整改建议：**

- 保留匿名用户可见所有空间/目录的能力，用于实现“上锁目录”体验。
- 对匿名用户返回专用的 locked directory DTO，不复用完整 `toDoc()` 输出。
- 匿名可返回字段建议限制为：
  - `id`
  - `spaceId`
  - `title`：仅当产品明确允许访客看到真实标题时返回；否则返回统一文案，例如 `登录后查看`
  - `locked: true`、`canRead: false`、`canEdit: false`
- 匿名不应返回：`desc`、`author`、`authorName`、`updated`、`tags`、`visibility`、`skillVersion`、`deletedAt`。
- 前端点击 locked 文档时，根据 `canRead: false` / `locked: true` 展示“请登录后查看内容”，不去请求或渲染正文。
- 登录用户按现有权限规则展示：public 可读；invite 由空间/文档成员可读；private 仅作者或 admin 可读。
- 为匿名访问 `/spaces` 增加测试，覆盖 public/invite/private 三类文档，以及未登录、已登录无权限、已登录有权限三类访问场景。

**验收标准：**

- 未登录请求 `/spaces` 时能看到所有空间/目录，并能区分 locked 状态。
- 未登录用户拿不到非公开文档的正文。
- 未登录用户拿不到非公开文档的描述、作者、更新时间、标签、skillVersion 等元信息。
- 登录后按用户权限展示对应内容。

---

### TODO 2：修复 `GET /documents/:id/share` 文档存在性泄漏 ✅ 已解决

**状态：已完成（2026-05-29）**

**方案与现状：**

新增分享管理权限统一入口：只有 workspace admin 和文档作者可以读取或修改分享设置；文档不存在、已删除、未登录或已登录但无分享管理权限时，`GET /documents/:id/share` 与 `PATCH /documents/:id/share` 均统一返回 `404`，避免通过状态码或 empty share state 探测文档是否存在。作者和 admin 的分享读取/修改流程保持正常。测试已覆盖匿名、空间成员/可读非作者、作者、admin 的主要分支。

**严重程度：P0 / 安全风险**

**相关文件：**

- `apps/api/src/routes/documents.ts:330-338`
- `apps/api/src/server.test.ts:364-367`

**问题说明：**

当前接口在文档不存在时返回 `404`，在文档存在但用户无管理权限时返回 `200 + emptyShareState`：

```ts
const [doc] = await db.select().from(documents).where(...);
if (!doc) throw notFound();
const canManage = canManageDocumentShare(user, doc);
if (!canManage) return c.json(emptyShareState(doc.id));
```

这允许未授权调用者根据状态码区分“文档 ID 是否存在”。`PATCH /documents/:id/share` 已经对非作者/admin 返回 403，但 `GET` 路径与之不一致。

**整改建议：**

- 把分享管理接口收紧到只允许有管理权限的用户访问；无权限时统一返回 `404`，避免存在性探测。
- 更新现有测试（“访客获取分享 → 200 + canManage=false”）的断言。
- `GET` 和 `PATCH` 的权限语义保持一致。

**验收标准：**

- 未授权用户访问“存在文档”和“不存在文档”时响应不可区分。
- 作者 / admin 仍能正常读取分享设置。
- 测试覆盖匿名、空间成员、作者、admin 四类身份。

---

### TODO 3：实装 HTML 入库 sanitization（或移除 sanitize-html / skill 版本概念）✅ 已解决

**状态：已完成（2026-05-29）—— 采用选项 2（承认不做服务端 sanitize，明确 sandbox iframe 为唯一隔离边界）**

**方案与现状：**

考虑到产品本质是「隔离展示外部生成的交互式 HTML」（iframe 故意开启 `allow-scripts`，文档需要运行自身脚本），真正接入 sanitize-html 的严格白名单会剥离脚本、破坏核心体验，因此选择选项 2 删除整套「看似有清洗」的死代码：

- **删除死依赖**：从 `apps/api/package.json` 移除 `sanitize-html` 与 `@types/sanitize-html`，并更新 `bun.lock`（已确认 lockfile 不再含 sanitize-html）。
- **删除 skill 模块死功能**：删掉 `skill_versions` 表、`/skills` 路由（`routes/skills.ts`）、`documents.skill_version` 列、`CreateSkillVersionSchema`、前端 `SkillsPane` + 设置导航项 + `activateSkill` mutation + `atlasKeys.skills`，以及 seed.ts 中的 skillVersions 数据和各处 `skillVersion` 字段。生成并应用增量迁移 `0003_calm_sinister_six.sql`（DROP TABLE skill_versions + DROP COLUMN skill_version）。
- **消除误导命名**：`lib/sanitize.ts` → `lib/html-limits.ts`，`validateHtmlForStorage` 保留（它只做 8 MB 大小校验，是真实行为），并加注释说明 Atlas 不做服务端清洗、sandbox iframe 是唯一隔离边界。
- **收紧 sandbox**：四处渲染 iframe 的 sandbox 去掉 `allow-popups-to-escape-sandbox`，改为 `allow-scripts allow-forms allow-popups`（弹窗不再逃出沙箱）。
- **写入 README**：明确文档正文不做服务端 sanitize、sandbox iframe（无 `allow-same-origin`）是唯一隔离边界，并移除 README 中的 `/skills` API 行与 `sanitize`/`skills` 路径引用。

解决的问题：消除了「声明 sanitize 依赖但从不调用」「skill_versions 名义跟踪 sanitize 版本却无任何效果」的死代码与误导；隔离边界的真实假设被显式记录；并顺手收紧了会逃逸沙箱的弹窗权限。`bun run typecheck` 全绿、13 个 API 测试通过、改动文件 Biome 无新增告警（剩余 lint red 为 TODO 4 已记录的 TSX 存量问题）。

**严重程度：P0 / 安全风险 + 死代码**

**相关文件：**

- `apps/api/src/lib/sanitize.ts:1-12`
- `apps/api/package.json:20`（`sanitize-html`）与 `apps/api/package.json:25`（`@types/sanitize-html`）
- `apps/api/src/db/schema.ts:107-117`（`skillVersions` 表）
- `apps/api/src/routes/skills.ts`
- `apps/api/src/routes/documents.ts:137,188,232`
- `apps/web/src/views-admin.tsx:192`（admin preview iframe sandbox）
- `apps/web/src/views.tsx:133,207,834`（Reader/Public/Editor iframe sandbox）

**问题说明：**

- `apps/api/package.json` 声明了 `sanitize-html` 和 `@types/sanitize-html`，但全项目没有任何文件 `import 'sanitize-html'`。
- `validateHtmlForStorage` 只做大小限制，名字误导，没有任何 sanitize 行为。
- `skill_versions` 表存在 `name: 'sanitize-html'` 默认值和 `active: true` 标志，但激活某个 skill 版本对存储或渲染没有任何实际影响。这是死功能。
- 文档正文以 `srcDoc` 注入 iframe，sandbox 是 `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox`。因为没有 `allow-same-origin`，iframe 拿不到父页 cookie/localStorage，这是主要的隔离边界；但仍然存在钓鱼内容风险，且 `allow-popups-to-escape-sandbox` 会让 iframe 弹出的窗口逃出沙箱。
- 任何拥有空间 editor 角色的用户都能上传未经清洗的 HTML，进入数据库后被其他成员渲染。

**整改建议（任选其一）：**

1. **真正接入 sanitize-html**：在 `validateHtmlForStorage` 中调用 `sanitize-html`，定义统一的白名单，把当前激活的 `skill_versions.version` 作为版本标识写入文档；并考虑去掉或收紧 `allow-popups-to-escape-sandbox`。
2. **承认目前不做服务端 sanitize**：删除 `sanitize-html` / `@types/sanitize-html` 依赖、删除 `skill_versions` 表与 `/skills` 路由、删除 `documents.skillVersion` 列与默认值，明确把 sandbox iframe 作为唯一隔离边界，并把这一假设写进 README。

不要同时保留“看起来有清洗”和“实际没有清洗”的状态。

**验收标准：**

- `sanitize-html` 依赖要么被真正使用，要么从 `package.json` 移除。
- `skill_versions` 表要么真正参与到正文清洗，要么彻底删除，不在 schema、路由、UI 中保留死代码。
- README 中明确文档正文的清洗 / 隔离边界。

---

## P1：质量与架构优先整改

### TODO 4：恢复前端核心代码的 lint/typecheck 覆盖 ✅ 已解决

**状态：已完成（2026-05-29，全部阶段收尾）**

**方案与现状：**

阶段一+二（已完成）：移除 `biome.json` 中的 `!apps/web/src/**/*.tsx`、`!src/data.js`、`!tweaks-panel.jsx` 三个历史排除，让 TSX 进入 lint 范围；修复后端 lint red；移除 `data-hooks.ts` 的 `@ts-nocheck` 并补全类型。

阶段三（本次收尾）：

- **移除全部 `@ts-nocheck`**：`app.tsx`、`auth.tsx`、`chrome.tsx`、`dialogs.tsx`、`tweaks-panel.tsx`、`views.tsx`、`views-admin.tsx` 七个核心 TSX 的文件级 `@ts-nocheck` 已全部删除，配合新增的 `apps/web/src/loose-types.ts`（`Loose`/`RouteState`/`Toast` 等过渡类型）。全仓 `@ts-nocheck` 计数归零，`bun run typecheck` 全绿。
- **逐项修复真实类型错误（54 → 0）**：常见模式——`e.target` 改 `e.currentTarget`（scroll 容器）、为 icon map 函数标注 `IconProps`、给颜色/权限 map 加 `Record<string,string>` 索引签名、`view` 兜底默认值、CSS 自定义属性 `as React.CSSProperties`、`raf`/`patch`/`saveDoc` 参数补类型等。
- **修复真实 lint correctness/suspicious 问题（~18 处）**：未使用解构参数加 `_` 前缀、`forEach` 回调补花括号消除隐式返回（`useIterableCallbackReturn`）、`noArrayIndexKey` 改用稳定 key（行号 gutter 用 `biome-ignore` 说明 index 即身份）、删除死组件 `_PermRow`（`useHookAtTopLevel`）、编辑器快捷键用 `saveRef` 让 effect 只绑定一次（`useExhaustiveDependencies`）、`catch (error: Loose)` 改 `unknown`。
- **a11y 规则降级为 warning**：原型期 TSX 存在 ~249 处 a11y markup 问题（`useButtonType`、`noSvgWithoutTitle`、`useKeyWithClickEvents`、`noLabelWithoutControl` 等）。在 `biome.json` 把这 7 条 a11y 规则设为 `warn`：`bun run lint` 现在 exit 0（绿），但真实 a11y 信号仍以 warning 形式保留，便于后续随拆文件（TODO 14）逐步消化，不阻塞 CI。

解决的问题：前端核心代码重新纳入类型与 lint 安全网——`bun run typecheck` 绿、`bun run lint` 绿（0 error / 249 a11y warning）、13 个 API 测试通过。重构不再处于「无类型、无 lint」的盲区。

**严重程度：P1 / 代码质量风险**

**相关文件：**

- `biome.json:14`（`!apps/web/src/**/*.tsx`）
- 仍使用 `// @ts-nocheck` 的文件：
  - `apps/web/src/app.tsx:1`
  - `apps/web/src/auth.tsx:1`
  - `apps/web/src/chrome.tsx:1`
  - `apps/web/src/data-hooks.ts:1`
  - `apps/web/src/dialogs.tsx:1`
  - `apps/web/src/tweaks-panel.tsx:1`
  - `apps/web/src/views.tsx:1`
  - `apps/web/src/views-admin.tsx:1`
- 已经是 typed 的 ts / tsx：`api-client.ts`、`labels.ts`、`url-utils.ts`、`main.tsx`、`vite-env.d.ts`

**问题说明：**

`biome.json` 整体排除了 `apps/web/src/**/*.tsx`，再叠加 `@ts-nocheck`，等价于前端核心代码不参与类型与 lint 检查。重构没有安全网。

**补充（2026-05-29 复核）：** 当前 `bun run typecheck` 与 `bun run test` 均通过（typecheck 通过本身就是因为上述排除 + `@ts-nocheck`，并非真的“干净”），但 **`bun run lint` 现在就是失败的**：

- `apps/api/src/server.test.ts:347,370`：2 处 formatter 错误（单行 `request(...)` 超出 100 列未折行）。
- `apps/api/src/routes/spaces.ts:18`：`listReadableDocuments` 为未使用 import（`lint/correctness/noUnusedImports` 警告，FIXABLE）。spaces.ts 实际只用到 `listDirectoryDocuments`。

也就是说后端代码已经在 lint 范围内，但 lint 本身处于 red 状态。恢复前端覆盖之前，应先让现有后端的 lint/format 回到 green（`bun run fmt` 可修 formatter，移除 spaces.ts 的未使用 import 可清掉警告）。

**整改建议：**

分阶段推进：

1. 让 Biome 不再整体排除 `apps/web/src/**/*.tsx`，先允许 lint 报告所有现存问题。
2. 优先移除较小文件的 `@ts-nocheck`：
   - `apps/web/src/data-hooks.ts`（220 行）
   - `apps/web/src/tweaks-panel.tsx`（579 行）
3. 中型：`apps/web/src/chrome.tsx`（431 行）、`apps/web/src/auth.tsx`（518 行）、`apps/web/src/dialogs.tsx`（548 行）。
4. 大型：`apps/web/src/app.tsx`（482 行）、`apps/web/src/views.tsx`（861 行）、`apps/web/src/views-admin.tsx`（983 行）。

**验收标准：**

- `biome.json` 不再整体排除 `apps/web/src/**/*.tsx`。
- 至少 `data-hooks.ts` 不再使用 `@ts-nocheck`。
- `bun run typecheck` 和 `bun run lint` 在 CI 上稳定执行并能体现真实状况。

---

### TODO 5：瘦身 `/spaces` 接口，避免返回所有文档 HTML ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

`/spaces` 现在只返回空间和文档目录元信息；所有 children（包括 public 可读文档）都不再包含 `html`，locked 文档继续使用最小 DTO。Reader 和后台 HTML 编辑器改为在确需正文时通过 `GET /documents/:id` 按需加载；`GET /documents` 列表也改为轻量响应。文档更新会刷新对应 detail query，只有目录元信息可能变化时才刷新 `/spaces`，避免纯正文保存触发全量目录重拉。

**相关文件：**

- `apps/api/src/routes/spaces.ts:48-63`
- `apps/api/src/routes/spaces.ts:66-87`
- `apps/web/src/data-hooks.ts:25-28`
- `apps/web/src/data-hooks.ts:59-67`

**问题说明：**

`/spaces` 当前对每个可读文档包含 `html`：

```ts
...toDoc(doc, author, { includeHtml: canRead, canRead })
```

前端把 `/spaces` 当作核心 bootstrap query，并且每次 mutation 都广泛 invalidate：

```ts
queryClient.invalidateQueries({ queryKey: atlasKeys.spaces })
```

任何文档/空间/权限变更后都会重新拉所有可读文档的完整 HTML，规模一上去就会变得非常昂贵。

**整改建议：**

- `/spaces` 只返回空间和文档轻量元信息，不返回 `html`。
- 文档正文通过 `GET /documents/:id` 按需加载（Reader 进入文档时再请求）。
- mutation 后只 invalidate 真正受影响的 query，避免全量刷新（例如修改文档不必 invalidate spaces）。
- 如果目录页需要摘要，用 `desc` 或轻量 summary 字段。

**验收标准：**

- `/spaces` 响应中不包含文档 `html`。
- Reader 仍能正常加载正文。
- 创建/更新/删除文档后只刷新必要数据。
- 大文档下打开首页/目录不会传输所有正文。

---

### TODO 6：治理文档列表与空间 children 的 N+1 查询 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

新增 `PermissionLookup` 批量预取当前用户的空间成员与文档成员角色，并提供同步权限判断 helper；`/spaces` 一次性加载目录文档、批量加载作者、按 `spaceId` 分组后在内存中组装 children；`/documents` 列表批量加载 space/author 并复用权限 lookup 计算 `canEdit`。解决了原先每个 space/doc 单独查 author、space role、document member 的 N+1 问题，同时保留匿名 locked 目录体验和既有权限语义。

**严重程度：P1 / 性能风险**

**相关文件：**

- `apps/api/src/routes/documents.ts:56-69`（`hydrateDoc`）
- `apps/api/src/routes/documents.ts:93-99`（`GET /documents`）
- `apps/api/src/routes/spaces.ts:48-63`（`childrenForSpace`）
- `apps/api/src/routes/spaces.ts:76-86`
- `apps/api/src/lib/permissions.ts:23-31`（`getSpaceRole`）
- `apps/api/src/lib/permissions.ts:45-58`（`canReadDocument`）
- `apps/api/src/lib/permissions.ts:69-81`（`canEditDocument`）

**问题说明：**

- `hydrateDoc` 每条文档再查一次 space 和 author。
- `childrenForSpace` 对每条文档再查 author，并分别调用 `canReadDocument` / `canEditDocument`，每个调用内部又会查 `spaceMembers` / `documentMembers`。
- `GET /documents/trash` 已经用了一次 join，但 `GET /documents` 仍然是“先 list 再每个 hydrate”。
- `GET /spaces` 在外层还会先 `listReadableSpaces` 再 `listDirectoryDocuments`，对每个 space 重复跑一次。

**整改建议：**

- 用 join（参考 `/documents/trash` 的写法）一次性取出 doc + space + author。
- 空间 children 用批量查询，按 `spaceId` 聚合后再分组。
- 把当前用户的 `spaceMembers` 和 `documentMembers` 一次性预取成 `Map`，权限判断在内存里完成。
- 调整 `canReadDocument` / `canEditDocument` 为接收预取数据的同步版本（保留 async 版本兜底）。

**验收标准：**

- `/documents` 不再随着文档数量线性增加 author/space 查询次数。
- `/spaces` 不再对每个文档单独查询 author 和权限。
- 数据量增加时接口耗时增长更平滑。

---

### TODO 7：补充常用查询索引 ✅ 已解决

**状态：已完成（2026-05-29）**

在 `apps/api/src/db/schema.ts` 中为所有高频字段添加了 Drizzle `index()`：
- `documents`：`spaceId`、`authorId`、`visibility`、`deletedAt`，及复合索引 `(spaceId, deletedAt)`、`(visibility, deletedAt)`、`(authorId, deletedAt)`
- `sessions`：`memberId`、`expiresAt`
- `shareLinks`：`documentId`
- `auditLogs`：`actorId`、`targetId`

生成并应用了增量迁移 `0002_rare_sandman.sql`（纯 CREATE INDEX，不改既有表结构）。所有 13 个 API 测试仍通过。

**严重程度：P1 / 数据库性能风险**

**相关文件：**

- `apps/api/src/db/schema.ts:33-52`
- `apps/api/src/db/schema.ts:14-22`
- `apps/api/src/db/schema.ts:87-105`
- `apps/api/src/db/schema.ts:119-127`
- `apps/api/src/db/migrations/0000_illegal_silver_sable.sql`

**问题说明：**

当前 schema 只有主键和 unique 约束，没有为下列高频过滤/join 字段建索引：

- `documents.spaceId`
- `documents.authorId`
- `documents.visibility`
- `documents.deletedAt`
- `shareLinks.documentId`
- `sessions.expiresAt`
- `sessions.memberId`
- `auditLogs.actorId`
- `auditLogs.targetId`

**整改建议：**

优先增加：

- `documents.spaceId`、`documents.deletedAt`、`documents.visibility`、`documents.authorId`
- `shareLinks.documentId`
- `sessions.expiresAt`、`sessions.memberId`

视实际查询计划增加复合索引：

- `(spaceId, deletedAt)`、`(visibility, deletedAt)`、`(authorId, deletedAt)`

**验收标准：**

- Drizzle schema 中定义索引并生成迁移；如果迁移已在环境中应用，提供增量迁移而不是直接改旧迁移。
- 文档列表、回收站、分享链接、会话校验查询能利用到索引。

---

### TODO 8：`purge-expired` 在 SQL 中过滤，而不是先 load all 再 in-memory filter ✅ 已解决

**状态：已完成（2026-05-29）**

重写 `apps/api/src/routes/documents.ts` 中的 `POST /trash/purge-expired` 处理逻辑：
- 先用 `SELECT { id }` + `lte(documents.purgeAfter, now)` 在 SQL 层过滤，只取 id，不再把含 html 字段的完整行加载到内存。
- 再用一次 `DELETE ... WHERE` 同条件批量删除，替代原来的 N 次循环 delete。
- 利用了 TODO 7 新增的 `documents_deleted_at_idx` 索引加速过滤。

**严重程度：P1 / 性能与正确性风险**

**相关文件：**

- `apps/api/src/routes/documents.ts:307-329`

**问题说明：**

```ts
const expired = await db
  .select()
  .from(documents)
  .where(and(isNotNull(documents.deletedAt), isNotNull(documents.purgeAfter)));
const toPurge = expired.filter(
  (doc) => doc.purgeAfter && new Date(doc.purgeAfter).getTime() <= new Date(now).getTime(),
);
for (const doc of toPurge) {
  await db.delete(documents).where(eq(documents.id, doc.id));
}
```

把所有回收站文档（含 HTML 字段）加载到内存里再判断，浪费带宽并且不必要地保持长事务窗口。再加上 N 次 delete，没有索引时尤其慢。

**整改建议：**

- 直接在 WHERE 子句里做 `purgeAfter <= now` 比较（SQLite 字符串 ISO-8601 时间是 lexicographically 可比的）。
- 用一次 `DELETE ... WHERE` 完成清理，避免 N 次往返。
- 配合 TODO 7 的 `documents.deletedAt` 索引。

---

### TODO 9：客户端 `canRead` 与服务端权限规则不一致 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

`/spaces`、`GET /documents`、`GET /documents/:id` 都返回服务端计算的 `canRead`；前端 `canRead()` 保留函数名但移除 invite/admin/author 的本地推断，改为只信任服务端 `doc.canRead`，缺失时 fail closed。解决了登录用户被客户端误判为可读所有 invite 文档的问题，Reader 只有在目录 DTO 标记可读时才会请求正文。

**严重程度：P1 / 一致性与体验风险**

**相关文件：**

- `apps/web/src/auth.tsx:46-53`
- `apps/api/src/lib/permissions.ts:45-58`

**问题说明：**

```ts
// apps/web/src/auth.tsx
export function canRead(doc, user) {
  if (!doc) return true;
  if (doc.visibility === 'public') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (doc.author === user.id) return true;
  return doc.visibility === 'invite';
}
```

`invite` 文档只要登录就返回 `true`，但服务端 `canReadDocument` 真正要求空间成员或文档成员。所以登录用户在没有权限的情况下，UI 也会先尝试展示正文，再因为后端拒绝才回退。属于客户端/服务端逻辑漂移。

**整改建议：**

- 让 `/spaces` 和 `/documents` 返回的每条文档都带 `canRead`（服务端已经在 `/spaces` 的 children 里给了 `canRead`，但 `/documents` 没给）。
- 前端不再本地判断，统一使用服务端给的 `canRead`。
- 删除 `auth.tsx:canRead`，或者保留一个明确叫 `isPubliclyReadable` 的纯展示函数，不要再叫 `canRead`。

---

### TODO 10：移除/封装演示账号一键切换 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

前端 demo 账号列表、固定演示密码和一键填充/切换入口已封装到 `import.meta.env.DEV` 分支：本地 `bun dev` 仍保留便捷体验；生产构建中账号数组为空，登录页不渲染 DEMO 账号区，用户菜单不渲染“切换账号”，`switchTo` 也会直接拒绝。README 已明确 seed 账号/固定密码是公开开发演示数据，不能作为生产初始化或真实成员账号使用。解决的问题：生产 bundle 不再包含 `atlas-demo-password`，也不再暴露前端一键 demo 登录入口；seed 的固定密码风险被限定并写入文档边界。

**严重程度：P1 / 安全风险**

**相关文件：**

- `apps/web/src/auth.tsx:6-12`
- `apps/api/src/db/seed.ts:14`（`DEMO_PASSWORD_HASH`）

**问题说明：**

`auth.tsx` 硬编码了演示账号列表和密码：

```ts
const DEMO_PASSWORD = 'atlas-demo-password';
const DEMO_LOGIN_ACCOUNTS = [
  { id: 'u1', email: 'lin@atlas.team', ... },
  ...
];
```

`switchTo` 会直接用这个密码替成员登录。Seed 数据也用同一个 bcrypt hash。这意味着只要部署中保留 seed 数据，任何看到前端代码的人都能用这些账号登录。这是一个明确的生产隐患。

**整改建议：**

- 把 demo 切换功能限制在 `import.meta.env.DEV`，构建后从 bundle 中剔除；或改成只能在管理员账号下使用、且后端有专门接口而不是用真实密码。
- Seed 数据中不要为所有成员复用同一个密码 hash，至少给每个 demo 账号不同密码；或在 README 中标注 seed 只能用于开发/演示。
- 在 README 中明确：默认 seed 出来的所有账号密码都是公开的。

---

### TODO 11：`GET /skills` 缺少 auth 检查（如果保留该功能）✅ 已解决

**状态：已完成（2026-05-31）—— 随 TODO 3 删除 `/skills` 模块自然消解**

**方案与现状：**

TODO 3 已选择选项 2：删除整套 skill/sanitize 版本概念。当前源码中已不存在 `routes/skills.ts`、`skillsRouter` 挂载、`skillVersions` 表、`/skills` 前端入口或 `skillVersion` 业务字段。由于 `GET /skills` 接口本身已经删除，原先“未登录也能列出所有 skill 版本、note、createdBy”的暴露面不再存在。

**复核（2026-05-31）：**

- `apps/api/src/server.ts` 只挂载 `/auth`、`/spaces`、`/documents`、`/members`，不再挂载 `/skills`。
- `apps/api/src/db/schema.ts` 不再定义 `skillVersions`，`documents` 也不再包含 `skillVersion` 字段。
- 全仓运行时源码搜索 `skillsRouter` / `routes/skills` / `skillVersions` / `skillVersion` / `/skills` / `sanitize-html` 均无命中；仅旧迁移快照仍保留历史建表记录，属于迁移历史，不是当前接口暴露面。

**严重程度：P1 / 信息泄露**

**相关文件：**

- `apps/api/src/routes/skills.ts:13-17`

**问题说明：**

```ts
.get('/', async (_c) => {
  const rows = await db.select().from(skillVersions);
  return _c.json(rows);
})
```

任何人（包括未登录）都能列出所有 skill 版本、note、createdBy。其他 `/skills` 子接口都要求 admin。

**整改建议：**

- 在确定保留该模块时（参考 TODO 3 的选项 1），加上 `requireUser` + `isAdmin`。
- 如果按 TODO 3 选项 2 删除整个 skills 模块，本 TODO 自然消解。

---

### TODO 12：补齐认证生产化安全边界 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

登录失败现在统一返回 `401 Email or password is incorrect.`，不存在邮箱、无密码账号、漏填/错误密码不再可区分；前端也只展示统一的“邮箱或密码不正确”。后端新增内存短窗口限速，按客户端 IP + email 聚合失败次数，默认 10 分钟内 5 次失败后返回 `429`；只有显式设置 `ATLAS_TRUST_PROXY=true` 时才信任 `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP`。登录 cookie 的 `Secure` 改为生产环境默认开启（`ATLAS_ENV` / `NODE_ENV` / `BUN_ENV=production|prod`），本地仍可开发；并新增管理员接口 `POST /auth/sessions/purge-expired` 清理过期 session 行。README 已补充相关环境变量与安全边界，API 测试覆盖统一登录错误、限速、生产 Secure cookie 和过期 session 清理。

**严重程度：P1 / 安全与生产配置风险**

**相关文件：**

- `apps/api/src/routes/auth.ts:25-48`
- `apps/api/src/lib/auth.ts`
- `apps/web/src/auth.tsx:25`
- `apps/api/src/db/schema.ts:14-22`

**问题说明：**

当前登录链路更像开发/内网原型配置，主要问题包括：

- 登录接口对不存在邮箱返回 `404 + No member exists for this email.`，前端也专门映射为“找不到这个邮箱”，会造成成员邮箱枚举。
- 登录失败没有节流、锁定或审计维度聚合；密码爆破只能依赖外层网关（代码内未体现）。
- `SESSION_COOKIE` 和 `CSRF_COOKIE` 在 `auth.ts` 中固定 `secure: false`，如果直接部署到 HTTPS 生产环境，Cookie 安全属性不符合预期。
- `sessions` 表有 `expiresAt`，`authMiddleware`（`apps/api/src/lib/auth.ts:49`）已经用 `gt(sessions.expiresAt, now)` **拒绝**过期 session（已复核，这点没问题）；但它**从不删除**过期行，过期 session 会无限堆积在表里。需要一个清理任务（类似 `purge-expired`），并配合 TODO 7 为 `expiresAt` 建索引让拒绝查询走索引。

**整改建议：**

- 登录失败统一返回 `401 Email or password is incorrect.`，不要区分邮箱不存在、无密码、密码错误。
- 增加登录限速：至少按 IP + email 做短窗口限制；若项目部署在反向代理后，明确可信 `X-Forwarded-For` 策略。
- Cookie 的 `secure` 根据环境配置：生产 HTTPS 下必须为 `true`，本地开发可为 `false`。
- 补充测试覆盖：不存在邮箱、错误密码、无密码账号对外响应一致；生产配置下 Cookie 带 `Secure`。

**验收标准：**

- 未认证攻击者不能通过登录接口区分邮箱是否存在。
- 生产环境 Cookie 默认具备 `Secure` 属性。
- 登录失败有明确限速策略，且测试覆盖主要分支。

---

## P2：中期优化

### TODO 13：增加空间成员批量权限更新接口 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

新增共享 schema `BatchSetSpaceMemberRolesSchema` 和后端 `PUT /spaces/:id/members` 批量接口，接收 `{ updates: [{ memberId, role }] }`，先统一校验空间、成员和请求体，再在一个事务中完成 delete/insert 与审计写入；重复 memberId 以后者为准。前端“全部设为仅读”“清空”已从逐个 `PUT /spaces/:id/members/:memberId` 改为一次批量 mutation，并只刷新当前空间成员、权限和空间目录相关 query。API 测试覆盖批量更新、清空、重复项归并和无效成员不产生部分写入。

**严重程度：P2 / 性能与一致性风险**

**相关文件：**

- `apps/web/src/views-admin.tsx:747-758`
- `apps/api/src/routes/spaces.ts:172-197`

**问题说明：**

前端批量设置空间权限时，对每个成员发起一次请求：

```ts
targets.forEach(m => setMemberSpaceRole(m.id, space.id, role, { silent: true }));
```

成员多时瞬间发出大量 HTTP；部分成功难处理；审计日志碎片化；并触发多次 query invalidation。

**整改建议：**

- 新增 `PUT /spaces/:id/members`，接收 `{ updates: [{ memberId, role }] }`。
- 在事务中完成 delete/insert。
- 前端一次请求、一次 toast、一次 invalidation。

**验收标准：**

- “全部设为仅读”和“清空”只发一个请求。
- 失败时整体提示。
- 成功后只刷新相关空间成员数据。

---

### TODO 14：拆分前端大文件，降低维护成本 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

已按职责拆分两个最重的前端视图入口：`apps/web/src/views.tsx` 与 `apps/web/src/views-admin.tsx` 现在仅保留 named-export facade，实际实现迁移到 `apps/web/src/views/*` 与 `apps/web/src/views-admin/*`。Reader / Public / SpaceIndex / AdminDocs / HTML 编辑器、上传流程、设置页 shell、空间/成员/权限/回收站面板都拆成独立模块；`app.tsx` 的导入路径保持不变。本次只做行为保持不变的物理拆分和 import 重接，不合并 TODO 15 的视觉 token 统一，解决了原先单文件职责过重、后续维护和继续拆分成本高的问题。

**严重程度：P2 / 可维护性风险**

**相关文件（拆分后）：**

- `apps/web/src/views.tsx`：Reader/admin view facade
- `apps/web/src/views/reader-view.tsx`
- `apps/web/src/views/public-document-view.tsx`
- `apps/web/src/views/space-index-view.tsx`
- `apps/web/src/views/admin-docs-view.tsx`
- `apps/web/src/views/html-editor-dialog.tsx`
- `apps/web/src/views-admin.tsx`：admin view facade
- `apps/web/src/views-admin/upload-view.tsx`
- `apps/web/src/views-admin/settings-view.tsx`
- `apps/web/src/views-admin/spaces-pane.tsx`
- `apps/web/src/views-admin/members-pane.tsx`
- `apps/web/src/views-admin/permissions-pane.tsx`
- `apps/web/src/views-admin/trash-pane.tsx`

**验收结果：**

- `bun run typecheck` 通过。
- `bun run lint` 通过（仅保留既有 a11y warnings）。
- `bun run test` 通过（17 pass）。

---

### TODO 15：统一前端颜色、dot、accent 映射 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

新增 `apps/web/src/theme-tokens.ts` 作为唯一视觉 token 来源，集中维护 `SPACE_COLOR_MAP`、`SPACE_COLOR_LABEL`、`SPACE_COLORS`、`dotClass()`、`accentDot()`、`spaceColor()` 和 `spaceColorLabel()`。原 `views/shared.ts` 与 `views-admin/shared.ts` 改为 re-export facade，SpaceManagerDialog 删除本地 `SPACE_COLORS` 数组并复用统一 token。解决了拆分后 dot/accent/color/label 多处定义、后续改色容易漂移的问题。

**严重程度：P2 / 一致性与冗余问题**

**相关文件（重复或近似的映射）：**

- `apps/web/src/views.tsx:14-22`（`dotClass`）
- `apps/web/src/views-admin.tsx:13-20`（`dotClass2` — 与 `dotClass` 完全相同）
- `apps/web/src/views-admin.tsx:366-372`（`SPACE_COLOR_MAP` / `SPACE_COLOR_LABEL`）
- `apps/web/src/dialogs.tsx:437-444`（`SPACE_COLORS` 数组）
- `apps/web/src/chrome.tsx:329`（accent → CSS class 的内联三元表达式）

**整改建议：**

- 新建 `apps/web/src/theme-tokens.ts`，集中维护 dot/accent/color/label 映射。
- 提供 `dotClass(dot)`、`accentColor(accent)`、`accentLabel(accent)` 三个纯函数。
- 删除 `dotClass2`、`SPACE_COLOR_MAP`、`SPACE_COLORS` 等重复定义；`chrome.tsx` 内联三元改为调用新工具。

**验收标准：**

- dot/accent 映射只有一个来源。
- 文档卡片、sidebar、admin settings、SpaceManagerDialog 使用同一套映射。

---

### TODO 16：统一默认 `skillVersion`（如果该模块保留）✅ 已解决

**状态：已完成（2026-05-31）—— 随 TODO 3 删除 `skillVersion` 自然消解**

**方案与现状：**

TODO 3 已选择选项 2：彻底删除 skill/sanitize 版本概念。因此不再需要统一默认 `skillVersion` 常量；当前 schema、documents 路由和 seed 流程都不再写入或读取 `skillVersion`。

**复核（2026-05-31）：**

- `apps/api/src/db/schema.ts` 的 `documents` 表不再包含 `skillVersion` 列，也没有 `skillVersions` 表。
- `apps/api/src/routes/documents.ts` 的 create/upload/update 流程不再引用 `skillVersion`。
- `apps/api/src/db/seed.ts` 不再写入 `skillVersion`。
- 全仓运行时源码搜索 `skillVersion` / `skillVersions` 无命中；仅旧迁移快照保留历史记录。

**严重程度：P2 / 冗余与一致性问题**

**相关文件：**

- `apps/api/src/db/schema.ts:47`
- `apps/api/src/routes/documents.ts:150,200`
- `apps/api/src/db/seed.ts:101,142`

**问题说明：**

默认值 `'1.2.4'` 在 schema、create、upload、seed 四处重复出现。

**整改建议：**

- 如果 TODO 3 选项 1 保留 skill 模块：提取 `DEFAULT_SKILL_VERSION = '1.2.4'`，所有业务代码引用同一常量；保留 DB 默认值仅作兜底。
- 如果 TODO 3 选项 2 删除 skill 模块：本 TODO 一并随之删除。

---

## P3：低优先级清理与体验优化

### TODO 17：移除 chrome 自动隐藏逻辑中的持续 DOM 扫描 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

`App` 中已删除 500ms `setInterval(attachScroll)` 和全局 `document.querySelectorAll(...)` 重绑逻辑，改为集中保留 `wakeChrome()` / `hideChrome()`，通过主区域 `onScroll`、全局 wheel 以及 Reader/Public iframe 组件自己的 `onLoad` 绑定来触发隐藏；iframe 滚动监听由渲染 iframe 的组件负责，不再扫描 DOM 查找 `.reader-iframe`。解决了长期运行时持续 DOM 扫描和重复绑定滚动监听的问题。

**严重程度：P3 / 前端效率与可维护性问题**

**相关文件：**

- `apps/web/src/app.tsx:141-199`
- `apps/web/src/app.tsx:173-186`

**问题说明：**

每 500ms 通过 `document.querySelectorAll(...)` 扫描 DOM 并重新绑定滚动监听：

```ts
const attachTimer = setInterval(attachScroll, 500);
```

是原型期的实现，对长时间运行不友好。

**整改建议：**

- 用 React ref 管理滚动容器，或在 scroll container 组件上直接绑定 `onScroll`。
- 对 iframe scroll 监听单独封装，避免重复绑定。
- 去掉全局 500ms interval。

---

### TODO 18：优化 `DockItem` 的持续 `requestAnimationFrame` ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

Dock 复用父组件已有的 `mouseX` hover 状态生成 `isAnimating` 信号传给 `DockItem`；`DockItem` 只在 hover 放大或离开后回弹未完成时继续 rAF，尺寸接近目标值后主动取消循环并固定到目标尺寸。保留原有 spring 放大手感，同时解决 dock idle 时每个 item 都持续占用动画帧的问题。

**严重程度：P3 / 前端效率问题**

**相关文件：**

- `apps/web/src/app.tsx:398-411`

**问题说明：**

`DockItem` 的 hover 放大用持续 rAF。即使 dock idle 也会产生帧回调。

**整改建议：**

- 只在鼠标进入 dock 区域时启动 rAF，鼠标离开后 cancel。
- 或改用 CSS transition / transform 实现 hover magnify。

---

### TODO 19：分享弹窗成员列表的扩展性 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

`GET /documents/:id/share` 不再随分享弹窗返回全量 `availableMembers`，只保留公开链接状态和已单独邀请 roster。新增受分享管理权限保护的 `GET /documents/:id/share/members?q=&limit=` 搜索接口，按姓名/邮箱做有上限的候选成员查询，并排除当前用户和已在 roster 中的成员。前端 ShareDialog 改为根据输入实时读取小批量搜索结果，邀请时使用精确匹配或首个候选，解决大团队打开弹窗即加载/渲染全部成员的问题。

**严重程度：P3 / 扩展性问题**

**相关文件：**

- `apps/api/src/routes/documents.ts:340-379`
- `apps/web/src/dialogs.tsx:177-188`

**问题说明：**

打开分享弹窗会拉全部成员（`availableMembers`），小团队没问题，规模大后会变重。

**整改建议：**

- 改为搜索式添加，或对 `availableMembers` 分页/懒加载。

---

### TODO 20：清理 Biome 历史遗留排除项 ✅ 已解决

**状态：已完成（2026-05-31）—— 随 TODO 4 清理历史排除项自然消解**

**方案与现状：**

TODO 4 恢复前端 TSX lint/typecheck 覆盖时，已经同步删除 `biome.json` 中的历史遗留排除项 `!src/data.js`、`!tweaks-panel.jsx` 和 `!apps/web/src/**/*.tsx`。当前 `files.includes` 只保留仍有明确原因的排除：依赖/构建产物、HTML 样例、样式文件、Drizzle 迁移 meta、以及 seed fixture。

**复核（2026-05-31）：**

- `biome.json` 中不再包含 `!src/data.js`、`!tweaks-panel.jsx`、`!apps/web/src/**/*.tsx`。
- `apps/web/src` 中 `@ts-nocheck` 搜索无命中。
- 当前保留的 `!packages/shared/src/fixtures.ts` 已在 TODO 22 单独跟踪，不能并入本项静默删除。

**严重程度：P3 / 工程卫生问题**

**相关文件：**

- `biome.json:10-11`

**问题说明：**

```json
"!src/data.js",
"!tweaks-panel.jsx"
```

是 JSX 原型期的遗留，对应文件已经不存在。

**整改建议：**

- 删除这些无效 exclude。
- 重新检查所有 `files.includes` 排除项；每个排除项都应有明确原因。

---

### TODO 21：统一 public share URL 来源 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

确认浏览器对外分享路径统一为现有前端路由 `/share/:token`。后端分享管理响应中的 `public.url` 已从 `/public/:token` 改为 `/share/:token`，前端 ShareDialog 优先直接使用 API 返回的 `public.url`，仅保留 `publicShareUrl(token)` 作为兜底构造；`/documents/public/:token` 继续作为公开文档数据读取接口，不再被当作对外分享 URL。解决了 API 与前端各自维护不同 public URL 规范的问题。

**严重程度：P3 / 一致性问题**

**相关文件：**

- `apps/api/src/routes/documents.ts:356`（返回 `/public/${link.token}`）
- `apps/web/src/url-utils.ts:8-10`（构造 `/share/:token`）
- `apps/web/src/dialogs.tsx:194`（使用 `publicShareUrl(...)`，忽略 API 返回的 url）
- `apps/web/src/app.tsx:29-30`（路由匹配 `/share/:token`）

**问题说明：**

API 给出的分享 URL 是 `/public/:token`，前端实际使用并路由匹配的是 `/share/:token`。两套规范并存，前端目前忽略 API 返回的 url 字段。

**整改建议：**

- 确认产品对外的分享 URL 规范（推荐 `/share/:token` 与现有前端一致）。
- API 与前端只保留一个来源。或者 API 只返回 `token`，前端负责构造完整 URL；或者 API 返回完整 URL，前端直接用。

---

### TODO 22：清理旧原型 fixture 数据与误导性注释 ✅ 已解决

**状态：已完成（2026-05-31）**

**方案与现状：**

seed 数据已从跨端运行时包 `packages/shared/src/fixtures.ts` 迁移到 API 专属的 `apps/api/src/db/seed-data.ts`，`apps/api/src/db/seed.ts` 改为本地导入；`@atlas/shared` 不再导出 `./fixtures`，前端 tsconfig 也移除了 `@atlas/shared/fixtures` alias。旧 shared fixture 文件删除后，`biome.json` 不再需要 `!packages/shared/src/fixtures.ts` 单独排除。`seed-data.ts` 顶部注释明确其仅供 API seed 使用，并同步清理了 `tweaks-panel.tsx` 中关于旧 deck-stage 副本的过时说明。解决了 seed-only 数据混在 shared runtime 包、注释误导和 Biome 特例排除的问题。

**严重程度：P3 / 冗余与工程卫生问题**

**相关文件：**

- `packages/shared/src/fixtures.ts`
- `biome.json:17`（`!packages/shared/src/fixtures.ts`）
- `apps/web/src/tweaks-panel.tsx:193-218`

**问题说明：**

`packages/shared/src/fixtures.ts` 仍保留大量旧原型静态数据，并且文件注释仍写着“Imported as ATLAS_DATA by apps/web and apps/api”“legacy src/data.js”。

**更正（2026-05-29 复核）：** 之前 TODO 写的“`grep` 结果显示 fixture 基本只被自身导出和 Biome exclude 引用”是**错误**的。实际上 `apps/api/src/db/seed.ts:1` 仍 `import { ATLAS_DATA } from '@atlas/shared/fixtures'`，并在 seed 流程中大量使用（`ATLAS_DATA.members` / `ATLAS_DATA.tree` / `ATLAS_DATA.docContent`，见 seed.ts:26,35,82,108-109,175）。也就是说 fixture 现在是 **数据库 seed 的唯一数据源**，不是死代码。前端（`apps/web`）确实已不再引用它，注释里“by apps/web”才是过时的部分。

因此**不能直接删除** `fixtures.ts`，否则会让 `db:seed` 失败。真正的问题是：

- 文件注释（“by apps/web and apps/api”“legacy src/data.js”）已过时，会误导读者以为它仍是前端/运行时数据源。
- 它被放在 `packages/shared`（运行时共享包），而它实际上只服务于 API 的 seed，职责定位不清。
- Biome 为该 fixture 单独排除，隐藏了格式与规范问题。
- 静态数据中的文档标题、权限、成员若与 schema/路由演进脱节，会形成第二套“假事实”。

**整改建议：**

- 不要删除 fixture；先修正注释，明确它现在只被 `apps/api` 的 seed 使用，与前端运行时无关。
- 评估是否把 seed 数据从 `packages/shared` 迁移到 `apps/api`（例如 `apps/api/src/db/seed-data.ts`），让“演示/seed 数据”不再混在跨端 runtime 包里。
- 迁移后再决定是否能去掉 Biome 对 fixture 的单独排除。
- 同步清理仍描述 JSX/静态原型期状态的注释，例如 `tweaks-panel.tsx` 中关于旧 localStorage/deck 的说明。

**验收标准：**

- fixture 的注释准确描述其当前唯一消费者（API seed）。
- seed 数据的归属包清晰（建议归 `apps/api`），不再放在跨端共享 runtime 包内。
- 迁移后 Biome 不再需要为旧 fixture 单独排除，且 `bun run --filter @atlas/api db:seed` 仍能正常工作。

---

1. P0：收紧 `/spaces` 对未登录用户的字段（TODO 1）、修复 `share` 存在性泄漏（TODO 2）、决定 sanitize-html / skill 模块的去留（TODO 3）。
2. P1 安全/一致性：客户端 `canRead` 与服务端对齐（TODO 9）、移除 demo 一键切换（TODO 10）、补齐认证生产化安全边界（TODO 12）均已完成。
3. P1 性能：瘦身 `/spaces`（TODO 5）、治理 N+1（TODO 6）、补索引（TODO 7）、`purge-expired` 改为 SQL 过滤（TODO 8）。
4. P1 质量：恢复前端 lint/typecheck 覆盖（TODO 4）。
5. P2：批量空间成员更新（TODO 13）、拆分大文件（TODO 14）、统一颜色映射（TODO 15）。
6. P3：DOM 扫描、idle rAF、分享弹窗成员、分享 URL 来源、旧 fixture 清理。

> 注：仓库已经在 `.gitignore` 里覆盖了 `dist`、`apps/api/data/`、`*.sqlite`、`*.sqlite-*`，`git ls-files` 也确认未跟踪这些文件——原 TODO「检查构建产物 / SQLite 是否被 git 跟踪」无须再列入。

---

## 后续执行建议

- 安全修复（TODO 1、2、3、9、10、11、12）均已完成；后续安全类改动仍建议单独提交，方便回滚。
- `/spaces` 响应结构变更（TODO 1、5、6）尽量在一个 PR 内一起改，并同步更新前端。
- 类型检查恢复（TODO 4）按文件分批提交。
- DB 索引与迁移（TODO 7）单独提交。
- 前端拆文件（TODO 14）尽量保持行为不变，独立提交。

每个 TODO 完成后建议至少运行：

```bash
bun run typecheck
bun run lint
bun run test
```

涉及前端 UI 的改动还应启动应用手动验证主要路径。
