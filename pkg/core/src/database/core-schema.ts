/**
 * Core Abstract Schema
 *
 * The single source of truth for Invect's database tables.
 * Defined using the abstract `InvectPluginSchema` format.
 *
 * The CLI schema generator (`npx invect-cli generate`) uses this + plugin schemas
 * to produce the three dialect-specific Drizzle schema files:
 *   - schema-sqlite.ts
 *   - schema-postgres.ts
 *   - schema-mysql.ts
 *
 * When modifying the database schema, edit THIS file, then run `npx invect-cli generate`.
 */

import type { InvectPluginSchema } from 'src/types/plugin.types';

// =============================================================================
// Enum Definitions
// =============================================================================

/**
 * Enum value sets used across the schema.
 * The generator creates pgEnum / mysqlEnum from these.
 */
export const CORE_ENUMS = {
  flowRunStatus: [
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
    'PAUSED',
    'PAUSED_FOR_BATCH',
  ],
  nodeExecutionStatus: [
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'SKIPPED',
    'BATCH_SUBMITTED',
    'BATCH_PROCESSING',
  ],
  batchStatus: ['SUBMITTED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  batchProvider: ['OPENAI', 'ANTHROPIC'],
} as const;

// =============================================================================
// Core Schema Definition
// =============================================================================

export const CORE_SCHEMA: InvectPluginSchema = {
  // ----- Flow definition table -----
  flows: {
    tableName: 'flows',
    order: 10,
    fields: {
      id: { type: 'string', primaryKey: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: false },
      tags: { type: 'json', required: false, typeAnnotation: 'string[]' },
      isActive: { type: 'boolean', required: true, defaultValue: true },
      liveVersionNumber: { type: 'number', required: false },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
      updatedAt: { type: 'date', required: true, defaultValue: 'now()' },
    },
  },

  // ----- Flow version table -----
  flowVersions: {
    tableName: 'flow_versions',
    order: 20,
    compositePrimaryKey: ['version', 'flowId'],
    fields: {
      flowId: {
        type: 'string',
        required: true,
        references: { table: 'flows', field: 'id', onDelete: 'cascade' },
      },
      version: { type: 'number', required: true },
      invectDefinition: {
        type: 'json',
        required: true,
        typeAnnotation: 'InvectDefinitionRuntime',
      },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
      createdBy: { type: 'string', required: false },
    },
  },

  // ----- Flow execution (runs) table -----
  flowRuns: {
    tableName: 'flow_executions',
    order: 30,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowId: {
        type: 'string',
        required: true,
        references: { table: 'flows', field: 'id', onDelete: 'cascade' },
      },
      flowVersion: { type: 'number', required: true },
      status: {
        type: [...CORE_ENUMS.flowRunStatus],
        required: true,
        defaultValue: 'PENDING',
        typeAnnotation: 'FlowRunStatus',
      },
      inputs: { type: 'json', required: true, typeAnnotation: 'JSONValue' },
      outputs: { type: 'json', required: false, typeAnnotation: 'JSONValue' },
      error: { type: 'text', required: false },
      startedAt: { type: 'date', required: true, defaultValue: 'now()' },
      completedAt: { type: 'date', required: false },
      duration: { type: 'number', required: false },
      createdBy: { type: 'string', required: false },
      // Trigger provenance
      triggerType: { type: 'string', required: false },
      triggerId: { type: 'string', required: false },
      triggerNodeId: { type: 'string', required: false },
      triggerData: { type: 'json', required: false, typeAnnotation: 'JSONValue' },
      lastHeartbeatAt: { type: 'date', required: false },
    },
  },

  // ----- Execution traces (node executions) table -----
  nodeExecutions: {
    tableName: 'execution_traces',
    order: 40,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowRunId: {
        type: 'uuid',
        required: true,
        references: { table: 'flow_executions', field: 'id', onDelete: 'cascade' },
      },
      nodeId: { type: 'string', required: true },
      nodeType: { type: 'string', required: true },
      status: {
        type: [...CORE_ENUMS.nodeExecutionStatus],
        required: true,
        defaultValue: 'PENDING',
        typeAnnotation: 'NodeExecutionStatus',
      },
      inputs: { type: 'json', required: true, typeAnnotation: 'JSONValue' },
      outputs: { type: 'json', required: false, typeAnnotation: 'JSONValue' },
      error: { type: 'text', required: false },
      startedAt: { type: 'date', required: true, defaultValue: 'now()' },
      completedAt: { type: 'date', required: false },
      duration: { type: 'number', required: false },
      retryCount: { type: 'number', required: true, defaultValue: 0 },
    },
  },

  // ----- Batch jobs table -----
  batchJobs: {
    tableName: 'batch_jobs',
    order: 50,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowRunId: {
        type: 'uuid',
        required: true,
        references: { table: 'flow_executions', field: 'id', onDelete: 'cascade' },
      },
      nodeId: { type: 'string', required: true },
      provider: {
        type: [...CORE_ENUMS.batchProvider],
        required: true,
        typeAnnotation: 'BatchProvider',
      },
      batchId: { type: 'string', required: false },
      status: {
        type: [...CORE_ENUMS.batchStatus],
        required: true,
        defaultValue: 'SUBMITTED',
        typeAnnotation: 'BatchStatus',
      },
      requestData: { type: 'json', required: true },
      responseData: { type: 'json', required: false },
      error: { type: 'text', required: false },
      submittedAt: { type: 'date', required: true, defaultValue: 'now()' },
      completedAt: { type: 'date', required: false },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
      updatedAt: { type: 'date', required: true, defaultValue: 'now()' },
    },
  },

  // ----- Agent tool executions table -----
  agentToolExecutions: {
    tableName: 'agent_tool_executions',
    order: 60,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      nodeExecutionId: {
        type: 'uuid',
        required: true,
        references: { table: 'execution_traces', field: 'id', onDelete: 'cascade' },
      },
      flowRunId: {
        type: 'uuid',
        required: true,
        references: { table: 'flow_executions', field: 'id', onDelete: 'cascade' },
      },
      toolId: { type: 'string', required: true },
      toolName: { type: 'string', required: true },
      iteration: { type: 'number', required: true },
      input: { type: 'json', required: true, typeAnnotation: 'JSONValue' },
      output: { type: 'json', required: false, typeAnnotation: 'JSONValue' },
      error: { type: 'text', required: false },
      success: { type: 'boolean', required: true },
      startedAt: { type: 'date', required: true, defaultValue: 'now()' },
      completedAt: { type: 'date', required: false },
      duration: { type: 'number', required: false },
    },
  },

  // ----- Credentials table -----
  credentials: {
    tableName: 'credentials',
    order: 10,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      name: { type: 'string', required: true },
      type: { type: 'string', required: true, typeAnnotation: 'CredentialType' },
      authType: { type: 'string', required: true, typeAnnotation: 'CredentialAuthType' },
      config: { type: 'json', required: true, typeAnnotation: 'CredentialConfig' },
      description: { type: 'text', required: false },
      isActive: { type: 'boolean', required: true, defaultValue: true },
      workspaceId: { type: 'string', required: false },
      isShared: { type: 'boolean', required: true, defaultValue: false },
      metadata: { type: 'json', required: false, typeAnnotation: 'Record<string, unknown>' },
      lastUsedAt: { type: 'date', required: false },
      expiresAt: { type: 'date', required: false },
      webhookPath: { type: 'string', required: false, unique: true },
      webhookSecret: { type: 'string', required: false },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
      updatedAt: { type: 'date', required: true, defaultValue: 'now()' },
    },
  },

  // ----- Flow triggers table -----
  flowTriggers: {
    tableName: 'flow_triggers',
    order: 20,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowId: {
        type: 'string',
        required: true,
        references: { table: 'flows', field: 'id', onDelete: 'cascade' },
      },
      nodeId: { type: 'string', required: true },
      type: { type: 'string', required: true, typeAnnotation: 'TriggerType' },
      isEnabled: { type: 'boolean', required: true, defaultValue: true },
      webhookPath: { type: 'string', required: false, unique: true },
      webhookSecret: { type: 'string', required: false },
      cronExpression: { type: 'string', required: false },
      cronTimezone: { type: 'string', required: false },
      lastTriggeredAt: { type: 'date', required: false },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
      updatedAt: { type: 'date', required: true, defaultValue: 'now()' },
    },
  },

  // ----- Chat messages table -----
  chatMessages: {
    tableName: 'chat_messages',
    order: 30,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowId: {
        type: 'string',
        required: true,
        references: { table: 'flows', field: 'id', onDelete: 'cascade' },
      },
      role: {
        type: 'string',
        required: true,
        typeAnnotation: "'user' | 'assistant' | 'system' | 'tool'",
      },
      content: { type: 'text', required: true, defaultValue: '' },
      toolMeta: { type: 'json', required: false, typeAnnotation: 'Record<string, unknown>' },
      createdAt: { type: 'date', required: true, defaultValue: 'now()' },
    },
  },

  // ----- Flow access control (RBAC) table -----
  flowAccess: {
    tableName: 'flow_access',
    order: 20,
    fields: {
      id: { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
      flowId: {
        type: 'string',
        required: true,
        references: { table: 'flows', field: 'id', onDelete: 'cascade' },
      },
      userId: { type: 'string', required: false },
      teamId: { type: 'string', required: false },
      permission: {
        type: 'string',
        required: true,
        defaultValue: 'viewer',
        typeAnnotation: 'FlowAccessPermission',
      },
      grantedBy: { type: 'string', required: false },
      grantedAt: { type: 'date', required: true, defaultValue: 'now()' },
      expiresAt: { type: 'date', required: false },
    },
  },
};

/**
 * List of core table names (used by the merger to detect
 * when a plugin extends a core table vs. creates a new one).
 */
export const CORE_TABLE_NAMES = Object.keys(CORE_SCHEMA);
