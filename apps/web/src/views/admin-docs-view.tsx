import { extractHtmlMetadata, extractMarkdownMetadata } from '@atlas/shared';
import { useEffect, useMemo, useState } from 'react';
import { AnimatedScrollList, I } from '../chrome';
import { visibilityLabel } from '../labels';
import type { Loose } from '../loose-types';
import { documentReaderUrl } from '../url-utils';
import { HTMLEditorDialog } from './html-editor-dialog';
import { MarkdownEditorDialog } from './markdown-editor-dialog';
import { dotClass } from './shared';
import { SpaceChipPicker } from './space-chip-picker';

const _I = I;

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
          })),
      ),
    [spaces],
  );
  const editableSpaces = useMemo(() => spaces.filter((s: Loose) => s.role === 'editor'), [spaces]);
  const canCreate = editableSpaces.length > 0;
  const [renaming, setRenaming] = useState<Loose>(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<Loose>(null);
  const [editing, setEditing] = useState<Loose>(null); // doc being edited
  const [showNewMenu, setShowNewMenu] = useState(false);

  // filter state
  const [status, setStatus] = useState('all'); // all | published | draft
  // Seed the space filter from the route: navigating here from a doc's breadcrumb scopes the
  // list to that space; a bare /admin/docs (dock, cmdk) leaves it on "all".
  const [spaceFilter, setSpaceFilter] = useState(
    _ctx?.spaceId && _ctx.spaceId !== 'all' ? _ctx.spaceId : 'all',
  );
  const [visFilter, setVisFilter] = useState('all'); // all | public | invite | private
  const [search, setSearch] = useState('');

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
    if (visFilter !== 'all') r = r.filter((d: Loose) => d.visibility === visFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (d: Loose) => d.title.toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q),
      );
    }
    return r;
  }, [docs, status, spaceFilter, visFilter, search]);

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
    setMenuOpenId(null);
  };

  const openEditor = (doc: Loose) => {
    setEditing(doc);
    setMenuOpenId(null);
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
      visibility: 'private',
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
        visibility: patch.visibility || editing.visibility || 'private',
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

  // close row-menu popover when clicking elsewhere
  useEffect(() => {
    if (!menuOpenId) return;
    const onDocClick = (e: Loose) => {
      if (e.target.closest('.row-menu') || e.target.closest('[data-row-more]')) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  // close new-doc menu when clicking elsewhere
  useEffect(() => {
    if (!showNewMenu) return;
    const onDocClick = (e: Loose) => {
      if (e.target.closest?.('.space-picker-pop')) return;
      setShowNewMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showNewMenu]);

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="page-head">
          <div className="left">
            <div className="eyebrow">团队后台 · 文章管理</div>
            <h1>所有文章</h1>
            <p className="lead">
              管理空间内的 HTML
              文章：直接编辑内容、重命名、调整可见性、删除。点击文章打开编辑器，右侧三点菜单提供更多操作。
            </p>
          </div>
          {canCreate && (
            <div className="right">
              <button
                className="btn secondary"
                onClick={() => onNavigate({ view: 'admin-upload' })}
              >
                <_I.upload width="13" height="13" />
                <span>上传 HTML</span>
              </button>
              <div style={{ position: 'relative' }}>
                <button className="btn primary" onClick={() => setShowNewMenu((o) => !o)}>
                  <_I.plus />
                  <span>新建文章</span>
                </button>
                {showNewMenu && (
                  <div
                    className="space-picker-pop"
                    style={{ top: 'calc(100% + 4px)', right: 0, left: 'auto' }}
                  >
                    <div className="space-picker-row" onClick={() => startNew('markdown')}>
                      <span>新建 Markdown</span>
                    </div>
                    <div className="space-picker-row" onClick={() => startNew('html')}>
                      <span>新建 HTML</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
              <button className="filter-search-clear" onClick={() => setSearch('')} title="清除">
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
            <select
              className="filter-select"
              value={spaceFilter}
              onChange={(e: Loose) => setSpaceFilter(e.target.value)}
            >
              <option value="all">全部空间</option>
              {spaceOptions.map((s: Loose) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">分类</span>
            <div className="segmented">
              {[
                { v: 'all', l: '全部' },
                { v: 'public', l: '公开' },
                { v: 'invite', l: '受邀' },
                { v: 'private', l: '私密' },
              ].map((o: Loose) => (
                <button
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
        </div>

        <AnimatedScrollList className="doc-list-scroll">
          {filtered.map((doc: Loose) => {
            const author = members.find((m: Loose) => m.id === doc.author);
            return (
              <div
                key={doc.id}
                className="doc-row"
                onClick={(e: Loose) => {
                  if (renaming === doc.id) return;
                  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                  if (e.target.closest('.row-menu')) return;
                  if (doc.canEdit) openEditor(doc);
                  else onNavigate({ view: 'reader', spaceId: doc.spaceId, docId: doc.id });
                }}
              >
                <div className="doc-title">
                  <span className={`dot ${dotClass(doc.dot || 'slate')}`}></span>
                  <div className="text">
                    {renaming === doc.id ? (
                      <input
                        className="input"
                        value={renameVal}
                        onChange={(e: Loose) => setRenameVal(e.target.value)}
                        onClick={(e: Loose) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e: Loose) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        style={{ padding: '4px 8px', fontSize: 14, fontWeight: 500, width: '100%' }}
                      />
                    ) : (
                      <h4
                        onDoubleClick={(e: Loose) => {
                          e.stopPropagation();
                          if (doc.canEdit) startRename(doc);
                        }}
                      >
                        {doc.title}
                      </h4>
                    )}
                    <div className="path">
                      {doc.spaceName}/{doc.id}
                      {doc.format === 'markdown' ? '.md' : '.html'}
                    </div>
                  </div>
                </div>
                {doc.canEdit ? (
                  <SpaceChipPicker
                    doc={doc}
                    spaces={spaces}
                    onPick={(s: Loose) => {
                      mutations.updateDocument(doc.id, { spaceId: s.id });
                    }}
                  />
                ) : (
                  <span className="vis-chip">{doc.spaceName}</span>
                )}
                <div className="author">
                  <span className="avatar small">{author?.initials}</span>
                  <span>{author?.name}</span>
                </div>
                <div className="updated">{doc.updated}</div>
                <span className={`vis-chip ${doc.visibility}`}>
                  {visibilityLabel(doc.visibility)}
                </span>
                <div className="row-actions" style={{ position: 'relative' }}>
                  {doc.canEdit && (
                    <button
                      className="icon-btn"
                      title="编辑内容"
                      onClick={(e: Loose) => {
                        e.stopPropagation();
                        openEditor(doc);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="m9 2.5 2.5 2.5L4 12.5H1.5V10z"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    title="预览"
                    onClick={(e: Loose) => {
                      e.stopPropagation();
                      onNavigate({ view: 'reader', spaceId: doc.spaceId, docId: doc.id });
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                  </button>
                  <button
                    className="icon-btn"
                    title="更多"
                    data-row-more
                    onClick={(e: Loose) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === doc.id ? null : doc.id);
                    }}
                  >
                    <_I.more />
                  </button>
                  {menuOpenId === doc.id && (
                    <div className="row-menu" onClick={(e: Loose) => e.stopPropagation()}>
                      {doc.canEdit && (
                        <>
                          <button
                            className="row-menu-item"
                            onClick={() => {
                              openEditor(doc);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path
                                d="m9 2.5 2.5 2.5L4 12.5H1.5V10z"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span>编辑内容</span>
                          </button>
                          <button
                            className="row-menu-item"
                            onClick={() => {
                              startRename(doc);
                              setMenuOpenId(null);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M2 12h10M3.5 8.5h2l5-5-2-2-5 5z"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span>重命名</span>
                          </button>
                          <button
                            className="row-menu-item"
                            onClick={() => {
                              onShare(doc.id);
                              setMenuOpenId(null);
                            }}
                          >
                            <_I.share />
                            <span>分享</span>
                          </button>
                        </>
                      )}
                      <button
                        className="row-menu-item"
                        onClick={() => {
                          navigator.clipboard?.writeText(documentReaderUrl(doc.spaceId, doc.id));
                          pushToast({ msg: '链接已复制', meta: doc.title });
                          setMenuOpenId(null);
                        }}
                      >
                        <_I.link />
                        <span>复制链接</span>
                      </button>
                      {doc.canEdit && (
                        <>
                          <div className="row-menu-sep"></div>
                          <button className="row-menu-item danger" onClick={() => deleteDoc(doc)}>
                            <_I.trash />
                            <span>删除</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </AnimatedScrollList>
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
