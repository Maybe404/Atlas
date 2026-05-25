import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.env.DATABASE_URL ?? './data/atlas.sqlite';
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url, { create: true });
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('migrations applied');
