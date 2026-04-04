/**
 * node-postgres (pg npm package) driver implementation.
 *
 * Uses `pg.Pool` for connection pooling.
 */

import type { DatabaseDriver } from './types';
import type { Logger } from 'src/types/schemas';

export async function createNodePostgresDriver(
  connectionString: string,
  logger: Logger,
): Promise<DatabaseDriver> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString });

  // Test connection
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connection established (node-postgres / pg)');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL', error);
    throw error;
  }

  return {
    type: 'pg',

    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },

    async execute(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { changes: result.rowCount ?? 0 };
    },

    async close() {
      await pool.end();
    },
  };
}
