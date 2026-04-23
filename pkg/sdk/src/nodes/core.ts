/**
 * Core node helpers — ergonomic wrappers over the action callables in
 * `@invect/actions/core`.
 *
 * The underlying actions (exported as callable `ActionHelper`s from
 * `defineAction`) have strict signatures inferred from their Zod schemas.
 * These wrappers provide the author-friendly shapes users expect:
 *   - `input('ref')` — no params required (schema defaults apply)
 *   - `output('ref', { value })` — `value` is an alias for `outputValue`
 *   - `code('ref', { code })` — matches the primitives-SDK name
 *
 * Each wrapper delegates to the real action helper, producing the same
 * `SdkFlowNode` shape and threading `NodeOptions` through untouched.
 *
 * The callable actions themselves remain exported (see `@invect/actions/core`)
 * for authors who want full Zod-strict typing.
 */

import {
  inputAction,
  outputAction,
  javascriptAction,
  ifElseAction,
  switchAction,
  modelAction,
  agentAction,
} from '@invect/actions/core';
import type { NodeOptions, SdkFlowNode } from '@invect/action-kit';
import type { ToolInstance } from '../tool';

// ═══════════════════════════════════════════════════════════════════════════
// input
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flow input node.
 *
 * With no params, uses the referenceId as the runtime variable name.
 *   `input('query')` — reads `inputs.query` at runtime.
 *   `input('user', { variableName: 'current_user' })` — explicit name.
 */
export function input(
  referenceId: string,
  params?: { variableName?: string; defaultValue?: string },
  options?: NodeOptions,
): SdkFlowNode {
  return inputAction(
    referenceId,
    {
      variableName: params?.variableName ?? referenceId,
      defaultValue: params?.defaultValue ?? '',
    },
    options,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// output
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flow output node.
 *
 * `value` supports `{{ expr }}` template syntax (JS, evaluated in QuickJS at
 * runtime). After the Phase 4 arrow-to-string transform lands, this will also
 * accept `(ctx) => ...` arrow forms.
 */
export function output(
  referenceId: string,
  params: { value: string; name?: string },
  options?: NodeOptions,
): SdkFlowNode {
  return outputAction(
    referenceId,
    { outputValue: params.value, outputName: params.name ?? referenceId },
    options,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// code / javascript
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run a JavaScript expression/block in QuickJS.
 *
 * Today: pass a string of JS source (the runtime form).
 * After Phase 4 (arrow-to-string transform): `code: (ctx) => ...` also accepted.
 */
export function code(
  referenceId: string,
  params: { code: string },
  options?: NodeOptions,
): SdkFlowNode {
  return javascriptAction(referenceId, { code: params.code }, options);
}

/** Alias matching the `javascript()` name used in `@invect/core/sdk`. */
export const javascript = code;

// ═══════════════════════════════════════════════════════════════════════════
// ifElse
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Two-way conditional branching — edges from this node use source handles
 * `true_output` and `false_output`.
 *
 * Today: `condition` is a string JS expression.
 * After Phase 4: `condition: (ctx) => boolean` also accepted.
 */
export function ifElse(
  referenceId: string,
  params: { condition: string },
  options?: NodeOptions,
): SdkFlowNode {
  return ifElseAction(referenceId, { expression: params.condition }, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// switchNode
// ═══════════════════════════════════════════════════════════════════════════

export interface SwitchCase {
  slug: string;
  label: string;
  /** JS expression string. Post-Phase-4 also accepts `(ctx) => boolean`. */
  expression: string;
}

/**
 * Multi-way conditional branching. Edges use source handles that match each
 * case's `slug` (plus `default` for the fallthrough).
 */
export function switchNode(
  referenceId: string,
  params: { cases: SwitchCase[]; matchMode?: 'first' | 'all' },
  options?: NodeOptions,
): SdkFlowNode {
  return switchAction(
    referenceId,
    {
      cases: params.cases,
      matchMode: params.matchMode ?? 'first',
    },
    options,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// model
// ═══════════════════════════════════════════════════════════════════════════

export interface ModelParams {
  credentialId: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  outputJsonSchema?: string;
  useBatchProcessing?: boolean;
}

/** Single-shot LLM call (OpenAI / Anthropic / OpenRouter). */
export function model(
  referenceId: string,
  params: ModelParams,
  options?: NodeOptions,
): SdkFlowNode {
  return modelAction(
    referenceId,
    {
      credentialId: params.credentialId,
      model: params.model,
      prompt: params.prompt,
      systemPrompt: params.systemPrompt ?? '',
      provider: params.provider,
      temperature: params.temperature ?? 0.7,
      maxTokens: params.maxTokens,
      outputJsonSchema: params.outputJsonSchema,
      useBatchProcessing: params.useBatchProcessing ?? false,
    } as Parameters<typeof modelAction>[1],
    options,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// agent
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentParams {
  credentialId: string;
  model: string;
  taskPrompt: string;
  systemPrompt?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  stopCondition?: 'explicit_stop' | 'tool_result' | 'max_iterations';
  toolTimeoutMs?: number;
  maxConversationTokens?: number;
  enableParallelTools?: boolean;
  useBatchProcessing?: boolean;
  /** Attached tools as `tool()` instances. `instanceId` is assigned at save time. */
  addedTools?: ToolInstance[];
}

/**
 * Iterative agent node — runs an LLM tool-calling loop.
 *
 * Tools are declared via the `tool()` helper in `addedTools`. The save pipeline
 * assigns stable `instanceId`s by matching against the prior version; new
 * tools get fresh ids.
 */
export function agent(
  referenceId: string,
  params: AgentParams,
  options?: NodeOptions,
): SdkFlowNode {
  // Pass the authored params through directly. Zod parses + defaults fill in
  // missing optional fields at runtime; the agent action's schema is lenient
  // enough that the author-friendly shape here is a superset.
  return agentAction(referenceId, params as unknown as Parameters<typeof agentAction>[1], options);
}
