import {
  CreateDocumentSchema,
  SetDocumentMemberRoleSchema,
  UpdateDocumentSchema,
  UpdateDocumentShareSchema,
} from '@atlas/shared';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documentMembers, documents, members, shareLinks, spaces } from '../db/schema';
import type { AppEnv } from '../lib/auth';
import { displayDate, nowIso } from '../lib/dates';
import { badRequest, forbidden, notFound } from '../lib/http-error';
import { makeId, makeToken } from '../lib/id';
import {
  canEditDocument,
  isAdmin,
  listReadableDocuments,
  publicDocumentByToken,
  requireDocumentEditor,
  requireDocumentRead,
  requireSpaceEditor,
} from '../lib/permissions';
import { sanitizeHtml } from '../lib/sanitize';

function toDoc(row: {
  doc: typeof documents.$inferSelect;
  space?: typeof spaces.$inferSelect | null;
  author?: typeof members.$inferSelect | null;
}) {
  return {
    id: row.doc.id,
    spaceId: row.doc.spaceId,
    spaceName: row.space?.name,
    spaceAccent: row.space?.accent,
    title: row.doc.title,
    desc: row.doc.desc,
    author: row.doc.authorId,
    authorName: row.author?.name,
    updated: displayDate(row.doc.updated),
    visibility: row.doc.visibility,
    dot: row.doc.dot,
    tags: row.doc.tags,
    html: row.doc.html,
    skillVersion: row.doc.skillVersion,
    deletedAt: row.doc.deletedAt,
  };
}

async function hydrateDoc(doc: typeof documents.$inferSelect) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, doc.spaceId));
  const [author] = await db.select().from(members).where(eq(members.id, doc.authorId));
  return toDoc({ doc, space, author });
}

