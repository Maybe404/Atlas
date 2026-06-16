import {
  BatchSetSpaceMemberRolesSchema,
  CreateSpaceSchema,
  SetSpaceMemberRoleSchema,
  UpdateSpaceSchema,
} from '@atlas/shared';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { auditLogs, documents, members, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { displayDate } from '../lib/dates';
import { listSpaceMemberGrants, removeGrantsForTarget, setMemberSpaceRole } from '../lib/grants';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error';
import { makeId } from '../lib/id';
import {
  canEditDocumentWithLookup,
  canReadDocumentWithLookup,
  getSpaceRoleFromLookup,
  isAdmin,
  listDirectoryDocuments,
  listReadableSpaces,
  loadPermissionLookup,
  type PermissionLookup,
  requireSpaceAccess,
} from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

type User = typeof members.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

async function requireSpaceById(id: string) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, id));
  if (!space) throw notFound();
  return space;
}

function toDoc(doc: DocumentRow, author?: User | null, options: { canRead?: boolean } = {}) {
  return {
    id: doc.id,
    spaceId: doc.spaceId,
    title: doc.title,
    desc: doc.desc,
    author: doc.authorId,
    authorName: author?.name,
    updated: displayDate(doc.updated),
    visibility: doc.visibility,
    format: doc.format,
    dot: doc.dot,
    tags: doc.tags,
    deletedAt: doc.deletedAt,
    canRead: options.canRead ?? false,
    locked: false,
  };
}

function toLockedDoc(doc: DocumentRow) {
  return {
    id: doc.id,
    spaceId: doc.spaceId,
    title: doc.title,
    locked: true,
    canRead: false,
    canEdit: false,
  };
}

async function authorsByIdFor(docs: DocumentRow[]) {
  const authorIds = [...new Set(docs.map((doc) => doc.authorId))];
  if (authorIds.length === 0) return new Map<string, User>();
  const rows = await db.select().from(members).where(inArray(members.id, authorIds));
  return new Map(rows.map((author) => [author.id, author]));
}

function buildChildren(
  user: User | undefined,
  docs: DocumentRow[],
  authorsById: Map<string, User>,
  lookup: PermissionLookup,
) {
  return docs.map((doc) => {
    const canRead = canReadDocumentWithLookup(user, doc, lookup);
    if (!canRead) return toLockedDoc(doc);

    return {
      ...toDoc(doc, authorsById.get(doc.authorId), { canRead: true }),
      canEdit: canEditDocumentWithLookup(user, doc, lookup),
    };
  });
}

async function spaceWithChildren(user: User | undefined, sp: SpaceRow, lookup: PermissionLookup) {
  const docs = await listDirectoryDocuments(user, sp);
  const authorsById = await authorsByIdFor(docs);
  const children = buildChildren(user, docs, authorsById, lookup);
  return {
    ...sp,
    count: children.length,
    children,
    role: getSpaceRoleFromLookup(user, lookup, sp.id),
  };
}

