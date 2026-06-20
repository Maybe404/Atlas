import { CreateMemberSchema, UpdateMemberSchema } from '@atlas/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documents, grants, members, shareLinks } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { requireUser } from '../lib/auth';
import { removeGrantsForSubject } from '../lib/grants';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error';
import { makeId } from '../lib/id';
import { getMemberCapabilities, requireCapability } from '../lib/permissions';
import { createPersonalSpace } from '../lib/personal-space';
import { toPublicMember } from '../lib/serializers';

type User = typeof members.$inferSelect;

async function requireManageMembers(user: User) {
  const caps = await getMemberCapabilities(user);
  requireCapability(caps, 'manageMembers');
}

function initialsFromName(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return '??';

  const asciiParts = cleaned.match(/[A-Za-z0-9]+/g);
  if (asciiParts?.length) {
    return asciiParts
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  return Array.from(cleaned).slice(0, 2).join('');
}

function joinedMonth() {
  return new Date().toISOString().slice(0, 7);
}

export const membersRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageMembers(user);
    const rows = await db.select().from(members);
    return c.json(rows.map(toPublicMember));
  })
  .post('/', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageMembers(user);

    const body = CreateMemberSchema.parse(await c.req.json());
    const email = body.email.trim().toLowerCase();
    const [existing] = await db.select().from(members).where(eq(members.email, email));
    if (existing) throw conflict('A member already exists for this email.');

    const id = makeId('u');
    const passwordHash = await Bun.password.hash(body.password);
    await db.insert(members).values({
      id,
      name: body.name.trim(),
      initials: initialsFromName(body.name),
      email,
      passwordHash,
      role: body.role,
      joined: joinedMonth(),
    });

    const [member] = await db.select().from(members).where(eq(members.id, id));
    if (!member) throw notFound();
    await createPersonalSpace(db, member);
    await writeAudit({
      actorId: user.id,
      action: 'member.create',
      targetType: 'member',
      targetId: id,
      details: { name: body.name.trim(), email, role: body.role },
    });
    return c.json(toPublicMember(member), 201);
  })
  .get('/permissions', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageMembers(user);
    const rows = await db
      .select({
        memberId: grants.subjectId,
        spaceId: grants.targetId,
        role: grants.role,
      })
      .from(grants)
      .where(and(eq(grants.subjectType, 'member'), eq(grants.targetType, 'space')));
    return c.json(rows);
  })
  .patch('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageMembers(user);
    const id = c.req.param('id');
    const body = UpdateMemberSchema.parse(await c.req.json());

    const patch: Partial<typeof members.$inferInsert> = {};
    if (body.name !== undefined) {
      patch.name = body.name.trim();
      patch.initials = initialsFromName(body.name);
    }
    if (body.role !== undefined) patch.role = body.role;
    if (body.password !== undefined) patch.passwordHash = await Bun.password.hash(body.password);

    if (Object.keys(patch).length === 0) throw badRequest('No fields to update.');

    const [target] = await db.select().from(members).where(eq(members.id, id));
    if (!target) throw notFound();

    // Never let the workspace lose its last admin (which would lock everyone out of member,
    // space, trash and audit management).
    if (body.role !== undefined && target.role === 'admin' && body.role !== 'admin') {
      const admins = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.role, 'admin'));
      if (admins.length <= 1) {
        throw conflict('The workspace must keep at least one admin.');
      }
    }

    await db.update(members).set(patch).where(eq(members.id, id));
    const [member] = await db.select().from(members).where(eq(members.id, id));
    if (!member) throw notFound();
    await writeAudit({
      actorId: user.id,
      action: 'member.update',
      targetType: 'member',
      targetId: id,
      details: {
        ...('name' in body ? { name: patch.name } : {}),
        ...('role' in body ? { role: body.role } : {}),
        ...('password' in body ? { passwordChanged: true } : {}),
      },
    });
    return c.json(toPublicMember(member));
  })
  .delete('/:id', async (c) => {
    const user = requireUser(c.get('user'));
    await requireManageMembers(user);
    const id = c.req.param('id');
    if (id === user.id) throw forbidden('You cannot delete your own member account.');

    const [member] = await db.select().from(members).where(eq(members.id, id));
    if (!member) throw notFound();
    await db.update(documents).set({ authorId: user.id }).where(eq(documents.authorId, id));
    await db.update(documents).set({ deletedBy: null }).where(eq(documents.deletedBy, id));
    await db.update(shareLinks).set({ createdBy: user.id }).where(eq(shareLinks.createdBy, id));
    await removeGrantsForSubject(db, id);
    await db.delete(members).where(eq(members.id, id));
    await writeAudit({
      actorId: user.id,
      action: 'member.delete',
      targetType: 'member',
      targetId: id,
      details: { email: member.email, role: member.role, reassignedTo: user.id },
    });
    return c.json({ ok: true });
  });
