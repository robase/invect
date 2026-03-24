import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const dbPath = (process.env.DB_FILE_NAME || 'file:./dev.db').replace(/^file:/, '');

/**
 * Shared Drizzle database instance.
 * Used by both the Invect router and the Better Auth adapter.
 */
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
export const db = drizzle(sqlite, { schema });
