import { ALL_CAPABILITIES, type Capability, type SpaceMemberRole } from '@atlas/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { documents, folders, groups, members, shareLinks, spaces } from '../db/schema';
import { nowIso } from './dates';
import { getMemberSpaceRole, listEffectiveGrants, listGroupIdsForMember } from './grants';
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
  // Active share tokens (id → token) for the same set, so the directory can surface a usable
  // /share/:token URL for guests. Tokens are public by design — leaking them to the directory
  // is intentional, not a security regression.
  publishedTokensByDoc: Map<string, string>;
  // Personal-space owners (owner reads/edits everything in their space).
  spaceOwnerById: Map<string, string | null>;
  // Effective global capabilities (union across the member's groups; admins hold all).
  capabilities: Set<Capability>;
};

export function emptyPermissionLookup(): PermissionLookup {
  return {
    spaceRolesBySpaceId: new Map(),
    folderRolesByFolderId: new Map(),
    documentRolesByDocumentId: new Map(),
    folderParentById: new Map(),
    restrictedFolderIds: new Set(),
    publishedDocIds: new Set(),
    publishedTokensByDoc: new Map(),
    spaceOwnerById: new Map(),
    capabilities: new Set(),
  };
}

// Fold a grant into a role map taking the highest role (editor > viewer); never downgrades.
function foldRole(map: Map<string, SpaceMemberRole>, key: string, role: SpaceMemberRole) {
  if (map.get(key) !== 'editor') map.set(key, role);
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
      .select({
        documentId: shareLinks.documentId,
        expiresAt: shareLinks.expiresAt,
        token: shareLinks.token,
      })
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
    lookup.publishedTokensByDoc.set(link.documentId, link.token);
  }

  // Admins bypass grants and hold every capability; guests hold none.
  if (isAdmin(user)) {
    for (const cap of ALL_CAPABILITIES) lookup.capabilities.add(cap);
  } else if (user) {
    const groupIds = await listGroupIdsForMember(user.id);
    const [grantRows, groupRows] = await Promise.all([
      listEffectiveGrants(user.id, groupIds),
      groupIds.length > 0
        ? db
            .select({ capabilities: groups.capabilities })
            .from(groups)
            .where(inArray(groups.id, groupIds))
        : Promise.resolve([] as { capabilities: string[] }[]),
    ]);
    // Member-direct and group grants are merged taking the highest role per target.
    for (const row of grantRows) {
      if (row.targetType === 'space') foldRole(lookup.spaceRolesBySpaceId, row.targetId, row.role);
      else if (row.targetType === 'folder')
        foldRole(lookup.folderRolesByFolderId, row.targetId, row.role);
      else if (row.targetType === 'document')
        foldRole(lookup.documentRolesByDocumentId, row.targetId, row.role);
    }
    for (const group of groupRows) {
      for (const cap of group.capabilities) lookup.capabilities.add(cap as Capability);
    }
  }

  return lookup;
}

// Standalone capability resolution for routes that don't build a full lookup.
export async function getMemberCapabilities(user: User | undefined): Promise<Set<Capability>> {
  if (!user) return new Set();
  if (isAdmin(user)) return new Set(ALL_CAPABILITIES);
  const groupIds = await listGroupIdsForMember(user.id);
  if (groupIds.length === 0) return new Set();
  const rows = await db
    .select({ capabilities: groups.capabilities })
    .from(groups)
    .where(inArray(groups.id, groupIds));
  const caps = new Set<Capability>();
  for (const row of rows) for (const cap of row.capabilities) caps.add(cap as Capability);
  return caps;
}

