import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Loose } from '../loose-types';

// Atlas 的「封面 / 门面」——访问根域名 `/` 时展示。设计移植自一份 Design Component
// 模板（@tmp/Atlas 封面.dc.html + @tmp/support.js），这里手动重写为 React：
// 8 个 100vh 的 snap 面板，依次介绍 Atlas 对 HTML 渲染的支持；hero 上有
// 「进入阅读」「看看它能做什么」两个按钮，前者跳转到第一个有权限的空间目录。
// 封面不主动提示登录——用户从内部 chrome 的左上角 Atlas 标志点回封面。
// 视觉是独立的暖色（cream / 焦糖橙）设计语言，与 app 内部 chrome 区分。

const SECTIONS = [
  { key: 'hero', label: '封面' },
  { key: 'data', label: '数据' },
  { key: 'space', label: '空间' },
  { key: 'fold', label: '收放' },
  { key: 'ctl', label: '上手' },
  { key: 'layout', label: '版面' },
  { key: 'flow', label: '流动' },
  { key: 'cta', label: '开始' },
];

const BAR_DATA = [
  { l: 'JAN', v: 42 },
  { l: 'FEB', v: 51 },
  { l: 'MAR', v: 49 },
  { l: 'APR', v: 67 },
  { l: 'MAY', v: 80 },
  { l: 'JUN', v: 96 },
];

const PRINCIPAL = 10000;
const RATE = 0.08;
const MAX_YEARS = 30;

