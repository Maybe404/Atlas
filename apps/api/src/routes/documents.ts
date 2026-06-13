import {
  CreateDocumentSchema,
  extractHtmlMetadata,
  extractMarkdownMetadata,
  SetDocumentMemberRoleSchema,
  UpdateDocumentSchema,
  UpdateDocumentShareSchema,
} from '@atlas/shared';
import { and, desc, eq, inArray, isNotNull, like, lte, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { auditLogs, documentMembers, documents, members, shareLinks, spaces } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { addDaysToIso, displayDate, nowIso } from '../lib/dates';
import { validateContentForStorage } from '../lib/html-limits';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error';
import { makeId, makeToken } from '../lib/id';
import {
  canEditDocumentWithLookup,
  isAdmin,
  listReadableDocuments,
  loadPermissionLookup,
  type PermissionLookup,
  publicDocumentByToken,
  requireDocumentEditor,
  requireDocumentRead,
  requireDocumentShareManager,
  requireSpaceEditor,
} from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

type User = typeof members.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

type ToDocOptions = {
  includeHtml?: boolean;
  canRead?: boolean;
  canEdit?: boolean;
};

function toDoc(
  row: {
    doc: DocumentRow;
    space?: SpaceRow | null;
    author?: User | null;
  },
  options: ToDocOptions = {},
) {
  const includeHtml = options.includeHtml ?? true;
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
    format: row.doc.format,
    dot: row.doc.dot,
    tags: row.doc.tags,
    ...(includeHtml ? { html: row.doc.html } : {}),
    deletedAt: row.doc.deletedAt,
    purgeAfter: row.doc.purgeAfter,
    ...(options.canRead !== undefined ? { canRead: options.canRead } : {}),
    ...(options.canEdit !== undefined ? { canEdit: options.canEdit } : {}),
  };
}

function extractMetadata(format: 'html' | 'markdown', content: string, fallbackTitle: string) {
  return format === 'markdown'
    ? extractMarkdownMetadata(content, { fallbackTitle })
    : extractHtmlMetadata(content, { fallbackTitle });
}

async function hydrateDocs(
  docs: DocumentRow[],
  options: ToDocOptions & { user?: User; lookup?: PermissionLookup } = {},
) {
  const spaceIds = [...new Set(docs.map((doc) => doc.spaceId))];
  const authorIds = [...new Set(docs.map((doc) => doc.authorId))];
  const [spaceRows, authorRows] = await Promise.all([
    spaceIds.length ? db.select().from(spaces).where(inArray(spaces.id, spaceIds)) : [],
    authorIds.length ? db.select().from(members).where(inArray(members.id, authorIds)) : [],
  ]);
  const spacesById = new Map(spaceRows.map((space) => [space.id, space]));
  const authorsById = new Map(authorRows.map((author) => [author.id, author]));

  return docs.map((doc) =>
    toDoc(
      { doc, space: spacesById.get(doc.spaceId), author: authorsById.get(doc.authorId) },
      {
        ...options,
        canEdit:
          options.lookup && options.user
            ? canEditDocumentWithLookup(options.user, doc, options.lookup)
            : options.canEdit,
      },
    ),
  );
}

async function hydrateDoc(
  doc: DocumentRow,
  options: ToDocOptions & { user?: User; lookup?: PermissionLookup } = {},
) {
  const [hydrated] = await hydrateDocs([doc], options);
  return hydrated;
}

function publicShareUrl(token: string | null | undefined) {
  return token ? `/share/${token}` : null;
}

