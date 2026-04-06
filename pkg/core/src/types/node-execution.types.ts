/**
 * Node Execution Types
 *
 * Types for node execution results. Generic — not parameterised by node type.
 */

import { NodeExecutionStatus } from 'src/types/base';
import type { NodeOutput } from 'src/types/node-io-types';

/**
 * Result of a failed node execution
 */
export interface NodeExecutionFailedResult {
  state: NodeExecutionStatus.FAILED;
  errors: string[];
  /** Per-field validation errors keyed by field name */
  fieldErrors?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a pending node execution (batch processing)
 */
export interface NodeExecutionPendingResult {
  state: NodeExecutionStatus.PENDING;
  type: 'batch_submitted';
  batchJobId: string;
  nodeId: string;
  executionId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of a successful node execution
 */
export interface NodeExecutionSuccessResult {
  type: 'output';
  output: NodeOutput;
  state: NodeExecutionStatus.SUCCESS;
  metadata?: Record<string, unknown>;
}

/**
 * Result of node execution — success, failure, or pending batch submission.
 */
export type NodeExecutionResult =
  | NodeExecutionFailedResult
  | NodeExecutionPendingResult
  | NodeExecutionSuccessResult;
