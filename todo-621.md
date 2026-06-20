# Atlas 前端体验优化计划（最终版）

> **版本**：v2.0 · 2026-06-21
> **状态**：待评审 / 待施工
> **范围**：`apps/web/src/**`，不涉及后端契约改动
> **方法论**：所有论据已逐条对照源码核实（行号 ±3 行），元评审反馈已吸收

---

## 0. TL;DR — 执行速查

| ID | 改造项 | 文件 | 预估 | 风险 | 收益 |
|----|--------|------|------|------|------|
| **T1** | Reader meta-bar 改右侧竖排 | `reader-view.tsx` / `styles.css` | 1.5h | 低 | ⭐⭐⭐⭐⭐ |
| **T2** | 扩展 `ui-kit.tsx`：`Skeleton` + `EmptyState` | `ui-kit.tsx` / `styles.css` | 2h | 低 | ⭐⭐⭐⭐ |
| **T3** | SpaceIndex 空态 + 卡片相对时间 + hover lift | `space-index-view.tsx` / `styles.css` | 2h | 低 | ⭐⭐⭐⭐ |
| **T4** | Reader 加载态用 Skeleton 替换文字横条 | `reader-view.tsx` | 1h | 低 | ⭐⭐⭐ |
| **T5** | 跟随 `prefers-color-scheme` 系统深色 | `app.tsx` | 30min | 极低 | ⭐⭐⭐ |
| **T6** | 修复 role 徽章死代码：删 editor/viewer，**补 member** | `styles.css` | 20min | 极低 | ⭐⭐⭐ |
| **T7** | Toast 加 `aria-live="polite"` | `dialogs.tsx` | 10min | 极低 | ⭐⭐ |
| **T8** | `AnimatedItem` per-node observer → CSS stagger | `chrome.tsx` / `styles.css` | 1.5h | 中 | ⭐⭐ |

**推荐执行顺序**：T6 → T7 → T5 → T1 → T2 → T3 → T4 → T8
（先清死代码/低风险项，再上结构性改造）

**总预估**：~9h，可拆 2 个 PR。

---

## 1. 项目现状评估

### 1.1 技术基线（已确认）

- **栈**：React 19 + Vite 6 + React Query，单文件 `styles.css`（4496 行）+ `theme-tokens.ts`（CSS 变量驱动）
- **设计方向**：Apple HIG 风格 —— 玻璃顶栏、暖色珊瑚（`--accent: #cc785c`）默认主题、卡片堆叠、SF Pro Display 字体、自定义 SVG 图标
- **设计系统成熟度**：**高**。token 化程度好，`:root` / `[data-theme="dark"]` / `[data-theme="warm"]` 三套主题完整，`clickableProps` 把 div→button 的 a11y 升级已封装成通用 helper

### 1.2 整体诊断

**B+（良好）—— 基础扎实，缺的是打磨。** 问题集中在三类：
1. **边缘态缺失**：加载/空/错误三态体验断崖
2. **核心阅读流被打断**：Reader meta-bar 遮挡正文
3. **细节一致性裂缝**：role 徽章死代码、Toast 无 a11y、不跟随系统主题

无结构性重写必要，本计划全部为增量打磨。

---

## 2. 设计系统事实核对（元评审修正后）

> 本节记录经源码核实的设计系统现状，**避免施工时基于错误假设返工**。

### 2.1 色彩 token 分工（**重要**，避免误删）

`--blue` 和 `--accent` **是两个有意分工的独立变量**，不是重复：

| 变量 | 用途 | 用量 | 定义位置 |
|------|------|------|----------|
| `--blue` | **交互态主色**（按钮/链接/焦点轮廓/active 态） | 65 次 | `styles.css:20/78/112` |
| `--accent` | **语义强调色**（锁屏图标、内容分割条） | 2 次 | `styles.css:21/79/113` |

**结论**：两者保留，不重命名。原 v1 报告"建议把 `--blue` 重命名为 `--accent`"**撤销**——会破坏 65 处引用且无收益。

### 2.2 角色枚举的真实拓扑（**重要**，避免误删徽章）

经核实 `packages/shared/src/index.ts`：

```ts
RoleSchema          = z.enum(['admin', 'member']);        // 全局用户角色（index.ts:9）
SpaceMemberRoleSchema = z.enum(['viewer', 'editor']);     // 空间成员角色（index.ts:88）
```

而 `auth.tsx` 中所有 `role-${user.role}` 渲染（`auth.tsx:376/430/492/703`）传的都是**全局 `user.role`**，即只能是 `admin` / `member`。

