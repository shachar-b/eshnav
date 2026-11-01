import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

/** Monorepo root. Same depth from `src/db/` and `dist/db/`. */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export const DEFAULT_DB_PATH = './data/eshnav.db';

/** Relative paths resolve against the monorepo root so the DB location never depends on the cwd. */
export function resolveDbPath(dbPath: string | undefined): string {
  const target = dbPath || DEFAULT_DB_PATH;
  return target === ':memory:' ? target : path.resolve(REPO_ROOT, target);
}

/** Opens (creating if needed) the database, applies the mandatory pragmas, and runs pending migrations. */
export function openDatabase(dbPath: string = resolveDbPath(process.env.DB_PATH)) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export type AppDb = ReturnType<typeof openDatabase>;