// ───────────────────────────────────────────────────────────────────────
// HERO
// ───────────────────────────────────────────────────────────────────────
function Hero({ onEnter, onNext }: Loose) {
  return (
    <section data-section-index="0" data-screen-label="封面" className="cover-section cover-hero">
      {/* Orbital decoration: three counter-rotating rings with markers and a
          stationary center — replaces the dc.html's single ~dead ring. Each
          ring spins at a different speed so the marks never realign. */}
      <div className="cover-orbits" aria-hidden="true">
        <div className="cover-orbit cover-orbit-1">
          <span className="cover-orbit-marker" />
        </div>
        <div className="cover-orbit cover-orbit-2">
          <span className="cover-orbit-marker" />
        </div>
        <div className="cover-orbit cover-orbit-3">
          <span className="cover-orbit-marker" />
        </div>
        <div className="cover-orbit-center">A</div>
      </div>
      <div className="cover-hero-grid">
        <div>
          <div className="cover-kicker">HTML 渲染系统 · RENDER ENGINE</div>
          <h1 className="cover-title">
            内容，值得
            <br />
            <em>更好的载体</em>
          </h1>
          <p className="cover-lede">
            上传大模型生成、或你亲手写好的 HTML 文章，Atlas 用 iframe
            原样渲染——视觉、读感、交互，分毫不差地交到读者眼前。
          </p>
          <div className="cover-cta">
            <button
              type="button"
              data-magnetic
              className="cover-btn cover-btn-primary"
              onClick={onEnter}
            >
              进入阅读
            </button>
            <button
              type="button"
              data-magnetic
              className="cover-btn cover-btn-ghost"
              onClick={onNext}
            >
              看看它能做什么 ↓
            </button>
          </div>
        </div>
        <div className="cover-hero-collage">
          <div className="cover-float-card cover-float-a">
            <div className="cover-float-card-head">
              <span>完读率</span>
              <span className="cover-live-pill">LIVE</span>
            </div>
            <div className="cover-float-card-bars">
              <div className="cover-float-bar" style={{ flex: 1, height: '38%' }} />
              <div className="cover-float-bar" style={{ flex: 1, height: '56%' }} />
              <div className="cover-float-bar" style={{ flex: 1, height: '46%' }} />
              <div className="cover-float-bar" style={{ flex: 1, height: '78%' }} />
              <div
                className="cover-float-bar cover-float-bar-accent"
                style={{ flex: 1, height: '100%' }}
              />
            </div>
            <div className="cover-float-card-foot">
              +38<span>%</span>
            </div>
          </div>
          <div className="cover-float-card cover-float-card-dark cover-float-b">
            <div className="cover-float-code">
              <span className="cover-float-code-tag">&lt;article&gt;</span>
              <br />
              &nbsp;&nbsp;<span className="cover-float-code-attr">交互</span> ·{' '}
              <span className="cover-float-code-attr">动效</span>
              <br />
              &nbsp;&nbsp;<span className="cover-float-code-attr">版面</span> ·{' '}
              <span className="cover-float-code-attr">图表</span>
              <br />
              <span className="cover-float-code-tag">&lt;/article&gt;</span>
            </div>
          </div>
          <div className="cover-float-card cover-float-c">
            <div className="cover-float-3d-glyph">3D</div>
            <div>
              <div className="cover-float-3d-name">随光标倾斜</div>
              <div className="cover-float-3d-tag">移动鼠标试试 →</div>
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="cover-hero-scroll-hint"
        onClick={onNext}
        aria-label="向下滚动到下一节"
      >
        <span>SCROLL · 六种表达</span>
        <span className="cover-hero-scroll-hint-arrow">↓</span>
      </button>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 01 数据图表 — bars that grow on scroll + hover tooltip
// ───────────────────────────────────────────────────────────────────────
function DataSection() {
  return (
    <section data-section-index="1" data-screen-label="01 数据图表" className="cover-section">
      <div className="cover-section-num cover-section-num-1">01</div>
      <div className="cover-data-grid">
        <div>
          <div className="cover-kicker">01 — 会动的数据</div>
          <h2 className="cover-h2">
            数字，不该
            <br />
            只是躺在那里
          </h2>
          <p className="cover-lede cover-lede-narrow">
            Markdown 里，图表只能是一张截图——你看到的，是别人画好的结论。在 Atlas
            里，它会生长、会回应你的光标，每个数据点都触手可及。
          </p>
          <div className="cover-md-html-row">
            <span className="cover-md-html-pill cover-md-html-struck">MD：一张静态图片</span>
            <span className="cover-md-html-arrow">→</span>
            <span className="cover-md-html-pill cover-md-html-good">HTML：会动、可悬停</span>
          </div>
        </div>
        <div className="cover-data-card">
          <div className="cover-data-card-head">
            <div>
              <div className="cover-data-card-title">读者读完率</div>
              <div className="cover-data-card-value">
                <span data-count="96">96</span>
                <span>%</span>
              </div>
            </div>
            <div className="cover-data-card-right">
              <div className="cover-live-pill">LIVE</div>
              <div className="cover-data-card-up">
                较上线提升{' '}
                <strong>
                  <span data-count="38">38</span>%
                </strong>
              </div>
            </div>
          </div>
          <div className="cover-data-chart">
            <div className="cover-data-grid-line" style={{ top: 0 }} />
            <div className="cover-data-grid-line" style={{ top: '50%' }} />
            <div className="cover-data-grid-line" style={{ top: '75%' }} />
            <div className="cover-data-bars">
              {BAR_DATA.map((b, i) => (
                <div className="cover-data-bar-col" key={b.l}>
                  <div className="cover-data-bar-tip">{b.v}%</div>
                  <div className="cover-data-bar-wrap">
                    <div
                      className={`cover-data-bar${i === BAR_DATA.length - 1 ? ' cover-data-bar-accent' : ''}`}
                      style={{ height: `${b.v}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="cover-data-labels">
            {BAR_DATA.map((b) => (
              <div className="cover-data-label" key={b.l}>
                {b.l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 02 空间层次 — 3D tilt card
// ───────────────────────────────────────────────────────────────────────
function SpaceSection() {
  return (
    <section data-section-index="2" data-screen-label="02 空间层次" className="cover-section">
      <div className="cover-section-num cover-section-num-2">02</div>
      <div className="cover-tilt-grid">
        <div className="cover-tilt-card" data-tilt>
          <div className="cover-tilt-inner" data-tilt-inner>
            <div className="cover-tilt-glow" />
            <div className="cover-tilt-tag">INTERACTIVE CARD</div>
            <div className="cover-tilt-h">
              随你的视线
              <br />
              倾斜的内容
            </div>
            <div className="cover-tilt-desc">
              移动鼠标，看它如何回应你——光影、远近、层次，都在指尖之下活了起来。
            </div>
            <div className="cover-tilt-cta">把鼠标放上来 →</div>
          </div>
        </div>
        <div>
          <div className="cover-kicker">02 — 有空间的内容</div>
          <h2 className="cover-h2">
            平面之上，
            <br />
            还有层次
          </h2>
          <p className="cover-lede cover-lede-narrow">
            Markdown 是一张平铺的纸——所有内容都压在同一个平面上。HTML
            让内容拥有空间：随视线倾斜、有光影、有远近，阅读因此有了质感。
          </p>
          <div className="cover-md-html-row">
            <span className="cover-md-html-pill cover-md-html-struck">MD：一张平的纸</span>
            <span className="cover-md-html-arrow">→</span>
            <span className="cover-md-html-pill cover-md-html-good">HTML：有空间、会响应</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 03 收放自如 — collapsible details
// ───────────────────────────────────────────────────────────────────────
function FoldSection() {
  const faqs = [
    {
      q: '为什么 HTML 比 Markdown 更适合阅读？',
      a: '因为阅读不只是文字。HTML 能控制字号、栏宽、配色与节奏，还能加入图表、动画与交互——读者获取信息更快，也更愿意把内容读完。',
    },
    {
      q: '大模型生成的 HTML，能直接用吗？',
      a: '可以。把它交给 Atlas，我们用 iframe 原模原样地渲染——你写的、模型生成的，呈现出来就是它本来的样子。',
    },
    {
      q: '这个平滑的展开，Markdown 能做吗？',
      a: '不能。Markdown 没有原生的折叠与交互，它只是一段静态文本。而你眼前这个平滑展开的动效，就是纯 HTML 写就的。',
    },
  ];
  return (
    <section data-section-index="3" data-screen-label="03 收放自如" className="cover-section">
      <div className="cover-section-num cover-section-num-3">03</div>
      <div className="cover-fold-grid">
        <div>
          <div className="cover-kicker">03 — 收放自如</div>
          <h2 className="cover-h2">
            长，不等于
            <br />
            难读
          </h2>
          <p className="cover-lede cover-lede-narrow">
            Markdown 把一切摊开，再长也得从头划到尾。HTML
            让读者按需展开——主线清爽，细节随时取用。试着点开右边。
          </p>
          <div className="cover-md-html-row">
            <span className="cover-md-html-pill cover-md-html-struck">MD：全部摊开</span>
            <span className="cover-md-html-arrow">→</span>
            <span className="cover-md-html-pill cover-md-html-good">HTML：平滑收放</span>
          </div>
        </div>
        <div className="cover-fold-list">
          {faqs.map((f, i) => (
            <details className="cover-fold-item" key={f.q} open={i === 0}>
              <summary>
                <span className="cover-fold-item-num">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {f.q}
                </span>
                <span className="cover-fold-item-toggle">＋</span>
              </summary>
              <div className="cover-fold-item-body">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 04 可以上手 — interactive calculator
// ───────────────────────────────────────────────────────────────────────
function ControlSection({ years, setYears, fv, fvW }: Loose) {
  return (
    <section data-section-index="4" data-screen-label="04 可以上手" className="cover-section">
      <div className="cover-section-num cover-section-num-4">04</div>
      <div className="cover-ctl-grid">
        <div className="cover-ctl-card">
          <div className="cover-ctl-card-head">
            <span>本金 ¥10,000 · 年化 8%</span>
            <span className="cover-pill">可拖动</span>
          </div>
          <div className="cover-ctl-card-value">¥{fv}</div>
          <div className="cover-ctl-card-sub">
            <strong>{years} 年</strong>后的价值
          </div>
          <div className="cover-ctl-bar">
            <div className="cover-ctl-bar-fill" style={{ width: `${fvW}%` }} />
          </div>
          <div className="cover-ctl-bar-labels">
            <span>1 年</span>
            <span>{MAX_YEARS} 年</span>
          </div>
          <input
            className="cover-ctl-range"
            type="range"
            min={1}
            max={MAX_YEARS}
            step={1}
            value={years}
            onChange={(e: Loose) => setYears(Number(e.target.value))}
            aria-label="投资年限"
          />
          <div className="cover-ctl-hint">← 拖动滑块，结果实时变化 →</div>
        </div>
        <div>
          <div className="cover-kicker">04 — 可以上手</div>
          <h2 className="cover-h2">
            让读者动手，
            <br />
            而不只是读
          </h2>
          <p className="cover-lede cover-lede-narrow">
            Markdown 只能写死一个数字。HTML 把控制权交给读者——拖一下，结果立刻变；理解，发生在指尖。
          </p>
          <div className="cover-md-html-row">
            <span className="cover-md-html-pill cover-md-html-struck">MD：写死一个数</span>
            <span className="cover-md-html-arrow">→</span>
            <span className="cover-md-html-pill cover-md-html-good">HTML：即时计算</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 05 版面 — magazine layout
// ───────────────────────────────────────────────────────────────────────
function LayoutSection() {
  return (
    <section data-section-index="5" data-screen-label="05 版面" className="cover-section">
      <div className="cover-section-num cover-section-num-5">05</div>
      <div className="cover-layout-wrap">
        <div className="cover-layout-head">
          <div>
            <div className="cover-kicker">05 — 真正的版面</div>
            <h2 className="cover-h2">排版，是内容的语气</h2>
          </div>
          <div className="cover-md-html-row" style={{ marginTop: 0 }}>
            <span className="cover-md-html-pill cover-md-html-struck">MD：线性堆叠</span>
            <span className="cover-md-html-arrow">→</span>
            <span className="cover-md-html-pill cover-md-html-good">HTML：杂志级版面</span>
          </div>
        </div>
        <div className="cover-layout-card">
          <p className="cover-layout-prose">
            在纸面上，编辑用字号、栏宽与留白引导你的视线；好的版面，会替你决定先看什么、再看什么。Markdown
            把这一切抹平成一串等宽的段落，每一行都长得一样，读起来像在爬一段没有尽头的楼梯。
            <br />
            <br />而 HTML
            把版面的全部权力还给了内容——首字下沉、双栏阅读、图文环绕，节奏由你掌控。文字因此有了轻重缓急，也有了语气。
          </p>
          <div>
            <div className="cover-layout-fig">
              <div className="cover-layout-fig-caption">FIG.1 — 图文环绕 · 留白 · 节奏</div>
            </div>
            <blockquote className="cover-layout-quote">
              “排版不是装饰，
              <br />
              是内容的语气。”
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// 06 流动 — MD vs HTML toggle
// ───────────────────────────────────────────────────────────────────────
function FlowSection({ showHtml, setShowHtml }: Loose) {
  return (
    <section data-section-index="6" data-screen-label="06 流动" className="cover-section">
      <div className="cover-section-num cover-section-num-6">06</div>
      <div className="cover-flow-wrap">
        <div className="cover-flow-h-decor">06 — 会呼吸的页面</div>
        <h2 className="cover-flow-h">静止的纸，还是流动的光</h2>
        <p className="cover-flow-lede">同一篇内容，两种呈现。点一下切换，看看差别。</p>
        <div className="cover-flow-tabs">
          <div
            className="cover-flow-tabs-pill"
            style={{ transform: `translateX(${showHtml ? '100%' : '0%'})` }}
          />
          <button
            type="button"
            className={`cover-flow-tab${!showHtml ? ' is-active' : ''}`}
            onClick={() => setShowHtml(false)}
          >
            Markdown
          </button>
          <button
            type="button"
            className={`cover-flow-tab${showHtml ? ' is-active' : ''}`}
            onClick={() => setShowHtml(true)}
          >
            HTML · Atlas
          </button>
        </div>
        <div className="cover-flow-stage">
          <div
            className="cover-flow-md"
            style={{ opacity: showHtml ? 0 : 1, pointerEvents: showHtml ? 'none' : 'auto' }}
          >
            <div className="cover-flow-md-title"># 季度增长报告</div>
            <div className="cover-flow-md-body">
              - 营收同比 +96%
              <br />- 读完率持续上升
              <br />- ![增长图表](chart.png)
              <br />
              &gt; 一切都在变好。
            </div>
            <div className="cover-flow-md-tag">纯文本 · 静止 · 无交互</div>
          </div>
          <div
            className="cover-flow-html"
            style={{ opacity: showHtml ? 1 : 0, pointerEvents: showHtml ? 'auto' : 'none' }}
          >
            <div className="cover-flow-html-h">季度增长报告</div>
            <div className="cover-flow-html-pill">营收同比 +96%</div>
            <div className="cover-flow-html-bars">
              <div className="cover-flow-html-bar" style={{ height: '42%' }} />
              <div
                className="cover-flow-html-bar"
                style={{ height: '62%', animationDelay: '.2s' }}
              />
              <div
                className="cover-flow-html-bar"
                style={{ height: '80%', animationDelay: '.4s' }}
              />
              <div
                className="cover-flow-html-bar cover-flow-html-bar-accent"
                style={{ height: '100%', animationDelay: '.6s' }}
              />
            </div>
            <div className="cover-flow-html-tag">彩色 · 会动 · 可交互</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// CTA
// ───────────────────────────────────────────────────────────────────────
function CtaSection({ onEnter, onTop }: Loose) {
  return (
    <section
      data-section-index="7"
      data-screen-label="开始"
      className="cover-section cover-section-cta"
    >
      <div className="cover-cta-mark" aria-hidden="true">
        A
      </div>
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 720, padding: '0 50px' }}>
        <div className="cover-cta-eyebrow">开始使用 ATLAS</div>
        <h2 className="cover-cta-h">
          把你的 HTML，
          <br />
          <em>交给 Atlas</em>
        </h2>
        <p className="cover-cta-p">
          上传大模型生成、或你亲手写好的 HTML 文章，Atlas 用 iframe
          原模原样地渲染——你看到的，就是读者看到的。
        </p>
        <div className="cover-cta cover-cta-centered">
          <button
            type="button"
            data-magnetic
            className="cover-btn cover-btn-primary"
            onClick={onEnter}
          >
            进入阅读
          </button>
          <button type="button" data-magnetic className="cover-btn cover-btn-ghost" onClick={onTop}>
            回到顶部 ↑
          </button>
        </div>
        <div className="cover-cta-foot">ATLAS · HTML 渲染系统 — 让每一篇文章都值得被读完</div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Side nav · 8 dots, one per section
// ───────────────────────────────────────────────────────────────────────
function SideNav({ active, goTo }: Loose) {
  return (
    <nav className="cover-side-nav" aria-label="封面章节">
      {SECTIONS.map((s, i) => (
        <button
          type="button"
          key={s.key}
          className={`cover-side-nav-dot${active === i ? ' is-active' : ''}`}
          onClick={() => goTo(i)}
          title={s.label}
          aria-label={`跳转到 ${s.label}`}
          aria-current={active === i ? 'true' : undefined}
        />
      ))}
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Count-up · animates a numeric element once it enters the viewport
// ───────────────────────────────────────────────────────────────────────
function useCountUp(rootRef: React.RefObject<Loose>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll('[data-count]');
    if (targets.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const to = parseFloat(el.dataset.count || '0');
          const dur = 1200;
          const t0 = performance.now();
          const step = (t: number) => {
            const k = Math.min(1, (t - t0) / dur);
            const eased = 0.5 - Math.cos(k * Math.PI) / 2;
            el.textContent = String(Math.round(to * eased));
            if (k < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
          io.unobserve(el);
        }
      },
      { root, threshold: 0.5 },
    );
    targets.forEach((t: Element) => {
      io.observe(t);
    });
    return () => io.disconnect();
  }, [rootRef]);
}

// ───────────────────────────────────────────────────────────────────────
// Tilt + glow: each card with [data-tilt] rotates toward the pointer
// ───────────────────────────────────────────────────────────────────────
function useTilt(rootRef: React.RefObject<Loose>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = root.querySelectorAll('[data-tilt]');
    if (cards.length === 0) return;
    const cleanups: Array<() => void> = [];
    cards.forEach((card: Element) => {
      const inner = card.querySelector('[data-tilt-inner]');
      const onMove = (ev: MouseEvent) => {
        const r = (card as HTMLElement).getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        if (inner) {
          (inner as HTMLElement).style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 14}deg)`;
        }
        (card as HTMLElement).style.setProperty('--gx', `${px * 100 + 50}%`);
        (card as HTMLElement).style.setProperty('--gy', `${py * 100 + 50}%`);
      };
      const onLeave = () => {
        if (inner) (inner as HTMLElement).style.transform = 'rotateY(0deg) rotateX(0deg)';
      };
      card.addEventListener('mousemove', onMove as EventListener);
      card.addEventListener('mouseleave', onLeave as EventListener);
      cleanups.push(() => {
        card.removeEventListener('mousemove', onMove as EventListener);
        card.removeEventListener('mouseleave', onLeave as EventListener);
      });
    });
    return () => {
      cleanups.forEach((c) => {
        c();
      });
    };
  }, [rootRef]);
}

// ───────────────────────────────────────────────────────────────────────
// Magnetic buttons: nudge toward the cursor
// ───────────────────────────────────────────────────────────────────────
function useMagnetic(rootRef: React.RefObject<Loose>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const buttons = root.querySelectorAll('[data-magnetic]');
    if (buttons.length === 0) return;
    const cleanups: Array<() => void> = [];
    buttons.forEach((b: Element) => {
      const onMove = (e: MouseEvent) => {
        const r = (b as HTMLElement).getBoundingClientRect();
        (b as HTMLElement).style.transition = 'transform .1s ease';
        (b as HTMLElement).style.transform = `translate(${
          (e.clientX - r.left - r.width / 2) * 0.25
        }px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
      };
      const onLeave = () => {
        (b as HTMLElement).style.transition = 'transform .35s cubic-bezier(.2,.7,.2,1)';
        (b as HTMLElement).style.transform = 'translate(0, 0)';
      };
      b.addEventListener('mousemove', onMove as EventListener);
      b.addEventListener('mouseleave', onLeave as EventListener);
      cleanups.push(() => {
        b.removeEventListener('mousemove', onMove as EventListener);
        b.removeEventListener('mouseleave', onLeave as EventListener);
      });
    });
    return () => {
      cleanups.forEach((c) => {
        c();
      });
    };
  }, [rootRef]);
}

// ───────────────────────────────────────────────────────────────────────
// Custom cursor: tracks the pointer, scales up over interactive elements
// ───────────────────────────────────────────────────────────────────────
function useCursor(cursorRef: React.RefObject<Loose>) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer:coarse)').matches) return;
    const cur = cursorRef.current;
    if (!cur) return;
    const pos = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      tx: window.innerWidth / 2,
      ty: window.innerHeight / 2,
    };
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      pos.tx = e.clientX;
      pos.ty = e.clientY;
      cur.style.opacity = '1';
    };
    const tick = () => {
      pos.x += (pos.tx - pos.x) * 0.18;
      pos.y += (pos.ty - pos.y) * 0.18;
      cur.style.transform = `translate(${pos.x - 15}px, ${pos.y - 15}px)`;
      raf = requestAnimationFrame(tick);
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('button, a, summary, input, [role=button]')) cur.classList.add('is-hover');
    };
    const onOut = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('button, a, summary, input, [role=button]')) cur.classList.remove('is-hover');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    window.addEventListener('mouseout', onOut);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
      window.removeEventListener('mouseout', onOut);
    };
  }, [cursorRef]);
}

// ───────────────────────────────────────────────────────────────────────
// Main cover view
// ───────────────────────────────────────────────────────────────────────
export function LandingView({ spaces = [], onNavigate }: Loose) {
  const [active, setActive] = useState(0);
  const [years, setYears] = useState(8);
  const [showHtml, setShowHtml] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  // First readable space → cover CTA target. With nothing readable the cover
  // doesn't have a meaningful destination, so we fall back to the first space
  // by id (even an empty directory is a real page).
  const firstSpace = useMemo(() => {
    const list = spaces as Array<{ id?: string }>;
    return list.find((s) => Boolean(s?.id)) ?? null;
  }, [spaces]);

  const enterReading = useCallback(() => {
    if (firstSpace?.id) {
      onNavigate({ view: 'space', spaceId: firstSpace.id });
    }
  }, [firstSpace, onNavigate]);

  const goTo = useCallback((i: number) => {
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-section-index="${i}"]`) as HTMLElement | null;
    if (target) root.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
  }, []);

  const next = useCallback(() => goTo(1), [goTo]);
  const top = useCallback(() => goTo(0), [goTo]);

  // Active section: 55% visibility within the scroll container
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.sectionIndex);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { root, threshold: 0.55 },
    );
    root.querySelectorAll('[data-section-index]').forEach((el: Element) => {
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  useCountUp(scrollRef);
  useTilt(scrollRef);
  useMagnetic(scrollRef);
  useCursor(cursorRef);

  // Financial values (memo'd — the slider is the only dep that changes)
  const { fv, fvW } = useMemo(() => {
    const value = Math.round(PRINCIPAL * (1 + RATE) ** years);
    const max = Math.round(PRINCIPAL * (1 + RATE) ** MAX_YEARS);
    return {
      fv: value.toLocaleString('en-US'),
      fvW: Math.max(4, (value / max) * 100),
    };
  }, [years]);

  return (
    <div className="cover-shell">
      <div className="cover-bg-gradient" aria-hidden="true" />
      <div className="cover-bg-dots" aria-hidden="true" />
      <div className="cover-bg-orb cover-bg-orb-1" aria-hidden="true" />
      <div className="cover-bg-orb cover-bg-orb-2" aria-hidden="true" />

      <div className="cover-progress" aria-hidden="true" />
      <div ref={cursorRef} className="cover-cursor" aria-hidden="true" />

      <div ref={scrollRef} className="cover-scroll">
        <Hero onEnter={enterReading} onNext={next} />
        <DataSection />
        <SpaceSection />
        <FoldSection />
        <ControlSection years={years} setYears={setYears} fv={fv} fvW={fvW} />
        <LayoutSection />
        <FlowSection showHtml={showHtml} setShowHtml={setShowHtml} />
        <CtaSection onEnter={enterReading} onTop={top} />
      </div>

      <div className="cover-brand-fixed" aria-hidden="true">
        <span className="cover-brand-mark">A</span>
        <span className="cover-brand-name">Atlas</span>
      </div>

      <SideNav active={active} goTo={goTo} />
    </div>
  );
}
