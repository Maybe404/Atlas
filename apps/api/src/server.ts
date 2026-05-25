import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { documentsRouter } from './routes/documents';
import { spacesRouter } from './routes/spaces';

const app = new Hono()
  .use('*', logger())
  .use('*', cors({ origin: ['http://localhost:5173'], credentials: true }))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/spaces', spacesRouter)
  .route('/documents', documentsRouter);

// End-to-end type for the web app's Hono RPC client.
export type AppRouter = typeof app;

const port = Number(process.env.PORT ?? 3000);
export default { port, fetch: app.fetch };
console.log(`atlas-api listening on http://localhost:${port}`);
