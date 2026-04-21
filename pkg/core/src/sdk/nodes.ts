/**
 * Node Helper Functions
 *
 * Typed factory functions that produce `FlowNodeDefinitions` for each
 * core action type. Each helper takes a `referenceId` (snake_case) and
 * typed params, returning a node definition ready for `defineFlow()`.
 */

import { newToolInstanceId } from '@invect/action-kit';
import type { FlowNodeDefinitions, MapperConfig } from 'src/services/flow-versions/schemas-fresh';
import type {
  InputParams,
  OutputParams,
  ModelParams,
  JavaScriptParams,
  IfElseParams,
  TemplateParams,
  HttpRequestParams,
  AgentParams,
  AddedToolInstance,
  MapperOptions,
} from './types';

// ── Utilities ───────────────────────────────────────────────────────────

/** Convert snake_case or camelCase to Title Case. */
function humanize(ref: string): string {
  return ref
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a MapperConfig from shorthand options. */
function buildMapper(opts: MapperOptions): MapperConfig {
  return {
    enabled: true,
    expression: opts.expression,
    mode: opts.mode ?? 'auto',
    outputMode: opts.outputMode ?? 'array',
    keyField: opts.keyField,
    concurrency: opts.concurrency ?? 1,
    onEmpty: opts.onEmpty ?? 'skip',
  };
}

/** Base node builder — shared by all helpers. */
function makeNode<T extends object>(
  type: string,
  referenceId: string,
  params: T,
  options?: { label?: string; position?: { x: number; y: number }; mapper?: MapperOptions },
): FlowNodeDefinitions {
  const node: FlowNodeDefinitions = {
    id: `node-${referenceId}`,
    type,
    label: options?.label ?? humanize(referenceId),
    referenceId,
    params: params as Record<string, unknown>,
  };
  if (options?.position) {
    node.position = options.position;
  }
  if (options?.mapper) {
    node.mapper = buildMapper(options.mapper);
  }
  return node;
}

// ── Core node helpers ───────────────────────────────────────────────────

export interface NodeOptions {
  label?: string;
  position?: { x: number; y: number };
  mapper?: MapperOptions;
}

export function input(
  referenceId: string,
  params: InputParams = {},
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.input', referenceId, params, options);
}

export function output(
  referenceId: string,
  params: OutputParams = {},
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.output', referenceId, params, options);
}

export function model(
  referenceId: string,
  params: ModelParams,
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.model', referenceId, params, options);
}

export function javascript(
  referenceId: string,
  params: JavaScriptParams,
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.javascript', referenceId, params, options);
}

/** Alias of `javascript()` — matches the `code()` name used in `@invect/primitives`. */
export const code = javascript;

export function ifElse(
  referenceId: string,
  params: IfElseParams = {},
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.if_else', referenceId, params, options);
}

export function template(
  referenceId: string,
  params: TemplateParams = {},
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('core.template_string', referenceId, params, options);
}

export function httpRequest(
  referenceId: string,
  params: HttpRequestParams,
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode('http.request', referenceId, params, options);
}

/**
 * Agent node — runs an iterative LLM tool-calling loop.
 *
 * The agent sends a task prompt to the LLM with a set of enabled tools,
 * executes tool calls, and iterates until a stop condition is met.
 *
 * Mirrors the `agent()` helper in `@invect/primitives`: tool instances are
 * declared via the `tool()` helper and `instanceId`s missing from each entry
 * are assigned automatically here (canonical `tool_XXXXXXXX` format, shared
 * with the chat agent tools and the editor tool panel).
 *
 * @example
 * agent('researcher', {
 *   credentialId: '{{env.OPENAI_CREDENTIAL}}',
 *   model: 'gpt-4o',
 *   taskPrompt: 'Research {{ topic }} and write a summary',
 *   addedTools: [
 *     tool('github.search_issues', { description: 'Find existing issues' }),
 *   ],
 * })
 */
export function agent(
  referenceId: string,
  params: AgentParams,
  options?: NodeOptions,
): FlowNodeDefinitions {
  const resolved: AgentParams = { ...params };
  if (Array.isArray(resolved.addedTools)) {
    resolved.addedTools = resolved.addedTools.map((t) => ({
      instanceId: t.instanceId ?? newToolInstanceId(),
      ...t,
    }));
  }
  return makeNode('AGENT', referenceId, resolved, options);
}

/**
 * Generic node helper for any action type not covered by dedicated helpers.
 * Use this for third-party plugin actions or uncommon built-in actions.
 *
 * @example
 * node('linear.create_issue', 'create_task', { title: 'Fix bug', teamId: '...' })
 */
export function node<T extends object>(
  type: string,
  referenceId: string,
  params: T = {} as T,
  options?: NodeOptions,
): FlowNodeDefinitions {
  return makeNode(type, referenceId, params, options);
}

// ── Agent tool helper ───────────────────────────────────────────────────

/**
 * Declare a tool instance for an agent's `addedTools` array. The runtime-level
 * `instanceId` is assigned automatically by `agent()`.
 *
 * Signature mirrors `tool()` in `@invect/primitives` so the same call works in
 * both SDKs.
 *
 * @example
 * agent('triage', {
 *   credentialId: '{{ env.ANTHROPIC }}',
 *   model: 'claude-sonnet-4-6',
 *   taskPrompt: '...',
 *   addedTools: [
 *     tool('github.search_issues', {
 *       description: 'Look for existing issues before filing new ones',
 *       params: { perPage: 10 },
 *     }),
 *   ],
 * });
 */
export function tool(
  toolId: string,
  options?: {
    /** Display name surfaced to the LLM. Defaults to `toolId`. */
    name?: string;
    /** Tool description surfaced to the LLM. Defaults to empty string. */
    description?: string;
    /** Static params bound to every call of this tool instance. */
    params?: Record<string, unknown>;
  },
): Omit<AddedToolInstance, 'instanceId'> {
  return {
    toolId,
    name: options?.name ?? toolId,
    description: options?.description ?? '',
    params: options?.params ?? {},
  };
}
