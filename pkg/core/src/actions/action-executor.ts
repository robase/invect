/**
 * Universal Action Executor
 *
 * Bridges the new ActionDefinition system with the existing execution paths.
 * Provides two entry points:
 *
 * - `executeAsNode()`  — called by `NodeExecutionCoordinator` during flow runs
 * - `executeAsTool()`  — called by `AgentNodeExecutor` during agent loops
 *
 * Both ultimately call the same `action.execute(params, context)` function.
 */

import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionResult,
  ActionCredential,
} from './types';
import type { NodeExecutionContext } from 'src/types.internal';
import type { AgentToolExecutionContext, AgentToolResult } from 'src/types/agent-tool.types';
import { NodeExecutionStatus } from 'src/types/base';
import type {
  NodeExecutionResult,
  NodeExecutionFailedResult,
  NodeExecutionPendingResult,
} from 'src/types/node-execution.types';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Coerce JSON-encoded string params into real objects/arrays.
 *
 * The UI config panel stores JSON-type fields (like `inputDefinitions`) as
 * stringified JSON from the code editor textarea.  Before Zod validation we
 * attempt to parse any string value that looks like a JSON array or object so
 * that the schema receives the expected types.
 *
 * Template expressions (containing `{{`) are left as-is.
 */
export function coerceJsonStringParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && !value.includes('{{')) {
      const trimmed = value.trim();
      // Empty strings → undefined so optional Zod fields pass through
      if (trimmed === '') {
        result[key] = undefined;
        continue;
      }
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          result[key] = JSON.parse(trimmed);
          continue;
        } catch {
          // Not valid JSON — keep as string
        }
      }
    }
    result[key] = value;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute an action as a flow node.
 *
 * Called by `NodeExecutionCoordinator.executeActionNode()`.
 * Resolves credential, builds the shared context, runs `action.execute()`,
 * then wraps the ActionResult into a NodeExecutionResult.
 */
export async function executeActionAsNode(
  action: ActionDefinition,
  params: Record<string, unknown>,
  nodeContext: NodeExecutionContext,
): Promise<NodeExecutionResult> {
  const logger = nodeContext.logger;

  // 0. Coerce JSON strings — the UI config panel stores JSON-type fields as
  //    stringified JSON (from the textarea editor).  Parse them so that Zod
  //    receives real objects/arrays instead of raw strings.
  const coercedParams = coerceJsonStringParams(params);

  // 1. Validate params with the action's Zod schema
  const parseResult = action.params.schema.safeParse(coercedParams);
  if (!parseResult.success) {
    const { prettifyError } = await import('zod/v4');

    // Extract per-field errors from Zod issues
    const fieldErrors: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      if (issue.path && issue.path.length > 0) {
        const fieldName = String(issue.path[0]);
        fieldErrors[fieldName] = issue.message;
      }
    }

    return {
      state: NodeExecutionStatus.FAILED,
      errors: [prettifyError(parseResult.error)],
      ...(Object.keys(fieldErrors).length > 0 && { fieldErrors }),
    } satisfies NodeExecutionFailedResult;
  }

  // 2. Resolve credential if needed
  let credential: ActionCredential | null = null;
  const credentialId = params.credentialId as string | undefined;
  if (credentialId && nodeContext.functions.getCredential) {
    try {
      credential = await nodeContext.functions.getCredential(credentialId);
    } catch (err) {
      logger.error('Failed to fetch credential for action', {
        actionId: action.id,
        credentialId,
        error: err,
      });
      return {
        state: NodeExecutionStatus.FAILED,
        errors: [`Failed to fetch credential: ${err instanceof Error ? err.message : String(err)}`],
      } satisfies NodeExecutionFailedResult;
    }
  }

  // 3. Build shared ActionExecutionContext
  const context: ActionExecutionContext = {
    logger,
    credential,
    incomingData: nodeContext.incomingData,
    flowInputs: nodeContext.flowInputs as Record<string, unknown> | undefined,
    flowContext: {
      flowId: nodeContext.flowId,
      flowRunId: nodeContext.flowRunId,
      nodeId: nodeContext.nodeId,
      traceId: nodeContext.traceId,
    },
    // Both NodeExecutionContext and ActionExecutionContext now share the same
    // concrete function signatures, so we can pass through directly.
    functions: nodeContext.functions,
    flowRunState: {
      edges: nodeContext.edges,
      nodes: nodeContext.nodes,
      skippedNodeIds: nodeContext.skippedNodeIds,
      flowParams: nodeContext.flowParams,
      globalConfig: nodeContext.globalConfig,
    },
  };

  // 4. Execute
  let result: ActionResult;
  try {
    result = await action.execute(parseResult.data, context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Action execution threw', { actionId: action.id, error: msg });
    return {
      state: NodeExecutionStatus.FAILED,
      errors: [msg],
    } satisfies NodeExecutionFailedResult;
  }

  // 5. Map ActionResult → NodeExecutionResult
  if (!result.success) {
    return {
      state: NodeExecutionStatus.FAILED,
      errors: [result.error ?? 'Action failed without error message'],
      metadata: result.metadata,
    } satisfies NodeExecutionFailedResult;
  }

  // 5a. Detect batch submission — the action signals this via metadata.
  //     Convert to NodeExecutionPendingResult so the flow coordinator
  //     can pause the flow and poll for completion.
  if (result.metadata?.__batchSubmitted === true) {
    return {
      state: NodeExecutionStatus.PENDING,
      type: 'batch_submitted' as const,
      batchJobId: String(result.metadata.batchJobId ?? ''),
      nodeId: String(result.metadata.nodeId ?? nodeContext.nodeId),
      executionId: String(result.metadata.flowRunId ?? nodeContext.flowRunId),
    } satisfies NodeExecutionPendingResult;
  }

  // Build output variables – prefer explicit outputVariables if the action
  // provided them (e.g. If-Else with true_output / false_output), otherwise
  // wrap the single `output` value in a default "output" variable.
  const variables = result.outputVariables
    ? result.outputVariables
    : {
        output: {
          value: result.output,
          // Infer type discriminator:
          //   - non-null objects/arrays → 'object'
          //   - strings, numbers, booleans, null, undefined → 'string'
          type: (result.output !== null &&
          result.output !== undefined &&
          typeof result.output === 'object'
            ? 'object'
            : 'string') as 'string' | 'object',
        },
      };

  return {
    state: NodeExecutionStatus.SUCCESS,
    type: 'output' as const,
    output: {
      nodeType: action.id,
      data: {
        variables,
        metadata: result.metadata,
      },
    },
  } satisfies NodeExecutionResult;
}

