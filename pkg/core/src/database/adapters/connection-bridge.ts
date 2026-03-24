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
      // Drizzle's better-sqlite3 driver exposes $client which is a Database instance.
      // We wrap it as a Kysely SqliteDialect driver.
      const sqliteDb = (connection.db as unknown as { $client: BetterSqlite3Database }).$client;

      return new Kysely({
        dialect: {
          createAdapter: () => new SqliteAdapter(),
          createDriver: () => createBetterSqlite3Driver(sqliteDb),
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

interface BetterSqlite3Database {
  prepare(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
}

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

function createBetterSqlite3Driver(db: BetterSqlite3Database) {
  return {
    init: noopAsync,
    async acquireConnection() {
      return {
        executeQuery: async (compiledQuery: { sql: string; parameters: unknown[] }) => {
          // Detect if this is a SELECT/RETURNING query or a mutation
          const sql = compiledQuery.sql.trimStart();
          const isSelect = /^(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(sql);
          const hasReturning = /\bRETURNING\b/i.test(sql);

          if (isSelect || hasReturning) {
            const rows = db.prepare(compiledQuery.sql).all(...compiledQuery.parameters);
            return {
              rows,
              numAffectedRows: BigInt(rows.length),
            };
          } else {
            const result = db.prepare(compiledQuery.sql).run(...compiledQuery.parameters);
            return {
              rows: [],
              numAffectedRows: BigInt(result.changes),
              insertId:
                result.lastInsertRowid !== undefined ? BigInt(result.lastInsertRowid) : undefined,
            };
          }
        },
        streamQuery: () => {
          throw new Error('Streaming not supported with better-sqlite3 driver');
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
