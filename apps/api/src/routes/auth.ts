import { LoginSchema } from '@atlas/shared';
import { eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import { writeAudit } from '../lib/audit';
import {
  type AppEnv,
  assertLoginAllowed,
  CSRF_COOKIE,
  clearLoginFailures,
  createSession,
  LOGIN_FAILURE_MESSAGE,
  recordLoginFailure,
  requireUser,
  SESSION_COOKIE,
  shouldUseSecureCookies,
} from '../lib/auth';
import { nowIso } from '../lib/dates';
import { forbidden, unauthorized } from '../lib/http-error';
import { isAdmin } from '../lib/permissions';
import { toPublicMember } from '../lib/serializers';

const DUMMY_PASSWORD_HASH = '$2b$04$RhYUNqiT505iO9sAwUaXGO/9c55aKJYZtRSazB2H0mHtPbH.m5eF.';

export const authRouter = new Hono<AppEnv>()
  .get('/me', (c) =>
    c.json({
      user: c.get('user') ? toPublicMember(c.get('user')!) : null,
      session: {
        id: c.get('sessionId') ?? null,
        csrfToken: c.get('csrfToken') ?? null,
        demo: false,
      },
    }),
  )
  .post('/login', async (c) => {
    const body = LoginSchema.parse(await c.req.json());
    assertLoginAllowed(c, body.email);

    const [member] = await db.select().from(members).where(eq(members.email, body.email));
    const passwordHash = member?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const ok = body.password ? await Bun.password.verify(body.password, passwordHash) : false;

    if (!member?.passwordHash || !ok) {
      recordLoginFailure(c, body.email);
      throw unauthorized(LOGIN_FAILURE_MESSAGE);
    }

    clearLoginFailures(c, body.email);
    const session = await createSession(member.id);
    const secure = shouldUseSecureCookies();
    setCookie(c, SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'Lax',
      secure,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    setCookie(c, CSRF_COOKIE, session.csrfToken, {
      httpOnly: false,
      sameSite: 'Lax',
      secure,
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
  .post('/sessions/purge-expired', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can purge expired sessions.');

    const result = await db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).returning();
    await writeAudit({
      actorId: user.id,
      action: 'auth.sessions.purge_expired',
      targetType: 'session',
      targetId: 'expired',
      details: { purged: result.length },
    });
    return c.json({ purged: result.length });
  })
  .get('/audit', async (c) => {
    const user = requireUser(c.get('user'));
    if (!isAdmin(user)) throw forbidden('Only workspace admins can view audit logs.');
    const rows = await db.query.auditLogs.findMany({
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      limit: 100,
    });
    return c.json(rows);
  });
