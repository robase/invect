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

export interface NodeExecutionFailedResult {
  state: NodeExecutionStatus.FAILED;
  errors: string[];
  fieldErrors?: Record<string, string>;
  metadata?: Record<string, unknown>;
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
