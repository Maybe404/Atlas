import type { db } from '../db/client';
import { spaces } from '../db/schema';
import { setMemberSpaceRole } from './grants';

type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

// Deterministic id so provisioning is idempotent across seed/migration/route paths.
export function personalSpaceId(memberId: string) {
  return `sp_personal_${memberId}`;
}

// Create a member's private space and grant them editor on it. Isolation is automatic:
// no other member holds a grant, so only the owner (and admins) can reach its contents.
export async function createPersonalSpace(exec: Executor, member: { id: string; name: string }) {
  const id = personalSpaceId(member.id);
  await exec.insert(spaces).values({
    id,
    name: `${member.name} · 个人`,
    mark: member.name.slice(0, 1),
    accent: 'plum',
    personal: true,
    ownerId: member.id,
  });
  await setMemberSpaceRole(exec, member.id, id, 'editor');
  return id;
}
