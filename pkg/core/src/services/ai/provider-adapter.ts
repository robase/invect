/**
 * Provider Adapter Interface
 *
 * Defines the contract for AI provider adapters that handle provider-specific
 * transformations while allowing shared logic to live in BaseAIClient.
 *
 * This abstraction enables easy addition of new providers (e.g., OpenRouter)
 * by implementing just the adapter interface.
 */

import { Logger } from 'src/schemas';
import {
  AgentToolDefinition,
  AgentMessage,
  AgentPromptResult,
  AgentToolCall,
} from 'src/types/agent-tool.types';
import { BatchRequest, PromptRequest } from '../node-data.service';
import {
  AgentPromptRequest,
  BatchPollResult,
  BatchSubmissionResult,
  Model,
  PromptResult,
} from './base-client';

/**
 * Provider capabilities - what features each provider supports
 */
export interface ProviderCapabilities {
  /** Supports streaming responses */
  supportsStreaming: boolean;
  /** Supports parallel tool calls in a single response */
  supportsParallelToolCalls: boolean;
  /** Supports structured output (JSON schema) */
  supportsStructuredOutput: boolean;
  /** Supports batch API */
  supportsBatch: boolean;
  /** Supports JSON mode (weaker than structured output) */
  supportsJsonMode: boolean;
}

/**
 * Configuration for creating an adapter
 */
interface _ProviderAdapterConfig {
  apiKey: string;
  defaultModel?: string;
  baseURL?: string;
  logger: Logger;
}

/**
 * Normalized tool format for conversion
 */
interface _NormalizedTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Provider Adapter Interface
 *
 * Each AI provider implements this interface to handle provider-specific
 * message formats, tool schemas, and API calls.
 */
export interface ProviderAdapter {
  /** Provider identifier (e.g., "OPENAI", "ANTHROPIC", "OPENROUTER") */
  readonly providerId: string;

  /** Default model for this provider */
  readonly defaultModel: string;

  /** API key for authentication */
  readonly apiKey: string;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /**
   * Convert AgentToolDefinition[] to provider-specific format
   */
  convertTools(tools: AgentToolDefinition[]): unknown[];

  /**
   * Convert AgentMessage[] to provider-specific message format
   */
  convertMessages(messages: AgentMessage[], systemPrompt?: string): unknown[];

  /**
   * Build tool_choice parameter in provider-specific format
   */
  buildToolChoice(
    choice: 'auto' | 'none' | { type: 'tool'; name: string } | undefined,
    hasTools: boolean,
  ): unknown;

  /**
   * Execute agent prompt and return normalized result
   */
  executeAgentPrompt(request: AgentPromptRequest): Promise<AgentPromptResult>;

  /**
   * Execute a simple prompt (non-agent)
   */
  executePrompt(request: PromptRequest): Promise<PromptResult>;

  /**
   * Submit a batch request
   */
  submitBatch(batchJobId: string, requestData: BatchRequest): Promise<BatchSubmissionResult>;

  /**
   * Poll batch status
   */
  pollBatch(externalBatchId: string): Promise<BatchPollResult>;

  /**
   * List available models
   */
  listModels(): Promise<Model[]>;

  /**
   * Check if a specific model supports structured output
   */
  modelSupportsStructuredOutput(modelId: string): boolean;

  /**
   * Check if a specific model supports JSON mode
   */
  modelSupportsJsonMode(modelId: string): boolean;
}

/**
 * Base adapter class with shared utility methods
 */
export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract readonly providerId: string;
  abstract readonly defaultModel: string;
  abstract readonly capabilities: ProviderCapabilities;

  constructor(
    protected readonly logger: Logger,
    readonly apiKey: string,
    protected readonly defaultModelOverride?: string,
  ) {
    // Note: apiKey validation is done in subclass constructors
    // after providerId is available
  }

  /**
   * Validate API key - call from subclass constructor
   */
  protected validateApiKey(): void {
    if (!this.apiKey) {
      throw new Error(`API key required for ${this.providerId} provider`);
    }
  }

  abstract convertTools(tools: AgentToolDefinition[]): unknown[];
  abstract convertMessages(messages: AgentMessage[], systemPrompt?: string): unknown[];
  abstract buildToolChoice(
    choice: 'auto' | 'none' | { type: 'tool'; name: string } | undefined,
    hasTools: boolean,
  ): unknown;
  abstract executeAgentPrompt(request: AgentPromptRequest): Promise<AgentPromptResult>;
  abstract executePrompt(request: PromptRequest): Promise<PromptResult>;
  abstract submitBatch(
    batchJobId: string,
    requestData: BatchRequest,
  ): Promise<BatchSubmissionResult>;
  abstract pollBatch(externalBatchId: string): Promise<BatchPollResult>;
  abstract listModels(): Promise<Model[]>;
  abstract modelSupportsStructuredOutput(modelId: string): boolean;
  abstract modelSupportsJsonMode(modelId: string): boolean;

  /**
   * Get the effective default model (override or provider default)
   */
  protected getEffectiveDefaultModel(): string {
    return this.defaultModelOverride || this.defaultModel;
  }

  /**
   * Parse tool calls from response into normalized format
   */
  protected normalizeToolCalls(
    rawToolCalls: Array<{
      id: string;
      name?: string;
      toolId?: string;
      input?: unknown;
      arguments?: string;
    }>,
  ): AgentToolCall[] {
    return rawToolCalls.map((tc) => {
      let parsedInput: Record<string, unknown> = {};

      if (tc.input && typeof tc.input === 'object') {
        parsedInput = tc.input as Record<string, unknown>;
      } else if (tc.arguments) {
        try {
          parsedInput = JSON.parse(tc.arguments);
        } catch {
          this.logger.warn('Failed to parse tool arguments', { arguments: tc.arguments });
        }
      }

      return {
        id: tc.id,
        toolId: tc.name || tc.toolId || '',
        input: parsedInput,
      };
    });
  }

  /**
   * Create a text-only response
   */
  protected createTextResponse(content: string): AgentPromptResult {
    return {
      type: 'text',
      content,
    };
  }

  /**
   * Create a tool use response
   */
  protected createToolUseResponse(content: string, toolCalls: AgentToolCall[]): AgentPromptResult {
    return {
      type: 'tool_use',
      content,
      toolCalls,
    };
  }
}
