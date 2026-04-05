/**
 * mysql2 driver implementation.
 *
 * Uses `mysql2/promise` Pool.
 */

import type { DatabaseDriver } from './types';
import type { Logger } from 'src/schemas';

export async function createMysql2Driver(
  connectionString: string,
  logger: Logger,
): Promise<DatabaseDriver> {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool(connectionString);

  // Test connection
  try {
    await pool.execute('SELECT 1');
    logger.info('MySQL connection established (mysql2)');
  } catch (error) {
    logger.error('Failed to connect to MySQL', error);
    throw error;
  }

  return {
    type: 'mysql2',

    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const [rows] = (await pool.execute(sql, params as (string | number | null)[])) as [
        unknown[],
        unknown,
      ];
      return Array.isArray(rows) ? (rows as T[]) : [];
    },

    async execute(sql: string, params: unknown[] = []) {
      const [result] = (await pool.execute(sql, params as (string | number | null)[])) as [
        { affectedRows?: number },
        unknown,
      ];
      return { changes: result?.affectedRows ?? 0 };
    },

    async close() {
      await pool.end();
    },
  };
}