`styles.css:3396-3401` 现状：
```css
.um-role.role-admin  { ... }   // ✅ 有定义，生效
.um-role.role-editor { ... }   // ❌ 死代码（user.role 永不为 editor）
.um-role.role-viewer { ... }   // ❌ 死代码（user.role 永不为 viewer）
/* .um-role.role-member          ❌ 缺失！member 用户的徽章无样式 fallback */
```

**结论**：见 **T6**——删 editor/viewer **同时必须补 member**，否则普通成员账号的徽章会变成无样式的裸文本。

### 2.3 动画清单（经核实，共 12 个）

`expand / dropin / tab-in / fade-up / pop / fade / lift / fab-in / um-pop / login-rise / login-err-shake / login-spin`

> v1 报告误把"建议新增的 `shimmer`"当成已有动画列入"过满"论据，且漏列了实际存在的 `fab-in`。**本计划撤销"动画数量过多"论点**，仅保留与数量无关的 **per-node observer 性能问题**（见 T8）。

### 2.4 `ui-kit.tsx` 已存在（**重要**，避免重复创建）

现有导出：`useDismiss` / `clickableProps` / `Select` / `confirmDialog` / `ConfirmRoot`。

**结论**：T2 是**扩展**此文件追加 `Skeleton` / `EmptyState`，**不是新建**。

---

## 3. 详细改造方案

### T1 · Reader meta-bar 改右侧竖排 ⭐ 最高 ROI

#### 问题（已核实）

`reader-view.tsx:200` 的 meta-bar 是 `position: absolute; top: 14px; left: 50%` 的玻璃胶囊，5 个 pill 按钮（链接/分享/复制源码/带格式/编辑）挤在一行。配合 `app.tsx:203` 的 `HIDE_DELAY = 4000`，**前 4 秒一直遮在文章第一行上方**，阅读时持续干扰。

`meta-bar-hidden`（`styles.css:2032`）当前是 `translateY(-130%)` 往上滑出——证明隐藏后**用户彻底失去工具栏入口**，想分享得先滚动唤醒 chrome。

#### 方案

改为**右侧竖排常驻工具栏**（Bear/Notion/Typora 通用模式）：

```tsx
// reader-view.tsx:200 —— className 调整
<div className={`reader-meta-bar vertical ${chromeVisible ? '' : 'meta-bar-collapsed'}`}>
```

```css
/* styles.css —— 替换 .reader-meta-bar 定位块 */
.reader-meta-bar.vertical {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: var(--r-pill);   /* 保持胶囊感 */
  background: var(--glass-strong);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-card);
  z-index: 5;
}
.reader-meta-bar.vertical .doc-title,
.reader-meta-bar.vertical .author,
.reader-meta-bar.vertical .sep,
.reader-meta-bar.vertical .mono { display: none; }  /* 竖排只留按钮 */
.reader-meta-bar.vertical .pill-btn {
  width: 36px; height: 36px; padding: 0; justify-content: center;
}
.reader-meta-bar.vertical .pill-btn span { display: none; }  /* 纯图标 */
.reader-meta-bar.vertical .reader-lock-chip { display: none; }

/* 隐藏态：折叠成窄条，hover 展开 */
.reader-meta-bar.meta-bar-collapsed {
  transform: translateY(-50%) translateX(calc(100% - 12px));
}
.reader-meta-bar.meta-bar-collapsed:hover {
  transform: translateY(-50%) translateX(0);
}
```

**标题/作者信息**搬到顶部 breadcrumb（topbar 已有面包屑机制），不丢信息。

#### 验收
- [ ] 正文第一行无遮挡
- [ ] 4 秒后工具栏折叠为窄条，hover 展开
- [ ] 窄屏（<760px）下转为底部横条（见响应式补充）
- [ ] 分享/复制/编辑功能全部可达

---

### T2 · 扩展 `ui-kit.tsx`：`Skeleton` + `EmptyState`

#### 方案

**扩展**（非新建）`apps/web/src/ui-kit.tsx`：

```tsx
// ui-kit.tsx —— 追加导出
export function Skeleton({ w, h = 14, r = 6, className = '' }: {
  w?: string | number; h?: number; r?: number; className?: string;
}) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width: w, height: h, borderRadius: r, display: 'block' }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ glyph, title, desc, action }: {
  glyph?: React.ReactNode;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      {glyph && <div className="empty-state-glyph">{glyph}</div>}
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
```