/**
 * Execute an action as an AI-agent tool.
 *
 * Called by the agent executor loop. Merges static params with AI-provided
 * input, resolves credential, builds the shared context, runs
 * `action.execute()`, then returns an `AgentToolResult`.
 */
export async function executeActionAsTool(
  action: ActionDefinition,
  input: Record<string, unknown>,
  toolContext: AgentToolExecutionContext,
): Promise<AgentToolResult> {
  const logger = toolContext.logger;

  // 1. Merge static params from the tool instance with AI-provided input
  //    Static params take precedence (they're user-configured).
  const mergedParams = {
    ...input,
    ...toolContext.staticParams,
  };

  // 2. Validate
  const parseResult = action.params.schema.safeParse(mergedParams);
  if (!parseResult.success) {
    const { prettifyError } = await import('zod/v4');
    return {
      success: false,
      error: `Invalid params: ${prettifyError(parseResult.error)}`,
    };
  }

  // 3. Resolve credential if needed
  let credential: ActionCredential | null = null;
  const credentialId =
    (toolContext.staticParams?.credentialId as string | undefined) ??
    (input.credentialId as string | undefined);

  if (credentialId && toolContext.nodeContext.functions.getCredential) {
    try {
      credential = await toolContext.nodeContext.functions.getCredential(credentialId);
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch credential: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 4. Build shared ActionExecutionContext
  const context: ActionExecutionContext = {
    logger,
    credential,
    incomingData: toolContext.nodeContext.incomingData,
    flowContext: {
      flowId: toolContext.nodeContext.flowId,
      flowRunId: toolContext.nodeContext.flowRunId,
      nodeId: toolContext.nodeContext.nodeId,
      traceId: toolContext.nodeContext.traceId,
    },
  };

  // 5. Execute
  try {
    const result = await action.execute(parseResult.data, context);
    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Action tool execution threw', { actionId: action.id, error: msg });
    return { success: false, error: msg };
  }
}

/**
 * Create an `AgentToolExecutor` function for a given action.
 *
 * This returns a function with the exact signature the existing
 * `AgentToolRegistry` expects, so actions can be registered as tools
 * without any changes to the agent executor.
 */
export function createToolExecutorForAction(
  action: ActionDefinition,
): (
  input: Record<string, unknown>,
  context: AgentToolExecutionContext,
) => Promise<AgentToolResult> {
  return (input, context) => executeActionAsTool(action, input, context);
}
