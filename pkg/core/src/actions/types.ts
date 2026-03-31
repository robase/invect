/**
 * Action Types
 *
 * Core type definitions for the Provider-Actions architecture.
 * An "action" is the fundamental unit — it can be rendered as a Node
 * in the flow editor, exposed as a Tool for AI agents, or both.
 *
 * The same `execute()` function handles both node and tool invocation.
 */

import { z } from 'zod/v4';
import type { Logger } from 'src/types/schemas-fresh/invect-config';
import type {
  SubmitPromptRequest,
  SubmitAgentPromptRequest,
  SubmitPromptResult,
  RecordToolExecutionInput,
} from 'src/types-fresh';
import type { AgentPromptResult } from 'src/types/agent-tool.types';
import type { FlowEdge, FlowNodeDefinitions } from 'src/services/flow-versions/schemas-fresh';
import type { NodeDefinition } from 'src/types/node-definition.types';
import type { CredentialsService } from 'src/services/credentials/credentials.service';
import type { BaseAIClient } from 'src/services/ai/base-client';

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provider category for UI organisation and palette grouping.
 */
export type ProviderCategory =
  | 'email' // Gmail, Outlook
  | 'messaging' // Slack, Discord
  | 'storage' // Google Drive, S3
  | 'database' // PostgreSQL, MySQL
  | 'development' // GitHub, Jira
  | 'ai' // OpenAI, Anthropic
  | 'http' // Generic HTTP
  | 'utility' // JQ, Math
  | 'core' // Built-in flow-control nodes (Input, Output, If-Else …)
  | 'custom'; // User-defined

/**
 * A provider groups related actions under a service / brand.
 * Examples: "gmail", "slack", "http", "core".
 *
 * Multiple action files can reference the same ProviderDef – the registry
 * de-duplicates by `id`.
 */
export interface ProviderDef {
  /** Unique slug, e.g. "gmail", "slack", "core" */
  id: string;
  /** Human-readable name */
  name: string;
  /** Lucide icon name for UI (fallback when no static SVG file exists for the provider id) */
  icon: string;
  /**
   * Raw SVG markup for custom provider branding (legacy).
   *
   * Prefer adding a static SVG file to `pkg/frontend/src/assets/provider-icons/{id}.svg`
   * instead. The frontend resolves icons by provider `id` first, then falls back
   * to `svgIcon`, then to the Lucide `icon` name.
   */
  svgIcon?: string;
  /** Category for palette grouping */
  category: ProviderCategory;
  /**
   * Which section this provider's actions appear in within the node palette.
   * Maps directly to the frontend sidebar categories.
   */
  nodeCategory: 'Common' | 'AI' | 'Data' | 'Logic' | 'IO' | 'Integrations' | 'Custom' | 'Triggers';
  /** Optional longer description */
  description?: string;
  /** Link to provider API docs */
  docsUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Declares what kind of credential an action needs (if any).
 */
export interface CredentialRequirement {
  required: boolean;
  type?: 'oauth2' | 'api_key' | 'basic_auth' | 'database' | 'llm';
  /** OAuth2 provider id from the OAuth2 providers registry */
  oauth2Provider?: string;
  /** Shown to the user explaining what the credential is for */
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETER FIELDS (UI layer)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Describes a single parameter field for the config panel / tool schema.
 */
export interface ParamField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json' | 'code';
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  /** When true, field is hidden from the config panel */
  hidden?: boolean;
  options?: { label: string; value: string | number }[];
  /** Show in collapsed "More Options" section */
  extended?: boolean;
  /**
   * When true the AI provides this value at runtime (tool mode).
   * When false the value is treated as a static configuration.
   * Defaults to `true` when omitted.
   */
  aiProvided?: boolean;

  /**
   * Declare that this field's options should be loaded from the server
   * when the values of `dependsOn` fields change.
   *
   * The `handler` runs server-side with access to credentials and services.
   * The frontend only sees the serialised metadata (`dependsOn` + flag).
   *
   * Example — load AI models based on the selected credential:
   * ```ts
   * loadOptions: {
   *   dependsOn: ['credentialId'],
   *   handler: async (deps, ctx) => {
   *     const cred = await ctx.services.credentials.get(deps.credentialId);
   *     const models = await fetchModels(cred);
   *     return { options: models.map(m => ({ label: m.name, value: m.id })) };
   *   },
   * }
   * ```
   */
  loadOptions?: LoadOptionsConfig;
}

/**
 * Server-side handler context provided to `loadOptions.handler`.
 */
export interface LoadOptionsContext {
  logger: Logger;
  services: {
    credentials: CredentialsService;
  };
}

/**
 * Configuration for dynamic option loading on a field.
 */
export interface LoadOptionsConfig {
  /**
   * Which sibling param fields this depends on.
   * When any of these change, the frontend calls the server to reload options.
   */
  dependsOn: string[];