```css
/* styles.css —— 追加（注意暗色态） */
.skeleton {
  background: linear-gradient(90deg,
    var(--hairline-2) 0%,
    rgba(0,0,0,0.06) 50%,
    var(--hairline-2) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite linear;
}
[data-theme="dark"] .skeleton {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.04) 0%,
    rgba(255,255,255,0.10) 50%,
    rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
}
@keyframes skeleton-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; padding: 80px 24px; text-align: center;
}
.empty-state-glyph { width: 56px; height: 56px; opacity: 0.45; color: var(--ink-3); }
.empty-state-title { font-size: 16px; font-weight: 500; color: var(--ink-2); }
.empty-state-desc { font-size: 13.5px; color: var(--ink-4); line-height: 1.6; max-width: 320px; }
```

#### 验收
- [ ] `bun run typecheck` 通过
- [ ] 暗色主题下 skeleton 不发灰发亮
- [ ] `prefers-reduced-motion` 下不闪烁

---

### T3 · SpaceIndex 空态 + 卡片相对时间 + hover lift

#### 问题（已核实）

`space-index-view.tsx:98` 的 `<div className="doc-grid">` 在 `docs.length === 0` 时**直接渲染空 grid**，无任何空态引导。

卡片现状（`space-index-view.tsx:108-130`）：已有 `dot`（空间色标）+ `vis-chip`（可见性徽章）+ 标题 + 摘要 + 作者 + `doc.updated`（绝对时间如 `2024-03-15`）。

> v1 报告"卡片没有标签/分类"**夸大**——`vis-chip` 就是分类信息。本任务只补：相对时间、hover 反馈、空态。

#### 方案

```tsx
// space-index-view.tsx —— doc-grid 块改造
{docs.length === 0 ? (
  <EmptyState
    glyph={<DocEmptyGlyph />}
    title="这个空间还没有文档"
    desc="点击右上角「上传」创建第一篇，或联系空间编辑者。"
  />
) : (
  <div className="doc-grid">
    {docs.map((doc: Loose) => {
      // ... 原有逻辑
      return (
        <div key={doc.id} className="doc-card" {...}>
          {/* ... */}
          <span className="updated">{relativeTime(doc.updated)}</span>
        </div>
      );
    })}
  </div>
)}
```

```ts
// 新增工具函数（放 space-index-view.tsx 顶部或 utils）
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < day) return '今天';
  if (diff < day * 2) return '昨天';
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  if (diff < day * 30) return `${Math.floor(diff / day / 7)} 周前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
```

```css
/* styles.css —— doc-card hover */
.doc-card {
  transition: transform var(--dur-fast) var(--ease-soft),
              box-shadow var(--dur-fast) var(--ease-soft);
}
.doc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-h);
}
.doc-card .desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

#### 验收
- [ ] 空空间显示 EmptyState，非空白
- [ ] `doc.updated` 显示"3 天前"等相对时间
- [ ] 卡片 hover 有轻微上浮 + 阴影加深
- [ ] 摘要超 2 行自动截断

---

### T4 · Reader 加载态用 Skeleton 替换文字横条

#### 问题（已核实）

`reader-view.tsx:260` 加载时只渲染 `<div className="app-state-banner">正在加载正文…</div>`——孤零零文字横条，视觉断崖。

#### 方案

```tsx
// reader-view.tsx:259-261
detailQuery.isLoading ? (
  <div className="reader-skeleton">
    <Skeleton w="60%" h={28} r={6} />
    <Skeleton w="40%" h={14} r={4} />
    <div style={{ marginTop: 24 }}>
      <Skeleton w="100%" h={12} />
      <Skeleton w="92%" h={12} />
      <Skeleton w="78%" h={12} />
    </div>
  </div>
) : isMarkdown ? (
  // ...
```

```css
.reader-skeleton {
  padding: 48px 64px;
  max-width: 720px;
  margin: 0 auto;
}
.reader-skeleton > * + * { margin-top: 10px; }
```

#### 验收
- [ ] 加载时显示结构化骨架，非文字横条
- [ ] 骨架结构与真实正文宽度比例接近

---

### T5 · 跟随 `prefers-color-scheme` 系统深色

#### 问题（已核实）

`app.tsx:16` `theme: 'warm'` 硬编码默认，`app.tsx:102-105` 把 `tweaks.theme` 直接写进 `data-theme`。**完全不读取系统偏好**——macOS 设了深色，Atlas 仍是暖色。

#### 方案