export function requireCapability(caps: Set<Capability>, cap: Capability) {
  if (!caps.has(cap)) throw forbidden('You do not have permission to perform this action.');
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
  const groupIds = await listGroupIdsForMember(user.id);
  return getMemberSpaceRole(user.id, spaceId, groupIds);
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
  // A trashed folder is no longer a writable target — its docs/children are restored through
  // the folder restore route, not by editing it.
  if (folder.deletedAt) throw notFound();
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

// Strict read: used by single-doc routes (requireDocumentRead / canEdit). Guest can never read
// via this path — the share link route is the only way for anonymous visitors to load a doc.
export function canReadDocumentWithLookup(
  user: User | undefined,
  doc: DocumentRow,
  lookup: PermissionLookup,
) {
  if (doc.deletedAt) return false;
  if (!user) return false;
  if (isAdmin(user) || doc.authorId === user.id) return true;
  if (lookup.spaceOwnerById.get(doc.spaceId) === user.id) return true;
  if (lookup.documentRolesByDocumentId.has(doc.id)) return true; // explicit per-doc grant
  if (doc.access === 'restricted') return false; // no inheritance
  return resolveInheritRole(doc, lookup) !== null;
}

// Directory visibility: used by the /spaces listing to decide whether a doc card is shown
// readable. A published doc is always visible (so guests can land on /share/:token via the
// directory); the actual read still requires the share token or a grant.
export function canSeeInDirectoryWithLookup(
  user: User | undefined,
  doc: DocumentRow,
  lookup: PermissionLookup,
) {
  if (doc.deletedAt) return false;
  if (lookup.publishedDocIds.has(doc.id)) return true;
  return canReadDocumentWithLookup(user, doc, lookup);
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

// Capability check only — kept for callers that need the cheap predicate. The full manager
// check (requireDocumentShareManager) gates on the `publish` capability first, so a doc
// author without publish still needs explicit membership in a publish-bearing group.
export function canManageDocumentShare(user: User | undefined, doc: DocumentRow) {
  if (doc.deletedAt) return false;
  if (!user) return false;
  return isAdmin(user) || doc.authorId === user.id;
}

export async function requireDocumentShareManager(user: User | undefined, docId: string) {
  if (!user) throw notFound();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), isNull(documents.deletedAt)));
  if (!doc) throw notFound();
  // Everyone managing a share must hold the `publish` capability (admin always does; others
  // must be in a group with it). This is the single rule that protects the public channel.
  const caps = await getMemberCapabilities(user);
  if (!caps.has('publish')) throw notFound();
  if (isAdmin(user) || doc.authorId === user.id) return doc;
  const lookup = await loadPermissionLookup(user);
  if (canEditDocumentWithLookup(user, doc, lookup)) return doc;
  throw notFound();
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

  // A member sees a space when EITHER (a) they hold a direct member-subject grant on it OR
  // (b) one of their groups does. `listEffectiveGrants` already unions those shapes; we just
  // need to dedupe by space id and join with the spaces table. Without the group-subject
  // branch, a member whose only access to a space is via a group grant would be able to
  // write into it but couldn't navigate to it in the directory.
  const groupIds = await listGroupIdsForMember(user.id);
  const effective = await listEffectiveGrants(user.id, groupIds);
  const spaceGrantIds = new Set<string>();
  for (const row of effective) {
    if (row.targetType === 'space') spaceGrantIds.add(row.targetId);
  }
  if (spaceGrantIds.size === 0) return [];
  return db
    .select()
    .from(spaces)
    .where(inArray(spaces.id, [...spaceGrantIds]));
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
    // Candidates: every live doc in the (optional) scope. The directory uses
    // `canSeeInDirectoryWithLookup` to drop non-published ones, so the wire only carries rows a
    // guest could actually open via /share/:token.
    const candidates = await db
      .select()
      .from(documents)
      .where(and(isNull(documents.deletedAt), ...spaceScope));
    const lookup = await loadPermissionLookup(undefined);
    return candidates.filter((doc) => canSeeInDirectoryWithLookup(undefined, doc, lookup));
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

// Same access check as publicDocumentByToken but WITHOUT bumping the view counter — used by the
// raw-HTML iframe endpoint, since the metadata fetch on the same page already counted the view.
export async function publicDocumentHtmlByToken(token: string) {
  const [row] = await db
    .select({ link: shareLinks, doc: documents })
    .from(shareLinks)
    .innerJoin(documents, eq(shareLinks.documentId, documents.id))
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
  return row.doc;
}

export function roleCanEdit(role: SpaceMemberRole | null) {
  return role === 'editor';
}
