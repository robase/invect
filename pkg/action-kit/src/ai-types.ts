/**
 * AI service types shared between action-kit, core, and runtime hosts.
 */

import type { AgentMessage, AgentToolDefinition } from './agent-tool';

export enum BatchProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  OPENROUTER = 'OPENROUTER',
}

export enum AIProvider {
  OPENAI = 'OPENAI',
  ANTHROPIC = 'ANTHROPIC',
  OPENROUTER = 'OPENROUTER',
}

export enum BatchStatus {
  SUBMITTED = 'SUBMITTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

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

export type PromptResult = { value: object; type: 'object' } | { value: string; type: 'string' };

/** Agent prompt request shared between action-kit and core. */
export interface AgentPromptRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  parallelToolCalls?: boolean;
}

export interface BatchSubmissionResult {
  externalBatchId: string;
}

export type BatchResult =
  | { batchId: string; status: BatchStatus.COMPLETED; content: PromptResult }
  | { batchId: string; status: BatchStatus.FAILED | BatchStatus.CANCELLED; error: string }
  | { batchId: string; status: BatchStatus.SUBMITTED | BatchStatus.PROCESSING };

export interface BatchPollResult {
  status: BatchStatus;
  result?: BatchResult[];
  completedRequests?: number;
  totalRequests?: number;
  failedRequests?: number;
  error?: string;
}
