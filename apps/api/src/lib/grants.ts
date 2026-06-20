import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db/client';
import { grants, groupMembers } from '../db/schema';

// Either the top-level db or a transaction handle works as the executor.
type Executor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

export type GrantSubjectType = 'group' | 'member';
export type GrantTargetType = 'space' | 'folder' | 'document';

// Upsert one grant edge. A null role removes the edge (delete-then-maybe-insert).
export async function setGrant(
  exec: Executor,
  params: {
    subjectType: GrantSubjectType;
    subjectId: string;
    targetType: GrantTargetType;
    targetId: string;
    role: SpaceMemberRole | null;
  },
) {
  await exec
    .delete(grants)
    .where(
      and(
        eq(grants.subjectType, params.subjectType),
        eq(grants.subjectId, params.subjectId),
        eq(grants.targetType, params.targetType),
        eq(grants.targetId, params.targetId),
      ),
    );
  if (params.role) {
    await exec.insert(grants).values({
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      targetType: params.targetType,
      targetId: params.targetId,
      role: params.role,
    });
  }
}

// Member-subject convenience wrappers (the only shapes Phase 1 writes).
export function setMemberSpaceRole(
  exec: Executor,
  memberId: string,
  spaceId: string,
  role: SpaceMemberRole | null,
) {
  return setGrant(exec, {
    subjectType: 'member',
    subjectId: memberId,
    targetType: 'space',
    targetId: spaceId,
    role,
  });
}

export function setMemberDocumentRole(
  exec: Executor,
  memberId: string,
  documentId: string,
  role: SpaceMemberRole | null,
) {
  return setGrant(exec, {
    subjectType: 'member',
    subjectId: memberId,
    targetType: 'document',
    targetId: documentId,
    role,
  });
}

// All space/document grants held by one member (used to build the permission lookup).
export async function listMemberGrants(memberId: string) {
  return db
    .select({ targetType: grants.targetType, targetId: grants.targetId, role: grants.role })
    .from(grants)
    .where(and(eq(grants.subjectType, 'member'), eq(grants.subjectId, memberId)));
}

// Group ids a member belongs to (drives effective-grant folding + capability union).
export async function listGroupIdsForMember(memberId: string) {
  const rows = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.memberId, memberId));
  return rows.map((row) => row.groupId);
}

// Effective grants for a member = their own member-subject grants UNION the grants of every group
// they belong to. The caller folds these by target taking the highest role (editor > viewer).
export async function listEffectiveGrants(memberId: string, groupIds: string[]) {
  const subjectFilter =
    groupIds.length > 0
      ? or(
          and(eq(grants.subjectType, 'member'), eq(grants.subjectId, memberId)),
          and(eq(grants.subjectType, 'group'), inArray(grants.subjectId, groupIds)),
        )
      : and(eq(grants.subjectType, 'member'), eq(grants.subjectId, memberId));
  return db
    .select({ targetType: grants.targetType, targetId: grants.targetId, role: grants.role })
    .from(grants)
    .where(subjectFilter);
}

// Space/folder grants attached to a group (documents are member-only grants).
export async function listGroupGrants(groupId: string) {
  return db
    .select({ targetType: grants.targetType, targetId: grants.targetId, role: grants.role })
    .from(grants)
    .where(and(eq(grants.subjectType, 'group'), eq(grants.subjectId, groupId)));
}

export async function getMemberSpaceRole(memberId: string, spaceId: string) {
  const [row] = await db
    .select({ role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, memberId),
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaceId),
      ),
    );
  return row?.role ?? null;
}

export async function getMemberDocumentRole(memberId: string, documentId: string) {
  const [row] = await db
    .select({ role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, memberId),
        eq(grants.targetType, 'document'),
        eq(grants.targetId, documentId),
      ),
    );
  return row?.role ?? null;
}

// Members granted on a space / document (used by the management read routes).
export async function listSpaceMemberGrants(spaceId: string) {
  return db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaceId),
      ),
    );
}

export async function listDocumentMemberGrants(documentId: string) {
  return db
    .select({ memberId: grants.subjectId, role: grants.role })
    .from(grants)
    .where(
      and(
        eq(grants.subjectType, 'member'),
        eq(grants.targetType, 'document'),
        eq(grants.targetId, documentId),
      ),
    );
}

// Cleanup helpers (replace the FK cascades the old tables relied on).
export async function removeGrantsForSubject(exec: Executor, subjectId: string) {
  await exec.delete(grants).where(eq(grants.subjectId, subjectId));
}

export async function removeGrantsForTarget(
  exec: Executor,
  targetType: GrantTargetType,
  targetId: string,
) {
  await exec
    .delete(grants)
    .where(and(eq(grants.targetType, targetType), eq(grants.targetId, targetId)));
}
