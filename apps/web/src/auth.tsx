// @ts-nocheck — auth UI migrated from the JSX prototype and wired to the API.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiJson } from './api-client';

const DEMO_PASSWORD = 'atlas-demo-password';

const DEMO_LOGIN_ACCOUNTS = [
  {
    id: 'u1',
    email: 'lin@atlas.team',
    name: '林知远',
    initials: 'LZ',
    role: 'admin',
    joined: '2024-02',
    tint: 'var(--blue)',
  },
  {
    id: 'u2',
    email: 'chen@atlas.team',
    name: '陈夏',
    initials: 'CX',
    role: 'editor',
    joined: '2024-03',
    tint: '#ff9500',
  },
  {
    id: 'u5',
    email: 'he@atlas.team',
    name: '何远',
    initials: 'HE',
    role: 'viewer',
    joined: '2025-01',
    tint: '#34c759',
  },
];

const ROLE_LABEL = { admin: '管理员', editor: '编辑', viewer: '仅读者' };

function authErrorMessage(message) {
  if (!message) return '登录失败，请稍后再试。';
  if (message.includes('no password configured')) {
    return '这个账号还没有配置密码登录。请先更新本地 seed 数据，或换一个已配置密码的账号。';
  }
  if (message.includes('Email or password') || message.includes('password is incorrect')) {
    return '邮箱或密码不正确。';
  }
  if (message.includes('Password is required')) return '请输入密码。';
  if (message.includes('No member exists')) return '找不到这个邮箱。';
  return message;
}

function tintForUser(user) {
  if (!user) return 'var(--blue)';
  if (user.id === 'u2') return '#ff9500';
  if (user.id === 'u5') return '#34c759';
  if (user.role === 'admin') return 'var(--blue)';
  if (user.role === 'editor') return '#ff9500';
  return '#34c759';
}

function presentUser(user) {
  return user ? { ...user, tint: user.tint || tintForUser(user) } : null;
}

export function isDemoSession(session) {
  return Boolean(session?.demo);
}

export function canRead(doc, user) {
  if (!doc) return true;
  if (typeof doc.canRead === 'boolean') return doc.canRead;
  if (doc.locked) return false;
  if (doc.visibility === 'public') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (doc.author === user.id) return true;
  return doc.visibility === 'invite';
}

export function firstPublicDoc(spaces = []) {
  for (const space of spaces) {
    const doc = (space.children || []).find((candidate) => candidate.visibility === 'public');
    if (doc) return { spaceId: space.id, docId: doc.id };
  }
  const firstSpace = spaces[0];
  const firstDoc = firstSpace?.children?.[0];
  return firstDoc ? { spaceId: firstSpace.id, docId: firstDoc.id } : { spaceId: 's1', docId: 'd4' };
}

export function useAuth({ currentUser, session }) {
  const queryClient = useQueryClient();
  const derivedUser = useMemo(
    () => (isDemoSession(session) ? null : presentUser(currentUser)),
    [currentUser, session],
  );
  const [overrideUser, setOverrideUser] = useState(undefined);

  useEffect(() => {
    setOverrideUser(undefined);
  }, [currentUser?.id, session?.id, session?.demo]);

  const refreshAuthQueries = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const login = useCallback(
    async (email, password) => {
      try {
        const data = await apiJson('/auth/login', 'POST', { email, password });
        const nextUser = presentUser(data?.user);
        setOverrideUser(nextUser);
        await refreshAuthQueries();
        return { ok: true, user: nextUser };
      } catch (error) {
        return { ok: false, msg: authErrorMessage(error?.message) };
      }
    },
    [refreshAuthQueries],
  );

  const logout = useCallback(async () => {
    setOverrideUser(null);
    try {
      await apiJson('/auth/logout', 'POST');
    } finally {
      await refreshAuthQueries();
    }
  }, [refreshAuthQueries]);

  const switchTo = useCallback(
    async (id) => {
      const account = DEMO_LOGIN_ACCOUNTS.find((candidate) => candidate.id === id);
      if (!account) return { ok: false, msg: '找不到这个账号。' };
      return login(account.email, DEMO_PASSWORD);
    },
    [login],
  );

  const user = overrideUser !== undefined ? overrideUser : derivedUser;
  return {
    user,
    isGuest: !user,
    isDemo: isDemoSession(session),
    login,
    logout,
    switchTo,
  };
}

function UserGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.8 13.5c0.6-2.6 2.7-4.1 5.2-4.1s4.6 1.5 5.2 4.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M6 2.5H4A1.5 1.5 0 0 0 2.5 4v6A1.5 1.5 0 0 0 4 11.5h2M8.5 4 11.5 7l-3 3M5 7h6.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 6v3.6M7 4.5v0.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SwitchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M3 5h7l-1.6-1.6M11 9H4l1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function UserAvatar({ user, className = '', size }) {
  return (
    <span
      className={className}
      style={{
        background: user?.tint || tintForUser(user),
        ...(size ? { width: size, height: size } : null),
      }}
    >
      {user?.initials}
    </span>
  );
}

