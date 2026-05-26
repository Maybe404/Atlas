// @ts-nocheck — migrated verbatim from JSX prototype; incrementally type later.
// Atlas dialogs: CmdK, ShareDialog, ToastWrap
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { I, AnimatedItem, AnimatedScrollList } from './chrome';
import { apiGet } from './api-client';
import { atlasKeys } from './data-hooks';

const _I3 = I;

function CmdK({ open, spaces = [], members = [], onClose, onNavigate, onToggleTheme }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const items = useMemo(() => {
    const docs = spaces.flatMap(s => (s.children || []).map(c => ({
      type: 'doc', id: c.id, title: c.title, path: s.name + ' / ' + c.title, spaceId: s.id, docId: c.id, dot: c.dot,
    })));
    const cmds = [
      { type: 'cmd', id: 'upload',   title: '上传 HTML…',           path: '⌘⇧U', icon: 'upload',  go: { view: 'admin-upload' } },
      { type: 'cmd', id: 'admin',    title: '团队后台 · 文档列表',   path: '⌘⇧D', icon: 'doc',     go: { view: 'admin-docs' } },
      { type: 'cmd', id: 'settings', title: '空间设置 · 成员与权限', path: '⌘,',  icon: 'settings',go: { view: 'admin-settings' } },
      { type: 'cmd', id: 'theme',    title: '切换深色模式',          path: '⌘D',  icon: 'moon',    action: 'theme' },
      { type: 'cmd', id: 'trash',    title: '查看回收站',            path: '',     icon: 'trash',   go: { view: 'admin-settings' } },
      { type: 'cmd', id: 'new',      title: '新建文档…',             path: '⌘N',  icon: 'plus' },
      { type: 'cmd', id: 'invite',   title: '新增成员到工作区…',     path: '⌘⇧I', icon: 'members' },
      { type: 'cmd', id: 'share',    title: '分享当前文档…',          path: '⌘⇧S', icon: 'share' },
      { type: 'cmd', id: 'skill',    title: '查看 Skill 版本',       path: '',     icon: 'layers',  go: { view: 'admin-settings' } },
    ];
    const people = members.map(m => ({ type:'member', id:m.id, title: m.name, path: m.email, initials: m.initials }));

    const f = q.trim().toLowerCase();
    if (!f) return { docs: docs.slice(0, 8), cmds: cmds.slice(0, 6), members: people.slice(0, 4) };
    const match = (x) => x.title.toLowerCase().includes(f) || x.path.toLowerCase().includes(f);
    return { docs: docs.filter(match), cmds: cmds.filter(match), members: people.filter(match) };
  }, [members, q, spaces]);

  const flat = useMemo(() => [...items.docs, ...items.cmds, ...items.members], [items]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(flat.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[idx];
        if (!item) return;
        if (item.type === 'doc') onNavigate({ view: 'reader', spaceId: item.spaceId, docId: item.docId });
        else if (item.action === 'theme') onToggleTheme();
        else if (item.type === 'cmd' && item.go) onNavigate(item.go);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, idx, onClose, onNavigate, onToggleTheme]);

  if (!open) return null;

  let counter = 0;
  const idxOf = () => counter++;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span style={{color:'var(--ink-4)'}}><_I3.search/></span>
          <input
            autoFocus
            className="cmdk-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索文档、命令或成员…"
          />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-results">
          <div className="tree-scroll cmdk-scroll-wrap">
            <div className="scroll-list" onScroll={(e) => {
              const t = e.currentTarget;
              t.style.setProperty('--top-op', Math.min(t.scrollTop / 50, 1));
              const bd = t.scrollHeight - (t.scrollTop + t.clientHeight);
              t.style.setProperty('--bot-op', t.scrollHeight <= t.clientHeight ? 0 : Math.min(bd / 50, 1));
            }}>
          {items.docs.length > 0 && (
            <>
              <div className="cmdk-group">{q ? '文档' : '最近 · DOCUMENTS'}</div>
              {items.docs.map(it => {
                const my = idxOf();
                return (
                  <AnimatedItem index={my} key={it.id}>
                    <div className={"cmdk-item " + (my === idx ? 'active' : '')}
                         onMouseEnter={() => setIdx(my)}
                         onClick={() => { onNavigate({view:'reader', spaceId: it.spaceId, docId: it.docId}); onClose(); }}>
                      <span className={"dot " + (it.dot==='accent'?'dot-blue':it.dot==='moss'?'dot-green':it.dot==='plum'?'dot-purple':it.dot==='ink'?'dot-gray':'dot-blue')}></span>
                      <span>{it.title}</span>
                      <span className="path">{it.path}</span>
                    </div>
                  </AnimatedItem>
                );
              })}
            </>
          )}
          {items.cmds.length > 0 && (
            <>
              <div className="cmdk-group">命令 · COMMANDS</div>
              {items.cmds.map(c => {
                const my = idxOf();
                const Ico = _I3[c.icon] || _I3.doc;
                return (
                  <AnimatedItem index={my} key={c.id}>
                    <div className={"cmdk-item " + (my === idx ? 'active' : '')}
                         onMouseEnter={() => setIdx(my)}
                         onClick={() => {
                           if (c.action === 'theme') onToggleTheme();
                           else if (c.go) onNavigate(c.go);
                           onClose();
                         }}>
                      <span className="icon"><Ico/></span>
                      <span>{c.title}</span>
                      <span className="path">{c.path}</span>
                    </div>
                  </AnimatedItem>
                );
              })}
            </>
          )}
          {items.members.length > 0 && (
            <>
              <div className="cmdk-group">成员 · PEOPLE</div>
              {items.members.map(m => {
                const my = idxOf();
                return (
                  <AnimatedItem index={my} key={m.id}>
                    <div className={"cmdk-item " + (my === idx ? 'active' : '')}
                         onMouseEnter={() => setIdx(my)}>
                      <span className="avatar small" style={{width:20, height:20, fontSize:9}}>{m.initials}</span>
                      <span>{m.title}</span>
                      <span className="path">{m.path}</span>
                    </div>
                  </AnimatedItem>
                );
              })}
            </>
          )}
          {flat.length === 0 && (
            <div style={{padding:'40px 20px', textAlign:'center', color:'var(--ink-4)', fontSize:13.5}}>
              没有匹配项 · 试试 <span className="mono">RFC</span>、<span className="mono">访谈</span> 或 <span className="mono">林</span>
            </div>
          )}
            </div>
            <div className="top-gradient" style={{opacity: 'var(--top-op, 0)'}}></div>
            <div className="bottom-gradient" style={{opacity: 'var(--bot-op, 1)'}}></div>
          </div>
        </div>
        <div className="cmdk-footer">
          <span className="hint"><span className="kbd">↑</span><span className="kbd">↓</span> 导航</span>
          <span className="hint"><span className="kbd">↵</span> 选择</span>
          <span className="hint"><span className="kbd">ESC</span> 关闭</span>
          <span style={{marginLeft:'auto'}} className="dim">Atlas · 全局搜索</span>
        </div>
      </div>
    </div>
  );
}
export { CmdK };

