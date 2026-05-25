import { LoginSchema } from '@atlas/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { AppEnv } from '../lib/auth';
import { CSRF_COOKIE, createSession, SESSION_COOKIE } from '../lib/auth';
import { forbidden, notFound, unauthorized } from '../lib/http-error';
import { isAdmin } from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

export const authRouter = new Hono<AppEnv>()
  .get('/me', (c) =>
    c.json({
      user: toPublicMember(c.get('user')),
      session: {
        id: c.get('sessionId'),
        csrfToken: c.get('sessionId') === 'demo' ? null : c.get('csrfToken'),
        demo: c.get('sessionId') === 'demo',
      },
    }),
  )
  .post('/login', async (c) => {
    const body = LoginSchema.parse(await c.req.json());
    const [member] = await db.select().from(members).where(eq(members.email, body.email));
    if (!member) throw notFound('No member exists for this email.');
    if (!body.password) throw unauthorized('Password is required.');
    if (!member.passwordHash) throw forbidden('This account has no password configured.');
    const ok = await Bun.password.verify(body.password, member.passwordHash);
    if (!ok) throw unauthorized('Email or password is incorrect.');

    const session = await createSession(member.id);
    setCookie(c, SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    setCookie(c, CSRF_COOKIE, session.csrfToken, {
      httpOnly: false,
      sameSite: 'Lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    await writeAudit({
      actorId: member.id,
      action: 'auth.login',
      targetType: 'member',
      targetId: member.id,
    });
    return c.json({ user: toPublicMember(member), csrfToken: session.csrfToken });
  })
  .post('/logout', async (c) => {
    const sessionId = c.get('sessionId');
    if (sessionId && sessionId !== 'demo') {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    await writeAudit({
      actorId: c.get('user')?.id,
      action: 'auth.logout',
      targetType: 'session',
      targetId: sessionId ?? 'unknown',
    });
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    deleteCookie(c, CSRF_COOKIE, { path: '/' });
    return c.json({ ok: true });
  })
  .get('/audit', async (c) => {
    const user = c.get('user');
    if (!isAdmin(user)) throw forbidden('Only workspace admins can view audit logs.');
    const rows = await db.query.auditLogs.findMany({
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      limit: 100,
    });
    return c.json(rows);
  });
