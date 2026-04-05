/**
 * OpenAI Provider Adapter
 *
 * Handles OpenAI-specific message formats, tool schemas, and API calls.
 * Also serves as the base for OpenAI-compatible providers (e.g., OpenRouter).
 */

import OpenAI from 'openai';
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
 * OpenAI Provider Adapter
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  // Use getters to allow override in subclasses
  get providerId(): string {
    return 'OPENAI';
  }

  get defaultModel(): string {
    return this.defaultModelOverride || 'gpt-4o-mini';
  }

  get capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsParallelToolCalls: true,
      supportsStructuredOutput: true,
      supportsBatch: true,
      supportsJsonMode: true,
    };
  }

  // Protected so OpenRouterAdapter can override it
  protected client: OpenAI;

  constructor(logger: Logger, apiKey: string, defaultModelOverride?: string, baseURL?: string) {
    super(logger, apiKey, defaultModelOverride);
    this.validateApiKey();

    this.client = new OpenAI({
      apiKey: this.apiKey,
      ...(baseURL && { baseURL }),
    });
  }

  /**
   * Convert AgentToolDefinition[] to OpenAI tool format
   */
  convertTools(tools: AgentToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Convert AgentMessage[] to OpenAI message format
   */
  convertMessages(
    messages: AgentMessage[],
    systemPrompt?: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant message with tool calls
          const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] =
            msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.toolId,
                arguments: JSON.stringify(tc.input),
              },
            }));

          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: toolCalls,
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        // Tool result message
        result.push({
          role: 'tool',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- tool messages always have toolCallId
          tool_call_id: msg.toolCallId!,
          content: msg.content,
        });
      }
    }

    return result;
  }

  /**
   * Build tool_choice parameter for OpenAI
   */
  buildToolChoice(
    choice: 'auto' | 'none' | { type: 'tool'; name: string } | undefined,
    hasTools: boolean,
  ): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined {
    if (!hasTools) {
      return undefined;
    }

    if (choice === 'none') {
      return 'none';
    } else if (choice && typeof choice === 'object') {
      return {
        type: 'function',
        function: { name: choice.name },
      };
    }
    return 'auto';
  }

  /**
   * Execute agent prompt with tools
   */
  async executeAgentPrompt(request: AgentPromptRequest): Promise<AgentPromptResult> {
    this.logger.debug('Running OpenAI agent prompt with tools', {
      model: request.model,
      toolCount: request.tools.length,
      messageCount: request.messages.length,
    });

    try {
      const messages = this.convertMessages(request.messages, request.systemPrompt);
      const tools = this.convertTools(request.tools);
      const toolChoice = this.buildToolChoice(request.toolChoice, tools.length > 0);

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: request.model,
        messages,
        temperature: request.temperature,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: toolChoice,
        parallel_tool_calls: request.parallelToolCalls !== false,
      };

      if (request.maxTokens) {
        params.max_completion_tokens = request.maxTokens;
      }

      const response = await this.client.chat.completions.create(params);

      return this.parseAgentResponse(response);
    } catch (error) {
      this.logger.error('OpenAI agent prompt failed:', error);
      throw this.wrapError(error, 'agent prompt');
    }
  }

  /**
   * Parse OpenAI response into normalized AgentPromptResult
   */
  protected parseAgentResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): AgentPromptResult {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response from OpenAI API');
    }

    const message = choice.message;

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: AgentToolCall[] = message.tool_calls.map((tc) => {
        let parsedInput: Record<string, unknown> = {};

        // Handle different tool call types - standard function calls have tc.function
        const funcCall = tc as {
          id: string;
          type: string;
          function?: { name: string; arguments: string };
        };
        if (funcCall.function) {
          try {
            parsedInput = JSON.parse(funcCall.function.arguments || '{}');
          } catch {
            this.logger.warn('Failed to parse tool arguments', {
              arguments: funcCall.function.arguments,
            });
          }

          return {
            id: tc.id,
            toolId: funcCall.function.name,
            input: parsedInput,
          };
        }

        // Fallback for unknown tool call types
        return {
          id: tc.id,
          toolId: 'unknown',
          input: parsedInput,
        };
      });

      return this.createToolUseResponse(message.content || '', toolCalls);
    }

    // Text response
    return this.createTextResponse(message.content || '');
  }

  /**
   * Execute a simple prompt (non-agent)
   */
  async executePrompt(request: PromptRequest): Promise<PromptResult> {
    const model = request.model || this.getEffectiveDefaultModel();
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'user', content: request.prompt },
    ];

    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature: 0,
    };

    // Add structured output format if schema is provided and model supports it
    if (request.outputJsonSchema && this.modelSupportsStructuredOutput(model)) {
      try {
        const parsedSchema = JSON.parse(request.outputJsonSchema);

        if (parsedSchema.type === 'object' && parsedSchema.additionalProperties === undefined) {
          parsedSchema.additionalProperties = false;
        }

        requestOptions.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: parsedSchema,
          },
        };
      } catch (error) {
        this.logger.warn(`Invalid JSON schema, proceeding without schema: ${error}`);
      }
    } else if (request.outputJsonSchema && this.modelSupportsJsonMode(model)) {
      requestOptions.response_format = { type: 'json_object' };
      messages.unshift({
        role: 'system',
        content: `Please respond with valid JSON that matches this schema: ${request.outputJsonSchema}`,
      });
    } else if (request.outputJsonSchema) {
      messages.unshift({
        role: 'system',
        content: `Please respond with valid JSON that matches this schema: ${request.outputJsonSchema}`,
      });
    }

    if (request.maxTokens !== undefined) {
      requestOptions.max_completion_tokens = request.maxTokens;
    }

    try {
      const response = await this.client.chat.completions.create(requestOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from OpenAI API');
      }

      if (request.outputJsonSchema) {
        try {
          return { value: JSON.parse(content), type: 'object' };
        } catch {
          return { value: content, type: 'string' };
        }
      }
      return { value: content, type: 'string' };
    } catch (error) {
      this.logger.error('OpenAI API call failed:', error);
      throw this.wrapError(error, 'prompt execution');
    }
  }

  /**
   * Submit batch to OpenAI Batch API
   */
  async submitBatch(batchJobId: string, requestData: BatchRequest): Promise<BatchSubmissionResult> {
    this.logger.info(`Submitting batch ${batchJobId}`);

    const batchRequestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: requestData.model,
      messages: [{ role: 'user', content: requestData.prompt }],
      max_tokens: requestData.maxTokens,
    };

    if (requestData.temperature !== undefined) {
      batchRequestBody.temperature = requestData.temperature;
    }

    // Handle response format
    if (requestData.outputJsonSchema) {
      this.addResponseFormat(batchRequestBody, requestData.outputJsonSchema, requestData.model);
    }

    const batchRequest = {
      custom_id: batchJobId,
      method: 'POST' as const,
      url: '/v1/chat/completions' as const,
      body: batchRequestBody,
    };

    const jsonlContent = JSON.stringify(batchRequest);

    try {
      const file = await OpenAI.toFile(Buffer.from(jsonlContent), 'batch_requests.jsonl', {
        type: 'application/jsonl',
      });

      const uploadResponse = await this.client.files.create({
        file,
        purpose: 'batch',
      });

      const batch = await this.client.batches.create({
        input_file_id: uploadResponse.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });

      return { externalBatchId: batch.id };
    } catch (error) {
      this.logger.error(`Failed to submit batch ${batchJobId}:`, error);
      throw this.wrapError(error, 'batch submission');
    }
  }

  /**
   * Add response format to batch request
   */
  private addResponseFormat(
    requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    outputJsonSchema: string,
    model: string,
  ): void {
    try {
      const parsedSchema = JSON.parse(outputJsonSchema);

      if (this.modelSupportsStructuredOutput(model)) {
        if (parsedSchema.type === 'object' && parsedSchema.additionalProperties === undefined) {
          parsedSchema.additionalProperties = false;
        }

        requestBody.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: parsedSchema,
          },
        };
      } else if (this.modelSupportsJsonMode(model)) {
        requestBody.response_format = { type: 'json_object' };
        const systemMessage = `Please respond with valid JSON that matches this schema: ${outputJsonSchema}`;
        if (requestBody.messages[0]?.role === 'system') {
          requestBody.messages[0].content = `${systemMessage}\n\n${requestBody.messages[0].content}`;
        } else {
          requestBody.messages.unshift({ role: 'system', content: systemMessage });
        }
      } else {
        const systemMessage = `Please respond with valid JSON that matches this schema: ${outputJsonSchema}`;
        if (requestBody.messages[0]?.role === 'system') {
          requestBody.messages[0].content = `${systemMessage}\n\n${requestBody.messages[0].content}`;
        } else {
          requestBody.messages.unshift({ role: 'system', content: systemMessage });
        }
      }
    } catch (error) {
      this.logger.warn(`Invalid JSON schema for batch, proceeding without: ${error}`);
    }
  }

  /**
   * Poll OpenAI batch status
   */
  async pollBatch(externalBatchId: string): Promise<BatchPollResult> {
    try {
      const batch = await this.client.batches.retrieve(externalBatchId);

      switch (batch.status) {
        case 'completed': {
          if (
            batch.request_counts?.failed &&
            batch.request_counts.failed > 0 &&
            batch.error_file_id
          ) {
            const errorMessage = await this.logBatchErrors(batch.error_file_id, externalBatchId);
            if (batch.request_counts.completed === 0) {
              return { status: BatchStatus.FAILED, error: errorMessage };
            }
          }

          if (!batch.output_file_id) {
            return { status: BatchStatus.PROCESSING };
          }

          const results = await this.downloadResults(batch);
          return { status: BatchStatus.COMPLETED, result: results };
        }
        case 'failed':
        case 'expired':
        case 'cancelled':
          return { status: BatchStatus.FAILED, error: `Batch ${batch.status}` };
        default:
          return { status: BatchStatus.PROCESSING };
      }
    } catch (error) {
      throw this.wrapError(error, 'batch polling');
    }
  }

  /**
   * Log batch errors
   */
  private async logBatchErrors(errorFileId: string, batchId: string): Promise<string> {
    try {
      const errorFileContent = await this.client.files.content(errorFileId);
      const errorsText = await errorFileContent.text();

      const errors = errorsText
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch {
            this.logger.error(`Failed to parse error line ${index + 1}: ${line}`);
            return null;
          }
        })
        .filter(Boolean);

      this.logger.error(`Batch ${batchId} errors:`, JSON.stringify(errors, null, 2));

      if (errors.length > 0 && errors[0].error) {
        return `Request failed: ${JSON.stringify(errors[0].error)}`;
      }

      return 'No error details found in error file';
    } catch (error) {
      return `Failed to retrieve error file: ${(error as Error).message}`;
    }
  }

  /**
   * Download batch results
   */
  private async downloadResults(batch: OpenAI.Batches.Batch): Promise<BatchResult[]> {
    if (!batch.output_file_id) {
      throw new Error('Batch output file ID not available');
    }

    try {
      const fileContent = await this.client.files.content(batch.output_file_id);
      const resultsText = await fileContent.text();

      const jsonlLines = resultsText
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      const batchResults: BatchResult[] = [];

      for (const line of jsonlLines) {
        try {
          const result = JSON.parse(line);
          const batchId = result.custom_id;

          if (result.error) {
            batchResults.push({
              batchId,
              status: BatchStatus.FAILED,
              error: typeof result.error === 'string' ? result.error : JSON.stringify(result.error),
            });
          } else if (result.response?.body?.choices?.[0]?.message?.content) {
            const content = result.response.body.choices[0].message.content;
            let promptResult: PromptResult;
            try {
              promptResult = { value: JSON.parse(content), type: 'object' };
            } catch {
              promptResult = { value: content, type: 'string' };
            }
            batchResults.push({ batchId, status: BatchStatus.COMPLETED, content: promptResult });
          } else {
            batchResults.push({
              batchId,
              status: BatchStatus.FAILED,
              error: 'Unexpected response format: no content found',
            });
          }
        } catch (parseError) {
          batchResults.push({
            batchId: 'unknown',
            status: BatchStatus.FAILED,
            error: `Failed to parse result: ${(parseError as Error).message}`,
          });
        }
      }

      return batchResults;
    } catch (error) {
      throw this.wrapError(error, 'batch results download');
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<Model[]> {
    try {
      const openAIModels = await this.client.models.list();

      return openAIModels.data
        .filter(
          (model) =>
            model.id.includes('gpt') &&
            [
              'image',
              'audio',
              'transcribe',
              'search',
              'instruct',
              'realtime',
              '3.5',
              '2024',
              '2025',
              'tts',
            ].every((term) => !model.id.includes(term)) &&
            !model.id.match(/gpt-4-\d{4}-preview/) &&
            !model.id.match(/-\d{4}$/),
        )
        .map((model) => ({
          id: model.id,
          name: model.id,
          provider: 'openai' as const,
          supportsStructuredOutput: this.modelSupportsStructuredOutput(model.id),
        }));
    } catch (error) {
      this.logger.error('Failed to fetch OpenAI models:', error);
      throw this.wrapError(error, 'model listing');
    }
  }

  /**
   * Check if model supports structured output
   */
  modelSupportsStructuredOutput(modelId: string): boolean {
    const supportedModels = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4o-2024-08-06',
      'gpt-4o-mini-2024-07-18',
    ];
    return supportedModels.some((supported) => modelId.includes(supported));
  }

  /**
   * Check if model supports JSON mode
   */
  modelSupportsJsonMode(modelId: string): boolean {
    const supportedModels = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4o'];
    return supportedModels.some((supported) => modelId.includes(supported));
  }
}