  /**
   * Server-side handler that returns the options for this field.
   * Receives the current values of the `dependsOn` fields plus the full context.
   */
  handler: (
    dependencyValues: Record<string, unknown>,
    context: LoadOptionsContext,
  ) => Promise<LoadOptionsResult>;
}

/**
 * Result returned by a `loadOptions` handler.
 */
export interface LoadOptionsResult {
  /** The options to populate the select/combobox with. */
  options: { label: string; value: string | number }[];
  /** Optional default value to auto-select if the current value is not in the list. */
  defaultValue?: string | number;
  /** Optional placeholder text override. */
  placeholder?: string;
  /** If true, the field should be disabled (e.g. no options available). */
  disabled?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT (shared between node and tool invocation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Credential shape as provided to an executing action.
 */
export interface ActionCredential {
  id: string;
  name: string;
  type: string;
  authType: string;
  config: Record<string, unknown>;
}

/**
 * Execution context handed to every `execute()` call regardless of whether
 * the action is running as a flow node or an AI-agent tool.
 */
export interface ActionExecutionContext {
  /** Scoped logger */
  logger: Logger;

  /** Decrypted credential (null when action doesn't require one) */
  credential: ActionCredential | null;

  /**
   * Upstream node outputs keyed by reference-id.
   * Present when running inside a flow; `undefined` when running as a standalone tool.
   */
  incomingData?: Record<string, unknown>;

  /**
   * Flow inputs (top-level inputs provided when starting the flow).
   * Only present when the action runs as a flow node.
   */
  flowInputs?: Record<string, unknown>;

  /**
   * Flow-level identifiers. Only present when the action runs as a flow node.
   */
  flowContext?: {
    flowId: string;
    flowRunId: string;
    nodeId: string;
    traceId?: string;
  };

  /**
   * Service functions available from the flow orchestrator.
   * Only present when running inside a flow. Actions should
   * gracefully degrade when these are not available (e.g. tool mode).
   */
  functions?: {
    /** Render a Nunjucks template against variables */
    runTemplateReplacement?: (
      template: string,
      variables: Record<string, unknown>,
    ) => Promise<string>;
    /** Submit a prompt to an AI model (for Model node) */
    submitPrompt?: (request: SubmitPromptRequest) => Promise<SubmitPromptResult>;
    /** Submit an agent prompt with tools (for Agent node) */
    submitAgentPrompt?: (
      request: SubmitAgentPromptRequest,
    ) => Promise<
      | AgentPromptResult
      | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string }
    >;
    /** Get a decrypted credential by id */
    getCredential?: (credentialId: string) => Promise<ActionCredential | null>;
    /** Mark downstream nodes as skipped (for If-Else node) */
    markDownstreamNodesAsSkipped?: (
      nodeId: string,
      edges: readonly FlowEdge[],
      skippedNodes: Set<string>,
      isFromIfElse?: boolean,
    ) => void;
    /** Record a tool execution (for Agent node) */
    recordToolExecution?: (input: RecordToolExecutionInput) => Promise<{ id: string } | null>;
  };

  /**
   * Additional flow-run context passed through for special nodes (If-Else, Agent).
   * Not available in tool mode.
   */
  flowRunState?: {
    edges?: readonly FlowEdge[];
    nodes?: readonly FlowNodeDefinitions[];
    skippedNodeIds?: Set<string>;
    flowParams?: Record<string, unknown>;
    globalConfig?: Record<string, unknown>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG UPDATE (optional hook for dynamic config)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context provided to `onConfigUpdate` — gives access to services needed
 * for dynamic configuration (e.g. fetching model lists from a provider).
 */
export interface ActionConfigUpdateContext {
  logger: Logger;
  services: {
    credentials: CredentialsService;
    baseAIClient: BaseAIClient;
  };
}

/**
 * Event payload describing which config field changed.
 */
export interface ActionConfigUpdateEvent {
  nodeId: string;
  nodeType: string;
  flowId?: string;
  params: Record<string, unknown>;
  change?: { field: string; value: unknown };
}

/**
 * Response from `onConfigUpdate` — returns an updated definition and
 * optionally mutated params, warnings, or errors.
 */
export interface ActionConfigUpdateResponse {
  definition: NodeDefinition;
  params?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every `execute()` function returns this.
 * It intentionally matches `AgentToolResult` so tool results need no mapping.
 *
 * The `output` field should be one of:
 *   - `string`           → text, JSON-serialized data, template results
 *   - plain object/array → structured data (API responses, query results)
 *   - `undefined`        → batch-pending sentinel (flow pauses, no output stored)
 *
 * Avoid returning raw numbers, booleans, `null`, Buffers, Dates, or class instances.
 * The action executor bridge infers `OutputVariable.type` as `'object'` for non-null
 * objects, and `'string'` for everything else.
 */
export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  /**
   * Optional named output variables.
   * When provided, the action executor bridge uses these directly
   * instead of wrapping `output` into a single "output" variable.
   * Useful for flow-control nodes like If-Else that produce branch-specific outputs.
   */
  outputVariables?: Record<string, { value: unknown; type: 'string' | 'object' }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sub-category within a provider for finer-grained UI grouping.
 */
export type ActionCategory = 'read' | 'write' | 'delete' | 'manage';

/**
 * Complete action definition — the single source of truth for a node/tool.
 *
 * @typeParam TParams - Inferred from the Zod `params.schema`
 */
export interface ActionDefinition<TParams = unknown> {
  /**
   * Globally unique action id using `provider.action_name` format.
   * This is also the **node type** stored in the database and used by the
   * executor registry.
   *
   * Examples: `"gmail.list_messages"`, `"core.javascript"`, `"http.request"`
   */
  id: string;

  /** Human-readable name displayed in the palette and on the node */
  name: string;

  /** Description shown in the UI and given to AI agents */
  description: string;

  /** Provider this action belongs to */
  provider: ProviderDef;

  /** Credential requirements (omit if the action needs no credentials) */
  credential?: CredentialRequirement;

  /** Parameter configuration */
  params: {
    /** Zod schema — used for validation in both node and tool paths */
    schema: z.ZodType<TParams>;
    /** UI field descriptors (drives the config panel and the tool JSON-Schema) */
    fields: ParamField[];
  };

  /**
   * Custom output handle definitions.
   * When set, `toNodeDefinition()` will use these instead of the default
   * single `{ id: 'output', label: 'Output', type: 'object' }` handle.
   *
   * Example (if/else node):
   * ```ts
   * outputs: [
   *   { id: 'true_output', label: 'True', type: 'any' },
   *   { id: 'false_output', label: 'False', type: 'any' },
   * ]
   * ```
   */
  outputs?: Array<{ id: string; label: string; type: string }>;

  /**
   * If true, the node has no input handle (entry-point / trigger nodes).
   * When set, `toNodeDefinition()` will produce `input: undefined`.
   */
  noInput?: boolean;

  /**
   * Maximum number of instances of this node type allowed in a single flow.
   * For example, `maxInstances: 1` ensures only one Manual Trigger per flow.
   * When omitted there is no limit.
   */
  maxInstances?: number;

  /**
   * When true the action is still registered and executable but is hidden
   * from the node palette in the frontend.  Useful for deprecated actions
   * that must remain functional for backward compatibility.
   */
  hidden?: boolean;

  /** Search / filter tags */
  tags?: string[];

  /**
   * Lucide icon name for this specific action.
   * When set, overrides `provider.icon` for the node definition.
   * Use this to give each core node a contextually meaningful icon
   * instead of inheriting the generic provider icon.
   */
  icon?: string;

  /** Sub-category inside the provider */
  actionCategory?: ActionCategory;

  /**
   * The execute function — called identically whether the action is
   * running as a flow node or as an AI-agent tool.
   */
  execute(params: TParams, context: ActionExecutionContext): Promise<ActionResult>;

  /**
   * Optional hook for dynamic configuration updates.
   * Called when the frontend changes a config field (e.g. selecting a credential
   * for a Model node triggers fetching the available models).
   *
   * If not provided, the default behaviour returns the static definition + params.
   */
  onConfigUpdate?(
    event: ActionConfigUpdateEvent,
    context: ActionConfigUpdateContext,
  ): Promise<ActionConfigUpdateResponse>;
}
