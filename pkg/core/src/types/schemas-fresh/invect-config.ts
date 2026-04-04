import { z } from 'zod/v4';

const databaseConfigSchema = z.object({
  connectionString: z.string().min(1, 'Database URL is required'),
  type: z.enum(['postgresql', 'sqlite', 'mysql']),
  id: z.string(), // Optional ID for the database, useful for multi-database setups
  name: z.string().optional(), // Human readable name for the database
  /**
   * Underlying driver package to use for database connections.
   * When omitted, a sensible default is chosen per dialect:
   *
   * **PostgreSQL** (default: `'postgres'`):
   * - `'postgres'`          — postgres.js. Fast, pure JS. Default.
   * - `'pg'`                — node-postgres (Pool). Most popular PG driver.
   * - `'neon-serverless'`   — @neondatabase/serverless. WebSocket-based, for Neon + edge.
   *
   * **SQLite** (default: `'better-sqlite3'`):
   * - `'better-sqlite3'`    — Native C++. Fastest for long-running Node servers.
   * - `'libsql'`            — Pure JS / WASM. Works in serverless/edge + Turso.
   *
   * **MySQL** (default: `'mysql2'`):
   * - `'mysql2'`            — Only supported driver.
   */
  driver: z
    .enum([
      // PostgreSQL
      'postgres',
      'pg',
      'neon-serverless',
      // SQLite
      'better-sqlite3',
      'libsql',
      // MySQL
      'mysql2',
    ])
    .optional(),
});

export type InvectDatabaseConfig = z.infer<typeof databaseConfigSchema>;

/**
 * Execution configuration schema
 */
export const ExecutionConfigSchema = z.object({
  defaultTimeout: z.number().positive().default(60000),
  maxConcurrentExecutions: z.number().positive().default(10),
  enableTracing: z.boolean().default(true),
  /**
   * Maximum time (in ms) a flow run is allowed to stay in RUNNING state
   * before being considered stale and marked as FAILED.
   * @default 600_000 (10 minutes)
   */
  flowTimeoutMs: z.number().positive().default(600_000),
  /**
   * Interval (in ms) at which the heartbeat is updated during flow execution.
   * @default 30_000 (30 seconds)
   */
  heartbeatIntervalMs: z.number().positive().default(30_000),
  /**
   * Interval (in ms) at which the stale run detector polls for stuck runs.
   * @default 60_000 (60 seconds)
   */
  staleRunCheckIntervalMs: z.number().positive().default(60_000),
});

/**
 * Log level enum values
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error', 'silent']);

/**
 * Logging configuration schema with support for scope-level overrides.
 *
 * Scopes allow independent log level control for different feature areas:
 * - execution: Flow execution orchestration
 * - validation: Flow validation
 * - batch: Batch processing (AI providers)
 * - database: Database operations
 * - node: Node execution
 * - graph: Graph operations (topological sort, etc.)
 * - credentials: Credential management
 * - ai: AI/LLM operations
 * - template: Template rendering
 * - renderer: React Flow rendering
 * - flows: Flow management (CRUD)
 * - versions: Flow version management
 * - http: HTTP/API layer
 *
 * @example
 * ```typescript
 * const config = {
 *   logging: {
 *     level: 'info',  // Default level for all scopes
 *     scopes: {
 *       execution: 'debug',  // Verbose execution logging
 *       validation: 'warn',  // Only validation warnings
 *       batch: 'silent',     // Disable batch logging
 *     }
 *   }
 * };
 * ```
 */
export const LoggingConfigSchema = z.object({
  /** Default log level for all scopes */
  level: LogLevelSchema.default('silent'),
  /** Per-scope log level overrides */
  scopes: z.record(z.string(), LogLevelSchema).optional(),
});

/**
 * Core Invect configuration schema
 */
export const InvectConfigSchema = z.object({
  baseDatabaseConfig: databaseConfigSchema,
  logging: LoggingConfigSchema.default(() => ({
    level: 'info' as const,
  })).optional(),
  logger: z.any().optional(),
  basePath: z.string().optional(),
  /**
   * Execution settings: flow timeout, heartbeat interval, stale run detection.
   */
  execution: ExecutionConfigSchema.optional(),

  /**
   * Trigger system configuration.
   * Controls webhook and cron scheduler behavior.
   */
  triggers: z
    .object({
      /**
       * The public-facing base URL where Invect routes are mounted.
       * Used to display the full webhook URL in the flow editor.
       * Example: "https://api.myapp.com/invect"
       */
      webhookBaseUrl: z.string().optional(),
      /**
       * Enable/disable the cron scheduler. When disabled, cron trigger nodes
       * can still be placed on flows but won't fire automatically.
       * @default true
       */
      cronEnabled: z.boolean().default(true),
    })
    .optional(),

  /**
   * Plugins extend Invect with additional capabilities:
   * actions, hooks, endpoints, database schema, and middleware.
   *
   * Plugins are plain objects satisfying the `InvectPlugin` interface.
   * They are initialized in array order during `Invect.initialize()`.
   *
   * Database schema changes from plugins require running `npx invect-cli generate`
   * to regenerate the Drizzle schema files, then `npx invect-cli migrate` to apply.
   *
   * @example
   * ```typescript
   * import { rbac } from '@invect/plugin-rbac';
   * import { auditLog } from '@invect/plugin-audit-log';
   *
   * const config = {
   *   plugins: [
   *     rbac({ resolveUser: (req) => req.user }),
   *     auditLog({ destination: 'database' }),
   *   ],
   * };
   * ```
   */
  plugins: z.array(z.any()).optional(),

  /**
   * Default credentials to ensure on startup.
   *
   * Each entry is created if no credential with the same `name` already exists.
   * Useful for development environments where you want API keys and OAuth
   * tokens available immediately without running a separate seed script.
   *
   * @example
   * ```typescript
   * const config = {
   *   defaultCredentials: [
   *     {
   *       name: 'Anthropic API Key',
   *       type: 'http-api',
   *       authType: 'bearer',
   *       config: { token: process.env.SEED_ANTHROPIC_API_KEY! },
   *       description: 'Seeded Anthropic credential',
   *     },
   *   ],
   * };
   * ```
   */
  defaultCredentials: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        authType: z.string(),
        config: z.record(z.string(), z.unknown()),
        description: z.string().optional(),
        isShared: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

/**
 * Type inference from schemas
 */
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type InvectConfig = z.infer<typeof InvectConfigSchema>;

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
