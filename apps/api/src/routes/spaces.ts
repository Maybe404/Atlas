import { CreateSpaceSchema, SetSpaceMemberRoleSchema, UpdateSpaceSchema } from '@atlas/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { type documents, members, spaceMembers, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { displayDate } from '../lib/dates';
import { forbidden, notFound } from '../lib/http-error';
import { makeId } from '../lib/id';
import {
  canEditDocument,
  canReadDocument,
  getSpaceRole,
  isAdmin,
  listDirectoryDocuments,
  listReadableSpaces,
  requireSpaceAccess,
  requireSpaceEditor,
} from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

function toDoc(
  doc: typeof documents.$inferSelect,
  author?: typeof members.$inferSelect | null,
  options: { includeHtml?: boolean; canRead?: boolean } = {},
) {
  return {
    id: doc.id,
    spaceId: doc.spaceId,
    title: doc.title,
    desc: doc.desc,
    author: doc.authorId,
    authorName: author?.name,
    updated: displayDate(doc.updated),
    visibility: doc.visibility,
    dot: doc.dot,
    tags: doc.tags,
    ...(options.includeHtml ? { html: doc.html } : {}),
    deletedAt: doc.deletedAt,
    canRead: options.canRead ?? false,
  };
}

async function childrenForSpace(
  user: typeof members.$inferSelect | undefined,
  space: typeof spaces.$inferSelect,
) {
  const docs = await listDirectoryDocuments(user, space);
  return Promise.all(
    docs.map(async (doc) => {
      const [author] = await db.select().from(members).where(eq(members.id, doc.authorId));
      const canRead = await canReadDocument(user, doc);
      return {
        ...toDoc(doc, author, { includeHtml: canRead, canRead }),
        canEdit: await canEditDocument(user, doc),
      };
    }),
  );
}

export const spacesRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    const membershipSpaces = await listReadableSpaces(user);
    const readableDocs = await listDirectoryDocuments(user);
    const readableSpaceIds = new Set([
      ...membershipSpaces.map((sp) => sp.id),
      ...readableDocs.map((doc) => doc.spaceId),
    ]);
    const allSpaces = isAdmin(user) ? membershipSpaces : await db.select().from(spaces);
    const readableSpaces = allSpaces.filter((sp) => readableSpaceIds.has(sp.id));
    const result = await Promise.all(
      readableSpaces.map(async (sp) => {
        const children = await childrenForSpace(user, sp);
        return {
          ...sp,
          count: children.length,
          children,
          role: await getSpaceRole(user, sp.id),
        };
      }),
    );
    return c.json(result);
  })
  .get('/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const [sp] = await db.select().from(spaces).where(eq(spaces.id, id));
    if (!sp) throw notFound();
    const children = await childrenForSpace(user, sp);
    const role = await getSpaceRole(user, id);
    if (!role && children.length === 0) throw notFound();
    return c.json({ ...sp, count: children.length, children, role });
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
    await db.insert(spaceMembers).values({ spaceId: id, memberId: user.id, role: 'editor' });
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
    await requireSpaceEditor(user, id);

    const body = UpdateSpaceSchema.parse(await c.req.json());
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
    await requireSpaceAccess(user, id);
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
    await requireSpaceAccess(user, spaceId);

    const rows = await db
      .select({ member: members, membership: spaceMembers })
      .from(spaceMembers)
      .innerJoin(members, eq(spaceMembers.memberId, members.id))
      .where(eq(spaceMembers.spaceId, spaceId));

    return c.json(
      rows.map((row) => ({
        ...toPublicMember(row.member),
        spaceRole: row.membership.role,
      })),
    );
  })
  .put('/:id/members/:memberId', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can change space permissions.');

    const spaceId = c.req.param('id');
    const memberId = c.req.param('memberId');
    await requireSpaceAccess(user, spaceId);
    const body = SetSpaceMemberRoleSchema.parse({ ...(await c.req.json()), memberId });

    await db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.memberId, body.memberId)));

    if (body.role) {
      await db.insert(spaceMembers).values({ spaceId, memberId: body.memberId, role: body.role });
    }
    await writeAudit({
      actorId: user.id,
      action: 'space.member_update',
      targetType: 'space',
      targetId: spaceId,
      details: { memberId: body.memberId, role: body.role },
    });

    return c.json({ ok: true });
  });
