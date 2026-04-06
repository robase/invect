/**
 * @invect/mcp — Shared types
 */

/** Configuration for the MCP plugin */
export interface McpPluginOptions {
  /** Session time-to-live in milliseconds. Default: 30 minutes */
  sessionTtlMs?: number;

  /** Audit logging configuration */
  audit?: {
    /** Enable audit logging. Default: true */
    enabled?: boolean;
    /** Persist audit logs to database. Default: false (log only) */
    persist?: boolean;
    /** Log level for audit entries. Default: 'info' */
    logLevel?: 'debug' | 'info' | 'warn';
  };
}

/** MCP tool identifiers */
export const TOOL_IDS = {
  // Flow management
  FLOW_LIST: 'flow_list',
  FLOW_GET: 'flow_get',
  FLOW_GET_DEFINITION: 'flow_get_definition',
  FLOW_CREATE: 'flow_create',
  FLOW_UPDATE: 'flow_update',
  FLOW_DELETE: 'flow_delete',
  FLOW_VALIDATE: 'flow_validate',

  // Versions
  VERSION_LIST: 'version_list',
  VERSION_GET: 'version_get',
  VERSION_PUBLISH: 'version_publish',

  // Runs
  RUN_START: 'run_start',
  RUN_TO_NODE: 'run_to_node',
  RUN_LIST: 'run_list',
  RUN_GET: 'run_get',
  RUN_CANCEL: 'run_cancel',
  RUN_PAUSE: 'run_pause',
  RUN_RESUME: 'run_resume',

  // Debug
  DEBUG_NODE_EXECUTIONS: 'debug_node_executions',
  DEBUG_TEST_NODE: 'debug_test_node',
  DEBUG_TEST_EXPRESSION: 'debug_test_expression',
  DEBUG_TEST_MAPPER: 'debug_test_mapper',

  // Credentials
  CREDENTIAL_LIST: 'credential_list',
  CREDENTIAL_TEST: 'credential_test',

  // Triggers
  TRIGGER_LIST: 'trigger_list',
  TRIGGER_GET: 'trigger_get',
  TRIGGER_CREATE: 'trigger_create',
  TRIGGER_UPDATE: 'trigger_update',
  TRIGGER_DELETE: 'trigger_delete',

  // Node reference
  NODE_LIST_PROVIDERS: 'node_list_providers',
  NODE_LIST_AVAILABLE: 'node_list_available',
} as const;

export type ToolId = (typeof TOOL_IDS)[keyof typeof TOOL_IDS];

/** Audit log entry */
export interface AuditEntry {
  timestamp: string;
  sessionId?: string;
  userId?: string;
  userRole?: string;
  tool: string;
  params: Record<string, unknown>;
  status: 'success' | 'error';
  durationMs: number;
  error?: string;
}
