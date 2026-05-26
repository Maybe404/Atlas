import {
  CreateDocumentSchema,
  extractHtmlMetadata,
  SetDocumentMemberRoleSchema,
  UpdateDocumentSchema,
  UpdateDocumentShareSchema,
} from '@atlas/shared';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documentMembers, documents, members, shareLinks, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { addDaysToIso, displayDate, nowIso } from '../lib/dates';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error';
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
import { validateHtmlForStorage } from '../lib/sanitize';
import { toPublicMember } from '../lib/serializers';

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
    purgeAfter: row.doc.purgeAfter,
  };
}

async function hydrateDoc(doc: typeof documents.$inferSelect) {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, doc.spaceId));
  const [author] = await db.select().from(members).where(eq(members.id, doc.authorId));
  return toDoc({ doc, space, author });
}

async function hydrateDocForUser(
  doc: typeof documents.$inferSelect,
  user: typeof members.$inferSelect | undefined,
) {
  return {
    ...(await hydrateDoc(doc)),
    canEdit: await canEditDocument(user, doc),
  };
}

export const documentsRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    const docs = await listReadableDocuments(user);
    const result = await Promise.all(docs.map((doc) => hydrateDoc(doc)));
    return c.json(result);
  })
  .get('/trash', async (c) => {
    const user = requireUser(c.get('user'));
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
        lastAccessedAt: row.link.lastAccessedAt,
        accessCount: row.link.accessCount,
      },
    });
  })
  .get('/:id', async (c) => {
    const user = c.get('user');
    const doc = await requireDocumentRead(user, c.req.param('id'));
    return c.json(await hydrateDocForUser(doc, user));
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    const body = CreateDocumentSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    const checkedHtml = validateHtmlForStorage(body.html);
    const metadata = extractHtmlMetadata(body.html, { fallbackTitle: body.title });
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      html: checkedHtml.html,
      dot: body.dot,
      tags: body.tags,
      skillVersion: body.skillVersion ?? '1.2.4',
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.create',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, title: body.title },
    });
    return c.json({ id, stored: { size: checkedHtml.size } }, 201);
  })
  .post('/upload', async (c) => {
    const user = requireUser(c.get('user'));
    const form = await c.req.formData();
    const file = form.get('file');
    const title = String(form.get('title') || '');
    const descText = String(form.get('desc') || '');
    const spaceId = String(form.get('spaceId') || '');
    const visibility = String(form.get('visibility') || 'private');

    if (!(file instanceof File)) throw badRequest('Upload requires a file field.');
    if (!/^text\/html\b/i.test(file.type || '') && !/\.html?$/i.test(file.name)) {
      throw badRequest('Only .html files can be uploaded.');
    }
    const html = await file.text();
    const metadata = extractHtmlMetadata(html, { fallbackTitle: title || file.name });
    const body = CreateDocumentSchema.parse({
      title: title || metadata.title || file.name.replace(/\.html?$/i, ''),
      desc: descText,
      spaceId,
      visibility,
      html,
      tags: ['uploaded'],
      dot: 'accent',
    });

    await requireSpaceEditor(user, body.spaceId);
    const checkedHtml = validateHtmlForStorage(body.html);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      html: checkedHtml.html,
      dot: body.dot,
      tags: body.tags,
      skillVersion: body.skillVersion ?? '1.2.4',
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.upload',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, filename: file.name },
    });

    return c.json({ id, filename: file.name, stored: { size: checkedHtml.size } }, 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
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
      patch.html = validateHtmlForStorage(body.html).html;
      const metadata = extractHtmlMetadata(body.html, { fallbackTitle: body.title ?? doc.title });
      if (body.title === undefined && metadata.title) patch.title = metadata.title;
      if (body.desc === undefined && metadata.summary) patch.desc = metadata.summary;
    }

    await db.update(documents).set(patch).where(eq(documents.id, doc.id));
    await writeAudit({
      actorId: user.id,
      action: 'document.update',
      targetType: 'document',
      targetId: doc.id,
      details: { fields: Object.keys(body) },
    });
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const deletedAt = nowIso();
    await db
      .update(documents)
      .set({
        deletedAt,
        deletedBy: user.id,
        purgeAfter: addDaysToIso(deletedAt, 30),
        updated: deletedAt,
      })
      .where(eq(documents.id, doc.id));
    await writeAudit({
      actorId: user.id,
      action: 'document.delete',
      targetType: 'document',
      targetId: doc.id,
      details: { purgeAfter: addDaysToIso(deletedAt, 30) },
    });
    return c.json({ ok: true });
  })
  .post('/:id/restore', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can restore deleted documents.');

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, c.req.param('id')));
    if (!doc) throw notFound();
    const [space] = await db.select().from(spaces).where(eq(spaces.id, doc.spaceId));
    if (!space) throw conflict('The original space no longer exists.');
    await db
      .update(documents)
      .set({ deletedAt: null, deletedBy: null, purgeAfter: null, updated: nowIso() })
      .where(eq(documents.id, doc.id));
    await writeAudit({
      actorId: user.id,
      action: 'document.restore',
      targetType: 'document',
      targetId: doc.id,
    });
    return c.json({ ok: true });
  })
  .delete('/:id/permanent', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can permanently delete documents.');
    const id = c.req.param('id');
    await db.delete(documents).where(eq(documents.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'document.permanent_delete',
      targetType: 'document',
      targetId: id,
    });
    return c.json({ ok: true });
  })
  .post('/trash/purge-expired', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can purge deleted documents.');
    const now = nowIso();
    const expired = await db
      .select()
      .from(documents)
      .where(and(isNotNull(documents.deletedAt), isNotNull(documents.purgeAfter)));
    const toPurge = expired.filter(
      (doc) => doc.purgeAfter && new Date(doc.purgeAfter).getTime() <= new Date(now).getTime(),
    );
    for (const doc of toPurge) {
      await db.delete(documents).where(eq(documents.id, doc.id));
    }
    await writeAudit({
      actorId: user.id,
      action: 'trash.purge_expired',
      targetType: 'trash',
      targetId: 'expired',
      details: { count: toPurge.length },
    });
    return c.json({ purged: toPurge.length });
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
            revokedAt: link.revokedAt,
            lastAccessedAt: link.lastAccessedAt,
            accessCount: link.accessCount,
          }
        : {
            enabled: false,
            token: null,
            url: null,
            showAuthor: true,
            allowIndexing: false,
            expiresAt: null,
            revokedAt: null,
            lastAccessedAt: null,
            accessCount: 0,
          },
      members: roster.map((row) => ({
        ...toPublicMember(row.member),
        role: row.membership.role,
      })),
    });
  })
  .patch('/:id/share', async (c) => {
    const user = requireUser(c.get('user'));
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
        revokedAt:
          body.publicEnabled === false
            ? nowIso()
            : body.publicEnabled === true
              ? null
              : (existing?.revokedAt ?? null),
        updatedAt: nowIso(),
      };
      if (existing) {
        await db
          .update(shareLinks)
          .set({ ...values, token: body.rotateToken ? makeToken() : existing.token })
          .where(eq(shareLinks.id, existing.id));
      } else {
        await db.insert(shareLinks).values({
          id: makeId('link'),
          documentId: doc.id,
          token: makeToken(),
          createdBy: user.id,
          ...values,
        });
      }
      await writeAudit({
        actorId: user.id,
        action: 'share.public_update',
        targetType: 'document',
        targetId: doc.id,
        details: {
          publicEnabled: body.publicEnabled,
          showAuthor: body.showAuthor,
          allowIndexing: body.allowIndexing,
          expiresAt: body.expiresAt,
          rotateToken: body.rotateToken,
        },
      });
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
        await writeAudit({
          actorId: user.id,
          action: 'share.member_update',
          targetType: 'document',
          targetId: doc.id,
          details: { memberId: parsed.memberId, role: parsed.role },
        });
      }
    }

    return c.json({ ok: true });
  })
  .put('/:id/members/:memberId', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const memberId = c.req.param('memberId');
    const body = SetDocumentMemberRoleSchema.parse({ ...(await c.req.json()), memberId });

    await db
      .delete(documentMembers)
      .where(
        and(eq(documentMembers.documentId, doc.id), eq(documentMembers.memberId, body.memberId)),
      );
    if (body.role) {
      await db.insert(documentMembers).values({
        documentId: doc.id,
        memberId: body.memberId,
        role: body.role,
      });
    }
    await writeAudit({
      actorId: user.id,
      action: 'document.member_update',
      targetType: 'document',
      targetId: doc.id,
      details: { memberId: body.memberId, role: body.role },
    });
    return c.json({ ok: true });
  });
