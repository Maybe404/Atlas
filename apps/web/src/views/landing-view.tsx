import { useCallback, useEffect, useRef, useState } from 'react';
import { firstPublicDoc } from '../auth';
import { BrandMark } from '../brand';
import type { Loose } from '../loose-types';

// Atlas 的「封面 / 门面」——访问根域名 `/` 时展示。它刻意不读取任何真实文档：
// 用一组「上下滚动、逐屏切换」的全屏面板，亲手演示 HTML 能带来的交互与视觉冲击，
// 从而回答「为什么 Atlas 要支持 HTML 渲染」。每个面板都是纯 CSS / 少量 JS 的真实
// 互动（流动渐变、光标光斑、滚动生长的图表、实时滑块），而非截图。视觉 token 全部
// 取自 styles.css，与登录页、阅读器同一套语言。

// 滚动到视野内才播放动画——靠 IntersectionObserver 给面板加 `in` 类。
function useReveal(rootRef: Loose) {
  const refs = useRef<Loose[]>([]);
  const register = useCallback((el: Loose) => {
    if (el && !refs.current.includes(el)) refs.current.push(el);
  }, []);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) e.target.classList.add('in');
        }
      },
      { root: rootRef.current, threshold: 0.35 },
    );
    for (const el of refs.current) io.observe(el);
    return () => io.disconnect();
  }, [rootRef]);
  return register;
}

// 面板 1：流动渐变——纯 CSS 的极光，背后没有一张图片、一帧视频。
function GradientPanel({ register }: Loose) {
  return (
    <section ref={register} className="lp lp-gradient" data-eyebrow="01 · 流动渐变">
      <div className="lp-aurora" aria-hidden="true">
        <span className="aurora-blob a1" />
        <span className="aurora-blob a2" />
        <span className="aurora-blob a3" />
        <span className="aurora-blob a4" />
      </div>
      <div className="lp-inner lp-center">
        <div className="lp-kicker">流动渐变</div>
        <h2 className="lp-title onlight">色彩会自己呼吸。</h2>
        <p className="lp-lede onlight">
          这片极光是纯 CSS 实时计算的渐变，没有图片、没有视频——每一帧都在浏览器里生成。 Markdown
          给你纯文本，HTML 给你一整块会流动的画布。
        </p>
      </div>
    </section>
  );
}

