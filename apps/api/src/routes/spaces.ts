import { CreateSpaceSchema, UpdateSpaceSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documents, spaces } from '../db/schema';

export const spacesRouter = new Hono()
  .get('/', async (c) => {
    const rows = await db.select().from(spaces);
    return c.json(rows);
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const [sp] = await db.select().from(spaces).where(eq(spaces.id, id));
    if (!sp) return c.json({ error: 'not_found' }, 404);
    const docs = await db.select().from(documents).where(eq(documents.spaceId, id));
    return c.json({ ...sp, children: docs });
  })
  .post('/', async (c) => {
    const body = CreateSpaceSchema.parse(await c.req.json());
    const id = `s${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(spaces).values({
      id,
      name: body.name,
      mark: body.name.slice(0, 1),
      accent: body.accent,
    });
    return c.json({ id });
  })
  .patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = UpdateSpaceSchema.parse(await c.req.json());
    const patch: Record<string, unknown> = { ...body };
    if (body.name) patch.mark = body.name.slice(0, 1);
    await db.update(spaces).set(patch).where(eq(spaces.id, id));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    await db.delete(spaces).where(eq(spaces.id, c.req.param('id')));
    return c.json({ ok: true });
  });
