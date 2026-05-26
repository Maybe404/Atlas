// @ts-nocheck — migrated verbatim from JSX prototype; incrementally type later.
// Atlas admin views: Upload flow + Settings
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { I, AnimatedScrollList } from './chrome';
import { apiGet } from './api-client';
import { atlasKeys } from './data-hooks';

const _I2 = I;

function dotClass2(d) {
  return d === 'accent' ? 'dot-blue'
    : d === 'moss' ? 'dot-green'
    : d === 'slate' ? 'dot-blue'
    : d === 'plum' ? 'dot-purple'
    : d === 'ink' ? 'dot-gray'
    : 'dot-blue';
}

// ─────────────────────────────────────────────────────────────────────────
// ADMIN · upload
// ─────────────────────────────────────────────────────────────────────────
function AdminUploadView({ ctx, spaces = [], onNavigate, pushToast, mutations }) {
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [over, setOver] = useState(false);
  const [meta, setMeta] = useState({
    title: 'Lumen 系列 · 产品介绍',
    spaceId: 's2',
    visibility: 'invite',
    desc: '面向 Q3 路线图同步会的预读：投影仪市场观察、Lumen 系列定位、几位早期用户的反馈。',
    skill: 'sanitize-html@1.2.4',
  });

  useEffect(() => {
    if (!spaces.length) return;
    setMeta(m => ({ ...m, spaceId: spaces.some(s => s.id === m.spaceId) ? m.spaceId : spaces[0].id }));
  }, [spaces]);

  const acceptFiles = useCallback((incoming) => {
    const file = Array.from(incoming || []).find(f => /\.html?$/i.test(f.name)) || incoming?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMeta(m => ({ ...m, title: m.title || file.name.replace(/\.html?$/i, '') }));
    const ns = [{ name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} KB`, progress: 0 }];
    setFiles(ns);
    ns.forEach((f, i) => {
      let p = 0;
      const tick = () => {
        p += 14 + Math.random()*18;
        setFiles(fs => fs.map((x, ix) => ix === i ? { ...x, progress: Math.min(100, p) } : x));
        if (p < 100) setTimeout(tick, 100 + i*40 + Math.random()*80);
      };
      setTimeout(tick, 100 + i*60);
    });
  }, []);
  const allDone = files.length > 0 && files.every(f => f.progress >= 100);

  return (
    <div className="main-card">
      <div className="main-scroll">
        <div className="upload-wrap">
          <div className="upload-head">
            <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 8, letterSpacing:'-0.012em'}}>团队后台 · 上传</div>
            <h1>上传 HTML 文档</h1>
            <p className="sub">Atlas 不编辑 HTML——它只负责安全地展示外部生成的文档。上传后会按 skill 版本进行一次清洗，原始文件会保留。</p>

            <div className="steps">
              {['选择文件', '填写信息', '审阅与发布'].map((s, i) => (
                <div key={i} className={"step " + (step === i ? 'active' : step > i ? 'done' : '')}>
                  <span className="num">{step > i ? <_I2.check/> : String(i+1)}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="upload-card">
            {step === 0 && (
              <>
                <div
                  className={"dropzone " + (over ? 'over' : '')}
                  onDragOver={e => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={e => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
                >
                  <input
                    type="file"
                    accept=".html,.htm,text/html"
                    style={{display:'none'}}
                    id="atlas-upload-file"
                    onChange={(e) => acceptFiles(e.target.files)}
                  />
                  <div className="big">把 HTML 拖到这里</div>
                  <div className="small">支持单个 .html 文件，或 .html + assets/ 的目录压缩包</div>
                  <div className="meta">最多 8 MB · 自动清洗内联脚本</div>
                  <label className="btn secondary" htmlFor="atlas-upload-file" style={{marginTop: 14}}>选择文件</label>
                </div>

                {files.length > 0 && (
                  <div style={{marginTop: 22}}>
                    <div style={{fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10, fontWeight: 500}}>已选文件 · {files.length}</div>
                    {files.map((f, i) => (
                      <div key={i} className="file-line">
                        <div className="icon-tile"><_I2.doc/></div>
                        <span className="name">{f.name}</span>
                        <span className="meta">{f.size}</span>
                        <div className="bar"><span style={{width: f.progress + '%'}}></span></div>
                        <span className="meta" style={{minWidth: 36, textAlign: 'right'}}>{Math.round(f.progress)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => onNavigate({view:'admin-docs'})}>取消</button>
                  <button className="btn primary" disabled={!allDone} onClick={() => setStep(1)}>
                    <span>下一步</span><_I2.arrow/>
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="field">
                  <label className="field-label">标题</label>
                  <input className="input" value={meta.title} onChange={e => setMeta(m => ({...m, title: e.target.value}))}/>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14}}>
                  <div className="field">
                    <label className="field-label">归属空间</label>
                    <select className="input" value={meta.spaceId} onChange={e => setMeta(m => ({...m, spaceId: e.target.value}))}>
                      {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">可见性</label>
                    <select className="input" value={meta.visibility} onChange={e => setMeta(m => ({...m, visibility: e.target.value}))}>
                      <option value="private">私密</option>
                      <option value="invite">受邀</option>
                      <option value="public">公开</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">摘要 · 在索引页显示</label>
                  <textarea className="input textarea" value={meta.desc} onChange={e => setMeta(m => ({...m, desc: e.target.value}))}/>
                </div>
                <div className="field">
                  <label className="field-label">清洗 skill</label>
                  <div className="input" style={{display:'flex', alignItems:'center', gap: 10, fontFamily:'var(--font-mono)', fontSize: 12.5}}>
                    <span className="dot dot-green" style={{width:7, height:7, borderRadius:'50%'}}></span>
                    <span>{meta.skill}</span>
                    <span className="dim" style={{marginLeft:'auto', fontSize: 11, fontFamily:'var(--font)'}}>当前 · 由林知远发布</span>
                  </div>
                </div>
                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => setStep(0)}>上一步</button>
                  <button className="btn primary" onClick={() => setStep(2)}>
                    <span>预览与发布</span><_I2.arrow/>
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div style={{borderRadius:'var(--r-md)', overflow:'hidden', border:'1px solid var(--hairline-2)'}}>
                  <div style={{padding:'14px 18px', borderBottom:'1px solid var(--hairline-2)', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--pearl)'}}>
                    <span style={{fontSize: 13, fontWeight: 500, letterSpacing:'-0.012em'}}>预览（清洗后）</span>
                    <span className="mono dim" style={{fontSize: 11}}>sandbox 已启用 · 高度自适应</span>
                  </div>
                  <div style={{padding:'28px 24px', background: 'var(--canvas)'}}>
                    <div style={{fontFamily:'var(--font-display)', fontSize: 24, fontWeight: 600, letterSpacing:'-0.022em', marginBottom: 8}}>{meta.title}</div>
                    <div style={{color: 'var(--ink-3)', fontSize: 14, marginBottom: 18, letterSpacing:'-0.012em'}}>{meta.desc}</div>
                    <div style={{
                      background: 'linear-gradient(180deg, #f8f8fa, #ececf0)',
                      borderRadius: 'var(--r-md)',
                      height: 100,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#b0b0b8',
                      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                    }}>HTML 内容预览</div>
                  </div>
                </div>

                <div style={{marginTop: 16, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12}}>
                  <div style={{background:'var(--pearl)', borderRadius:'var(--r-md)', padding:'14px 16px'}}>
                    <div style={{fontSize: 11, color: 'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom: 4, fontWeight: 500}}>清洗结果</div>
                    <div style={{fontSize: 13.5}}>移除 2 条内联脚本</div>
                    <div style={{fontSize: 13.5, color: 'var(--ink-3)'}}>外链资源 3 项已代理</div>
                  </div>
                  <div style={{background:'var(--pearl)', borderRadius:'var(--r-md)', padding:'14px 16px'}}>
                    <div style={{fontSize: 11, color: 'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom: 4, fontWeight: 500}}>分享设置</div>
                    <div style={{fontSize: 13.5, display:'flex', alignItems:'center', gap: 8}}>
                      <span className={"vis-chip " + meta.visibility}>{meta.visibility==='public'?'Public':meta.visibility==='invite'?'Invite':'Private'}</span>
                      <span className="mono" style={{fontSize: 11, color:'var(--ink-3)'}}>{spaces.find(s=>s.id===meta.spaceId)?.name}</span>
                    </div>
                  </div>
                </div>

                <div className="flow-footer">
                  <button className="btn ghost" onClick={() => setStep(1)}>上一步</button>
                  <div style={{display:'flex', gap: 8}}>
                    <button className="btn secondary">存为草稿</button>
                    <button className="btn primary" disabled={!selectedFile} onClick={() => {
                      const formData = new FormData();
                      formData.set('file', selectedFile);
                      formData.set('title', meta.title);
                      formData.set('desc', meta.desc);
                      formData.set('spaceId', meta.spaceId);
                      formData.set('visibility', meta.visibility);
                      mutations.uploadDocument(formData, {
                        onSuccess: () => {
                          setStep(3);
                          setTimeout(() => onNavigate({view:'admin-docs'}), 900);
                        },
                      });
                    }}>
                      <_I2.check/><span>发布</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <div style={{textAlign:'center', padding:'60px 0'}}>
                <div style={{
                  width: 60, height: 60, margin: '0 auto 18px',
                  background: 'var(--blue)', borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', animation: 'pop 0.4s var(--ease-spring)',
                }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="m6 14 6 6L22 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div style={{fontFamily:'var(--font-display)', fontSize: 24, fontWeight: 600, letterSpacing:'-0.022em', marginBottom: 6}}>文档已发布</div>
                <div className="muted" style={{fontSize: 14}}>正在跳转回文档列表…</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export { AdminUploadView };

// ─────────────────────────────────────────────────────────────────────────
// ADMIN · settings
// ─────────────────────────────────────────────────────────────────────────
function AdminSettingsView({ ctx, onNavigate, pushToast, spaces = [], members = [], permissions = [], currentUser, mutations, onEditSpace, onNewSpace }) {
  const [pane, setPane] = useState('spaces');

  const perms = useMemo(() => {
    const p = {};
    members.forEach((m) => {
      p[m.id] = {};
      spaces.forEach((s) => { p[m.id][s.id] = null; });
    });
    permissions.forEach((perm) => {
      p[perm.memberId] = p[perm.memberId] || {};
      p[perm.memberId][perm.spaceId] = perm.role;
    });
    return p;
  }, [members, permissions, spaces]);

  const setMemberSpaceRole = (memberId, spaceId, role) => {
    mutations.setSpaceRole(spaceId, memberId, role);
  };

  return (
    <div className="main-card">
      <div className="settings-shell">
        <nav className="settings-nav">
          <div className="settings-nav-group">工作区</div>
          <div className={"settings-nav-item " + (pane==='general'?'active':'')} onClick={()=>setPane('general')}>
            <_I2.settings/><span>常规</span>
          </div>
          <div className={"settings-nav-item " + (pane==='spaces'?'active':'')} onClick={()=>setPane('spaces')}>
            <_I2.folder/><span>空间</span>
          </div>
          <div className={"settings-nav-item " + (pane==='members'?'active':'')} onClick={()=>setPane('members')}>
            <_I2.members/><span>成员</span>
          </div>
          <div className={"settings-nav-item " + (pane==='permissions'?'active':'')} onClick={()=>setPane('permissions')}>
            <_I2.lock/><span>空间权限</span>
          </div>
          <div className="settings-nav-group">维护</div>
          <div className={"settings-nav-item " + (pane==='trash'?'active':'')} onClick={()=>setPane('trash')}>
            <_I2.trash/><span>回收站</span>
          </div>
          <div className={"settings-nav-item " + (pane==='skills'?'active':'')} onClick={()=>setPane('skills')}>
            <_I2.layers/><span>Skill 版本</span>
          </div>
        </nav>

        <div className="settings-pane">
          {pane === 'general' && <GeneralPane/>}
          {pane === 'spaces' && (
            <SpacesPane
              spaces={spaces}
              perms={perms}
              onEditSpace={onEditSpace}
              onNewSpace={onNewSpace}
              onDeleteSpace={(id) => { if (confirm('确认删除该空间？其下文档会一起删除。')) { mutations.deleteSpace(id); } }}
            />
          )}
          {pane === 'members' && <MembersPane spaces={spaces} members={members} perms={perms} currentUser={currentUser} setMemberSpaceRole={setMemberSpaceRole} pushToast={pushToast} mutations={mutations}/>}
          {pane === 'permissions' && <PermissionsPane spaces={spaces} members={members} perms={perms} setMemberSpaceRole={setMemberSpaceRole} pushToast={pushToast}/>}
          {pane === 'trash' && <TrashPane pushToast={pushToast} mutations={mutations}/>}
          {pane === 'skills' && <SkillsPane pushToast={pushToast} mutations={mutations}/>}
        </div>
      </div>
    </div>
  );
}
export { AdminSettingsView };

function GeneralPane() {
  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6, letterSpacing:'-0.012em'}}>工作区 · 林氏工作室</div>
        <h1>常规</h1>
        <p className="pane-sub">工作区基本信息。</p>
      </div>
      <div className="setting-card flat">
        <div className="card-body">
          <div className="field">
            <label className="field-label">工作区名称</label>
            <input className="input" defaultValue="林氏工作室"/>
          </div>
          <div className="field">
            <label className="field-label">URL 标识符</label>
            <div style={{display:'flex', alignItems:'center', gap: 0}}>
              <div style={{padding:'10px 14px', background:'var(--pearl)', borderTopLeftRadius:'var(--r-md)', borderBottomLeftRadius:'var(--r-md)', fontFamily:'var(--font-mono)', fontSize: 13, color: 'var(--ink-3)'}}>atlas.team /</div>
              <input className="input" defaultValue="lin-studio" style={{flex: 1, borderTopLeftRadius:0, borderBottomLeftRadius:0, fontFamily:'var(--font-mono)'}}/>
            </div>
          </div>
          <div className="field" style={{marginBottom: 0}}>
            <label className="field-label">默认语言</label>
            <select className="input"><option>简体中文</option><option>English</option></select>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SPACES PANE — CRUD on spaces; replaces the old reader-side mini dialog
// ─────────────────────────────────────────────────────────────────────────
const SPACE_COLOR_MAP = {
  accent: '#cc785c', moss: '#34c759', slate: '#0066cc',
  plum: '#af52de', ink: '#6e6e73', rose: '#ff2d55',
};
const SPACE_COLOR_LABEL = {
  accent: '珊瑚', moss: '苔藓', slate: '靛蓝', plum: '紫梅', ink: '墨灰', rose: '玫红',
};

function SpacesPane({ spaces, perms, onEditSpace, onNewSpace, onDeleteSpace }) {
  const memberCountFor = (spaceId) => {
    return Object.values(perms).filter(p => p?.[spaceId]).length;
  };
  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6}}>工作区 · 空间</div>
        <h1>空间</h1>
        <p className="pane-sub">空间是文档的归属单元——每篇 HTML 文章必须属于一个空间。成员对空间的访问权限可在「空间权限」中分别设置。</p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>所有空间 · {spaces.length}</h3>
            <div className="sub">点击行编辑名称与配色，或删除（其下文档移至「私人草稿」）</div>
          </div>
          <button className="btn primary" onClick={onNewSpace}><_I2.plus/><span>新建空间</span></button>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {spaces.map(sp => {
              const color = SPACE_COLOR_MAP[sp.accent] || SPACE_COLOR_MAP.accent;
              const label = SPACE_COLOR_LABEL[sp.accent] || '珊瑚';
              return (
                <div key={sp.id} className="space-mgr-row" onClick={() => onEditSpace(sp)} style={{cursor:'pointer'}}>
                  <div className="sm-mark" style={{background: color}}>{sp.mark || sp.name.slice(0,1)}</div>
                  <div>
                    <div className="sm-name">{sp.name}</div>
                    <div className="sm-meta">{label} · {sp.children?.length || 0} 篇文档 · {memberCountFor(sp.id)} 位成员</div>
                  </div>
                  <div className="sm-count">{sp.count || sp.children?.length || 0}</div>
                  <div className="sm-actions" onClick={(e)=>e.stopPropagation()}>
                    <button className="icon-btn" title="编辑" onClick={() => onEditSpace(sp)}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="m9 2.5 2.5 2.5L4 12.5H1.5V10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                    </button>
                    <button className="icon-btn" title="删除" onClick={() => onDeleteSpace(sp.id)}>
                      <_I2.trash/>
                    </button>
                  </div>
                </div>
              );
            })}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}

function MembersPane({ spaces, members = [], perms, currentUser, setMemberSpaceRole, pushToast, mutations }) {
  const [editingMember, setEditingMember] = useState(null); // member id whose space-access menu is open
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [passwordMember, setPasswordMember] = useState(null);
  const [showNewMember, setShowNewMember] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', password: '', role: 'viewer' });
  const [passwordDraft, setPasswordDraft] = useState('');
  const avatarColors = ['var(--blue)', '#ff9500', '#34c759', '#af52de', '#ff2d55', '#5856d6', '#ff6482', '#30b0c7'];

  useEffect(() => {
    if (!editingMember) return;
    const onDocClick = (e) => {
      if (e.target.closest('.access-pop') || e.target.closest('[data-access-trigger]')) return;
      setEditingMember(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [editingMember]);

  useEffect(() => {
    if (!menuOpenId) return;
    const onDocClick = (e) => {
      if (e.target.closest('.row-menu') || e.target.closest('[data-member-more]')) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  const submitNewMember = (e) => {
    e.preventDefault();
    const payload = {
      name: newMember.name.trim(),
      email: newMember.email.trim(),
      password: newMember.password,
      role: newMember.role,
    };
    if (!payload.name || !payload.email || payload.password.length < 8) {
      pushToast?.({ msg: '请补全成员信息', meta: '密码至少 8 位' });
      return;
    }
    mutations.createMember(payload, {
      onSuccess: () => {
        setNewMember({ name: '', email: '', password: '', role: 'viewer' });
        setShowNewMember(false);
      },
      onError: (error) => pushToast?.({ msg: '新增成员失败', meta: error?.message }),
    });
  };

  const savePassword = (member) => {
    if (passwordDraft.length < 8) {
      pushToast?.({ msg: '密码至少 8 位', meta: member.name });
      return;
    }
    mutations.updateMember(member.id, { password: passwordDraft }, {
      onSuccess: () => {
        setPasswordMember(null);
        setPasswordDraft('');
      },
      onError: (error) => pushToast?.({ msg: '密码更新失败', meta: error?.message }),
    });
  };

  const deleteMember = (member) => {
    if (member.id === currentUser?.id) {
      pushToast?.({ msg: '不能删除当前登录成员' });
      return;
    }
    if (!confirm(`确认删除成员「${member.name}」？该成员的文档会转交给当前管理员。`)) return;
    mutations.deleteMember(member.id, {
      onSuccess: () => {
        if (passwordMember === member.id) {
          setPasswordMember(null);
          setPasswordDraft('');
        }
        setMenuOpenId(null);
      },
      onError: (error) => pushToast?.({ msg: '删除成员失败', meta: error?.message }),
    });
  };

  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6}}>工作区 · 成员</div>
        <h1>成员</h1>
        <p className="pane-sub">{members.length} 位成员协作于 {spaces.length} 个空间。每位成员可同时拥有多个空间的访问权限；点击右侧的「空间访问」可逐项调整。</p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>团队成员</h3>
            <div className="sub">所有成员对此列表可见</div>
          </div>
          <button className="btn primary" onClick={() => setShowNewMember(v => !v)}>
            <_I2.plus/><span>新增成员</span>
          </button>
        </div>
        {showNewMember && (
          <form className="member-create-row" onSubmit={submitNewMember}>
            <div className="field compact">
              <label className="field-label">姓名</label>
              <input
                className="input"
                value={newMember.name}
                onChange={(e) => setNewMember(m => ({ ...m, name: e.target.value }))}
                placeholder="成员姓名"
                autoFocus
              />
            </div>
            <div className="field compact">
              <label className="field-label">邮箱</label>
              <input
                className="input"
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember(m => ({ ...m, email: e.target.value }))}
                placeholder="name@atlas.team"
              />
            </div>
            <div className="field compact">
              <label className="field-label">初始密码</label>
              <input
                className="input"
                type="password"
                value={newMember.password}
                onChange={(e) => setNewMember(m => ({ ...m, password: e.target.value }))}
                placeholder="至少 8 位"
                autoComplete="new-password"
              />
            </div>
            <div className="field compact">
              <label className="field-label">角色</label>
              <select
                className="input"
                value={newMember.role}
                onChange={(e) => setNewMember(m => ({ ...m, role: e.target.value }))}
              >
                <option value="admin">管理员</option>
                <option value="editor">编辑</option>
                <option value="viewer">仅读者</option>
              </select>
            </div>
            <div className="member-create-actions">
              <button type="button" className="btn ghost" onClick={() => setShowNewMember(false)}>取消</button>
              <button type="submit" className="btn primary">保存</button>
            </div>
          </form>
        )}
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {members.map((m, i) => {
              const memberPerms = perms[m.id] || {};
              const accessSpaces = spaces.filter(s => memberPerms[s.id]);
              return (
                <div key={m.id} className="member-row-wrap">
                  <div className="member-row member-row-grid">
                    <span className="avatar" style={{background: avatarColors[i % avatarColors.length]}}>{m.initials}</span>
                    <div className="member-meta">
                      <div className="name">{m.name}</div>
                      <div className="email mono">{m.email}</div>
                    </div>
                    <select
                      className="input"
                      value={m.role}
                      onChange={e => {
                        mutations.updateMember(m.id, { role: e.target.value });
                      }}
                      style={{padding:'6px 32px 6px 10px', fontSize:13}}>
                      <option value="admin">管理员</option>
                      <option value="editor">编辑</option>
                      <option value="viewer">仅读者</option>
                    </select>
                    <div className="access-cell" style={{position:'relative'}}>
                      <button
                        className="access-trigger"
                        data-access-trigger
                        onClick={() => setEditingMember(editingMember === m.id ? null : m.id)}
                        title="编辑空间访问"
                      >
                        {accessSpaces.length === 0 && (
                          <span className="access-empty">未分配空间</span>
                        )}
                        {accessSpaces.slice(0, 3).map(s => (
                          <span key={s.id} className="access-pill">
                            <span className="dot" style={{background: SPACE_COLOR_MAP[s.accent]}}></span>
                            <span>{s.name}</span>
                            <span className="role">{memberPerms[s.id] === 'editor' ? '编' : '读'}</span>
                          </span>
                        ))}
                        {accessSpaces.length > 3 && (
                          <span className="access-pill more">+{accessSpaces.length - 3}</span>
                        )}
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{marginLeft: 2, color:'var(--ink-4)'}}>
                          <path d="M2 3.5 5 7 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {editingMember === m.id && (
                        <div className="access-pop" onMouseDown={(e)=>e.stopPropagation()}>
                          <div className="access-pop-head">
                            <span>{m.name} · 空间访问</span>
                            <button className="icon-btn" onClick={()=>setEditingMember(null)}><_I2.close/></button>
                          </div>
                          <div className="access-pop-body">
                            {spaces.map(s => {
                              const role = memberPerms[s.id] || null;
                              return (
                                <div key={s.id} className="access-pop-row">
                                  <span className="sm-mark" style={{background: SPACE_COLOR_MAP[s.accent], width: 22, height: 22, borderRadius: 6, fontSize: 11}}>{s.mark || s.name.slice(0,1)}</span>
                                  <span className="access-pop-name">{s.name}</span>
                                  <div className="segmented access-seg">
                                    <button className={role===null?'active':''} onClick={() => setMemberSpaceRole(m.id, s.id, null)}>无</button>
                                    <button className={role==='viewer'?'active':''} onClick={() => setMemberSpaceRole(m.id, s.id, 'viewer')}>仅读</button>
                                    <button className={role==='editor'?'active':''} onClick={() => setMemberSpaceRole(m.id, s.id, 'editor')}>编辑</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="joined">加入 · {m.joined}</div>
                    <div className="member-actions">
                      <button
                        className="icon-btn"
                        data-member-more
                        title="成员操作"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === m.id ? null : m.id);
                        }}
                      >
                        <_I2.more/>
                      </button>
                      {menuOpenId === m.id && (
                        <div className="row-menu member-row-menu" onClick={(e)=>e.stopPropagation()}>
                          <button className="row-menu-item" onClick={() => {
                            setPasswordMember(m.id);
                            setPasswordDraft('');
                            setMenuOpenId(null);
                          }}>
                            <_I2.lock/><span>编辑密码</span>
                          </button>
                          <div className="row-menu-sep"></div>
                          <button className="row-menu-item danger" onClick={() => deleteMember(m)}>
                            <_I2.trash/><span>删除成员</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {passwordMember === m.id && (
                    <div className="member-password-row">
                      <div>
                        <div className="member-password-title">编辑 {m.name} 的登录密码</div>
                        <div className="member-password-sub">保存后该成员下次登录需使用新密码。</div>
                      </div>
                      <input
                        className="input"
                        type="password"
                        value={passwordDraft}
                        onChange={(e) => setPasswordDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') savePassword(m);
                          if (e.key === 'Escape') {
                            setPasswordMember(null);
                            setPasswordDraft('');
                          }
                        }}
                        placeholder="输入新密码"
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button className="btn ghost" onClick={() => {
                        setPasswordMember(null);
                        setPasswordDraft('');
                      }}>取消</button>
                      <button className="btn primary" onClick={() => savePassword(m)}>保存密码</button>
                    </div>
                  )}
                </div>
              );
            })}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}

function PermissionsPane({ spaces, members = [], perms, setMemberSpaceRole, pushToast }) {
  const [activeSpace, setActiveSpace] = useState(spaces[0]?.id || 's1');
  const space = spaces.find(s => s.id === activeSpace) || spaces[0];
  if (!space) return <div className="pane-head"><h1>空间权限</h1><p className="pane-sub">尚未创建任何空间。</p></div>;

  const spaceColor = SPACE_COLOR_MAP[space.accent] || SPACE_COLOR_MAP.accent;

  const setAll = (role) => {
    members.forEach(m => setMemberSpaceRole(m.id, space.id, role));
    pushToast({ msg: '已批量更新', meta: space.name });
  };

  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6}}>工作区 · 空间权限</div>
        <h1>空间权限</h1>
        <p className="pane-sub">为每个空间分别指定成员的角色——编辑可创建与修改文档，仅读只能查看。一位成员可以同时拥有多个空间的访问权限。</p>
      </div>

      <div className="space-tabs">
        {spaces.map(s => (
          <button
            key={s.id}
            className={"space-tab " + (activeSpace === s.id ? 'active' : '')}
            onClick={()=>setActiveSpace(s.id)}
          >
            <span className="dot" style={{background: SPACE_COLOR_MAP[s.accent]}}></span>
            <span>{s.name}</span>
            <span className="count mono">{Object.values(perms).filter(p => p?.[s.id]).length}</span>
          </button>
        ))}
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3 style={{display:'flex', alignItems:'center', gap: 8}}>
              <span className="sm-mark" style={{background: spaceColor, width: 22, height: 22, borderRadius: 6, fontSize: 11}}>{space.mark || space.name.slice(0,1)}</span>
              <span>{space.name} · 成员访问</span>
            </h3>
            <div className="sub">为该空间内的所有成员指定角色。修改立即生效。</div>
          </div>
          <div style={{display:'flex', gap: 6}}>
            <button className="btn ghost" onClick={()=>setAll(null)}>清空</button>
            <button className="btn secondary" onClick={()=>setAll('viewer')}>全部设为仅读</button>
          </div>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {members.map(m => {
              const role = perms[m.id]?.[space.id] || null;
              return (
                <div key={m.id} className="perm-matrix-row">
                  <span className="avatar small">{m.initials}</span>
                  <div className="perm-matrix-meta">
                    <div className="name">{m.name}</div>
                    <div className="email mono">{m.email}</div>
                  </div>
                  <div className="segmented access-seg">
                    <button className={role===null?'active':''} onClick={() => setMemberSpaceRole(m.id, space.id, null)}>无访问</button>
                    <button className={role==='viewer'?'active':''} onClick={() => setMemberSpaceRole(m.id, space.id, 'viewer')}>仅读</button>
                    <button className={role==='editor'?'active':''} onClick={() => setMemberSpaceRole(m.id, space.id, 'editor')}>编辑</button>
                  </div>
                </div>
              );
            })}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}

function PermRow({ label, desc, def }) {
  const [on, setOn] = useState(def);
  return (
    <div className="perm-row">
      <div className="text">
        <div className="label">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <button className={"toggle " + (on ? 'on' : '')} onClick={() => setOn(o => !o)} aria-label={label}></button>
    </div>
  );
}

function TrashPane({ pushToast, mutations }) {
  const trashQuery = useQuery({
    queryKey: atlasKeys.trash,
    queryFn: () => apiGet('/documents/trash'),
  });
  const items = trashQuery.data || [];
  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6}}>维护 · 回收站</div>
        <h1>回收站</h1>
        <p className="pane-sub">删除后保留 30 天，可恢复至原空间。过期项目将被永久删除。</p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>已删除 · {items.length}</h3>
            <div className="sub">按删除时间倒序</div>
          </div>
          <button className="btn ghost danger" onClick={() => mutations.purgeExpiredTrash?.()}>
            清理过期项目
          </button>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {items.map(it => (
              <div key={it.id} className="trash-row">
                <div>
                  <div className="doc-name">{it.title}</div>
                  <div className="location">原位置 · {it.spaceName}</div>
                </div>
                <div className="by">作者 · {it.authorName}</div>
                <div className="when">{it.updated}</div>
                <div className="expires">{it.purgeAfter ? `${new Date(it.purgeAfter).toLocaleDateString('zh-CN')} 清理` : '30 天内'}</div>
                <button className="icon-btn" title="恢复" onClick={() => {
                  mutations.restoreDocument(it.id);
                }}><_I2.refresh/></button>
              </div>
            ))}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}

function SkillsPane({ pushToast, mutations }) {
  const skillsQuery = useQuery({
    queryKey: atlasKeys.skills,
    queryFn: () => apiGet('/skills'),
  });
  const versions = skillsQuery.data || [];
  return (
    <>
      <div className="pane-head">
        <div style={{fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6}}>维护 · Skill</div>
        <h1>Skill 版本</h1>
        <p className="pane-sub">Skill 是 Atlas 用来处理外部 HTML 的小程序。切换版本影响后续上传的文档；历史文档保留发布时的版本。</p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>sanitize-html</h3>
            <div className="sub" style={{maxWidth: 520}}>负责将外部 HTML 清洗为 Atlas 可安全嵌入的格式：处理内联脚本、外链资源、不安全属性。</div>
          </div>
          <button className="btn secondary"><_I2.upload width="13" height="13"/><span>上传新版本</span></button>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {versions.map(v => {
              const isActive = v.active;
              return (
                <div key={v.version} className="skill-row">
                  <div>
                    <div className={"ver " + (isActive ? 'current' : '')}>v{v.version}</div>
                    <div className="note">{v.note}</div>
                  </div>
                  <div className="status">{isActive ? '使用中' : '可回滚'}</div>
                  <div>
                    <div className="when">{new Date(v.createdAt).toLocaleDateString('zh-CN')}</div>
                    <div className="note" style={{fontSize: 11.5}}>{v.name}</div>
                  </div>
                  <div>
                    {!isActive && (
                      <button className="btn secondary" style={{padding:'5px 12px', fontSize: 12.5}}
                        onClick={() => mutations.activateSkill(v.version)}>
                        切换至此
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}
