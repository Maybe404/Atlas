import { useMemo, useState } from 'react';
import { I } from '../chrome';
import type { Loose } from '../loose-types';
import { GeneralPane } from './general-pane';
import { MembersPane } from './members-pane';
import { PermissionsPane } from './permissions-pane';
import { SpacesPane } from './spaces-pane';
import { TrashPane } from './trash-pane';

const _I2 = I;

export function AdminSettingsView({
  ctx: _ctx,
  onNavigate: _onNavigate,
  pushToast,
  spaces = [],
  members = [],
  permissions = [],
  currentUser,
  mutations,
  onEditSpace,
  onNewSpace,
}: Loose) {
  const [pane, setPane] = useState('spaces');

  const perms = useMemo(() => {
    const p: Record<string, Record<string, Loose>> = {};
    members.forEach((m: Loose) => {
      const row: Record<string, Loose> = {};
      spaces.forEach((s: Loose) => {
        row[s.id] = null;
      });
      p[m.id] = row;
    });
    permissions.forEach((perm: Loose) => {
      const row = p[perm.memberId] || {};
      row[perm.spaceId] = perm.role;
      p[perm.memberId] = row;
    });
    return p;
  }, [members, permissions, spaces]);

  const setMemberSpaceRole = (memberId: Loose, spaceId: Loose, role: Loose, options: Loose) => {
    mutations.setSpaceRole(spaceId, memberId, role, options);
  };

  return (
    <div className="main-card">
      <div className="settings-shell">
        <nav className="settings-nav">
          <div className="settings-nav-group">工作区</div>
          <div
            className={`settings-nav-item ${pane === 'general' ? 'active' : ''}`}
            onClick={() => setPane('general')}
          >
            <_I2.settings />
            <span>常规</span>
          </div>
          <div
            className={`settings-nav-item ${pane === 'spaces' ? 'active' : ''}`}
            onClick={() => setPane('spaces')}
          >
            <_I2.folder />
            <span>空间</span>
          </div>
          <div
            className={`settings-nav-item ${pane === 'members' ? 'active' : ''}`}
            onClick={() => setPane('members')}
          >
            <_I2.members />
            <span>成员</span>
          </div>
          <div
            className={`settings-nav-item ${pane === 'permissions' ? 'active' : ''}`}
            onClick={() => setPane('permissions')}
          >
            <_I2.lock />
            <span>空间权限</span>
          </div>
          <div className="settings-nav-group">维护</div>
          <div
            className={`settings-nav-item ${pane === 'trash' ? 'active' : ''}`}
            onClick={() => setPane('trash')}
          >
            <_I2.trash />
            <span>回收站</span>
          </div>
        </nav>

        <div className="settings-pane">
          {pane === 'general' && <GeneralPane />}
          {pane === 'spaces' && (
            <SpacesPane
              spaces={spaces}
              perms={perms}
              onEditSpace={onEditSpace}
              onNewSpace={onNewSpace}
              onDeleteSpace={(id: Loose) => {
                if (confirm('确认删除该空间？其下文档会一起删除。')) {
                  mutations.deleteSpace(id);
                }
              }}
            />
          )}
          {pane === 'members' && (
            <MembersPane
              spaces={spaces}
              members={members}
              perms={perms}
              currentUser={currentUser}
              setMemberSpaceRole={setMemberSpaceRole}
              pushToast={pushToast}
              mutations={mutations}
            />
          )}
          {pane === 'permissions' && (
            <PermissionsPane
              spaces={spaces}
              members={members}
              perms={perms}
              setMemberSpaceRole={setMemberSpaceRole}
              pushToast={pushToast}
            />
          )}
          {pane === 'trash' && <TrashPane pushToast={pushToast} mutations={mutations} />}
        </div>
      </div>
    </div>
  );
}
