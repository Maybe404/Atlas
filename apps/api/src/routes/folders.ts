import { CreateFolderSchema, UpdateFolderSchema } from '@atlas/shared';
import { and, count, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documents, folders, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { addDaysToIso, displayDate, nowIso } from '../lib/dates';
import { badRequest, forbidden, notFound } from '../lib/http-error';
import { makeId } from '../lib/id';
import { isAdmin, requireFolderEditor, requireSpaceEditor } from '../lib/permissions';

type FolderRow = typeof folders.$inferSelect;
type DocRow = typeof documents.$inferSelect;

async function foldersInSpace(spaceId: string) {
  return db.select().from(folders).where(eq(folders.spaceId, spaceId));
}

// Reject a move that would put `folderId` inside its own subtree (or onto itself).
function wouldCycle(folderId: string, parentId: string, all: FolderRow[]) {
  const byId = new Map(all.map((f) => [f.id, f]));
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === folderId) return true;
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

// A folder id plus every descendant id, walking parentId pointers within `all`.
function subtreeIds(rootId: string, all: FolderRow[]): string[] {
  const childrenByParent = new Map<string, FolderRow[]>();
  for (const f of all) {
    if (!f.parentId) continue;
    childrenByParent.set(f.parentId, [...(childrenByParent.get(f.parentId) ?? []), f]);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === undefined) break;
    out.push(cur);
    for (const child of childrenByParent.get(cur) ?? []) stack.push(child.id);
  }
  return out;
}

