/**
 * Node-execution types — the shapes produced by the action executor when an
 * action runs as a flow node. These are the contract between execution and
 * persistence / UI layers.
 */

export enum NodeExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  BATCH_SUBMITTED = 'BATCH_SUBMITTED',
}

export enum FlowRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  PAUSED_FOR_BATCH = 'PAUSED_FOR_BATCH',
}

export type OutputVariable = {
  value: unknown;
  type: 'string' | 'object';
};

export type OutputVariables = Record<string, OutputVariable>;

export interface StructuredOutput {
  variables: OutputVariables;
  metadata?: Record<string, unknown>;
}

export interface NodeOutput {
  nodeType: string;
  data: StructuredOutput;
}

/**
 * Typed classification of node-execution failures. Used by the error
 * classifier to map SDK errors, network errors, and internal validation
 * failures to a small discriminant that drives retry policy and UI display.
 */
export type NodeErrorCode =
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'QUOTA'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NETWORK'
  | 'UPSTREAM_5XX'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'LENGTH_LIMIT'
  | 'CONTENT_FILTER'
  | 'SCHEMA_PARSE'
  | 'VALIDATION'
  | 'CREDENTIAL_MISSING'
  | 'CREDENTIAL_REFRESH'
  | 'UNKNOWN';

export interface NodeErrorDetails {
  code: NodeErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  providerStatusCode?: number;
  providerErrorType?: string;
  providerRequestId?: string;
  attempts?: number;
  fieldErrors?: Record<string, string>;
  /** Truncated err.stack for log/debug; not for UI without opt-in. */
  cause?: string;
}

export interface NodeExecutionFailedResult {
  state: NodeExecutionStatus.FAILED;
  errors: string[];
  fieldErrors?: Record<string, string>;
  metadata?: Record<string, unknown>;
  errorDetails?: NodeErrorDetails;
}

export interface NodeExecutionPendingResult {
  state: NodeExecutionStatus.PENDING;
  type: 'batch_submitted';
  batchJobId: string;
  nodeId: string;
  executionId: string;
  metadata?: Record<string, unknown>;
}

export interface NodeExecutionSuccessResult {
  type: 'output';
  output: NodeOutput;
  state: NodeExecutionStatus.SUCCESS;
  metadata?: Record<string, unknown>;
}

export type NodeExecutionResult =
  | NodeExecutionFailedResult
  | NodeExecutionPendingResult
  | NodeExecutionSuccessResult;