// 面板 2：光标光斑 + 倾斜——HTML 会回应你的每一次悬停。
function SpotlightPanel({ register }: Loose) {
  const cardRef = useRef<Loose>(null);
  const onMove = (e: Loose) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - py) * 12}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 14}deg`);
  };
  const onLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return (
    <section ref={register} className="lp lp-spotlight" data-eyebrow="02 · 悬停感知">
      <div className="lp-inner lp-split">
        <div className="lp-copy">
          <div className="lp-kicker">悬停感知</div>
          <h2 className="lp-title">光走到哪，卡片就亮到哪。</h2>
          <p className="lp-lede">
            移动鼠标试试——光斑跟随光标，卡片随之倾斜。这是 HTML 与 CSS 对每一次指针移动的实时回应，
            一份静态文档永远做不到。
          </p>
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: decorative pointer-driven visual */}
        <div ref={cardRef} className="spotlight-card" onMouseMove={onMove} onMouseLeave={onLeave}>
          <div className="spotlight-glow" aria-hidden="true" />
          <div className="spotlight-face">
            <BrandMark size={40} strokeWidth={1.7} />
            <div className="spotlight-name">Atlas</div>
            <div className="spotlight-tag">交互，从悬停开始</div>
            <div className="spotlight-chips">
              <span>:hover</span>
              <span>transform</span>
              <span>radial-gradient</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const BARS = [
  { label: '保真度', v: 96 },
  { label: '交互', v: 88 },
  { label: '排版', v: 92 },
  { label: '动效', v: 80 },
  { label: '可视化', v: 73 },
  { label: '归档', v: 99 },
];

// 面板 3：进入视野即生长的图表——动画由滚动触发。
function VizPanel({ register }: Loose) {
  return (
    <section ref={register} className="lp lp-viz" data-eyebrow="03 · 数据可视化">
      <div className="lp-inner">
        <div className="lp-kicker centered">数据可视化</div>
        <h2 className="lp-title centered">数字会自己生长。</h2>
        <p className="lp-lede centered narrow">
          滚动到这里，柱子才开始往上长——由 IntersectionObserver 在恰当的时刻触发。
          图表、看板、报表，HTML 让数据活了起来。
        </p>
        <div className="viz-chart">
          {BARS.map((b, i) => (
            <div className="viz-col" key={b.label}>
              <div className="viz-bar-wrap">
                <div
                  className="viz-bar"
                  style={{ '--h': `${b.v}%`, '--d': `${i * 90}ms` } as Loose}
                >
                  <span className="viz-val">{b.v}</span>
                </div>
              </div>
              <div className="viz-label">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// 面板 4：实时滑块——状态在浏览器里即时变化，无需刷新。
function ControlPanel({ register }: Loose) {
  const [hue, setHue] = useState(28);
  const [radius, setRadius] = useState(36);
  return (
    <section ref={register} className="lp lp-control" data-eyebrow="04 · 实时交互">
      <div className="lp-inner lp-split">
        <div className="lp-copy">
          <div className="lp-kicker">实时交互</div>
          <h2 className="lp-title">拖动，世界就跟着变。</h2>
          <p className="lp-lede">
            移动滑块，颜色与形状即时响应——状态完全活在浏览器里，没有一次往返服务器。
            这种「所见即所改」的体验，正是 HTML 的拿手好戏。
          </p>
          <div className="control-rows">
            <label className="control-row">
              <span className="control-name">色相</span>
              <input
                type="range"
                min={0}
                max={360}
                value={hue}
                onChange={(e) => setHue(Number(e.target.value))}
              />
              <span className="control-num">{hue}°</span>
            </label>
            <label className="control-row">
              <span className="control-name">圆角</span>
              <input
                type="range"
                min={0}
                max={50}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
              <span className="control-num">{radius}%</span>
            </label>
          </div>
        </div>
        <div className="control-stage">
          <div
            className="control-shape"
            style={
              {
                borderRadius: `${radius}%`,
                background: `linear-gradient(140deg, hsl(${hue} 85% 62%), hsl(${(hue + 60) % 360} 85% 55%))`,
                boxShadow: `0 30px 70px -20px hsl(${hue} 70% 45% / 0.55)`,
              } as Loose
            }
          />
          <code className="control-code">hsl({hue} 85% 62%)</code>
        </div>
      </div>
    </section>
  );
}

const FORMAT_COMPARE = [
  { dim: '版式自由度', md: '受限于固定语法', html: '不设上限' },
  { dim: '交互与动效', md: '基本没有', html: '原生支持' },
  { dim: '呈现保真度', md: '依赖渲染主题', html: '导出即定稿' },
  { dim: '复杂结构', md: '退化成纯文本', html: '表格 / SVG / 组件' },
];

export function LandingView({ spaces = [], user, readerHome, onNavigate, onLogin }: Loose) {
  const scrollRef = useRef<Loose>(null);
  const register = useReveal(scrollRef);

  const enterReading = useCallback(() => {
    if (user && readerHome) {
      onNavigate(readerHome);
      return;
    }
    const target = firstPublicDoc(spaces as never);
    onNavigate({ view: 'reader', spaceId: target.spaceId, docId: target.docId });
  }, [user, readerHome, spaces, onNavigate]);

  return (
    <div className="landing-screen" ref={scrollRef}>
      <header className="landing-topbar">
        <div className="landing-brand">
          <span className="landing-brand-mark">
            <BrandMark size={22} strokeWidth={1.9} />
          </span>
          <span className="landing-brand-name">Atlas</span>
        </div>
        <button type="button" className="landing-top-login" onClick={onLogin}>
          登录
        </button>
      </header>

      {/* 面板 0：序幕 */}
      <section className="lp lp-hero">
        <div className="lp-bg" aria-hidden="true">
          <span className="hero-blob b1" />
          <span className="hero-blob b2" />
          <span className="hero-blob b3" />
        </div>
        <div className="lp-inner">
          <div className="lp-kicker">空间 · 文档 · 阅读</div>
          <h1 className="landing-headline">
            为认真的文档，
            <br />
            准备一处沉静的空间。
          </h1>
          <p className="landing-lede">
            Atlas 是一个面向团队的文档协作后台。它既优雅地渲染 Markdown，也忠实地呈现完整的
            HTML——往下滚动，亲手感受 HTML 能带来的交互与视觉冲击。
          </p>
          <div className="landing-cta">
            <button type="button" className="landing-cta-primary" onClick={enterReading}>
              {user ? '进入工作台' : '开始阅读'}
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h9M8.5 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {!user && (
              <button type="button" className="landing-cta-ghost" onClick={onLogin}>
                团队成员登录
              </button>
            )}
          </div>
        </div>
        <div className="lp-scroll-hint" aria-hidden="true">
          <span>向下滚动</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M4 9l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </section>

      <GradientPanel register={register} />
      <SpotlightPanel register={register} />
      <VizPanel register={register} />
      <ControlPanel register={register} />

      {/* 终幕：对比 + CTA */}
      <section ref={register} className="lp lp-finale" data-eyebrow="05 · 两者都要">
        <div className="lp-inner">
          <div className="lp-kicker centered">纯文本写得快，HTML 呈现得准</div>
          <h2 className="lp-title centered">Atlas 两者都要。</h2>
          <div className="landing-compare">
            <div className="landing-compare-row landing-compare-head">
              <span className="landing-compare-dim" />
              <span className="landing-compare-cell">Markdown</span>
              <span className="landing-compare-cell landing-compare-cell-html">HTML</span>
            </div>
            {FORMAT_COMPARE.map((row) => (
              <div key={row.dim} className="landing-compare-row">
                <span className="landing-compare-dim">{row.dim}</span>
                <span className="landing-compare-cell">{row.md}</span>
                <span className="landing-compare-cell landing-compare-cell-html">{row.html}</span>
              </div>
            ))}
          </div>
          <div className="landing-cta centered">
            <button type="button" className="landing-cta-primary" onClick={enterReading}>
              {user ? '进入工作台' : '开始阅读'}
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h9M8.5 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="landing-foot-tag centered">Atlas · 空间 · 权限 · 文档协作</div>
        </div>
      </section>
    </div>
  );
}
