/**
 * Agent Tool Types
 *
 * Types for defining tools that AI agents can use during execution.
 */

import { Logger } from 'src/schemas';
import { NodeExecutionContext } from 'src/types.internal';

/**
 * Tool category for organization in UI
 */
export type AgentToolCategory = 'data' | 'web' | 'code' | 'utility' | 'custom';

/**
 * Default timeout for tool execution (30 seconds)
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 30000;

/**
 * Default max tokens for conversation history (approximate)
 * This is used to estimate when to truncate conversation history
 */
export const DEFAULT_MAX_CONVERSATION_TOKENS = 100000;

/**
 * Approximate tokens per character (for estimation)
 */
export const APPROX_TOKENS_PER_CHAR = 0.25;

/**
 * Base tool definition that can be registered and used by agents
 */
export interface AgentToolDefinition {
  /** Unique tool identifier (snake_case recommended) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description for the LLM to understand when to use this tool */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Tool category for organization in UI */
  category: AgentToolCategory;
  /** Tags for filtering and organization */
  tags?: string[];
  /** Whether this tool is enabled by default */
  enabledByDefault?: boolean;
  /** Timeout in milliseconds for this tool (defaults to DEFAULT_TOOL_TIMEOUT_MS) */
  timeoutMs?: number;
  /**
   * If this tool is backed by a node executor, this is the node type.
   * Used to fetch the node definition for configuration UI.
   */
  nodeType?: string;
  /**
   * Provider information for grouping and branding in the UI.
   * Populated from the action's provider when the tool is action-based.
   */
  provider?: {
    id: string;
    name: string;
    icon: string;
    /** Raw SVG markup for custom provider branding. Takes precedence over `icon`. */
    svgIcon?: string;
  };
}

/**
 * A configured instance of a tool added to an agent.
 * Multiple instances of the same tool can exist with different configurations.
 *
 * For example, two HTTP Request tools:
 * - "Fetch Weather" with URL preset to weather API
 * - "Post to Slack" with URL preset to Slack webhook
 */
export interface AddedToolInstance {
  /** Unique instance ID */
  instanceId: string;
  /** Reference to the base tool definition ID */
  toolId: string;
  /** Custom name for this instance (shown to AI) */
  name: string;
  /** Custom description for this instance (shown to AI) */
  description: string;
  /**
   * Tool-specific parameter values.
   * Contains both static values and `_aiChosenModes` to indicate which params the AI should fill.
   */
  params: Record<string, unknown> & {
    /**
     * Map of param name to boolean indicating if AI should choose the value.
     * If true (or not present), AI fills the value at runtime.
     * If false, the value from `params[fieldName]` is used as a static value.
     */
    _aiChosenModes?: Record<string, boolean>;
  };
}

/**
 * A tool definition customized for a specific instance.
 * Has filtered inputSchema (only AI-chosen params) and references the instance for static param injection.
 */
export interface ConfiguredToolDefinition extends AgentToolDefinition {
  /** The instance this configured tool is derived from */
  instanceId: string;
  /** Static parameter values to merge with AI-provided input */
  staticParams: Record<string, unknown>;
  /** Original tool ID (before instance customization) */
  baseToolId: string;
}

/**
 * Tool execution context provided to tool handlers
 *
 * Tools are self-contained and should import their own dependencies
 * (e.g., json-logic-js) rather than relying on context functions.
 * The nodeContext provides access to cross-cutting concerns like credentials.
 */
export interface AgentToolExecutionContext {
  logger: Logger;
  /** Current agent iteration number */
  iteration: number;
  /** Maximum allowed iterations */
  maxIterations: number;
  /** Node execution context - provides access to credentials and other cross-cutting concerns */
  nodeContext: NodeExecutionContext /**
   * Static parameters configured on the tool instance.
   * These are set by the user when adding the tool to an agent node,
   * not provided by the AI at runtime.
   * Example: credentialId for OAuth2 tools like Gmail
   */;
  staticParams?: Record<string, unknown>;
}

/**
 * Result from executing a tool
 */
export interface AgentToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Tool executor function type
 */
export type AgentToolExecutor = (
  input: Record<string, unknown>,
  context: AgentToolExecutionContext,
) => Promise<AgentToolResult>;

/**
 * Registered agent tool with definition and executor
 */
export interface RegisteredAgentTool {
  definition: AgentToolDefinition;
  executor: AgentToolExecutor;
}

/**
 * Tool call from an LLM response
 */
export interface AgentToolCall {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
}

/**
 * Record of a tool execution during an agent run
 */
export interface ToolExecutionRecord {
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  iteration: number;
  executionTimeMs: number;
}

/**
 * Message in an agent conversation
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
}

/**
 * Agent stop conditions
 */
export type AgentStopCondition = 'tool_result' | 'explicit_stop' | 'max_iterations';

/**
 * Agent finish reason
 */
export type AgentFinishReason = 'completed' | 'max_iterations' | 'tool_result' | 'error';

/**
 * Result from agent prompt execution
 */
export interface AgentPromptResult {
  type: 'text' | 'tool_use';
  content: string;
  /** Tool calls requested by the LLM */
  toolCalls?: AgentToolCall[];
}

/**
 * Request to run an agent prompt
 */
export interface AgentPromptRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  /** Whether to allow parallel tool calls (defaults to true) */
  parallelToolCalls?: boolean;
}

/**
 * Agent execution output structure
 */
export interface AgentExecutionOutput {
  finalResponse: string;
  toolResults: ToolExecutionRecord[];
  iterations: number;
  finishReason: AgentFinishReason;
  conversationHistory: AgentMessage[];
  /** Token usage statistics */
  tokenUsage?: {
    conversationTokensEstimate: number;
    truncationOccurred: boolean;
  };
}

/**
 * Agent configuration for advanced settings
 */
interface _AgentConfig {
  /** Tool execution timeout in milliseconds (default: 30000) */
  toolTimeoutMs?: number;
  /** Maximum tokens for conversation history before truncation (default: 100000) */
  maxConversationTokens?: number;
  /** Whether to enable parallel tool execution (default: true) */
  enableParallelTools?: boolean;
  /** Maximum number of parallel tool calls per iteration (default: 5) */
  maxParallelToolCalls?: number;
}
