/**
 * Prompt / agent / tool-execution request & result shapes used by
 * `ActionExecutionContext.functions.submitPrompt`, `submitAgentPrompt`, and
 * `recordToolExecution`.
 */

import type { AgentMessage, AgentPromptResult, AgentToolDefinition } from './agent-tool';
import type { BatchProvider, PromptResult } from './ai-types';

type BasePromptRequest = {
  prompt: string;
  model: string;
  provider: BatchProvider;
  credentialId?: string;
  outputJsonSchema?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
};

export interface PromptRequest extends BasePromptRequest {
  useBatchProcessing?: false;
}

export interface BatchRequest extends BasePromptRequest {
  useBatchProcessing: true;
  nodeId: string;
  flowRunId: string;
}

export type SubmitPromptRequest = PromptRequest | BatchRequest;

export interface SubmitAgentPromptRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  provider: BatchProvider;
  credentialId: string;
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  parallelToolCalls?: boolean;
  useBatchProcessing?: boolean;
  nodeId?: string;
  flowRunId?: string;
}

export type SubmitPromptResult =
  | PromptResult
  | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string };

export type SubmitAgentPromptResult =
  | AgentPromptResult
  | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string };

export interface RecordToolExecutionInput {
  nodeExecutionId: string;
  flowRunId: string;
  toolId: string;
  toolName: string;
  iteration: number;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}
