// PostgreSQL schema for Invect core
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  json,
  pgEnum,
  uuid,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { JSONValue } from '.';
import { InvectDefinitionRuntime } from 'src/services/flow-versions/schemas-fresh';

// =============================================================================
// Enums for PostgreSQL
// =============================================================================

export const flowRunStatusEnum = pgEnum('execution_status', [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'PAUSED',
  'PAUSED_FOR_BATCH',
]);

export const nodeExecutionStatusEnum = pgEnum('node_execution_status', [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'SKIPPED',
  'BATCH_SUBMITTED',
  'BATCH_PROCESSING',
]);

export const batchStatusEnum = pgEnum('batch_status', [
  'SUBMITTED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const batchProviderEnum = pgEnum('batch_provider', ['OPENAI', 'ANTHROPIC', 'OPENROUTER']);

// =============================================================================
// Tables
// =============================================================================

// Flow definition table
export const flows = pgTable('flows', {
  id: text('id').primaryKey(), // Will be generated using IdGenerator.generateFlowId()
  name: text('name').notNull(),
  description: text('description'),
  tags: json('tags').$type<string[]>(),
  isActive: boolean('is_active').notNull().default(true),
  liveVersionNumber: integer('live_version_number'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Flow version table to support version history
export const flowVersions = pgTable(
  'flow_versions',
  {
    flowId: text('flow_id')
      .notNull()
      .references(() => flows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().unique().default(0),
    invectDefinition: json('invect_definition').$type<InvectDefinitionRuntime>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (table) => [primaryKey({ columns: [table.version, table.flowId] })],
);

// Flow execution table to track execution instances
export const flowRuns = pgTable('flow_executions', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  flowVersion: integer('flow_version').notNull(),
  status: flowRunStatusEnum('status').notNull().default('PENDING'),
  inputs: json('inputs').$type<JSONValue>().notNull(),
  outputs: json('outputs').$type<JSONValue>(),
  error: text('error'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  duration: integer('duration'), // in milliseconds
  createdBy: text('created_by'),
  // Trigger provenance
  triggerType: text('trigger_type'), // 'manual' | 'webhook' | 'cron' | 'api' | null
  triggerId: text('trigger_id'), // References flow_triggers.id
  triggerNodeId: text('trigger_node_id'), // The trigger node that initiated this run
  triggerData: json('trigger_data').$type<JSONValue>(), // Webhook payload / cron metadata
  lastHeartbeatAt: timestamp('last_heartbeat_at'), // Updated periodically during execution for stale run detection
});

// Execution trace table to track individual node executions
export const nodeExecutions = pgTable('execution_traces', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowRunId: uuid('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  nodeType: text('node_type').notNull(),
  status: nodeExecutionStatusEnum('status').notNull().default('PENDING'),
  inputs: json('inputs').$type<JSONValue>().notNull(),
  outputs: json('outputs').$type<JSONValue>(),
  error: text('error'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  duration: integer('duration'), // in milliseconds
  retryCount: integer('retry_count').notNull().default(0),
});

// Batch job table to track batch processing jobs
export const batchJobs = pgTable('batch_jobs', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowRunId: uuid('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  provider: batchProviderEnum('provider').notNull(),
  batchId: text('batch_id'),
  status: batchStatusEnum('status').notNull().default('SUBMITTED'),
  requestData: json('request_data').notNull(),
  responseData: json('response_data'),
  error: text('error'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Agent tool executions table to track individual tool calls during agent execution
export const agentToolExecutions = pgTable('agent_tool_executions', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  // Reference to the node execution (agent node)
  nodeExecutionId: uuid('node_execution_id')
    .notNull()
    .references(() => nodeExecutions.id, { onDelete: 'cascade' }),
  // Denormalized reference to flow run for efficient querying
  flowRunId: uuid('flow_run_id')
    .notNull()
    .references(() => flowRuns.id, { onDelete: 'cascade' }),
  // Tool identification
  toolId: text('tool_id').notNull(), // The instance ID or base tool ID
  toolName: text('tool_name').notNull(), // Human-readable name
  // Iteration within the agent loop (1-based)
  iteration: integer('iteration').notNull(),
  // Input/output data
  input: json('input').$type<JSONValue>().notNull(),
  output: json('output').$type<JSONValue>(),
  error: text('error'),
  success: boolean('success').notNull(),
  // Timing
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  duration: integer('duration'), // in milliseconds
});

// Credentials table for storing API authentication credentials
export const credentialTypeEnum = pgEnum('credential_type', ['http-api', 'database', 'llm']);

export const credentialAuthTypeEnum = pgEnum('credential_auth_type', [
  'apiKey',
  'bearer',
  'basic',
  'oauth2',
  'custom',
  'awsSigV4',
  'jwt',
  'connectionString',
]);

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

export const credentials = pgTable('credentials', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  name: text('name').notNull(),
  type: credentialTypeEnum('type').notNull(),
  authType: credentialAuthTypeEnum('auth_type').notNull(),
  config: json('config').$type<CredentialConfig>().notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  workspaceId: text('workspace_id'),
  isShared: boolean('is_shared').notNull().default(false),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  // Webhook: a unique path so external services can POST to this credential's webhook URL
  webhookPath: text('webhook_path').unique(),
  webhookSecret: text('webhook_secret'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =============================================================================
// Flow Triggers - Registration table for webhook/cron/manual triggers
// =============================================================================

/** Trigger type discriminant */
export type TriggerType = 'manual' | 'webhook' | 'cron';

export const flowTriggers = pgTable('flow_triggers', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  /** The trigger node's ID in the flow graph */
  nodeId: text('node_id').notNull(),
  type: text('type').$type<TriggerType>().notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),

  // Webhook-only: top-level for unique index + O(1) lookup
  webhookPath: text('webhook_path').unique(),
  webhookSecret: text('webhook_secret'),

  // Cron-only: denormalized from node params so scheduler doesn't need to load flow
  cronExpression: text('cron_expression'),
  cronTimezone: text('cron_timezone'),

  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// =============================================================================
// Chat Messages — persisted chat history scoped to flows
// =============================================================================

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant' | 'system' | 'tool'>().notNull(),
  content: text('content').notNull().default(''),
  toolMeta: json('tool_meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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
 * Flow access permission levels
 */
export const flowAccessPermissionEnum = pgEnum('flow_access_permission', [
  'owner',
  'editor',
  'operator',
  'viewer',
]);

/**
 * Flow access table - tracks who can access which flows.
 * Supports both user-level and team-level access.
 */
export const flowAccess = pgTable('flow_access', {
  id: uuid('id')
    .primaryKey()
    .$default(() => randomUUID()),
  flowId: text('flow_id')
    .notNull()
    .references(() => flows.id, { onDelete: 'cascade' }),

  // Either userId OR teamId is set (not both)
  userId: text('user_id'), // External user ID from host app
  teamId: text('team_id'), // External team ID from host app

  // Permission level for this flow
  permission: flowAccessPermissionEnum('permission').notNull().default('viewer'),

  // Audit fields
  grantedBy: text('granted_by'),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),

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
