import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api-client';
import { AnimatedScrollList } from '../chrome';
import { atlasKeys } from '../data-hooks';
import type { Loose } from '../loose-types';
import { Skeleton } from '../ui-kit';
import { SPACE_COLOR_MAP } from './shared';

const VIEW_KEY = 'atlas:perms-view';
// Cell click cycles through the three access levels.
const NEXT_ROLE: Loose = { none: 'viewer', viewer: 'editor', editor: null };

export function PermissionsPane({
  spaces,
  members = [],
  perms,
  setMemberSpaceRole,
  setMemberSpaceRoles,
  pushToast,
}: Loose) {
  const [activeSpace, setActiveSpace] = useState(spaces[0]?.id || '');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [viewMode, setViewMode] = useState<string>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'dual';
    } catch {
      return 'dual';
    }
  });
  useEffect(() => {
    if (!spaces.length) return;
    if (!spaces.some((s: Loose) => s.id === activeSpace)) {
      setActiveSpace(spaces[0].id);
    }
  }, [activeSpace, spaces]);

  const setView = (v: string) => {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const space = spaces.find((s: Loose) => s.id === activeSpace) || spaces[0];
  const spaceMembersQuery = useQuery({
    queryKey: space?.id ? atlasKeys.spaceMembers(space.id) : ['space-members', 'empty'],
    queryFn: () => apiGet(`/spaces/${space.id}/members`),
    enabled: Boolean(space?.id) && viewMode === 'dual',
  });

  const assignedMembers = spaceMembersQuery.data || [];
  const assignedIds = useMemo(
    () => new Set(assignedMembers.map((m: Loose) => m.id)),
    [assignedMembers],
  );
  const unassignedMembers = useMemo(
    () => members.filter((member: Loose) => !assignedIds.has(member.id)),
    [assignedIds, members],
  );
  const activeCount = assignedMembers.length;

  const countFor = (spaceId: string) =>
    Object.values(perms).filter((p: Loose) => p?.[spaceId]).length;

  if (!space)
    return (
      <div className="pane-head">
        <h1>空间权限</h1>
        <p className="pane-sub">尚未创建任何空间。</p>
      </div>
    );

  const spaceColor = SPACE_COLOR_MAP[space.accent] || SPACE_COLOR_MAP.accent;

  const setAll = (role: Loose) => {
    const targets = assignedMembers;
    if (!targets.length) {
      pushToast?.({ msg: role ? '没有可更新的成员' : '当前空间已清空', meta: space.name });
      return;
    }
    setMemberSpaceRoles?.(
      space.id,
      targets.map((m: Loose) => ({ memberId: m.id, role })),
      { silent: true },
    );
    pushToast?.({
      msg: role ? '已批量更新空间权限' : '已清空空间权限',
      meta: `${space.name} · ${targets.length} 位成员`,
    });
  };

  const setSpaceWithMotion = (spaceId: Loose) => {
    setActiveSpace(spaceId);
    setShowUnassigned(false);
  };

  return (
    <>
      <div className="pane-head pane-head-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
            工作区 · 空间权限
          </div>
          <h1>空间权限</h1>
          <p className="pane-sub">
            为每个空间分别指定成员的角色——编辑可创建与修改文档，仅读只能查看。一位成员可以同时拥有多个空间的访问权限。
          </p>
        </div>
        <div className="segmented view-toggle perm-view-toggle">
          <button
            type="button"
            className={viewMode === 'dual' ? 'active' : ''}
            onClick={() => setView('dual')}
            title="双栏视图"
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
            <span>双栏</span>
          </button>
          <button
            type="button"
            className={viewMode === 'matrix' ? 'active' : ''}
            onClick={() => setView('matrix')}
            title="矩阵视图"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="3.4" height="3.4" rx="0.8" fill="currentColor" />
              <rect
                x="5.3"
                y="1"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="9.6"
                y="1"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="1"
                y="5.3"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect x="5.3" y="5.3" width="3.4" height="3.4" rx="0.8" fill="currentColor" />
              <rect
                x="9.6"
                y="5.3"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="1"
                y="9.6"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect
                x="5.3"
                y="9.6"
                width="3.4"
                height="3.4"
                rx="0.8"
                fill="currentColor"
                opacity="0.6"
              />
              <rect x="9.6" y="9.6" width="3.4" height="3.4" rx="0.8" fill="currentColor" />
            </svg>
            <span>矩阵</span>
          </button>
        </div>
      </div>

      {viewMode === 'matrix' ? (
        <PermissionMatrix
          spaces={spaces}
          members={members}
          perms={perms}
          setMemberSpaceRole={setMemberSpaceRole}
        />
      ) : (
        <div className="perm-dual">
          <div className="perm-spaces-rail">
            <div className="perm-rail-label">
              空间 · <span className="mono">{spaces.length}</span>
            </div>
            {spaces.map((s: Loose) => (
              <button
                type="button"
                key={s.id}
                className={`perm-space-item ${activeSpace === s.id ? 'active' : ''}`}
                onClick={() => setSpaceWithMotion(s.id)}
              >
                <span
                  className="sm-mark"
                  style={{ background: SPACE_COLOR_MAP[s.accent] || SPACE_COLOR_MAP.accent }}
                >
                  {s.mark || s.name.slice(0, 1)}
                </span>
                <span className="perm-space-name">{s.name}</span>
                <span className="count mono">{countFor(s.id)}</span>
              </button>
            ))}
          </div>

          <div className="setting-card">
            <div className="card-head">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="sm-mark"
                    style={{
                      background: spaceColor,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      fontSize: 11,
                      flex: '0 0 auto',
                    }}
                  >
                    {space.mark || space.name.slice(0, 1)}
                  </span>
                  <span>{space.name} · 成员访问</span>
                </h3>
                <div className="sub">
                  {spaceMembersQuery.isLoading
                    ? '正在读取当前空间成员。'
                    : `${activeCount} 位成员拥有该空间访问权限，修改立即生效。`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={activeCount === 0}
                  onClick={() => setAll(null)}
                >
                  清空
                </button>
                <button type="button" className="btn secondary" onClick={() => setAll('viewer')}>
                  全部设为仅读
                </button>
              </div>
            </div>
            <div className="card-body card-body-scroll">
              <AnimatedScrollList key={space.id} className="rows-scroll permission-member-list">
                {spaceMembersQuery.isLoading && (
                  <div role="status" aria-label={`正在同步 ${space.name} 的成员权限`}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="perm-matrix-row" aria-hidden="true">
                        <Skeleton w={32} h={32} r={999} />
                        <div className="perm-matrix-meta">
                          <Skeleton w="50%" h={14} r={4} />
                          <Skeleton w="70%" h={11} r={4} />
                        </div>
                        <Skeleton w={180} h={32} r={999} />
                      </div>
                    ))}
                  </div>
                )}
                {!spaceMembersQuery.isLoading && assignedMembers.length === 0 && (
                  <div className="perm-empty">当前空间还没有成员访问权限。</div>
                )}
                {!spaceMembersQuery.isLoading &&
                  assignedMembers.map((m: Loose) => {
                    const role = m.spaceRole || perms[m.id]?.[space.id] || null;
                    return (
                      <PermissionMemberRow
                        key={m.id}
                        member={m}
                        role={role}
                        spaceId={space.id}
                        setMemberSpaceRole={setMemberSpaceRole}
                      />
                    );
                  })}
                {!spaceMembersQuery.isLoading && unassignedMembers.length > 0 && (
                  <div className="perm-unassigned">
                    <button
                      type="button"
                      className="perm-unassigned-trigger"
                      onClick={() => setShowUnassigned((v: Loose) => !v)}
                    >
                      <span>{showUnassigned ? '收起未分配成员' : '添加未分配成员'}</span>
                      <span className="mono">{unassignedMembers.length}</span>
                    </button>
                    {showUnassigned &&
                      unassignedMembers.map((m: Loose) => (
                        <PermissionMemberRow
                          key={m.id}
                          member={m}
                          spaceId={space.id}
                          muted
                          setMemberSpaceRole={setMemberSpaceRole}
                        />
                      ))}
                  </div>
                )}
              </AnimatedScrollList>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PermissionMatrix({ spaces, members, perms, setMemberSpaceRole }: Loose) {
  const cycle = (memberId: string, spaceId: string, current: Loose) => {
    const next = NEXT_ROLE[current || 'none'];
    setMemberSpaceRole(memberId, spaceId, next);
  };

  return (
    <div className="setting-card flat perm-matrix-card">
      <div className="pm-legend">
        <span className="pm-legend-label">图例</span>
        <span className="pm-legend-item">
          <span className="pm-cell-glyph none">—</span> 无访问
        </span>
        <span className="pm-legend-item">
          <span
            className="pm-cell-glyph viewer"
            style={{ '--pm-color': 'var(--ink-3)' } as Loose}
          ></span>{' '}
          仅读
        </span>
        <span className="pm-legend-item">
          <span
            className="pm-cell-glyph editor"
            style={{ '--pm-color': 'var(--ink-3)' } as Loose}
          ></span>{' '}
          编辑
        </span>
        <span className="pm-legend-hint">点击单元格切换 · 颜色对应空间</span>
      </div>
      <div className="pm-scroll">
        <table className="pm-grid">
          <thead>
            <tr>
              <th className="pm-corner">成员 \ 空间</th>
              {spaces.map((s: Loose) => (
                <th key={s.id} className="pm-col-head" title={s.name}>
                  <span
                    className="sm-mark"
                    style={{ background: SPACE_COLOR_MAP[s.accent] || SPACE_COLOR_MAP.accent }}
                  >
                    {s.mark || s.name.slice(0, 1)}
                  </span>
                  <span className="pm-col-name">{s.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m: Loose) => (
              <tr key={m.id}>
                <th className="pm-row-head">
                  <span className="avatar small">{m.initials}</span>
                  <span className="pm-row-name">{m.name}</span>
                </th>
                {spaces.map((s: Loose) => {
                  const role = perms[m.id]?.[s.id] || null;
                  const color = SPACE_COLOR_MAP[s.accent] || SPACE_COLOR_MAP.accent;
                  const label = role === 'editor' ? '编辑' : role === 'viewer' ? '仅读' : '无访问';
                  return (
                    <td key={s.id} className="pm-cell-wrap">
                      <button
                        type="button"
                        className={`pm-cell ${role || 'none'}`}
                        style={{ '--pm-color': color } as Loose}
                        title={`${m.name} · ${s.name}：${label}（点击切换）`}
                        aria-label={`${m.name} 在 ${s.name} 的权限：${label}`}
                        onClick={() => cycle(m.id, s.id, role)}
                      >
                        {role === 'editor' ? (
                          <span className="pm-cell-glyph editor"></span>
                        ) : role === 'viewer' ? (
                          <span className="pm-cell-glyph viewer"></span>
                        ) : (
                          <span className="pm-cell-glyph none">—</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionMemberRow({ member, role, spaceId, muted = false, setMemberSpaceRole }: Loose) {
  return (
    <div className={`perm-matrix-row ${muted ? 'muted' : ''}`}>
      <span className="avatar small">{member.initials}</span>
      <div className="perm-matrix-meta">
        <div className="name">{member.name}</div>
        <div className="email mono">{member.email}</div>
      </div>
      <div className="segmented access-seg">
        <button
          type="button"
          className={role === null ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, null)}
        >
          无访问
        </button>
        <button
          type="button"
          className={role === 'viewer' ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, 'viewer')}
        >
          仅读
        </button>
        <button
          type="button"
          className={role === 'editor' ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, 'editor')}
        >
          编辑
        </button>
      </div>
    </div>
  );
}
