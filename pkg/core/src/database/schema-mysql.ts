// MySQL schema for Invect core
import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  timestamp,
  json,
  mysqlEnum,
  primaryKey,
} from 'drizzle-orm/mysql-core';
import { relations, sql } from 'drizzle-orm';
import { JSONValue } from '.';
import { InvectDefinitionRuntime } from 'src/services/flow-versions/schemas-fresh';
import { randomUUID } from 'crypto';

// =============================================================================
// Tables
// =============================================================================

// Flow definition table
export const flows = mysqlTable('flows', {
  id: varchar('id', { length: 36 }).primaryKey(), // Will be generated using IdGenerator.generateFlowId()
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  tags: json('tags').$type<string[]>(),
  isActive: boolean('is_active').notNull().default(true),
  liveVersionNumber: int('live_version_number'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// Flow version table to support version history
export const flowVersions = mysqlTable(
  'flow_versions',
  {
    flowId: varchar('flow_id', { length: 36 })
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    version: int('version').notNull().unique(),
    invectDefinition: json('invect_definition').$type<InvectDefinitionRuntime>().notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdBy: varchar('created_by', { length: 255 }),
  },
  (table) => [primaryKey({ columns: [table.version, table.flowId] })],
);

// Flow execution table to track execution instances
export const flowRuns = mysqlTable('flow_executions', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: varchar('flow_id', { length: 36 })
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  flowVersion: int('flow_version')
    .notNull()
    .references(() => flowVersions.version, { onDelete: 'cascade' }),
  status: mysqlEnum('status', [
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'PAUSED',
    'PAUSED_FOR_BATCH',
  ])
    .notNull()
    .default('PENDING'),
  inputs: json('inputs').$type<JSONValue>().notNull(),
  outputs: json('outputs').$type<JSONValue>(),
  error: text('error'),
  startedAt: timestamp('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp('completed_at'),
  duration: int('duration'), // in milliseconds
  createdBy: varchar('created_by', { length: 255 }),
  // Trigger provenance
  triggerType: varchar('trigger_type', { length: 50 }), // 'manual' | 'webhook' | 'cron' | 'api' | null
  triggerId: varchar('trigger_id', { length: 36 }), // References flow_triggers.id
  triggerNodeId: varchar('trigger_node_id', { length: 255 }), // The trigger node that initiated this run
  triggerData: json('trigger_data').$type<JSONValue>(), // Webhook payload / cron metadata
  lastHeartbeatAt: timestamp('last_heartbeat_at'), // Updated periodically during execution for stale run detection
});

// Execution trace table to track individual node executions
export const nodeExecutions = mysqlTable('execution_traces', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowRunId: varchar('flow_run_id', { length: 36 })
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 255 }).notNull(),
  nodeType: varchar('node_type', { length: 100 }).notNull(),
  status: mysqlEnum('status', [
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'SKIPPED',
    'BATCH_SUBMITTED',
    'BATCH_PROCESSING',
  ])
    .notNull()
    .default('PENDING'),
  inputs: json('inputs').$type<JSONValue>().notNull(),
  outputs: json('outputs').$type<JSONValue>(),
  error: text('error'),
  startedAt: timestamp('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp('completed_at'),
  duration: int('duration'), // in milliseconds
  retryCount: int('retry_count').notNull().default(0),
});

// Batch job table to track batch processing jobs
export const batchJobs = mysqlTable('batch_jobs', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowRunId: varchar('flow_run_id', { length: 36 })
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 255 }).notNull(),
  provider: mysqlEnum('provider', ['OPENAI', 'ANTHROPIC', 'OPENROUTER']).notNull(),
  batchId: varchar('batch_id', { length: 255 }),
  status: mysqlEnum('status', ['SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .notNull()
    .default('SUBMITTED'),
  requestData: json('request_data').notNull(),
  responseData: json('response_data'),
  error: text('error'),
  submittedAt: timestamp('submitted_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// Agent tool executions table to track individual tool calls during agent execution
export const agentToolExecutions = mysqlTable('agent_tool_executions', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  // Reference to the node execution (agent node)
  nodeExecutionId: varchar('node_execution_id', { length: 36 })
    .notNull()
    .references(() => nodeExecutions.id, { onDelete: 'cascade' }),
  // Denormalized reference to flow run for efficient querying
  flowRunId: varchar('flow_run_id', { length: 36 })
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  // Tool identification
  toolId: varchar('tool_id', { length: 255 }).notNull(), // The instance ID or base tool ID
  toolName: varchar('tool_name', { length: 255 }).notNull(), // Human-readable name
  // Iteration within the agent loop (1-based)
  iteration: int('iteration').notNull(),
  // Input/output data
  input: json('input').$type<JSONValue>().notNull(),
  output: json('output').$type<JSONValue>(),
  error: text('error'),
  success: boolean('success').notNull(),
  // Timing
  startedAt: timestamp('started_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp('completed_at'),
  duration: int('duration'), // in milliseconds
});

// Credentials table for storing API authentication credentials
export interface CredentialConfig {
  apiKey?: string;
  location?: 'header' | 'query';
  paramName?: string;
  token?: string;
  username?: string;
  password?: string;
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
  headers?: Record<string, string>;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  service?: string;
  algorithm?: string;
  secret?: string;
  connectionString?: string;
  expiresAt?: string;
  apiUrl?: string;
  baseUrl?: string;
  endpoint?: string;
  [key: string]: unknown;
}

export const credentials = mysqlTable('credentials', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  type: mysqlEnum('type', ['http-api', 'database', 'llm']).notNull(),
  authType: mysqlEnum('auth_type', [
    'apiKey',
    'bearer',
    'basic',
    'oauth2',
    'custom',
    'awsSigV4',
    'jwt',
    'connectionString',
  ]).notNull(),
  config: json('config').$type<CredentialConfig>().notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  workspaceId: varchar('workspace_id', { length: 255 }),
  isShared: boolean('is_shared').notNull().default(false),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  // Webhook: a unique path so external services can POST to this credential's webhook URL
  webhookPath: varchar('webhook_path', { length: 64 }).unique(),
  webhookSecret: varchar('webhook_secret', { length: 64 }),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// =============================================================================
// Flow Triggers - Registration table for webhook/cron/manual triggers
// =============================================================================

/** Trigger type discriminant */
export type TriggerType = 'manual' | 'webhook' | 'cron';

export const flowTriggers = mysqlTable('flow_triggers', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: varchar('flow_id', { length: 36 })
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  /** The trigger node's ID in the flow graph */
  nodeId: varchar('node_id', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).$type<TriggerType>().notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),

  // Webhook-only: top-level for unique index + O(1) lookup
  webhookPath: varchar('webhook_path', { length: 255 }).unique(),
  webhookSecret: varchar('webhook_secret', { length: 255 }),

  // Cron-only: denormalized from node params so scheduler doesn't need to load flow
  cronExpression: varchar('cron_expression', { length: 255 }),
  cronTimezone: varchar('cron_timezone', { length: 100 }),

  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// =============================================================================
// Chat Messages — persisted chat history scoped to flows
// =============================================================================

export const chatMessages = mysqlTable('chat_messages', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: varchar('flow_id', { length: 36 })
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).$type<'user' | 'assistant' | 'system' | 'tool'>().notNull(),
  content: text('content').notNull(),
  toolMeta: json('tool_meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at')
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

export const nodeExecutionsRelations = relations(nodeExecutions, ({ one, many }) => ({
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
 * Flow access table - tracks who can access which flows.
 * Supports both user-level and team-level access.
 */
export const flowAccess = mysqlTable('flow_access', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  flowId: varchar('flow_id', { length: 36 })
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),

  // Either userId OR teamId is set (not both)
  userId: varchar('user_id', { length: 255 }), // External user ID from host app
  teamId: varchar('team_id', { length: 255 }), // External team ID from host app

  // Permission level for this flow: "owner" | "editor" | "operator" | "viewer"
  permission: mysqlEnum('permission', ['owner', 'editor', 'operator', 'viewer'])
    .notNull()
    .default('viewer'),

  // Audit fields
  grantedBy: varchar('granted_by', { length: 255 }),
  grantedAt: timestamp('granted_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),

  // Optional expiration
  expiresAt: timestamp('expires_at'),
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
