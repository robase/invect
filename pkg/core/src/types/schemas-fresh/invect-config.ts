import { z } from 'zod/v4';
import { ChatConfigSchema } from 'src/services/chat/chat-types';

const databaseConfigSchema = z.object({
  connectionString: z.string().min(1, 'Database URL is required'),
  type: z.enum(['postgresql', 'sqlite', 'mysql']),
  id: z.string(), // Optional ID for the database, useful for multi-database setups
  name: z.string().optional(), // Human readable name for the database
});

export type InvectDatabaseConfig = z.infer<typeof databaseConfigSchema>;

/**
 * Database configuration schema
 */
export const queryDatabasesConfigSchema = z
  .array(databaseConfigSchema)
  .optional()
  .default(() => []);

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
 * Built-in Invect roles
 */
export const InvectRoleSchema = z.enum(['admin', 'editor', 'operator', 'viewer']);

/**
 * Invect permissions
 */
export const InvectPermissionSchema = z.enum([
  // Flow permissions
  'flow:create',
  'flow:read',
  'flow:update',
  'flow:delete',
  'flow:publish',
  // Flow version permissions
  'flow-version:create',
  'flow-version:read',
  // Execution permissions
  'flow-run:create',
  'flow-run:read',
  'flow-run:cancel',
  // Credential permissions
  'credential:create',
  'credential:read',
  'credential:update',
  'credential:delete',
  // Agent/tool permissions
  'agent-tool:read',
  'agent-tool:configure',
  // Node testing
  'node:test',
  // Admin wildcard
  'admin:*',
]);

/**
 * Authentication/Authorization configuration schema.
 *
 * Invect uses a "BYO Auth" (Bring Your Own Authentication) pattern.
 * The host app handles authentication and provides user identity to Invect.
 * Invect handles authorization based on roles and permissions.
 *
 * @example
 * ```typescript
 * const config = {
 *   auth: {
 *     enabled: true,
 *     resolveUser: async (req) => ({
 *       id: req.user.id,
 *       role: req.user.invectRole,
 *     }),
 *     roleMapper: {
 *       'super_admin': 'admin',
 *       'content_manager': 'editor',
 *     },
 *   }
 * };
 * ```
 */
export const InvectAuthConfigSchema = z.object({
  /**
   * Enable RBAC (Role-Based Access Control).
   * When false, all requests are allowed without authentication checks.
   * @default false
   */
  enabled: z.boolean().default(false),

  /**
   * Function to resolve user identity from incoming request.
   * This is provided at runtime, not validated by Zod.
   */
  resolveUser: z.any().optional(),

  /**
   * Map host app roles to Invect roles.
   */
  roleMapper: z.record(z.string(), z.string()).optional(),

  /**
   * Define custom roles with specific permissions.
   */
  customRoles: z.record(z.string(), z.array(InvectPermissionSchema)).optional(),

  /**
   * Custom authorization callback (provided at runtime).
   */
  customAuthorize: z.any().optional(),

  /**
   * Routes that don't require authentication.
   */
  publicRoutes: z.array(z.string()).optional(),

  /**
   * Default role for authenticated users without explicit role.
   */
  defaultRole: z.string().default('viewer'),

  /**
   * Behavior when auth fails.
   */
  onAuthFailure: z.enum(['throw', 'log', 'deny']).default('throw'),

  /**
   * Use the flow_access database table to manage flow-level permissions.
   * When enabled, Invect stores flow access records in its own database.
   * @default false
   */
  useFlowAccessTable: z.boolean().default(false),
});

/**
 * Core Invect configuration schema
 */
export const InvectConfigSchema = z.object({
  queryDatabases: queryDatabasesConfigSchema.optional(),
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
   * Authentication and authorization configuration.
   * When not provided, auth is disabled (all requests allowed).
   */
  auth: InvectAuthConfigSchema.optional(),
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
   * Chat assistant configuration.
   * Controls the AI chat sidebar for flow building assistance.
   */
  chat: ChatConfigSchema.optional(),
  /**
   * Plugins extend Invect with additional capabilities:
   * actions, hooks, endpoints, database schema, and middleware.
   *
   * Plugins are plain objects satisfying the `InvectPlugin` interface.
   * They are initialized in array order during `Invect.initialize()`.
   *
   * Database schema changes from plugins require running `npx invect generate`
   * to regenerate the Drizzle schema files, then `npx invect migrate` to apply.
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
   * Schema verification configuration.
   *
   * When enabled, Invect checks on startup that the database has all
   * required tables and columns. This does NOT run migrations — the
   * developer is responsible for applying schema changes via the CLI:
   *
   *   npx invect generate    # regenerate schema files
   *   npx drizzle-kit push    # apply via Drizzle
   *   npx prisma db push      # apply via Prisma
   *
   * @example
   * ```typescript
   * const config = {
   *   schemaVerification: true,           // warn on missing tables/columns
   *   // or
   *   schemaVerification: { strict: true }, // throw on missing tables/columns
   * };
   * ```
   */
  schemaVerification: z
    .union([
      z.boolean(),
      z.object({
        /** If true, throw an error when schema is invalid. If false, only log warnings. */
        strict: z.boolean().default(false),
      }),
    ])
    .optional(),
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
export type QueryDatabasesConfig = z.infer<typeof queryDatabasesConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type InvectAuthConfigZod = z.infer<typeof InvectAuthConfigSchema>;
export type InvectConfig = z.infer<typeof InvectConfigSchema>;

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
