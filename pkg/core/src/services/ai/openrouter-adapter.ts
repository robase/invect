/**
 * OpenRouter Provider Adapter
 *
 * OpenRouter provides access to multiple AI models through a unified OpenAI-compatible API.
 * This adapter extends the OpenAI adapter since OpenRouter uses the same API format.
 *
 * Key differences from OpenAI:
 * - Does NOT support batch processing
 * - Has its own model listing endpoint
 * - Supports additional headers (HTTP-Referer, X-Title)
 * - Can route to multiple underlying providers
 */

import OpenAI from 'openai';
import { Logger } from 'src/types/schemas';
import { Model, BatchPollResult, BatchSubmissionResult } from './ai-types';
import { BatchRequest } from '../node-data.service';
import { OpenAIAdapter } from './openai-adapter';
import { ProviderCapabilities } from './provider-adapter';

/**
 * OpenRouter model info from their API
 */
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
  architecture?: {
    modality: string;
    tokenizer: string;
    instruct_type?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
  };
}

/**
 * OpenRouter Provider Adapter
 *
 * Extends OpenAI adapter since OpenRouter uses an OpenAI-compatible API.
 * Overrides specific methods for OpenRouter-specific behavior.
 */
export class OpenRouterAdapter extends OpenAIAdapter {
  private readonly _defaultModel: string;
  private readonly appName: string;
  private readonly siteUrl: string;

  // Override getters from parent class
  override get providerId(): string {
    return 'OPENROUTER';
  }

  override get defaultModel(): string {
    return this._defaultModel;
  }

  override get capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsParallelToolCalls: true,
      supportsStructuredOutput: true,
      supportsBatch: false, // OpenRouter does NOT support batch
      supportsJsonMode: true,
    };
  }

  constructor(
    logger: Logger,
    apiKey: string,
    defaultModelOverride?: string,
    options?: {
      appName?: string;
      siteUrl?: string;
    },
  ) {
    // Initialize with OpenRouter's base URL
    super(logger, apiKey, defaultModelOverride, 'https://openrouter.ai/api/v1');

    this._defaultModel = defaultModelOverride || 'openai/gpt-4o-mini';
    this.appName = options?.appName || 'Invect';
    this.siteUrl = options?.siteUrl || 'https://invect.dev';

    // Recreate client with OpenRouter-specific headers
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': this.siteUrl,
        'X-Title': this.appName,
      },
    });
  }

  /**
   * OpenRouter does NOT support batch processing
   */
  override async submitBatch(
    _batchJobId: string,
    _requestData: BatchRequest,
  ): Promise<BatchSubmissionResult> {
    throw new Error('OpenRouter does not support batch processing. Use direct API calls instead.');
  }

  /**
   * OpenRouter does NOT support batch processing
   */
  override async pollBatch(_externalBatchId: string): Promise<BatchPollResult> {
    throw new Error('OpenRouter does not support batch processing.');
  }

  /**
   * List available models from OpenRouter
   * OpenRouter has its own model listing endpoint
   */
  override async listModels(): Promise<Model[]> {
    try {
      // OpenRouter has a dedicated models endpoint
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl || 'https://invect.dev',
          'X-Title': this.appName || 'Invect',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
      }

      const data = (await response.json()) as { data: OpenRouterModel[] };

      // Filter to chat models and map to our format
      const models: Model[] = data.data
        .filter((model) => {
          // Filter out embedding and other non-chat models
          const modality = model.architecture?.modality;
          return modality === 'text->text' || modality === 'text+image->text';
        })
        .map((model) => ({
          id: model.id,
          name: model.name || model.id,
          provider: 'openrouter' as const,
          supportsStructuredOutput: this.modelSupportsStructuredOutput(model.id),
        }));

      return models;
    } catch (error) {
      this.logger.error('Failed to fetch OpenRouter models:', error);
      throw this.wrapError(error, 'model listing');
    }
  }

  /**
   * Check if a model supports structured output
   * For OpenRouter, this depends on the underlying model
   */
  override modelSupportsStructuredOutput(modelId: string): boolean {
    // Models known to support structured output
    const supportedPrefixes = [
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'anthropic/claude-3',
      'google/gemini',
      'meta-llama/llama-3',
    ];
    return supportedPrefixes.some((prefix) =>
      modelId.toLowerCase().startsWith(prefix.toLowerCase()),
    );
  }

  /**
   * Check if a model supports JSON mode
   */
  override modelSupportsJsonMode(modelId: string): boolean {
    // Most modern models support JSON mode through OpenRouter
    const supportedPrefixes = [
      'openai/',
      'anthropic/',
      'google/',
      'meta-llama/llama-3',
      'mistralai/',
    ];
    return supportedPrefixes.some((prefix) =>
      modelId.toLowerCase().startsWith(prefix.toLowerCase()),
    );
  }
}
