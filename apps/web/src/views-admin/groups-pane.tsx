import { useMemo, useState } from 'react';
import { AnimatedScrollList, I } from '../chrome';
import { CAPABILITY_ORDER, capabilityLabel } from '../labels';
import type { Loose } from '../loose-types';
import { flattenFolders, folderPathLabel } from '../views/shared';

const _I2 = I;

type GroupGrant = { targetType: 'space' | 'folder'; targetId: string; role: 'viewer' | 'editor' };

// One row in a group's authorization list, resolved to a human label.
function grantLabel(grant: GroupGrant, spaces: Loose[]): string {
  if (grant.targetType === 'space') {
    return spaces.find((s: Loose) => s.id === grant.targetId)?.name ?? '（已删除空间）';
  }
  for (const sp of spaces) {
    const path = folderPathLabel(sp.folders ?? [], grant.targetId);
    if (path) return `${sp.name} / ${path}`;
  }
  return '（已删除文件夹）';
}

function GroupCard({ group, spaces, members, mutations, pushToast }: Loose) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [addMemberId, setAddMemberId] = useState('');
  const [grantSpaceId, setGrantSpaceId] = useState('');
  const [grantFolderId, setGrantFolderId] = useState('');
  const [grantRole, setGrantRole] = useState<'viewer' | 'editor'>('viewer');

  const caps: string[] = group.capabilities ?? [];
  const memberIds: string[] = group.memberIds ?? [];
  const grants: GroupGrant[] = group.grants ?? [];
  const memberById = useMemo(
    () => new Map<string, Loose>(members.map((m: Loose) => [m.id, m])),
    [members],
  );
  const nonMembers = members.filter((m: Loose) => !memberIds.includes(m.id));
  const grantSpace = spaces.find((s: Loose) => s.id === grantSpaceId);
  const grantFolders = grantSpace ? flattenFolders(grantSpace.folders ?? []) : [];

  const toggleCap = (cap: string) => {
    const next = caps.includes(cap) ? caps.filter((c) => c !== cap) : [...caps, cap];
    mutations.updateGroup(group.id, { capabilities: next });
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === group.name) {
      setNameDraft(group.name);
      return;
    }
    mutations.updateGroup(group.id, { name: trimmed });
  };

  const addMember = (id: string) => {
    if (!id) return;
    mutations.setGroupMembers(group.id, [...memberIds, id]);
    setAddMemberId('');
  };
  const removeMember = (id: string) => {
    mutations.setGroupMembers(
      group.id,
      memberIds.filter((m) => m !== id),
    );
  };

  const addGrant = () => {
    if (!grantSpaceId) {
      pushToast?.({ msg: '请选择授权的空间' });
      return;
    }
    const next: GroupGrant = grantFolderId
      ? { targetType: 'folder', targetId: grantFolderId, role: grantRole }
      : { targetType: 'space', targetId: grantSpaceId, role: grantRole };
    // Replace any existing grant on the same target, then append.
    const filtered = grants.filter(
      (g) => !(g.targetType === next.targetType && g.targetId === next.targetId),
    );
    mutations.setGroupGrants(group.id, [...filtered, next]);
    setGrantSpaceId('');
    setGrantFolderId('');
    setGrantRole('viewer');
  };
  const removeGrant = (grant: GroupGrant) => {
    mutations.setGroupGrants(
      group.id,
      grants.filter((g) => !(g.targetType === grant.targetType && g.targetId === grant.targetId)),
    );
  };
  const setGrantRoleFor = (grant: GroupGrant, role: 'viewer' | 'editor') => {
    mutations.setGroupGrants(
      group.id,
      grants.map((g) =>
        g.targetType === grant.targetType && g.targetId === grant.targetId ? { ...g, role } : g,
      ),
    );
  };

  return (
    <div className={`group-card ${open ? 'open' : ''}`}>
      <div className="group-card-head">
        <button
          type="button"
          className="group-card-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '收起' : '展开'}
        >
          <_I2.chevDn />
        </button>
        <input
          className="group-name-input"
          value={nameDraft}
          onChange={(e: Loose) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e: Loose) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div className="group-card-meta">
          {caps.map((cap) => (
            <span key={cap} className="cap-chip on">
              {capabilityLabel(cap)}
            </span>
          ))}
          <span className="group-count">
            {memberIds.length} 人 · {grants.length} 授权
          </span>
        </div>
        <button
          type="button"
          className="icon-btn danger"
          title="删除权限组"
          onClick={() => {
            if (confirm(`确认删除权限组「${group.name}」？组的能力与授权将一并移除。`)) {
              mutations.deleteGroup(group.id);
            }
          }}
        >
          <_I2.trash />
        </button>
      </div>

      {open && (
        <div className="group-card-body">
          <section className="group-section">
            <div className="group-section-title">全局能力</div>
            <div className="cap-toggle-row">
              {CAPABILITY_ORDER.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  className={`cap-chip ${caps.includes(cap) ? 'on' : ''}`}
                  onClick={() => toggleCap(cap)}
                >
                  {capabilityLabel(cap)}
                </button>
              ))}
            </div>
          </section>

          <section className="group-section">
            <div className="group-section-title">组成员</div>
            <div className="group-member-chips">
              {memberIds.length === 0 && <span className="muted-hint">暂无成员</span>}
              {memberIds.map((id) => {
                const m = memberById.get(id);
                return (
                  <span key={id} className="member-chip">
                    {m?.name ?? id}
                    <button type="button" onClick={() => removeMember(id)} aria-label="移除">
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
            <select
              className="input group-add-select"
              value={addMemberId}
              onChange={(e: Loose) => addMember(e.target.value)}
            >
              <option value="">＋ 添加成员…</option>
              {nonMembers.map((m: Loose) => (
                <option key={m.id} value={m.id}>
                  {m.name}（{m.email}）
                </option>
              ))}
            </select>
          </section>

          <section className="group-section">
            <div className="group-section-title">资源授权</div>
            <div className="group-grant-list">
              {grants.length === 0 && <span className="muted-hint">暂无授权</span>}
              {grants.map((grant) => (
                <div key={`${grant.targetType}:${grant.targetId}`} className="group-grant-row">
                  <span className={`grant-kind ${grant.targetType}`}>
                    {grant.targetType === 'space' ? '空间' : '文件夹'}
                  </span>
                  <span className="grant-target">{grantLabel(grant, spaces)}</span>
                  <div className="role-seg">
                    <button
                      type="button"
                      className={grant.role === 'viewer' ? 'active' : ''}
                      onClick={() => setGrantRoleFor(grant, 'viewer')}
                    >
                      只读
                    </button>
                    <button
                      type="button"
                      className={grant.role === 'editor' ? 'active' : ''}
                      onClick={() => setGrantRoleFor(grant, 'editor')}
                    >
                      可编辑
                    </button>
                  </div>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="移除授权"
                    onClick={() => removeGrant(grant)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="group-grant-add">
              <select
                className="input"
                value={grantSpaceId}
                onChange={(e: Loose) => {
                  setGrantSpaceId(e.target.value);
                  setGrantFolderId('');
                }}
              >
                <option value="">选择空间…</option>
                {spaces.map((s: Loose) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={grantFolderId}
                onChange={(e: Loose) => setGrantFolderId(e.target.value)}
                disabled={!grantSpaceId || grantFolders.length === 0}
              >
                <option value="">整个空间</option>
                {grantFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={grantRole}
                onChange={(e: Loose) => setGrantRole(e.target.value)}
              >
                <option value="viewer">只读</option>
                <option value="editor">可编辑</option>
              </select>
              <button type="button" className="btn secondary" onClick={addGrant}>
                添加授权
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function GroupsPane({
  groups = [],
  spaces = [],
  members = [],
  mutations,
  pushToast,
}: Loose) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCaps, setNewCaps] = useState<string[]>([]);

  const submitNew = (e: Loose) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      pushToast?.({ msg: '请填写权限组名称' });
      return;
    }
    mutations.createGroup({ name, capabilities: newCaps });
    setNewName('');
    setNewCaps([]);
    setShowNew(false);
  };

  return (
    <>
      <div className="pane-head">
        <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 500, marginBottom: 6 }}>
          工作区 · 权限组
        </div>
        <h1>权限组</h1>
        <p className="pane-sub">
          用组承载「全局能力」与「对空间 /
          文件夹的授权」。成员入组即继承组的能力与授权，无需逐项维护。
        </p>
      </div>

      <div className="setting-card">
        <div className="card-head">
          <div>
            <h3>所有权限组</h3>
            <div className="sub">{groups.length} 个组</div>
          </div>
          <button type="button" className="btn primary" onClick={() => setShowNew((v) => !v)}>
            <_I2.plus />
            <span>新建组</span>
          </button>
        </div>

        {showNew && (
          <form className="group-create" onSubmit={submitNew}>
            <input
              className="input"
              placeholder="权限组名称"
              value={newName}
              onChange={(e: Loose) => setNewName(e.target.value)}
            />
            <div className="cap-toggle-row">
              {CAPABILITY_ORDER.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  className={`cap-chip ${newCaps.includes(cap) ? 'on' : ''}`}
                  onClick={() =>
                    setNewCaps((c) => (c.includes(cap) ? c.filter((x) => x !== cap) : [...c, cap]))
                  }
                >
                  {capabilityLabel(cap)}
                </button>
              ))}
            </div>
            <div className="group-create-actions">
              <button type="button" className="btn ghost" onClick={() => setShowNew(false)}>
                取消
              </button>
              <button type="submit" className="btn primary">
                创建
              </button>
            </div>
          </form>
        )}

        <div className="card-body card-body-scroll">
          <AnimatedScrollList className="rows-scroll">
            {groups.length === 0 && (
              <div className="muted-hint pad">还没有权限组，点「新建组」开始。</div>
            )}
            {groups.map((group: Loose) => (
              <GroupCard
                key={group.id}
                group={group}
                spaces={spaces}
                members={members}
                mutations={mutations}
                pushToast={pushToast}
              />
            ))}
          </AnimatedScrollList>
        </div>
      </div>
    </>
  );
}
