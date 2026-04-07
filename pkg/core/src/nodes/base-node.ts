import type { NodeOutput, NodeInputData } from 'src/types/node-io-types';
import { GraphNodeType, NodeExecutionContext } from 'src/types.internal';
import { NodeExecutionStatus } from 'src/types/base';
import { FlowNodeForType } from 'src/services/flow-versions/schemas-fresh';
import z, { ZodType } from 'zod/v4';
import { NodeDefinition } from '../types/node-definition.types';
import {
  NodeConfigUpdateContext,
  NodeConfigUpdateEvent,
  NodeConfigUpdateResponse,
} from 'src/types/node-config-update.types';
import type {
  NodeExecutionResult,
  NodeExecutionFailedResult,
  NodeExecutionPendingResult,
  NodeExecutionSuccessResult,
} from 'src/types/node-execution.types';

/**
 * Result of parsing params with a schema
 */
export type ParamsParseResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Default params schema for nodes that don't define their own.
 * Accepts any object - no validation.
 */
export const defaultParamsSchema = z.record(z.string(), z.unknown());

/**
 * Abstract base class for all node executors.
 *
 * @typeParam TNodeType - The GraphNodeType this executor handles
 * @typeParam TParamsSchema - Zod schema type for node parameters (defaults to permissive record)
 */
export abstract class BaseNodeExecutor<
  in out TNodeType extends GraphNodeType,
  TParamsSchema extends ZodType = typeof defaultParamsSchema,
> {
  constructor(readonly nodeType: TNodeType) {}

  /**
   * Zod schema for validating node parameters.
   * Override this in subclasses to provide typed param validation.
   *
   * @example
   * ```typescript
   * readonly paramsSchema = z.object({
   *   prompt: z.string().min(1),
   *   temperature: z.number().optional().default(0.7),
   * });
   * ```
   */
  readonly paramsSchema: TParamsSchema = defaultParamsSchema as unknown as TParamsSchema;

  /**
   * Get the static definition of this node type
   */
  abstract getDefinition(): NodeDefinition;

  /**
   * run the node
   */
  abstract execute(
    inputs: NodeInputData,
    node: FlowNodeForType<TNodeType>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> | NodeExecutionResult;

  /**
   * Handle node configuration updates (optional per node)
   */
  async handleConfigUpdate(
    event: NodeConfigUpdateEvent,
    _context: NodeConfigUpdateContext,
  ): Promise<NodeConfigUpdateResponse> {
    return {
      definition: this.getDefinition(),
      params: event.params,
    };
  }

  /**
   * Parse and validate node params using the executor's paramsSchema.
   * Returns typed params if valid, or an error message if invalid.
   *
   * @param params - Raw params from node.params (Record<string, unknown>)
   * @returns Parsed and typed params, or error
   */
  protected parseParams(
    params: Record<string, unknown>,
  ): ParamsParseResult<z.infer<TParamsSchema>> {
    const result = this.paramsSchema.safeParse(params);
    if (!result.success) {
      return {
        success: false,
        error: z.prettifyError(result.error),
      };
    }
    return { success: true, data: result.data as z.infer<TParamsSchema> };
  }

  /**
   * Validate node inputs.
   * All nodes accept a generic Record<string, unknown> — actual data
   * extraction happens via {{ expression }} templates in the node params.
   */
  validateInputs(
    inputs: unknown,
  ): { isValid: true; data: NodeInputData } | { isValid: false; error: string } {
    if (inputs !== null && inputs !== undefined && typeof inputs !== 'object') {
      return { isValid: false, error: `Expected object inputs, got ${typeof inputs}` };
    }
    return { isValid: true, data: (inputs ?? {}) as NodeInputData };
  }

  /**
   * Create a successful execution result
   */
  protected createSuccessResult(
    output: NodeOutput,
    metadata?: Record<string, unknown>,
  ): NodeExecutionSuccessResult {
    return {
      state: NodeExecutionStatus.SUCCESS,
      metadata,
      type: 'output',
      output,
    };
  }

  /**
   * Create a pending execution result
   */
  protected createPendingResult(
    batchJobId: string,
    nodeId: string,
    executionId: string,
    metadata?: Record<string, unknown>,
  ): NodeExecutionPendingResult {
    return {
      state: NodeExecutionStatus.PENDING,
      type: 'batch_submitted',
      batchJobId,
      nodeId,
      executionId,
      metadata,
    };
  }

  /**
   * Create a failed execution result
   */
  protected createErrorResult(
    errors: string[],
    metadata?: Record<string, unknown>,
  ): NodeExecutionFailedResult {
    return {
      state: NodeExecutionStatus.FAILED,
      errors,
      metadata,
    };
  }

  /**
   * Log execution start
   */
  protected logExecutionStart(context: NodeExecutionContext): void {
    context.logger.debug(`Starting execution of ${this.nodeType} node`, {
      nodeId: context.nodeId,
      traceId: context.traceId,
      flowRunId: context.flowRunId,
    });
  }

  /**
   * Log execution completion
   */
  protected logExecutionComplete(context: NodeExecutionContext, result: NodeExecutionResult): void {
    context.logger.debug(
      `${result.state}: trace: ${context.traceId} - nodeId: ${context.nodeId} - flowRunId: ${context.flowRunId} - nodeType: ${this.nodeType}`,
    );
  }
}

/**
 * Type alias for any node executor (used in registries and collections)
 * This erases the specific schema type to allow storing different executor types together
 */
export type AnyNodeExecutor = BaseNodeExecutor<GraphNodeType, ZodType<unknown>>;

/**
 * Utility functions for node execution
 */
export class NodeExecutionUtils {
  /**
   * Safely extract nested value from object
   */
  static getNestedValue(
    obj: Record<string, unknown>,
    path: string,
    defaultValue?: unknown,
  ): unknown {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return defaultValue;
      }
      current = current[key] as Record<string, unknown>;
    }

    return current;
  }

  /**
   * Set nested value in object
   */
  static setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = obj;

    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new Error(`Invalid path segment: '${key}' is not allowed`);
      }
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    if (lastKey === undefined) {
      throw new Error('Invalid path: no last key provided');
    }
    if (lastKey === '__proto__' || lastKey === 'constructor' || lastKey === 'prototype') {
      throw new Error(`Invalid path segment: '${lastKey}' is not allowed`);
    }
    current[lastKey] = value;
  }

  /**
   * Template string replacement
   */
  static replaceTemplateVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{((?:[^{}])*)\}\}/g, (match, varName) => {
      const trimmedVarName = varName.trim();
      const value = NodeExecutionUtils.getNestedValue(variables, trimmedVarName);
      return value !== undefined ? String(value) : match;
    });
  }
}

// Re-export types from the dedicated types file
export type {
  NodeExecutionResult,
  NodeExecutionFailedResult,
  NodeExecutionPendingResult,
  NodeExecutionSuccessResult,
} from 'src/types/node-execution.types';
