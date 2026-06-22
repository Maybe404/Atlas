// Atlas dialogs: CmdK, ShareDialog, ToastWrap

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from './api-client';
import { AnimatedItem, AnimatedScrollList, I } from './chrome';
import { atlasKeys } from './data-hooks';
import type { Loose } from './loose-types';
import { dotClass, SPACE_COLORS } from './theme-tokens';
import { clickableProps, confirmDialog, Select } from './ui-kit';
import { publicShareUrl } from './url-utils';

const _I3 = I;

const SHARE_ROLE_OPTIONS = [
  { value: 'editor', label: '可编辑' },
  { value: 'viewer', label: '仅可读' },
  { value: '', label: '移除' },
];

function CmdK({
  open,
  spaces = [],
  members = [],
  onClose,
  onNavigate,
  onToggleTheme,
  onShareCurrent,
}: Loose) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);

  const items = useMemo(() => {
    const docs = spaces.flatMap((s: Loose) =>
      (s.children || []).map((c: Loose) => ({
        type: 'doc',
        id: c.id,
        title: c.title,
        path: `${s.name} / ${c.title}`,
        spaceId: s.id,
        docId: c.id,
        dot: c.dot || 'slate',
      })),
    );
    const cmds = [
      {
        type: 'cmd',
        id: 'upload',
        title: '上传 HTML…',
        path: '⌘⇧U',
        icon: 'upload',
        go: { view: 'admin-upload' },
      },
      {
        type: 'cmd',
        id: 'admin',
        title: '团队后台 · 文档列表',
        path: '⌘⇧D',
        icon: 'doc',
        go: { view: 'admin-docs', spaceId: 'all' },
      },
      {
        type: 'cmd',
        id: 'settings',
        title: '空间设置 · 成员与权限',
        path: '⌘,',
        icon: 'settings',
        go: { view: 'admin-settings' },
      },
      {
        type: 'cmd',
        id: 'theme',
        title: '切换深色模式',
        path: '',
        icon: 'moon',
        action: 'theme',
      },
      {
        type: 'cmd',
        id: 'trash',
        title: '查看回收站',
        path: '',
        icon: 'trash',
        go: { view: 'admin-settings', pane: 'trash' },
      },
      {
        type: 'cmd',
        id: 'new',
        title: '新建 / 上传文档…',
        path: '',
        icon: 'plus',
        go: { view: 'admin-upload' },
      },
      {
        type: 'cmd',
        id: 'invite',
        title: '新增成员到工作区…',
        path: '⌘⇧I',
        icon: 'members',
        go: { view: 'admin-settings', pane: 'members' },
      },
      {
        type: 'cmd',
        id: 'share',
        title: '分享当前文档…',
        path: '⌘⇧S',
        icon: 'share',
        action: 'share',
      },
    ];
    const people = members.map((m: Loose) => ({
      type: 'member',
      id: m.id,
      title: m.name,
      path: m.email,
      initials: m.initials,
    }));

    const f = q.trim().toLowerCase();
    if (!f) return { docs: docs.slice(0, 8), cmds: cmds.slice(0, 6), members: people.slice(0, 4) };
    const match = (x: Loose) =>
      x.title.toLowerCase().includes(f) || x.path.toLowerCase().includes(f);
    return { docs: docs.filter(match), cmds: cmds.filter(match), members: people.filter(match) };
  }, [members, q, spaces]);

  const flat = useMemo(() => [...items.docs, ...items.cmds, ...items.members], [items]);

  useEffect(() => {
    setIdx(0);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: Loose) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i: Loose) => Math.min(flat.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i: Loose) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[idx];
        if (!item) return;
        if (item.type === 'doc')
          onNavigate({ view: 'reader', spaceId: item.spaceId, docId: item.docId });
        else if (item.action === 'theme') onToggleTheme();
        else if (item.action === 'share') onShareCurrent?.();
        else if (item.type === 'member') onNavigate({ view: 'admin-settings', pane: 'members' });
        else if (item.type === 'cmd' && item.go) onNavigate(item.go);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, idx, onClose, onNavigate, onToggleTheme, onShareCurrent]);

  if (!open) return null;

  let counter = 0;
  const idxOf = () => counter++;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; dismissable via Escape and the input's clear/close affordances
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop; dismissable via Escape and the input's clear/close affordances
    <div className="overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only stops backdrop-dismiss propagation */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: panel only stops backdrop-dismiss propagation */}
      <div className="cmdk" onClick={(e: Loose) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span style={{ color: 'var(--ink-4)' }}>
            <_I3.search />
          </span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            className="cmdk-input"
            value={q}
            onChange={(e: Loose) => setQ(e.target.value)}
            placeholder="搜索文档、命令或成员…"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="cmdk-listbox"
            aria-activedescendant={flat.length > 0 ? `cmdk-opt-${idx}` : undefined}
            aria-label="搜索文档、命令或成员"
          />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-results">
          <div className="tree-scroll cmdk-scroll-wrap">
            <div
              id="cmdk-listbox"
              role="listbox"
              aria-label="搜索结果"
              className="scroll-list"
              onScroll={(e: Loose) => {
                const t = e.currentTarget as Loose;
                t.style.setProperty('--top-op', Math.min(t.scrollTop / 50, 1));
                const bd = t.scrollHeight - (t.scrollTop + t.clientHeight);
                t.style.setProperty(
                  '--bot-op',
                  t.scrollHeight <= t.clientHeight ? 0 : Math.min(bd / 50, 1),
                );
              }}
            >
              {items.docs.length > 0 && (
                <>
                  <div className="cmdk-group">{q ? '文档' : '最近 · DOCUMENTS'}</div>
                  {items.docs.map((it: Loose) => {
                    const my = idxOf();
                    return (
                      <AnimatedItem index={my} key={it.id}>
                        {/* biome-ignore lint/a11y/useFocusableInteractive: option belongs to an aria-activedescendant listbox; the combobox input owns keyboard focus */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: option belongs to an aria-activedescendant listbox; keyboard handled by the combobox input */}
                        <div
                          id={`cmdk-opt-${my}`}
                          role="option"
                          aria-selected={my === idx}
                          className={`cmdk-item ${my === idx ? 'active' : ''}`}
                          onMouseEnter={() => setIdx(my)}
                          onClick={() => {
                            onNavigate({ view: 'reader', spaceId: it.spaceId, docId: it.docId });
                            onClose();
                          }}
                        >
                          <span className={`dot ${dotClass(it.dot)}`}></span>
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
                  {items.cmds.map((c: Loose) => {
                    const my = idxOf();
                    const Ico = _I3[c.icon as keyof typeof _I3] || _I3.doc;
                    return (
                      <AnimatedItem index={my} key={c.id}>
                        {/* biome-ignore lint/a11y/useFocusableInteractive: option belongs to an aria-activedescendant listbox; the combobox input owns keyboard focus */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: option belongs to an aria-activedescendant listbox; keyboard handled by the combobox input */}
                        <div
                          id={`cmdk-opt-${my}`}
                          role="option"
                          aria-selected={my === idx}
                          className={`cmdk-item ${my === idx ? 'active' : ''}`}
                          onMouseEnter={() => setIdx(my)}
                          onClick={() => {
                            if (c.action === 'theme') onToggleTheme();
                            else if (c.action === 'share') onShareCurrent?.();
                            else if (c.go) onNavigate(c.go);
                            onClose();
                          }}
                        >
                          <span className="icon">
                            <Ico />
                          </span>
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
                  {items.members.map((m: Loose) => {
                    const my = idxOf();
                    return (
                      <AnimatedItem index={my} key={m.id}>
                        {/* biome-ignore lint/a11y/useFocusableInteractive: option belongs to an aria-activedescendant listbox; the combobox input owns keyboard focus */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: option belongs to an aria-activedescendant listbox; keyboard handled by the combobox input */}
                        <div
                          id={`cmdk-opt-${my}`}
                          role="option"
                          aria-selected={my === idx}
                          className={`cmdk-item ${my === idx ? 'active' : ''}`}
                          onMouseEnter={() => setIdx(my)}
                          onClick={() => {
                            onNavigate({ view: 'admin-settings', pane: 'members' });
                            onClose();
                          }}
                        >
                          <span
                            className="avatar small"
                            style={{ width: 20, height: 20, fontSize: 9 }}
                          >
                            {m.initials}
                          </span>
                          <span>{m.title}</span>
                          <span className="path">{m.path}</span>
                        </div>
                      </AnimatedItem>
                    );
                  })}
                </>
              )}
              {flat.length === 0 && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--ink-4)',
                    fontSize: 13.5,
                  }}
                >
                  没有匹配项 · 换个关键词试试，可搜索文档标题、命令或成员
                </div>
              )}
            </div>
            <div className="top-gradient" style={{ opacity: 'var(--top-op, 0)' }}></div>
            <div className="bottom-gradient" style={{ opacity: 'var(--bot-op, 1)' }}></div>
          </div>
        </div>
        <div className="cmdk-footer">
          <span className="hint">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> 导航
          </span>
          <span className="hint">
            <span className="kbd">↵</span> 选择
          </span>
          <span className="hint">
            <span className="kbd">ESC</span> 关闭
          </span>
          <span style={{ marginLeft: 'auto' }} className="dim">
            Atlas · 全局搜索
          </span>
        </div>
      </div>
    </div>
  );
}

export { CmdK };

// Share Dialog
function ShareDialog({
  open,
  documentId,
  documentTitle,
  members: _workspaceMembers = [],
  currentUser,
  onClose,
  pushToast,
  mutations,
}: Loose) {
  const [tab, setTab] = useState('invite');
  const [emailInput, setEmailInput] = useState('');
  const [copied, setCopied] = useState(false);
  const shareQuery = useQuery({
    queryKey: atlasKeys.share(documentId),
    queryFn: () => apiGet(`/documents/${documentId}/share`),
    enabled: open && Boolean(documentId),
    retry: false,
  });

  const share = shareQuery.data;
  const roster = share?.members || [];
  const canEditShare = Boolean(share?.canManage ?? share?.canEdit);
  // A per-document grant is honored for any access mode (it's the most specific authorization), so
  // inviting members works for restricted docs too — that's how you open one up to specific people.
  const canInviteMembers = canEditShare;
  const memberSearchQuery = useQuery({
    queryKey: atlasKeys.shareMemberSearch(documentId, emailInput.trim()),
    queryFn: () =>
      apiGet(
        `/documents/${documentId}/share/members?q=${encodeURIComponent(emailInput.trim())}&limit=8`,
      ),
    enabled: open && Boolean(documentId) && canEditShare,
    retry: false,
  });
  const availableMembers = memberSearchQuery.data || [];
  const directViewers = roster.filter((mem: Loose) => mem.role === 'viewer');
  const directEditors = roster.filter((mem: Loose) => mem.role === 'editor');
  const showPermissionNote = !shareQuery.isLoading && !canEditShare;
  const shareUnavailable = shareQuery.isError;
  const publicOn = Boolean(share?.public?.enabled);
  const url = share?.public?.url || publicShareUrl(share?.public?.token || '');
  const docTitle = documentTitle || '当前文档';

  // Members matching the search box that aren't already invited — the single
  // source for the autocomplete dropdown (replaces both the native <datalist>
  // and the separate dimmed "搜索结果" list that used to duplicate it).
  const suggestions = availableMembers.filter(
    (mem: Loose) => !roster.some((r: Loose) => r.id === mem.id) && mem.id !== currentUser?.id,
  );

  const invite = (m: Loose) => {
    if (!m) return;
    mutations.updateShare(documentId, { members: [{ memberId: m.id, role: 'viewer' }] });
    setEmailInput('');
    pushToast({ msg: '已邀请', meta: m.name });
  };

  const addMember = () => {
    if (!emailInput) return;
    const input = emailInput.trim().toLowerCase();
    const m =
      suggestions.find(
        (x: Loose) => x.email?.toLowerCase() === input || x.name === emailInput.trim(),
      ) || suggestions[0];
    invite(m);
  };

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; dismissable via the close button (click-outside is a mouse convenience)
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop; dismissable via the close button (click-outside is a mouse convenience)
    <div className="overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dialog surface only stops backdrop-dismiss propagation */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog surface only stops backdrop-dismiss propagation */}
      <div className="dialog" onClick={(e: Loose) => e.stopPropagation()}>
        <div className="dialog-head">
          <div>
            <div className="dialog-title">分享 · {docTitle}</div>
            <div className="dialog-sub">控制谁可以打开这篇文档。变更立即生效。</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <_I3.close />
          </button>
        </div>

        <div className="dialog-tabs" role="tablist">
          <div
            className={`tab ${tab === 'invite' ? 'active' : ''}`}
            {...clickableProps(() => setTab('invite'))}
            role="tab"
            tabIndex={0}
            aria-selected={tab === 'invite'}
          >
            邀请成员
          </div>
          <div
            className={`tab ${tab === 'public' ? 'active' : ''}`}
            {...clickableProps(() => setTab('public'))}
            role="tab"
            tabIndex={0}
            aria-selected={tab === 'public'}
          >
            公开链接
          </div>
        </div>

        <div className="dialog-body">
          {shareQuery.isLoading && (
            <div className="share-permission-note muted">正在读取分享权限与设置…</div>
          )}
          {showPermissionNote && (
            <div className="share-permission-note">
              <strong>{shareUnavailable ? '无法读取分享设置' : '没有分享管理权限'}</strong>
              <span>
                {shareUnavailable
                  ? '只有管理员和文档作者可以管理分享；文档也可能已被删除或不可用。'
                  : '只有管理员和文档作者可以邀请成员或修改公开链接。你仍然可以在阅读页复制当前文档地址。'}
              </span>
            </div>
          )}

          {tab === 'invite' && (
            <>
              <div className="share-invite-row">
                <div className="share-invite-field">
                  <input
                    className="input"
                    placeholder="按姓名或邮箱搜索…"
                    value={emailInput}
                    disabled={!canInviteMembers}
                    onChange={(e: Loose) => setEmailInput(e.target.value)}
                    onKeyDown={(e: Loose) => {
                      if (e.key === 'Enter') addMember();
                    }}
                  />
                  {canInviteMembers && emailInput.trim() && suggestions.length > 0 && (
                    <div className="share-suggest" role="listbox" aria-label="搜索结果">
                      {suggestions.map((m: Loose) => (
                        <button
                          key={m.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="share-suggest-row"
                          onClick={() => invite(m)}
                        >
                          <span className="avatar">{m.initials}</span>
                          <div>
                            <div className="name">{m.name}</div>
                            <div className="email mono">{m.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canInviteMembers || !emailInput.trim()}
                  onClick={addMember}
                >
                  邀请
                </button>
              </div>

              <div className="share-access-summary">
                <div>
                  <div className="summary-kicker">单独邀请</div>
                  <div className="summary-title">
                    {roster.length ? `${roster.length} 位成员` : '暂无成员'}
                  </div>
                </div>
                <div className="summary-counts">
                  <span>{directViewers.length} 位可读</span>
                  <span>{directEditors.length} 位可编辑</span>
                </div>
              </div>
              <div className="share-roster">
                <AnimatedScrollList className="rows-scroll">
                  {roster.length === 0 && (
                    <div className="share-row share-row-empty">
                      <div>
                        <div className="name">还没有单独邀请成员</div>
                        <div className="email">
                          拥有空间权限的成员仍可按空间规则阅读。需要给空间外成员开放时，在上方输入姓名或邮箱。
                        </div>
                      </div>
                    </div>
                  )}
                  {roster.map((mem: Loose) => {
                    return (
                      <div key={mem.id} className="share-row">
                        <span
                          className="avatar"
                          style={{ background: 'var(--parchment)', color: 'var(--ink-2)' }}
                        >
                          {mem.initials}
                        </span>
                        <div>
                          <div className="name">{mem.name}</div>
                          <div className="email mono">{mem.email}</div>
                        </div>
                        <Select
                          className="role-select"
                          ariaLabel={`${mem.name} 的权限`}
                          align="right"
                          value={mem.role}
                          disabled={!canEditShare}
                          options={SHARE_ROLE_OPTIONS}
                          onChange={(v: string) =>
                            mutations.updateShare(documentId, {
                              members: [{ memberId: mem.id, role: v || null }],
                            })
                          }
                        />
                      </div>
                    );
                  })}
                  <div className="share-row share-row-owner">
                    <span className="avatar" style={{ background: 'var(--blue)' }}>
                      {currentUser?.initials || 'G'}
                    </span>
                    <div>
                      <div className="name">{currentUser?.name || '访客'}</div>
                      <div className="email mono">{currentUser?.email || ''}</div>
                    </div>
                    <span className="share-badge">
                      {canEditShare ? '管理员/作者' : '无管理权限'}
                    </span>
                  </div>
                </AnimatedScrollList>
              </div>
            </>
          )}

          {tab === 'public' && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '4px 0 18px',
                  borderBottom: '1px solid var(--hairline-2)',
                  marginBottom: 18,
                }}
              >
                <button
                  type="button"
                  className={`toggle ${publicOn ? 'on' : ''}`}
                  role="switch"
                  aria-checked={publicOn}
                  aria-label="启用公开链接"
                  disabled={!canEditShare}
                  onClick={() => mutations.updateShare(documentId, { publicEnabled: !publicOn })}
                ></button>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.012em' }}>
                    启用公开链接
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
                    任何拥有链接的人都可阅读，无需登录。
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                链接
              </div>
              <div className="link-box">
                <span style={{ color: 'var(--ink-4)' }}>
                  <_I3.link />
                </span>
                <span className="url">{publicOn ? url : '— 当前未启用'}</span>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: '4px 12px', fontSize: 12 }}
                  disabled={!publicOn || !canEditShare}
                  onClick={() => {
                    navigator.clipboard?.writeText(url);
                    setCopied(true);
                    pushToast({ msg: '已复制', meta: url });
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  {copied ? <_I3.check /> : <_I3.link width="11" height="11" />}
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </div>

              <div
                style={{
                  marginTop: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  opacity: publicOn ? 1 : 0.45,
                  transition: 'opacity 0.2s',
                }}
              >
                <PublicToggle
                  label="显示作者署名"
                  desc="在公开页面的脚注与索引中显示创建者"
                  value={share?.public?.showAuthor ?? true}
                  disabled={!publicOn || !canEditShare}
                  onChange={(value: Loose) =>
                    mutations.updateShare(documentId, { showAuthor: value })
                  }
                />
                <PublicToggle
                  label="允许搜索引擎索引"
                  desc="让公开文档出现在搜索结果中"
                  value={share?.public?.allowIndexing ?? false}
                  disabled={!publicOn || !canEditShare}
                  onChange={(value: Loose) =>
                    mutations.updateShare(documentId, { allowIndexing: value })
                  }
                />
                <PublicToggle
                  label="30 天后自动失效"
                  desc="到期后链接自动停用，需手动重新启用"
                  value={Boolean(share?.public?.expiresAt)}
                  disabled={!publicOn || !canEditShare}
                  onChange={(value: Loose) => {
                    const expiresAt = value
                      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                      : null;
                    mutations.updateShare(documentId, { expiresAt });
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!publicOn || !canEditShare}
                    onClick={() =>
                      mutations.updateShare(documentId, { rotateToken: true, publicEnabled: true })
                    }
                  >
                    <_I3.refresh />
                    <span>重置链接</span>
                  </button>
                  <button
                    type="button"
                    className="btn ghost danger"
                    disabled={!publicOn || !canEditShare}
                    onClick={() => mutations.updateShare(documentId, { publicEnabled: false })}
                  >
                    <_I3.trash />
                    <span>撤销公开链接</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dialog-foot">
          <span className="dim" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
            {canEditShare ? `由 ${currentUser?.name || '当前用户'} 管理` : '仅管理员/作者可管理'}
          </span>
          <button type="button" className="btn primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

export { ShareDialog };

function PublicToggle({ label, desc, value, disabled, onChange }: Loose) {
  const on = Boolean(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        className={`toggle ${on ? 'on' : ''}`}
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!on)}
      ></button>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, letterSpacing: '-0.012em' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{desc}</div>
      </div>
    </div>
  );
}

function ToastWrap({ toasts }: Loose) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((t: Loose) => (
        <div key={t.id} className="toast">
          <span className="check">
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="m2 5 2 2 4-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
function buildFolderTree(folders: Loose[]) {
  const byParent = new Map<string, Loose[]>();
  for (const f of folders) {
    const key = f.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)?.push(f);
  }
  for (const arr of byParent.values())
    arr.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const out: Loose[] = [];
  const walk = (parentKey: string, depth: number) => {
    for (const f of byParent.get(parentKey) || []) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk('__root__', 0);
  return out;
}

function SpaceManagerDialog({
  open,
  editing,
  spaces = [],
  mutations,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Loose) {
  const isEditing = editing && editing !== 'new';
  const isCreating = editing === 'new';

  const [form, setForm] = useState({ name: '', accent: 'accent' });
  // Folder management state (edit mode only). `creatingUnder`: null = idle,
  // '__root__' = adding a top-level folder, otherwise the parent folder id.
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) setForm({ name: editing.name, accent: editing.accent });
    else if (isCreating) setForm({ name: '', accent: 'accent' });
    setCreatingUnder(null);
    setNewName('');
    setRenamingId(null);
    setMovingId(null);
  }, [editing, isEditing, isCreating]);

  // Read the live space from the query cache so the tree re-renders after a
  // folder mutation invalidates spaces (the `editing` prop is a stale snapshot).
  const liveSpace = isEditing ? spaces.find((s: Loose) => s.id === editing.id) || editing : null;
  const liveFolders: Loose[] = liveSpace?.folders || [];
  const liveDocs: Loose[] = liveSpace?.children || [];
  const folderTree = useMemo(() => buildFolderTree(liveFolders), [liveFolders]);

  // A folder plus all of its descendants — the move/delete blast radius.
  const subtreeIds = (rootId: string): Set<string> => {
    const childrenByParent = new Map<string, Loose[]>();
    for (const f of liveFolders) {
      if (!f.parentId) continue;
      if (!childrenByParent.has(f.parentId)) childrenByParent.set(f.parentId, []);
      childrenByParent.get(f.parentId)?.push(f);
    }
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) break;
      ids.add(cur);
      for (const c of childrenByParent.get(cur) || []) stack.push(c.id);
    }
    return ids;
  };
  const affectedDocCount = (ids: Set<string>) =>
    liveDocs.filter((d: Loose) => d.folderId && ids.has(d.folderId)).length;

  if (!open || !editing) return null;

  const submitNewFolder = () => {
    const name = newName.trim();
    if (!name || !creatingUnder) return;
    mutations.createFolder({
      spaceId: editing.id,
      name,
      parentId: creatingUnder === '__root__' ? null : creatingUnder,
    });
    setNewName('');
    setCreatingUnder(null);
  };

  const commitFolderRename = (id: string) => {
    const name = renameVal.trim();
    if (name) mutations.updateFolder(id, { name });
    setRenamingId(null);
  };

  const moveFolder = (id: string, target: string) => {
    mutations.updateFolder(id, { parentId: target === '__root__' ? null : target });
    setMovingId(null);
  };

  const confirmDeleteFolder = async (f: Loose) => {
    const ids = subtreeIds(f.id);
    const docs = affectedDocCount(ids);
    const subCount = ids.size - 1;
    const detail = [docs > 0 ? `${docs} 篇文章` : '', subCount > 0 ? `${subCount} 个子文件夹` : '']
      .filter(Boolean)
      .join('、');
    const msg = detail
      ? `其中的 ${detail} 将一并移至回收站，可在回收站恢复。`
      : '将移至回收站，可恢复。';
    const ok = await confirmDialog({
      title: detail ? `删除文件夹「${f.name}」？` : `删除空文件夹「${f.name}」？`,
      message: msg,
      confirmLabel: '移至回收站',
      danger: true,
    });
    if (ok) mutations.deleteFolder(f.id);
  };

  const submit = () => {
    if (!form.name.trim()) return;
    if (isCreating) onCreate(form);
    if (isEditing) onUpdate(editing.id, form);
    onClose();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; dismissable via the close button (click-outside is a mouse convenience)
    // biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop; dismissable via the close button (click-outside is a mouse convenience)
    <div className="overlay" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dialog surface only stops backdrop-dismiss propagation */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dialog surface only stops backdrop-dismiss propagation */}
      <div
        className="dialog"
        style={{ width: 'min(560px, 92vw)' }}
        onClick={(e: Loose) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <div className="dialog-title">
              {isCreating ? '新建空间' : `编辑空间 · ${editing.name}`}
            </div>
            <div className="dialog-sub">
              {isCreating && '新建一个空间，用来组织一组主题相关的文档。'}
              {isEditing && '修改名称与配色。所有文档会保留在原空间下。'}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <_I3.close />
          </button>
        </div>

        <div className="dialog-body">
          <div className="field">
            <label className="field-label" htmlFor="space-mgr-name">
              空间名称
            </label>
            <input
              id="space-mgr-name"
              className="input"
              placeholder="例如：工程、产品、设计…"
              value={form.name}
              onChange={(e: Loose) => setForm((f: Loose) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e: Loose) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <div className="field">
            <span className="field-label">配色</span>
            <div className="color-swatches" role="radiogroup" aria-label="配色">
              {SPACE_COLORS.map((c: Loose) => (
                // biome-ignore lint/a11y/useSemanticElements: color swatch is a visual radio; a native <input type="radio"> can't render the color fill
                <div
                  key={c.v}
                  className={`color-swatch ${form.accent === c.v ? 'active' : ''}`}
                  style={{ background: c.color }}
                  title={c.label}
                  role="radio"
                  aria-checked={form.accent === c.v}
                  aria-label={c.label}
                  tabIndex={0}
                  onClick={() => setForm((f: Loose) => ({ ...f, accent: c.v }))}
                  onKeyDown={(e: Loose) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setForm((f: Loose) => ({ ...f, accent: c.v }));
                    }
                  }}
                ></div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>
              当前 · {SPACE_COLORS.find((c: Loose) => c.v === form.accent)?.label}
            </div>
          </div>

          {/* preview */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: 'var(--pearl)',
              borderRadius: 'var(--r-md)',
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-sm)',
                background: SPACE_COLORS.find((c: Loose) => c.v === form.accent)?.color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                fontSize: 14,
              }}
            >
              {(form.name || '?').slice(0, 1)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{form.name || '未命名空间'}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>预览 · 显示在侧边栏与目录</div>
            </div>
          </div>

          {isEditing && (
            <div className="field" style={{ marginTop: 4 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="field-label" style={{ marginBottom: 0 }}>
                  文件夹
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => {
                    setCreatingUnder('__root__');
                    setNewName('');
                    setRenamingId(null);
                  }}
                >
                  <_I3.plus width="12" height="12" />
                  <span>新建文件夹</span>
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)', margin: '4px 0 8px' }}>
                组织该空间下的文章。可移动整个文件夹；删除会连同内部文章一并移至回收站，可随时恢复。
              </div>

              <div className="folder-mgr">
                {folderTree.length === 0 && creatingUnder !== '__root__' && (
                  <div className="folder-mgr-empty">还没有文件夹，文章将直接挂在空间根目录。</div>
                )}
                {folderTree.map((f: Loose) => (
                  <div key={f.id}>
                    <div className="folder-mgr-row" style={{ paddingLeft: 8 + f.depth * 18 }}>
                      <_I3.folder width="14" height="14" />
                      {renamingId === f.id ? (
                        <input
                          className="input"
                          ref={(el: Loose) => el?.focus()}
                          value={renameVal}
                          onChange={(e: Loose) => setRenameVal(e.target.value)}
                          onBlur={() => commitFolderRename(f.id)}
                          onKeyDown={(e: Loose) => {
                            if (e.key === 'Enter') commitFolderRename(f.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{ padding: '2px 8px', fontSize: 13, flex: 1 }}
                        />
                      ) : (
                        <span className="folder-mgr-name">{f.name}</span>
                      )}
                      <div className="folder-mgr-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="新建子文件夹"
                          onClick={() => {
                            setCreatingUnder(f.id);
                            setNewName('');
                            setRenamingId(null);
                          }}
                        >
                          <_I3.plus width="13" height="13" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="重命名"
                          onClick={() => {
                            setRenamingId(f.id);
                            setRenameVal(f.name);
                            setCreatingUnder(null);
                            setMovingId(null);
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="13"
                            height="13"
                            viewBox="0 0 14 14"
                            fill="none"
                          >
                            <path
                              d="M2 12h10M3.5 8.5h2l5-5-2-2-5 5z"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="移动到…"
                          onClick={() => {
                            setMovingId((cur: string | null) => (cur === f.id ? null : f.id));
                            setRenamingId(null);
                            setCreatingUnder(null);
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="13"
                            height="13"
                            viewBox="0 0 14 14"
                            fill="none"
                          >
                            <path
                              d="M1.5 4V11h11V5H7L5.5 3H1.5z"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M5.5 8h4m0 0L8 6.5M9.5 8 8 9.5"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="删除"
                          onClick={() => confirmDeleteFolder(f)}
                        >
                          <_I3.trash width="13" height="13" />
                        </button>
                      </div>
                    </div>
                    {movingId === f.id && (
                      <div
                        className="folder-mgr-row folder-mgr-new"
                        style={{ paddingLeft: 8 + (f.depth + 1) * 18 }}
                      >
                        <span style={{ fontSize: 12, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                          移动到
                        </span>
                        <Select
                          className="input"
                          ariaLabel="移动到目标目录"
                          placeholder="选择目标目录…"
                          value=""
                          options={[
                            { value: '__root__', label: '空间根目录' },
                            ...folderTree
                              .filter((t: Loose) => !subtreeIds(f.id).has(t.id))
                              .map((t: Loose) => ({
                                value: t.id,
                                label: `${'　'.repeat(t.depth)}${t.name}`,
                              })),
                          ]}
                          onChange={(v: string) => {
                            if (v) moveFolder(f.id, v);
                          }}
                        />
                      </div>
                    )}
                    {creatingUnder === f.id && (
                      <div
                        className="folder-mgr-row folder-mgr-new"
                        style={{ paddingLeft: 8 + (f.depth + 1) * 18 }}
                      >
                        <_I3.folder width="14" height="14" />
                        <input
                          className="input"
                          ref={(el: Loose) => el?.focus()}
                          placeholder="子文件夹名称…"
                          value={newName}
                          onChange={(e: Loose) => setNewName(e.target.value)}
                          onBlur={submitNewFolder}
                          onKeyDown={(e: Loose) => {
                            if (e.key === 'Enter') submitNewFolder();
                            if (e.key === 'Escape') setCreatingUnder(null);
                          }}
                          style={{ padding: '2px 8px', fontSize: 13, flex: 1 }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {creatingUnder === '__root__' && (
                  <div className="folder-mgr-row folder-mgr-new" style={{ paddingLeft: 8 }}>
                    <_I3.folder width="14" height="14" />
                    <input
                      className="input"
                      ref={(el: Loose) => el?.focus()}
                      placeholder="文件夹名称…"
                      value={newName}
                      onChange={(e: Loose) => setNewName(e.target.value)}
                      onBlur={submitNewFolder}
                      onKeyDown={(e: Loose) => {
                        if (e.key === 'Enter') submitNewFolder();
                        if (e.key === 'Escape') setCreatingUnder(null);
                      }}
                      style={{ padding: '2px 8px', fontSize: 13, flex: 1 }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="dialog-foot">
          {isEditing ? (
            <button
              type="button"
              className="btn danger ghost"
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `删除空间「${editing.name}」？`,
                  message: '空间需先清空其下文档才能删除。',
                  confirmLabel: '删除空间',
                  danger: true,
                });
                if (ok) {
                  onDelete(editing.id);
                  onClose();
                }
              }}
            >
              删除空间
            </button>
          ) : (
            <span></span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!form.name.trim()}
              onClick={submit}
            >
              {isCreating ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { SpaceManagerDialog };
