// Atlas main app — warm default, collapsible sidebar, magnifying dock
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate as useRouterNavigate } from 'react-router';
import { firstPublicDoc, LoginView, useAuth } from './auth';
import { I, Sidebar, Topbar } from './chrome';
import { useAtlasData, useAtlasMutations } from './data-hooks';
import { CmdK, ShareDialog, SpaceManagerDialog, ToastWrap } from './dialogs';
import type { Loose, RouteState, Toast } from './loose-types';
import { readerTarget, setLastReader } from './reader-progress';
import { TweakRadio, TweakSection, TweaksPanel, TweakToggle, useTweaks } from './tweaks-panel';
import { ConfirmRoot, clickableProps } from './ui-kit';
import { AdminDocsView, PublicDocumentView, ReaderView, SpaceIndexView } from './views';
import { AdminSettingsView, AdminUploadView } from './views-admin';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/ {
  theme: 'warm',
  framedDoc: false,
  dockMagnify: true,
} /*EDITMODE-END*/;

// Persisted across reloads under atlas_tweaks (framedDoc, dockMagnify, and the
// last-applied theme for fast restore). Whether the user *explicitly* picked a
// theme is tracked SEPARATELY under atlas_theme_explicit — that flag, not the
// mere presence of a persisted theme, is what locks the OS-follow behaviour.
// (Persisting the theme alone used to lock OS-follow after the very first load;
// the separate flag is the fix — T5.)
const TWEAKS_STORAGE_KEY = 'atlas_tweaks';
const THEME_EXPLICIT_KEY = 'atlas_theme_explicit';

