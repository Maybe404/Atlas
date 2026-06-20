// Central place for reading runtime configuration from the environment. Keeping these helpers in one
// module means "is this production?" and "is this flag on?" are answered the same way everywhere
// (auth cookies, the seed guard, the DB path, the server) instead of each file re-implementing it.

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const PRODUCTION_VALUES = new Set(['production', 'prod']);

/** True when NODE_ENV / BUN_ENV / ATLAS_ENV marks this as a production runtime. */
export function isProductionRuntime() {
  return [process.env.NODE_ENV, process.env.BUN_ENV, process.env.ATLAS_ENV].some((value) =>
    value ? PRODUCTION_VALUES.has(value.trim().toLowerCase()) : false,
  );
}

/** Short name for the active runtime — used to pick the data folder (data/prod vs data/dev). */
export function runtimeEnvName(): 'prod' | 'dev' {
  return isProductionRuntime() ? 'prod' : 'dev';
}

/** Read a boolean-ish env flag (1/true/yes/on). Absent or anything else is false. */
export function envFlag(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? TRUE_VALUES.has(value) : false;
}

/** Read a string env var, or fall back. */
export function envString(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/** Read a positive number env var, or fall back. */
export function envPositiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Require an env var to be set and non-empty; throw a clear error otherwise. */
export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.${hint ? ` ${hint}` : ''}`);
  }
  return value;
}
