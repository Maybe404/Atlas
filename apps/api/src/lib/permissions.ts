import type { SpaceMemberRole } from '@atlas/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, folders, grants, members, shareLinks, spaces } from '../db/schema';
import { nowIso } from './dates';
import { getMemberSpaceRole, listMemberGrants } from './grants';
import { forbidden, notFound } from './http-error';

type User = typeof members.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

export type PermissionLookup = {
  // Effective member grants by target.
  spaceRolesBySpaceId: Map<string, SpaceMemberRole>;
  folderRolesByFolderId: Map<string, SpaceMemberRole>;
  documentRolesByDocumentId: Map<string, SpaceMemberRole>;
  // Folder tree metadata for inherit-chain resolution (lives across deleted state — restricted on a
  // deleted folder is harmless because its docs are excluded everywhere anyway).
  folderParentById: Map<string, string | null>;
  restrictedFolderIds: Set<string>;
  // Docs reachable through an enabled, unrevoked, unexpired public share link.
  publishedDocIds: Set<string>;
  // Personal-space owners (owner reads/edits everything in their space).
  spaceOwnerById: Map<string, string | null>;
};

export function emptyPermissionLookup(): PermissionLookup {
  return {
    spaceRolesBySpaceId: new Map(),
    folderRolesByFolderId: new Map(),
    documentRolesByDocumentId: new Map(),
    folderParentById: new Map(),
    restrictedFolderIds: new Set(),
    publishedDocIds: new Set(),
    spaceOwnerById: new Map(),
  };
}

// Loads everything the sync `*WithLookup` resolvers need in one pass. Folder tree, space owners and
// the published set are user-independent (guests need them too); only the grant maps depend on the
// member (admins bypass them entirely).
export async function loadPermissionLookup(user: User | undefined): Promise<PermissionLookup> {
  const lookup = emptyPermissionLookup();

  const [folderRows, spaceRows, linkRows] = await Promise.all([
    db
      .select({ id: folders.id, parentId: folders.parentId, restricted: folders.restricted })
      .from(folders),
    db.select({ id: spaces.id, ownerId: spaces.ownerId }).from(spaces),
    db
      .select({ documentId: shareLinks.documentId, expiresAt: shareLinks.expiresAt })
      .from(shareLinks)
      .where(and(eq(shareLinks.enabled, true), isNull(shareLinks.revokedAt))),
  ]);

  for (const folder of folderRows) {
    lookup.folderParentById.set(folder.id, folder.parentId);
    if (folder.restricted) lookup.restrictedFolderIds.add(folder.id);
  }
  for (const space of spaceRows) lookup.spaceOwnerById.set(space.id, space.ownerId);
  const now = Date.now();
  for (const link of linkRows) {
    if (link.expiresAt && new Date(link.expiresAt).getTime() < now) continue;
    lookup.publishedDocIds.add(link.documentId);
  }

  // Admins bypass grants; guests hold none.
  if (user && !isAdmin(user)) {
    const rows = await listMemberGrants(user.id);
    for (const row of rows) {
      if (row.targetType === 'space') lookup.spaceRolesBySpaceId.set(row.targetId, row.role);
      else if (row.targetType === 'folder')
        lookup.folderRolesByFolderId.set(row.targetId, row.role);
      else if (row.targetType === 'document')
        lookup.documentRolesByDocumentId.set(row.targetId, row.role);
    }
  }

  return lookup;
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

export async function requireFolderEditor(user: User, folderId: string) {
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId));
  if (!folder) throw notFound();
  await requireSpaceEditor(user, folder.spaceId);
  return folder;
}

// Resolve an `inherit` document's effective role by walking its folder chain up to the space.
// A folder grant anywhere in the chain wins; otherwise a `restricted` folder blocks space-level
// grants from penetrating; otherwise the space grant applies. Returns null when nothing grants.
function resolveInheritRole(doc: DocumentRow, lookup: PermissionLookup): SpaceMemberRole | null {
  let folderRole: SpaceMemberRole | null = null;
  let blockedByRestricted = false;
  const seen = new Set<string>();
  let fid: string | null = doc.folderId ?? null;
  while (fid && !seen.has(fid)) {
    seen.add(fid);
    const role = lookup.folderRolesByFolderId.get(fid);
    if (role && (role === 'editor' || !folderRole)) folderRole = role;
    if (lookup.restrictedFolderIds.has(fid)) blockedByRestricted = true;
    fid = lookup.folderParentById.get(fid) ?? null;
  }
  if (folderRole) return folderRole;
  if (blockedByRestricted) return null;
  return lookup.spaceRolesBySpaceId.get(doc.spaceId) ?? null;
}

// Single source of truth for read access. `requireDocumentRead` / `canReadDocument` delegate here
// after loading the lookup, so the chain stays identical for list rendering and single-doc reads.
export function canReadDocumentWithLookup(
  user: User | undefined,
  doc: DocumentRow,
  lookup: PermissionLookup,
) {
  if (doc.deletedAt) return false;
  if (lookup.publishedDocIds.has(doc.id)) return true; // public share link — guest channel
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (lookup.spaceOwnerById.get(doc.spaceId) === user.id) return true;
  if (lookup.documentRolesByDocumentId.has(doc.id)) return true; // explicit per-doc grant
  if (doc.access === 'restricted') return false; // no inheritance
  return resolveInheritRole(doc, lookup) !== null;
}

export async function canReadDocument(user: User | undefined, doc: DocumentRow) {
  return canReadDocumentWithLookup(user, doc, await loadPermissionLookup(user));
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
  if (lookup.spaceOwnerById.get(doc.spaceId) === user.id) return true;
  if (lookup.documentRolesByDocumentId.get(doc.id) === 'editor') return true;
  if (doc.access === 'restricted') return false;
  return resolveInheritRole(doc, lookup) === 'editor';
}

export async function canEditDocument(user: User | undefined, doc: DocumentRow) {
  return canEditDocumentWithLookup(user, doc, await loadPermissionLookup(user));
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

export async function listReadableDocuments(
  user: User | undefined,
  space?: SpaceRow,
  lookup?: PermissionLookup,
) {
  const spaceScope = space ? [eq(documents.spaceId, space.id)] : [];

  if (isAdmin(user)) {
    return db
      .select()
      .from(documents)
      .where(and(isNull(documents.deletedAt), ...spaceScope));
  }

  // The inherit/restricted + folder + share-link chain doesn't reduce to a single SQL predicate, so
  // we load the candidate set and filter through the one canonical resolver. Callers that already
  // built a lookup pass it in to avoid reloading the folder/grant maps.
  const candidates = await db
    .select()
    .from(documents)
    .where(and(isNull(documents.deletedAt), ...spaceScope));
  const resolved = lookup ?? (await loadPermissionLookup(user));
  return candidates.filter((doc) => canReadDocumentWithLookup(user, doc, resolved));
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
