/**
 * Chat Module - Barrel exports
 */

// Types
export type {
  ChatMessage,
  ChatContext,
  ChatToolCall,
  ChatToolResult,
  ChatToolContext,
  ChatToolDefinition,
  ChatStreamEvent,
  ChatUsage,
  ChatConfig,
  ResolvedChatConfig,
} from './chat-types';
export { ChatConfigSchema } from './chat-types';

// System prompt
export { buildSystemPrompt } from './system-prompt';
export type { FlowContextData, BuildSystemPromptInput } from './system-prompt';

// Toolkit
export { ChatToolkit } from './chat-toolkit';

// Session
export { ChatStreamSession } from './chat-stream-session';
export type { ChatStreamSessionDeps } from './chat-stream-session';

// Service
export { ChatStreamService } from './chat-stream.service';
export type { CreateChatStreamOptions } from './chat-stream.service';
