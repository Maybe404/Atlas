import { useEffect, useState } from 'react';
import { AnimatedScrollList, I } from '../chrome';
import type { Loose } from '../loose-types';
import { confirmDialog, EmptyState, Select } from '../ui-kit';
import { SPACE_COLOR_MAP } from './shared';

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'member', label: '成员' },
];

const _I2 = I;

export function MembersPane({
  spaces,
  members = [],
  perms,
  currentUser,
  setMemberSpaceRole,
  pushToast,
  mutations,
}: Loose) {
  const [editingMember, setEditingMember] = useState<Loose>(null); // member id whose space-access menu is open
  const [menuOpenId, setMenuOpenId] = useState<Loose>(null);
  const [passwordMember, setPasswordMember] = useState<Loose>(null);
  const [showNewMember, setShowNewMember] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', password: '', role: 'member' });
  const [passwordDraft, setPasswordDraft] = useState('');
  const avatarColors = [
    'var(--blue)',
    '#ff9500',
    '#34c759',
    '#af52de',
    '#ff2d55',
    '#5856d6',
    '#ff6482',
    '#30b0c7',
  ];

  useEffect(() => {
    if (!editingMember) return;
    const onDocClick = (e: Loose) => {
      if (e.target.closest('.access-pop') || e.target.closest('[data-access-trigger]')) return;
      setEditingMember(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [editingMember]);

  useEffect(() => {
    if (!menuOpenId) return;
    const onDocClick = (e: Loose) => {
      if (e.target.closest('.row-menu') || e.target.closest('[data-member-more]')) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  const submitNewMember = (e: Loose) => {
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
        setNewMember({ name: '', email: '', password: '', role: 'member' });
        setShowNewMember(false);
      },
      onError: (error: Loose) => pushToast?.({ msg: '新增成员失败', meta: error?.message }),
    });
  };

  const savePassword = (member: Loose) => {
    if (passwordDraft.length < 8) {
      pushToast?.({ msg: '密码至少 8 位', meta: member.name });
      return;
    }
    mutations.updateMember(
      member.id,
      { password: passwordDraft },
      {
        onSuccess: () => {
          setPasswordMember(null);
          setPasswordDraft('');
        },
        onError: (error: Loose) => pushToast?.({ msg: '密码更新失败', meta: error?.message }),
      },
    );
  };

  const deleteMember = async (member: Loose) => {
    if (member.id === currentUser?.id) {
      pushToast?.({ msg: '不能删除当前登录成员' });
      return;
    }
    const ok = await confirmDialog({
      title: `删除成员「${member.name}」？`,
      message: '该成员的文档会转交给当前管理员，此操作不可撤销。',
      confirmLabel: '删除成员',
      danger: true,
    });
    if (!ok) return;
    mutations.deleteMember(member.id, {
      onSuccess: () => {
        if (passwordMember === member.id) {
          setPasswordMember(null);
          setPasswordDraft('');
        }
        setMenuOpenId(null);
      },
      onError: (error: Loose) => pushToast?.({ msg: '删除成员失败', meta: error?.message }),
    });
  };

  return (
    <>
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          工作区 · 成员
        </div>
        <h1>成员</h1>
        <p className="pane-sub">
          {members.length} 位成员协作于 {spaces.length}{' '}
          个空间。每位成员可同时拥有多个空间的访问权限；点击右侧的「空间访问」可逐项调整。
        </p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>团队成员</h3>
            <div className="sub">所有成员对此列表可见</div>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowNewMember((v: Loose) => !v)}
          >
            <_I2.plus />
            <span>新增成员</span>
          </button>
        </div>
        {showNewMember && (
          <form className="member-create-row" onSubmit={submitNewMember}>
            <div className="field compact">
              <label className="field-label" htmlFor="nm-name">
                姓名
              </label>
              <input
                id="nm-name"
                className="input"
                value={newMember.name}
                onChange={(e: Loose) =>
                  setNewMember((m: Loose) => ({ ...m, name: e.target.value }))
                }
                placeholder="成员姓名"
              />
            </div>
            <div className="field compact">
              <label className="field-label" htmlFor="nm-email">
                邮箱
              </label>
              <input
                id="nm-email"
                className="input"
                type="email"
                value={newMember.email}
                onChange={(e: Loose) =>
                  setNewMember((m: Loose) => ({ ...m, email: e.target.value }))
                }
                placeholder="name@atlas.team"
              />
            </div>
            <div className="field compact">
              <label className="field-label" htmlFor="nm-password">
                初始密码
              </label>
              <input
                id="nm-password"
                className="input"
                type="password"
                value={newMember.password}
                onChange={(e: Loose) =>
                  setNewMember((m: Loose) => ({ ...m, password: e.target.value }))
                }
                placeholder="至少 8 位"
                autoComplete="new-password"
              />
            </div>
            <div className="field compact">
              <span className="field-label">角色</span>
              <Select
                className="input"
                ariaLabel="新成员角色"
                value={newMember.role}
                options={ROLE_OPTIONS}
                onChange={(v: string) => setNewMember((m: Loose) => ({ ...m, role: v }))}
              />
            </div>
            <div className="member-create-actions">
              <button type="button" className="btn ghost" onClick={() => setShowNewMember(false)}>
                取消
              </button>
              <button type="submit" className="btn primary">
                保存
              </button>
            </div>
          </form>
        )}
        <div className="card-body card-body-scroll">
          {members.length === 0 ? (
            <EmptyState
              glyph={
                <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <circle cx="22" cy="20" r="6" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M10 44c1.5-6 6-10 12-10s10.5 4 12 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="40" cy="18" r="5" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M36 32c1-4 4-6 8-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              }
              title="还没有成员"
              desc="点击右上角「新增成员」邀请第一位协作者加入工作区。"
            />
          ) : (
            <AnimatedScrollList className="rows-scroll">
              {members.map((m: Loose, i: Loose) => {
                const memberPerms = perms[m.id] || {};
                const accessSpaces = spaces.filter((s: Loose) => memberPerms[s.id]);
                return (
                  <div key={m.id} className="member-row-wrap">
                    <div className="member-row member-row-grid">
                      <span
                        className="avatar"
                        style={{ background: avatarColors[i % avatarColors.length] }}
                      >
                        {m.initials}
                      </span>
                      <div className="member-meta">
                        <div className="name">{m.name}</div>
                        <div className="email mono">{m.email}</div>
                      </div>
                      <Select
                        ariaLabel={`${m.name} 的工作区角色`}
                        value={m.role}
                        options={ROLE_OPTIONS}
                        onChange={(v: string) => mutations.updateMember(m.id, { role: v })}
                      />
                      <div className="access-cell" style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className="access-trigger"
                          data-access-trigger
                          onClick={() => setEditingMember(editingMember === m.id ? null : m.id)}
                          title="编辑空间访问"
                        >
                          {accessSpaces.length === 0 && (
                            <span className="access-empty">未分配空间</span>
                          )}
                          {accessSpaces.slice(0, 3).map((s: Loose) => (
                            <span key={s.id} className="access-pill">
                              <span
                                className="dot"
                                style={{ background: SPACE_COLOR_MAP[s.accent] }}
                              ></span>
                              <span>{s.name}</span>
                              <span className="role">
                                {memberPerms[s.id] === 'editor' ? '编' : '读'}
                              </span>
                            </span>
                          ))}
                          {accessSpaces.length > 3 && (
                            <span className="access-pill more">+{accessSpaces.length - 3}</span>
                          )}
                          <svg
                            aria-hidden="true"
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            style={{ marginLeft: 2, color: 'var(--ink-4)' }}
                          >
                            <path
                              d="M2 3.5 5 7 8 3.5"
                              stroke="currentColor"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {editingMember === m.id && (
                          // biome-ignore lint/a11y/noStaticElementInteractions: popover only stops outside-dismiss propagation; its rows are the real controls
                          <div
                            className="access-pop"
                            onMouseDown={(e: Loose) => e.stopPropagation()}
                          >
                            <div className="access-pop-head">
                              <span>{m.name} · 空间访问</span>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setEditingMember(null)}
                              >
                                <_I2.close />
                              </button>
                            </div>
                            <div className="access-pop-body">
                              {spaces.map((s: Loose) => {
                                const role = memberPerms[s.id] || null;
                                return (
                                  <div key={s.id} className="access-pop-row">
                                    <span
                                      className="sm-mark"
                                      style={{
                                        background: SPACE_COLOR_MAP[s.accent],
                                        width: 22,
                                        height: 22,
                                        borderRadius: 6,
                                        fontSize: 11,
                                      }}
                                    >
                                      {s.mark || s.name.slice(0, 1)}
                                    </span>
                                    <span className="access-pop-name">{s.name}</span>
                                    <div className="segmented access-seg">
                                      <button
                                        type="button"
                                        className={role === null ? 'active' : ''}
                                        onClick={() => setMemberSpaceRole(m.id, s.id, null)}
                                      >
                                        无
                                      </button>
                                      <button
                                        type="button"
                                        className={role === 'viewer' ? 'active' : ''}
                                        onClick={() => setMemberSpaceRole(m.id, s.id, 'viewer')}
                                      >
                                        仅读
                                      </button>
                                      <button
                                        type="button"
                                        className={role === 'editor' ? 'active' : ''}
                                        onClick={() => setMemberSpaceRole(m.id, s.id, 'editor')}
                                      >
                                        编辑
                                      </button>
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
                          type="button"
                          className="icon-btn"
                          data-member-more
                          title="成员操作"
                          onClick={(e: Loose) => {
                            e.stopPropagation();
                            setMenuOpenId(menuOpenId === m.id ? null : m.id);
                          }}
                        >
                          <_I2.more />
                        </button>
                        {menuOpenId === m.id && (
                          // biome-ignore lint/a11y/noStaticElementInteractions: menu wrapper only stops row-click propagation; its items are the real controls
                          // biome-ignore lint/a11y/useKeyWithClickEvents: menu wrapper only stops row-click propagation; its items are the real controls
                          <div
                            className="row-menu member-row-menu"
                            onClick={(e: Loose) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="row-menu-item"
                              onClick={() => {
                                setPasswordMember(m.id);
                                setPasswordDraft('');
                                setMenuOpenId(null);
                              }}
                            >
                              <_I2.lock />
                              <span>编辑密码</span>
                            </button>
                            <div className="row-menu-sep"></div>
                            <button
                              type="button"
                              className="row-menu-item danger"
                              onClick={() => deleteMember(m)}
                            >
                              <_I2.trash />
                              <span>删除成员</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {passwordMember === m.id && (
                      <div className="member-password-row">
                        <div>
                          <div className="member-password-title">编辑 {m.name} 的登录密码</div>
                          <div className="member-password-sub">
                            保存后该成员下次登录需使用新密码。
                          </div>
                        </div>
                        <input
                          className="input"
                          type="password"
                          value={passwordDraft}
                          onChange={(e: Loose) => setPasswordDraft(e.target.value)}
                          onKeyDown={(e: Loose) => {
                            if (e.key === 'Enter') savePassword(m);
                            if (e.key === 'Escape') {
                              setPasswordMember(null);
                              setPasswordDraft('');
                            }
                          }}
                          placeholder="输入新密码"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setPasswordMember(null);
                            setPasswordDraft('');
                          }}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => savePassword(m)}
                        >
                          保存密码
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </AnimatedScrollList>
          )}
        </div>
      </div>
    </>
  );
}
