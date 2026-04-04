/**
 * better-sqlite3 driver implementation.
 *
 * Wraps the synchronous better-sqlite3 API in the async DatabaseDriver interface.
 */

import type { DatabaseDriver } from './types';
import type { Logger } from 'src/types/schemas';

export async function createBetterSqlite3Driver(
  filePath: string,
  logger: Logger,
): Promise<DatabaseDriver> {
  const Database = (await import('better-sqlite3')).default;

  const dbPath = filePath === ':memory:' ? ':memory:' : filePath;
  const client = new Database(dbPath);

  // Standard pragmas
  client.pragma('journal_mode = WAL');
  client.pragma('synchronous = NORMAL');
  client.pragma('foreign_keys = ON');

  logger.info('SQLite connection established (better-sqlite3)', { filePath });

  return {
    type: 'better-sqlite3',

    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      return client.prepare(sql).all(...params) as T[];
    },

    async execute(sql: string, params: unknown[] = []) {
      const result = client.prepare(sql).run(...params);
      return { changes: result.changes };
    },

    close() {
      try {
        client.close();
      } catch {
        // ignore — may already be closed
      }
    },
  };
}
