// Database connection management for Invect core
import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMySQL } from 'drizzle-orm/mysql2';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { sqliteSchema, mysqlSchema, postgresqlSchema } from './schema';
import type { DatabaseDriver } from './drivers/types';
import { createDatabaseDriver, resolveDatabaseDriverType } from './drivers';

import { Logger, InvectDatabaseConfig } from 'src/schemas';

/**
 * Drizzle SQLite ORM instance type.
 * Covers both better-sqlite3 and libsql drivers (they share the same schema API).
 */
type DrizzleSQLiteDb<S extends Record<string, unknown> = Record<string, unknown>> = ReturnType<
  typeof drizzleSQLite<S>
>;

/**
 * Database connection type - discriminated union based on database type.
 *
 * Every variant carries a `driver: DatabaseDriver` that provides a uniform
 * async interface for raw SQL execution. Use `connection.driver` for raw
 * queries instead of reaching into Drizzle's `$client`.
 */
export type DatabaseConnection =
  | {
      type: 'postgresql';
      db: ReturnType<typeof drizzle<typeof postgresqlSchema>>;
      schema: typeof postgresqlSchema;
      driver: DatabaseDriver;
    }
  | {
      type: 'sqlite';
      db: DrizzleSQLiteDb<typeof sqliteSchema>;
      schema: typeof sqliteSchema;
      driver: DatabaseDriver;
    }
  | {
      type: 'mysql';
      db: ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>;
      schema: typeof mysqlSchema;
      driver: DatabaseDriver;
    };

/**
 * Query database connection type - for external databases without schemas
 */
export type QueryDatabaseConnection =
  | {
      type: 'postgresql';
      db: ReturnType<typeof drizzle>;
      config: InvectDatabaseConfig;
      driver: DatabaseDriver;
    }
  | {
      type: 'sqlite';
      db: DrizzleSQLiteDb;
      config: InvectDatabaseConfig;
      driver: DatabaseDriver;
    }
  | {
      type: 'mysql';
      db: ReturnType<typeof drizzleMySQL>;
      config: InvectDatabaseConfig;
      driver: DatabaseDriver;
    };

/**
 * Database connection factory
 */
export class DatabaseConnectionFactory {
  private static connections = new Map<string, DatabaseConnection>();
  private static queryConnections = new Map<string, QueryDatabaseConnection>();

  /**
   * Create a database connection for the host database Invect runs on
   */
  static async createHostDBConnection(
    dbConfig: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<DatabaseConnection> {
    const connectionKey = this.generateConnectionKey(dbConfig);

    if (this.connections.has(connectionKey)) {
      logger.debug('Reusing existing database connection', { type: dbConfig.type });
      return this.connections.get(connectionKey) as DatabaseConnection;
    }

    logger.info('Creating new database connection', { type: dbConfig.type });

    let connection: DatabaseConnection;

    switch (dbConfig.type) {
      case 'postgresql': {
        const driver = await createDatabaseDriver(dbConfig, logger);
        const pgDb = await this.createPostgreSQLConnection(dbConfig, driver, logger);
        connection = {
          type: 'postgresql',
          db: pgDb,
          schema: postgresqlSchema,
          driver,
        };
        break;
      }
      case 'sqlite': {
        const { db: sqliteDb, driver } = await this.createSQLiteConnection(dbConfig, logger);
        connection = {
          type: 'sqlite',
          db: sqliteDb,
          schema: sqliteSchema,
          driver,
        };
        break;
      }
      case 'mysql': {
        const driver = await createDatabaseDriver(dbConfig, logger);
        const mysqlDb = await this.createMySQLConnection(dbConfig, driver, logger);
        connection = {
          type: 'mysql',
          db: mysqlDb,
          schema: mysqlSchema,
          driver,
        };
        break;
      }
      default:
        throw new Error(`Unsupported database type: ${dbConfig.type}`);
    }

    this.connections.set(connectionKey, connection);
    return connection;
  }

  /**
   * Create a database connection for external query databases (without schema)
   */
  static async createQueryDbConnection(
    dbConfig: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<QueryDatabaseConnection> {
    const connectionKey = this.generateQueryConnectionKey(dbConfig);

    if (this.queryConnections.has(connectionKey)) {
      logger.debug('Reusing existing query database connection', {
        type: dbConfig.type,
        id: dbConfig.id,
      });
      return this.queryConnections.get(connectionKey) as QueryDatabaseConnection;
    }

    logger.info('Creating new query database connection', { type: dbConfig.type, id: dbConfig.id });

    let connection: QueryDatabaseConnection;

    switch (dbConfig.type) {
      case 'postgresql': {
        const driver = await createDatabaseDriver(dbConfig, logger);
        const pgDb = await this.createPostgreSQLQueryConnection(dbConfig, driver, logger);
        connection = {
          type: 'postgresql',
          db: pgDb,
          config: dbConfig,
          driver,
        };
        break;
      }
      case 'sqlite': {
        const { db: sqliteDb, driver } = await this.createSQLiteQueryConnection(dbConfig, logger);
        connection = {
          type: 'sqlite',
          db: sqliteDb,
          config: dbConfig,
          driver,
        };
        break;
      }
      case 'mysql': {
        const driver = await createDatabaseDriver(dbConfig, logger);
        const mysqlDb = await this.createMySQLQueryConnection(dbConfig, driver, logger);
        connection = {
          type: 'mysql',
          db: mysqlDb,
          config: dbConfig,
          driver,
        };
        break;
      }
      default:
        throw new Error(`Unsupported database type: ${dbConfig.type}`);
    }

    this.queryConnections.set(connectionKey, connection);
    return connection;
  }

  /**
   * Helper method to prepare SQLite file path and ensure directory exists
   */
  private static prepareSQLiteFilePath(connectionString: string, logger: Logger): string {
    // Extract file path from SQLite URL
    let filePath = connectionString.replace('sqlite:', '').replace('file:', '');

    // Ensure the directory exists for SQLite files
    if (filePath !== ':memory:') {
      // Resolve relative paths to absolute paths
      if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(process.cwd(), filePath);
      }

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('Created SQLite database directory', { dir });
      }
    }

    return filePath;
  }