// Share Dialog
function ShareDialog({ open, documentId, members: workspaceMembers = [], currentUser, onClose, pushToast, mutations }) {
  const [tab, setTab] = useState('invite');
  const [emailInput, setEmailInput] = useState('');
  const [copied, setCopied] = useState(false);
  const shareQuery = useQuery({
    queryKey: atlasKeys.share(documentId),
    queryFn: () => apiGet(`/documents/${documentId}/share`),
    enabled: open && Boolean(documentId),
  });

  if (!open) return null;

  const share = shareQuery.data;
  const roster = share?.members || [];
  const publicOn = Boolean(share?.public?.enabled);
  const url = share?.public?.token ? `${window.location.origin}/share/${share.public.token}` : '';
  const docTitle = documentId ? `文档 ${documentId}` : '当前文档';

  const addMember = () => {
    if (!emailInput) return;
    const m = workspaceMembers.find(x => x.email === emailInput || x.name === emailInput);
    if (m) {
      mutations.updateShare(documentId, { members: [{ memberId: m.id, role: 'viewer' }] });
      setEmailInput('');
      pushToast({ msg: '已邀请', meta: m.name });
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">分享 · {docTitle}</div>
            <div className="dialog-sub">控制谁可以打开这篇文档。变更立即生效。</div>
          </div>
          <button className="icon-btn" onClick={onClose}><_I3.close/></button>
        </div>

        <div className="dialog-tabs">
          <div className={"tab " + (tab==='invite'?'active':'')} onClick={()=>setTab('invite')}>邀请成员</div>
          <div className={"tab " + (tab==='public'?'active':'')} onClick={()=>setTab('public')}>公开链接</div>
        </div>

        <div className="dialog-body">
          {tab === 'invite' && (
            <>
              <div style={{display:'flex', gap: 8, marginBottom: 18}}>
                <input
                  className="input"
                  style={{flex:1}}
                  placeholder="按姓名或邮箱…"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addMember(); }}
                  list="atlas-members"
                />
                <datalist id="atlas-members">
                  {workspaceMembers.map(m => <option key={m.id} value={m.email}>{m.name}</option>)}
                </datalist>
                <button className="btn primary" onClick={addMember}>邀请</button>
              </div>

              <div style={{fontSize: 11, color: 'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom: 6, fontWeight: 500}}>有访问权 · {roster.length + 1}</div>
              <div className="share-roster">
                <AnimatedScrollList className="rows-scroll">
                  <div className="share-row">
                    <span className="avatar" style={{background:'var(--blue)'}}>{currentUser?.initials || 'ME'}</span>
                    <div>
                      <div className="name">{currentUser?.name || '当前用户'}</div>
                      <div className="email mono">{currentUser?.email || ''}</div>
                    </div>
                    <span className="dim" style={{marginLeft:'auto', fontSize: 12}}>作者</span>
                  </div>
                  {roster.map(mem => {
                    return (
                      <div key={mem.id} className="share-row">
                        <span className="avatar" style={{background: 'var(--parchment)', color:'var(--ink-2)'}}>{mem.initials}</span>
                        <div>
                          <div className="name">{mem.name}</div>
                          <div className="email mono">{mem.email}</div>
                        </div>
                        <select className="role-select" value={mem.role}
                                onChange={e => mutations.updateShare(documentId, { members: [{ memberId: mem.id, role: e.target.value }] })}>
                          <option value="editor">可编辑</option>
                          <option value="viewer">仅可读</option>
                        </select>
                      </div>
                    );
                  })}
                  {workspaceMembers.filter(mem => !roster.some(r => r.id === mem.id) && mem.id !== currentUser?.id).slice(0, 6).map(mem => (
                    <div key={'sg-' + mem.id} className="share-row" style={{opacity: 0.78}}>
                      <span className="avatar" style={{background: 'var(--parchment)', color:'var(--ink-3)'}}>{mem.initials}</span>
                      <div>
                        <div className="name">{mem.name}</div>
                        <div className="email mono">{mem.email}</div>
                      </div>
                      <span className="dim" style={{marginLeft:'auto', fontSize: 12}}>建议邀请</span>
                    </div>
                  ))}
                </AnimatedScrollList>
              </div>
            </>
          )}

          {tab === 'public' && (
            <>
              <div style={{display:'flex', alignItems:'flex-start', gap: 14, padding:'4px 0 18px', borderBottom:'1px solid var(--hairline-2)', marginBottom: 18}}>
                <button className={"toggle " + (publicOn ? 'on' : '')} onClick={() => mutations.updateShare(documentId, { publicEnabled: !publicOn })}></button>
                <div>
                  <div style={{fontSize: 14, fontWeight: 500, letterSpacing:'-0.012em'}}>启用公开链接</div>
                  <div style={{fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2}}>任何拥有链接的人都可阅读，无需登录。</div>
                </div>
              </div>

              <div style={{fontSize: 11, color: 'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom: 6, fontWeight: 500}}>链接</div>
              <div className="link-box">
                <span style={{color:'var(--ink-4)'}}><_I3.link/></span>
                <span className="url">{publicOn ? url : '— 当前未启用'}</span>
                <button className="btn secondary" style={{padding:'4px 12px', fontSize: 12}}
                        disabled={!publicOn}
                        onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); pushToast({msg:'已复制', meta: url}); setTimeout(()=>setCopied(false), 1400); }}>
                  {copied ? <_I3.check/> : <_I3.link width="11" height="11"/>}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </div>

              <div style={{marginTop: 18, display:'flex', flexDirection:'column', gap: 14, opacity: publicOn ? 1 : 0.45, transition: 'opacity 0.2s'}}>
                <PublicToggle
                  label="显示作者署名"
                  desc="在公开页面的脚注与索引中显示创建者"
                  value={share?.public?.showAuthor ?? true}
                  disabled={!publicOn}
                  onChange={(value) => mutations.updateShare(documentId, { showAuthor: value })}
                />
                <PublicToggle
                  label="允许搜索引擎索引"
                  desc="让公开文档出现在搜索结果中"
                  value={share?.public?.allowIndexing ?? false}
                  disabled={!publicOn}
                  onChange={(value) => mutations.updateShare(documentId, { allowIndexing: value })}
                />
                <PublicToggle
                  label="30 天后自动失效"
                  desc="到期后链接自动停用，需手动重新启用"
                  value={Boolean(share?.public?.expiresAt)}
                  disabled={!publicOn}
                  onChange={(value) => {
                    const expiresAt = value ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
                    mutations.updateShare(documentId, { expiresAt });
                  }}
                />
                <div style={{display:'flex', gap: 8, marginTop: 4}}>
                  <button
                    className="btn secondary"
                    disabled={!publicOn}
                    onClick={() => mutations.updateShare(documentId, { rotateToken: true, publicEnabled: true })}
                  >
                    <_I3.refresh/><span>重置链接</span>
                  </button>
                  <button
                    className="btn ghost danger"
                    disabled={!publicOn}
                    onClick={() => mutations.updateShare(documentId, { publicEnabled: false })}
                  >
                    <_I3.trash/><span>撤销公开链接</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dialog-foot">
          <span className="dim" style={{fontSize: 11.5, fontFamily:'var(--font-mono)'}}>由 {currentUser?.name || '当前用户'} 管理</span>
          <button className="btn primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}
export { ShareDialog };

function PublicToggle({ label, desc, value, disabled, onChange }) {
  const on = Boolean(value);
  return (
    <div style={{display:'flex', alignItems:'center', gap: 12}}>
      <button className={"toggle " + (on ? 'on' : '')} onClick={() => !disabled && onChange?.(!on)}></button>
      <div>
        <div style={{fontSize: 13.5, fontWeight: 500, letterSpacing:'-0.012em'}}>{label}</div>
        <div style={{fontSize: 12, color: 'var(--ink-3)'}}>{desc}</div>
      </div>
    </div>
  );
}

function ToastWrap({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          <span className="check">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="m2 5 2 2 4-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <span>{t.msg}</span>
          {t.meta && <span className="meta">· {t.meta}</span>}
        </div>
      ))}
    </div>
  );
}
export { ToastWrap };

// ─────────────────────────────────────────────────────────────────────────
// SPACE MANAGER DIALOG — create / edit / delete spaces
// ─────────────────────────────────────────────────────────────────────────
const SPACE_COLORS = [
  { v: 'accent', color: '#cc785c', label: '珊瑚' },
  { v: 'moss',   color: '#34c759', label: '苔藓' },
  { v: 'slate',  color: '#0066cc', label: '靛蓝' },
  { v: 'plum',   color: '#af52de', label: '紫梅' },
  { v: 'ink',    color: '#6e6e73', label: '墨灰' },
  { v: 'rose',   color: '#ff2d55', label: '玫红' },
];

function SpaceManagerDialog({ open, editing, onClose, onCreate, onUpdate, onDelete }) {
  const isEditing = editing && editing !== 'new';
  const isCreating = editing === 'new';

  const [form, setForm] = useState({ name: '', accent: 'accent' });
  useEffect(() => {
    if (isEditing) setForm({ name: editing.name, accent: editing.accent });
    else if (isCreating) setForm({ name: '', accent: 'accent' });
  }, [editing]);

  if (!open || !editing) return null;

  const submit = () => {
    if (!form.name.trim()) return;
    if (isCreating) onCreate(form);
    if (isEditing) onUpdate(editing.id, form);
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" style={{width:'min(560px, 92vw)'}} onClick={e => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">
              {isCreating ? '新建空间' : '编辑空间 · ' + editing.name}
            </div>
            <div className="dialog-sub">
              {isCreating && '新建一个空间，用来组织一组主题相关的文档。'}
              {isEditing && '修改名称与配色。所有文档会保留在原空间下。'}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><_I3.close/></button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label className="field-label">空间名称</label>
            <input
              autoFocus
              className="input"
              placeholder="例如：工程、产品、设计…"
              value={form.name}
              onChange={e => setForm(f => ({...f, name: e.target.value}))}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            />
          </div>
          <div className="field">
            <label className="field-label">配色</label>
            <div className="color-swatches">
              {SPACE_COLORS.map(c => (
                <div
                  key={c.v}
                  className={"color-swatch " + (form.accent === c.v ? 'active' : '')}
                  style={{background: c.color}}
                  title={c.label}
                  onClick={() => setForm(f => ({...f, accent: c.v}))}
                ></div>
              ))}
            </div>
            <div style={{fontSize:12, color:'var(--ink-4)', marginTop: 6}}>
              当前 · {SPACE_COLORS.find(c => c.v === form.accent)?.label}
            </div>
          </div>

          {/* preview */}
          <div style={{
            display:'flex', alignItems:'center', gap: 12,
            padding:'14px 16px',
            background:'var(--pearl)',
            borderRadius:'var(--r-md)',
            marginTop: 8,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 'var(--r-sm)',
              background: SPACE_COLORS.find(c => c.v === form.accent)?.color,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              color:'white', fontWeight: 600, fontFamily:'var(--font-display)', fontSize: 14,
            }}>{(form.name || '?').slice(0,1)}</div>
            <div>
              <div style={{fontSize: 14, fontWeight: 500}}>{form.name || '未命名空间'}</div>
              <div style={{fontSize: 12, color:'var(--ink-4)'}}>预览 · 显示在侧边栏与目录</div>
            </div>
          </div>
        </div>
        <div className="dialog-foot">
          {isEditing ? (
            <button className="btn danger ghost" onClick={() => {
              if (confirm('删除空间「' + editing.name + '」？')) { onDelete(editing.id); onClose(); }
            }}>删除空间</button>
          ) : <span></span>}
          <div style={{display:'flex', gap: 8}}>
            <button className="btn ghost" onClick={onClose}>取消</button>
            <button className="btn primary" disabled={!form.name.trim()} onClick={submit}>
              {isCreating ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export { SpaceManagerDialog };
