// Seed-only demo data for the API database reset script.
// This is not read by the web runtime; `seed.ts` imports it to populate local demo data.

import type { Space } from '@atlas/shared';

type FixtureDocument = {
  id: string;
  title: string;
  desc: string;
  author: string;
  updated: string;
  visibility: 'public' | 'invite' | 'private';
  dot: string;
  tags: string[];
  format?: 'html' | 'markdown';
  content?: string;
};

type FixtureSpace = Omit<Space, 'children'> & { children: FixtureDocument[] };

export const ATLAS_DATA = (() => {
  const members = [
    {
      id: 'u1',
      name: '林知远',
      initials: 'LZ',
      role: 'admin',
      email: 'lin@atlas.team',
      joined: '2024-02',
    },
    {
      id: 'u2',
      name: '陈夏',
      initials: 'CX',
      role: 'editor',
      email: 'chen@atlas.team',
      joined: '2024-03',
    },
    {
      id: 'u3',
      name: '柳明',
      initials: 'LM',
      role: 'editor',
      email: 'liu@atlas.team',
      joined: '2024-05',
    },
    {
      id: 'u4',
      name: '苏渡',
      initials: 'SD',
      role: 'editor',
      email: 'su@atlas.team',
      joined: '2024-08',
    },
    {
      id: 'u5',
      name: '何远',
      initials: 'HE',
      role: 'viewer',
      email: 'he@atlas.team',
      joined: '2025-01',
    },
    {
      id: 'u6',
      name: '周珩',
      initials: 'ZH',
      role: 'editor',
      email: 'zhou@atlas.team',
      joined: '2025-02',
    },
    {
      id: 'u7',
      name: '黎安',
      initials: 'LA',
      role: 'editor',
      email: 'li@atlas.team',
      joined: '2025-02',
    },
    {
      id: 'u8',
      name: '吴秋',
      initials: 'WQ',
      role: 'viewer',
      email: 'wu@atlas.team',
      joined: '2025-03',
    },
    {
      id: 'u9',
      name: '郑书',
      initials: 'ZS',
      role: 'editor',
      email: 'zheng@atlas.team',
      joined: '2025-04',
    },
    {
      id: 'u10',
      name: '韩奕',
      initials: 'HY',
      role: 'viewer',
      email: 'han@atlas.team',
      joined: '2025-04',
    },
    {
      id: 'u11',
      name: '叶清',
      initials: 'YQ',
      role: 'editor',
      email: 'ye@atlas.team',
      joined: '2025-05',
    },
    {
      id: 'u12',
      name: '冯之',
      initials: 'FZ',
      role: 'viewer',
      email: 'feng@atlas.team',
      joined: '2025-05',
    },
  ];

  const tree = [
    {
      id: 's1',
      name: '工程',
      mark: '工',
      accent: 'accent',
      count: 38,
      children: [
        {
          id: 'd1',
          title: 'Atlas v2.4 部署清单',
          desc: '生产环境逐步发布、回滚策略与监控指标确认表。',
          author: 'u1',
          updated: '5月14日',
          visibility: 'invite',
          dot: 'accent',
          tags: ['runbook'],
        },
        {
          id: 'd2',
          title: 'iframe 沙箱安全笔记',
          desc: 'CSP、sandbox 属性、跨域消息约定。整理自上周事故复盘。',
          author: 'u3',
          updated: '5月12日',
          visibility: 'private',
          dot: 'slate',
          tags: ['security'],
        },
        {
          id: 'd3',
          title: '导出管线 RFC · 003',
          desc: '从 HTML 到 PPTX / PDF 的中间表示讨论稿。',
          author: 'u1',
          updated: '5月09日',
          visibility: 'invite',
          dot: 'slate',
          tags: ['rfc', 'draft'],
        },
        {
          id: 'd4',
          title: 'Skill 版本管理协议',
          desc: '内部 skill 的语义化版本约定与回滚机制。',
          author: 'u2',
          updated: '5月06日',
          visibility: 'public',
          dot: 'moss',
          tags: ['internal'],
        },
        {
          id: 'd5',
          title: '周会笔记 · 5月18日',
          desc: '本周工程同步：Q3 优先级、技术债与人事调整。',
          author: 'u3',
          updated: '5月18日',
          visibility: 'invite',
          dot: 'ink',
          tags: ['notes'],
        },
        {
          id: 'dmd1',
          title: 'Markdown 语法总览',
          desc: '覆盖 GFM、代码高亮、公式、图表、脚注与警告框的演示文档。',
          author: 'u1',
          updated: '2024-06',
          visibility: 'public',
          dot: 'moss',
          tags: ['markdown', 'demo'],
          format: 'markdown',
          content: [
            '# Markdown 语法总览',
            '',
            '普通段落，含 **加粗**、*斜体*、~~删除线~~、`行内代码` 与 [链接](https://example.com)。',
            '',
            '## 列表与任务',
            '- 无序项 A',
            '- 无序项 B',
            '',
            '- [x] 已完成任务',
            '- [ ] 待办任务',
            '',
            '## 表格',
            '| 语法 | 支持 |',
            '| --- | --- |',
            '| 表格 | ✅ |',
            '| 公式 | ✅ |',
            '',
            '## 代码高亮',
            '```ts',
            // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional markdown demo source
            'const greet = (name: string): string => `hi ${name}`;',
            '```',
            '',
            '## 数学公式',
            '行内 $E = mc^2$，块级：',
            '',
            '$$\\int_0^1 x^2 \\,dx = \\tfrac{1}{3}$$',
            '',
            '## 图表',
            '```mermaid',
            'graph LR; A[开始] --> B{判断}; B -->|是| C[结束];',
            '```',
            '',
            '## 警告框',
            '> [!NOTE]',
            '> 这是一个 GitHub 风格的提示框。',
            '',
            '## 脚注',
            '正文带脚注[^1]。',
            '',
            '[^1]: 这是脚注内容。',
            '',
          ].join('\n'),
        },
      ],
    },
    {
      id: 's2',
      name: '产品',
      mark: '产',
      accent: 'moss',
      count: 22,
      children: [
        {
          id: 'd6',
          title: 'Q2 用户访谈合集',
          desc: '12 位读者、3 位团队管理员的深访摘要与原始片段。',
          author: 'u2',
          updated: '5月11日',
          visibility: 'invite',
          dot: 'moss',
          tags: ['research'],
        },
        {
          id: 'd7',
          title: '阅读体验调研 · 桌面 vs 移动',
          desc: '滚动深度、停留时间、目录使用率的对照报告。',
          author: 'u4',
          updated: '5月07日',
          visibility: 'invite',
          dot: 'accent',
          tags: ['research'],
        },
        {
          id: 'd8',
          title: '空间分享流程提案',
          desc: '从「设置-成员」到「文档-邀请」的路径重组建议。',
          author: 'u2',
          updated: '5月03日',
          visibility: 'invite',
          dot: 'slate',
          tags: ['proposal'],
        },
      ],
    },
    {
      id: 's3',
      name: '设计',
      mark: '设',
      accent: 'slate',
      count: 17,
      children: [
        {
          id: 'd9',
          title: 'Atlas 视觉语言 v1',
          desc: '色彩、字号、节奏的来源说明与使用边界。',
          author: 'u4',
          updated: '5月10日',
          visibility: 'invite',
          dot: 'accent',
          tags: ['system'],
        },
        {
          id: 'd10',
          title: '目录与索引的版式实验',
          desc: '六种导航形态的横向对比，含可点原型。',
          author: 'u4',
          updated: '5月04日',
          visibility: 'invite',
          dot: 'moss',
          tags: ['exploration'],
        },
        {
          id: 'd11',
          title: '界面文案准则',
          desc: '中文界面的口吻、长度、标点与可替换词表。',
          author: 'u4',
          updated: '4月28日',
          visibility: 'public',
          dot: 'plum',
          tags: ['writing'],
        },
      ],
    },
    {
      id: 's4',
      name: '林知远 · 个人',
      mark: '林',
      accent: 'plum',
      count: 9,
      personal: true,
      children: [
        {
          id: 'd12',
          title: '阅读笔记 · 现代书籍设计',
          desc: 'Bringhurst、Tschichold、原研哉的若干段落整理。',
          author: 'u1',
          updated: '5月15日',
          visibility: 'private',
          dot: 'plum',
          tags: ['notes'],
        },
        {
          id: 'd13',
          title: 'TODO · Atlas v3',
          desc: '一份不算计划的计划。',
          author: 'u1',
          updated: '5月17日',
          visibility: 'private',
          dot: 'ink',
          tags: ['todo'],
        },
      ],
    },
  ];

  // sample doc content (rendered directly, simulating iframe content)
  const docContent = {
    d1: {
      title: 'Atlas v2.4 部署清单',
      lede: '本次发布涉及 iframe 沙箱策略、目录索引接口与权限模型三处变更。按顺序执行，遇 ❌ 即终止并通知 @林知远。',
      meta: [
        { label: '作者', value: '林知远' },
        { label: '版本', value: 'v2.4.0' },
        { label: '最近更新', value: '2025年5月14日 · 17:42' },
        { label: '估时', value: '约 42 分钟' },
      ],
      sections: [
        {
          num: '01',
          id: 's1',
          title: '前置检查',
          subs: [
            { id: 's1-1', title: '依赖版本对齐' },
            { id: 's1-2', title: '数据库迁移预演' },
          ],
          body: `
            <p>在开始任何操作之前，请确认以下三项均已完成。这一步看似机械，但每一次跳过它，事故就会安静地在某个深夜出现。</p>
            <ul>
              <li>本地的 staging 分支已与 main 同步；落后超过两次提交则中止。</li>
              <li>数据库迁移脚本已在 staging 上空跑一次，输出与预期一致。</li>
              <li>所有团队成员已知晓本次窗口期，包括正在使用 Atlas 阅读的外部访客（参考 §03）。</li>
            </ul>
            <h3 id="s1-1">依赖版本对齐</h3>
            <p>升级 <code>@atlas/sandbox</code> 到 <code>0.9.2</code>，该版本修复了 iframe 在 Safari 下偶发的滚动嵌套问题。运行 <code>pnpm i</code> 后务必检查 lockfile 改动是否只涉及该依赖。</p>
            <h3 id="s1-2">数据库迁移预演</h3>
            <p>本次迁移涉及 <code>documents.visibility</code> 字段的语义变更，从枚举改为带过期时间的对象。预演的目的不是验证脚本能跑通，而是验证<em>跑完之后产品仍然正常</em>。</p>
          `,
        },
        {
          num: '02',
          id: 's2',
          title: '发布执行',
          subs: [
            { id: 's2-1', title: '灰度策略' },
            { id: 's2-2', title: '回滚开关' },
          ],
          body: `
            <p>按 5% → 25% → 100% 三个阶段灰度，每阶段静置 15 分钟。本次发布对读者侧无视觉变化，因此监控指标的异常更值得关注，而不是用户的反馈。</p>
            <div class="callout"><div class="marker">注意</div><div>本次更新会重置阅读位置缓存。请在发布通知中提醒长文阅读者刷新页面后从顶部开始。</div></div>
            <h3 id="s2-1">灰度策略</h3>
            <p>权重切换通过运行时配置，无需重启进程。每次切换后观察以下三项指标。</p>
            <figure><div class="placeholder">仪表板截图占位 · DEPLOY-METRICS.png</div><figcaption>FIG.01 · 三个关键指标在灰度阶段的预期形态</figcaption></figure>
            <h3 id="s2-2">回滚开关</h3>
            <p>回滚命令保留在共享密码本中。若需回滚，回滚到 v2.3.6（而非 v2.3.7，后者存在已知的目录同步问题）。</p>
          `,
        },
        {
          num: '03',
          id: 's3',
          title: '事后验证',
          subs: [
            { id: 's3-1', title: '读者侧抽样' },
            { id: 's3-2', title: '团队侧巡检' },
          ],
          body: `
            <p>发布完成不等于结束。接下来 24 小时内的两次巡检比发布本身更能说明问题。</p>
            <blockquote>"任何看似平稳的发布，都有它自己的不平稳。" —— 摘自《Atlas 事故复盘合集》（内部）</blockquote>
            <h3 id="s3-1">读者侧抽样</h3>
            <p>从外部分享链接库中抽取 10 篇近期高频访问文档，依次打开并验证：iframe 渲染正常、目录跳转准确、深色模式切换无闪烁。</p>
            <h3 id="s3-2">团队侧巡检</h3>
            <p>请各空间管理员在 18:00 前确认本空间的新增、重命名、移动操作均工作正常，并在 #ops 频道回报「已确认」。</p>
          `,
        },
      ],
    },
  };

  // tags
  const recent = [
    { id: 'd5', title: '周会笔记 · 5月18日' },
    { id: 'd13', title: 'TODO · Atlas v3' },
    { id: 'd12', title: '阅读笔记 · 现代书籍设计' },
    { id: 'd1', title: 'Atlas v2.4 部署清单' },
    { id: 'd2', title: 'iframe 沙箱安全笔记' },
  ];

  return { members, tree: tree as unknown as FixtureSpace[], docContent, recent };
})();

export type AtlasData = typeof ATLAS_DATA;