```tsx
// app.tsx —— 初始化 theme 的地方（约 line 16 附近的 useTweaks/useLocalStorage）
const [tweaks, setTweaks] = useState<Tweaks>(() => {
  const saved = readSavedTweaks();  // 已有的 localStorage 读取
  if (saved?.theme) return saved;   // 用户已选过，尊重
  // 首次访问：跟随系统
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { ...DEFAULT_TWEAKS, theme: prefersDark ? 'dark' : 'warm' };
});

// 可选：监听系统变化（仅当用户未手动改过时跟随）
useEffect(() => {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (!readSavedTweaks()?.theme) {  // 用户未显式选过
      setTweaks(t => ({ ...t, theme: e.matches ? 'dark' : 'warm' }));
    }
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, []);
```

> **注意**：需先确认 `useTweaks` 当前是否已持久化到 localStorage。若未持久化，本任务一并补上（key 建议 `atlas_tweaks`）。

#### 验收
- [ ] 清空 localStorage 后，macOS 深色模式下首次打开为 dark 主题
- [ ] 用户手动切换后，后续访问保持用户选择
- [ ] 系统切换深浅时，未手动选过的用户自动跟随

---

### T6 · 修复 role 徽章死代码 ⚠️ 含真 bug

#### 问题（已核实，见 §2.2）

`.role-editor` / `.role-viewer` 是死代码；`.role-member` **缺失**，导致普通成员账号徽章无样式。

#### 方案

```css
/* styles.css:3396-3401 —— 替换 */
.um-role.role-admin  { background: rgba(20, 110, 220, 0.10); color: #1a6bcc; }
.um-role.role-member { background: rgba(80, 95, 110, 0.12);  color: #5b6776; }
/* 删除 .role-editor / .role-viewer（user.role 永不为此值） */

[data-theme="dark"] .um-role.role-admin  { background: rgba(60, 140, 255, 0.18); color: #7eb6ff; }
[data-theme="dark"] .um-role.role-member { background: rgba(160, 175, 195, 0.18); color: #c8d0dc; }
/* 删除 dark editor/viewer */
```

#### 验收
- [ ] admin 账号徽章为蓝色
- [ ] member 账号徽章为灰蓝色（不再是裸文本）
- [ ] `bun run lint` 无未使用 CSS 警告（若 Biome 配置了）

---

### T7 · Toast 加 `aria-live="polite"`

#### 问题（已核实）

`dialogs.tsx:756` 的 `<div className="toast-wrap">` **无 `aria-live`**，屏幕阅读器读不到"已复制"等提示。

#### 方案

```tsx
// dialogs.tsx:756
<div className="toast-wrap" role="status" aria-live="polite" aria-atomic="true">
```

#### 验收
- [ ] VoiceOver / NVDA 在 toast 出现时朗读内容

---

### T8 · `AnimatedItem` per-node observer → CSS stagger

#### 问题（已核实）

`chrome.tsx` 的 `AnimatedItem`（约 line 752）对**每个树节点**挂 IntersectionObserver + setTimeout。50+ 节点时首帧 reflow 开销显著。

#### 方案

改为 **CSS-only stagger**：

```tsx
// chrome.tsx —— AnimatedItem 简化
function AnimatedItem({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div
      className="stagger-item"
      style={{ ['--i' as React.CSSProperties['animationDelay']]: index }}
    >
      {children}
    </div>
  );
}
```

```css
/* styles.css */
.stagger-item {
  animation: stagger-in var(--dur) var(--ease-soft) backwards;
  animation-delay: calc(min(var(--i, 0), 12) * 14ms);  /* 上限 12 防止长列表延迟过长 */
}
@keyframes stagger-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .stagger-item { animation: none; }
}
```

移除原 IntersectionObserver 逻辑（保留 `prefers-reduced-motion` 的 JS 判断若已存在）。

#### 验收
- [ ] 50 节点树列表首帧无明显卡顿（Chrome DevTools Performance）
- [ ] 视觉上仍有错峰入场效果
- [ ] `prefers-reduced-motion` 下无动画

---

## 4. 不做的事项（明确排除）

避免范围蔓延，以下**不在本计划内**：

| 项 | 原因 |
|----|------|
| 重命名 `--blue` → `--accent` | 两者有意分工（见 §2.1），65 处引用，无收益 |
| 删除"过多"的 keyframes | 12 个动画对玻璃质感系统合理，撤销 v1 论点 |
| `.dot.green/orange` 改 token | 低优先级，颜色硬编码不影响功能，留待后续设计系统重构 |
| `styles.css` 拆分多文件 | 4496 行可维护，拆分收益不抵 merge 冲突风险 |
| CmdK 增强（最近项/键盘标注） | 需单独设计交互，超出"打磨"范围 |
| Dock 放大系数调整 | 当前效果可用，窄屏问题在 T1 响应式里顺带处理 |
| 全局错误边界 | 需评估错误分类策略，另立任务 |

---

## 5. 验收与回归

