import { and, eq, gt } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/client';
import { members, sessions } from '../db/schema';
import { addDaysIso, nowIso } from './dates';
import { forbidden, tooManyRequests, unauthorized } from './http-error';
import { makeToken } from './id';

export type CurrentUser = typeof members.$inferSelect;

export type AuthVariables = {
  user?: CurrentUser;
  sessionId?: string;
  csrfToken?: string;
  authSource?: 'cookie' | 'bearer';
};

export type AppEnv = {
  Variables: AuthVariables;
};

const SESSION_COOKIE = 'atlas_session';
const CSRF_HEADER = 'x-atlas-csrf';
const CSRF_COOKIE = 'atlas_csrf';
const LOGIN_FAILURE_MESSAGE = 'Email or password is incorrect.';
const LOGIN_RATE_LIMIT_MESSAGE = 'Too many login attempts. Please try again later.';
const LOGIN_FAILURE_LIMIT = positiveNumberEnv('ATLAS_LOGIN_RATE_LIMIT_MAX_FAILURES', 5);
const LOGIN_FAILURE_WINDOW_MS = positiveNumberEnv(
  'ATLAS_LOGIN_RATE_LIMIT_WINDOW_MS',
  10 * 60 * 1000,
);
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const PRODUCTION_VALUES = new Set(['production', 'prod']);

type LoginFailureState = {
  count: number;
  resetAt: number;
};

const loginFailures = new Map<string, LoginFailureState>();

function positiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envFlag(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? TRUE_VALUES.has(value) : false;
}

function isProductionRuntime() {
  return [process.env.NODE_ENV, process.env.BUN_ENV, process.env.ATLAS_ENV].some((value) =>
    value ? PRODUCTION_VALUES.has(value.trim().toLowerCase()) : false,
  );
}

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

export function assertLoginAllowed(c: Context<AppEnv>, email: string) {
  const key = loginFailureKey(c, email);
  const state = loginFailures.get(key);
  const now = Date.now();

  if (!state) return;
  if (state.resetAt <= now) {
    loginFailures.delete(key);
    return;
  }
  if (state.count >= LOGIN_FAILURE_LIMIT) {
    throw tooManyRequests(LOGIN_RATE_LIMIT_MESSAGE);
  }
}

export function recordLoginFailure(c: Context<AppEnv>, email: string) {
  const key = loginFailureKey(c, email);
  const now = Date.now();
  const state = loginFailures.get(key);

  if (!state || state.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_FAILURE_WINDOW_MS });
    return;
  }

  state.count += 1;
}

export function clearLoginFailures(c: Context<AppEnv>, email: string) {
  loginFailures.delete(loginFailureKey(c, email));
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