export const spacesRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    const lookup = await loadPermissionLookup(user);
    const membershipSpaces = await listReadableSpaces(user);
    const directoryDocs = await listDirectoryDocuments(user);
    const readableSpaceIds = new Set([
      ...membershipSpaces.map((sp) => sp.id),
      ...directoryDocs.map((doc) => doc.spaceId),
    ]);
    const allSpaces = isAdmin(user) ? membershipSpaces : await db.select().from(spaces);
    const readableSpaces = allSpaces.filter((sp) => readableSpaceIds.has(sp.id));
    const authorsById = await authorsByIdFor(directoryDocs);
    const docsBySpaceId = new Map<string, DocumentRow[]>();

    for (const doc of directoryDocs) {
      const existing = docsBySpaceId.get(doc.spaceId) ?? [];
      existing.push(doc);
      docsBySpaceId.set(doc.spaceId, existing);
    }

    const result = readableSpaces.map((sp) => {
      const children = buildChildren(user, docsBySpaceId.get(sp.id) ?? [], authorsById, lookup);
      return {
        ...sp,
        count: children.length,
        children,
        role: getSpaceRoleFromLookup(user, lookup, sp.id),
      };
    });
    return c.json(result);
  })
  .get('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const sp = await requireSpaceById(id);
    const lookup = await loadPermissionLookup(user);
    const result = await spaceWithChildren(user, sp, lookup);
    if (!result.role && result.children.length === 0) throw notFound();
    return c.json(result);
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can create spaces.');

    const body = CreateSpaceSchema.parse(await c.req.json());
    const id = makeId('s');
    await db.insert(spaces).values({
      id,
      name: body.name,
      mark: body.name.slice(0, 1),
      accent: body.accent,
      personal: Boolean(body.personal),
    });
    await setMemberSpaceRole(db, user.id, id, 'editor');
    await writeAudit({
      actorId: user.id,
      action: 'space.create',
      targetType: 'space',
      targetId: id,
      details: { name: body.name, accent: body.accent },
    });
    return c.json({ id }, 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const id = c.req.param('id');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can update spaces.');
    await requireSpaceById(id);

    const body = UpdateSpaceSchema.parse(await c.req.json());
    if (Object.keys(body).length === 0) throw badRequest('No fields to update.');
    const patch: Partial<typeof spaces.$inferInsert> = { ...body };
    if (body.name) patch.mark = body.name.slice(0, 1);
    await db.update(spaces).set(patch).where(eq(spaces.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'space.update',
      targetType: 'space',
      targetId: id,
      details: body,
    });
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const id = c.req.param('id');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can delete spaces.');
    await requireSpaceById(id);
    await requireSpaceAccess(user, id);

    // Deleting a space cascades to a hard delete of every document it holds (bypassing trash),
    // so refuse while the space still contains live documents.
    const liveDocumentRows = await db
      .select({ value: count() })
      .from(documents)
      .where(and(eq(documents.spaceId, id), isNull(documents.deletedAt)));
    const liveDocuments = liveDocumentRows[0]?.value ?? 0;
    if (liveDocuments > 0) {
      throw conflict(
        `This space still contains ${liveDocuments} document(s). Move or delete them before removing the space.`,
      );
    }

    await removeGrantsForTarget(db, 'space', id);
    await db.delete(spaces).where(eq(spaces.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'space.delete',
      targetType: 'space',
      targetId: id,
    });
    return c.json({ ok: true });
  })
  .get('/:id/members', async (c) => {
    const user = requireUser(c.get('user'));
    const spaceId = c.req.param('id');
    await requireSpaceById(spaceId);
    await requireSpaceAccess(user, spaceId);

    const grantRows = await listSpaceMemberGrants(spaceId);
    if (grantRows.length === 0) return c.json([]);
    const memberRows = await db
      .select()
      .from(members)
      .where(
        inArray(
          members.id,
          grantRows.map((row) => row.memberId),
        ),
      );
    const roleByMemberId = new Map(grantRows.map((row) => [row.memberId, row.role]));

    return c.json(
      memberRows.map((member) => ({
        ...toPublicMember(member),
        spaceRole: roleByMemberId.get(member.id),
      })),
    );
  })
  .put('/:id/members', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can change space permissions.');

    const spaceId = c.req.param('id');
    await requireSpaceById(spaceId);
    await requireSpaceAccess(user, spaceId);
    const body = BatchSetSpaceMemberRolesSchema.parse(await c.req.json());
    const updates = [...new Map(body.updates.map((item) => [item.memberId, item])).values()];
    const memberIds = updates.map((item) => item.memberId);
    const existingMembers = await db
      .select({ id: members.id })
      .from(members)
      .where(inArray(members.id, memberIds));
    const existingMemberIds = new Set(existingMembers.map((member) => member.id));
    const missingMemberId = memberIds.find((memberId) => !existingMemberIds.has(memberId));
    if (missingMemberId) throw notFound('Member not found.');

    await db.transaction(async (tx) => {
      for (const update of updates) {
        await setMemberSpaceRole(tx, update.memberId, spaceId, update.role);
        await tx.insert(auditLogs).values({
          id: makeId('audit'),
          actorId: user.id,
          action: 'space.member_update',
          targetType: 'space',
          targetId: spaceId,
          details: { memberId: update.memberId, role: update.role },
        });
      }
    });

    return c.json({ ok: true, updated: updates.length });
  })
  .put('/:id/members/:memberId', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can change space permissions.');

    const spaceId = c.req.param('id');
    const memberId = c.req.param('memberId');
    await requireSpaceById(spaceId);
    await requireSpaceAccess(user, spaceId);
    const body = SetSpaceMemberRoleSchema.parse({ ...(await c.req.json()), memberId });
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, body.memberId));
    if (!member) throw notFound('Member not found.');

    await db.transaction(async (tx) => {
      await setMemberSpaceRole(tx, body.memberId, spaceId, body.role);
      await tx.insert(auditLogs).values({
        id: makeId('audit'),
        actorId: user.id,
        action: 'space.member_update',
        targetType: 'space',
        targetId: spaceId,
        details: { memberId: body.memberId, role: body.role },
      });
    });

    return c.json({ ok: true });
  });
