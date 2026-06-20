import { defineConfig } from 'drizzle-kit';
import { resolveDbUrl } from './src/db/db-path';

// Reuse the same resolver as db/client.ts and db/migrate.ts so the path can never drift between
// generate, migrate, and the running server (honors DATABASE_URL / ATLAS_DATA_DIR / dev|prod folder).
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: resolveDbUrl() },
});
