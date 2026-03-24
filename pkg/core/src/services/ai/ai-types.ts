/**
 * AI Service Types
 *
 * Shared types for AI provider adapters and the base client.
 * Kept separate to avoid circular dependencies between base-client and adapters.
 */

import type { AgentToolDefinition, AgentMessage } from 'src/types/agent-tool.types';

/**
 * Providers that support batch processing
 * Note: OpenRouter does NOT support batch - use AIProvider for general operations
 */
export enum BatchProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  OPENROUTER = 'OPENROUTER',
}

/**
 * All AI providers (including those without batch support)
 */
export enum AIProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  OPENROUTER = 'OPENROUTER',
}

/**
 * Status of a batch job
 */
export enum BatchStatus {
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Model information from a provider
 */
export interface Model {
  id: string;
  name?: string;
  created?: number;
  provider?: string;
  contextLength?: number;
  supportsImages?: boolean;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
}

/**
 * Result from a synchronous prompt request
 */
export type PromptResult =
  | {
      value: object;
      type: 'object';
    }
  | {
      value: string;
      type: 'string';
    };

/**
 * Request for agent prompt with tool support
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
 * Result from submitting a batch
 */
export interface BatchSubmissionResult {
  externalBatchId: string;
}

/**
 * Individual batch result item
 */
export type BatchResult =
  | {
      batchId: string;
      status: BatchStatus.COMPLETED;
      content: PromptResult;
    }
  | {
      batchId: string;
      status: BatchStatus.FAILED | BatchStatus.CANCELLED;
      error: string;
    }
  | {
      batchId: string;
      status: BatchStatus.SUBMITTED | BatchStatus.PROCESSING;
    };

/**
 * Result from polling a batch
 */
export interface BatchPollResult {
  status: BatchStatus;
  result?: BatchResult[];
  completedRequests?: number;
  totalRequests?: number;
  failedRequests?: number;
  error?: string;
}
