import { CreateDocumentSchema, UpdateDocumentSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client';
import { documents } from '../db/schema';

export const documentsRouter = new Hono()
  .get('/', async (c) => {
    const rows = await db.select().from(documents);
    return c.json(rows);
  })
  .get('/:id', async (c) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, c.req.param('id')));
    if (!doc) return c.json({ error: 'not_found' }, 404);
    return c.json(doc);
  })
  .post('/', async (c) => {
    const body = CreateDocumentSchema.parse(await c.req.json());
    const id = `d${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(documents).values({
      id,
      spaceId: body.spaceId,
      authorId: 'u1',
      title: body.title,
      desc: body.desc,
      visibility: body.visibility,
      html: body.html,
      updated: new Date().toISOString().slice(0, 10),
    });
    return c.json({ id });
  })
  .patch('/:id', async (c) => {
    const body = UpdateDocumentSchema.parse(await c.req.json());
    await db
      .update(documents)
      .set({ ...body, updated: new Date().toISOString().slice(0, 10) })
      .where(eq(documents.id, c.req.param('id')));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    await db.delete(documents).where(eq(documents.id, c.req.param('id')));
    return c.json({ ok: true });
  });
