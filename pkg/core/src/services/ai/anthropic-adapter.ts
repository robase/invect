/**
 * Anthropic Provider Adapter
 *
 * Handles Anthropic-specific message formats, tool schemas, and API calls.
 * Uses streaming by default to avoid timeout warnings.
 */

import Anthropic from '@anthropic-ai/sdk';
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
  BatchStatus,
  BatchSubmissionResult,
  BatchResult,
  Model,
  PromptResult,
} from './ai-types';
import { BaseProviderAdapter, ProviderCapabilities } from './provider-adapter';

/**
 * Anthropic Provider Adapter
 */
export class AnthropicAdapter extends BaseProviderAdapter {
  get providerId(): string {
    return 'ANTHROPIC';
  }

  get defaultModel(): string {
    return this.defaultModelOverride || 'claude-sonnet-4-6';
  }

  get capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsParallelToolCalls: true,
      supportsStructuredOutput: false, // Anthropic uses tool-based structured output
      supportsBatch: true,
      supportsJsonMode: false,
    };
  }

  private client: Anthropic;

  constructor(logger: Logger, apiKey: string, defaultModelOverride?: string) {
    super(logger, apiKey, defaultModelOverride);
    this.validateApiKey();

    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  /**
   * Convert AgentToolDefinition[] to Anthropic tool format
   */
  convertTools(tools: AgentToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Convert AgentMessage[] to Anthropic message format
   */
  convertMessages(messages: AgentMessage[], _systemPrompt?: string): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant message with tool calls
          const content: (Anthropic.TextBlock | Anthropic.ToolUseBlock)[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content } as Anthropic.TextBlock);
          }
          for (const toolCall of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.toolId,
              input: toolCall.input,
            } as Anthropic.ToolUseBlock);
          }
          result.push({ role: 'assistant', content });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        // Tool result message - Anthropic expects this as a user message with tool_result content
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        });
      }
    }

    return result;
  }

  /**
   * Build tool_choice parameter for Anthropic
   */
  buildToolChoice(
    choice: 'auto' | 'none' | { type: 'tool'; name: string } | undefined,
    hasTools: boolean,
  ): Anthropic.ToolChoice | undefined {
    if (!hasTools) {
      return undefined;
    }

    if (choice === 'none') {
      // Anthropic doesn't have a "none" option - just don't include tools
      return undefined;
    } else if (choice && typeof choice === 'object') {
      return { type: 'tool', name: choice.name };
    }
    return { type: 'auto' };
  }

  /**
   * Execute agent prompt with tools (streaming)
   */
  async executeAgentPrompt(request: AgentPromptRequest): Promise<AgentPromptResult> {
    this.logger.debug('Running Anthropic agent prompt with tools', {
      model: request.model,
      toolCount: request.tools.length,
      messageCount: request.messages.length,
    });

    try {
      const anthropicMessages = this.convertMessages(request.messages);
      const tools = this.convertTools(request.tools);

      const params: Anthropic.MessageCreateParams = {
        model: request.model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
        system: request.systemPrompt,
        messages: anthropicMessages,
        tools: tools.length > 0 ? tools : undefined,
      };

      // Set tool_choice
      if (tools.length > 0) {
        const toolChoice = this.buildToolChoice(request.toolChoice, true);
        if (toolChoice) {
          params.tool_choice = toolChoice;
        }
      }

      // Use streaming for agent prompts
      const stream = await this.client.messages.create({
        ...params,
        stream: true,
      });

      return await this.parseStreamingResponse(stream);
    } catch (error) {
      this.logger.error('Anthropic agent prompt failed:', error);
      throw this.wrapError(error, 'agent prompt');
    }
  }

  /**
   * Parse streaming response into AgentPromptResult
   */
  private async parseStreamingResponse(
    stream: AsyncIterable<Anthropic.MessageStreamEvent>,
  ): Promise<AgentPromptResult> {
    let fullContent = '';
    let currentToolUse: { id: string; name: string; input: string } | null = null;
    const toolCalls: AgentToolCall[] = [];

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start') {
        if (chunk.content_block.type === 'tool_use') {
          currentToolUse = {
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            input: '',
          };
        }
      } else if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          fullContent += chunk.delta.text;
        } else if (chunk.delta.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.input += chunk.delta.partial_json;
        }
      } else if (chunk.type === 'content_block_stop' && currentToolUse) {
        // Finalize tool call
        try {
          const parsedInput = JSON.parse(currentToolUse.input || '{}');
          toolCalls.push({
            id: currentToolUse.id,
            toolId: currentToolUse.name,
            input: parsedInput,
          });
        } catch (error) {
          this.logger.warn('Failed to parse tool input', { error, input: currentToolUse.input });
          toolCalls.push({
            id: currentToolUse.id,
            toolId: currentToolUse.name,
            input: {},
          });
        }
        currentToolUse = null;
      }
    }

    if (toolCalls.length > 0) {
      return this.createToolUseResponse(fullContent, toolCalls);
    }

    return this.createTextResponse(fullContent);
  }

  /**
   * Execute a simple prompt (streaming)
   */
  async executePrompt(request: PromptRequest): Promise<PromptResult> {
    const messageRequest = this.buildPromptRequest(request);

    this.logger.debug(`Submitting prompt to Anthropic`);

    try {
      const stream = await this.client.messages.create({
        ...messageRequest,
        stream: true,
      });

      let fullContent = '';
      let toolUse: string | null = null;

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta') {
          if (chunk.delta.type === 'text_delta') {
            fullContent += chunk.delta.text;
          } else if (chunk.delta.type === 'input_json_delta') {
            toolUse = toolUse || '';
            toolUse += chunk.delta.partial_json;
          }
        } else if (
          chunk.type === 'content_block_start' &&
          chunk.content_block.type === 'tool_use'
        ) {
          toolUse = '';
        }
      }

      if (toolUse) {
        try {
          return { value: JSON.parse(toolUse) as object, type: 'object' };
        } catch (error) {
          this.logger.warn(`Failed to parse streamed tool output: ${error}`);
          return { value: toolUse, type: 'string' };
        }
      }

      return { value: fullContent, type: 'string' };
    } catch (error) {
      this.logger.error('Anthropic API call failed:', error);
      throw this.wrapError(error, 'prompt execution');
    }
  }

  /**
   * Build request params for prompt execution
   */
  private buildPromptRequest(
    request: PromptRequest | BatchRequest,
  ): Anthropic.MessageCreateParamsNonStreaming {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ? request.maxTokens / 2 : 4000,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.prompt }],
    };

    if (request.outputJsonSchema) {
      try {
        const parsedSchema = JSON.parse(request.outputJsonSchema);
        params.tools = [
          {
            name: 'structured_output',
            description: 'Output data in the specified JSON format',
            input_schema: parsedSchema,
          },
        ];
        params.tool_choice = { type: 'tool', name: 'structured_output' };
      } catch (error) {
        this.logger.warn(`Invalid JSON schema, proceeding without tools: ${error}`);
      }
    }

    return params;
  }

  /**
   * Submit batch to Anthropic Batch API
   */
  async submitBatch(batchJobId: string, requestData: BatchRequest): Promise<BatchSubmissionResult> {
    const messageRequest = this.buildPromptRequest(requestData);

    try {
      const result = await this.client.messages.batches.create({
        requests: [
          {
            custom_id: batchJobId,
            params: messageRequest,
          },
        ],
      });

      return { externalBatchId: result.id };
    } catch (error) {
      this.logger.error('Anthropic batch submission failed:', error);
      throw this.wrapError(error, 'batch submission');
    }
  }

  /**
   * Poll Anthropic batch status
   */
  async pollBatch(externalBatchId: string): Promise<BatchPollResult> {
    try {
      const batchStatus = await this.client.messages.batches.retrieve(externalBatchId);

      this.logger.debug(`Anthropic batch ${externalBatchId} status:`, {
        processing_status: batchStatus.processing_status,
        request_counts: batchStatus.request_counts,
      });

      switch (batchStatus.processing_status) {
        case 'ended': {
          const results = await this.downloadResults(externalBatchId);
          return { status: BatchStatus.COMPLETED, result: results };
        }
        case 'canceling':
          return { status: BatchStatus.FAILED, error: 'Batch is being canceled' };
        case 'in_progress': {
          const createdAt = new Date(batchStatus.created_at);
          const now = new Date();
          const processingTimeHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

          if (processingTimeHours > 20) {
            return {
              status: BatchStatus.FAILED,
              error: `Batch processing timeout: ${processingTimeHours.toFixed(1)} hours`,
            };
          }

          return { status: BatchStatus.PROCESSING };
        }
        default:
          if (
            batchStatus.processing_status &&
            !['in_progress', 'ended'].includes(batchStatus.processing_status)
          ) {
            return {
              status: BatchStatus.FAILED,
              error: `Batch in unexpected status: ${batchStatus.processing_status}`,
            };
          }
          return { status: BatchStatus.PROCESSING };
      }
    } catch (error) {
      this.logger.error('Failed to poll Anthropic batch status:', error);
      throw this.wrapError(error, 'batch polling');
    }
  }

  /**
   * Download batch results
   */
  private async downloadResults(batchId: string): Promise<BatchResult[]> {
    try {
      const batchResults: BatchResult[] = [];

      for await (const batchResult of await this.client.messages.batches.results(batchId)) {
        const resultBatchId = batchResult.custom_id;

        let result: BatchResult;
        switch (batchResult.result.type) {
          case 'succeeded':
            result = {
              batchId: resultBatchId,
              status: BatchStatus.COMPLETED,
              content: this.handleMessageResponse(batchResult.result.message),
            };
            break;
          case 'errored':
            result = {
              batchId: resultBatchId,
              status: BatchStatus.FAILED,
              error: batchResult.result.error.error.message,
            };
            break;
          case 'canceled':
            result = {
              batchId: resultBatchId,
              status: BatchStatus.CANCELLED,
              error: 'Batch was canceled',
            };
            break;
          case 'expired':
            result = { batchId: resultBatchId, status: BatchStatus.FAILED, error: 'Batch expired' };
            break;
          default:
            result = {
              batchId: resultBatchId,
              status: BatchStatus.FAILED,
              error: `Unknown batch result type: ${batchResult.result}`,
            };
            break;
        }

        batchResults.push(result);
      }

      return batchResults;
    } catch (error) {
      this.logger.error('Failed to download Anthropic batch results:', error);
      throw this.wrapError(error, 'batch results download');
    }
  }

  /**
   * Handle non-streaming message response
   */
  private handleMessageResponse(message: Anthropic.Message): PromptResult {
    const content = message.content[0];

    if (!content) {
      throw new Error('No content returned from Anthropic API');
    }

    if (content.type === 'text') {
      return { value: content.text, type: 'string' };
    }

    if (content.type === 'tool_use') {
      try {
        return { value: JSON.parse(JSON.stringify(content.input)) as object, type: 'object' };
      } catch (error) {
        this.logger.warn(`Failed to parse tool output: ${error}`);
        return { value: String(content.input), type: 'string' };
      }
    }

    throw new Error(`Unexpected content type: ${content.type}`);
  }

  /**
   * List available models
   */
  async listModels(): Promise<Model[]> {
    try {
      const anthropicModels = await this.client.models.list();

      return anthropicModels.data.map((model) => ({
        id: model.id,
        name: model.display_name || model.id,
        provider: 'anthropic' as const,
        supportsStructuredOutput: false,
      }));
    } catch (error) {
      this.logger.error('Failed to fetch Anthropic models:', error);
      throw this.wrapError(error, 'model listing');
    }
  }

  /**
   * Anthropic uses tool-based structured output, not native
   */
  modelSupportsStructuredOutput(_modelId: string): boolean {
    return false;
  }

  /**
   * Anthropic doesn't support JSON mode
   */
  modelSupportsJsonMode(_modelId: string): boolean {
    return false;
  }
}
