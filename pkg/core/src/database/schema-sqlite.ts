// SQLite schema for Invect core
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import { JSONValue } from '.';
import { FlowRunStatus, NodeExecutionStatus } from 'src/types/base';
import { BatchStatus, BatchProvider } from 'src/services/ai/base-client';
import { InvectDefinitionRuntime } from 'src/services/flow-versions/schemas-fresh';
import { randomUUID } from 'crypto';

// =============================================================================
// Tables
// =============================================================================

// Flow definition table
export const flows = sqliteTable('flows', {
  id: text('id').primaryKey(), // Will be generated using IdGenerator.generateFlowId()
  name: text('name').notNull(),
  description: text('description'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  liveVersionNumber: integer('live_version_number'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Flow version table to support version history
export const flowVersions = sqliteTable(
  'flow_versions',
  {
    flowId: text('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    invectDefinition: text('invect_definition', { mode: 'json' })
      .$type<InvectDefinitionRuntime>()
      .notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: text('created_by'),
  },
  (table) => [primaryKey({ columns: [table.version, table.flowId] })],
);

// Flow execution table to track execution instances
export const flowRuns = sqliteTable('flow_executions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  flowVersion: integer('flow_version').notNull(),
  status: text('status').$type<FlowRunStatus>().notNull().default(FlowRunStatus.PENDING),
  inputs: text('inputs', { mode: 'json' }).$type<JSONValue>().notNull(),
  outputs: text('outputs', { mode: 'json' }).$type<JSONValue>(),
  error: text('error'),
  startedAt: text('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  duration: integer('duration'), // in milliseconds
  createdBy: text('created_by'),
  // Trigger provenance
  triggerType: text('trigger_type'), // 'manual' | 'webhook' | 'cron' | 'api' | null
  triggerId: text('trigger_id'), // References flow_triggers.id
  triggerNodeId: text('trigger_node_id'), // The trigger node that initiated this run
  triggerData: text('trigger_data', { mode: 'json' }).$type<JSONValue>(), // Webhook payload / cron metadata
  lastHeartbeatAt: text('last_heartbeat_at'), // Updated periodically during execution for stale run detection
});

// Execution trace table to track individual node executions
export const nodeExecutions = sqliteTable('execution_traces', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowRunId: text('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  nodeType: text('node_type').notNull(),
  status: text('status')
    .$type<NodeExecutionStatus>()
    .notNull()
    .default(NodeExecutionStatus.PENDING),
  inputs: text('inputs', { mode: 'json' }).$type<JSONValue>().notNull(),
  outputs: text('outputs', { mode: 'json' }).$type<JSONValue>(),
  error: text('error'),
  startedAt: text('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  duration: integer('duration'), // in milliseconds
  retryCount: integer('retry_count').notNull().default(0),
});

// Batch job table to track batch processing jobs
export const batchJobs = sqliteTable('batch_jobs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowRunId: text('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  provider: text('provider').$type<BatchProvider>().notNull(),
  batchId: text('batch_id'),
  status: text('status').$type<BatchStatus>().notNull().default(BatchStatus.SUBMITTED),
  requestData: text('request_data', { mode: 'json' }).notNull(),
  responseData: text('response_data', { mode: 'json' }),
  error: text('error'),
  submittedAt: text('submitted_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Agent Tool Executions - For tracking individual tool calls during agent execution
// =============================================================================

export const agentToolExecutions = sqliteTable('agent_tool_executions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  // Reference to the node execution (agent node)
  nodeExecutionId: text('node_execution_id')
    .notNull()
    .references(() => nodeExecutions.id, { onDelete: 'cascade' }),
  // Denormalized reference to flow run for efficient querying
  flowRunId: text('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  // Tool identification
  toolId: text('tool_id').notNull(), // The instance ID or base tool ID
  toolName: text('tool_name').notNull(), // Human-readable name
  // Iteration within the agent loop (1-based)
  iteration: integer('iteration').notNull(),
  // Input/output data
  input: text('input', { mode: 'json' }).$type<JSONValue>().notNull(),
  output: text('output', { mode: 'json' }).$type<JSONValue>(),
  error: text('error'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  // Timing
  startedAt: text('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: text('completed_at'),
  duration: integer('duration'), // in milliseconds
});

// =============================================================================
// Credentials - For storing API authentication credentials
// =============================================================================

export type CredentialType =
  | 'http-api' // HTTP/REST APIs, GraphQL, webhooks
  | 'database' // SQL and NoSQL databases
  | 'llm'; // LLM providers (OpenAI, Anthropic, OpenRouter, etc.)

export type CredentialAuthType =
  | 'apiKey' // API Key in header or query
  | 'bearer' // Bearer token
  | 'basic' // Basic auth (username/password)
  | 'oauth2' // OAuth2 tokens
  | 'custom' // Custom headers
  | 'awsSigV4' // AWS Signature V4
  | 'jwt' // JWT token
  | 'connectionString'; // Database connection string

export interface CredentialConfig {
  // For apiKey
  apiKey?: string;
  location?: 'header' | 'query';
  paramName?: string;

  // For bearer
  token?: string;

  // For basic
  username?: string;
  password?: string;

  // For oauth2
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  clientId?: string;
  clientSecret?: string;
  /** OAuth2 provider ID (e.g., "google_docs", "github") */
  oauth2Provider?: string;
  /** Authorization URL (for custom OAuth2 providers) */
  authorizationUrl?: string;
  /** Token URL (for custom OAuth2 providers) */
  tokenUrl?: string;

  // For custom
  headers?: Record<string, string>;

  // For awsSigV4
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  service?: string;

  // For jwt
  algorithm?: string;
  secret?: string;

  // For database connection string
  connectionString?: string;

  // Common
  expiresAt?: string;
  apiUrl?: string;
  baseUrl?: string;
  endpoint?: string;
  [key: string]: unknown;
}

// Credentials table for storing API authentication credentials
export const credentials = sqliteTable('credentials', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),

  // User-friendly name for the credential
  name: text('name').notNull(),

  // Credential type (http-api or database)
  type: text('type').$type<CredentialType>().notNull(),

  // Authentication type
  authType: text('auth_type').$type<CredentialAuthType>().notNull(),

  // Encrypted configuration (contains sensitive data like API keys, tokens, etc.)
  // This should be encrypted at rest using AES-256-GCM
  config: text('config', { mode: 'json' }).$type<CredentialConfig>().notNull(),

  // Optional description for user notes
  description: text('description'),

  // Whether the credential is active (can be disabled without deleting)
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  // Optional workspace for team sharing
  workspaceId: text('workspace_id'),

  // Whether the credential is shared within the workspace
  isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),

  // Additional metadata (e.g., tags, environment, version)
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),

  // Track when the credential was last used
  lastUsedAt: text('last_used_at'),

  // When the credential expires (for tokens with expiration)
  expiresAt: text('expires_at'),

  // Webhook: a unique path so external services can POST to this credential's webhook URL
  webhookPath: text('webhook_path').unique(),
  webhookSecret: text('webhook_secret'),

  // Timestamps
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Flow Triggers - Registration table for webhook/cron/manual triggers
// =============================================================================

/** Trigger type discriminant */
export type TriggerType = 'manual' | 'webhook' | 'cron';

export const flowTriggers = sqliteTable('flow_triggers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  /** The trigger node's ID in the flow graph */
  nodeId: text('node_id').notNull(),
  type: text('type').$type<TriggerType>().notNull(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),

  // Webhook-only: top-level for unique index + O(1) lookup
  webhookPath: text('webhook_path').unique(),
  webhookSecret: text('webhook_secret'),

  // Cron-only: denormalized from node params so scheduler doesn't need to load flow
  cronExpression: text('cron_expression'),
  cronTimezone: text('cron_timezone'),

  lastTriggeredAt: text('last_triggered_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Chat Messages — persisted chat history scoped to flows
// =============================================================================

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant' | 'system' | 'tool'>().notNull(),
  content: text('content').notNull().default(''),
  toolMeta: text('tool_meta', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// =============================================================================
// Relations
// =============================================================================

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  flow: one(flows, {
    fields: [chatMessages.flowId],
    references: [flows.id],
  }),
}));

export const flowsRelations = relations(flows, ({ many, one }) => ({
  versions: many(flowVersions),
  chatMessages: many(chatMessages),
  liveVersion: one(flowVersions, {
    fields: [flows.liveVersionNumber, flows.id],
    references: [flowVersions.version, flowVersions.flowId],
  }),
}));

export const flowVersionsRelations = relations(flowVersions, ({ one, many }) => ({
  flow: one(flows, {
    fields: [flowVersions.flowId],
    references: [flows.id],
  }),
  executions: many(flowRuns),
}));

export const flowRunsRelations = relations(flowRuns, ({ one, many }) => ({
  version: one(flowVersions, {
    fields: [flowRuns.flowVersion, flowRuns.flowId],
    references: [flowVersions.version, flowVersions.flowId],
  }),
  traces: many(nodeExecutions),
  batchJobs: many(batchJobs),
}));

export const nodeExecutionRelations = relations(nodeExecutions, ({ one, many }) => ({
  execution: one(flowRuns, {
    fields: [nodeExecutions.flowRunId],
    references: [flowRuns.id],
  }),
  toolExecutions: many(agentToolExecutions),
}));

export const batchJobsRelations = relations(batchJobs, ({ one }) => ({
  execution: one(flowRuns, {
    fields: [batchJobs.flowRunId],
    references: [flowRuns.id],
  }),
}));

export const agentToolExecutionsRelations = relations(agentToolExecutions, ({ one }) => ({
  nodeExecution: one(nodeExecutions, {
    fields: [agentToolExecutions.nodeExecutionId],
    references: [nodeExecutions.id],
  }),
  flowRun: one(flowRuns, {
    fields: [agentToolExecutions.flowRunId],
    references: [flowRuns.id],
  }),
}));

// Credentials have no direct relations as they're referenced by ID in node params
// Future: Could add credential usage tracking table

// =============================================================================
// Type exports
// =============================================================================

export type Flow = typeof flows.$inferSelect;
export type NewFlow = typeof flows.$inferInsert;

export type FlowVersion = typeof flowVersions.$inferSelect;
export type NewFlowVersion = typeof flowVersions.$inferInsert;

export type FlowRun = typeof flowRuns.$inferSelect;
export type NewFlowRun = typeof flowRuns.$inferInsert;

export type NodeExecution = typeof nodeExecutions.$inferSelect;
export type NewNodeExecution = typeof nodeExecutions.$inferInsert;

export type BatchJob = typeof batchJobs.$inferSelect;
export type NewBatchJob = typeof batchJobs.$inferInsert;

export type AgentToolExecution = typeof agentToolExecutions.$inferSelect;
export type NewAgentToolExecution = typeof agentToolExecutions.$inferInsert;

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

// =============================================================================
// Flow Access Control (RBAC)
// =============================================================================

/**
 * Flow access permission levels: "owner" | "editor" | "operator" | "viewer"
 */
export type FlowAccessPermission = 'owner' | 'editor' | 'operator' | 'viewer';

/**
 * Flow access table - tracks who can access which flows.
 * Supports both user-level and team-level access.
 */
export const flowAccess = sqliteTable('flow_access', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),

  // Either userId OR teamId is set (not both)
  userId: text('user_id'), // External user ID from host app
  teamId: text('team_id'), // External team ID from host app

  // Permission level for this flow: "owner" | "editor" | "operator" | "viewer"
  permission: text('permission').$type<FlowAccessPermission>().notNull().default('viewer'),

  // Audit fields
  grantedBy: text('granted_by'),
  grantedAt: text('granted_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),

  // Optional expiration
  expiresAt: text('expires_at'),
});

export const flowAccessRelations = relations(flowAccess, ({ one }) => ({
  flow: one(flows, {
    fields: [flowAccess.flowId],
    references: [flows.id],
  }),
}));

export const flowTriggersRelations = relations(flowTriggers, ({ one }) => ({
  flow: one(flows, {
    fields: [flowTriggers.flowId],
    references: [flows.id],
  }),
}));

export type FlowAccess = typeof flowAccess.$inferSelect;
export type NewFlowAccess = typeof flowAccess.$inferInsert;

export type FlowTrigger = typeof flowTriggers.$inferSelect;
export type NewFlowTrigger = typeof flowTriggers.$inferInsert;

export type ChatMessageRecord = typeof chatMessages.$inferSelect;
export type NewChatMessageRecord = typeof chatMessages.$inferInsert;
