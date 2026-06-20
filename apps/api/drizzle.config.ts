import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// Resolve the default DB relative to this config file, not the current working directory, so it
// matches db/client.ts and db/migrate.ts regardless of where the command is invoked from.
const packageDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL ?? join(packageDir, 'data/atlas.sqlite') },
});
