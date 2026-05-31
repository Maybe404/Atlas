import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api-client';
import { AnimatedScrollList } from '../chrome';
import { atlasKeys } from '../data-hooks';
import type { Loose } from '../loose-types';
import { SPACE_COLOR_MAP } from './shared';

export function PermissionsPane({
  spaces,
  members = [],
  perms,
  setMemberSpaceRole,
  pushToast,
}: Loose) {
  const [activeSpace, setActiveSpace] = useState(spaces[0]?.id || '');
  const [showUnassigned, setShowUnassigned] = useState(false);
  useEffect(() => {
    if (!spaces.length) return;
    if (!spaces.some((s: Loose) => s.id === activeSpace)) {
      setActiveSpace(spaces[0].id);
    }
  }, [activeSpace, spaces]);

  const space = spaces.find((s: Loose) => s.id === activeSpace) || spaces[0];
  const spaceMembersQuery = useQuery({
    queryKey: space?.id ? atlasKeys.spaceMembers(space.id) : ['space-members', 'empty'],
    queryFn: () => apiGet(`/spaces/${space.id}/members`),
    enabled: Boolean(space?.id),
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
    targets.forEach((m: Loose) => {
      setMemberSpaceRole(m.id, space.id, role, { silent: true });
    });
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
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          工作区 · 空间权限
        </div>
        <h1>空间权限</h1>
        <p className="pane-sub">
          为每个空间分别指定成员的角色——编辑可创建与修改文档，仅读只能查看。一位成员可以同时拥有多个空间的访问权限。
        </p>
      </div>

      <div className="space-tabs">
        {spaces.map((s: Loose) => (
          <button
            key={s.id}
            className={`space-tab ${activeSpace === s.id ? 'active' : ''}`}
            onClick={() => setSpaceWithMotion(s.id)}
          >
            <span className="dot" style={{ background: SPACE_COLOR_MAP[s.accent] }}></span>
            <span>{s.name}</span>
            <span className="count mono">
              {Object.values(perms).filter((p: Loose) => p?.[s.id]).length}
            </span>
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
            <button className="btn ghost" disabled={activeCount === 0} onClick={() => setAll(null)}>
              清空
            </button>
            <button className="btn secondary" onClick={() => setAll('viewer')}>
              全部设为仅读
            </button>
          </div>
        </div>
        <div className="card-body card-body-scroll">
          <AnimatedScrollList key={space.id} className="rows-scroll permission-member-list">
            {spaceMembersQuery.isLoading && (
              <div className="perm-empty">正在同步 {space.name} 的成员权限…</div>
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
    </>
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
          className={role === null ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, null)}
        >
          无访问
        </button>
        <button
          className={role === 'viewer' ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, 'viewer')}
        >
          仅读
        </button>
        <button
          className={role === 'editor' ? 'active' : ''}
          onClick={() => setMemberSpaceRole(member.id, spaceId, 'editor')}
        >
          编辑
        </button>
      </div>
    </div>
  );
}
