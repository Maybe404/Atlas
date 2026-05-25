import type { Member } from '@atlas/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import { addDaysIso, nowIso } from './dates';
import { makeToken } from './id';

export type AuthVariables = {
  user: Member;
  sessionId: string;
};

export type AppEnv = {
  Variables: AuthVariables;
};

const SESSION_COOKIE = 'atlas_session';
const DEMO_USER_ID = 'u1';

export async function createSession(memberId: string) {
  const id = makeToken();
  await db.insert(sessions).values({
    id,
    memberId,
    expiresAt: addDaysIso(30),
  });
  return id;
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
      c.set('user', row.member);
      await next();
      return;
    }
  }

  const [demoUser] = await db.select().from(members).where(eq(members.id, DEMO_USER_ID));
  if (demoUser) {
    c.set('sessionId', 'demo');
    c.set('user', demoUser);
  }

  await next();
}

export { SESSION_COOKIE };
