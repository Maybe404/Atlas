import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../db/client';
import { documents, grants, members, shareLinks, spaces } from '../db/schema';
import { nowIso } from './dates';
import { getMemberDocumentRole, getMemberSpaceRole, listMemberGrants } from './grants';
import { forbidden, notFound } from './http-error';

type User = typeof members.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

export type PermissionLookup = {
  spaceRolesBySpaceId: Map<string, SpaceMemberRole>;
  documentRolesByDocumentId: Map<string, SpaceMemberRole>;
};

export function emptyPermissionLookup(): PermissionLookup {
  return {
    spaceRolesBySpaceId: new Map(),
    documentRolesByDocumentId: new Map(),
  };
}

export async function loadPermissionLookup(user: User | undefined): Promise<PermissionLookup> {
  if (!user || isAdmin(user)) return emptyPermissionLookup();

  const rows = await listMemberGrants(user.id);

  const spaceRolesBySpaceId = new Map<string, SpaceMemberRole>();
  const documentRolesByDocumentId = new Map<string, SpaceMemberRole>();
  for (const row of rows) {
    if (row.targetType === 'space') spaceRolesBySpaceId.set(row.targetId, row.role);
    else if (row.targetType === 'document') documentRolesByDocumentId.set(row.targetId, row.role);
  }
  return { spaceRolesBySpaceId, documentRolesByDocumentId };
}

export function isAdmin(user?: User) {
  return user?.role === 'admin';
}

export function getSpaceRoleFromLookup(
  user: User | undefined,
  lookup: PermissionLookup,
  spaceId: string,
) {
  if (!user) return null;
  if (isAdmin(user)) return 'editor' as const;
  return lookup.spaceRolesBySpaceId.get(spaceId) ?? null;
}

export async function getSpaceRole(user: User | undefined, spaceId: string) {
  if (!user) return null;
  if (isAdmin(user)) return 'editor' as const;
  return getMemberSpaceRole(user.id, spaceId);
}

export async function requireSpaceAccess(user: User, spaceId: string) {
  const role = await getSpaceRole(user, spaceId);
  if (!role) throw notFound();
  return role;
}

export async function requireSpaceEditor(user: User, spaceId: string) {
  const role = await requireSpaceAccess(user, spaceId);
  if (role !== 'editor') throw forbidden('Editor access is required for this space.');
  return role;
}

export function canReadDocumentWithLookup(
  user: User | undefined,
  doc: DocumentRow,
  lookup: PermissionLookup,
) {
  if (doc.deletedAt) return false;
  if (doc.visibility === 'public') return true;
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (doc.visibility === 'private') return false;
  if (getSpaceRoleFromLookup(user, lookup, doc.spaceId)) return true;
  return lookup.documentRolesByDocumentId.has(doc.id);
}

export async function canReadDocument(user: User | undefined, doc: DocumentRow) {
  if (doc.deletedAt) return false;
  if (doc.visibility === 'public') return true;
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (doc.visibility === 'private') return false;
  const spaceRole = await getSpaceRole(user, doc.spaceId);
  if (spaceRole) return true;
  const directRole = await getMemberDocumentRole(user.id, doc.id);
  return Boolean(directRole);
}

export async function requireDocumentRead(user: User | undefined, docId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), isNull(documents.deletedAt)));
  if (!doc || !(await canReadDocument(user, doc))) throw notFound();
  return doc;
}

export function canEditDocumentWithLookup(
  user: User | undefined,
  doc: DocumentRow,
  lookup: PermissionLookup,
) {
  if (doc.deletedAt) return false;
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (doc.visibility === 'private') return false;
  if (getSpaceRoleFromLookup(user, lookup, doc.spaceId) === 'editor') return true;
  return lookup.documentRolesByDocumentId.get(doc.id) === 'editor';
}

export async function canEditDocument(user: User | undefined, doc: DocumentRow) {
  if (doc.deletedAt) return false;
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (doc.visibility === 'private') return false;
  const spaceRole = await getSpaceRole(user, doc.spaceId);
  if (spaceRole === 'editor') return true;
  const directRole = await getMemberDocumentRole(user.id, doc.id);
  return directRole === 'editor';
}

