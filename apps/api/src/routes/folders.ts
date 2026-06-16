import { CreateFolderSchema, UpdateFolderSchema } from '@atlas/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documents, folders } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { badRequest, conflict } from '../lib/http-error';
import { makeId } from '../lib/id';
import { requireFolderEditor, requireSpaceEditor } from '../lib/permissions';

type FolderRow = typeof folders.$inferSelect;

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

export const foldersRouter = new Hono<AppEnv>()
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    const body = CreateFolderSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    if (body.parentId) {
      const [parent] = await db.select().from(folders).where(eq(folders.id, body.parentId));
      if (!parent || parent.spaceId !== body.spaceId)
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
      if (!parent || parent.spaceId !== folder.spaceId)
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
    await requireFolderEditor(user, id);

    const [subRows] = await db
      .select({ value: count() })
      .from(folders)
      .where(eq(folders.parentId, id));
    if ((subRows?.value ?? 0) > 0)
      throw conflict('This folder still contains subfolders. Move or delete them first.');

    const [docRows] = await db
      .select({ value: count() })
      .from(documents)
      .where(and(eq(documents.folderId, id), isNull(documents.deletedAt)));
    if ((docRows?.value ?? 0) > 0)
      throw conflict('This folder still contains documents. Move them out first.');

    await db.delete(folders).where(eq(folders.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'folder.delete',
      targetType: 'folder',
      targetId: id,
    });
    return c.json({ ok: true });
  });