  /**
   * Helper method to configure SQLite database pragmas via better-sqlite3.
   * Only used for the better-sqlite3 direct Drizzle path; the DatabaseDriver
   * abstraction handles pragmas internally.
   */
  private static configureSQLitePragmas(client: InstanceType<typeof Database>): void {
    client.pragma('journal_mode = WAL');
    client.pragma('synchronous = NORMAL');
    client.pragma('foreign_keys = ON');
  }

  /**
   * Create PostgreSQL Drizzle ORM instance.
   *
   * The `driver` has already been created and tested. We create a *second*
   * client handle for Drizzle because each Drizzle adapter constructor
   * expects its own driver-specific client. The `DatabaseDriver` and the
   * Drizzle instance share the same underlying connection pool/endpoint.
   */
  private static async createPostgreSQLConnection(
    config: InvectDatabaseConfig,
    driver: DatabaseDriver,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzle<typeof postgresqlSchema>>> {
    return this.createDrizzlePostgresDb(
      config,
      driver,
      logger,
      postgresqlSchema,
    ) as unknown as ReturnType<typeof drizzle<typeof postgresqlSchema>>;
  }

  /**
   * Create a Drizzle PostgreSQL instance for the given driver type.
   * Dynamically imports the correct Drizzle adapter so unused packages
   * are never loaded.
   */
  private static async createDrizzlePostgresDb(
    config: InvectDatabaseConfig,
    driver: DatabaseDriver,
    logger: Logger,
    schema?: Record<string, unknown>,
  ): Promise<unknown> {
    switch (driver.type) {
      case 'postgres': {
        const postgres = (await import('postgres')).default;
        const client = postgres(config.connectionString, {
          onnotice: (notice: unknown) => logger.debug('PostgreSQL notice', notice),
        });
        return schema ? drizzle(client, { schema }) : drizzle(client);
      }
      case 'pg': {
        const { Pool } = await import('pg');
        const { drizzle: drizzleNodePg } = await import('drizzle-orm/node-postgres');
        const pool = new Pool({ connectionString: config.connectionString });
        return schema ? drizzleNodePg(pool, { schema }) : drizzleNodePg(pool);
      }
      case 'neon-serverless': {
        // @ts-ignore — @neondatabase/serverless is an optional dependency
        const neonMod = await import('@neondatabase/serverless');
        const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');

        const pool = new (neonMod.Pool as new (o: Record<string, unknown>) => unknown)({
          connectionString: config.connectionString,
        });
        return schema ? drizzleNeon(pool, { schema }) : drizzleNeon(pool);
      }
      default:
        throw new Error(`Unsupported PostgreSQL driver type: ${driver.type}`);
    }
  }

  /**
   * Create SQLite connection.
   *
   * Resolves the driver type from config, creates
   * both the Drizzle ORM instance and the raw DatabaseDriver handle.
   */
  private static async createSQLiteConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<{
    db: DrizzleSQLiteDb<typeof sqliteSchema>;
    driver: DatabaseDriver;
  }> {
    const filePath = this.prepareSQLiteFilePath(config.connectionString, logger);
    const driverType = resolveDatabaseDriverType(config);

    // Create the unified driver (handles pragmas internally).
    const driver = await createDatabaseDriver(config, logger, filePath);

    let db: DrizzleSQLiteDb<typeof sqliteSchema>;

    if (driverType === 'libsql') {
      const { createClient } = await import('@libsql/client');
      const { drizzle: drizzleLibSQL } = await import('drizzle-orm/libsql');
      const isRemote =
        config.connectionString.startsWith('libsql://') ||
        config.connectionString.startsWith('https://');
      const url = isRemote ? config.connectionString : `file:${filePath}`;
      const client = createClient({ url });
      db = drizzleLibSQL(client, { schema: sqliteSchema }) as unknown as DrizzleSQLiteDb<
        typeof sqliteSchema
      >;
    } else {
      const dbPath = filePath === ':memory:' ? ':memory:' : filePath;
      const client = new Database(dbPath);
      this.configureSQLitePragmas(client);
      db = drizzleSQLite(client, { schema: sqliteSchema });
    }

    // Skip migrations - assume database already conforms to schema
    logger.debug('Skipping SQLite migrations - assuming database conforms to schema');

    return { db, driver };
  }

  /**
   * Create MySQL Drizzle ORM instance.
   *
   * The `driver` has already been created and tested.
   */
  private static async createMySQLConnection(
    config: InvectDatabaseConfig,
    _driver: DatabaseDriver,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>> {
    const mysql = await import('mysql2/promise');
    const connection = mysql.createPool(config.connectionString);
    const db = drizzleMySQL(connection, { schema: mysqlSchema, mode: 'default' });
    logger.debug('MySQL Drizzle ORM instance created');
    return db as unknown as ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>;
  }

  /**
   * Create PostgreSQL query connection (without schema)
   */
  private static async createPostgreSQLQueryConnection(
    config: InvectDatabaseConfig,
    driver: DatabaseDriver,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzle>> {
    return this.createDrizzlePostgresDb(config, driver, logger) as unknown as ReturnType<
      typeof drizzle
    >;
  }

  /**
   * Create SQLite query connection (without schema)
   */
  private static async createSQLiteQueryConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<{
    db: DrizzleSQLiteDb;
    driver: DatabaseDriver;
  }> {
    const filePath = this.prepareSQLiteFilePath(config.connectionString, logger);
    const driverType = resolveDatabaseDriverType(config);

    const driver = await createDatabaseDriver(config, logger, filePath);

    let db: DrizzleSQLiteDb;

    if (driverType === 'libsql') {
      const { createClient } = await import('@libsql/client');
      const { drizzle: drizzleLibSQL } = await import('drizzle-orm/libsql');
      const isRemote =
        config.connectionString.startsWith('libsql://') ||
        config.connectionString.startsWith('https://');
      const url = isRemote ? config.connectionString : `file:${filePath}`;
      const client = createClient({ url });
      db = drizzleLibSQL(client) as unknown as DrizzleSQLiteDb;
    } else {
      const dbPath = filePath === ':memory:' ? ':memory:' : filePath;
      const client = new Database(dbPath);
      this.configureSQLitePragmas(client);
      db = drizzleSQLite(client);
    }

    logger.info('SQLite query connection established successfully', { filePath, id: config.id });
    return { db, driver };
  }

  /**
   * Create MySQL query connection (without schema)
   */
  private static async createMySQLQueryConnection(
    config: InvectDatabaseConfig,
    _driver: DatabaseDriver,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleMySQL>> {
    const mysql = await import('mysql2/promise');
    const connection = mysql.createPool(config.connectionString);
    const db = drizzleMySQL(connection, { mode: 'default' });
    logger.debug('MySQL Drizzle query instance created');
    return db as unknown as ReturnType<typeof drizzleMySQL>;
  }

  /**
   * Generate a unique key for connection caching
   */
  private static generateConnectionKey(config: InvectDatabaseConfig): string {
    return `${config.type}:${config.connectionString}`;
  }

  /**
   * Generate a unique key for query connection caching
   */
  private static generateQueryConnectionKey(config: InvectDatabaseConfig): string {
    return `query:${config.type}:${config.id}:${config.connectionString}`;
  }

  /**
   * Close all connections
   */
  static async closeAllConnections(logger: Logger): Promise<void> {
    logger.info('Closing all database connections');

    // Close host database connections
    for (const [key, _connection] of this.connections) {
      try {
        // The connections are not directly closeable in Drizzle,
        // but the underlying clients handle cleanup
        logger.debug('Host connection closed', { key });
      } catch (error) {
        logger.error('Error closing host connection', { key, error });
      }
    }

    // Close query database connections
    for (const [key, _connection] of this.queryConnections) {
      try {
        // The connections are not directly closeable in Drizzle,
        // but the underlying clients handle cleanup
        logger.debug('Query connection closed', { key });
      } catch (error) {
        logger.error('Error closing query connection', { key, error });
      }
    }

    this.connections.clear();
    this.queryConnections.clear();
  }

  /**
   * Get schema for database type
   */
  static getSchema(type: InvectDatabaseConfig['type']) {
    switch (type) {
      case 'postgresql':
        return postgresqlSchema;
      case 'sqlite':
        return sqliteSchema;
      case 'mysql':
        return mysqlSchema;
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }
}