export const documentsRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    const docs = await listReadableDocuments(user);
    const result = await Promise.all(docs.map((doc) => hydrateDoc(doc)));
    return c.json(result);
  })
  .get('/trash', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can view trash.');

    const rows = await db
      .select({ doc: documents, space: spaces, author: members })
      .from(documents)
      .innerJoin(spaces, eq(documents.spaceId, spaces.id))
      .innerJoin(members, eq(documents.authorId, members.id))
      .where(isNotNull(documents.deletedAt))
      .orderBy(desc(documents.deletedAt));

    return c.json(rows.map((row) => toDoc(row)));
  })
  .get('/public/:token', async (c) => {
    const row = await publicDocumentByToken(c.req.param('token'));
    return c.json({
      ...toDoc({ doc: row.doc, space: row.space, author: row.link.showAuthor ? row.author : null }),
      publicLink: {
        token: row.link.token,
        allowIndexing: row.link.allowIndexing,
        expiresAt: row.link.expiresAt,
      },
    });
  })
  .get('/:id', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentRead(user, c.req.param('id'));
    return c.json(await hydrateDoc(doc));
  })
  .post('/', async (c) => {
    const user = c.get('user');
    const body = CreateDocumentSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    const sanitized = sanitizeHtml(body.html);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc,
      visibility: body.visibility,
      html: sanitized.html,
      dot: body.dot,
      tags: body.tags,
      skillVersion: body.skillVersion ?? '1.2.4',
      updated: nowIso(),
    });
    return c.json({ id, sanitized: { removed: sanitized.removed } }, 201);
  })
  .post('/upload', async (c) => {
    const user = c.get('user');
    const form = await c.req.formData();
    const file = form.get('file');
    const title = String(form.get('title') || '');
    const descText = String(form.get('desc') || '');
    const spaceId = String(form.get('spaceId') || '');
    const visibility = String(form.get('visibility') || 'private');

    if (!(file instanceof File)) throw badRequest('Upload requires a file field.');
    const body = CreateDocumentSchema.parse({
      title: title || file.name.replace(/\.html?$/i, ''),
      desc: descText,
      spaceId,
      visibility,
      html: await file.text(),
      tags: ['uploaded'],
      dot: 'accent',
    });

    await requireSpaceEditor(user, body.spaceId);
    const sanitized = sanitizeHtml(body.html);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc,
      visibility: body.visibility,
      html: sanitized.html,
      dot: body.dot,
      tags: body.tags,
      skillVersion: body.skillVersion ?? '1.2.4',
      updated: nowIso(),
    });

    return c.json({ id, filename: file.name, sanitized: { removed: sanitized.removed } }, 201);
  })
  .patch('/:id', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const body = UpdateDocumentSchema.parse(await c.req.json());

    if (body.spaceId && body.spaceId !== doc.spaceId) {
      await requireSpaceEditor(user, body.spaceId);
    }

    const patch: Partial<typeof documents.$inferInsert> = {
      updated: nowIso(),
    };
    if (body.spaceId !== undefined) patch.spaceId = body.spaceId;
    if (body.title !== undefined) patch.title = body.title;
    if (body.desc !== undefined) patch.desc = body.desc;
    if (body.visibility !== undefined) patch.visibility = body.visibility;
    if (body.dot !== undefined) patch.dot = body.dot;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.skillVersion !== undefined) patch.skillVersion = body.skillVersion;
    if (body.html !== undefined) {
      patch.html = sanitizeHtml(body.html).html;
    }

    await db.update(documents).set(patch).where(eq(documents.id, doc.id));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    await db
      .update(documents)
      .set({ deletedAt: nowIso(), deletedBy: user.id, updated: nowIso() })
      .where(eq(documents.id, doc.id));
    return c.json({ ok: true });
  })
  .post('/:id/restore', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can restore deleted documents.');

    const [doc] = await db.select().from(documents).where(eq(documents.id, c.req.param('id')));
    if (!doc) throw notFound();
    await db
      .update(documents)
      .set({ deletedAt: null, deletedBy: null, updated: nowIso() })
      .where(eq(documents.id, doc.id));
    return c.json({ ok: true });
  })
  .delete('/:id/permanent', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can permanently delete documents.');
    await db.delete(documents).where(eq(documents.id, c.req.param('id')));
    return c.json({ ok: true });
  })
  .get('/:id/share', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentRead(user, c.req.param('id'));
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.documentId, doc.id));
    const roster = await db
      .select({ membership: documentMembers, member: members })
      .from(documentMembers)
      .innerJoin(members, eq(documentMembers.memberId, members.id))
      .where(eq(documentMembers.documentId, doc.id));

    return c.json({
      documentId: doc.id,
      canEdit: await canEditDocument(user, doc),
      public: link
        ? {
            enabled: link.enabled,
            token: link.token,
            url: `/public/${link.token}`,
            showAuthor: link.showAuthor,
            allowIndexing: link.allowIndexing,
            expiresAt: link.expiresAt,
          }
        : {
            enabled: false,
            token: null,
            url: null,
            showAuthor: true,
            allowIndexing: false,
            expiresAt: null,
          },
      members: roster.map((row) => ({
        ...row.member,
        role: row.membership.role,
      })),
    });
  })
  .patch('/:id/share', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const body = UpdateDocumentShareSchema.parse(await c.req.json());
    const [existing] = await db.select().from(shareLinks).where(eq(shareLinks.documentId, doc.id));

    if (
      body.publicEnabled !== undefined ||
      body.showAuthor !== undefined ||
      body.allowIndexing !== undefined ||
      body.expiresAt !== undefined
    ) {
      const values = {
        enabled: body.publicEnabled ?? existing?.enabled ?? false,
        showAuthor: body.showAuthor ?? existing?.showAuthor ?? true,
        allowIndexing: body.allowIndexing ?? existing?.allowIndexing ?? false,
        expiresAt: body.expiresAt === undefined ? (existing?.expiresAt ?? null) : body.expiresAt,
        updatedAt: nowIso(),
      };
      if (existing) {
        await db.update(shareLinks).set(values).where(eq(shareLinks.id, existing.id));
      } else {
        await db.insert(shareLinks).values({
          id: makeId('link'),
          documentId: doc.id,
          token: makeToken(),
          createdBy: user.id,
          ...values,
        });
      }
    }

    if (body.members) {
      for (const item of body.members) {
        const parsed = SetDocumentMemberRoleSchema.parse(item);
        await db
          .delete(documentMembers)
          .where(
            and(
              eq(documentMembers.documentId, doc.id),
              eq(documentMembers.memberId, parsed.memberId),
            ),
          );
        if (parsed.role) {
          await db.insert(documentMembers).values({
            documentId: doc.id,
            memberId: parsed.memberId,
            role: parsed.role,
          });
        }
      }
    }

    return c.json({ ok: true });
  })
  .put('/:id/members/:memberId', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const memberId = c.req.param('memberId');
    const body = SetDocumentMemberRoleSchema.parse({ ...(await c.req.json()), memberId });

    await db
      .delete(documentMembers)
      .where(and(eq(documentMembers.documentId, doc.id), eq(documentMembers.memberId, body.memberId)));
    if (body.role) {
      await db.insert(documentMembers).values({
        documentId: doc.id,
        memberId: body.memberId,
        role: body.role,
      });
    }
    return c.json({ ok: true });
  });
