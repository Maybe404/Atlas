import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq, isNull } from 'drizzle-orm';
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

export function isAdmin(user?: User) {
  return user?.role === 'admin';
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

  const publicRows = await db
    .select({ doc: documents })
    .from(documents)
    .where(and(eq(documents.visibility, 'public'), isNull(documents.deletedAt), ...spaceScope));

  const authorRows = await db
    .select({ doc: documents })
    .from(documents)
    .where(and(eq(documents.authorId, user.id), isNull(documents.deletedAt), ...spaceScope));

  const spaceRows = await db
    .select({ doc: documents })
    .from(documents)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, documents.spaceId))
    .where(
      and(
        eq(spaceMembers.memberId, user.id),
        eq(documents.visibility, 'invite'),
        isNull(documents.deletedAt),
        ...spaceScope,
      ),
    );

  const directRows = await db
    .select({ doc: documents })
    .from(documents)
    .innerJoin(documentMembers, eq(documentMembers.documentId, documents.id))
    .where(
      and(
        eq(documentMembers.memberId, user.id),
        eq(documents.visibility, 'invite'),
        isNull(documents.deletedAt),
        ...spaceScope,
      ),
    );

  const seen = new Set<string>();
  return [...publicRows, ...authorRows, ...spaceRows, ...directRows].flatMap((row) => {
    if (seen.has(row.doc.id)) return [];
    seen.add(row.doc.id);
    return [row.doc];
  });
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
