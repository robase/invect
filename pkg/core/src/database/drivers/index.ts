/**
 * Database driver factory.
 *
 * Resolves the driver type from config and lazily imports the correct
 * implementation so unused driver packages are never loaded.
 */

export type { DatabaseDriver, DatabaseDriverType } from './types';
import type { DatabaseDriver, DatabaseDriverType } from './types';
import type { InvectDatabaseConfig, Logger } from 'src/schemas';

// ---------------------------------------------------------------------------
// Driver resolution
// ---------------------------------------------------------------------------

/**
 * Resolve which driver to use for the given database config.
 *
 * Priority:
 * 1. Explicit `config.driver` (user override)
 * 2. Heuristic from connection string
 * 3. Dialect default
 */
export function resolveDatabaseDriverType(config: InvectDatabaseConfig): DatabaseDriverType {
  if (config.driver) {
    return config.driver;
  }

  switch (config.type) {
    case 'sqlite':
      return config.connectionString.startsWith('libsql://') ? 'libsql' : 'better-sqlite3';
    case 'postgresql':
      if (config.connectionString.includes('.neon.tech')) {
        return 'neon-serverless';
      }
      return 'postgres';
    case 'mysql':
      return 'mysql2';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `DatabaseDriver` for the given config.
 *
 * For SQLite, `filePath` is the resolved path to the database file
 * (already prepared by `DatabaseConnectionFactory.prepareSQLiteFilePath`).
 */
export async function createDatabaseDriver(
  config: InvectDatabaseConfig,
  logger: Logger,
  /** Resolved file path — only needed for SQLite. */
  sqliteFilePath?: string,
): Promise<DatabaseDriver> {
  const driverType = resolveDatabaseDriverType(config);

  switch (driverType) {
    // SQLite
    case 'better-sqlite3': {
      const { createBetterSqlite3Driver } = await import('./better-sqlite3');
      return createBetterSqlite3Driver(sqliteFilePath ?? ':memory:', logger);
    }
    case 'libsql': {
      const { createLibsqlDriver } = await import('./libsql');
      return createLibsqlDriver(config.connectionString, sqliteFilePath ?? ':memory:', logger);
    }

    // PostgreSQL
    case 'postgres': {
      const { createPostgresJsDriver } = await import('./postgres-js');
      return createPostgresJsDriver(config.connectionString, logger);
    }
    case 'pg': {
      const { createNodePostgresDriver } = await import('./node-postgres');
      return createNodePostgresDriver(config.connectionString, logger);
    }
    case 'neon-serverless': {
      const { createNeonServerlessDriver } = await import('./neon-serverless');
      return createNeonServerlessDriver(config.connectionString, logger);
    }

    // MySQL
    case 'mysql2': {
      const { createMysql2Driver } = await import('./mysql2');
      return createMysql2Driver(config.connectionString, logger);
    }
  }
}
