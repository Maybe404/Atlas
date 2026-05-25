// Atlas v3 main app — warm default, collapsible sidebar, magnifying dock
const { useState: u2S, useEffect: u2E, useCallback: u2C, useRef: u2R } = React;

const TWEAK_DEFAULTS_V3 = /*EDITMODE-BEGIN*/{
  "theme": "warm",
  "framedDoc": false,
  "dockMagnify": true
}/*EDITMODE-END*/;

// Views that have a sidebar (only reader per spec — admin pages are full-width)
const SIDEBAR_VIEWS = new Set(['reader']);

function AppV3() {
  const [view, setView] = u2S('reader');
  const [spaceId, setSpaceId] = u2S('s1');
  const [docId, setDocId] = u2S('d1');
  const [cmdkOpen, setCmdkOpen] = u2S(false);
  const [shareOpen, setShareOpen] = u2S(false);
  const [spaceMgrOpen, setSpaceMgrOpen] = u2S(false);
  const [spaceEditing, setSpaceEditing] = u2S(null); // null | space object | 'new'
  const [sidebarCollapsed, setSidebarCollapsed] = u2S(false);
  const [chromeVisible, setChromeVisible] = u2S(true);
  const [toasts, setToasts] = u2S([]);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS_V3);

  // Spaces are mutable now (CRUD)
  const [spaces, setSpaces] = u2S(() => window.ATLAS_DATA.tree);

  u2E(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme === 'light' ? '' : tweaks.theme);
  }, [tweaks.theme]);

  const pushToast = u2C(({ msg, meta }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, meta }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2200);
  }, []);

  const navigate = u2C(({ view: v, spaceId: s, docId: d }) => {
    if (v) setView(v);
    if (s) setSpaceId(s);
    if (d) setDocId(d);
  }, []);

  const cycleTheme = u2C((to) => {
    setTweak({ theme: to });
  }, [setTweak]);

  u2E(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdkOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Unified chrome auto-hide: topbar + dock + reader meta bar all hide
  // after 3s of stillness. Scroll hides immediately. Click on blank area
  // (NOT on buttons / interactive elements) wakes. Mouse near edges wakes.
  const mainRef = u2R(null);
  u2E(() => {
    let hideTimer = null;
    const HIDE_DELAY = 3000;
    const wake = () => {
      setChromeVisible(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setChromeVisible(false), HIDE_DELAY);
    };
    const hide = () => {
      if (hideTimer) clearTimeout(hideTimer);
      setChromeVisible(false);
    };

    // arm initial timer so chrome auto-hides on first idle
    hideTimer = setTimeout(() => setChromeVisible(false), HIDE_DELAY);

    const INTERACTIVE = 'button, a[href], input, select, textarea, .toggle, .doc-card, .doc-row, .radio-card, .tree-node, .dock-item, .tab, .cmdk-item, .share-row, .member-row, .skill-row, .trash-row, .file-line, .step, .space-mgr-row, .icon-btn, .color-swatch, .pill-btn, .role-select, .sidebar-collapse-btn, .sidebar-fab';

    const onClick = (e) => {
      // ignore clicks on actual interactive controls — only "blank space" wakes
      if (e.target.closest(INTERACTIVE)) return;
      wake();
    };
    const onScroll = () => hide();
    const onMouseMove = (e) => {
      if (e.clientY < 70 || window.innerHeight - e.clientY < 90) wake();
    };

    const attachScroll = () => {
      document.querySelectorAll('.main-scroll, .scroll-list, .settings-pane, .reader-iframe-wrap, .cmdk-results, .dialog-body, .upload-wrap').forEach(el => {
        el.removeEventListener('scroll', onScroll);
        el.addEventListener('scroll', onScroll, { passive: true });
      });
      document.querySelectorAll('iframe.reader-iframe').forEach(ifr => {
        try { ifr.contentWindow?.addEventListener('scroll', onScroll, { passive: true }); } catch (e) {}
        ifr.addEventListener('load', () => {
          try { ifr.contentWindow.addEventListener('scroll', onScroll, { passive: true }); } catch (e) {}
        });
      });
    };
    // re-attach across renders / view switches
    const attachTimer = setInterval(attachScroll, 500);
    setTimeout(attachScroll, 80);

    document.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      clearInterval(attachTimer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('wheel', onScroll);
    };
  }, [view]);

  const ctx = { view, spaceId, docId };
  const hasSidebar = SIDEBAR_VIEWS.has(view);

  // Space CRUD
  const createSpace = (data) => {
    const id = 'sx' + Math.random().toString(36).slice(2, 7);
    const next = { id, name: data.name, mark: data.name.slice(0,1), accent: data.accent, count: 0, children: [] };
    setSpaces(s => [...s, next]);
    pushToast({ msg: '空间已创建', meta: data.name });
  };
  const updateSpace = (id, patch) => {
    setSpaces(s => s.map(sp => sp.id === id ? { ...sp, ...patch, mark: (patch.name || sp.name).slice(0,1) } : sp));
    pushToast({ msg: '空间已更新', meta: patch.name });
  };
  const deleteSpace = (id) => {
    setSpaces(s => s.filter(sp => sp.id !== id));
    pushToast({ msg: '空间已删除' });
  };

  // patch data globally so dependent views can read updated tree
  u2E(() => { window.ATLAS_DATA.tree = spaces; }, [spaces]);

  return (
    <div className={"app " + (!hasSidebar ? 'no-sidebar ' : '') + (sidebarCollapsed ? 'sidebar-collapsed ' : '') + (chromeVisible ? '' : 'chrome-hidden ')}>
      <Topbar2
        ctx={ctx}
        visible={chromeVisible}
        onSearch={() => setCmdkOpen(true)}
        onTheme={cycleTheme}
        theme={tweaks.theme}
        onNavigate={navigate}
        onShare={() => setShareOpen(true)}
      />
      {hasSidebar && (
        <Sidebar2
          ctx={ctx}
          spaces={spaces}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
          onNavigate={navigate}
        />
      )}
      {hasSidebar && sidebarCollapsed && (
        <button
          className="sidebar-fab"
          aria-label="展开目录"
          onClick={() => setSidebarCollapsed(false)}
          title="展开目录"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3.5h8M3 7h8M3 10.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <span className="sidebar-fab-label">目录</span>
        </button>
      )}
      <main className="main" ref={mainRef} data-screen-label={
        view === 'reader' ? '01 Reader · Doc (iframe)'
        : view === 'admin-docs' ? '02 Admin · Documents'
        : view === 'admin-upload' ? '03 Admin · Upload'
        : '04 Admin · Settings'
      }>
        {view === 'reader' && <ReaderView2 ctx={ctx} framedDoc={tweaks.framedDoc} chromeVisible={chromeVisible} onNavigate={navigate} onShare={() => setShareOpen(true)}/>}
        {view === 'admin-docs' && <AdminDocsView2 ctx={ctx} onNavigate={navigate} onShare={() => setShareOpen(true)} pushToast={pushToast}/>}
        {view === 'admin-upload' && <AdminUploadView2 ctx={ctx} onNavigate={navigate} pushToast={pushToast}/>}
        {view === 'admin-settings' && <AdminSettingsView2 ctx={ctx} onNavigate={navigate} pushToast={pushToast} spaces={spaces} onCreateSpace={createSpace} onUpdateSpace={updateSpace} onDeleteSpace={deleteSpace} onEditSpace={(sp) => { setSpaceEditing(sp); setSpaceMgrOpen(true); }} onNewSpace={() => { setSpaceEditing('new'); setSpaceMgrOpen(true); }}/>}

        <Dock view={view} onNavigate={navigate} visible={chromeVisible} magnify={tweaks.dockMagnify}/>
      </main>

      <CmdK2 open={cmdkOpen} onClose={() => setCmdkOpen(false)} onNavigate={navigate} onToggleTheme={() => cycleTheme(tweaks.theme === 'dark' ? 'warm' : 'dark')}/>
      <ShareDialog2 open={shareOpen} onClose={() => setShareOpen(false)} pushToast={pushToast}/>
      <SpaceManagerDialog
        open={spaceMgrOpen}
        editing={spaceEditing}
        onClose={() => { setSpaceMgrOpen(false); setSpaceEditing(null); }}
        onCreate={createSpace}
        onUpdate={updateSpace}
        onDelete={deleteSpace}
      />
      <ToastWrap2 toasts={toasts}/>

      <TweaksPanel title="Tweaks">
        <TweakSection label="主题">
          <TweakRadio
            label="模式"
            value={tweaks.theme}
            onChange={v => setTweak({ theme: v })}
            options={[{label:'浅', value:'light'}, {label:'暖', value:'warm'}, {label:'深', value:'dark'}]}
          />
        </TweakSection>
        <TweakSection label="阅读器">
          <TweakToggle
            label="iframe 边框"
            value={tweaks.framedDoc}
            onChange={v => setTweak({ framedDoc: v })}
          />
        </TweakSection>
        <TweakSection label="底部 Dock">
          <TweakToggle
            label="Dock 放大效果"
            value={tweaks.dockMagnify}
            onChange={v => setTweak({ dockMagnify: v })}
          />
        </TweakSection>
        <TweakSection label="跳转视图">
          <div style={{display:'flex', flexDirection:'column', gap: 6}}>
            {[
              {l:'读者 · 单文档', v:{view:'reader', spaceId:'s1', docId:'d1'}},
              {l:'团队 · 文档列表', v:{view:'admin-docs'}},
              {l:'团队 · 上传', v:{view:'admin-upload'}},
              {l:'管理员 · 设置', v:{view:'admin-settings'}},
            ].map(x => (
              <div key={x.l} className="tweak-link" onClick={() => navigate(x.v)}>
                <span>{x.l}</span><span style={{color:'var(--ink-4)'}}>→</span>
              </div>
            ))}
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// DOCK — macOS-style magnification, replaces view-switcher
// ─────────────────────────────────────────────────────────────────────────
function Dock({ view, onNavigate, visible, magnify }) {
  const items = [
    { id: 'reader',         label: '阅读',     icon: 'book',     go: { view: 'reader', spaceId: 's1', docId: 'd1' } },
    { id: 'admin-docs',     label: '管理',     icon: 'admin',    go: { view: 'admin-docs' } },
    { id: 'admin-upload',   label: '上传',     icon: 'upload',   go: { view: 'admin-upload' } },
    { id: 'admin-settings', label: '设置',     icon: 'settings', go: { view: 'admin-settings' } },
  ];

  const BASE = 34;
  const MAG = 48;
  const DISTANCE = 120;
  const [mouseX, setMouseX] = u2S(null);
  const dockRef = u2R(null);

  const getSize = (idx, el) => {
    if (!magnify || mouseX == null || !el) return BASE;
    const r = el.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const dist = Math.abs(mouseX - center);
    if (dist > DISTANCE) return BASE;
    const t = 1 - dist / DISTANCE;
    return BASE + (MAG - BASE) * t * t;
  };

  return (
    <div className={"dock-anchor " + (visible ? '' : 'hidden')}>
      <div
        ref={dockRef}
        className="dock-panel"
        onMouseMove={(e) => setMouseX(e.clientX)}
        onMouseLeave={() => setMouseX(null)}
      >
        {items.map((it) => (
          <DockItem
            key={it.id}
            item={it}
            active={view === it.id}
            onClick={() => onNavigate(it.go)}
            getSize={getSize}
          />
        ))}
      </div>
    </div>
  );
}

function DockItem({ item, active, onClick, getSize }) {
  const ref = u2R(null);
  const [size, setSize] = u2S(34);
  u2E(() => {
    let raf;
    const tick = () => {
      const target = getSize(0, ref.current);
      // simple spring
      setSize(prev => prev + (target - prev) * 0.35);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getSize]);

  const iconSize = Math.round(size * 0.42);
  return (
    <div
      ref={ref}
      className={"dock-item " + (active ? 'active' : '')}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <div className="dock-glyph"><DockGlyph kind={item.icon} size={iconSize}/></div>
      <div className="dock-label">{item.label}</div>
      <div className="dock-dot"></div>
    </div>
  );
}

function DockGlyph({ kind, size = 18 }) {
  const s = size, sw = 1.5;
  if (kind === 'book') return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M3 3.5h5.5a2 2 0 0 1 2 2V15a1.5 1.5 0 0 0-1.5-1.5H3z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round"/>
      <path d="M15 3.5H9.5a2 2 0 0 0-2 2V15a1.5 1.5 0 0 1 1.5-1.5H15z" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round"/>
    </svg>
  );
  if (kind === 'admin') return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth={sw}/>
      <path d="M2.5 7h13M5.5 10.5h4M5.5 12.5h6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'upload') return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <path d="M9 11.5V3M9 3 6 6M9 3l3 3" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 12v2a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 15 14v-2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
  if (kind === 'settings') return (
    <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth={sw}/>
      <path d="M9 1.6v2.2M9 14.2v2.2M1.6 9h2.2M14.2 9h2.2M3.8 3.8l1.6 1.6M12.6 12.6l1.6 1.6M14.2 3.8l-1.6 1.6M5.4 12.6l-1.6 1.6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
  return null;
}

window.Dock = Dock;

ReactDOM.createRoot(document.getElementById('root')).render(<AppV3/>);
