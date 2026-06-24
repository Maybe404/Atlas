import { extractHtmlMetadata, extractMarkdownMetadata } from '@atlas/shared';
import { useMemo, useState } from 'react';
import { AnimatedItem, I } from '../chrome';
import { useDocument } from '../data-hooks';
import { docCategory, docChip } from '../labels';
import type { Loose } from '../loose-types';
import { SPACE_COLOR_MAP } from '../theme-tokens';
import { clickableProps, EmptyState, Select, Skeleton, useDismiss } from '../ui-kit';
import { documentReaderUrl } from '../url-utils';
import { HTMLEditorDialog } from './html-editor-dialog';
import { MarkdownEditorDialog } from './markdown-editor-dialog';
import { MarkdownReader } from './markdown-reader';
import { dotClass, flattenFolders, folderPathLabel } from './shared';
import { SpaceChipPicker } from './space-chip-picker';

const _I = I;
const VIEW_KEY = 'atlas:admin-docs-view';
const MENU_IGNORE = ['.doc-more-menu', '[data-more-trigger]'];

const editGlyph = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="m9 2.5 2.5 2.5L4 12.5H1.5V10z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);
const eyeGlyph = (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
const renameGlyph = (
  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path
      d="M2 12h10M3.5 8.5h2l5-5-2-2-5 5z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

// Self-contained "more" dropdown — own open/dismiss state so it works identically
// inside a gallery card or the workbench preview header without shared parent state.
function DocMoreMenu({ doc, actions, align = 'right', overlay = false }: Loose) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), MENU_IGNORE);
  const close = () => setOpen(false);
  return (
    <div className="doc-more-wrap" style={{ position: 'relative' }}>
      <button
        type="button"
        className={overlay ? 'gx-overlay-btn' : 'icon-btn'}
        title="更多"
        data-more-trigger
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e: Loose) => {
          e.stopPropagation();
          setOpen((o: boolean) => !o);
        }}
      >
        <_I.more />
      </button>
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops card-click bubbling; items are the real controls
        // biome-ignore lint/a11y/useKeyWithClickEvents: wrapper only stops card-click bubbling; items are the real controls
        <div
          className="row-menu doc-more-menu"
          style={
            align === 'left' ? { right: 'auto', left: 0, transformOrigin: 'top left' } : undefined
          }
          onClick={(e: Loose) => e.stopPropagation()}
        >
          {doc.canEdit && (
            <>
              <button
                type="button"
                className="row-menu-item"
                onClick={() => {
                  actions.edit(doc);
                  close();
                }}
              >
                {editGlyph}
                <span>编辑内容</span>
              </button>
              <button
                type="button"
                className="row-menu-item"
                onClick={() => {
                  actions.rename(doc);
                  close();
                }}
              >
                {renameGlyph}
                <span>重命名</span>
              </button>
              <button
                type="button"
                className="row-menu-item"
                onClick={() => {
                  actions.share(doc);
                  close();
                }}
              >
                <_I.share />
                <span>分享</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="row-menu-item"
            onClick={() => {
              actions.copyLink(doc);
              close();
            }}
          >
            <_I.link />
            <span>复制链接</span>
          </button>
          <button
            type="button"
            className="row-menu-item"
            onClick={() => {
              actions.preview(doc);
              close();
            }}
          >
            {eyeGlyph}
            <span>预览</span>
          </button>
          {doc.canEdit && (
            <>
              <div className="row-menu-sep"></div>
              <button
                type="button"
                className="row-menu-item danger"
                onClick={() => {
                  actions.remove(doc);
                  close();
                }}
              >
                <_I.trash />
                <span>删除</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatBadge(doc: Loose) {
  return doc.format === 'markdown' ? 'MD' : 'HTML';
}

export function AdminDocsView({
  ctx: _ctx,
  spaces = [],
  members = [],
  onNavigate,
  onShare,
  pushToast,
  mutations,
}: Loose) {
  const docs = useMemo(
    () =>
      spaces.flatMap((s: Loose) =>
        (s.children || [])
          // Locked entries are documents the current user cannot even read — keep them out of the
          // management list entirely.
          .filter((c: Loose) => !c.locked)
          .map((c: Loose) => ({
            ...c,
            spaceId: s.id,
            spaceName: s.name,
            spaceAccent: s.accent,
            spaceMark: s.mark,
            folderPath: folderPathLabel(s.folders, c.folderId),
          })),
      ),
    [spaces],
  );
  const editableSpaces = useMemo(() => spaces.filter((s: Loose) => s.role === 'editor'), [spaces]);
  const canCreate = editableSpaces.length > 0;
  const [renaming, setRenaming] = useState<Loose>(null);
  const [renameVal, setRenameVal] = useState('');
  const [editing, setEditing] = useState<Loose>(null); // doc being edited
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [viewMode, setViewMode] = useState<string>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'gallery';
    } catch {
      return 'gallery';
    }
  });
  const [selectedId, setSelectedId] = useState<Loose>(null);
  useDismiss(showNewMenu, () => setShowNewMenu(false), ['.space-picker-pop', '[data-new-trigger]']);

  const setView = (v: string) => {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // filter state
  const [status, setStatus] = useState('all'); // all | published | draft
  // Seed the space filter from the route: navigating here from a doc's breadcrumb scopes the
  // list to that space; a bare /admin/docs (dock, cmdk) leaves it on "all".
  const [spaceFilter, setSpaceFilter] = useState(
    _ctx?.spaceId && _ctx.spaceId !== 'all' ? _ctx.spaceId : 'all',
  );
  const [visFilter, setVisFilter] = useState('all'); // all | public | invite | private
  const [folderFilter, setFolderFilter] = useState('all'); // all | <folderId>
  const [search, setSearch] = useState('');

  // Folder filter only makes sense scoped to a single space.
  const folderOptions = useMemo(() => {
    if (spaceFilter === 'all') return [];
    const space = spaces.find((s: Loose) => s.id === spaceFilter);
    return flattenFolders(space?.folders || []);
  }, [spaces, spaceFilter]);
  // Derive the active folder filter instead of resetting via an effect: a stale selection
  // (after the space changes, or a folder that no longer exists) collapses back to "all".
  const effectiveFolderFilter = useMemo(() => {
    if (folderFilter === 'all' || spaceFilter === 'all') return 'all';
    if (folderFilter === '__root__') return '__root__';
    return folderOptions.some((f: Loose) => f.id === folderFilter) ? folderFilter : 'all';
  }, [folderFilter, folderOptions, spaceFilter]);

  const spaceOptions = useMemo(() => {
    const seen = new Map();
    docs.forEach((d: Loose) => {
      if (!seen.has(d.spaceId))
        seen.set(d.spaceId, { id: d.spaceId, name: d.spaceName, accent: d.spaceAccent });
    });
    return Array.from(seen.values());
  }, [docs]);

  const filtered = useMemo(() => {
    let r = docs;
    if (status === 'published') r = r.filter((d: Loose) => !(d.tags || []).includes('draft'));
    if (status === 'draft') r = r.filter((d: Loose) => (d.tags || []).includes('draft'));
    if (spaceFilter !== 'all') r = r.filter((d: Loose) => d.spaceId === spaceFilter);
    if (effectiveFolderFilter !== 'all')
      r = r.filter((d: Loose) =>
        effectiveFolderFilter === '__root__' ? !d.folderId : d.folderId === effectiveFolderFilter,
      );
    if (visFilter !== 'all') r = r.filter((d: Loose) => docCategory(d) === visFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (d: Loose) => d.title.toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q),
      );
    }
    return r;
  }, [docs, status, spaceFilter, effectiveFolderFilter, visFilter, search]);

  // Group filtered docs by space (insertion order) for the workbench rail.
  const groups = useMemo(() => {
    const map = new Map<string, Loose>();
    filtered.forEach((d: Loose) => {
      let g = map.get(d.spaceId);
      if (!g) {
        g = {
          id: d.spaceId,
          name: d.spaceName,
          accent: d.spaceAccent,
          mark: d.spaceMark,
          docs: [],
        };
        map.set(d.spaceId, g);
      }
      g.docs.push(d);
    });
    return Array.from(map.values());
  }, [filtered]);

  // Keep the workbench selection valid as filters change, without an effect.
  const effectiveSelected = useMemo(() => {
    if (selectedId && filtered.some((d: Loose) => d.id === selectedId)) return selectedId;
    return filtered[0]?.id || null;
  }, [selectedId, filtered]);
  const selectedDoc = filtered.find((d: Loose) => d.id === effectiveSelected) || null;

  const hasFilter = Boolean(
    search.trim() ||
      status !== 'all' ||
      spaceFilter !== 'all' ||
      visFilter !== 'all' ||
      effectiveFolderFilter !== 'all',
  );

  const startRename = (doc: Loose) => {
    setRenaming(doc.id);
    setRenameVal(doc.title);
  };
  const commitRename = () => {
    if (!renaming) return;
    mutations.updateDocument(renaming, {
      title: renameVal || docs.find((d: Loose) => d.id === renaming)?.title,
    });
    setRenaming(null);
  };

  const deleteDoc = (doc: Loose) => {
    mutations.deleteDocument(doc.id);
  };

  const openEditor = (doc: Loose) => {
    setEditing(doc);
  };

  const previewDoc = (doc: Loose) => {
    onNavigate({ view: 'reader', spaceId: doc.spaceId, docId: doc.id });
  };

  const copyLink = (doc: Loose) => {
    navigator.clipboard?.writeText(documentReaderUrl(doc.spaceId, doc.id));
    pushToast({ msg: '链接已复制', meta: doc.title });
  };

  const actions = {
    edit: openEditor,
    rename: startRename,
    share: (doc: Loose) => onShare(doc.id),
    copyLink,
    preview: previewDoc,
    remove: deleteDoc,
  };

  const openDoc = (doc: Loose) => {
    if (doc.canEdit) openEditor(doc);
    else previewDoc(doc);
  };

  const startNew = (format: 'html' | 'markdown') => {
    const defaultSpace =
      editableSpaces.find((s: Loose) => s.id === (spaceFilter !== 'all' ? spaceFilter : 's1')) ||
      editableSpaces[0] ||
      spaceOptions[0];
    setEditing({
      id: 'new',
      title: '',
      desc: '',
      author: 'u1',
      updated: '刚刚',
      access: 'inherit',
      dot: 'slate',
      tags: ['draft'],
      spaceId: defaultSpace?.id || 's1',
      spaceName: defaultSpace?.name || '工程',
      spaceAccent: defaultSpace?.accent || 'accent',
      html: '',
      format,
      isNew: true,
    });
    setShowNewMenu(false);
  };

  const saveDoc = (content: Loose, patch: Loose = {}) => {
    if (!editing) return;
    const format = patch.format || editing.format || 'html';
    if (editing.isNew) {
      // Only infer title/desc from content when creating; the editor dialogs already
      // include title/desc in the patch when the user edits them.
      const metadata =
        format === 'markdown'
          ? extractMarkdownMetadata(content, { fallbackTitle: patch.title || editing.title })
          : extractHtmlMetadata(content, { fallbackTitle: patch.title || editing.title });
      mutations.createDocument({
        spaceId: patch.spaceId || editing.spaceId,
        folderId: patch.folderId ?? editing.folderId ?? null,
        title: patch.title || metadata.title || editing.title || '未命名文章',
        desc: patch.desc || metadata.summary || editing.desc || '',
        access: patch.access || editing.access || 'inherit',
        format,
        html: content,
        tags: editing.tags || ['draft'],
        dot: editing.dot || 'slate',
      });
    } else {
      // Trust the dialog's patch — it carries title/desc only when actually changed,
      // so a stored title that intentionally differs from the content heading is preserved.
      const { spaceName: _sn, spaceAccent: _sa, ...rest } = patch;
      mutations.updateDocument(editing.id, { ...rest, html: content });
    }
    setEditing(null);
  };

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="filter-bar">
          <div className="filter-search">
            <_I.search />
            <input
              type="text"
              placeholder="按标题或摘要搜索…"
              value={search}
              onChange={(e: Loose) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="filter-search-clear"
                onClick={() => setSearch('')}
                title="清除"
              >
                <_I.close />
              </button>
            )}
          </div>
          <div className="filter-group">
            <span className="filter-label">状态</span>
            <div className="segmented">
              {[
                { v: 'all', l: '全部' },
                { v: 'published', l: '已发布' },
                { v: 'draft', l: '草稿' },
              ].map((o: Loose) => (
                <button
                  type="button"
                  key={o.v}
                  className={status === o.v ? 'active' : ''}
                  onClick={() => setStatus(o.v)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">空间</span>
            <Select
              className="filter-select"
              ariaLabel="按空间筛选"
              value={spaceFilter}
              options={[
                { value: 'all', label: '全部空间' },
                ...spaceOptions.map((s: Loose) => ({ value: s.id, label: s.name })),
              ]}
              onChange={setSpaceFilter}
            />
          </div>
          {spaceFilter !== 'all' && folderOptions.length > 0 && (
            <div className="filter-group">
              <span className="filter-label">文件夹</span>
              <Select
                className="filter-select"
                ariaLabel="按文件夹筛选"
                value={effectiveFolderFilter}
                options={[
                  { value: 'all', label: '全部文件夹' },
                  { value: '__root__', label: '（空间根目录）' },
                  ...folderOptions.map((f: Loose) => ({ value: f.id, label: f.label })),
                ]}
                onChange={setFolderFilter}
              />
            </div>
          )}
          <div className="filter-group">
            <span className="filter-label">分类</span>
            <div className="segmented">
              {[
                { v: 'all', l: '全部' },
                { v: 'published', l: '公开' },
                { v: 'restricted', l: '受限' },
                { v: 'inherit', l: '继承' },
              ].map((o: Loose) => (
                <button
                  type="button"
                  key={o.v}
                  className={visFilter === o.v ? 'active' : ''}
                  onClick={() => setVisFilter(o.v)}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <span className="filter-count mono">
            {filtered.length} / {docs.length}
          </span>
          <div className="segmented view-toggle">
            <button
              type="button"
              className={viewMode === 'gallery' ? 'active' : ''}
              onClick={() => setView('gallery')}
              title="画廊视图"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="8" y="1" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="1" y="8" width="5" height="5" rx="1.2" fill="currentColor" />
                <rect x="8" y="8" width="5" height="5" rx="1.2" fill="currentColor" />
              </svg>
              <span>画廊</span>
            </button>
            <button
              type="button"
              className={viewMode === 'workbench' ? 'active' : ''}
              onClick={() => setView('workbench')}
              title="工作台视图"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="4" height="12" rx="1.2" fill="currentColor" />
                <rect
                  x="6.5"
                  y="1"
                  width="6.5"
                  height="12"
                  rx="1.2"
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
              <span>工作台</span>
            </button>
          </div>
          {canCreate && (
            <div className="filter-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => onNavigate({ view: 'admin-upload' })}
              >
                <_I.upload width="13" height="13" />
                <span>上传 HTML</span>
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn primary"
                  data-new-trigger
                  onClick={() => setShowNewMenu((o) => !o)}
                >
                  <_I.plus />
                  <span>新建文章</span>
                </button>
                {showNewMenu && (
                  <div
                    className="space-picker-pop"
                    style={{ top: 'calc(100% + 4px)', right: 0, left: 'auto' }}
                  >
                    <div
                      className="space-picker-row"
                      {...clickableProps(() => startNew('markdown'))}
                    >
                      <span>新建 Markdown</span>
                    </div>
                    <div className="space-picker-row" {...clickableProps(() => startNew('html'))}>
                      <span>新建 HTML</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="doc-empty-wrap">
            <EmptyState
              glyph={
                <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <rect
                    x="10"
                    y="8"
                    width="36"
                    height="40"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M18 20h20M18 28h20M18 36h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              }
              title={hasFilter ? '没有匹配的文档' : '还没有文档'}
              desc={
                hasFilter
                  ? '试试调整筛选条件或清空搜索关键词。'
                  : canCreate
                    ? '点击右上角「新建文章」或「上传 HTML」开始。'
                    : '联系空间编辑者创建或上传文档。'
              }
            />
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="doc-gallery">
            {filtered.map((doc: Loose, i: number) => {
              const author = members.find((m: Loose) => m.id === doc.author);
              const chip = docChip(doc);
              const accent = SPACE_COLOR_MAP[doc.spaceAccent] || SPACE_COLOR_MAP.accent;
              return (
                <AnimatedItem key={doc.id} index={i}>
                  <div
                    className="gx-card"
                    style={{ '--card-strip': accent } as Loose}
                    {...clickableProps(
                      (e: Loose) => {
                        if (renaming === doc.id) return;
                        if (e.target.closest?.('button') || e.target.closest?.('.row-menu')) return;
                        openDoc(doc);
                      },
                      { label: doc.title },
                    )}
                  >
                    {/* Paper thumbnail — a styled mini-page evoking the document, with
                        an accent bar, format badge, and hover action overlay. */}
                    <div className="gx-thumb">
                      <span className="gx-thumb-bar" style={{ background: accent }}></span>
                      <div className="gx-thumb-clip">
                        <div className="gx-page">
                          <div className="gx-page-kicker" style={{ color: accent }}>
                            {doc.spaceName}
                            {doc.folderPath ? ` · ${doc.folderPath}` : ''}
                          </div>
                          <div className="gx-page-title">{doc.title || '未命名文章'}</div>
                          <span className="gx-page-rule" style={{ background: accent }}></span>
                          <p className="gx-page-desc">{doc.desc || '暂无摘要，点击编辑补充。'}</p>
                          <div className="gx-page-lines" aria-hidden="true">
                            <i></i>
                            <i></i>
                            <i></i>
                          </div>
                        </div>
                      </div>
                      <span className="format-badge gx-ext">{formatBadge(doc)}</span>
                      <div className="gx-overlay">
                        {doc.canEdit && (
                          <button
                            type="button"
                            className="gx-overlay-btn"
                            title="编辑内容"
                            aria-label="编辑内容"
                            onClick={(e: Loose) => {
                              e.stopPropagation();
                              openEditor(doc);
                            }}
                          >
                            {editGlyph}
                          </button>
                        )}
                        <DocMoreMenu doc={doc} actions={actions} align="left" overlay />
                      </div>
                    </div>
                    {/* Meta sits below the paper, on the parchment. */}
                    <div className="gx-foot">
                      <div className="gx-foot-row">
                        <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
                        {renaming === doc.id ? (
                          <input
                            className="input gx-rename"
                            value={renameVal}
                            // biome-ignore lint/a11y/noAutofocus: rename input is an explicit user action; focus belongs here
                            autoFocus
                            onChange={(e: Loose) => setRenameVal(e.target.value)}
                            onClick={(e: Loose) => e.stopPropagation()}
                            onBlur={commitRename}
                            onKeyDown={(e: Loose) => {
                              // Stop the card's clickableProps keydown from preventing Space/Enter.
                              e.stopPropagation();
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenaming(null);
                            }}
                          />
                        ) : (
                          <span className="gx-foot-title">{doc.title}</span>
                        )}
                        <span className={`vis-chip ${chip.cls}`}>{chip.label}</span>
                      </div>
                      <div className="gx-foot-meta">
                        <span className="avatar small">{author?.initials}</span>
                        <span className="gx-foot-author">{author?.name}</span>
                        <span className="dim">· {doc.updated}</span>
                        <span className="gx-foot-space">
                          <span className="gx-foot-sq" style={{ background: accent }}></span>
                          {doc.spaceName}
                        </span>
                      </div>
                    </div>
                  </div>
                </AnimatedItem>
              );
            })}
          </div>
        ) : (
          <div className="workbench">
            <div className="wb-rail">
              {groups.map((g: Loose) => (
                <div key={g.id} className="wb-group">
                  <div className="wb-group-head">
                    <span
                      className="sm-mark"
                      style={{ background: SPACE_COLOR_MAP[g.accent] || SPACE_COLOR_MAP.accent }}
                    >
                      {g.mark || g.name.slice(0, 1)}
                    </span>
                    <span className="wb-group-name">{g.name}</span>
                    <span className="count mono">{g.docs.length}</span>
                  </div>
                  {g.docs.map((doc: Loose) => (
                    <button
                      type="button"
                      key={doc.id}
                      className={`wb-item ${effectiveSelected === doc.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(doc.id)}
                    >
                      <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
                      <span className="wb-item-title">{doc.title}</span>
                      <span className="format-badge sm">{formatBadge(doc)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="wb-preview">
              {selectedDoc ? (
                <WorkbenchPreview
                  key={selectedDoc.id}
                  doc={selectedDoc}
                  spaces={spaces}
                  author={members.find((m: Loose) => m.id === selectedDoc.author)}
                  actions={actions}
                  renaming={renaming === selectedDoc.id}
                  renameVal={renameVal}
                  setRenameVal={setRenameVal}
                  commitRename={commitRename}
                  cancelRename={() => setRenaming(null)}
                  mutations={mutations}
                />
              ) : (
                <div className="wb-preview-empty">选择左侧的文档以预览。</div>
              )}
            </div>
          </div>
        )}
      </div>
      {editing &&
        (editing.format === 'markdown' ? (
          <MarkdownEditorDialog
            doc={editing}
            spaces={spaces}
            onClose={() => setEditing(null)}
            onSave={(content: Loose, patch: Loose) => saveDoc(content, patch)}
          />
        ) : (
          <HTMLEditorDialog
            doc={editing}
            spaces={spaces}
            onClose={() => setEditing(null)}
            onSave={(html: Loose, patch: Loose) => saveDoc(html, patch)}
          />
        ))}
    </div>
  );
}

function WorkbenchPreview({
  doc,
  spaces,
  author,
  actions,
  renaming,
  renameVal,
  setRenameVal,
  commitRename,
  cancelRename,
  mutations,
}: Loose) {
  const detailQuery = useDocument(doc.id, Boolean(doc.id));
  const detailDoc = detailQuery.data || doc;
  const isMarkdown = detailDoc.format === 'markdown';
  const chip = docChip(doc);
  const accent = SPACE_COLOR_MAP[doc.spaceAccent] || SPACE_COLOR_MAP.accent;
  const crumb = `atlas.team / ${doc.spaceName}${doc.folderPath ? ` / ${doc.folderPath}` : ''} / ${doc.id}${isMarkdown ? '.md' : '.html'}`;

  return (
    <>
      <div className="wb-pv-head">
        <span className="sm-mark" style={{ background: accent }}>
          {doc.spaceMark || doc.spaceName?.slice(0, 1)}
        </span>
        <div className="wb-pv-title">
          {renaming ? (
            <input
              className="input"
              value={renameVal}
              // biome-ignore lint/a11y/noAutofocus: rename input is an explicit user action; focus belongs here
              autoFocus
              onChange={(e: Loose) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e: Loose) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              style={{ fontSize: 16, fontWeight: 600, width: '100%', padding: '4px 8px' }}
            />
          ) : (
            <div className="wb-pv-title-row">
              <h3>{doc.title}</h3>
              <span className={`vis-chip ${chip.cls}`}>{chip.label}</span>
            </div>
          )}
          <div className="wb-pv-crumb mono">{crumb}</div>
        </div>
        <div className="wb-pv-actions">
          {doc.canEdit && (
            <button type="button" className="btn secondary" onClick={() => actions.edit(doc)}>
              {editGlyph}
              <span>编辑</span>
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            title="预览"
            onClick={() => actions.preview(doc)}
          >
            {eyeGlyph}
          </button>
          <DocMoreMenu doc={doc} actions={actions} />
        </div>
      </div>

      <div className="wb-pv-chrome">
        <span className="wb-dot r"></span>
        <span className="wb-dot y"></span>
        <span className="wb-dot g"></span>
        <span className="wb-pv-url mono">{crumb}</span>
      </div>

      <div className="wb-pv-body">
        {detailQuery.isLoading ? (
          <div className="wb-pv-skeleton" role="status" aria-label="正在加载正文">
            <Skeleton w="55%" h={26} r={6} />
            <Skeleton w="35%" h={13} r={4} />
            <div style={{ height: 14 }} />
            <Skeleton w="100%" h={12} />
            <Skeleton w="92%" h={12} />
            <Skeleton w="80%" h={12} />
            <Skeleton w="88%" h={12} />
            <Skeleton w="60%" h={12} />
          </div>
        ) : detailQuery.isError ? (
          <div className="wb-preview-empty">无法加载该文档的内容。</div>
        ) : isMarkdown ? (
          <MarkdownReader content={detailDoc.html || ''} scrollKey={`wb:${doc.id}`} />
        ) : (
          <iframe
            className="wb-pv-frame"
            srcDoc={
              detailDoc.html ||
              '<!doctype html><html><body style="font-family:sans-serif;color:#888;padding:24px">暂无内容</body></html>'
            }
            title={detailDoc.title}
            sandbox="allow-scripts allow-popups"
          />
        )}
      </div>

      <div className="wb-pv-foot">
        <span className="avatar small">{author?.initials}</span>
        <span>{author?.name}</span>
        <span className="dim">· 更新于 {doc.updated}</span>
        <div style={{ flex: 1 }} />
        {doc.canEdit ? (
          <SpaceChipPicker
            doc={doc}
            spaces={spaces}
            onPick={(s: Loose) => mutations.updateDocument(doc.id, { spaceId: s.id })}
          />
        ) : (
          <span className="vis-chip">{doc.spaceName}</span>
        )}
      </div>
    </>
  );
}
