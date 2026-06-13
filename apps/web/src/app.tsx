// Atlas main app — warm default, collapsible sidebar, magnifying dock
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate as useRouterNavigate } from 'react-router';
import { firstPublicDoc, LoginView, useAuth } from './auth';
import { Sidebar, Topbar } from './chrome';
import { useAtlasData, useAtlasMutations } from './data-hooks';
import { CmdK, ShareDialog, SpaceManagerDialog, ToastWrap } from './dialogs';
import type { Loose, RouteState, Toast } from './loose-types';
import { TweakRadio, TweakSection, TweaksPanel, TweakToggle, useTweaks } from './tweaks-panel';
import { AdminDocsView, PublicDocumentView, ReaderView } from './views';
import { AdminSettingsView, AdminUploadView } from './views-admin';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  theme: 'warm',
  framedDoc: false,
  dockMagnify: true,
} /*EDITMODE-END*/;

// Views that have a sidebar (only reader per spec — admin pages are full-width)
const SIDEBAR_VIEWS = new Set(['reader']);

function stateFromLocation(location: Loose): RouteState {
  const params = new URLSearchParams(location.search);
  const path = location.pathname;
  if (path.startsWith('/admin/upload'))
    return {
      view: 'admin-upload',
      spaceId: params.get('space') || 's1',
      docId: params.get('doc') || 'd1',
    };
  if (path.startsWith('/admin/settings'))
    return {
      view: 'admin-settings',
      spaceId: params.get('space') || 's1',
      docId: params.get('doc') || 'd1',
    };
  if (path.startsWith('/admin/docs'))
    return {
      view: 'admin-docs',
      spaceId: params.get('space') || 's1',
      docId: params.get('doc') || 'd1',
    };
  if (path.startsWith('/login'))
    return {
      view: 'login',
      spaceId: params.get('space') || 's1',
      docId: params.get('doc') || 'd1',
    };
  const publicMatch = path.match(/^\/share\/([^/]+)/);
  if (publicMatch)
    return { view: 'public', token: publicMatch[1], spaceId: 'public', docId: publicMatch[1] };
  const docMatch = path.match(/^\/spaces\/([^/]+)\/docs\/([^/]+)/);
  if (docMatch) return { view: 'reader', spaceId: docMatch[1], docId: docMatch[2] };
  return {
    view: params.get('view') || 'reader',
    spaceId: params.get('space') || 's1',
    docId: params.get('doc') || 'd1',
  };
}

function urlForState(next: RouteState) {
  if (next.view === 'admin-docs') return '/admin/docs';
  if (next.view === 'admin-upload') return '/admin/upload';
  if (next.view === 'admin-settings') return '/admin/settings';
  return `/spaces/${next.spaceId || 's1'}/docs/${next.docId || 'd1'}`;
}

