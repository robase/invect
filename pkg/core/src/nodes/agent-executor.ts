/**
 * AI Agent Node Executor
 *
 * Executes an LLM agent loop with tool use capabilities.
 * The agent can use configured tools to accomplish a task.
 *
 * Features:
 * - Parallel tool execution (executes multiple tool calls concurrently)
 * - Tool execution timeout (configurable, prevents hung tools)
 * - Conversation truncation (manages token budget for long conversations)
 * - Error handling with retry via LLM (tool errors returned to LLM for recovery)
 */

import { BaseNodeExecutor, NodeExecutionResult } from './base-node';
import { NodeExecutionStatus } from 'src/types/base';
import { GraphNodeType, NodeExecutionContext } from 'src/types-fresh';
import type { NodeInputData } from 'src/types/node-io-types';
import { FlowNodeForType } from 'src/services/flow-versions/schemas-fresh';
import { NodeDefinition } from '../types/node-definition.types';
import { detectProviderFromCredential } from 'src/utils/provider-detection';
import { BatchProvider } from 'src/services/ai/base-client';
import {
  NodeConfigUpdateContext,
  NodeConfigUpdateEvent,
  NodeConfigUpdateResponse,
} from 'src/types/node-config-update.types';
import {
  AgentToolDefinition,
  AgentMessage,
  AgentToolCall,
  ToolExecutionRecord,
  AgentFinishReason,
  AgentToolExecutionContext,
  AgentExecutionOutput,
  AgentStopCondition,
  AddedToolInstance,
  ConfiguredToolDefinition,
  DEFAULT_TOOL_TIMEOUT_MS,
  DEFAULT_MAX_CONVERSATION_TOKENS,
  APPROX_TOKENS_PER_CHAR,
} from 'src/types/agent-tool.types';
import { AgentToolRegistry } from 'src/services/agent-tools/agent-tool-registry';
import z from 'zod/v4';
import { createOutputSchema } from 'src/types/node-output-schemas';

/**
 * Zod schema for an added tool instance
 */
const addedToolInstanceSchema = z.object({
  instanceId: z.string(),
  toolId: z.string(),
  name: z.string(),
  description: z.string(),
  params: z.record(z.string(), z.unknown()),
});

/**
 * Zod schema for Agent node parameters
 * This provides runtime validation and type inference
 */
export const agentNodeParamsSchema = z.object({
  // Required fields
  credentialId: z.string().min(1, 'Credential is required'),
  model: z.string().min(1, 'Model is required'),
  taskPrompt: z.string().min(1, 'Task prompt is required'),

  // Optional fields with defaults
  systemPrompt: z.string().optional().default(''),
  provider: z.string().optional(),
  // Support both legacy string array and new AddedToolInstance array
  enabledTools: z.array(z.string()).optional().default([]),
  addedTools: z.array(addedToolInstanceSchema).optional().default([]),
  maxIterations: z.number().int().min(1).max(50).optional().default(10),
  stopCondition: z
    .enum(['explicit_stop', 'tool_result', 'max_iterations'])
    .optional()
    .default('explicit_stop'),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  toolTimeoutMs: z.number().positive().optional().default(DEFAULT_TOOL_TIMEOUT_MS),
  maxConversationTokens: z.number().positive().optional().default(DEFAULT_MAX_CONVERSATION_TOKENS),
  enableParallelTools: z.boolean().optional().default(true),
  useBatchProcessing: z.boolean().optional().default(false),
});

/**
 * Inferred type from the schema - use this instead of manual type casting
 */
export type AgentNodeParams = z.infer<typeof agentNodeParamsSchema>;

/**
 * Zod schema for Agent node output
 */
export const agentNodeOutputSchema = createOutputSchema(
  GraphNodeType.AGENT,
  z.object({
    output: z.object({
      value: z.object({
        finalResponse: z.string(),
        toolResults: z.array(
          z.object({
            toolId: z.string(),
            toolName: z.string(),
            input: z.record(z.string(), z.unknown()),
            output: z.unknown().optional(),
            error: z.string().optional(),
            success: z.boolean(),
            iteration: z.number(),
            executionTimeMs: z.number(),
          }),
        ),
        iterations: z.number(),
        finishReason: z.enum(['completed', 'max_iterations', 'tool_result', 'error']),
      }),
      type: z.literal('object'),
    }),
  }),
  z
    .object({
      model: z.string().optional(),
      provider: z.nativeEnum(BatchProvider).optional(),
      toolsUsed: z.array(z.string()).optional(),
      totalIterations: z.number().optional(),
      tokenUsage: z
        .object({
          conversationTokensEstimate: z.number(),
          truncationOccurred: z.boolean(),
        })
        .optional(),
    })
    .optional(),
);

/**
 * AI Agent Node Executor
 * Runs an agent loop that can use tools to accomplish tasks
 */
export class AgentNodeExecutor extends BaseNodeExecutor<
  GraphNodeType.AGENT,
  typeof agentNodeParamsSchema