export function UserMenu({ user, onLogin, onLogout, onSwitch }) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState('main');
  const [switchingId, setSwitchingId] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
        setPane('main');
      }
    };
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPane('main');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setPane('main');
  };

  const switchAccount = async (account) => {
    if (account.id === user?.id || switchingId) return;
    setSwitchingId(account.id);
    const result = await onSwitch?.(account.id);
    setSwitchingId(null);
    if (result?.ok !== false) close();
  };

  return (
    <div
      className={'user-menu-wrap ' + (open ? 'open ' : '') + (user ? 'is-member' : 'is-guest')}
      ref={wrapRef}
    >
      {user ? (
        <button
          className="user-menu-trigger"
          style={{ background: user.tint || tintForUser(user) }}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
            setPane('main');
          }}
          title={user.name}
          aria-label="打开账号菜单"
        >
          {user.initials}
        </button>
      ) : (
        <button
          className="user-menu-trigger guest"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
            setPane('main');
          }}
          title="游客, 点击登录"
          aria-label="打开登录菜单"
        >
          <UserGlyph />
        </button>
      )}

      {open && (
        <div className="user-menu-pop" onClick={(event) => event.stopPropagation()}>
          {!user && (
            <div className="um-pane um-pane-guest">
              <div className="um-guest-head">
                <div className="um-guest-glyph">
                  <UserGlyph />
                </div>
                <div className="um-guest-text">
                  <div className="um-name">游客身份</div>
                  <div className="um-sub">只能阅读公开的文章</div>
                </div>
              </div>
              <button
                className="um-cta"
                onClick={() => {
                  close();
                  onLogin?.();
                }}
              >
                登录账号
                <span className="um-cta-arrow">→</span>
              </button>
              <div className="um-hint">
                登录后可以访问<span className="um-hint-em">空间内邀请制文章</span>
                ，并使用上传与设置功能。
              </div>
            </div>
          )}

          {user && pane === 'main' && (
            <div className="um-pane">
              <div className="um-head">
                <UserAvatar user={user} className="um-head-avatar" />
                <div className="um-head-meta">
                  <div className="um-name">{user.name}</div>
                  <div className="um-sub">{user.email}</div>
                </div>
                <span className={'um-role role-' + user.role}>
                  {ROLE_LABEL[user.role] || user.role}
                </span>
              </div>
              <div className="um-sep" />
              <button className="um-item" onClick={() => setPane('info')}>
                <span className="um-item-glyph">
                  <InfoGlyph />
                </span>
                <span>查看信息</span>
                <span className="um-chev">›</span>
              </button>
              <button className="um-item" onClick={() => setPane('switch')}>
                <span className="um-item-glyph">
                  <SwitchGlyph />
                </span>
                <span>切换账号</span>
                <span className="um-chev">›</span>
              </button>
              <div className="um-sep" />
              <button
                className="um-item um-item-danger"
                onClick={() => {
                  close();
                  onLogout?.();
                }}
              >
                <span className="um-item-glyph">
                  <LogoutGlyph />
                </span>
                <span>退出登录</span>
              </button>
            </div>
          )}

          {user && pane === 'info' && (
            <div className="um-pane">
              <div className="um-pane-head">
                <button className="um-back" onClick={() => setPane('main')} aria-label="返回">
                  ‹
                </button>
                <span className="um-pane-title">账号信息</span>
              </div>
              <div className="um-info-block">
                <UserAvatar user={user} className="um-info-avatar" />
                <div className="um-info-name">{user.name}</div>
                <span className={'um-role role-' + user.role}>
                  {ROLE_LABEL[user.role] || user.role}
                </span>
              </div>
              <dl className="um-info-grid">
                <dt>邮箱</dt>
                <dd className="mono">{user.email}</dd>
                <dt>加入</dt>
                <dd className="mono">{user.joined || '未记录'}</dd>
                <dt>账号 ID</dt>
                <dd className="mono">{user.id}</dd>
                <dt>权限</dt>
                <dd>{ROLE_LABEL[user.role] || user.role}</dd>
              </dl>
              <div className="um-sep" />
              <button
                className="um-item um-item-danger"
                onClick={() => {
                  close();
                  onLogout?.();
                }}
              >
                <span className="um-item-glyph">
                  <LogoutGlyph />
                </span>
                <span>退出登录</span>
              </button>
            </div>
          )}

          {user && pane === 'switch' && (
            <div className="um-pane">
              <div className="um-pane-head">
                <button className="um-back" onClick={() => setPane('main')} aria-label="返回">
                  ‹
                </button>
                <span className="um-pane-title">切换账号</span>
              </div>
              <div className="um-switch-list">
                {DEMO_LOGIN_ACCOUNTS.map((account) => {
                  const active = account.id === user.id;
                  return (
                    <button
                      key={account.id}
                      className={'um-switch-row ' + (active ? 'active' : '')}
                      onClick={() => switchAccount(account)}
                      disabled={active || switchingId === account.id}
                    >
                      <span className="um-switch-avatar" style={{ background: account.tint }}>
                        {account.initials}
                      </span>
                      <span className="um-switch-meta">
                        <span className="um-switch-name">{account.name}</span>
                        <span className="um-switch-email">{account.email}</span>
                      </span>
                      <span className={'um-role role-' + account.role}>
                        {ROLE_LABEL[account.role]}
                      </span>
                      {active && <span className="um-switch-check">✓</span>}
                    </button>
                  );
                })}
              </div>
              <div className="um-sep" />
              <button
                className="um-item"
                onClick={() => {
                  close();
                  onLogin?.();
                }}
              >
                <span className="um-item-glyph">
                  <PlusGlyph />
                </span>
                <span>用其他邮箱登录</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LoginView({ onLogin, onContinueAsGuest, returnTo }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const submit = async (event) => {
    event?.preventDefault?.();
    setError('');
    const nextEmail = email.trim();
    if (!nextEmail) {
      setError('请输入邮箱。');
      return;
    }
    if (!password) {
      setError('请输入密码。');
      return;
    }
    if (password.length < 8) {
      setError('密码至少 8 位。');
      return;
    }
    setLoading(true);
    const result = await onLogin(nextEmail, password);
    if (!result?.ok) {
      setError(result?.msg || '邮箱或密码不正确。');
      setLoading(false);
    }
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError('');
    setTimeout(() => emailRef.current?.form?.requestSubmit?.(), 60);
  };

  return (
    <div className="login-screen" data-screen-label="00 Login">
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg-blob b1" />
        <div className="login-bg-blob b2" />
        <div className="login-bg-grain" />
      </div>

      <div className="login-stage">
        <div className="login-brand">
          <div className="login-brand-mark">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <rect
                x="6"
                y="6"
                width="32"
                height="32"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M14 28 L22 12 L30 28"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M17.5 22 L26.5 22"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="login-brand-name">Atlas</div>
          <div className="login-brand-tag">空间 · 文档 · 阅读</div>

          <blockquote className="login-epigraph">
            <p>「我们把每一篇文档当作一封写给未来读者的信。」</p>
            <footer>Atlas 设计原则 §1</footer>
          </blockquote>

          <div className="login-brand-foot">
            <span className="login-foot-line" />
            <span className="mono dim" style={{ fontSize: 11, letterSpacing: '0.08em' }}>
              ATLAS
            </span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-inner">
            <div className="login-eyebrow mono">登录</div>
            <h1 className="login-title">欢迎回到 Atlas</h1>
            <p className="login-sub">
              输入团队邮箱与密码继续。第一次来？点击下方游客身份直接阅读公开文档。
            </p>

            <form className="login-form" onSubmit={submit}>
              <label className="login-field">
                <span className="login-label">邮箱</span>
                <input
                  ref={emailRef}
                  type="email"
                  className="login-input"
                  placeholder="name@atlas.team"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="login-field">
                <span className="login-label">
                  密码
                  <a className="login-forgot" onClick={(event) => event.preventDefault()} href="#">
                    忘记密码？
                  </a>
                </span>
                <input
                  type="password"
                  className="login-input"
                  placeholder="至少 8 位"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {error && <div className="login-error">{error}</div>}

              <button
                className={'login-submit ' + (loading ? 'loading' : '')}
                type="submit"
                disabled={loading}
              >
                {loading ? <span className="login-spinner" /> : null}
                <span>{loading ? '正在登录…' : '登录'}</span>
              </button>

              <div className="login-guest-row">
                <button type="button" className="login-guest-link" onClick={onContinueAsGuest}>
                  以游客身份继续阅读公开文档 →
                </button>
              </div>
            </form>

            <div className="login-divider">
              <span className="login-divider-line" />
              <span className="login-divider-text mono">DEMO 账号</span>
              <span className="login-divider-line" />
            </div>

            <div className="login-demo-list">
              {DEMO_LOGIN_ACCOUNTS.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className="login-demo-card"
                  onClick={() => fillDemo(account)}
                  title={'点击以 ' + account.name + ' 身份登录'}
                >
                  <span className="login-demo-avatar" style={{ background: account.tint }}>
                    {account.initials}
                  </span>
                  <span className="login-demo-meta">
                    <span className="login-demo-name">{account.name}</span>
                    <span className="login-demo-email mono">{account.email}</span>
                  </span>
                  <span className={'um-role role-' + account.role}>{ROLE_LABEL[account.role]}</span>
                </button>
              ))}
              {returnTo && <div className="login-return-hint">登录后回到刚才的页面</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEMO_LOGIN_ACCOUNTS, ROLE_LABEL };