export const foldersRouter = new Hono<AppEnv>()
  .get('/trash', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can view trash.');

    // Only trash roots (the folders the user actually deleted) surface as entries; cascade-deleted
    // descendants/docs are grouped under their root via trashedUnderFolderId.
    const roots = await db
      .select()
      .from(folders)
      .where(and(isNotNull(folders.deletedAt), isNull(folders.trashedUnderFolderId)))
      .orderBy(desc(folders.deletedAt));
    if (roots.length === 0) return c.json([]);

    const rootIds = roots.map((f) => f.id);
    const spaceIds = [...new Set(roots.map((f) => f.spaceId))];
    const [spaceRows, docRows, subRows] = await Promise.all([
      db.select().from(spaces).where(inArray(spaces.id, spaceIds)),
      db.select().from(documents).where(inArray(documents.trashedUnderFolderId, rootIds)),
      db.select().from(folders).where(inArray(folders.trashedUnderFolderId, rootIds)),
    ]);
    const spaceById = new Map(spaceRows.map((s) => [s.id, s]));
    const docsByRoot = new Map<string, DocRow[]>();
    for (const d of docRows) {
      const key = d.trashedUnderFolderId;
      if (!key) continue;
      docsByRoot.set(key, [...(docsByRoot.get(key) ?? []), d]);
    }
    const subCountByRoot = new Map<string, number>();
    for (const f of subRows) {
      const key = f.trashedUnderFolderId;
      if (!key) continue;
      subCountByRoot.set(key, (subCountByRoot.get(key) ?? 0) + 1);
    }

    return c.json(
      roots.map((f) => ({
        id: f.id,
        name: f.name,
        spaceId: f.spaceId,
        spaceName: spaceById.get(f.spaceId)?.name,
        deletedAt: f.deletedAt,
        purgeAfter: f.purgeAfter,
        subfolderCount: subCountByRoot.get(f.id) ?? 0,
        files: (docsByRoot.get(f.id) ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          format: d.format,
          updated: displayDate(d.updated),
        })),
      })),
    );
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    const body = CreateFolderSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    if (body.parentId) {
      const [parent] = await db.select().from(folders).where(eq(folders.id, body.parentId));
      if (!parent || parent.spaceId !== body.spaceId || parent.deletedAt)
        throw badRequest('Parent folder must belong to the same space.');
    }

    const id = makeId('f');
    await db.insert(folders).values({
      id,
      spaceId: body.spaceId,
      parentId: body.parentId ?? null,
      name: body.name,
      restricted: Boolean(body.restricted),
    });
    await writeAudit({
      actorId: user.id,
      action: 'folder.create',
      targetType: 'folder',
      targetId: id,
      details: { spaceId: body.spaceId, name: body.name, parentId: body.parentId ?? null },
    });
    return c.json({ id }, 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const id = c.req.param('id');
    const folder = await requireFolderEditor(user, id);
    const body = UpdateFolderSchema.parse(await c.req.json());
    if (Object.keys(body).length === 0) throw badRequest('No fields to update.');

    if (body.parentId !== undefined && body.parentId !== null) {
      if (body.parentId === id) throw badRequest('A folder cannot be its own parent.');
      const [parent] = await db.select().from(folders).where(eq(folders.id, body.parentId));
      if (!parent || parent.spaceId !== folder.spaceId || parent.deletedAt)
        throw badRequest('Parent folder must belong to the same space.');
      const all = await foldersInSpace(folder.spaceId);
      if (wouldCycle(id, body.parentId, all))
        throw badRequest('Cannot move a folder into its own subtree.');
    }

    const patch: Partial<typeof folders.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.parentId !== undefined) patch.parentId = body.parentId;
    if (body.restricted !== undefined) patch.restricted = body.restricted;
    if (body.order !== undefined) patch.order = body.order;

    await db.update(folders).set(patch).where(eq(folders.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'folder.update',
      targetType: 'folder',
      targetId: id,
      details: body,
    });
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const id = c.req.param('id');
    const folder = await requireFolderEditor(user, id);

    // Soft cascade: the folder, its descendant folders, and every live doc within go to trash.
    // folderId is left untouched, so a later restore re-reveals each file in its original place.
    const liveFolders = (await foldersInSpace(folder.spaceId)).filter((f) => !f.deletedAt);
    const ids = subtreeIds(id, liveFolders);
    const descendants = ids.filter((fid) => fid !== id);
    const deletedAt = nowIso();
    const purgeAfter = addDaysToIso(deletedAt, 30);

    const [docCountRow] = await db
      .select({ value: count() })
      .from(documents)
      .where(and(inArray(documents.folderId, ids), isNull(documents.deletedAt)));
    const docCount = docCountRow?.value ?? 0;

    await db
      .update(documents)
      .set({
        deletedAt,
        deletedBy: user.id,
        purgeAfter,
        trashedUnderFolderId: id,
        updated: deletedAt,
      })
      .where(and(inArray(documents.folderId, ids), isNull(documents.deletedAt)));
    await db
      .update(folders)
      .set({ deletedAt, deletedBy: user.id, purgeAfter, trashedUnderFolderId: null })
      .where(eq(folders.id, id));
    if (descendants.length > 0) {
      await db
        .update(folders)
        .set({ deletedAt, deletedBy: user.id, purgeAfter, trashedUnderFolderId: id })
        .where(inArray(folders.id, descendants));
    }

    await writeAudit({
      actorId: user.id,
      action: 'folder.delete',
      targetType: 'folder',
      targetId: id,
      details: { folders: ids.length, docs: docCount, purgeAfter },
    });
    return c.json({ ok: true, folders: ids.length, docs: docCount });
  })
  .post('/:id/restore', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can restore folders.');
    const id = c.req.param('id');
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    // Only a trashed root can be restored (cascade descendants restore alongside it).
    if (!folder?.deletedAt || folder.trashedUnderFolderId) throw notFound();

    // If the original parent is gone or still trashed, restore to the space root to avoid orphaning.
    let parentId = folder.parentId;
    if (parentId) {
      const [parent] = await db.select().from(folders).where(eq(folders.id, parentId));
      if (!parent || parent.deletedAt) parentId = null;
    }

    await db
      .update(folders)
      .set({
        deletedAt: null,
        deletedBy: null,
        purgeAfter: null,
        trashedUnderFolderId: null,
        parentId,
      })
      .where(eq(folders.id, id));
    await db
      .update(folders)
      .set({ deletedAt: null, deletedBy: null, purgeAfter: null, trashedUnderFolderId: null })
      .where(eq(folders.trashedUnderFolderId, id));
    await db
      .update(documents)
      .set({
        deletedAt: null,
        deletedBy: null,
        purgeAfter: null,
        trashedUnderFolderId: null,
        updated: nowIso(),
      })
      .where(eq(documents.trashedUnderFolderId, id));

    await writeAudit({
      actorId: user.id,
      action: 'folder.restore',
      targetType: 'folder',
      targetId: id,
    });
    return c.json({ ok: true });
  })
  .delete('/:id/permanent', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can permanently delete folders.');
    const id = c.req.param('id');
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    // Only a trashed root can be purged; this is not a hard-delete shortcut for live folders.
    if (!folder?.deletedAt || folder.trashedUnderFolderId) throw notFound();

    await db.delete(documents).where(eq(documents.trashedUnderFolderId, id));
    await db.delete(folders).where(eq(folders.trashedUnderFolderId, id));
    await db.delete(folders).where(eq(folders.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'folder.permanent_delete',
      targetType: 'folder',
      targetId: id,
    });
    return c.json({ ok: true });
  });