### 5.1 每个 PR 必过

```bash
bun run typecheck     # 类型检查
bun run lint          # Biome
bun run build         # 构建无错
```

### 5.2 手工回归清单

- [ ] **登录**：`lin@atlas.team` / `atlas-demo-password` 进入，徽章颜色正确（admin 蓝）
- [ ] **登录**：用 member 账号登录，徽章颜色正确（member 灰蓝）← T6 核心
- [ ] **Reader**：打开任意文档，正文第一行无 meta-bar 遮挡 ← T1 核心
- [ ] **Reader**：4 秒后工具栏折叠，hover 展开 ← T1 核心
- [ ] **Reader**：加载时显示骨架屏 ← T4
- [ ] **SpaceIndex**：进入空空间，显示 EmptyState ← T3
- [ ] **SpaceIndex**：卡片 hover 上浮，时间显示"3 天前" ← T3
- [ ] **主题**：清 localStorage，macOS 深色下首开为 dark ← T5
- [ ] **主题**：手动切回 warm，刷新后保持 warm ← T5
- [ ] **a11y**：VoiceOver 开启，复制链接后朗读"已复制" ← T7

### 5.3 PR 拆分建议

- **PR-1（低风险清理）**：T6 + T7 + T5 —— 死代码、a11y、主题跟随。纯 CSS/小逻辑，~1h，可快速合并
- **PR-2（阅读体验）**：T1 + T2 + T4 —— meta-bar 重构 + 骨架屏基础设施。结构性改动，需仔细 review
- **PR-3（列表体验）**：T3 —— 空态 + 卡片增强
- **PR-4（性能）**：T8 —— 动画重构，独立验证性能

---

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|------|------|------|
| T1 meta-bar 竖排在窄屏挤压正文 | 中 | 补 `@media (max-width: 760px)` 转底部横条 |
| T5 系统主题监听导致闪烁 | 低 | 仅在用户未选过时跟随，已选则锁定 |
| T8 移除 observer 后某些节点不再入场 | 中 | 保留 `index` prop，CSS stagger 覆盖所有渲染节点 |
| T6 误删仍在用的徽章 | 低 | 已核实 `role-${user.role}` 只传全局 Role（admin/member） |

所有改动均可在 git 内单 commit 回滚，无数据迁移。

---

## 附录 A：核实过的关键行号索引

| 事实 | 位置 |
|------|------|
| `--blue` 定义 | `styles.css:20/78/112` |
| `--accent` 定义 | `styles.css:21/79/113` |
| `RoleSchema` = admin/member | `packages/shared/src/index.ts:9` |
| `SpaceMemberRoleSchema` = viewer/editor | `packages/shared/src/index.ts:88` |
| `role-${user.role}` 渲染位 | `auth.tsx:376/430/492/703` |
| role 徽章 CSS | `styles.css:3396-3401` |
| Reader meta-bar 渲染 | `reader-view.tsx:200` |
| `meta-bar-hidden` CSS | `styles.css:2032` |
| `HIDE_DELAY = 4000` | `app.tsx:203` |
| Reader 加载横条 | `reader-view.tsx:260` |
| `theme: 'warm'` 默认 | `app.tsx:16` |
| `data-theme` 写入 | `app.tsx:102-105` |
| `ToastWrap` 无 aria-live | `dialogs.tsx:756` |
| SpaceIndex 空 grid | `space-index-view.tsx:98` |
| doc-card 渲染 | `space-index-view.tsx:108-130` |
| `ui-kit.tsx` 现有导出 | `ui-kit.tsx:11/35/63/265/286` |
| 12 个 keyframes | `styles.css:436/528/808/998/1216/1276/1277/2248/3325/3659/3821/3858` |

---

## 附录 B：v1 → v2 修正记录

| v1 结论 | v2 处置 | 原因 |
|---------|--------|------|
| "`--blue` 应重命名为 `--accent`" | **撤销** | 两者有意分工，65 vs 2 次引用 |
| "新建 `ui-kit.tsx`" | **改为"扩展"** | 文件已存在并有 5 个导出 |
| "12 个 keyframes 过满（含 shimmer）" | **撤销数量论据** | shimmer 非现有动画；保留 per-node observer 性能论点 |
| "`role-editor/viewer` 是死代码，删除" | **改为"删 + 补 member"** | 删 editor/viewer 对，但漏了 member 缺失的真 bug |
| "卡片没有标签/分类" | **改为"信息维度可增强"** | 已有 `vis-chip`，非零信息量 |
| "骨架屏 2-3h" | **改为 2h（仅组件）+ T4 单独 1h** | 拆分更准确 |
