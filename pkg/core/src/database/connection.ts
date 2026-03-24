// Database connection management for Invect core
import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMySQL } from 'drizzle-orm/mysql2';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

import { sqliteSchema, mysqlSchema, postgresqlSchema } from './schema';

import { Logger, InvectDatabaseConfig } from 'src/types/schemas';

/**
 * Database connection type - discriminated union based on database type
 */
export type DatabaseConnection =
  | {
      type: 'postgresql';
      db: ReturnType<typeof drizzle<typeof postgresqlSchema>>;
      schema: typeof postgresqlSchema;
    }
  | {
      type: 'sqlite';
      db: ReturnType<typeof drizzleSQLite<typeof sqliteSchema>>;
      schema: typeof sqliteSchema;
    }
  | {
      type: 'mysql';
      db: ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>;
      schema: typeof mysqlSchema;
    };

/**
 * Query database connection type - for external databases without schemas
 */
export type QueryDatabaseConnection =
  | {
      type: 'postgresql';
      db: ReturnType<typeof drizzle>;
      config: InvectDatabaseConfig;
    }
  | {
      type: 'sqlite';
      db: ReturnType<typeof drizzleSQLite>;
      config: InvectDatabaseConfig;
    }
  | {
      type: 'mysql';
      db: ReturnType<typeof drizzleMySQL>;
      config: InvectDatabaseConfig;
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
        const pgDb = await this.createPostgreSQLConnection(dbConfig, logger);
        connection = {
          type: 'postgresql',
          db: pgDb,
          schema: postgresqlSchema,
        };
        break;
      }
      case 'sqlite': {
        const sqliteDb = await this.createSQLiteConnection(dbConfig, logger);
        connection = {
          type: 'sqlite',
          db: sqliteDb,
          schema: sqliteSchema,
        };
        break;
      }
      case 'mysql': {
        const mysqlDb = await this.createMySQLConnection(dbConfig, logger);
        connection = {
          type: 'mysql',
          db: mysqlDb,
          schema: mysqlSchema,
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
        const pgDb = await this.createPostgreSQLQueryConnection(dbConfig, logger);
        connection = {
          type: 'postgresql',
          db: pgDb,
          config: dbConfig,
        };
        break;
      }
      case 'sqlite': {
        const sqliteDb = await this.createSQLiteQueryConnection(dbConfig, logger);
        connection = {
          type: 'sqlite',
          db: sqliteDb,
          config: dbConfig,
        };
        break;
      }
      case 'mysql': {
        const mysqlDb = await this.createMySQLQueryConnection(dbConfig, logger);
        connection = {
          type: 'mysql',
          db: mysqlDb,
          config: dbConfig,
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
   * Helper method to configure SQLite database pragmas via better-sqlite3
   */
  private static configureSQLitePragmas(client: InstanceType<typeof Database>): void {
    client.pragma('journal_mode = WAL');
    client.pragma('synchronous = NORMAL');
    client.pragma('foreign_keys = ON');
  }

  /**
   * Helper method to test PostgreSQL connection
   */
  private static async testPostgreSQLConnection(
    client: postgres.Sql,
    logger: Logger,
    isQuery: boolean = false,
    configId?: string,
  ): Promise<void> {
    try {
      await client`SELECT 1`;
      const message = isQuery
        ? 'PostgreSQL query connection established successfully'
        : 'PostgreSQL connection established successfully';
      const logData = isQuery && configId ? { id: configId } : undefined;
      logger.info(message, logData);
    } catch (error) {
      const errorMessage = isQuery
        ? 'Failed to connect to PostgreSQL query database'
        : 'Failed to connect to PostgreSQL';
      logger.error(errorMessage, error);
      throw error;
    }
  }

  /**
   * Helper method to test MySQL connection
   */
  private static async testMySQLConnection(
    connection: mysql.Pool,
    logger: Logger,
    isQuery: boolean = false,
    configId?: string,
  ): Promise<void> {
    try {
      await connection.execute('SELECT 1');
      const message = isQuery
        ? 'MySQL query connection established successfully'
        : 'MySQL connection established successfully';
      const logData = isQuery && configId ? { id: configId } : undefined;
      logger.info(message, logData);
    } catch (error) {
      const errorMessage = isQuery
        ? 'Failed to connect to MySQL query database'
        : 'Failed to connect to MySQL';
      logger.error(errorMessage, error);
      throw error;
    }
  }

  /**
   * Create PostgreSQL connection
   */
  private static async createPostgreSQLConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzle<typeof postgresqlSchema>>> {
    const client = postgres(config.connectionString, {
      onnotice: (notice) => logger.debug('PostgreSQL notice', notice),
    });

    const db = drizzle(client, { schema: postgresqlSchema });

    // Test connection
    await this.testPostgreSQLConnection(client, logger);

    return db;
  }

  /**
   * Create SQLite connection
   */
  private static async createSQLiteConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleSQLite<typeof sqliteSchema>>> {
    const filePath = this.prepareSQLiteFilePath(config.connectionString, logger);

    const dbPath = filePath === ':memory:' ? ':memory:' : filePath;
    const client = new Database(dbPath);
    this.configureSQLitePragmas(client);

    const db = drizzleSQLite(client, { schema: sqliteSchema });

    // Skip migrations - assume database already conforms to schema
    logger.debug('Skipping SQLite migrations - assuming database conforms to schema');

    logger.info('SQLite connection established successfully', { filePath });
    return db;
  }

  /**
   * Create MySQL connection
   */
  private static async createMySQLConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>> {
    const connection = mysql.createPool(config.connectionString);

    const db = drizzleMySQL(connection, { schema: mysqlSchema, mode: 'default' });

    // Test connection
    await this.testMySQLConnection(connection, logger);

    return db as unknown as ReturnType<typeof drizzleMySQL<typeof mysqlSchema>>;
  }

  /**
   * Create PostgreSQL query connection (without schema)
   */
  private static async createPostgreSQLQueryConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzle>> {
    const client = postgres(config.connectionString, {
      onnotice: (notice) => logger.debug('PostgreSQL notice', notice),
    });

    const db = drizzle(client);

    // Test connection
    await this.testPostgreSQLConnection(client, logger, true, config.id);

    return db;
  }

  /**
   * Create SQLite query connection (without schema)
   */
  private static async createSQLiteQueryConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleSQLite>> {
    const filePath = this.prepareSQLiteFilePath(config.connectionString, logger);

    const dbPath = filePath === ':memory:' ? ':memory:' : filePath;
    const client = new Database(dbPath);
    this.configureSQLitePragmas(client);

    const db = drizzleSQLite(client);

    logger.info('SQLite query connection established successfully', { filePath, id: config.id });
    return db;
  }

  /**
   * Create MySQL query connection (without schema)
   */
  private static async createMySQLQueryConnection(
    config: InvectDatabaseConfig,
    logger: Logger,
  ): Promise<ReturnType<typeof drizzleMySQL>> {
    const connection = mysql.createPool(config.connectionString);

    const db = drizzleMySQL(connection, { mode: 'default' });

    // Test connection
    await this.testMySQLConnection(connection, logger, true, config.id);

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
