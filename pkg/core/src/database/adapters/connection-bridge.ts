/**
 * Bridge between Invect's existing DatabaseConnection (Drizzle-based)
 * and the new Kysely-based adapter system.
 *
 * Creates a Kysely instance that shares the same underlying database
 * connection (postgres.js client, better-sqlite3, mysql2 pool).
 */

import {
  Kysely,
  MysqlDialect,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';
import type { DatabaseConnection } from '../connection';
import type { SqliteDriver } from '../sqlite-driver';
import type { InvectAdapter, AdapterConfig } from '../adapter';
import { createKyselyAdapter } from './kysely-adapter';
import { createInvectAdapterFactory } from '../adapter-factory';
import { INVECT_SCHEMA_META } from '../schema-metadata';

type KyselyDb = Kysely<Record<string, Record<string, unknown>>>;

/**
 * Create an InvectAdapter from an existing DatabaseConnection.
 *
 * The Kysely instance shares the same underlying database client
 * (no new connections are created).
 */
export function createAdapterFromConnection(connection: DatabaseConnection): InvectAdapter {
  const kyselyDb = createKyselyFromConnection(connection);

  const config: AdapterConfig = {
    dialect: connection.type,
  };

  const rawAdapter = createKyselyAdapter(kyselyDb, config);
  return createInvectAdapterFactory(rawAdapter, config, INVECT_SCHEMA_META);
}

/**
 * Create a Kysely instance that reuses the underlying client from
 * a Drizzle DatabaseConnection.
 */
function createKyselyFromConnection(connection: DatabaseConnection): KyselyDb {
  switch (connection.type) {
    case 'sqlite': {
      // Use the unified SqliteDriver from the connection instead of
      // reaching into $client. Works with both better-sqlite3 and libsql.
      const sqliteDriver = connection.driver;

      return new Kysely({
        dialect: {
          createAdapter: () => new SqliteAdapter(),
          createDriver: () => createSqliteKyselyDriver(sqliteDriver),
          createIntrospector: (db: Kysely<unknown>) => new SqliteIntrospector(db),
          createQueryCompiler: () => new SqliteQueryCompiler(),
        } as never,
      }) as unknown as KyselyDb;
    }

    case 'postgresql': {
      // Drizzle's postgres.js driver exposes $client which is a postgres.Sql instance.
      // We wrap it as a Kysely PostgresDialect pool.
      const pgClient = (connection.db as unknown as { $client: PgClient }).$client;

      return new Kysely({
        dialect: {
          createAdapter: () => new PostgresAdapter(),
          createDriver: () => createPostgresJsDriver(pgClient),
          createIntrospector: (db: Kysely<unknown>) => new PostgresIntrospector(db),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        } as never,
      }) as unknown as KyselyDb;
    }

    case 'mysql': {
      // Drizzle's mysql2 driver exposes $client which is a mysql2 Pool.
      const mysqlPool = (connection.db as unknown as { $client: MysqlPool }).$client;

      return new Kysely({
        dialect: new MysqlDialect({ pool: mysqlPool as never }),
      }) as unknown as KyselyDb;
    }
  }
}

// ---------------------------------------------------------------------------
// Type stubs for underlying clients (avoid importing full packages)
// ---------------------------------------------------------------------------

interface PgClient {
  <T = Record<string, unknown>[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  (query: string): Promise<Record<string, unknown>[]>;
  unsafe(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

interface MysqlPool {
  getConnection(): Promise<unknown>;
  execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
}

// ---------------------------------------------------------------------------
// Custom Kysely drivers wrapping existing clients
// ---------------------------------------------------------------------------

async function noopAsync(): Promise<void> {
  return undefined;
}

/**
 * Create a Kysely driver that delegates to the unified SqliteDriver interface.
 * Works with both better-sqlite3 and libsql transparently.
 */
function createSqliteKyselyDriver(driver: SqliteDriver) {
  return {
    init: noopAsync,
    async acquireConnection() {
      return {
        executeQuery: async (compiledQuery: { sql: string; parameters: unknown[] }) => {
          const sql = compiledQuery.sql.trimStart();
          const isSelect = /^(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(sql);
          const hasReturning = /\bRETURNING\b/i.test(sql);

          if (isSelect || hasReturning) {
            const rows = await driver.queryAll(compiledQuery.sql, compiledQuery.parameters);
            return {
              rows,
              numAffectedRows: BigInt(rows.length),
            };
          } else {
            const result = await driver.execute(compiledQuery.sql, compiledQuery.parameters);
            return {
              rows: [],
              numAffectedRows: BigInt(result.changes),
            };
          }
        },
        streamQuery: () => {
          throw new Error('Streaming not supported with SQLite driver bridge');
        },
      };
    },
    beginTransaction: noopAsync,
    commitTransaction: noopAsync,
    rollbackTransaction: noopAsync,
    releaseConnection: noopAsync,
    destroy: noopAsync,
  };
}

function createPostgresJsDriver(client: PgClient) {
  return {
    init: noopAsync,
    async acquireConnection() {
      return {
        executeQuery: async (compiledQuery: { sql: string; parameters: unknown[] }) => {
          // postgres.js uses $1, $2 placeholders natively
          const result = await client.unsafe(compiledQuery.sql, compiledQuery.parameters);

          return {
            rows: result as Record<string, unknown>[],
            numAffectedRows: BigInt(result.length),
          };
        },
        streamQuery: () => {
          throw new Error('Streaming not supported with postgres.js driver bridge');
        },
      };
    },
    beginTransaction: noopAsync,
    commitTransaction: noopAsync,
    rollbackTransaction: noopAsync,
    releaseConnection: noopAsync,
    destroy: noopAsync,
  };
}
