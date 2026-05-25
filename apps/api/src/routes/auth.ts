import { LoginSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import type { AppEnv } from '../lib/auth';
import { createSession, SESSION_COOKIE } from '../lib/auth';
import { notFound } from '../lib/http-error';

export const authRouter = new Hono<AppEnv>()
  .get('/me', (c) => c.json({ user: c.get('user') }))
  .post('/login', async (c) => {
    const body = LoginSchema.parse(await c.req.json());
    const [member] = await db.select().from(members).where(eq(members.email, body.email));
    if (!member) throw notFound('No member exists for this email.');

    const sessionId = await createSession(member.id);
    setCookie(c, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ user: member });
  })
  .post('/logout', async (c) => {
    const sessionId = c.get('sessionId');
    if (sessionId && sessionId !== 'demo') {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
