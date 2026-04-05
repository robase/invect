/**
 * @neondatabase/serverless driver implementation.
 *
 * Uses the Neon serverless driver Pool which works in edge/serverless
 * environments and uses WebSocket connections.
 */

import type { DatabaseDriver } from './types';
import type { Logger } from 'src/schemas';

// @ts-ignore — @neondatabase/serverless is an optional dependency

export async function createNeonServerlessDriver(
  connectionString: string,
  logger: Logger,
): Promise<DatabaseDriver> {
  // @ts-ignore — @neondatabase/serverless is an optional dependency
  const { Pool } = await import('@neondatabase/serverless');

  const pool = new (Pool as new (opts: { connectionString: string }) => InstanceType<typeof Pool>)({
    connectionString,
  });

  // Test connection
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connection established (neon-serverless)');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL (neon)', error);
    throw error;
  }

  return {
    type: 'neon-serverless',

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
