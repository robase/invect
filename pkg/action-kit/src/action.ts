/**
 * Action Types — single source of truth for the Provider-Actions architecture.
 *
 * An "action" is the fundamental unit — renderable as a flow Node, callable
 * as an agent Tool, or both. The same `execute()` handles both paths.
 */

import type { z } from 'zod/v4';
import type { ActionCredential } from './action-credential';
import type { FlowEdge, FlowNodeDefinitions } from './flow';
import type { AgentPromptResult } from './agent-tool';
import type { JsExpressionEvaluator } from './evaluator';
import type { Logger } from './logger';
import type { NodeDefinition } from './node';
import type {
  RecordToolExecutionInput,
  SubmitAgentPromptRequest,
  SubmitAgentPromptResult,
  SubmitPromptRequest,
  SubmitPromptResult,
} from './prompt';
import type { ActionAIClient, ActionCredentialsService } from './services';

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderCategory =
  | 'email'
  | 'messaging'
  | 'storage'
  | 'database'
  | 'development'
  | 'ai'
  | 'http'
  | 'utility'
  | 'core'
  | 'custom';

export interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  svgIcon?: string;
  category: ProviderCategory;
  nodeCategory: 'Common' | 'AI' | 'Data' | 'Logic' | 'IO' | 'Integrations' | 'Custom' | 'Triggers';
  description?: string;
  docsUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL
// ═══════════════════════════════════════════════════════════════════════════

export interface CredentialRequirement {
  required: boolean;
  type?: 'oauth2' | 'api_key' | 'basic_auth' | 'database' | 'llm';
  oauth2Provider?: string;
  requiredScopes?: string[];
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER FIELDS
// ═══════════════════════════════════════════════════════════════════════════

export interface ParamField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'code' | 'switch-cases';
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  hidden?: boolean;
  options?: { label: string; value: string | number; description?: string }[];
  extended?: boolean;
  aiProvided?: boolean;
  loadOptions?: LoadOptionsConfig;
}

export interface LoadOptionsContext {
  logger: Logger;
  services: {
    credentials: ActionCredentialsService;
    baseAIClient?: ActionAIClient;
  };
}

export interface LoadOptionsConfig {
  dependsOn: string[];
  handler: (
    dependencyValues: Record<string, unknown>,
    context: LoadOptionsContext,
  ) => Promise<LoadOptionsResult>;
}

export interface LoadOptionsResult {
  options: { label: string; value: string | number }[];
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionExecutionContext {
  logger: Logger;
  credential: ActionCredential | null;
  incomingData?: Record<string, unknown>;
  flowInputs?: Record<string, unknown>;
  flowContext?: {
    flowId: string;
    flowRunId: string;
    nodeId: string;
    traceId?: string;
  };
  functions?: {
    runTemplateReplacement?: (
      template: string,
      variables: Record<string, unknown>,
    ) => Promise<string>;
    submitPrompt?: (request: SubmitPromptRequest) => Promise<SubmitPromptResult>;
    submitAgentPrompt?: (request: SubmitAgentPromptRequest) => Promise<SubmitAgentPromptResult>;
    getCredential?: (credentialId: string) => Promise<ActionCredential | null>;
    markDownstreamNodesAsSkipped?: (
      nodeId: string,
      edges: readonly FlowEdge[],
      skippedNodes: Set<string>,
      isFromIfElse?: boolean,
    ) => void;
    recordToolExecution?: (input: RecordToolExecutionInput) => Promise<{ id: string } | null>;
    evaluator?: JsExpressionEvaluator;
  };
  flowRunState?: {
    edges?: readonly FlowEdge[];
    nodes?: readonly FlowNodeDefinitions[];
    skippedNodeIds?: Set<string>;
    flowParams?: Record<string, unknown>;
    globalConfig?: Record<string, unknown>;
  };
  abortSignal?: AbortSignal;
}

// Re-export for consumers that want the type at this module path.
export type { AgentPromptResult };

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG UPDATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionConfigUpdateContext {
  logger: Logger;
  services: {
    credentials: ActionCredentialsService;
    baseAIClient: ActionAIClient;
  };
}

export interface ActionConfigUpdateEvent {
  nodeId: string;
  nodeType: string;
  flowId?: string;
  params: Record<string, unknown>;
  change?: { field: string; value: unknown };
}

export interface ActionConfigUpdateResponse {
  definition: NodeDefinition;
  params?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  outputVariables?: Record<string, { value: unknown; type: 'string' | 'object' }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

export type ActionCategory = 'read' | 'write' | 'delete' | 'manage';

/**
 * Declarative retry policy for an action. The retry loop lives in
 * `executeActionAsNode`; actions opt in by setting `retry.maxAttempts > 1`.
 * Default policy (when omitted) is `maxAttempts: 1` — no retry.
 */
export interface ActionRetryConfig {
  /** Maximum attempts (including the first). 1 = no retry. Capped at 5. */
  maxAttempts?: number;
  /** Base delay before the 1st retry (ms). Default 500. */
  initialDelayMs?: number;
  /** Upper bound on any single delay (ms). Default 30_000. */
  maxDelayMs?: number;
  /** Exponential backoff multiplier. Default 2. */
  backoffMultiplier?: number;
  /** Apply ±25% jitter to delays. Default true. */
  jitter?: boolean;
  /**
   * Which NodeErrorCodes are eligible for retry. Defaults to
   * ['RATE_LIMIT', 'NETWORK', 'UPSTREAM_5XX', 'TIMEOUT'].
   */
  retryOn?: readonly import('./node-execution').NodeErrorCode[];
}

/**
 * One declared output handle. `id` is the source-handle string used by
 * downstream edges (`{ from, to, handle: 'true_output' }`); the `Id`
 * generic captures it as a string literal so action helpers can narrow
 * edge `handle` against the actual declared values.
 */
export interface ActionOutputDef<Id extends string = string> {
  id: Id;
  label: string;
  type: string;
}

/**
 * Action params type generics:
 *
 * - `TParamsIn` is the **input** shape — what callers of the action helper
 *   provide. Optional/defaulted Zod fields are optional here.
 * - `TParamsOut` is the **output** shape — what `execute()` receives at
 *   runtime. Defaults are filled in by Zod parse, so they're required here.
 *
 * Inferred via `z.input<typeof schema>` / `z.output<typeof schema>` by
 * `defineAction`. Authors don't write these by hand.
 */
export interface ActionDefinition<
  TParamsIn = unknown,
  TParamsOut = TParamsIn,
  THandles extends readonly ActionOutputDef[] = readonly ActionOutputDef[],
> {
  id: string;
  name: string;
  description: string;
  provider: ProviderDef;
  credential?: CredentialRequirement;
  params: {
    schema: z.ZodType<TParamsOut, TParamsIn>;
    fields: ParamField[];
  };
  outputs?: THandles;
  dynamicOutputs?: boolean;
  noInput?: boolean;
  maxInstances?: number;
  hidden?: boolean;
  excludeFromTools?: boolean;
  tags?: string[];
  icon?: string;
  actionCategory?: ActionCategory;
  /** Optional declarative retry policy — see ActionRetryConfig. */
  retry?: ActionRetryConfig;
  execute(params: TParamsOut, context: ActionExecutionContext): Promise<ActionResult>;
  onConfigUpdate?(
    event: ActionConfigUpdateEvent,
    context: ActionConfigUpdateContext,
  ): Promise<ActionConfigUpdateResponse>;
}
