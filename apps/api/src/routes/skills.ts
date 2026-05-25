import { CreateSkillVersionSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { skillVersions } from '../db/schema';
import type { AppEnv } from '../lib/auth';
import { forbidden } from '../lib/http-error';
import { makeId } from '../lib/id';
import { isAdmin } from '../lib/permissions';

export const skillsRouter = new Hono<AppEnv>()
  .get('/', async (_c) => {
    const rows = await db.select().from(skillVersions);
    return _c.json(rows);
  })
  .post('/', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can upload skill versions.');
    const body = CreateSkillVersionSchema.parse(await c.req.json());
    await db.insert(skillVersions).values({
      id: makeId('skill'),
      version: body.version,
      note: body.note,
      active: false,
      createdBy: user.id,
    });
    return c.json({ ok: true }, 201);
  })
  .post('/:version/activate', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can change skill versions.');
    const version = c.req.param('version');
    await db.update(skillVersions).set({ active: false });
    await db.update(skillVersions).set({ active: true }).where(eq(skillVersions.version, version));
    return c.json({ ok: true });
  });
