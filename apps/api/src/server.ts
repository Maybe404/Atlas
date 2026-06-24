import { join, relative, sep } from 'node:path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ZodError } from 'zod';
import { type AppEnv, authMiddleware, csrfMiddleware } from './lib/auth';
import { envFlag, envString, isProductionRuntime } from './lib/env';
import { HttpError } from './lib/http-error';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { foldersRouter } from './routes/folders';
import { groupsRouter } from './routes/groups';
import { membersRouter } from './routes/members';
import { spacesRouter } from './routes/spaces';

// Allowed cross-origin browser origins for the API. Comma-separated in ATLAS_CORS_ORIGIN.
// In the single-port production layout the web app and API share one origin, so CORS is never
// triggered and the default is empty (deny). Dev runs the Vite server on :5173, which proxies
// /api server-side, so CORS still isn't strictly needed — but we allow it for direct browser calls.
const corsOrigins = (
  process.env.ATLAS_CORS_ORIGIN ?? (isProductionRuntime() ? '' : 'http://localhost:5173')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Security headers, with the Content-Security-Policy fully overridable via ATLAS_CSP. The default
// is a strict same-origin policy plus the Google Fonts hosts that index.html links. script-src is
// intentionally 'self' (no 'unsafe-inline') so an injected inline <script> can't execute — this is
// the defense-in-depth that matters for the in-page Markdown renderer.
const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

const CSP = envString('ATLAS_CSP', DEFAULT_CSP);

function setSecurityHeaders(headers: Headers) {
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

const app = new Hono<AppEnv>()
  .use('*', logger())
  .use('*', async (c, next) => {
    await next();
    setSecurityHeaders(c.res.headers);
  })
  .use(
    '*',
    cors({
      origin: corsOrigins,
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Atlas-CSRF'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  )
  .use('*', authMiddleware)
  .use('*', csrfMiddleware)
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', authRouter)
  .route('/spaces', spacesRouter)
  .route('/documents', documentsRouter)
  .route('/folders', foldersRouter)
  .route('/members', membersRouter)
  .route('/groups', groupsRouter);

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      { code: 'validation_error', message: 'Request validation failed.', issues: err.issues },
      400,
    );
  }

  if (err instanceof HttpError) {
    return c.json(
      { code: err.code, message: err.message },
      err.status as 400 | 401 | 403 | 404 | 409 | 429 | 500,
    );
  }

  // Malformed JSON bodies surface as SyntaxError from c.req.json(); treat as a client error.
  if (err instanceof SyntaxError) {
    return c.json({ code: 'bad_request', message: 'Invalid JSON body.' }, 400);
  }

  console.error(err);
  return c.json({ code: 'internal_error', message: 'Unexpected server error.' }, 500);
});

// End-to-end type for the web app's Hono RPC client.
export type AppRouter = typeof app;

// --- Single-port static serving (production) -------------------------------------------------
// When enabled, this one process serves both the built SPA and the API, so a reverse proxy
// (nginx/1panel) only needs to forward one IP:port. The browser calls /api/*; we strip that prefix
// and hand the request to the API above (mirroring the dev-time Vite proxy). Everything else serves
// a file from apps/web/dist, falling back to index.html for client-side routes.
const serveStatic = isProductionRuntime() || envFlag('ATLAS_SERVE_STATIC');
// apps/api/src and apps/api/dist are both one level under apps/api, so two ".." reach apps/.
const webDist = join(import.meta.dir, '..', '..', 'web', 'dist');

async function serveSpa(pathname: string): Promise<Response> {
  const decoded = decodeURIComponent(pathname);
  const requested = join(webDist, decoded === '/' ? '/index.html' : decoded);

  // Path-traversal guard: never serve anything outside the dist directory. `relative()` is the
  // safe primitive here — `startsWith(webDist)` would also be true for a sibling directory
  // sharing the same prefix (e.g. `dist-evil/` next to `dist/`), and a strict `startsWith` with
  // a path separator would still need careful handling of platform-specific separators.
  const rel = relative(webDist, requested);
  const isInsideDist = rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('../');
  let file = isInsideDist ? Bun.file(requested) : null;
  const isAsset = decoded.startsWith('/assets/') && file !== null && (await file.exists());

  if (!file || !(await file.exists())) {
    // Unknown path → hand it to the SPA (client-side router renders or 404s).
    file = Bun.file(join(webDist, 'index.html'));
    if (!(await file.exists())) {
      return new Response('Frontend build not found. Run `bun run build` first.', { status: 404 });
    }
  }

  const res = new Response(file);
  // Hashed asset filenames are immutable; index.html must always be revalidated.
  res.headers.set('Cache-Control', isAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
  setSecurityHeaders(res.headers);
  return res;
}

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch(req: Request) {
    const url = new URL(req.url);

    // /api/* belongs to the API; strip the prefix to match the root-mounted routers (and tests).
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      url.pathname = url.pathname.replace(/^\/api/, '') || '/';
      return app.fetch(new Request(url.toString(), req));
    }

    // In the single-port layout, every non-/api GET is a static asset or an SPA route.
    if (serveStatic && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveSpa(url.pathname);
    }

    // Dev / API-only mode: let Hono handle it (health checks, direct API calls, tests).
    return app.fetch(req);
  },
};

console.log(
  `atlas-api listening on http://localhost:${port}` +
    (serveStatic ? ' (serving SPA + API on one port)' : ' (API only)'),
);
