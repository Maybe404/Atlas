import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { grants } from '../db/schema';

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
