/**
 * Structural `NodeExecutionContext` used by the generic action executor.
 *
 * This is the minimum surface the executor needs when running an
 * `ActionDefinition` as a flow node (i.e. called from a flow run
 * coordinator). `@invect/core`'s concrete `NodeExecutionContext` is
 * structurally compatible with this shape.
 */

import type { ActionCredential } from './action-credential';
import type { FlowEdge, FlowNodeDefinitions } from './flow';
import type { AgentPromptResult } from './agent-tool';
import type { JsExpressionEvaluator } from './evaluator';
import type { Logger } from './logger';
import type {
  RecordToolExecutionInput,
  SubmitAgentPromptRequest,
  SubmitPromptRequest,
  SubmitPromptResult,
} from './prompt';

export interface NodeExecutionContext {
  logger: Logger;

  flowId: string;
  flowVersion: number;
  flowRunId: string;
  nodeId: string;
  traceId?: string;

  globalConfig: Record<string, string | number | boolean | null>;
  flowParams: Record<string, unknown>;

  flowInputs: Record<string, unknown>;

  incomingData?: Record<string, unknown>;

  edges: readonly FlowEdge[];
  nodes: readonly FlowNodeDefinitions[];

  skippedNodeIds: Set<string>;

  functions: {
    runTemplateReplacement: (
      template: string,
      variables: Record<string, unknown>,
    ) => Promise<string>;

    markDownstreamNodesAsSkipped?: (
      nodeId: string,
      edges: readonly FlowEdge[],
      skippedNodes: Set<string>,
      isFromIfElse?: boolean,
    ) => void;

    getCredential?: (credentialId: string) => Promise<ActionCredential | null>;

    submitPrompt?: (request: SubmitPromptRequest) => Promise<SubmitPromptResult>;

    submitAgentPrompt?: (
      request: SubmitAgentPromptRequest,
    ) => Promise<
      | AgentPromptResult
      | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string }
    >;

    recordToolExecution?: (input: RecordToolExecutionInput) => Promise<{ id: string } | null>;

    evaluator?: JsExpressionEvaluator;
  };
}
