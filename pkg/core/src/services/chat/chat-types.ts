/**
 * Chat Assistant Types
 *
 * Type definitions for the AI chat assistant feature.
 * These types define the streaming protocol, tool interface,
 * and context objects used across the chat system.
 */

import { z } from 'zod/v4';
import type { InvectIdentity } from 'src/types/auth.types';
import type { InvectInstance } from 'src/api/types';

// =====================================
// CHAT MESSAGES
// =====================================

/**
 * A message in the chat conversation.
 * Compatible with both Anthropic and OpenAI message formats
 * after conversion via the existing adapter layer.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Tool calls made by the assistant */
  toolCalls?: ChatToolCall[];
  /** For tool result messages — references which tool call this is a result for */
  toolCallId?: string;
}

/**
 * A tool call from the LLM response
 */
export interface ChatToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// =====================================
// CHAT CONTEXT (sent by frontend)
// =====================================

/**
 * Context sent with each chat request.
 * The backend loads full flow data from the database — only IDs are needed.
 */
export interface ChatContext {
  /** Currently open flow ID (null/undefined if on home page) */
  flowId?: string;
  /** Currently selected node ID */
  selectedNodeId?: string;
  /** Current editor view mode */
  viewMode?: 'edit' | 'runs';
  /** Credential ID to use for the chat model (user override) */
  credentialId?: string;
  /** Per-request override for max tool-calling steps (1–50) */
  maxSteps?: number;
}

// =====================================
// CHAT TOOL INTERFACE
// =====================================

/**
 * Result returned by a chat tool execution
 */
export interface ChatToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorType?: string;
  suggestion?: string;
  /** Optional UI action to trigger on the frontend */
  uiAction?: { action: string; data: Record<string, unknown> };
}

/**
 * Context provided to chat tool execute functions
 */
export interface ChatToolContext {
  /** The Invect core instance for accessing all services */
  invect: InvectInstance;
  /** The requesting user's identity (for RBAC) */
  identity?: InvectIdentity;
  /** Chat context from the frontend */
  chatContext: ChatContext;
}

/**
 * A single chat tool definition.
 * Tools have Zod schemas for parameter validation and an execute function.
 */
export interface ChatToolDefinition {
  /** Unique tool ID (snake_case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description for the LLM to understand when/how to use this tool */
  description: string;
  /** Zod schema for parameter validation */
  parameters: z.ZodType;
  /** Execute the tool */
  execute: (params: unknown, ctx: ChatToolContext) => Promise<ChatToolResult>;
}

// =====================================
// CHAT STREAM EVENTS (yielded by core, serialized to SSE by framework adapters)
// =====================================

/**
 * Events yielded by the ChatStreamSession async generator.
 * Framework adapters (Express, NestJS, Next.js) serialize these to SSE.
 */
export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool_call_result'; toolName: string; toolCallId: string; result: ChatToolResult }
  | { type: 'ui_action'; action: string; data: Record<string, unknown> }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done'; usage?: ChatUsage };

/**
 * Token usage information
 */
export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

// =====================================
// CHAT CONFIG
// =====================================

/**
 * Zod schema for chat configuration in InvectConfig.
 */
export const ChatConfigSchema = z.object({
  /** Credential ID for the default chat model (from credentials table) */
  credentialId: z.string().optional(),
  /** Default model identifier (e.g. "claude-3-5-haiku-20241022", "gpt-4o-mini") */
  defaultModel: z.string().optional(),
  /** Max tool-calling steps per message (default: 15) */
  maxSteps: z.number().min(1).max(50).default(15),
  /** Max message history to send to LLM (default: 20) */
  maxHistoryMessages: z.number().min(1).max(100).default(20),
  /** Whether chat is enabled (default: true) */
  enabled: z.boolean().default(true),
});

export type ChatConfig = z.infer<typeof ChatConfigSchema>;

/**
 * Resolved chat config with all defaults applied, plus runtime-resolved fields.
 */
export interface ResolvedChatConfig {
  credentialId?: string;
  model: string;
  maxSteps: number;
  maxHistoryMessages: number;
  enabled: boolean;
  /** Resolved provider type (determined from credential) */
  provider: 'OPENAI' | 'ANTHROPIC' | 'OPENROUTER';
  /** Decrypted API key (resolved from credential) */
  apiKey: string;
}
