import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ZodError } from 'zod';
import { type AppEnv, authMiddleware, csrfMiddleware } from './lib/auth';
import { HttpError } from './lib/http-error';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { foldersRouter } from './routes/folders';
import { membersRouter } from './routes/members';
import { spacesRouter } from './routes/spaces';

const app = new Hono<AppEnv>()
  .use('*', logger())
  .use(
    '*',
    cors({
      origin: ['http://localhost:5173'],
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
  .route('/members', membersRouter);

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

const port = Number(process.env.PORT ?? 3000);
export default { port, fetch: app.fetch };
console.log(`atlas-api listening on http://localhost:${port}`);
