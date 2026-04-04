/**
 * @libsql/client driver implementation.
 *
 * Works with both local files and remote Turso databases.
 */

import type { DatabaseDriver } from './types';
import type { Logger } from 'src/types/schemas';

export async function createLibsqlDriver(
  connectionString: string,
  filePath: string,
  logger: Logger,
): Promise<DatabaseDriver> {
  const { createClient } = await import('@libsql/client');

  const isRemote =
    connectionString.startsWith('libsql://') || connectionString.startsWith('https://');
  const url = isRemote ? connectionString : `file:${filePath}`;

  const client = createClient({ url });

  // Pragmas — libsql supports PRAGMA via execute().
  if (!isRemote) {
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA synchronous = NORMAL');
    await client.execute('PRAGMA foreign_keys = ON');
  }

  logger.info('SQLite connection established (libsql)', {
    filePath: isRemote ? connectionString : filePath,
    remote: isRemote,
  });

  return {
    type: 'libsql',

    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await client.execute({
        sql,
        args: params as Array<string | number | bigint | ArrayBuffer | null>,
      });
      return result.rows as unknown as T[];
    },

    async execute(sql: string, params: unknown[] = []) {
      const result = await client.execute({
        sql,
        args: params as Array<string | number | bigint | ArrayBuffer | null>,
      });
      return { changes: result.rowsAffected };
    },

    close() {
      client.close();
    },
  };
}
