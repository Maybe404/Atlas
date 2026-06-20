import { join, sep } from 'node:path';
import { runtimeEnvName } from '../lib/env';

// Resolve the SQLite file path. Precedence:
//   1. DATABASE_URL            — full path to the .sqlite file (tests, custom setups, prod override)
//   2. ATLAS_DATA_DIR + env    — base directory (recommended in production: an absolute, persistent
//                                 path outside the code dir so redeploys never touch the data)
//   3. <package>/data/<env>    — default; dev and prod live in separate folders (data/dev, data/prod)
//                                 so a local dev DB and a production DB can never collide.
//
// This file lives in apps/api/src/db during dev and is bundled into apps/api/dist on build, so it
// resolves the package root for either layout.
function packageDir(): string {
  const dir = import.meta.dir;
  if (dir.endsWith(`${sep}dist`)) return join(dir, '..'); // apps/api/dist -> apps/api
  return join(dir, '..', '..'); // apps/api/src/db -> apps/api
}

export function resolveDbUrl(): string {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();

  const env = runtimeEnvName();
  const baseDir = process.env.ATLAS_DATA_DIR?.trim() || join(packageDir(), 'data');
  return join(baseDir, env, 'atlas.sqlite');
}
