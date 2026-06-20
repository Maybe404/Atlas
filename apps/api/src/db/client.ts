import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { resolveDbUrl } from './db-path';
import * as schema from './schema';

const url = resolveDbUrl();
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
