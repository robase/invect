import type { ActionDefinition, ActionExecutionContext, JsExpressionEvaluator } from '@invect/core';

export type { ActionDefinition };

// ─── Node context ────────────────────────────────────────────────────────────

export type NodeContext = {
  [referenceId: string]: unknown;
  previous_nodes: Record<string, unknown>;
};

// ─── Callable params ─────────────────────────────────────────────────────────

export type ParamValue<T> = T | ((ctx: NodeContext) => T) | ((ctx: NodeContext) => Promise<T>);

// ─── Flow definition ─────────────────────────────────────────────────────────

export interface PrimitiveNode {
  referenceId: string;
  type: string;
  params: Record<string, ParamValue<unknown>>;
  mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
}

// Tuple: [source, target] or [source, target, sourceHandle]
export type PrimitiveEdge = [string, string] | [string, string, string];

export interface PrimitiveFlowDefinition {
  nodes: PrimitiveNode[];
  edges: PrimitiveEdge[];
}

// ─── Run result ──────────────────────────────────────────────────────────────

export interface FlowRunResult {
  status: 'success' | 'failed';
  outputs: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  error?: { nodeId: string; message: string };
}

// ─── Durability adapter ───────────────────────────────────────────────────────

export interface StepOptions {
  retries?: {
    maxAttempts: number;
    backoff?: 'exponential' | 'linear';
  };
  timeout?: string;
}

export class WaitTimeoutError extends Error {
  constructor(public readonly eventName: string) {
    super(`Timed out waiting for event: ${eventName}`);
    this.name = 'WaitTimeoutError';
  }
}

export interface DurabilityAdapter {
  step<T>(name: string, fn: () => Promise<T>, options?: StepOptions): Promise<T>;
  sleep(duration: string | number): Promise<void>;
  waitForEvent<T>(name: string, options?: { timeout?: string }): Promise<T>;
  subscribe<T>(name: string): AsyncIterable<T>;
}

// ─── Runner config ────────────────────────────────────────────────────────────

type SubmitPromptFn = NonNullable<ActionExecutionContext['functions']>['submitPrompt'];
type SubmitAgentPromptFn = NonNullable<ActionExecutionContext['functions']>['submitAgentPrompt'];

export interface FlowRunnerConfig {
  // Resolve a credential by ID — returns decrypted fields (e.g. { apiKey: '...' }).
  // For OAuth2 credentials, token refresh is the caller's responsibility.
  resolveCredential?: (credentialId: string) => Promise<Record<string, unknown>>;

  // Submit a prompt to an AI model. Defaults to the built-in fetch client.
  // Pass a custom impl for streaming, retries, or non-standard providers.
  submitPrompt?: SubmitPromptFn;

  // Submit an agent loop prompt. Required for AGENT nodes.
  submitAgentPrompt?: SubmitAgentPromptFn;

  // Durability adapter for step execution, sleep, and event waits.
  // Omit for in-memory (non-durable) execution.
  adapter?: DurabilityAdapter;

  // Extra actions to register beyond the defaults (all @invect/core builtins).
  // Use this to supply third-party or custom ActionDefinition instances.
  actions?: ActionDefinition[];

  // JS expression evaluator backend used by core.if_else / core.switch / core.javascript.
  // Defaults to the QuickJS-backed service when running on Node. Edge runtimes
  // (Vercel Workflows, Cloudflare Workers) pass a DirectEvaluator to avoid
  // bundling the QuickJS WASM.
  jsEvaluator?: JsExpressionEvaluator;
}

export interface FlowRunner {
  run(
    definition: PrimitiveFlowDefinition,
    inputs?: Record<string, unknown>,
  ): Promise<FlowRunResult>;
}
