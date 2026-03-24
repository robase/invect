// Node execution status
export enum NodeExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  BATCH_SUBMITTED = 'BATCH_SUBMITTED',
}

// Execution status
export enum FlowRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  PAUSED_FOR_BATCH = 'PAUSED_FOR_BATCH',
}
