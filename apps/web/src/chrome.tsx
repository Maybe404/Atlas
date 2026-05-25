// @ts-nocheck — migrated verbatim from JSX prototype; incrementally type later.
// Atlas chrome — coral warm-default, folder theme switch, animated tree
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { canRead, UserMenu } from './auth';

// Icons (SF-style: hairlines, rounded caps)
const I = {
  chev:    (p={}) => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}><path d="M3.5 2 7 5 3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevDn:  (p={}) => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}><path d="M2 3.5 5 7 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search:  (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4"/><path d="M9.3 9.3 12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  plus:    (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  more:    (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/></svg>,
  close:   (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><path d="m2.8 2.8 6.4 6.4M9.2 2.8l-6.4 6.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  share:   (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M7 1.5v7M7 1.5 4.7 3.8M7 1.5 9.3 3.8M2.5 7v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  link:    (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M6 8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L7 3.5M8 6a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5L7 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  moon:    (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M11 8.5A4.5 4.5 0 1 1 5.5 3a4 4 0 0 0 5.5 5.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  sun:     (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M11.2 2.8l-1.1 1.1M3.9 10.1l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  upload:  (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M7 9.5V2.5M7 2.5 4.5 5M7 2.5 9.5 5M2.5 9.5V11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  doc:     (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M3 2h5l3 3v7H3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 2v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  folder:  (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M2 4a1 1 0 0 1 1-1h2.5l1 1.2H11a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  trash:   (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 7.5h5L10 4M6 6.5v4M8 6.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  settings:(p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6 11 11M11 3 9.6 4.4M4.4 9.6 3 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  arrow:   (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><path d="M3 6h6M6.5 3.5 9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  globe:   (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 7h10M7 2a7 7 0 0 1 0 10A7 7 0 0 1 7 2z" stroke="currentColor" strokeWidth="1.3"/></svg>,
  lock:    (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><rect x="2.5" y="5.5" width="7" height="5.5" stroke="currentColor" strokeWidth="1.3" rx="1"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" stroke="currentColor" strokeWidth="1.3"/></svg>,
  check:   (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><path d="m2.5 6.5 2.5 2.5L9.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  refresh: (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}><path d="M2 6a4 4 0 0 1 7-2.6M10 6a4 4 0 0 1-7 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9 1.5v2.2H6.8M3 10.5V8.3h2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  layers:  (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><path d="M7 2l5 2.5L7 7 2 4.5 7 2zM2 7l5 2.5L12 7M2 9.5 7 12l5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  members: (p={}) => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" {...p}><circle cx="5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.3"/><path d="M1.5 12c.4-2 1.8-3.2 3.5-3.2s3.1 1.2 3.5 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="10.5" cy="4.5" r="1.7" stroke="currentColor" strokeWidth="1.3"/><path d="M9 10.5c.2-1.4 1-2.3 2-2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};
export { I };

function BrandGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 13L8 3l5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 9.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

function Topbar({ ctx, spaces = [], visible = true, onSearch, onTheme, theme, onNavigate, onShare, user, onLogin, onLogout, onSwitchUser }) {
  const isReader = ctx.view === 'reader';
  const space = spaces.find(s => s.id === ctx.spaceId) || spaces[0] || { name: '空间' };
  const doc = spaces.flatMap(s => s.children || []).find(d => d.id === ctx.docId);
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-glyph"><BrandGlyph/></div>
        <div className="brand-name">Atlas</div>
      </div>

      <div className="breadcrumb">
        {isReader && (
          <>
            <span className="crumb" onClick={() => onNavigate({view:'admin-docs'})}>{space.name}</span>
            <span className="sep">/</span>
            <span className="current">{doc?.title || '文档'}</span>
          </>
        )}
        {ctx.view === 'admin-docs' && (<><span className="crumb">团队后台</span><span className="sep">/</span><span className="current">文档</span></>)}
        {ctx.view === 'admin-upload' && (<><span className="crumb" onClick={()=>onNavigate({view:'admin-docs'})}>团队后台</span><span className="sep">/</span><span className="current">上传</span></>)}
        {ctx.view === 'admin-settings' && (<><span className="crumb">团队后台</span><span className="sep">/</span><span className="current">空间设置</span></>)}
      </div>

      <button className="search-trigger" onClick={onSearch}>
        <I.search/>
        <span>搜索文档、命令、成员</span>
        <span className="kbd">⌘ K</span>
      </button>

      {isReader && user && (
        <button className="btn primary" onClick={onShare}>
          <I.share/><span>分享</span>
        </button>
      )}

      <button className="icon-btn theme-trigger-btn" title="切换主题" aria-label="切换主题" style={{padding:0, width: 36, height: 36}}>
        <ThemePicker theme={theme} onTheme={onTheme}/>
      </button>
      <UserMenu
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        onSwitch={onSwitchUser}
      />
    </header>
  );
}
export { Topbar };

// ─────────────────────────────────────────────────────────────────────────
// THEME PICKER — sun/moon trigger; 3 papers fan out with the same animation
// ─────────────────────────────────────────────────────────────────────────
function ThemePicker({ theme, onTheme }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (which) => (e) => {
    e.stopPropagation();
    onTheme(which);
    setTimeout(() => setOpen(false), 240);
  };

  // active glyph: sun for light, sunburst for warm, moon for dark
  const ActiveIcon = () => {
    if (theme === 'dark') return <I.moon/>;
    if (theme === 'warm') return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M7 1.5v1.5M7 11v1.5M1.5 7H3M11 7h1.5M2.7 2.7l1.1 1.1M10.2 10.2l1.1 1.1M11.3 2.7l-1.1 1.1M3.8 10.2l-1.1 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    );
    return <I.sun/>;
  };

  return (
    <div className={"theme-picker-wrap " + (open ? 'open' : '')} ref={wrapRef}>
      {/* fanning papers — same animation as the old folder */}
      <div
        className={"tf-paper p1 " + (theme === 'light' ? 'active' : '')}
        onClick={pick('light')}
        title="浅色"
      >
        <span className="tf-paper-glyph"><I.sun/></span>
      </div>
      <div
        className={"tf-paper p2 " + (theme === 'warm' ? 'active' : '')}
        onClick={pick('warm')}
        title="暖色"
      >
        <span className="tf-paper-glyph">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M7 1.5v1.5M7 11v1.5M1.5 7H3M11 7h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </span>
      </div>
      <div
        className={"tf-paper p3 " + (theme === 'dark' ? 'active' : '')}
        onClick={pick('dark')}
        title="深色"
      >
        <span className="tf-paper-glyph"><I.moon/></span>
      </div>

      {/* trigger — sun/moon glyph */}
      <span
        className={"theme-picker-trigger " + (open ? 'open' : '')}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <ActiveIcon/>
      </span>
    </div>
  );
}

function Sidebar({ ctx, spaces, user, collapsed, onToggleCollapse, onNavigate }) {
  // Open every space by default so the directory reads as a single list
  const initialExpanded = useMemo(() => {
    const m = {};
    spaces.forEach(s => { m[s.id] = true; });
    return m;
  }, [spaces.length]);
  const [expanded, setExpanded] = useState(initialExpanded);
  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  // re-key the inner animated wrappers on (un)collapse so items stagger in again
  const collapseEpoch = collapsed ? 'c' : 'o';

  return (
    <aside className={"sidebar " + (collapsed ? 'sidebar-out' : '')}>
      <button
        className="sidebar-collapse-btn"
        title={collapsed ? '展开目录' : '收起目录'}
        onClick={onToggleCollapse}
        aria-label="切换目录"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 3.5 5 7l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div className="side-card tree tree-only" key={'spaces-' + collapseEpoch}>
        <div className="tree-section-head">
          <span>目录</span>
        </div>
        <AnimatedTreeList
          spaces={spaces}
          ctx={ctx}
          expanded={expanded}
          toggle={toggle}
          collapsed={false}
          user={user}
          onNavigate={onNavigate}
        />
      </div>

      <div className="side-card footer">
        <span className="status-dot"></span>
        <span>所有变更已同步</span>
        <span className="mono dim" style={{marginLeft:'auto', fontSize:10.5}}>17:42</span>
      </div>
    </aside>
  );
}
export { Sidebar };

// Sample TOC for the current reader doc — many items so stagger is visible
const READER_TOC = [
  { num: '01', id: 's1', title: '前置检查', subs: [
    { id: 's1-1', title: '依赖版本对齐' },
    { id: 's1-2', title: '数据库迁移预演' },
    { id: 's1-3', title: '环境变量审查' },
    { id: 's1-4', title: 'CDN 缓存预热' },
  ]},
  { num: '02', id: 's2', title: '发布执行', subs: [
    { id: 's2-1', title: '灰度策略' },
    { id: 's2-2', title: '回滚开关' },
    { id: 's2-3', title: '5% 阶段观察' },
    { id: 's2-4', title: '25% 阶段观察' },
    { id: 's2-5', title: '100% 全量切换' },
  ]},
  { num: '03', id: 's3', title: '事后验证', subs: [
    { id: 's3-1', title: '读者侧抽样' },
    { id: 's3-2', title: '团队侧巡检' },
    { id: 's3-3', title: '监控曲线复核' },
  ]},
  { num: '04', id: 's4', title: '通知与归档', subs: [
    { id: 's4-1', title: '发布通告草稿' },
    { id: 's4-2', title: '归档运行手册' },
  ]},
  { num: '05', id: 's5', title: '后续优化项', subs: [
    { id: 's5-1', title: 'iframe 滚动嵌套' },
    { id: 's5-2', title: 'skill 版本探测' },
    { id: 's5-3', title: '深色模式动效' },
  ]},
];

function TocList({ toc, active, onPick }) {
  const [topOpacity, setTopOpacity] = useState(0);
  const [botOpacity, setBotOpacity] = useState(1);
  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTopOpacity(Math.min(scrollTop / 50, 1));
    const bd = scrollHeight - (scrollTop + clientHeight);
    setBotOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bd / 50, 1));
  };

  let i = 0;
  return (
    <div className="tree-scroll toc-scroll">
      <div className="scroll-list" onScroll={onScroll}>
        {toc.map((sec) => (
          <div key={sec.id}>
            <AnimatedItem index={i++}>
              <div
                className={"toc-sec " + (active === sec.id ? 'active' : '')}
                onClick={() => onPick(sec.id)}
              >
                <span className="toc-num">{sec.num}</span>
                <span className="toc-sec-title">{sec.title}</span>
              </div>
            </AnimatedItem>
            {sec.subs.map((sub) => (
              <AnimatedItem key={sub.id} index={i++}>
                <div
                  className={"toc-sub " + (active === sub.id ? 'active' : '')}
                  onClick={() => onPick(sub.id)}
                >
                  <span className="toc-dot"></span>
                  <span className="toc-sub-title">{sub.title}</span>
                </div>
              </AnimatedItem>
            ))}
          </div>
        ))}
      </div>
      <div className="top-gradient" style={{opacity: topOpacity}}></div>
      <div className="bottom-gradient" style={{opacity: botOpacity}}></div>
    </div>
  );
}
export { TocList, READER_TOC };

// ─────────────────────────────────────────────────────────────────────────
// ANIMATED TREE LIST — items fade+scale in on scroll into view, with
// fading top/bottom gradient masks (inspired by React Bits AnimatedList)
// ─────────────────────────────────────────────────────────────────────────
function AnimatedTreeList({ spaces, ctx, expanded, toggle, collapsed, user, onNavigate }) {
  const listRef = useRef(null);
  const [topOpacity, setTopOpacity] = useState(0);
  const [botOpacity, setBotOpacity] = useState(1);

  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTopOpacity(Math.min(scrollTop / 50, 1));
    const bd = scrollHeight - (scrollTop + clientHeight);
    setBotOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bd / 50, 1));
  };

  // build a flat sequence of nodes for stagger animation
  const flat = useMemo(() => {
    const out = [];
    spaces.forEach(space => {
      out.push({ kind: 'space', space });
      if (expanded[space.id] && !collapsed) {
        space.children.forEach(doc => out.push({ kind: 'doc', space, doc }));
      }
    });
    return out;
  }, [spaces, expanded, collapsed]);

  return (
    <div className="tree-scroll">
      <div ref={listRef} className="scroll-list" onScroll={onScroll}>
        {spaces.map((space, sIdx) => {
          const open = expanded[space.id];
          const activeSpace = ctx.spaceId === space.id && !ctx.docId;
          const dotCls = space.accent === 'moss' ? 'green' : space.accent === 'slate' ? '' : space.accent === 'plum' ? 'purple' : space.accent === 'accent' ? 'orange' : '';
          return (
            <div key={space.id}>
              <AnimatedItem index={sIdx}>
                <div className="tree-space-head" style={{position:'relative'}}>
                  <div
                    className={"tree-node " + (open ? "expanded " : "") + (activeSpace ? "active" : "")}
                    onClick={() => { toggle(space.id); onNavigate({view:'reader', spaceId: space.id, docId: space.children[0]?.id }); }}
                  >
                    <span className="chev"><I.chev/></span>
                    <span className={"dot " + dotCls}></span>
                    {!collapsed && <span className="name">{space.name}</span>}
                    {!collapsed && <span className="count">{space.count}</span>}
                  </div>
                </div>
              </AnimatedItem>
              {open && !collapsed && (
                <div className="tree-children">
                  {space.children.map((doc, dIdx) => {
                    const locked = !canRead(doc, user);
                    return (
                      <AnimatedItem key={doc.id} index={sIdx + dIdx + 1}>
                        <div
                          className={"tree-node " + (ctx.docId === doc.id ? "active " : "") + (locked ? "locked" : "")}
                          onClick={(e) => { e.stopPropagation(); onNavigate({view:'reader', spaceId: space.id, docId: doc.id}); }}
                        >
                          <span className="name doc-title-text">{doc.title}</span>
                          {locked && (
                            <span className="tree-lock" title="登录后可读">
                              <I.lock/>
                            </span>
                          )}
                        </div>
                      </AnimatedItem>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="top-gradient" style={{opacity: topOpacity}}></div>
      <div className="bottom-gradient" style={{opacity: botOpacity}}></div>
    </div>
  );
}

function AnimatedItem({ children, index = 0 }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // find nearest scroll container
    let root = el.parentElement;
    while (root && root !== document.body) {
      const style = getComputedStyle(root);
      if (/(auto|scroll)/.test(style.overflowY)) break;
      root = root.parentElement;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => setInView(en.isIntersecting));
    }, { root: root === document.body ? null : root, threshold: 0.2 });
    io.observe(el);
    // also flip on after a tick so initial items animate in
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) setInView(true);
    }, 30 + index * 30);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [index]);
  return (
    <div ref={ref} className={"tree-anim-item " + (inView ? 'in' : '')} style={{ '--anim-delay': (index * 30) + 'ms' }}>
      {children}
    </div>
  );
}
export { AnimatedItem };

// Reusable animated-scroll wrapper for any list: stagger entrance + gradient masks
function AnimatedScrollList({ children, className = '' }) {
  const [topOpacity, setTopOpacity] = useState(0);
  const [botOpacity, setBotOpacity] = useState(1);
  const onScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    setTopOpacity(Math.min(scrollTop / 50, 1));
    const bd = scrollHeight - (scrollTop + clientHeight);
    setBotOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bd / 50, 1));
  };
  return (
    <div className={"tree-scroll " + className}>
      <div className="scroll-list" onScroll={onScroll}>
        {React.Children.map(children, (child, idx) => (
          <AnimatedItem index={idx}>{child}</AnimatedItem>
        ))}
      </div>
      <div className="top-gradient" style={{opacity: topOpacity}}></div>
      <div className="bottom-gradient" style={{opacity: botOpacity}}></div>
    </div>
  );
}
export { AnimatedScrollList };
