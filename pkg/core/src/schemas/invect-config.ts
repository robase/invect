import { z } from 'zod/v4';

const databaseConfigSchema = z.object({
  connectionString: z.string().min(1, 'Database URL is required'),
  type: z.enum(['postgresql', 'sqlite', 'mysql']),
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
  database: databaseConfigSchema,
  /**
   * AES-256-GCM encryption key for credential storage (base64-encoded, 32 bytes).
   *
   * Generate with: `npx invect-cli secret`
   */
  encryptionKey: z
    .string()
    .min(1, 'encryptionKey is required. Generate one with: npx invect-cli secret'),
  logging: LoggingConfigSchema.default(() => ({
    level: 'info' as const,
  })).optional(),
  logger: z.any().optional(),
  /**
   * The path where the Invect frontend UI is mounted.
   * @example '/invect'
   */
  frontendPath: z.string().optional(),
  /**
   * The path where the Invect API is mounted.
   * Used by the frontend to make API requests.
   * @example '/api/invect'
   */
  apiPath: z.string().optional(),

  /**
   * UI theme mode.
   * - `'light'` — Light theme
   * - `'dark'`  — Dark theme
   * - `'system'` — Follow OS preference
   * @default 'dark'
   */
  theme: z.enum(['light', 'dark', 'system']).default('dark').optional(),

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
   * actions, hooks, endpoints, database schema, frontend UI, and middleware.
   *
   * Each plugin is an `InvectPluginDefinition` with `{ id, backend?, frontend? }`.
   * Use plugin factory functions which accept a `frontend` option for the UI.
   *
   * The backend extracts `.backend`, the `<Invect>` component extracts `.frontend`.
   *
   * @example
   * ```typescript
   * import { auth } from '@invect/user-auth';
   * import { authFrontend } from '@invect/user-auth/ui';
   * import { rbac } from '@invect/rbac';
   *
   * const config = defineConfig({
   *   plugins: [
   *     auth({ frontend: authFrontend, adminEmail: '...' }),
   *     rbac(),
   *   ],
   * });
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
      z.discriminatedUnion('type', [
        // LLM credentials require a provider
        z.object({
          name: z.string(),
          type: z.literal('llm'),
          provider: z.string(),
          authType: z.string(),
          config: z.record(z.string(), z.unknown()),
          description: z.string().optional(),
          isShared: z.boolean().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
        // Non-LLM credentials have an optional provider
        z.object({
          name: z.string(),
          type: z.literal('http-api'),
          provider: z.string().optional(),
          authType: z.string(),
          config: z.record(z.string(), z.unknown()),
          description: z.string().optional(),
          isShared: z.boolean().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
        z.object({
          name: z.string(),
          type: z.literal('database'),
          provider: z.string().optional(),
          authType: z.string(),
          config: z.record(z.string(), z.unknown()),
          description: z.string().optional(),
          isShared: z.boolean().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      ]),
    )
    .optional(),
});

/**
 * Type inference from schemas
 */
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type InvectConfig = z.infer<typeof InvectConfigSchema>;

/**
 * Identity function that provides TypeScript type inference and
 * autocompletion for Invect configuration objects.
 *
 * No runtime validation, transformation, or side effects — same pattern
 * as Vite's `defineConfig`, Drizzle's `defineConfig`, etc.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@invect/core';
 *
 * export default defineConfig({
 *   database: {
 *     type: 'sqlite',
 *     connectionString: 'file:./dev.db',
 *   },
 * });
 * ```
 */
export function defineConfig(config: InvectConfig): InvectConfig {
  return config;
}

/**
 * Identity function that provides TypeScript type inference for
 * unified plugin definitions with backend + frontend parts.
 *
 * @example
 * ```typescript
 * import { definePlugin } from '@invect/core';
 *
 * export const myPlugin = definePlugin({
 *   id: 'my-plugin',
 *   backend: backendPlugin,
 *   frontend: frontendPlugin,
 * });
 * ```
 */
export function definePlugin<T extends { id: string; backend?: unknown; frontend?: unknown }>(
  plugin: T,
): T {
  return plugin;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
