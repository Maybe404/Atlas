import { and, eq, gt } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { loginFailures, members, sessions } from '../db/schema';
import { addDaysIso, nowIso } from './dates';
import { envFlag, envPositiveNumber, isProductionRuntime } from './env';
import { forbidden, tooManyRequests, unauthorized } from './http-error';
import { makeToken } from './id';

export type CurrentUser = typeof members.$inferSelect;

export type AuthVariables = {
  user?: CurrentUser;
  sessionId?: string;
  csrfToken?: string;
  authSource?: 'cookie' | 'bearer';
  // Set by the raw-HTML document routes: they serve untrusted uploaded HTML and need their own
  // sandboxing headers, so the global setSecurityHeaders pass must not overwrite them.
  rawHtml?: boolean;
};

export type AppEnv = {
  Variables: AuthVariables;
};

const SESSION_COOKIE = 'atlas_session';
const CSRF_HEADER = 'x-atlas-csrf';
const CSRF_COOKIE = 'atlas_csrf';
const LOGIN_FAILURE_MESSAGE = 'Email or password is incorrect.';
const LOGIN_RATE_LIMIT_MESSAGE = 'Too many login attempts. Please try again later.';
const LOGIN_FAILURE_LIMIT = envPositiveNumber('ATLAS_LOGIN_RATE_LIMIT_MAX_FAILURES', 5);
const LOGIN_FAILURE_WINDOW_MS = envPositiveNumber(
  'ATLAS_LOGIN_RATE_LIMIT_WINDOW_MS',
  10 * 60 * 1000,
);

export function shouldUseSecureCookies() {
  if (isProductionRuntime()) return true;
  return envFlag('ATLAS_COOKIE_SECURE');
}

function forwardedIp(c: Context<AppEnv>) {
  const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor ||
    c.req.header('x-real-ip')?.trim() ||
    c.req.header('cf-connecting-ip')?.trim() ||
    null
  );
}

export function clientIpForAuth(c: Context<AppEnv>) {
  if (envFlag('ATLAS_TRUST_PROXY')) {
    return forwardedIp(c) ?? 'direct';
  }
  return 'direct';
}

function loginFailureKey(c: Context<AppEnv>, email: string) {
  return `${clientIpForAuth(c)}:${email.trim().toLowerCase()}`;
}

// `resetAt` is stored as an ISO-8601 string in the DB so the value survives restarts cleanly
// (epoch numbers would also work, but the date lib in this project is text-based everywhere
// else). `assertLoginAllowed` reads the row, expires stale ones inline, and refuses the
// request if the window is still active and full.
export async function assertLoginAllowed(c: Context<AppEnv>, email: string) {
  const key = loginFailureKey(c, email);
  const now = nowIso();
  const [row] = await db.select().from(loginFailures).where(eq(loginFailures.key, key));
  if (!row) return;
  if (row.resetAt <= now) {
    await db.delete(loginFailures).where(eq(loginFailures.key, key));
    return;
  }
  if (row.count >= LOGIN_FAILURE_LIMIT) {
    throw tooManyRequests(LOGIN_RATE_LIMIT_MESSAGE);
  }
}

export async function recordLoginFailure(c: Context<AppEnv>, email: string) {
  const key = loginFailureKey(c, email);
  const nowMs = Date.now();
  const newResetAtIso = new Date(nowMs + LOGIN_FAILURE_WINDOW_MS).toISOString();
  const nowIsoStr = nowIso();

  const [existing] = await db.select().from(loginFailures).where(eq(loginFailures.key, key));
  if (!existing || existing.resetAt <= nowIsoStr) {
    // Fresh window — upsert. SQLite supports `onConflictDoUpdate` via Drizzle.
    await db
      .insert(loginFailures)
      .values({ key, count: 1, resetAt: newResetAtIso })
      .onConflictDoUpdate({
        target: loginFailures.key,
        set: { count: 1, resetAt: newResetAtIso },
      });
    return;
  }
  await db
    .update(loginFailures)
    .set({ count: existing.count + 1 })
    .where(eq(loginFailures.key, key));
}

export async function clearLoginFailures(c: Context<AppEnv>, email: string) {
  await db.delete(loginFailures).where(eq(loginFailures.key, loginFailureKey(c, email)));
}

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
      c.set('authSource', cookieSession ? 'cookie' : 'bearer');
      await next();
      return;
    }
  }

  await next();
}

export function requireUser(user?: CurrentUser) {
  if (!user) throw unauthorized();
  return user;
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

  // CSRF only protects cookie-based sessions, which browsers attach automatically. Bearer-token
  // clients must set the header explicitly, so they are not susceptible to CSRF.
  if (c.get('authSource') === 'bearer') {
    await next();
    return;
  }

  const header = c.req.header(CSRF_HEADER);
  if (!header || header !== c.get('csrfToken')) {
    throw forbidden('CSRF token is missing or invalid.');
  }

  await next();
}

export { CSRF_COOKIE, CSRF_HEADER, LOGIN_FAILURE_MESSAGE, SESSION_COOKIE };
