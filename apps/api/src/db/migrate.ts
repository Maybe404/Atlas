import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const root = join(import.meta.dir, '../..');
const url = process.env.DATABASE_URL ?? join(root, 'data/atlas.sqlite');
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url, { create: true });
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(import.meta.dir, 'migrations') });
console.log('migrations applied');