function App() {
  const location = useLocation();
  const routerNavigate = useRouterNavigate();
  const routeState = stateFromLocation(location);
  const view = routeState.view ?? 'reader';
  const spaceId = routeState.spaceId;
  const docId = routeState.docId;
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharingDocId, setSharingDocId] = useState<Loose>(null);
  const [returnTo, setReturnTo] = useState<Loose>(null);
  const [spaceMgrOpen, setSpaceMgrOpen] = useState(false);
  const [spaceEditing, setSpaceEditing] = useState<Loose>(null); // null | space object | 'new'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      tweaks.theme === 'light' ? '' : tweaks.theme,
    );
  }, [tweaks.theme]);

  const pushToast = useCallback(({ msg, meta }: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts: Loose) => [...ts, { id, msg, meta }]);
    setTimeout(() => setToasts((ts: Loose) => ts.filter((t: Loose) => t.id !== id)), 2200);
  }, []);

  const { spaces, members, permissions, currentUser, session, isLoading, error } = useAtlasData();
  const auth = useAuth({ currentUser, session });
  const { user, login, logout, switchTo } = auth;
  const isGuest = !user;

  const navigate = useCallback(
    ({ view: v, spaceId: s, docId: d }: RouteState) => {
      if (!user && ['admin-docs', 'admin-upload', 'admin-settings'].includes(v ?? '')) {
        setReturnTo({ view, spaceId, docId });
        routerNavigate('/login');
        return;
      }
      const next = {
        view: v || view,
        spaceId: s || spaceId,
        docId: d || docId,
      };
      routerNavigate(urlForState(next));
    },
    [docId, routerNavigate, spaceId, user, view],
  );
  const mutations = useAtlasMutations(pushToast);

  const openLogin = useCallback(() => {
    setReturnTo({ view, spaceId, docId });
    routerNavigate('/login');
  }, [docId, routerNavigate, spaceId, view]);

  const continueAsGuest = useCallback(() => {
    const returnDoc = spaces
      .flatMap((space: Loose) => space.children || [])
      .find((candidate: Loose) => candidate.id === returnTo?.docId);
    const canReturnAsGuest =
      returnTo &&
      returnTo.view !== 'login' &&
      !['admin-docs', 'admin-upload', 'admin-settings'].includes(returnTo.view) &&
      (returnTo.view === 'public' || returnDoc?.visibility === 'public');
    const target = canReturnAsGuest ? returnTo : firstPublicDoc(spaces as never);
    setReturnTo(null);
    navigate(target);
  }, [navigate, returnTo, spaces]);

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      const result = await login(email, password);
      if (result.ok) {
        const target =
          returnTo && returnTo.view !== 'login' ? returnTo : stateFromLocation(location);
        setReturnTo(null);
        routerNavigate(urlForState(target));
      }
      return result;
    },
    [location, login, returnTo, routerNavigate],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    if (!['reader', 'public'].includes(view)) {
      routerNavigate(urlForState(firstPublicDoc(spaces as never)));
    }
  }, [logout, routerNavigate, spaces, view]);

  const cycleTheme = useCallback(
    (to: string) => {
      setTweak({ theme: to });
    },
    [setTweak],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Unified chrome auto-hide: topbar + dock + reader meta bar all hide
  // after 3s of stillness. Scroll hides immediately. Click on blank area
  // (NOT on buttons / interactive elements) wakes. Mouse near edges wakes.
  const mainRef = useRef<Loose>(null);
  const chromeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HIDE_DELAY = 3000;
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
    chromeHideTimer.current = setTimeout(() => setChromeVisible(false), HIDE_DELAY);
  }, []);
  const hideChrome = useCallback(() => {
    if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
    setChromeVisible(false);
  }, []);
  useEffect(() => {
    chromeHideTimer.current = setTimeout(() => setChromeVisible(false), HIDE_DELAY);

    const INTERACTIVE =
      'button, a[href], input, select, textarea, .toggle, .doc-card, .doc-row, .radio-card, .tree-node, .dock-item, .tab, .cmdk-item, .share-row, .member-row, .skill-row, .trash-row, .file-line, .step, .space-mgr-row, .icon-btn, .color-swatch, .pill-btn, .role-select, .sidebar-collapse-btn, .sidebar-fab';

    const onClick = (e: MouseEvent) => {
      // ignore clicks on actual interactive controls — only "blank space" wakes
      if ((e.target as Element | null)?.closest(INTERACTIVE)) return;
      wakeChrome();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (e.clientY < 70 || window.innerHeight - e.clientY < 90) wakeChrome();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('wheel', hideChrome, { passive: true });
    return () => {
      if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('wheel', hideChrome);
    };
  }, [hideChrome, wakeChrome]);

  const ctx = { view, spaceId, docId };
  const isLogin = view === 'login';
  const isAdminView = ['admin-docs', 'admin-upload', 'admin-settings'].includes(view);
  const isWorkspaceAdmin = !!user && user.role === 'admin';
  // The backend lets space editors create/edit documents in spaces they can edit, so the doc and
  // upload back-office is open to them. Member/permission/trash/space settings stay admin-only.
  const hasEditableSpace = spaces.some((s: Loose) => s.role === 'editor');
  const lacksAdminAccess =
    isAdminView &&
    user &&
    (view === 'admin-settings' ? !isWorkspaceAdmin : !isWorkspaceAdmin && !hasEditableSpace);
  const hasSidebar = SIDEBAR_VIEWS.has(view) && !isLogin;
  const isPublicView = view === 'public';

  const activeDoc = spaces
    .flatMap((s: Loose) => s.children || [])
    .find((d: Loose) => d.id === docId);
  const shareDocId = sharingDocId || activeDoc?.id || docId;
  const openShare = useCallback(
    (targetDocId: string) => {
      setSharingDocId(targetDocId || activeDoc?.id || docId);
      setShareOpen(true);
    },
    [activeDoc?.id, docId],
  );

  useEffect(() => {
    if (!isLoading && isGuest && isAdminView) {
      setReturnTo({ view, spaceId, docId });
      routerNavigate('/login');
    }
  }, [docId, isAdminView, isGuest, isLoading, routerNavigate, spaceId, view]);

  if (isLogin) {
    return (
      <div className="app no-sidebar login-shell">
        <LoginView onLogin={handleLogin} onContinueAsGuest={continueAsGuest} returnTo={returnTo} />
      </div>
    );
  }

  return (
    <div
      className={
        'app ' +
        (!hasSidebar ? 'no-sidebar ' : '') +
        (isPublicView ? 'public-shell ' : '') +
        (sidebarCollapsed ? 'sidebar-collapsed ' : '') +
        (chromeVisible ? '' : 'chrome-hidden ')
      }
    >
      {!isPublicView && (
        <Topbar
          ctx={ctx}
          visible={chromeVisible}
          onSearch={() => setCmdkOpen(true)}
          onTheme={cycleTheme}
          theme={tweaks.theme}
          onNavigate={navigate}
          onShare={() => openShare(shareDocId)}
          spaces={spaces}
          user={user}
          onLogin={openLogin}
          onLogout={handleLogout}
          onSwitchUser={switchTo}
        />
      )}
      {hasSidebar && (
        <Sidebar
          ctx={ctx}
          spaces={spaces}
          user={user}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v: boolean) => !v)}
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
            <path
              d="M3 3.5h8M3 7h8M3 10.5h8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span className="sidebar-fab-label">目录</span>
        </button>
      )}
      <main
        className="main"
        ref={mainRef}
        onScroll={hideChrome}
        data-screen-label={
          view === 'reader'
            ? '01 Reader · Doc (iframe)'
            : view === 'admin-docs'
              ? '02 Admin · Documents'
              : view === 'admin-upload'
                ? '03 Admin · Upload'
                : view === 'public'
                  ? 'Public · Document'
                  : '04 Admin · Settings'
        }
      >
        {error && <div className="app-state-banner">加载失败 · {error.message}</div>}
        {isLoading && <div className="app-state-banner">正在同步工作区数据…</div>}
        {view === 'reader' && (
          <ReaderView
            ctx={ctx}
            spaces={spaces}
            members={members}
            user={user}
            framedDoc={tweaks.framedDoc}
            chromeVisible={chromeVisible}
            onNavigate={navigate}
            onShare={(id: string) => openShare(id)}
            onLogin={openLogin}
            onChromeScroll={hideChrome}
            mutations={mutations}
          />
        )}
        {view === 'public' && (
          <PublicDocumentView token={routeState.token} onChromeScroll={hideChrome} />
        )}
        {lacksAdminAccess && <AdminAccessDenied user={user} onNavigate={navigate} />}
        {!lacksAdminAccess && view === 'admin-docs' && (
          <AdminDocsView
            ctx={ctx}
            spaces={spaces}
            members={members}
            onNavigate={navigate}
            onShare={(id: string) => openShare(id)}
            pushToast={pushToast}
            mutations={mutations}
          />
        )}
        {!lacksAdminAccess && view === 'admin-upload' && (
          <AdminUploadView
            ctx={ctx}
            spaces={spaces}
            onNavigate={navigate}
            pushToast={pushToast}
            mutations={mutations}
          />
        )}
        {!lacksAdminAccess && view === 'admin-settings' && (
          <AdminSettingsView
            ctx={ctx}
            onNavigate={navigate}
            pushToast={pushToast}
            spaces={spaces}
            members={members}
            permissions={permissions}
            currentUser={currentUser}
            mutations={mutations}
            onEditSpace={(sp: Loose) => {
              setSpaceEditing(sp);
              setSpaceMgrOpen(true);
            }}
            onNewSpace={() => {
              setSpaceEditing('new');
              setSpaceMgrOpen(true);
            }}
          />
        )}

        {!isPublicView && (
          <Dock
            view={view}
            onNavigate={navigate}
            visible={chromeVisible}
            magnify={tweaks.dockMagnify}
            isGuest={isGuest}
          />
        )}
      </main>

      {!isPublicView && (
        <CmdK
          open={cmdkOpen}
          spaces={spaces}
          members={members}
          onClose={() => setCmdkOpen(false)}
          onNavigate={navigate}
          onToggleTheme={() => cycleTheme(tweaks.theme === 'dark' ? 'warm' : 'dark')}
        />
      )}
      <ShareDialog
        open={shareOpen}
        documentId={shareDocId}
        members={members}
        currentUser={currentUser}
        onClose={() => {
          setShareOpen(false);
          setSharingDocId(null);
        }}
        pushToast={pushToast}
        mutations={mutations}
      />
      <SpaceManagerDialog
        open={spaceMgrOpen}
        editing={spaceEditing}
        onClose={() => {
          setSpaceMgrOpen(false);
          setSpaceEditing(null);
        }}
        onCreate={mutations.createSpace}
        onUpdate={mutations.updateSpace}
        onDelete={mutations.deleteSpace}
      />
      <ToastWrap toasts={toasts} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="主题">
          <TweakRadio
            label="模式"
            value={tweaks.theme}
            onChange={(v: Loose) => setTweak({ theme: v })}
            options={[
              { label: '浅', value: 'light' },
              { label: '暖', value: 'warm' },
              { label: '深', value: 'dark' },
            ]}
          />
        </TweakSection>
        <TweakSection label="阅读器">
          <TweakToggle
            label="iframe 边框"
            value={tweaks.framedDoc}
            onChange={(v: boolean) => setTweak({ framedDoc: v })}
          />
        </TweakSection>
        <TweakSection label="底部 Dock">
          <TweakToggle
            label="Dock 放大效果"
            value={tweaks.dockMagnify}
            onChange={(v: boolean) => setTweak({ dockMagnify: v })}
          />
        </TweakSection>
        <TweakSection label="跳转视图">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { l: '读者 · 单文档', v: { view: 'reader', spaceId: 's1', docId: 'd1' } },
              { l: '团队 · 文档列表', v: { view: 'admin-docs' } },
              { l: '团队 · 上传', v: { view: 'admin-upload' } },
              { l: '管理员 · 设置', v: { view: 'admin-settings' } },
            ].map((x: Loose) => (
              <div key={x.l} className="tweak-link" onClick={() => navigate(x.v)}>
                <span>{x.l}</span>
                <span style={{ color: 'var(--ink-4)' }}>→</span>
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
function Dock({ view, onNavigate, visible, magnify, isGuest }: Loose) {
  const allItems = [
    {
      id: 'reader',
      label: '阅读',
      icon: 'book',
      go: { view: 'reader', spaceId: 's1', docId: 'd1' },
      guest: true,
    },
    { id: 'admin-docs', label: '管理', icon: 'admin', go: { view: 'admin-docs' } },
    { id: 'admin-upload', label: '上传', icon: 'upload', go: { view: 'admin-upload' } },
    { id: 'admin-settings', label: '设置', icon: 'settings', go: { view: 'admin-settings' } },
  ];
  const items = isGuest ? allItems.filter((item: Loose) => item.guest) : allItems;

  const BASE = 34;
  const MAG = 48;
  const DISTANCE = 120;
  const [mouseX, setMouseX] = useState<Loose>(null);
  const dockRef = useRef<Loose>(null);

  const getSize = (_idx: Loose, el: Loose) => {
    if (!magnify || mouseX == null || !el || !dockRef.current) return BASE;
    const dockRect = dockRef.current.getBoundingClientRect();
    const center = dockRect.left + el.offsetLeft + el.offsetWidth / 2;
    const dist = Math.abs(mouseX - center);
    if (dist > DISTANCE) return BASE;
    const t = 1 - dist / DISTANCE;
    return BASE + (MAG - BASE) * t * t;
  };

  return (
    <div className={`dock-anchor ${visible ? '' : 'hidden'}`}>
      <div
        ref={dockRef}
        className="dock-panel"
        onMouseMove={(e: Loose) => setMouseX(e.clientX)}
        onMouseLeave={() => setMouseX(null)}
      >
        {items.map((it: Loose) => (
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

function DockItem({ item, active, onClick, getSize }: Loose) {
  const ref = useRef<Loose>(null);
  const size = getSize(0, ref.current);
  const scale = size / 34;
  const iconSize = 14;
  return (
    <div
      ref={ref}
      className={`dock-item ${active ? 'active' : ''}`}
      style={{
        width: 34,
        height: 34,
        transform: `scale(${scale})`,
        transformOrigin: 'center bottom',
        transition: 'transform 110ms ease-out',
        willChange: 'transform',
      }}
      onClick={onClick}
    >
      <div className="dock-glyph">
        <DockGlyph kind={item.icon} size={iconSize} />
      </div>
      <div className="dock-label">{item.label}</div>
      <div className="dock-dot"></div>
    </div>
  );
}

function DockGlyph({ kind, size = 18 }: Loose) {
  const s = size,
    sw = 1.5;
  if (kind === 'book')
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path
          d="M3 3.5h5.5a2 2 0 0 1 2 2V15a1.5 1.5 0 0 0-1.5-1.5H3z"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <path
          d="M15 3.5H9.5a2 2 0 0 0-2 2V15a1.5 1.5 0 0 1 1.5-1.5H15z"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kind === 'admin')
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <rect
          x="2.5"
          y="3.5"
          width="13"
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth={sw}
        />
        <path
          d="M2.5 7h13M5.5 10.5h4M5.5 12.5h6"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  if (kind === 'upload')
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path
          d="M9 11.5V3M9 3 6 6M9 3l3 3"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3 12v2a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 15 14v-2"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  if (kind === 'settings')
    return (
      <svg width={s} height={s} viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth={sw} />
        <path
          d="M9 1.6v2.2M9 14.2v2.2M1.6 9h2.2M14.2 9h2.2M3.8 3.8l1.6 1.6M12.6 12.6l1.6 1.6M14.2 3.8l-1.6 1.6M5.4 12.6l-1.6 1.6"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  return null;
}

export { App, Dock };

function AdminAccessDenied({ user, onNavigate }: Loose) {
  return (
    <div className="main-card">
      <div className="admin-denied">
        <div className="reader-locked-glyph">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect
              x="6"
              y="13"
              width="16"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M9.5 13V10a4.5 4.5 0 0 1 9 0v3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path d="M14 17v3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="reader-locked-title">需要管理员权限</h2>
        <p className="reader-locked-desc">
          {user?.email || '当前账号'} 当前是{user?.role === 'editor' ? '编辑' : '仅读者'}
          ，不能查看成员、权限和后台维护设置。请切换到管理员账号，或让管理员把这个成员的工作区角色改为管理员。
        </p>
        <div className="reader-locked-actions">
          <button
            className="reader-locked-secondary"
            onClick={() => onNavigate({ view: 'reader' })}
          >
            返回阅读
          </button>
        </div>
      </div>
    </div>
  );
}
