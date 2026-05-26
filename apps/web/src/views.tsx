// @ts-nocheck — migrated verbatim from JSX prototype; incrementally type later.
// Atlas reader views: Reader (full iframe), SpaceIndex (card grid)
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { extractHtmlMetadata } from '@atlas/shared';
import { I, AnimatedScrollList } from './chrome';
import { apiGet } from './api-client';
import { canRead, firstPublicDoc } from './auth';
import { visibilityLabel } from './labels';

const _I = I;

// dot color mapping helper
function dotClass(d) {
  return d === 'accent' ? 'dot-blue'
    : d === 'moss' ? 'dot-green'
    : d === 'slate' ? 'dot-blue'
    : d === 'plum' ? 'dot-purple'
    : d === 'ink' ? 'dot-gray'
    : 'dot-blue';
}

// ─────────────────────────────────────────────────────────────────────────
// READER · single doc — full iframe of imported HTML
// ─────────────────────────────────────────────────────────────────────────
function ReaderView({ ctx, spaces = [], members = [], user, framedDoc, chromeVisible = true, onNavigate, onShare, onLogin }) {
  const requestedSpace = spaces.find(s => s.id === ctx.spaceId);
  const space = requestedSpace || spaces[0];
  const requestedDoc = requestedSpace?.children?.find(c => c.id === ctx.docId);
  const doc = requestedDoc || (requestedSpace ? requestedSpace.children?.[0] : space?.children?.[0]);
  const author = members.find(m => m.id === doc?.author);
  const [copied, setCopied] = useState(false);
  const denied = Boolean(user && ctx.spaceId && ctx.docId && (!requestedSpace || !requestedDoc));
  const allowed = !denied && canRead(doc, user);

  const iframeRef = useRef(null);

  if (denied || !space || !doc) {
    return (
      <div className="main-card reader-card">
        <div className="reader-locked">
          <div className="reader-locked-glyph">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="6" y="13" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M9.5 13V10a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M14 17v3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="reader-locked-title">{user ? '没有权限查看这篇文档' : '这篇文档需要登录'}</h2>
          <p className="reader-locked-desc">
            {user
              ? '当前账号没有这个空间或文档的阅读权限。请联系管理员添加空间权限，或让文档所有者单独分享给你。'
              : '请先登录团队账号，登录后会回到刚才的页面。'}
          </p>
          <div className="reader-locked-actions">
            {user ? (
              <button className="reader-locked-secondary" onClick={() => onNavigate({ view: 'reader', ...firstPublicDoc(spaces) })}>
                浏览可阅读文档
              </button>
            ) : (
              <>
                <button className="reader-locked-primary" onClick={onLogin}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7h7M7 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9.5 2h2A1 1 0 0 1 12.5 3v8a1 1 0 0 1-1 1h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  登录账号
                </button>
                <button className="reader-locked-secondary" onClick={() => onNavigate({ view: 'reader', ...firstPublicDoc(spaces) })}>
                  浏览公开文档
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-card reader-card">
      <div className={"reader-meta-bar " + (chromeVisible ? '' : 'meta-bar-hidden')}>
        <span className={"dot " + dotClass(doc.dot)}></span>
        <span className="doc-title">{doc.title}</span>
        <span className="sep">·</span>
        <span className="author">{author?.name}</span>
        <span className="sep">·</span>
        <span className="mono dim" style={{fontSize:11}}>{doc.updated}</span>
        {allowed && user && doc.canEdit ? (
          <>
            <button className="pill-btn ghost" onClick={() => {
              navigator.clipboard?.writeText('atlas.team/d/' + doc.id);
              setCopied(true); setTimeout(()=>setCopied(false), 1400);
            }}>
              {copied ? <_I.check/> : <_I.link/>}
              <span>{copied ? '已复制' : '链接'}</span>
            </button>
            <button className="pill-btn" onClick={onShare}>
              <_I.share/><span>分享</span>
            </button>
          </>
        ) : !allowed ? (
          <span className={"vis-chip reader-lock-chip " + doc.visibility}>
            {doc.visibility === 'invite' ? '需登录 · 邀请制' : '需登录 · 私密'}
          </span>
        ) : null}
      </div>

      <div className={"reader-iframe-wrap " + (framedDoc ? "framed" : "")}>
        {allowed ? (
          <iframe
            ref={iframeRef}
            className="reader-iframe"
            srcDoc={doc.html || '<!doctype html><html><body><p>暂无内容</p></body></html>'}
            title={doc.title}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <div className="reader-locked">
            <div className="reader-locked-glyph">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="6" y="13" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M9.5 13V10a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <circle cx="14" cy="18.5" r="1.2" fill="currentColor"/>
              </svg>
            </div>
            <h2 className="reader-locked-title">{user ? '没有权限查看这篇文档' : '这篇文档需要登录'}</h2>
            <p className="reader-locked-desc">
              {user
                ? '当前账号没有「' + space.name + '」空间中这篇文档的阅读权限。请联系管理员添加空间权限，或让文档所有者单独分享给你。'
                : doc.visibility === 'private'
                  ? '这是一篇私密文档。请先登录团队账号，系统会按你的空间和文档权限判断是否可读。'
                  : '这是一篇邀请制文档，加入「' + space.name + '」空间的成员可以阅读。登录后即可查看完整内容。'}
            </p>
            <div className="reader-locked-actions">
              {!user && (
                <button className="reader-locked-primary" onClick={onLogin}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7h7M7 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9.5 2h2A1 1 0 0 1 12.5 3v8a1 1 0 0 1-1 1h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  登录账号
                </button>
              )}
              <button className="reader-locked-secondary" onClick={() => {
                onNavigate({ view: 'reader', ...firstPublicDoc(spaces) });
              }}>
                {user ? '浏览可阅读文档' : '浏览公开文档'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export { ReaderView };

function PublicDocumentView({ token }) {
  const publicQuery = useQuery({
    queryKey: ['public-document', token],
    queryFn: () => apiGet(`/documents/public/${token}`),
    enabled: Boolean(token),
  });
  const doc = publicQuery.data;

  if (publicQuery.isLoading) {
    return <div className="main-card reader-card"><div className="app-state-banner">正在打开公开文档…</div></div>;
  }

  if (!doc) {
    return <div className="main-card reader-card"><div className="app-state-banner">公开链接不可用或已过期</div></div>;
  }

  return (
    <div className="main-card reader-card">
      <div className="reader-meta-bar">
        <span className={"dot " + dotClass(doc.dot)}></span>
        <span className="doc-title">{doc.title}</span>
        <span className="sep">·</span>
        <span className="author">{doc.authorName || '公开文档'}</span>
        <span className="sep">·</span>
        <span className="mono dim" style={{fontSize:11}}>{doc.updated}</span>
      </div>
      <div className="reader-iframe-wrap">
        <iframe
          className="reader-iframe"
          srcDoc={doc.html || '<!doctype html><html><body><p>暂无内容</p></body></html>'}
          title={doc.title}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
export { PublicDocumentView };

// ─────────────────────────────────────────────────────────────────────────
// SPACE INDEX · card grid
// ─────────────────────────────────────────────────────────────────────────
function SpaceIndexView({ ctx, spaces = [], members = [], onNavigate }) {
  const space = spaces.find(s => s.id === ctx.spaceId) || spaces[0];
  const [filter, setFilter] = useState('all');

  const docs = useMemo(() => {
    let r = [...(space?.children || [])];
    if (filter !== 'all') r = r.filter(d => d.visibility === filter);
    return r;
  }, [space, filter]);

  const desc = {
    s1: '面向工程团队的部署手册、RFC、架构笔记与事故复盘。所有公开链接保留作者署名。',
    s2: '产品决策的素材库：用户访谈、可用性测试、优先级讨论与跨团队同步。',
    s3: '视觉系统、版式实验、文案规范——一切关于「Atlas 看起来是什么样」的来源。',
    s4: '个人草稿与笔记，默认仅自己可见。',
  }[space?.id];

  if (!space) {
    return <div className="main-card"><div className="app-state-banner">暂无空间</div></div>;
  }

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="page-head">
          <div className="left">
            <div className="eyebrow">
              <span className={"dot " + (space.accent==='accent'?'dot-orange':space.accent==='moss'?'dot-green':space.accent==='plum'?'dot-purple':'dot-blue')} style={{width:7, height:7, borderRadius:'50%'}}></span>
              空间 · {space.name}
            </div>
            <h1>{space.name}</h1>
            <p className="lead">{desc}</p>
          </div>
          <div className="right">
            <span className="mono dim" style={{fontSize:12}}>{docs.length} 篇 · {members.length} 人</span>
          </div>
        </div>

        <div className="toolbar">
          <div className="segmented">
            {[
              {v:'all',     l:'全部'},
              {v:'public',  l:'公开'},
              {v:'invite',  l:'受邀'},
              {v:'private', l:'私密'},
            ].map(t => (
              <button key={t.v} className={filter===t.v?'active':''} onClick={()=>setFilter(t.v)}>{t.l}</button>
            ))}
          </div>
          <span style={{flex:1}}></span>
          <button className="btn secondary"><_I.upload width="13" height="13"/><span>导入</span></button>
          <button className="btn primary"><_I.plus/><span>新建文档</span></button>
        </div>

        <div className="doc-grid">
          {docs.map(doc => {
            const author = members.find(m => m.id === doc.author);
            return (
              <div key={doc.id} className="doc-card" onClick={() => onNavigate({view:'reader', spaceId: space.id, docId: doc.id})}>
                <div className="card-head">
                  <div className={"dot " + dotClass(doc.dot)}></div>
                  <span className={"vis-chip " + doc.visibility}>
                    {visibilityLabel(doc.visibility)}
                  </span>
                </div>
                <h3>{doc.title}</h3>
                <p className="desc">{doc.desc}</p>
                <div className="card-foot">
                  <span className="avatar small">{author?.initials}</span>
                  <span>{author?.name}</span>
                  <span className="updated">{doc.updated}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
export { SpaceIndexView };

// ─────────────────────────────────────────────────────────────────────────
// ADMIN · doc list (rows in cards, not table)
// ─────────────────────────────────────────────────────────────────────────
function SpaceChipPicker({ doc, spaces, onPick }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const accentDot = (a) => a==='moss'?'dot-green':a==='plum'?'dot-purple':a==='accent'?'dot-orange':a==='ink'?'dot-gray':'dot-blue';
  return (
    <span ref={wrapRef} className="space-chip space-chip-edit" onClick={(e)=>{e.stopPropagation(); setOpen(o=>!o);}} style={{position:'relative'}}>
      <span className={"dot " + accentDot(doc.spaceAccent)}></span>
      {doc.spaceName}
      <svg className="chev" width="9" height="9" viewBox="0 0 10 10" fill="none">
        <path d="M2 3.5 5 7 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {open && (
        <div className="space-picker-pop" onClick={(e)=>e.stopPropagation()}>
          {spaces.map(s => {
            const active = s.id === doc.spaceId;
            return (
              <div
                key={s.id}
                className={"space-picker-row " + (active ? 'active' : '')}
                onClick={() => { onPick(s); setOpen(false); }}
              >
                <span className={"dot " + accentDot(s.accent)}></span>
                <span>{s.name}</span>
                {active && <span className="check"><_I.check/></span>}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
export { SpaceChipPicker };

function AdminDocsView({ ctx, spaces = [], members = [], onNavigate, onShare, pushToast, mutations }) {
  const docs = useMemo(() => spaces.flatMap(s => (s.children || []).map(c => ({...c, spaceId: s.id, spaceName: s.name, spaceAccent: s.accent}))), [spaces]);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // doc being edited

  // filter state
  const [status, setStatus] = useState('all');       // all | published | draft
  const [spaceFilter, setSpaceFilter] = useState('all');
  const [visFilter, setVisFilter] = useState('all'); // all | public | invite | private
  const [search, setSearch] = useState('');

  const spaceOptions = useMemo(() => {
    const seen = new Map();
    docs.forEach(d => { if (!seen.has(d.spaceId)) seen.set(d.spaceId, { id: d.spaceId, name: d.spaceName, accent: d.spaceAccent }); });
    return Array.from(seen.values());
  }, [docs]);

  const filtered = useMemo(() => {
    let r = docs;
    if (status === 'published') r = r.filter(d => !(d.tags||[]).includes('draft'));
    if (status === 'draft')     r = r.filter(d =>  (d.tags||[]).includes('draft'));
    if (spaceFilter !== 'all')  r = r.filter(d => d.spaceId === spaceFilter);
    if (visFilter !== 'all')    r = r.filter(d => d.visibility === visFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(d => d.title.toLowerCase().includes(q) || (d.desc||'').toLowerCase().includes(q));
    }
    return r;
  }, [docs, status, spaceFilter, visFilter, search]);

  const startRename = (doc) => { setRenaming(doc.id); setRenameVal(doc.title); };
  const commitRename = () => {
    if (!renaming) return;
    mutations.updateDocument(renaming, { title: renameVal || docs.find(d => d.id === renaming)?.title });
    setRenaming(null);
  };

  const deleteDoc = (doc) => {
    mutations.deleteDocument(doc.id);
    setMenuOpenId(null);
  };

  const openEditor = (doc) => {
    setEditing(doc);
    setMenuOpenId(null);
  };

  const createNew = () => {
    const defaultSpace = spaceOptions.find(s => s.id === (spaceFilter !== 'all' ? spaceFilter : 's1')) || spaceOptions[0];
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
      isNew: true,
    });
  };

  const saveDoc = (html, patch = {}) => {
    if (!editing) return;
    const metadata = extractHtmlMetadata(html, { fallbackTitle: patch.title || editing.title });
    const nextTitle = patch.title || metadata.title || editing.title || '未命名文章';
    const nextDesc = patch.desc || metadata.summary || editing.desc || '';
    if (editing.isNew) {
      mutations.createDocument({
        spaceId: patch.spaceId || editing.spaceId,
        title: nextTitle,
        desc: nextDesc,
        visibility: patch.visibility || editing.visibility || 'private',
        html,
        tags: editing.tags || ['draft'],
        dot: editing.dot || 'slate',
      });
    } else {
      mutations.updateDocument(editing.id, { desc: nextDesc, ...patch, title: nextTitle, html });
    }
    setEditing(null);
  };

  // close popover when clicking elsewhere
  useEffect(() => {
    if (!menuOpenId) return;
    const onDocClick = (e) => {
      if (e.target.closest('.row-menu') || e.target.closest('[data-row-more]')) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="page-head">
          <div className="left">
            <div className="eyebrow">团队后台 · 文章管理</div>
            <h1>所有文章</h1>
            <p className="lead">管理空间内的 HTML 文章：直接编辑内容、重命名、调整可见性、删除。点击文章打开编辑器，右侧三点菜单提供更多操作。</p>
          </div>
          <div className="right">
            <button className="btn secondary" onClick={() => onNavigate({view:'admin-upload'})}>
              <_I.upload width="13" height="13"/><span>上传 HTML</span>
            </button>
            <button className="btn primary" onClick={createNew}>
              <_I.plus/><span>新建文章</span>
            </button>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-search">
            <_I.search/>
            <input
              type="text"
              placeholder="按标题或摘要搜索…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="filter-search-clear" onClick={() => setSearch('')} title="清除">
                <_I.close/>
              </button>
            )}
          </div>
          <div className="filter-group">
            <span className="filter-label">状态</span>
            <div className="segmented">
              {[
                {v:'all',       l:'全部'},
                {v:'published', l:'已发布'},
                {v:'draft',     l:'草稿'},
              ].map(o => (
                <button key={o.v} className={status===o.v?'active':''} onClick={()=>setStatus(o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">空间</span>
            <select className="filter-select" value={spaceFilter} onChange={e => setSpaceFilter(e.target.value)}>
              <option value="all">全部空间</option>
              {spaceOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">分类</span>
            <div className="segmented">
              {[
                {v:'all',     l:'全部'},
                {v:'public',  l:'公开'},
                {v:'invite',  l:'受邀'},
                {v:'private', l:'私密'},
              ].map(o => (
                <button key={o.v} className={visFilter===o.v?'active':''} onClick={()=>setVisFilter(o.v)}>{o.l}</button>
              ))}
            </div>
          </div>
          <span className="filter-count mono">{filtered.length} / {docs.length}</span>
        </div>

        <AnimatedScrollList className="doc-list-scroll">
          {filtered.map(doc => {
            const author = members.find(m => m.id === doc.author);
            return (
              <div key={doc.id} className="doc-row" onClick={(e) => {
                if (renaming === doc.id) return;
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                if (e.target.closest('.row-menu')) return;
                openEditor(doc);
              }}>
                <div className="doc-title">
                  <span className={"dot " + dotClass(doc.dot)}></span>
                  <div className="text">
                    {renaming === doc.id ? (
                      <input
                        autoFocus
                        className="input"
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onClick={e=>e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                        style={{padding:'4px 8px', fontSize:14, fontWeight:500, width:'100%'}}
                      />
                    ) : (
                      <h4 onDoubleClick={(e) => { e.stopPropagation(); startRename(doc); }}>{doc.title}</h4>
                    )}
                    <div className="path">{doc.spaceName}/{doc.id}.html</div>
                  </div>
                </div>
                <SpaceChipPicker
                  doc={doc}
                  spaces={spaces}
                  onPick={(s) => {
                    mutations.updateDocument(doc.id, { spaceId: s.id });
                  }}
                />
                <div className="author">
                  <span className="avatar small">{author?.initials}</span>
                  <span>{author?.name}</span>
                </div>
                <div className="updated">{doc.updated}</div>
                <span className={"vis-chip " + doc.visibility}>
                  {visibilityLabel(doc.visibility)}
                </span>
                <div className="row-actions" style={{position:'relative'}}>
                  <button className="icon-btn" title="编辑内容" onClick={(e)=>{e.stopPropagation(); openEditor(doc);}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="m9 2.5 2.5 2.5L4 12.5H1.5V10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                  </button>
                  <button className="icon-btn" title="预览" onClick={(e)=>{e.stopPropagation(); onNavigate({view:'reader', spaceId: doc.spaceId, docId: doc.id});}}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3"/></svg>
                  </button>
                  <button
                    className="icon-btn"
                    title="更多"
                    data-row-more
                    onClick={(e)=>{e.stopPropagation(); setMenuOpenId(menuOpenId === doc.id ? null : doc.id);}}
                  ><_I.more/></button>
                  {menuOpenId === doc.id && (
                    <div className="row-menu" onClick={(e)=>e.stopPropagation()}>
                      <button className="row-menu-item" onClick={()=>{openEditor(doc);}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="m9 2.5 2.5 2.5L4 12.5H1.5V10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                        <span>编辑内容</span>
                      </button>
                      <button className="row-menu-item" onClick={()=>{startRename(doc); setMenuOpenId(null);}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 12h10M3.5 8.5h2l5-5-2-2-5 5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                        <span>重命名</span>
                      </button>
                      <button className="row-menu-item" onClick={()=>{onShare(doc.id); setMenuOpenId(null);}}>
                        <_I.share/><span>分享</span>
                      </button>
                      <button className="row-menu-item" onClick={()=>{
                        navigator.clipboard?.writeText('atlas.team/d/' + doc.id);
                        pushToast({msg:'链接已复制', meta: doc.title});
                        setMenuOpenId(null);
                      }}>
                        <_I.link/><span>复制链接</span>
                      </button>
                      <div className="row-menu-sep"></div>
                      <button className="row-menu-item danger" onClick={()=>deleteDoc(doc)}>
                        <_I.trash/><span>删除</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </AnimatedScrollList>
      </div>
      {editing && (
        <HTMLEditorDialog
          doc={editing}
          spaces={spaces}
          onClose={() => setEditing(null)}
          onSave={(html, patch) => saveDoc(html, patch)}
        />
      )}
    </div>
  );
}
export { AdminDocsView };

// ─────────────────────────────────────────────────────────────────────────
// HTML EDITOR DIALOG — edit doc content, save
// ─────────────────────────────────────────────────────────────────────────
function HTMLEditorDialog({ doc, spaces = [], onClose, onSave }) {
  const defaultHTML = doc.html || (doc.isNew
    ? `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title></title>
<style>
  body { font-family: -apple-system, "Noto Sans SC", sans-serif; max-width: 680px; margin: 60px auto; padding: 0 24px; color: #1d1d1f; line-height: 1.65; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .meta { color: #86868b; font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.015em; }
  p { margin: 0 0 14px; }
</style>
</head>
<body>
  <h1></h1>
  <p></p>
</body>
</html>`
    : `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<title>${doc.title}</title>
<style>
  body { font-family: -apple-system, "Noto Sans SC", sans-serif; max-width: 680px; margin: 60px auto; padding: 0 24px; color: #1d1d1f; line-height: 1.65; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 8px; }
  .meta { color: #86868b; font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 18px; margin: 36px 0 10px; letter-spacing: -0.015em; }
  p { margin: 0 0 14px; }
</style>
</head>
<body>
  <h1>${doc.title}</h1>
  <div class="meta">${doc.spaceName} · 最后更新 ${doc.updated}</div>
  <p>${doc.desc || ''}</p>
  <h2>正文</h2>
  <p>在此处编辑 HTML 内容。保存后，Atlas 会保留原始 HTML，并替换原文件。</p>
</body>
</html>`);
  const [html, setHTML] = useState(doc.isNew ? '' : defaultHTML);
  const [title, setTitle] = useState(doc.title);
  const [desc, setDesc] = useState(doc.desc || '');
  const [titleTouched, setTitleTouched] = useState(Boolean(doc.title));
  const [descTouched, setDescTouched] = useState(Boolean(doc.desc));
  const [spaceId, setSpaceId] = useState(doc.spaceId || (doc.isNew ? '' : 's1'));
  const [showSpacePicker, setShowSpacePicker] = useState(false);
  const [showSpaceRequired, setShowSpaceRequired] = useState(false);
  const [tab, setTab] = useState(doc.isNew ? 'source' : 'source'); // 'source' | 'preview'
  const [dirty, setDirty] = useState(false);
  const taRef = useRef(null);
  const spaceWrapRef = useRef(null);

  useEffect(() => {
    if (!showSpacePicker) return;
    const onDoc = (e) => {
      if (!spaceWrapRef.current?.contains(e.target)) setShowSpacePicker(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showSpacePicker]);

  const selectedSpace = spaces.find(s => s.id === spaceId);

  const applyMetadata = (nextHtml) => {
    const metadata = extractHtmlMetadata(nextHtml, { fallbackTitle: title || doc.title });
    if (metadata.title && !titleTouched) setTitle(metadata.title);
    if (metadata.summary && !descTouched) setDesc(metadata.summary);
  };

  const save = () => {
    if (!spaceId) {
      setShowSpaceRequired(true);
      setShowSpacePicker(true);
      return;
    }
    const patch = {};
    const metadata = extractHtmlMetadata(html, { fallbackTitle: title || doc.title });
    const finalTitle = title.trim() || metadata.title || doc.title || '未命名文章';
    const finalDesc = desc.trim() || metadata.summary || doc.desc || '';
    if (finalTitle !== doc.title) patch.title = finalTitle;
    if (finalDesc !== (doc.desc || '')) patch.desc = finalDesc;
    if (spaceId !== doc.spaceId && selectedSpace) {
      patch.spaceId = selectedSpace.id;
      patch.spaceName = selectedSpace.name;
      patch.spaceAccent = selectedSpace.accent;
    }
    onSave(html, patch);
  };

  const accentDot = (a) => a==='moss'?'dot-green':a==='plum'?'dot-purple':a==='accent'?'dot-orange':a==='ink'?'dot-gray':'dot-blue';

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [html, title, onSave, onClose]);

  const handlePaste = (e) => {
    setDirty(true);
    const pasted = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain');
    if (pasted) {
      const replacingBlankNewDoc = doc.isNew && !html.trim() && /<(html|!doctype)\b/i.test(pasted);
      if (replacingBlankNewDoc) {
        e.preventDefault();
        setHTML(pasted);
        applyMetadata(pasted);
        return;
      }
      requestAnimationFrame(() => applyMetadata(taRef.current?.value || pasted));
    }
  };

  return (
    <div className="overlay editor-overlay" onMouseDown={(e) => { if (e.target.classList.contains('editor-overlay')) onClose(); }}>
      <div className="editor-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="editor-head">
          <div className="editor-title-wrap">
            <span className={"dot " + dotClass(doc.dot)} style={{width:8, height:8, borderRadius:'50%'}}></span>
            <div style={{minWidth:0, flex:1}}>
              <div className="editor-title-row">
                <span className="editor-title-prefix">{doc.isNew ? '新建文章 ·' : '编辑文章 ·'}</span>
                <input
                  className="editor-title-input"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); setDirty(true); }}
                  placeholder="未命名文章"
                  spellCheck={false}
                />
              </div>
              <div className="editor-sub mono">
                {selectedSpace ? selectedSpace.name : '未选择空间'}/{doc.id}.html {dirty && <span style={{color:'var(--blue)'}}>· 未保存</span>}
              </div>
              <div ref={spaceWrapRef} className={"editor-space-field " + (showSpaceRequired && !spaceId ? 'required-empty' : '')} style={{marginTop: 8, position:'relative', maxWidth: 320}}>
                <span className="label">空间</span>
                <button className="editor-space-trigger" onClick={(e) => { e.stopPropagation(); setShowSpacePicker(o => !o); setShowSpaceRequired(false); }}>
                  {selectedSpace ? (
                    <>
                      <span className={"dot " + accentDot(selectedSpace.accent)}></span>
                      <span>{selectedSpace.name}</span>
                    </>
                  ) : (
                    <span style={{color:'var(--blue)'}}>选择空间…</span>
                  )}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{marginLeft:4, color:'var(--ink-4)'}}>
                    <path d="M2 3.5 5 7 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {showSpaceRequired && !spaceId && (
                  <span style={{fontSize:11, color:'var(--blue)', marginLeft:'auto'}}>请选择空间后保存</span>
                )}
                {showSpacePicker && (
                  <div className="space-picker-pop" style={{top: 'calc(100% + 4px)', left: 0}}>
                    {spaces.map(s => {
                      const active = s.id === spaceId;
                      return (
                        <div
                          key={s.id}
                          className={"space-picker-row " + (active ? 'active' : '')}
                          onClick={() => { setSpaceId(s.id); setDirty(true); setShowSpacePicker(false); setShowSpaceRequired(false); }}
                        >
                          <span className={"dot " + accentDot(s.accent)}></span>
                          <span>{s.name}</span>
                          {active && <span className="check"><_I.check/></span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="editor-tabs">
            <button className={"editor-tab " + (tab==='source'?'active':'')} onClick={()=>setTab('source')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="m5 3-3.5 4L5 11M9 3l3.5 4L9 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span>HTML</span>
            </button>
            <button className={"editor-tab " + (tab==='preview'?'active':'')} onClick={()=>setTab('preview')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.3"/></svg>
              <span>预览</span>
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <_I.close/>
          </button>
        </div>
        <div className="editor-body">
          {tab === 'source' ? (
            <div className="editor-source-wrap">
              <div className="editor-gutter" aria-hidden="true">
                {html.split('\n').map((_, i) => <div key={i}>{i+1}</div>)}
              </div>
              <textarea
                ref={taRef}
                className="editor-source"
                value={html}
                onChange={(e) => { setHTML(e.target.value); applyMetadata(e.target.value); setDirty(true); }}
                onPaste={handlePaste}
                placeholder={doc.isNew ? "粘贴 HTML 内容到这里…" : ""}
                spellCheck={false}
              />
            </div>
          ) : (
            <iframe
              className="editor-preview"
              srcDoc={html}
              title="预览"
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          )}
        </div>
        <div className="editor-foot">
          <div className="editor-foot-meta mono">
            <span>{html.length.toLocaleString()} 字符</span>
            <span className="sep">·</span>
            <span>{html.split('\n').length} 行</span>
            <span className="sep">·</span>
            <span>{desc ? '摘要已识别' : '原文保存'}</span>
          </div>
          <div style={{display:'flex', gap: 8}}>
            <button className="btn ghost" onClick={onClose}>取消</button>
            <button className="btn secondary" onClick={() => setTab(tab==='source'?'preview':'source')}>
              {tab === 'source' ? '预览' : '编辑'}
            </button>
            <button className="btn primary" onClick={save}>
              <_I.check/><span>{doc.isNew ? '创建' : '保存'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
