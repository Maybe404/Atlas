import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '../db/client';
import {
  documentMembers,
  documents,
  members,
  shareLinks,
  spaceMembers,
  spaces,
} from '../db/schema';
import { nowIso } from './dates';
import { forbidden, notFound } from './http-error';

type User = typeof members.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type SpaceMemberRow = typeof spaceMembers.$inferSelect;
type DocumentMemberRow = typeof documentMembers.$inferSelect;

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

  const [spaceRows, documentRows] = await Promise.all([
    db.select().from(spaceMembers).where(eq(spaceMembers.memberId, user.id)),
    db.select().from(documentMembers).where(eq(documentMembers.memberId, user.id)),
  ]);

  return {
    spaceRolesBySpaceId: new Map(
      spaceRows.map((row: SpaceMemberRow) => [row.spaceId, row.role as SpaceMemberRole]),
    ),
    documentRolesByDocumentId: new Map(
      documentRows.map((row: DocumentMemberRow) => [row.documentId, row.role as SpaceMemberRole]),
    ),
  };
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
  const [membership] = await db
    .select()
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.memberId, user.id)));
  return membership?.role ?? null;
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
  const [direct] = await db
    .select()
    .from(documentMembers)
    .where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.memberId, user.id)));
  return Boolean(direct);
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
  const [direct] = await db
    .select()
    .from(documentMembers)
    .where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.memberId, user.id)));
  return direct?.role === 'editor';
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
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
    .where(eq(spaceMembers.memberId, user.id));

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

  const rows = await db
    .select({ doc: documents })
    .from(documents)
    .leftJoin(
      spaceMembers,
      and(eq(spaceMembers.spaceId, documents.spaceId), eq(spaceMembers.memberId, user.id)),
    )
    .leftJoin(
      documentMembers,
      and(eq(documentMembers.documentId, documents.id), eq(documentMembers.memberId, user.id)),
    )
    .where(
      and(
        isNull(documents.deletedAt),
        ...spaceScope,
        or(
          eq(documents.visibility, 'public'),
          eq(documents.authorId, user.id),
          and(eq(documents.visibility, 'invite'), isNotNull(spaceMembers.memberId)),
          and(eq(documents.visibility, 'invite'), isNotNull(documentMembers.memberId)),
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