function prefersDarkScheme(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

// True only once the user has actively chosen a theme (toolbar toggle / tweaks
// panel). An OS-followed value never sets this, so follow-the-system keeps
// working until there's a real choice to respect.
function themeChosenExplicitly(): boolean {
  try {
    return localStorage.getItem(THEME_EXPLICIT_KEY) === '1';
  } catch {
    return false;
  }
}

function markThemeExplicit() {
  try {
    localStorage.setItem(THEME_EXPLICIT_KEY, '1');
  } catch {}
}

function readSavedTweaks(): Partial<typeof TWEAK_DEFAULTS> | null {
  try {
    const raw = localStorage.getItem(TWEAKS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}

function writeSavedTweaks(tweaks: typeof TWEAK_DEFAULTS) {
  try {
    localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(tweaks));
  } catch {}
}

// Views that keep the directory sidebar (reader + the per-space index — admin
// pages are full-width). Clicking a space name navigates to its index without
// losing the tree.
const SIDEBAR_VIEWS = new Set(['reader', 'space']);

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
      pane: params.get('pane') || undefined,
    };
  if (path.startsWith('/admin/docs'))
    return {
      view: 'admin-docs',
      // No default space here: a bare /admin/docs means "all documents". A space id is
      // present only when navigated with an explicit filter (e.g. the reader breadcrumb).
      spaceId: params.get('space') || undefined,
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
  const spaceMatch = path.match(/^\/spaces\/([^/]+)\/?$/);
  if (spaceMatch) return { view: 'space', spaceId: spaceMatch[1] };
  return {
    view: params.get('view') || 'reader',
    spaceId: params.get('space') || 's1',
    docId: params.get('doc') || 'd1',
  };
}

function urlForState(next: RouteState) {
  if (next.view === 'admin-docs')
    return next.spaceId && next.spaceId !== 'all'
      ? `/admin/docs?space=${next.spaceId}`
      : '/admin/docs';
  if (next.view === 'admin-upload') return '/admin/upload';
  if (next.view === 'admin-settings')
    return next.pane ? `/admin/settings?pane=${next.pane}` : '/admin/settings';
  if (next.view === 'space') return `/spaces/${next.spaceId || 's1'}`;
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
  const [tweakInitialized, setTweakInitialized] = useState(false);

  // Boot: hydrate once. Non-theme prefs always restore from storage. The theme
  // restores from storage ONLY if it was an explicit choice — otherwise we take
  // the current OS scheme, never a stale OS-followed value that happened to be
  // persisted last session. useTweaks seeds from defaults, so this is the one
  // moment we override them.
  useEffect(() => {
    if (tweakInitialized) return;
    setTweakInitialized(true);
    const saved = readSavedTweaks();
    const theme =
      themeChosenExplicitly() && saved?.theme ? saved.theme : prefersDarkScheme() ? 'dark' : 'warm';
    setTweak({ ...TWEAK_DEFAULTS, ...(saved ?? {}), theme });
  }, [setTweak, tweakInitialized]);

  // Persist whenever tweaks change (after the initial hydration settles in).
  // Safe to persist the theme here even when it's OS-followed — boot only reuses
  // a persisted theme when the explicit flag is set.
  useEffect(() => {
    if (!tweakInitialized) return;
    writeSavedTweaks(tweaks as typeof TWEAK_DEFAULTS);
  }, [tweaks, tweakInitialized]);

  // Follow OS color-scheme changes until the user explicitly picks a theme.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (themeChosenExplicitly()) return;
      setTweak({ theme: e.matches ? 'dark' : 'warm' });
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setTweak]);

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

  const {
    spaces,
    members,
    groups,
    permissions,
    hasCapability,
    canManageMembers,
    canManageGroups,
    currentUser,
    session,
    isLoading,
    error,
  } = useAtlasData();
  const auth = useAuth({ currentUser, session });
  const { user, login, logout, switchTo } = auth;
  const isGuest = !user;

  const navigate = useCallback(
    ({ view: v, spaceId: s, docId: d, pane: p }: RouteState) => {
      if (!user && ['admin-docs', 'admin-upload', 'admin-settings'].includes(v ?? '')) {
        setReturnTo({ view, spaceId, docId });
        routerNavigate('/login');
        return;
      }
      const next = {
        view: v || view,
        spaceId: s || spaceId,
        docId: d || docId,
        pane: p,
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
      (returnTo.view === 'public' || returnDoc?.published === true);
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
      const fallback = firstPublicDoc(spaces as never);
      routerNavigate(urlForState(fallback));
    }
  }, [logout, routerNavigate, spaces, view]);

  const cycleTheme = useCallback(
    (to: string) => {
      markThemeExplicit();
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

  // Unified chrome auto-hide. Two ways the topbar / dock / reader meta bar recede:
  //   • idle   — after HIDE_DELAY of genuine stillness (wakeChrome's timer), and
  //   • scroll — wheel / scroll means "I'm reading", so it hides immediately.
  // They come back via: a click on blank area (NOT interactive controls), the
  // pointer genuinely reaching an edge that owns a bar, or Esc. The edge check
  // ignores the synthetic mousemoves browsers fire during scroll (see onMouseMove).
  const mainRef = useRef<Loose>(null);
  const chromeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last genuine pointer position — lets onMouseMove tell a real move from the
  // synthetic, same-coordinate mousemoves a browser fires while the page scrolls.
  const lastPointer = useRef({ x: -1, y: -1 });
  // Suppresses edge-reveal for a short window after a user scroll arrives from
  // the HTML iframe. Safari's momentum scrolling keeps firing scroll + synthetic
  // edge-hovers together; without this the topbar flips show/hide mid-animation
  // (flashes / sticks halfway). Scroll means "I'm reading" — nav stays down.
  const scrollHidingUntil = useRef(0);
  const HIDE_DELAY = 4000;
  // How long after the last scroll sample edge-reveal stays suppressed. Long enough
  // to outlast Safari's momentum settle (scroll samples keep extending it through the
  // gesture), short enough that reaching for the nav right after stopping feels instant.
  const SCROLL_REVEAL_GUARD = 450;
  // Top reveal band — a deliberate move toward the top summons the nav. Kept generous
  // (not a 16px hairline) so the title comes back promptly without pixel-perfect aim,
  // mirroring the bottom dock's 90px zone.
  const TOP_REVEAL_ZONE = 64;
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
    chromeHideTimer.current = setTimeout(() => setChromeVisible(false), HIDE_DELAY);
  }, []);
  const forceHideChrome = useCallback(() => {
    if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
    setChromeVisible(false);
  }, []);
  // Reading is the default — scrolling means "I'm reading", so it ALWAYS hides the
  // chrome, even when the pointer is parked over the topbar. (Previously a scroll
  // with the cursor in the top zone re-woke the bar; combined with the iframe's
  // own 'scroll' hide message that produced a show/hide fight — the title flashed
  // and never receded. Scroll is unambiguous reading intent, so it wins outright.)
  // The matching scrollHidingUntil window suppresses edge-reveal for the gesture so
  // Safari's momentum scroll + synthetic edge-hovers can't resurrect the bar
  // mid-recede. The dock / corner toolbar come back only when the pointer genuinely
  // reaches the edge that owns them once the gesture settles (see onMouseMove below).
  const hideChrome = useCallback(() => {
    scrollHidingUntil.current = Date.now() + SCROLL_REVEAL_GUARD;
    forceHideChrome();
  }, [forceHideChrome]);
  useEffect(() => {
    chromeHideTimer.current = setTimeout(() => setChromeVisible(false), HIDE_DELAY);

    const INTERACTIVE =
      'button, a[href], input, select, textarea, .toggle, .doc-card, .doc-row, .radio-card, .tree-node, .dock-item, .tab, .cmdk-item, .share-row, .member-row, .skill-row, .trash-row, .file-line, .step, .space-mgr-row, .icon-btn, .color-swatch, .pill-btn, .role-select, .sidebar-collapse-btn, .sidebar-fab, .reader-toc-pop, .reader-toc-handle';

    const onClick = (e: MouseEvent) => {
      // ignore clicks on actual interactive controls — only "blank space" wakes
      if ((e.target as Element | null)?.closest(INTERACTIVE)) return;
      wakeChrome();
    };
    // Edge-reveal: the bottom edge wakes the dock, the top edge the breadcrumb
    // bar; the wide middle (where you read) never does. In the reader the topbar
    // recedes when idle, so the top edge is how you call it back. The sidebar is
    // user-controlled (its own collapse button), so there's no left-edge reveal.
    const onMouseMove = (e: MouseEvent) => {
      // Browsers (Chrome / Safari) emit synthetic mousemove events while the page
      // scrolls under a STATIONARY pointer — identical viewport coords, no real
      // move. Those must NOT wake the chrome: with the cursor parked near an edge
      // (e.g. the bottom dock zone) while scrolling, they'd keep reviving the
      // topbar so it never recedes — which read as "scrolling doesn't hide it".
      // Only a genuine change in pointer position counts as intent to summon nav.
      if (e.clientX === lastPointer.current.x && e.clientY === lastPointer.current.y) return;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // Edge-reveal is suppressed while an iframe scroll is still settling —
      // matches the iframe 'reveal' suppression so the HTML reader's momentum
      // scrolling can't resurrect the topbar via the parent's own mousemove.
      if (Date.now() < scrollHidingUntil.current) return;
      const nearBottom = window.innerHeight - e.clientY < 90;
      const nearTop = e.clientY < TOP_REVEAL_ZONE;
      if (nearBottom || nearTop) wakeChrome();
    };
    // Esc is the keyboard way out of an immersed reading view — brings the nav
    // back without reaching for the mouse. Closing a dialog with Esc also wakes
    // it, which is fine: the nav should be up once you're back in the app.
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') wakeChrome();
    };
    // The reader's HTML <iframe> is a sandboxed opaque origin, so we can't watch its
    // scrolling from here — it postMessages instead (see lib/raw-html CHROME_BRIDGE):
    // 'scroll' recedes the topbar, 'reveal' (genuine edge-hover / Esc inside the frame)
    // brings the nav back. Markdown needs none of this — it lives in this document.
    const onMessage = (e: MessageEvent) => {
      const d = e.data as Loose;
      if (!d || d.source !== 'atlas-reader') return;
      if (d.type === 'scroll' && d.userScroll) {
        // Each scroll sample extends the suppression window (SCROLL_REVEAL_GUARD) so a
        // long momentum scroll (Safari) keeps the topbar down for the whole gesture —
        // samples arrive faster than the window, so it never lapses mid-gesture. Once
        // the gesture truly stops the window lapses quickly, so reaching for the nav
        // feels instant. Without it an edge-reveal mid-recede flashes / sticks the bar.
        scrollHidingUntil.current = Date.now() + SCROLL_REVEAL_GUARD;
        forceHideChrome();
      } else if (d.type === 'reveal') {
        // Drop reveals that arrive while a scroll is still settling — Safari
        // momentum scrolling spams edge-hovers that would otherwise resurrect
        // the topbar mid-recede.
        if (Date.now() < scrollHidingUntil.current) return;
        wakeChrome();
      }
    };

    document.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('wheel', hideChrome, { passive: true });
    document.addEventListener('keydown', onEsc);
    window.addEventListener('message', onMessage);
    return () => {
      if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
      document.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('wheel', hideChrome);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('message', onMessage);
    };
  }, [wakeChrome, hideChrome, forceHideChrome]);

  const ctx = { view, spaceId, docId, pane: routeState.pane };
  const isLogin = view === 'login';
  const isAdminView = ['admin-docs', 'admin-upload', 'admin-settings'].includes(view);
  const isWorkspaceAdmin = !!user && user.role === 'admin';
  // The backend lets space editors create/edit documents in spaces they can edit, so the doc and
  // upload back-office is open to them. Member/permission/trash/space settings stay admin-only.
  const hasEditableSpace = spaces.some((s: Loose) => s.role === 'editor');
  // Settings access: admin OR the manage* capabilities (or the legacy createSpace fallback
  // for the upload pane, which is a capability we keep listing for backwards compat).
  const canSeeSettings =
    isWorkspaceAdmin || canManageMembers || canManageGroups || hasCapability('createSpace');
  const lacksAdminAccess =
    isAdminView &&
    user &&
    (view === 'admin-settings' ? !canSeeSettings : !isWorkspaceAdmin && !hasEditableSpace);
  const hasSidebar = SIDEBAR_VIEWS.has(view) && !isLogin;
  const isPublicView = view === 'public';

  const activeDoc = spaces
    .flatMap((s: Loose) => s.children || [])
    .find((d: Loose) => d.id === docId);
  const shareDocId = sharingDocId || activeDoc?.id || docId;
  const shareDocTitle = spaces
    .flatMap((s: Loose) => s.children || [])
    .find((d: Loose) => d.id === shareDocId)?.title;
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

  // Remember the document the reader is actually looking at, so the dock's
  // "阅读" button and "返回阅读" links come back to it instead of the hardcoded
  // first article. Only record once it resolves to a real doc.
  useEffect(() => {
    if (view === 'reader' && activeDoc) setLastReader(spaceId, activeDoc.id);
  }, [view, activeDoc, spaceId]);
  const readerHome = readerTarget({ view: 'reader', spaceId: 's1', docId: 'd1' });

  // Global shortcuts — the ones advertised in CmdK. ⌘K (open the palette) lives
  // in its own listener above; these are the direct shortcuts for commands that
  // have a stable target. ⌘D (browser bookmark) and ⌘N (new window) are
  // intentionally NOT bound here — they clash with native browser behaviour, so
  // CmdK no longer advertises them either (see dialogs.tsx).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === 'u') {
        e.preventDefault();
        navigate({ view: 'admin-upload' });
        return;
      }
      if (e.shiftKey && key === 'd') {
        e.preventDefault();
        navigate({ view: 'admin-docs', spaceId: 'all' });
        return;
      }
      if (e.shiftKey && key === 'i') {
        e.preventDefault();
        navigate({ view: 'admin-settings', pane: 'members' });
        return;
      }
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        openShare(shareDocId);
        return;
      }
      if (e.key === ',') {
        e.preventDefault();
        navigate({ view: 'admin-settings' });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, openShare, shareDocId]);

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
        (view === 'reader' ? 'immersive-reader ' : '') +
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
          type="button"
          className="sidebar-fab"
          aria-label="展开目录"
          onClick={() => setSidebarCollapsed(false)}
          title="展开目录"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
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
                  : view === 'space'
                    ? 'Space · Index'
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
        {view === 'space' && (
          <SpaceIndexView
            ctx={ctx}
            spaces={spaces}
            members={members}
            user={user}
            onNavigate={navigate}
          />
        )}
        {lacksAdminAccess && (
          <AdminAccessDenied user={user} onNavigate={navigate} readerHome={readerHome} />
        )}
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
            groups={groups}
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
            onLogin={openLogin}
            visible={chromeVisible}
            magnify={tweaks.dockMagnify}
            isGuest={isGuest}
            readerHome={readerHome}
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
          onShareCurrent={() => openShare(shareDocId)}
        />
      )}
      <ShareDialog
        open={shareOpen}
        documentId={shareDocId}
        documentTitle={shareDocTitle}
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
        spaces={spaces}
        mutations={mutations}
        onClose={() => {
          setSpaceMgrOpen(false);
          setSpaceEditing(null);
        }}
        onCreate={mutations.createSpace}
        onUpdate={mutations.updateSpace}
        onDelete={mutations.deleteSpace}
      />
      <ToastWrap toasts={toasts} />
      <ConfirmRoot />

      <TweaksPanel title="Tweaks">
        <TweakSection label="主题">
          <TweakRadio
            label="模式"
            value={tweaks.theme}
            onChange={(v: Loose) => {
              markThemeExplicit();
              setTweak({ theme: v });
            }}
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
              { l: '读者 · 单文档', v: readerHome },
              { l: '团队 · 文档列表', v: { view: 'admin-docs', spaceId: 'all' } },
              { l: '团队 · 上传', v: { view: 'admin-upload' } },
              { l: '管理员 · 设置', v: { view: 'admin-settings' } },
            ].map((x: Loose) => (
              <div key={x.l} className="tweak-link" {...clickableProps(() => navigate(x.v))}>
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
function Dock({ view, onNavigate, onLogin, visible, magnify, isGuest, readerHome }: Loose) {
  const allItems = [
    {
      id: 'reader',
      label: '阅读',
      icon: 'book',
      go: readerHome || { view: 'reader', spaceId: 's1', docId: 'd1' },
      guest: true,
    },
    { id: 'admin-docs', label: '管理', icon: 'admin', go: { view: 'admin-docs', spaceId: 'all' } },
    { id: 'admin-upload', label: '上传', icon: 'upload', go: { view: 'admin-upload' } },
    { id: 'admin-settings', label: '设置', icon: 'settings', go: { view: 'admin-settings' } },
  ];
  const guestItems = [
    allItems[0],
    { id: 'login', label: '登录', icon: 'login', guest: true, action: 'login' },
  ];
  const items = isGuest ? guestItems : allItems;

  const BASE = 34;
  const MAG = 48;
  const DISTANCE = 120;
  const dockRef = useRef<Loose>(null);
  const itemRefs = useRef<Loose>([]);
  const centersRef = useRef<Loose>([]);
  const mouseXRef = useRef<Loose>(null);
  const rafRef = useRef<Loose>(null);

  // Read item layout positions once (per hover / resize), never per frame.
  const measure = () => {
    const panel = dockRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    centersRef.current = itemRefs.current.map((el: Loose) =>
      el ? rect.left + el.offsetLeft + el.offsetWidth / 2 : 0,
    );
  };

  // Write scales straight to the DOM — no React re-render, no layout reads.
  const paint = () => {
    rafRef.current = null;
    const mx = mouseXRef.current;
    const centers = centersRef.current;
    itemRefs.current.forEach((el: Loose, i: number) => {
      if (!el) return;
      let scale = 1;
      if (magnify && mx != null) {
        const dist = Math.abs(mx - centers[i]);
        if (dist < DISTANCE) {
          const t = 1 - dist / DISTANCE;
          scale = (BASE + (MAG - BASE) * t * t) / BASE;
        }
      }
      el.style.transform = `scale(${scale})`;
    });
  };

  const schedule = () => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint);
  };

  // Keep transforms in sync when magnify toggles or the item set changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure/paint are stable per render; re-sync only when magnify or the item set changes
  useEffect(() => {
    measure();
    paint();
  }, [magnify, items.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: listeners bind once for the dock's lifetime; measure reads live refs
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className={`dock-anchor ${visible ? '' : 'hidden'}`}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer tracking for the magnification effect; the dock items themselves are keyboard-operable */}
      <div
        ref={dockRef}
        className="dock-panel"
        onMouseEnter={measure}
        onMouseMove={(e: Loose) => {
          mouseXRef.current = e.clientX;
          schedule();
        }}
        onMouseLeave={() => {
          mouseXRef.current = null;
          schedule();
        }}
      >
        {items.map((it: Loose, i: number) => (
          <DockItem
            key={it.id}
            item={it}
            active={view === it.id}
            onClick={() => (it.action === 'login' ? onLogin?.() : onNavigate(it.go))}
            setRef={(el: Loose) => {
              itemRefs.current[i] = el;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DockItem({ item, active, onClick, setRef }: Loose) {
  const iconSize = 14;
  return (
    <div
      ref={setRef}
      className={`dock-item ${active ? 'active' : ''}`}
      style={{
        width: 34,
        height: 34,
        transformOrigin: 'center bottom',
        transition: 'transform 70ms ease-out',
        willChange: 'transform',
      }}
      aria-current={active ? 'page' : undefined}
      {...clickableProps(onClick, { label: item.label })}
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
      <svg aria-hidden="true" width={s} height={s} viewBox="0 0 18 18" fill="none">
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
      <svg aria-hidden="true" width={s} height={s} viewBox="0 0 18 18" fill="none">
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
      <svg aria-hidden="true" width={s} height={s} viewBox="0 0 18 18" fill="none">
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
  if (kind === 'login')
    return (
      <svg aria-hidden="true" width={s} height={s} viewBox="0 0 18 18" fill="none">
        <path
          d="M3 9h8M8 6l3 3-3 3"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.5 3.5h2A1.5 1.5 0 0 1 15 5v8a1.5 1.5 0 0 1-1.5 1.5h-2"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    );
  if (kind === 'settings')
    return (
      <svg aria-hidden="true" width={s} height={s} viewBox="0 0 18 18" fill="none">
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

function AdminAccessDenied({ user, onNavigate, readerHome }: Loose) {
  return (
    <div className="main-card">
      <div className="admin-denied">
        <div className="reader-locked-glyph">
          <I.lockLarge />
        </div>
        <h2 className="reader-locked-title">需要管理员权限</h2>
        <p className="reader-locked-desc">
          {user?.email || '当前账号'}{' '}
          当前是成员账号，不能查看成员、权限和后台维护设置。请切换到管理员账号，或让管理员把这个成员的工作区角色改为管理员。
        </p>
        <div className="reader-locked-actions">
          <button
            type="button"
            className="reader-locked-secondary"
            onClick={() => onNavigate(readerHome || { view: 'reader' })}
          >
            返回阅读
          </button>
        </div>
      </div>
    </div>
  );
}