export function canManageDocumentShare(user: User | undefined, doc: DocumentRow) {
  if (doc.deletedAt) return false;
  if (!user) return false;
  return isAdmin(user) || doc.authorId === user.id;
}

export async function requireDocumentShareManager(user: User | undefined, docId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), isNull(documents.deletedAt)));
  if (!doc || !canManageDocumentShare(user, doc)) throw notFound();
  return doc;
}

export async function requireDocumentEditor(user: User, docId: string) {
  const doc = await requireDocumentRead(user, docId);
  if (!(await canEditDocument(user, doc)))
    throw forbidden('Editor access is required for this document.');
  return doc;
}

export async function listReadableSpaces(user: User | undefined) {
  if (!user) return [];
  if (isAdmin(user)) {
    return db.select().from(spaces);
  }

  const rows = await db
    .select({ space: spaces })
    .from(spaces)
    .innerJoin(
      grants,
      and(
        eq(grants.targetType, 'space'),
        eq(grants.targetId, spaces.id),
        eq(grants.subjectType, 'member'),
        eq(grants.subjectId, user.id),
      ),
    );

  return rows.map((row) => row.space);
}

export async function listReadableDocuments(user: User | undefined, space?: SpaceRow) {
  const spaceScope = space ? [eq(documents.spaceId, space.id)] : [];

  if (!user) {
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.visibility, 'public'), isNull(documents.deletedAt), ...spaceScope));
  }

  if (isAdmin(user)) {
    if (space) {
      return db
        .select()
        .from(documents)
        .where(and(eq(documents.spaceId, space.id), isNull(documents.deletedAt)));
    }
    return db.select().from(documents).where(isNull(documents.deletedAt));
  }

  const spaceGrant = alias(grants, 'space_grant');
  const docGrant = alias(grants, 'doc_grant');

  const rows = await db
    .select({ doc: documents })
    .from(documents)
    .leftJoin(
      spaceGrant,
      and(
        eq(spaceGrant.targetType, 'space'),
        eq(spaceGrant.targetId, documents.spaceId),
        eq(spaceGrant.subjectType, 'member'),
        eq(spaceGrant.subjectId, user.id),
      ),
    )
    .leftJoin(
      docGrant,
      and(
        eq(docGrant.targetType, 'document'),
        eq(docGrant.targetId, documents.id),
        eq(docGrant.subjectType, 'member'),
        eq(docGrant.subjectId, user.id),
      ),
    )
    .where(
      and(
        isNull(documents.deletedAt),
        ...spaceScope,
        or(
          eq(documents.visibility, 'public'),
          eq(documents.authorId, user.id),
          and(eq(documents.visibility, 'invite'), isNotNull(spaceGrant.subjectId)),
          and(eq(documents.visibility, 'invite'), isNotNull(docGrant.subjectId)),
        ),
      ),
    );

  return rows.map((row) => row.doc);
}

export async function listDirectoryDocuments(user: User | undefined, space?: SpaceRow) {
  if (!user) {
    const spaceScope = space ? [eq(documents.spaceId, space.id)] : [];
    return db
      .select()
      .from(documents)
      .where(and(isNull(documents.deletedAt), ...spaceScope));
  }

  return listReadableDocuments(user, space);
}

export async function publicDocumentByToken(token: string) {
  const [row] = await db
    .select({ link: shareLinks, doc: documents, space: spaces, author: members })
    .from(shareLinks)
    .innerJoin(documents, eq(shareLinks.documentId, documents.id))
    .innerJoin(spaces, eq(documents.spaceId, spaces.id))
    .innerJoin(members, eq(documents.authorId, members.id))
    .where(
      and(
        eq(shareLinks.token, token),
        eq(shareLinks.enabled, true),
        isNull(shareLinks.revokedAt),
        isNull(documents.deletedAt),
      ),
    );

  if (!row) throw notFound();
  if (row.link.expiresAt && new Date(row.link.expiresAt).getTime() < Date.now()) throw notFound();
  await db
    .update(shareLinks)
    .set({
      lastAccessedAt: nowIso(),
      accessCount: row.link.accessCount + 1,
    })
    .where(eq(shareLinks.id, row.link.id));
  return row;
}

export function roleCanEdit(role: SpaceMemberRole | null) {
  return role === 'editor';
}