export const documentsRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    const docs = await listReadableDocuments(user);
    const lookup = await loadPermissionLookup(user);
    return c.json(await hydrateDocs(docs, { includeHtml: false, canRead: true, user, lookup }));
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
    const lookup = await loadPermissionLookup(user);
    return c.json(await hydrateDoc(doc, { canRead: true, user, lookup }));
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    const body = CreateDocumentSchema.parse(await c.req.json());
    await requireSpaceEditor(user, body.spaceId);

    const checked = validateContentForStorage(body.html);
    const metadata = extractMetadata(body.format, body.html, body.title);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title || metadata.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      format: body.format,
      html: checked.content,
      dot: body.dot,
      tags: body.tags,
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.create',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, title: body.title, format: body.format },
    });
    return c.json({ id, stored: { size: checked.size } }, 201);
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
    const isMarkdown =
      /\.(md|markdown)$/i.test(file.name) || /^text\/(x-)?markdown\b/i.test(file.type || '');
    const isHtml = /\.html?$/i.test(file.name) || /^text\/html\b/i.test(file.type || '');
    if (!isMarkdown && !isHtml) {
      throw badRequest('只支持上传 .html 或 .md 文件。');
    }
    const format: 'html' | 'markdown' = isMarkdown ? 'markdown' : 'html';
    const content = await file.text();
    const metadata = extractMetadata(
      format,
      content,
      title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
    );
    const body = CreateDocumentSchema.parse({
      title: title || metadata.title || file.name.replace(/\.(md|markdown|html?)$/i, ''),
      desc: descText,
      spaceId,
      visibility,
      format,
      html: content,
      tags: ['uploaded'],
      dot: 'accent',
    });

    await requireSpaceEditor(user, body.spaceId);
    const checked = validateContentForStorage(body.html);
    const id = makeId('d');
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: user.id,
      title: body.title,
      desc: body.desc || metadata.summary,
      visibility: body.visibility,
      format: body.format,
      html: checked.content,
      dot: body.dot,
      tags: body.tags,
      updated: nowIso(),
    });
    await writeAudit({
      actorId: user.id,
      action: 'document.upload',
      targetType: 'document',
      targetId: id,
      details: { spaceId: body.spaceId, filename: file.name, format },
    });

    return c.json({ id, filename: file.name, stored: { size: checked.size } }, 201);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const body = UpdateDocumentSchema.parse(await c.req.json());
    if (Object.keys(body).length === 0) throw badRequest('No fields to update.');

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
    if (body.html !== undefined) {
      patch.html = validateContentForStorage(body.html).content;
      const format = body.format ?? doc.format;
      if (body.format !== undefined) patch.format = body.format;
      const metadata = extractMetadata(format, body.html, body.title ?? doc.title);
      if (body.title === undefined && metadata.title) patch.title = metadata.title;
      if (body.desc === undefined && metadata.summary) patch.desc = metadata.summary;
    } else if (body.format !== undefined) {
      patch.format = body.format;
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
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    // Only documents already in the trash can be permanently removed; this is not a hard-delete
    // shortcut for live documents.
    if (!doc?.deletedAt) throw notFound();
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
    const toPurge = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          isNotNull(documents.deletedAt),
          isNotNull(documents.purgeAfter),
          lte(documents.purgeAfter, now),
        ),
      );
    if (toPurge.length > 0) {
      await db
        .delete(documents)
        .where(
          and(
            isNotNull(documents.deletedAt),
            isNotNull(documents.purgeAfter),
            lte(documents.purgeAfter, now),
          ),
        );
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
    const doc = await requireDocumentShareManager(user, c.req.param('id'));

    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.documentId, doc.id));
    const roster = await db
      .select({ membership: documentMembers, member: members })
      .from(documentMembers)
      .innerJoin(members, eq(documentMembers.memberId, members.id))
      .where(eq(documentMembers.documentId, doc.id));

    return c.json({
      documentId: doc.id,
      visibility: doc.visibility,
      canEdit: true,
      canManage: true,
      public: link
        ? {
            enabled: link.enabled,
            token: link.token,
            url: publicShareUrl(link.token),
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
  .get('/:id/share/members', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentShareManager(user, c.req.param('id'));
    const q = (c.req.query('q') ?? '').trim();
    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 8) || 8, 1), 20);
    const roster = await db
      .select({ memberId: documentMembers.memberId })
      .from(documentMembers)
      .where(eq(documentMembers.documentId, doc.id));
    const excludedIds = new Set([user.id, ...roster.map((row) => row.memberId)]);
    const filters = q
      ? [or(like(members.name, `%${q}%`), like(members.email, `%${q.toLowerCase()}%`))]
      : [];
    const rows = await db
      .select()
      .from(members)
      .where(and(...filters, ne(members.id, user.id)))
      .limit(limit + excludedIds.size);
    const candidates = rows.filter((member) => !excludedIds.has(member.id)).slice(0, limit);

    return c.json(candidates.map(toPublicMember));
  })
  .patch('/:id/share', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentShareManager(user, c.req.param('id'));
    const body = UpdateDocumentShareSchema.parse(await c.req.json());
    const memberUpdates = body.members
      ? [...new Map(body.members.map((item) => [item.memberId, item])).values()]
      : [];

    // Private documents are only reachable by admins and the author, so granting a document
    // member would create access that the permission layer never honors. Reject it instead of
    // silently writing a no-op membership. (Removing members — role: null — stays allowed.)
    if (doc.visibility === 'private' && memberUpdates.some((item) => item.role)) {
      throw badRequest(
        'Private documents cannot be shared with members. Set the document to invite-only first.',
      );
    }

    const memberIds = memberUpdates.map((item) => item.memberId);
    if (memberIds.length > 0) {
      const existingMembers = await db
        .select({ id: members.id })
        .from(members)
        .where(inArray(members.id, memberIds));
      const existingMemberIds = new Set(existingMembers.map((member) => member.id));
      const missingMemberId = memberIds.find((memberId) => !existingMemberIds.has(memberId));
      if (missingMemberId) throw notFound('Member not found.');
    }

    const shouldUpdatePublicShare =
      body.publicEnabled !== undefined ||
      body.showAuthor !== undefined ||
      body.allowIndexing !== undefined ||
      body.expiresAt !== undefined ||
      body.rotateToken === true;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.documentId, doc.id));

      if (shouldUpdatePublicShare) {
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
          await tx
            .update(shareLinks)
            .set({ ...values, token: body.rotateToken ? makeToken() : existing.token })
            .where(eq(shareLinks.id, existing.id));
        } else {
          await tx.insert(shareLinks).values({
            id: makeId('link'),
            documentId: doc.id,
            token: makeToken(),
            createdBy: user.id,
            ...values,
          });
        }
        await tx.insert(auditLogs).values({
          id: makeId('audit'),
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

      for (const item of memberUpdates) {
        const parsed = SetDocumentMemberRoleSchema.parse(item);
        await tx
          .delete(documentMembers)
          .where(
            and(
              eq(documentMembers.documentId, doc.id),
              eq(documentMembers.memberId, parsed.memberId),
            ),
          );
        if (parsed.role) {
          await tx.insert(documentMembers).values({
            documentId: doc.id,
            memberId: parsed.memberId,
            role: parsed.role,
          });
        }
        await tx.insert(auditLogs).values({
          id: makeId('audit'),
          actorId: user.id,
          action: 'share.member_update',
          targetType: 'document',
          targetId: doc.id,
          details: { memberId: parsed.memberId, role: parsed.role },
        });
      }
    });

    return c.json({ ok: true });
  })
  .put('/:id/members/:memberId', async (c) => {
    const user = requireUser(c.get('user'));
    const doc = await requireDocumentEditor(user, c.req.param('id'));
    const memberId = c.req.param('memberId');
    const body = SetDocumentMemberRoleSchema.parse({ ...(await c.req.json()), memberId });

    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, body.memberId));
    if (!member) throw notFound('Member not found.');

    await db.transaction(async (tx) => {
      await tx
        .delete(documentMembers)
        .where(
          and(eq(documentMembers.documentId, doc.id), eq(documentMembers.memberId, body.memberId)),
        );
      if (body.role) {
        await tx.insert(documentMembers).values({
          documentId: doc.id,
          memberId: body.memberId,
          role: body.role,
        });
      }
      await tx.insert(auditLogs).values({
        id: makeId('audit'),
        actorId: user.id,
        action: 'document.member_update',
        targetType: 'document',
        targetId: doc.id,
        details: { memberId: body.memberId, role: body.role },
      });
    });
    return c.json({ ok: true });
  });
