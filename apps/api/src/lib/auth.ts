import { and, eq, gt } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import { addDaysIso, nowIso } from './dates';
import { forbidden } from './http-error';
import { makeToken } from './id';

export type CurrentUser = typeof members.$inferSelect;

export type AuthVariables = {
  user: CurrentUser;
  sessionId: string;
  csrfToken: string;
};

export type AppEnv = {
  Variables: AuthVariables;
};

const SESSION_COOKIE = 'atlas_session';
const CSRF_HEADER = 'x-atlas-csrf';
const CSRF_COOKIE = 'atlas_csrf';
const DEMO_USER_ID = 'u1';

export async function createSession(memberId: string) {
  const id = makeToken();
  const csrfToken = makeToken();
  await db.insert(sessions).values({
    id,
    memberId,
    csrfToken,
    expiresAt: addDaysIso(30),
  });
  return { id, csrfToken };
}

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const cookieSession = getCookie(c, SESSION_COOKIE);
  const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const sessionId = cookieSession || bearer;
  const now = nowIso();

  if (sessionId) {
    const [row] = await db
      .select({ session: sessions, member: members })
      .from(sessions)
      .innerJoin(members, eq(sessions.memberId, members.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)));

    if (row) {
      c.set('sessionId', row.session.id);
      c.set('csrfToken', row.session.csrfToken);
      c.set('user', row.member);
      await next();
      return;
    }
  }

  const [demoUser] = await db.select().from(members).where(eq(members.id, DEMO_USER_ID));
  if (demoUser) {
    c.set('sessionId', 'demo');
    c.set('csrfToken', 'demo');
    c.set('user', demoUser);
  }

  await next();
}

export async function csrfMiddleware(c: Context<AppEnv>, next: Next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    await next();
    return;
  }

  if (c.req.path === '/auth/login') {
    await next();
    return;
  }

  if (c.get('sessionId') === 'demo') {
    await next();
    return;
  }

  const header = c.req.header(CSRF_HEADER);
  if (!header || header !== c.get('csrfToken')) {
    throw forbidden('CSRF token is missing or invalid.');
  }

  await next();
}

export { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE };
