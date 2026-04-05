import { z } from 'zod/v4';
import type { NodeExecutionResult } from './types/node-execution.types';
import type { NodeOutput } from './types/node-io-types';
import type { Logger } from './schemas/invect-config';
import type { FlowEdge, FlowNodeDefinitions } from './services/flow-versions/schemas-fresh';
import type { BatchProvider, PromptResult } from './services/ai/base-client';
import type {
  AgentToolDefinition,
  AgentMessage,
  AgentPromptResult,
} from './types/agent-tool.types';
import type { SubmitPromptRequest } from './services/node-data.service';
export type { SubmitPromptRequest };

/**
 * Request to run an agent prompt with tools
 */
export interface SubmitAgentPromptRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  provider: BatchProvider;
  credentialId: string;
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  /** Whether to allow parallel tool calls (defaults to true) */
  parallelToolCalls?: boolean;
  /** When true, the first LLM call is submitted via the Batch API. */
  useBatchProcessing?: boolean;
  /** Node ID (required when useBatchProcessing is true). */
  nodeId?: string;
  /** Flow run ID (required when useBatchProcessing is true). */
  flowRunId?: string;
}

/**
 * Result of a submitPrompt call — either a synchronous prompt result
 * or a batch submission acknowledgement.
 */
export type SubmitPromptResult =
  | PromptResult
  | {
      type: 'batch_submitted';
      batchJobId: string;
      nodeId: string;
      flowRunId: string;
    };

/**
 * Input shape for recording a tool execution (agent nodes).
 */
export interface RecordToolExecutionInput {
  nodeExecutionId: string;
  flowRunId: string;
  toolId: string;
  toolName: string;
  iteration: number;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

/**
 * Context of an individual run of a flow
 */
export interface FlowRunContext {
  flowId: string;
  flowVersion: number;
  flowRunId: string;

  globalConfig: Record<string, string | number | boolean | null>;
  // Optional overrides from the default global Invect config for this specific flow
  flowParams: Record<string, unknown>; // TODO: useBatchProcessing: boolean; should existi

  // inputs values provided to this flow (includes trigger data when triggered by webhook/cron)
  flowInputs: Record<string, unknown>;

  /**
   * Incoming data from upstream nodes, keyed by reference ID.
   * Used by nodes that do their own template processing (e.g., Template String).
   * Structure: { ref_id: { output: value, ... }, ... }
   */
  incomingData?: Record<string, unknown>;

  /** All edges in the flow graph */
  edges: readonly FlowEdge[];
  /** All nodes in the flow graph */
  nodes: readonly FlowNodeDefinitions[];

  nodeExecutionResults: Map<string, NodeExecutionResult>;

  /** All collected outputs by nodeId */
  allNodeOutputs: Map<string, NodeOutput>;

  /** All collected inputs by nodeId */
  allNodeInputs: Map<string, unknown>;

  /** Skipped node tracking */
  skippedNodeIds: Set<string>;

  logger: Logger;

  error?: string;
  startedAt: Date | string;
  completedAt?: Date | string;
  durationMs?: number;
  initiatedBy?: string;

  functions: {
    // Template rendering ({{ expression }} syntax)
    runTemplateReplacement: (
      template: string,
      variables: {
        [key: string]: unknown;
      },
    ) => Promise<string>;

    // Flow control - mark downstream nodes as skipped
    markDownstreamNodesAsSkipped?: (
      nodeId: string,
      edges: readonly FlowEdge[],
      skippedNodes: Set<string>,
      isFromIfElse?: boolean,
    ) => void;

    // Credential retrieval for node authentication
    getCredential?: (credentialId: string) => Promise<{
      id: string;
      name: string;
      type: string;
      authType: string;
      config: Record<string, unknown>;
    } | null>;

    // Model prompt submission - has flow implications (batch processing)
    submitPrompt?: (request: SubmitPromptRequest) => Promise<SubmitPromptResult>;

    // Agent prompt submission - supports batch processing on first iteration
    submitAgentPrompt?: (
      request: SubmitAgentPromptRequest,
    ) => Promise<
      | AgentPromptResult
      | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string }
    >;

    // Record tool execution for agent nodes
    recordToolExecution?: (input: RecordToolExecutionInput) => Promise<{ id: string } | null>;
  };
}

// Node and execution types (expanded stubs)
export interface NodeExecutionContext extends FlowRunContext {
  nodeId: string;
  traceId?: string;
}

export const metadataSchema = z.record(z.string(), z.unknown()).optional();

export type MetaData = z.infer<typeof metadataSchema>;

// Re-export GraphNodeType and GRAPH_NODE_TYPE_NAMES from the pure types file
// This separation is critical - they must not be in a file with Zod schemas
// because the frontend imports them at runtime
export { GraphNodeType, GRAPH_NODE_TYPE_NAMES } from './types/graph-node-types';
