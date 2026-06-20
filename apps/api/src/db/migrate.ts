import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolveDbUrl } from './db-path';

const url = resolveDbUrl();
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url, { create: true });
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') });
console.log('migrations applied');
