/**
 * Schema metadata for the adapter factory.
 *
 * Maps table names → column names → column types so the adapter factory
 * can apply automatic type coercion (boolean↔int, Date↔string, JSON↔string).
 *
 * Only columns that require dialect-specific coercion are listed.
 * Columns of type 'string' or 'number' that are natively supported
 * everywhere don't need entries here.
 */

import type { SchemaMetadata } from './adapter-factory';

export const INVECT_SCHEMA_META: SchemaMetadata = {
  invect_flows: {
    tags: { type: 'string[]' },
    is_active: { type: 'boolean' },
    created_at: { type: 'date' },
    updated_at: { type: 'date' },
  },

  invect_flow_versions: {
    invect_definition: { type: 'json' },
    created_at: { type: 'date' },
  },

  invect_flow_executions: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    inputs: { type: 'json' },
    outputs: { type: 'json' },
    started_at: { type: 'date' },
    completed_at: { type: 'date' },
    trigger_data: { type: 'json' },
    last_heartbeat_at: { type: 'date' },
  },

  invect_action_traces: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    inputs: { type: 'json' },
    outputs: { type: 'json' },
    // Structured failure details — NodeErrorDetails — see services/node-executions.
    error: { type: 'json' },
    success: { type: 'boolean' },
    started_at: { type: 'date' },
    completed_at: { type: 'date' },
  },

  invect_batch_jobs: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    request_data: { type: 'json' },
    response_data: { type: 'json' },
    submitted_at: { type: 'date' },
    completed_at: { type: 'date' },
    created_at: { type: 'date' },
    updated_at: { type: 'date' },
  },

  invect_credentials: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    config: { type: 'json' },
    is_active: { type: 'boolean' },
    is_shared: { type: 'boolean' },
    metadata: { type: 'json' },
    created_at: { type: 'date' },
    updated_at: { type: 'date' },
  },

  invect_flow_triggers: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    is_enabled: { type: 'boolean' },
    created_at: { type: 'date' },
    updated_at: { type: 'date' },
  },

  invect_chat_messages: {
    id: { type: 'uuid', defaultValue: 'uuid' },
    tool_meta: { type: 'json' },
    created_at: { type: 'date' },
  },
};