> {
  private toolRegistry: AgentToolRegistry;

  /**
   * Zod schema for validating agent node parameters
   */
  override readonly paramsSchema = agentNodeParamsSchema;
  readonly outputSchema = agentNodeOutputSchema;

  constructor(toolRegistry?: AgentToolRegistry) {
    super(GraphNodeType.AGENT);
    // Use provided registry or create empty one
    this.toolRegistry = toolRegistry || new AgentToolRegistry();
  }

  /**
   * Set the tool registry (called after initialization)
   */
  setToolRegistry(registry: AgentToolRegistry): void {
    this.toolRegistry = registry;
  }

  getDefinition(): NodeDefinition {
    return {
      type: GraphNodeType.AGENT,
      label: 'AI Agent',
      description: 'LLM agent that can use tools to accomplish tasks',
      category: 'AI',
      icon: 'Bot',
      input: {
        id: 'input',
        label: 'Incoming Data',
        type: 'object',
        description: 'Context data available to the agent',
      },
      outputs: [{ id: 'output', label: 'Agent Output', type: 'object' }],
      paramFields: [
        // Credential Selection
        {
          name: 'credentialId',
          label: 'Credential',
          type: 'credential',
          required: true,
          description: 'API credential for the LLM provider',
          defaultValue: '',
        },
        // Model Selection (dynamic options via handleConfigUpdate)
        {
          name: 'model',
          label: 'Model',
          type: 'select',
          required: true,
          defaultValue: '',
          options: [],
          placeholder: 'Select a model',
          description: 'LLM model to use for the agent',
        },
        // Task Prompt
        {
          name: 'taskPrompt',
          label: 'Task / Goal',
          type: 'textarea',
          required: true,
          defaultValue: '',
          placeholder: 'Describe what the agent should accomplish...',
          description: 'The main task or goal for the agent. Supports Nunjucks templating.',
        },
        // System Prompt
        {
          name: 'systemPrompt',
          label: 'System Prompt',
          type: 'textarea',
          required: false,
          defaultValue: '',
          placeholder: 'Optional: Additional context or behavior instructions...',
          description: "System-level instructions for the agent's behavior.",
        },
        // Tool Selection (would be tool-selector type in frontend)
        {
          name: 'enabledTools',
          label: 'Available Tools',
          type: 'json',
          required: false,
          defaultValue: [],
          description:
            'Array of tool IDs the agent can use. Example: ["jq_query", "http_request", "math_eval"]',
        },
        // Max Iterations
        {
          name: 'maxIterations',
          label: 'Max Iterations',
          type: 'number',
          defaultValue: 10,
          description: 'Maximum number of agent iterations (1-50)',
          extended: true,
        },
        // Stop Condition
        {
          name: 'stopCondition',
          label: 'Stop Condition',
          type: 'select',
          defaultValue: 'explicit_stop',
          options: [
            { label: 'Agent decides to stop', value: 'explicit_stop' },
            { label: 'After first tool result', value: 'tool_result' },
            { label: 'Max iterations only', value: 'max_iterations' },
          ],
          description: 'When the agent should stop executing',
          extended: true,
        },
        // Temperature
        {
          name: 'temperature',
          label: 'Temperature',
          type: 'number',
          defaultValue: 0.7,
          description: 'Controls randomness (0.0 to 2.0)',
          extended: true,
        },
        // Max Tokens
        {
          name: 'maxTokens',
          label: 'Max Tokens',
          type: 'number',
          description: 'Maximum tokens per LLM call',
          extended: true,
        },
        // Tool Timeout
        {
          name: 'toolTimeoutMs',
          label: 'Tool Timeout (ms)',
          type: 'number',
          defaultValue: 30000,
          description: 'Maximum time in milliseconds for each tool execution (default: 30000)',
          extended: true,
        },
        // Max Conversation Tokens
        {
          name: 'maxConversationTokens',
          label: 'Max Conversation Tokens',
          type: 'number',
          defaultValue: 100000,
          description: 'Token budget for conversation history before truncation (default: 100000)',
          extended: true,
        },
        // Enable Parallel Tools
        {
          name: 'enableParallelTools',
          label: 'Enable Parallel Tools',
          type: 'boolean',
          defaultValue: true,
          description: 'Execute multiple tool calls in parallel when the LLM requests them',
          extended: true,
        },
        {
          name: 'useBatchProcessing',
          label: 'Batch Processing',
          type: 'boolean',
          defaultValue: false,
          description:
            "When enabled, the initial prompt is submitted via the provider's batch API for asynchronous processing. The flow will pause until the batch completes.",
          extended: true,
          hidden: true,
        },
      ],
      defaultParams: {
        credentialId: '',
        model: '',
        taskPrompt: '',
        systemPrompt: '',
        enabledTools: [],
        maxIterations: 10,
        stopCondition: 'explicit_stop',
        temperature: 0.7,
        toolTimeoutMs: 30000,
        maxConversationTokens: 100000,
        enableParallelTools: true,
        useBatchProcessing: false,
      },
    };
  }

  async handleConfigUpdate(
    event: NodeConfigUpdateEvent,
    context: NodeConfigUpdateContext,
  ): Promise<NodeConfigUpdateResponse> {
    const params = event.params ?? {};
    const credentialId = typeof params.credentialId === 'string' ? params.credentialId : '';
    const isCredentialChange = event.change?.field === 'credentialId';
    const providerFromParams =
      !isCredentialChange && typeof params.provider === 'string'
        ? (params.provider as BatchProvider)
        : undefined;

    if (!credentialId && !providerFromParams) {
      return {
        definition: this.getDefinition(),
        params,
      };
    }

    try {
      let provider = providerFromParams;

      if (!provider && credentialId) {
        const credential = await context.services.credentials.get(credentialId);
        provider = detectProviderFromCredential(credential) ?? undefined;
      }

      if (!provider) {
        return {
          definition: this.getDefinition(),
          params,
          warnings: ['Unable to detect provider from credential'],
        };
      }

      const { models, defaultModel } =
        await context.services.baseAIClient.listModelsForProvider(provider);

      const definition = this.hydrateModelOptions(this.getDefinition(), provider, models);
      const nextParams: Record<string, unknown> = { ...params, provider };
      const currentModelId = typeof nextParams['model'] === 'string' ? nextParams['model'] : '';

      if (!models.some((model) => model.id === currentModelId)) {
        const fallback = models.find((model) => model.id === defaultModel) ?? models[0];
        nextParams['model'] = fallback ? fallback.id : '';
      }

      return {
        definition,
        params: nextParams,
      };
    } catch (error) {
      context.logger.error('Agent node config update failed', {
        error: error instanceof Error ? error.message : String(error),
        nodeId: event.nodeId,
      });

      return {
        definition: this.getDefinition(),
        params,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private hydrateModelOptions(
    baseDefinition: NodeDefinition,
    provider: BatchProvider,
    models: { id: string; name?: string }[],
  ): NodeDefinition {
    const providerLabel = provider === BatchProvider.OPENAI ? 'OpenAI' : 'Anthropic';
    const supportsBatch = provider === BatchProvider.OPENAI || provider === BatchProvider.ANTHROPIC;
    return {
      ...baseDefinition,
      paramFields: baseDefinition.paramFields.map((field) => {
        if (field.name === 'useBatchProcessing') {
          return { ...field, hidden: !supportsBatch };
        }
        if (field.name !== 'model') {
          return field;
        }

        return {
          ...field,
          options: models.map((model) => ({
            label: model.name ?? model.id,
            value: model.id,
          })),
          placeholder: models.length
            ? `Select a ${providerLabel} model`
            : `No ${providerLabel} models available`,
          disabled: models.length === 0,
        };
      }),
    };
  }

  /**
   * Build configured tool definitions from added tool instances.
   *
   * For each instance:
   * - Look up the base tool definition from the registry
   * - Apply instance customizations (name, description)
   * - Filter inputSchema to only include AI-chosen params
   * - Track static params for injection during execution
   *
   * @returns Array of configured tool definitions and a map of instanceId -> static params
   */
  private buildConfiguredTools(
    addedTools: AddedToolInstance[],
    logger?: { debug: (msg: string, meta?: Record<string, unknown>) => void },
  ): { tools: ConfiguredToolDefinition[]; staticParamsMap: Map<string, Record<string, unknown>> } {
    const tools: ConfiguredToolDefinition[] = [];
    const staticParamsMap = new Map<string, Record<string, unknown>>();

    logger?.debug('Building configured tools from addedTools', {
      addedToolCount: addedTools.length,
      addedToolIds: addedTools.map((t) => ({
        instanceId: t.instanceId,
        toolId: t.toolId,
        name: t.name,
      })),
    });

    for (const instance of addedTools) {
      const registeredTool = this.toolRegistry.get(instance.toolId);
      const baseDef = registeredTool?.definition;
      if (!baseDef) {
        // Skip unknown tools
        logger?.debug('Skipping unknown tool', { toolId: instance.toolId });
        continue;
      }

      const aiChosenModes = (instance.params._aiChosenModes as Record<string, boolean>) ?? {};
      const staticParams: Record<string, unknown> = {};

      // SECURITY: credentialId is NEVER AI-chosen - always extract as static param
      // This ensures credentials are user-configured, not hallucinated by the AI
      if (instance.params.credentialId !== undefined) {
        staticParams.credentialId = instance.params.credentialId;
      }

      logger?.debug('Processing tool instance', {
        instanceId: instance.instanceId,
        toolId: instance.toolId,
        name: instance.name,
        paramKeys: Object.keys(instance.params),
        aiChosenModes,
      });

      // Build filtered input schema - only include params where AI should choose
      const baseSchema = baseDef.inputSchema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };

      let filteredSchema: Record<string, unknown> = { ...baseDef.inputSchema };

      if (baseSchema.properties) {
        const filteredProperties: Record<string, unknown> = {};

        for (const [paramName, paramSchema] of Object.entries(baseSchema.properties)) {
          // SECURITY: Credential params are NEVER AI-chosen
          if (paramName === 'credentialId') {
            // Already handled above - skip including in AI schema
            continue;
          }

          // Default to AI-chosen (true) if not explicitly set
          const isAiChosen = aiChosenModes[paramName] ?? true;

          if (isAiChosen) {
            // AI will provide this value - include in schema
            filteredProperties[paramName] = paramSchema;
          } else {
            // User provided static value - exclude from schema, track for injection
            if (instance.params[paramName] !== undefined) {
              staticParams[paramName] = instance.params[paramName];
            }
          }
        }

        // Filter required array to only include AI-chosen params (exclude credentialId)
        const filteredRequired = baseSchema.required?.filter((name) => {
          if (name === 'credentialId') {
            return false;
          } // Never required from AI
          const isAiChosen = aiChosenModes[name] ?? true;
          return isAiChosen;
        });

        filteredSchema = {
          ...baseSchema,
          properties: filteredProperties,
          required: filteredRequired && filteredRequired.length > 0 ? filteredRequired : undefined,
        };
      }

      logger?.debug('Tool static params extracted', {
        instanceId: instance.instanceId,
        staticParamKeys: Object.keys(staticParams),
        staticParamValues: staticParams,
        hasCredentialId: 'credentialId' in staticParams,
      });

      // Create configured tool definition
      // Use instanceId as the tool ID so we can map back to it during execution
      const configuredTool: ConfiguredToolDefinition = {
        ...baseDef,
        id: instance.instanceId, // Use instance ID so AI tool calls reference this specific instance
        name: instance.name,
        description: instance.description,
        inputSchema: filteredSchema,
        instanceId: instance.instanceId,
        staticParams,
        baseToolId: instance.toolId,
      };

      tools.push(configuredTool);
      staticParamsMap.set(instance.instanceId, staticParams);
    }

    return { tools, staticParamsMap };
  }

  /**
   * Execute the agent loop
   */
  async execute(
    inputs: NodeInputData,
    node: FlowNodeForType<GraphNodeType.AGENT>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    this.logExecutionStart(context);

    try {
      // Parse and validate params using the schema
      const paramsResult = this.parseParams(node.params);
      if (!paramsResult.success) {
        return this.createErrorResult([`Invalid agent node parameters: ${paramsResult.error}`]);
      }

      const params = paramsResult.data;

      // Check if agent prompt function is available
      if (!context.functions.submitAgentPrompt) {
        return this.createErrorResult(['Agent prompt function not available in execution context']);
      }

      // Detect provider from credential if not already set
      let provider = params.provider as BatchProvider | undefined;
      if (!provider) {
        if (!context.functions.getCredential) {
          return this.createErrorResult([
            'Credential lookup function not available in execution context',
          ]);
        }

        const credential = await context.functions.getCredential(params.credentialId);
        if (!credential) {
          return this.createErrorResult(['Selected credential was not found or is inaccessible']);
        }

        provider = detectProviderFromCredential(credential) || undefined;
        if (!provider) {
          return this.createErrorResult(['Unable to detect provider from credential.']);
        }
      }

      // Log what tools are configured on this agent node
      context.logger.debug(`Agent ${context.nodeId} - Tool configuration`, {
        addedToolsCount: params.addedTools?.length ?? 0,
        enabledToolsCount: params.enabledTools?.length ?? 0,
        addedTools: params.addedTools
          ? JSON.stringify(params.addedTools).substring(0, 500)
          : 'undefined',
      });

      // Build configured tools from added tool instances
      // This handles schema filtering for static params and tracks instance -> base tool mapping
      let configuredTools: ConfiguredToolDefinition[] = [];
      let staticParamsMap = new Map<string, Record<string, unknown>>();

      if (params.addedTools && params.addedTools.length > 0) {
        // New format: full tool instances with configuration
        const result = this.buildConfiguredTools(
          params.addedTools as AddedToolInstance[],
          context.logger,
        );
        configuredTools = result.tools;
        staticParamsMap = result.staticParamsMap;
      } else if (params.enabledTools && params.enabledTools.length > 0) {
        // Legacy format: just tool IDs (no static params, use base definitions as-is)
        const baseDefs = this.toolRegistry.getDefinitionsForIds(params.enabledTools);
        configuredTools = baseDefs.map((def) => ({
          ...def,
          instanceId: def.id,
          staticParams: {},
          baseToolId: def.id,
        }));
      }

      context.logger.debug(`Agent ${context.nodeId} - Starting agent loop`, {
        taskPrompt: params.taskPrompt.substring(0, 100),
        model: params.model,
        configuredToolCount: configuredTools.length,
        maxIterations: params.maxIterations,
        stopCondition: params.stopCondition,
      });

      // Run the agent loop
      const agentResult = await this.runAgentLoop(
        {
          taskPrompt: params.taskPrompt,
          systemPrompt: params.systemPrompt || undefined,
          model: params.model,
          maxIterations: params.maxIterations,
          stopCondition: params.stopCondition,
          temperature: params.temperature,
          maxTokens: params.maxTokens,
          credentialId: params.credentialId,
          useBatchProcessing: params.useBatchProcessing,
        },
        configuredTools,
        staticParamsMap,
        provider,
        context,
        {
          toolTimeoutMs: params.toolTimeoutMs,
          maxConversationTokens: params.maxConversationTokens,
          enableParallelTools: params.enableParallelTools,
        },
      );

      // If the agent loop returned a pending batch result, propagate it directly
      if ('state' in agentResult && agentResult.state === NodeExecutionStatus.PENDING) {
        return agentResult as NodeExecutionResult;
      }

      const agentOutput = agentResult as AgentExecutionOutput;

      // Build success result
      const executionResult = this.createSuccessResult(
        {
          nodeType: GraphNodeType.AGENT,
          data: {
            variables: {
              output: {
                value: agentOutput,
                type: 'object' as const,
              },
            },
            metadata: {
              model: params.model,
              provider,
              toolsUsed: agentOutput.toolResults.map((r) => r.toolId),
              totalIterations: agentOutput.iterations,
              tokenUsage: agentOutput.tokenUsage,
            },
          },
        },
        {
          model: params.model,
          provider,
          iterations: agentOutput.iterations,
          finishReason: agentOutput.finishReason,
          toolsUsed: agentOutput.toolResults.map((r) => r.toolId),
          executedAt: new Date().toISOString(),
          tokenUsage: agentOutput.tokenUsage,
        },
      );

      this.logExecutionComplete(context, executionResult);
      return executionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`Agent ${context.nodeId} - Execution failed:`, {
        error: errorMessage,
      });

      return this.createErrorResult([`Agent execution failed: ${errorMessage}`]);
    }
  }

  /**
   * Run the agent loop with support for:
   * - Parallel tool execution
   * - Tool execution timeouts
   * - Conversation truncation for token management
   * - Static parameter injection for configured tools
   */
  private async runAgentLoop(
    params: {
      taskPrompt: string;
      systemPrompt?: string;
      model: string;
      maxIterations?: number;
      stopCondition?: string;
      temperature?: number;
      maxTokens?: number;
      credentialId: string;
      useBatchProcessing?: boolean;
    },
    tools: ConfiguredToolDefinition[],
    staticParamsMap: Map<string, Record<string, unknown>>,
    provider: BatchProvider,
    context: NodeExecutionContext,
    config: {
      toolTimeoutMs: number;
      maxConversationTokens: number;
      enableParallelTools: boolean;
    },
  ): Promise<AgentExecutionOutput | NodeExecutionResult> {
    const maxIterations = params.maxIterations ?? 10;
    const stopCondition = (params.stopCondition ?? 'explicit_stop') as AgentStopCondition;

    // Build system prompt with tool descriptions
    const systemPromptWithTools = this.buildSystemPromptWithTools(params.systemPrompt, tools);

    // Initialize conversation
    const messages: AgentMessage[] = [{ role: 'user', content: params.taskPrompt }];

    const toolResults: ToolExecutionRecord[] = [];
    let iteration = 0;
    let agentFinished = false;
    let finishReason: AgentFinishReason = 'max_iterations';
    let finalResponse = '';
    let truncationOccurred = false;

    while (!agentFinished && iteration < maxIterations) {
      iteration++;

      // Check and truncate conversation if needed
      const truncationResult = this.truncateConversationIfNeeded(
        messages,
        config.maxConversationTokens,
        context,
      );
      if (truncationResult.truncated) {
        truncationOccurred = true;
      }

      context.logger.debug(`Agent ${context.nodeId} - Iteration ${iteration}`, {
        messageCount: messages.length,
        toolResultCount: toolResults.length,
        estimatedTokens: truncationResult.estimatedTokens,
      });

      // Call LLM with tools (we've already verified submitAgentPrompt exists)
      // Batch processing is only used on the first iteration — subsequent
      // iterations (after tool results) always run direct so the agent can
      // continue its tool-calling loop without pausing.
      const useBatch = iteration === 1 && params.useBatchProcessing === true;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- verified during init
      const response = await context.functions.submitAgentPrompt!({
        model: params.model,
        messages,
        tools,
        systemPrompt: systemPromptWithTools,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        provider,
        credentialId: params.credentialId,
        parallelToolCalls: config.enableParallelTools,
        ...(useBatch
          ? {
              useBatchProcessing: true,
              nodeId: context.nodeId,
              flowRunId: context.flowRunId,
            }
          : {}),
      });

      // Handle batch submission — the flow will pause and resume later
      if ('type' in response && response.type === 'batch_submitted') {
        const batchResult = response as { batchJobId: string; nodeId: string; flowRunId: string };
        return {
          state: NodeExecutionStatus.PENDING,
          type: 'batch_submitted' as const,
          batchJobId: batchResult.batchJobId,
          nodeId: batchResult.nodeId,
          executionId: batchResult.flowRunId,
        };
      }

      // Get all tool calls
      const allToolCalls = response.toolCalls ?? [];

      context.logger.debug(`Agent ${context.nodeId} - LLM response`, {
        type: response.type,
        toolCallCount: allToolCalls.length,
        contentLength: response.content?.length ?? 0,
      });

      if (response.type === 'tool_use' && allToolCalls.length > 0) {
        // Execute tools - parallel or sequential based on config
        const iterationToolResults =
          config.enableParallelTools && allToolCalls.length > 1
            ? await this.executeToolsInParallel(
                allToolCalls,
                tools,
                staticParamsMap,
                context,
                iteration,
                maxIterations,
                config.toolTimeoutMs,
              )
            : await this.executeToolsSequentially(
                allToolCalls,
                tools,
                staticParamsMap,
                context,
                iteration,
                maxIterations,
                config.toolTimeoutMs,
              );

        toolResults.push(...iterationToolResults);

        // Add assistant message with all tool calls
        messages.push({
          role: 'assistant',
          content: response.content || '',
          toolCalls: allToolCalls,
        });

        // Add tool result messages for each tool call
        for (let i = 0; i < allToolCalls.length; i++) {
          const toolCall = allToolCalls[i];
          const toolRecord = iterationToolResults[i];

          messages.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: toolRecord.success
              ? JSON.stringify(toolRecord.output)
              : `Error: ${toolRecord.error}`,
          });
        }

        // Check stop condition
        if (stopCondition === 'tool_result') {
          agentFinished = true;
          finishReason = 'tool_result';
          const lastResult = iterationToolResults[iterationToolResults.length - 1];
          finalResponse = lastResult.success
            ? JSON.stringify(lastResult.output)
            : `Tool execution failed: ${lastResult.error}`;
        }
      } else {
        // Agent provided final answer (text response)
        agentFinished = true;
        finishReason = 'completed';
        finalResponse = response.content || '';

        messages.push({
          role: 'assistant',
          content: finalResponse,
        });
      }
    }

    // If we hit max iterations without completing
    if (!agentFinished) {
      finishReason = 'max_iterations';
      finalResponse =
        messages[messages.length - 1]?.content ||
        'Agent reached maximum iterations without completing.';
    }

    // Calculate final token estimate
    const finalTokenEstimate = this.estimateConversationTokens(messages);

    return {
      finalResponse,
      toolResults,
      iterations: iteration,
      finishReason,
      conversationHistory: messages,
      tokenUsage: {
        conversationTokensEstimate: finalTokenEstimate,
        truncationOccurred,
      },
    };
  }

  /**
   * Execute multiple tools in parallel with timeout
   */
  private async executeToolsInParallel(
    toolCalls: AgentToolCall[],
    configuredTools: ConfiguredToolDefinition[],
    staticParamsMap: Map<string, Record<string, unknown>>,
    context: NodeExecutionContext,
    iteration: number,
    maxIterations: number,
    timeoutMs: number,
  ): Promise<ToolExecutionRecord[]> {
    context.logger.debug(
      `Agent ${context.nodeId} - Executing ${toolCalls.length} tools in parallel`,
    );

    const promises = toolCalls.map((toolCall) =>
      this.executeToolWithTimeout(
        toolCall,
        configuredTools,
        staticParamsMap,
        context,
        iteration,
        maxIterations,
        timeoutMs,
      ),
    );

    return Promise.all(promises);
  }

  /**
   * Execute multiple tools sequentially with timeout
   */
  private async executeToolsSequentially(
    toolCalls: AgentToolCall[],
    configuredTools: ConfiguredToolDefinition[],
    staticParamsMap: Map<string, Record<string, unknown>>,
    context: NodeExecutionContext,
    iteration: number,
    maxIterations: number,
    timeoutMs: number,
  ): Promise<ToolExecutionRecord[]> {
    const results: ToolExecutionRecord[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeToolWithTimeout(
        toolCall,
        configuredTools,
        staticParamsMap,
        context,
        iteration,
        maxIterations,
        timeoutMs,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single tool with timeout
   */
  private async executeToolWithTimeout(
    toolCall: AgentToolCall,
    configuredTools: ConfiguredToolDefinition[],
    staticParamsMap: Map<string, Record<string, unknown>>,
    context: NodeExecutionContext,
    iteration: number,
    maxIterations: number,
    timeoutMs: number,
  ): Promise<ToolExecutionRecord> {
    const startTime = Date.now();

    // Create a timeout promise
    const timeoutPromise = new Promise<ToolExecutionRecord>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race between tool execution and timeout
    try {
      const result = await Promise.race([
        this.executeTool(
          toolCall,
          configuredTools,
          staticParamsMap,
          context,
          iteration,
          maxIterations,
        ),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('timed out');

      context.logger.warn(`Agent ${context.nodeId} - Tool ${isTimeout ? 'timed out' : 'failed'}`, {
        toolId: toolCall.toolId,
        error: errorMessage,
        timeoutMs,
      });

      // Find the configured tool to get a nicer name
      const configuredTool = configuredTools.find((t) => t.id === toolCall.toolId);
      const registeredTool = configuredTool
        ? this.toolRegistry.get(configuredTool.baseToolId)
        : this.toolRegistry.get(toolCall.toolId);

      return {
        toolId: toolCall.toolId,
        toolName: configuredTool?.name ?? registeredTool?.definition.name ?? toolCall.toolId,
        input: toolCall.input,
        error: errorMessage,
        success: false,
        iteration,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Estimate the number of tokens in the conversation
   */
  private estimateConversationTokens(messages: AgentMessage[]): number {
    let totalChars = 0;

    for (const message of messages) {
      totalChars += (message.content ?? '').length;
      if (message.toolCalls) {
        totalChars += JSON.stringify(message.toolCalls).length;
      }
    }

    return Math.ceil(totalChars * APPROX_TOKENS_PER_CHAR);
  }

  /**
   * Truncate conversation history if it exceeds the token budget
   * Preserves the first message (task prompt) and recent messages
   */
  private truncateConversationIfNeeded(
    messages: AgentMessage[],
    maxTokens: number,
    context: NodeExecutionContext,
  ): { truncated: boolean; estimatedTokens: number } {
    const estimatedTokens = this.estimateConversationTokens(messages);

    if (estimatedTokens <= maxTokens || messages.length <= 2) {
      return { truncated: false, estimatedTokens };
    }

    context.logger.info(`Agent ${context.nodeId} - Truncating conversation`, {
      currentTokens: estimatedTokens,
      maxTokens,
      messageCount: messages.length,
    });

    // Keep the first message (task prompt) and progressively remove old messages
    // until we're under the token budget
    const firstMessage = messages[0];
    const remainingMessages = messages.slice(1);

    // Remove messages from the beginning (oldest) until under budget
    while (remainingMessages.length > 1) {
      const testMessages = [firstMessage, ...remainingMessages];
      const testTokens = this.estimateConversationTokens(testMessages);

      if (testTokens <= maxTokens * 0.9) {
        // Leave 10% buffer
        break;
      }

      // Remove the oldest message (after the first one)
      // If it's an assistant message with tool calls, also remove the corresponding tool result
      const removedMessage = remainingMessages.shift();

      // If we removed an assistant message with tool calls, remove the tool result messages too
      if (removedMessage?.toolCalls && removedMessage.toolCalls.length > 0) {
        const toolCallIds = new Set(removedMessage.toolCalls.map((tc) => tc.id));
        // Remove any tool result messages that correspond to the removed tool calls
        while (
          remainingMessages.length > 0 &&
          remainingMessages[0].role === 'tool' &&
          remainingMessages[0].toolCallId &&
          toolCallIds.has(remainingMessages[0].toolCallId)
        ) {
          remainingMessages.shift();
        }
      }
    }

    // Add a summary message to indicate truncation
    const truncationNotice: AgentMessage = {
      role: 'user',
      content:
        '[Note: Earlier conversation history has been truncated to stay within token limits. The conversation continues from here.]',
    };

    // Reconstruct messages array
    messages.length = 0;
    messages.push(firstMessage, truncationNotice, ...remainingMessages);

    const newEstimatedTokens = this.estimateConversationTokens(messages);
    context.logger.info(`Agent ${context.nodeId} - Conversation truncated`, {
      newTokens: newEstimatedTokens,
      newMessageCount: messages.length,
    });

    return { truncated: true, estimatedTokens: newEstimatedTokens };
  }

  /**
   * Build system prompt with tool descriptions
   */
  private buildSystemPromptWithTools(
    baseSystemPrompt: string | undefined,
    tools: AgentToolDefinition[],
  ): string {
    let systemPrompt = baseSystemPrompt || '';

    if (tools.length > 0) {
      const toolDescriptions = tools
        .map((tool) => `- ${tool.name} (${tool.id}): ${tool.description}`)
        .join('\n');

      const toolInstructions = `
You have access to the following tools:

${toolDescriptions}

To use a tool, respond with a tool call in the appropriate format for your API.
Only use tools when necessary to accomplish the task.
When you have completed the task or have a final answer, respond with text only (no tool call).
`;

      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${toolInstructions}` : toolInstructions;
    }

    return systemPrompt;
  }

  /**
   * Execute a tool call
   *
   * The toolCall.toolId may be an instanceId (for configured tools) or a base tool ID (legacy).
   * We look up the configured tool to:
   * 1. Find the base tool ID for the actual executor
   * 2. Merge static params with the AI-provided input
   * 3. Record the tool execution to the database
   */
  private async executeTool(
    toolCall: AgentToolCall,
    configuredTools: ConfiguredToolDefinition[],
    staticParamsMap: Map<string, Record<string, unknown>>,
    context: NodeExecutionContext,
    iteration: number,
    maxIterations: number,
  ): Promise<ToolExecutionRecord> {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    // Find the configured tool (toolCall.toolId is the instanceId)
    const configuredTool = configuredTools.find((t) => t.id === toolCall.toolId);

    // Get the base tool ID - either from configured tool or use the toolId directly (legacy)
    const baseToolId = configuredTool?.baseToolId ?? toolCall.toolId;

    const registeredTool = this.toolRegistry.get(baseToolId);
    if (!registeredTool) {
      const result: ToolExecutionRecord = {
        toolId: toolCall.toolId,
        toolName: configuredTool?.name ?? toolCall.toolId,
        input: toolCall.input,
        error: `Tool '${baseToolId}' not found in registry`,
        success: false,
        iteration,
        executionTimeMs: Date.now() - startTime,
      };

      // Record failed tool execution to database
      await this.recordToolExecutionToDb(context, result, startedAt);

      return result;
    }

    // Merge static params with AI-provided input
    // Static params take precedence (user-configured values override any AI attempts)
    const staticParams = staticParamsMap.get(toolCall.toolId) ?? {};
    const mergedInput = { ...toolCall.input, ...staticParams };

    // Tools are self-contained - they import their own dependencies
    // The nodeContext provides access to cross-cutting concerns like credentials
    const toolContext: AgentToolExecutionContext = {
      logger: context.logger,
      iteration,
      maxIterations,
      nodeContext: context,
      staticParams, // Pass static params so tools can access configured values like credentialId
    };

    try {
      context.logger.debug(`Agent ${context.nodeId} - Executing tool`, {
        toolId: toolCall.toolId,
        baseToolId,
        hasStaticParams: Object.keys(staticParams).length > 0,
        staticParamKeys: Object.keys(staticParams),
        credentialIdInStaticParams: staticParams.credentialId ?? 'NOT SET',
        input: JSON.stringify(mergedInput).substring(0, 200),
      });

      const executorResult = await registeredTool.executor(mergedInput, toolContext);

      const result: ToolExecutionRecord = {
        toolId: toolCall.toolId,
        toolName: configuredTool?.name ?? registeredTool.definition.name,
        input: mergedInput,
        output: executorResult.output,
        error: executorResult.error,
        success: executorResult.success,
        iteration,
        executionTimeMs: Date.now() - startTime,
      };

      // Record successful tool execution to database
      await this.recordToolExecutionToDb(context, result, startedAt);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      context.logger.error(`Agent ${context.nodeId} - Tool execution failed`, {
        toolId: toolCall.toolId,
        baseToolId,
        error: errorMessage,
      });

      const result: ToolExecutionRecord = {
        toolId: toolCall.toolId,
        toolName: configuredTool?.name ?? registeredTool.definition.name,
        input: mergedInput,
        error: errorMessage,
        success: false,
        iteration,
        executionTimeMs: Date.now() - startTime,
      };

      // Record failed tool execution to database
      await this.recordToolExecutionToDb(context, result, startedAt);

      return result;
    }
  }

  /**
   * Record a tool execution to the database via the context function.
   * This is a best-effort operation - failures are logged but don't affect the agent loop.
   */
  private async recordToolExecutionToDb(
    context: NodeExecutionContext,
    result: ToolExecutionRecord,
    startedAt: string,
  ): Promise<void> {
    const { recordToolExecution } = context.functions;

    if (!recordToolExecution) {
      context.logger.debug('recordToolExecution not available, skipping database recording');
      return;
    }

    // traceId is the nodeExecutionId
    const nodeExecutionId = context.traceId;
    if (!nodeExecutionId) {
      context.logger.warn('traceId (nodeExecutionId) not available, skipping database recording');
      return;
    }

    try {
      await recordToolExecution({
        nodeExecutionId,
        flowRunId: context.flowRunId,
        toolId: result.toolId,
        toolName: result.toolName,
        iteration: result.iteration,
        input: result.input,
        output: result.output,
        error: result.error,
        success: result.success,
        startedAt,
        completedAt: new Date().toISOString(),
        duration: result.executionTimeMs,
      });

      context.logger.debug('Tool execution recorded to database', {
        toolId: result.toolId,
        iteration: result.iteration,
        success: result.success,
      });
    } catch (error) {
      // Best-effort - don't fail the agent loop if recording fails
      context.logger.warn('Failed to record tool execution to database', {
        toolId: result.toolId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
