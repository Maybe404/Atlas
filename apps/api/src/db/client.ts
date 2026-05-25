import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

const root = join(import.meta.dir, '../..');
const url = process.env.DATABASE_URL ?? join(root, 'data/atlas.sqlite');
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
