import { UpdateMemberSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { members, spaceMembers } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { forbidden, notFound } from '../lib/http-error';
import { isAdmin } from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

export const membersRouter = new Hono<AppEnv>()
  .get('/', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can list all members.');
    const rows = await db.select().from(members);
    return c.json(rows.map(toPublicMember));
  })
  .get('/permissions', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can view all permissions.');
    const rows = await db
      .select({
        memberId: spaceMembers.memberId,
        spaceId: spaceMembers.spaceId,
        role: spaceMembers.role,
      })
      .from(spaceMembers);
    return c.json(rows);
  })
  .patch('/:id', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can edit members.');
    const id = c.req.param('id');
    const body = UpdateMemberSchema.parse(await c.req.json());
    await db.update(members).set(body).where(eq(members.id, id));
    const [member] = await db.select().from(members).where(eq(members.id, id));
    if (!member) throw notFound();
    await writeAudit({
      actorId: user.id,
      action: 'member.update',
      targetType: 'member',
      targetId: id,
      details: body,
    });
    return c.json(toPublicMember(member));
  });
