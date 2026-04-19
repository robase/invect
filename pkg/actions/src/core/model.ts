/**
 * core.model — AI Model action
 *
 * Sends a prompt to an LLM (OpenAI / Anthropic) via the `submitPrompt`
 * context function. Supports batch processing.
 */

import {
  defineAction,
  BatchProvider,
  type Model,
  type SubmitPromptRequest,
  type ActionConfigUpdateEvent,
  type ActionConfigUpdateContext,
  type ActionConfigUpdateResponse,
  type LoadOptionsContext,
  type LoadOptionsResult,
  type NodeDefinition,
} from '@invect/action-kit';
import { actionToNodeDefinition } from '../registry';
import { CORE_PROVIDER } from '../providers';
import { z } from 'zod/v4';
import { detectProviderFromCredential } from './provider-detection';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Credential is required'),
  model: z.string().min(1, 'Model is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  systemPrompt: z.string().optional().default(''),
  provider: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().positive().optional(),
  outputJsonSchema: z.string().optional(),
  useBatchProcessing: z.boolean().optional().default(false),
});

export const modelAction = defineAction({
  id: 'core.model',
  name: 'AI Model',
  description:
    'Send a prompt to an LLM (OpenAI, Anthropic, or OpenRouter) and return the generated text. Supports system prompts, temperature control, structured JSON output via an output schema, and async batch processing. The prompt field supports {{ expression }} templates to inject upstream data.',
  provider: CORE_PROVIDER,
  excludeFromTools: true,
  icon: 'Sparkles',
  tags: [
    'ai',
    'llm',
    'model',
    'gpt',
    'claude',
    'openai',
    'anthropic',
    'prompt',
    'generate',
    'text',
    'chat',
    'completion',
  ],

  credential: {
    required: true,
    type: 'llm',
    description: 'API credential for OpenAI or Anthropic',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Credential',
        type: 'text',
        required: true,
        description: 'API credential used to detect the provider and authenticate requests',
        aiProvided: false,
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        required: true,
        placeholder: 'Select a credential first',
        description: "Models are loaded automatically based on the credential's provider",
        aiProvided: false,
        loadOptions: {
          dependsOn: ['credentialId'],
          handler: loadModelOptions,
        },
      },
      {
        name: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        required: true,
        placeholder: 'Enter the prompt for the model...',
        description: 'The main prompt to send to the model. Supports {{ expression }} templating.',
      },
      {
        name: 'systemPrompt',
        label: 'System Prompt',
        type: 'textarea',
        description: "Optional system prompt to set the model's behavior and context.",
      },
      {
        name: 'temperature',
        label: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        description: 'Controls randomness (0.0 to 2.0). Lower = more deterministic.',
        extended: true,
      },
      {
        name: 'maxTokens',
        label: 'Max Tokens',
        type: 'number',
        description: 'Maximum number of tokens to generate',
        extended: true,
      },
      {
        name: 'outputJsonSchema',
        label: 'Output JSON Schema',
        type: 'code',
        description:
          'Optional JSON Schema that constrains the model output. The model will use tool calling / structured output to return data matching this schema.',
        placeholder: '{"type": "object", "properties": { ... }}',
        extended: true,
      },
      {
        name: 'useBatchProcessing',
        label: 'Batch Processing',
        type: 'boolean',
        defaultValue: false,
        description:
          "When enabled, the prompt is submitted via the provider's batch API for asynchronous processing. The flow will pause until the batch completes.",
        extended: true,
        hidden: true,
      },
    ],
  },

  async onConfigUpdate(
    event: ActionConfigUpdateEvent,
    context: ActionConfigUpdateContext,
  ): Promise<ActionConfigUpdateResponse> {
    const params = event.params ?? {};
    const credentialId = typeof params.credentialId === 'string' ? params.credentialId : '';

    const getDefinition = (): NodeDefinition => actionToNodeDefinition(modelAction);

    if (!credentialId) {
      return { definition: getDefinition(), params };
    }

    try {
      const credential = await context.services.credentials.get(credentialId);
      const provider = detectProviderFromCredential(credential) ?? undefined;

      if (!provider) {
        return {
          definition: getDefinition(),
          params,
          warnings: ['Unable to detect provider from credential'],
        };
      }

      const definition = getDefinition();

      // Show batch processing toggle only for providers that support it
      const supportsBatch =
        provider === BatchProvider.OPENAI || provider === BatchProvider.ANTHROPIC;
      definition.paramFields = definition.paramFields.map((field) =>
        field.name === 'useBatchProcessing' ? { ...field, hidden: !supportsBatch } : field,
      );

      return {
        definition,
        params: { ...params, provider },
      };
    } catch (error) {
      return {
        definition: getDefinition(),
        params,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  },

  async execute(params, context) {
    const submitPrompt = context.functions?.submitPrompt;
    if (!submitPrompt) {
      return {
        success: false,
        error: 'Model prompt submission function not available in execution context',
      };
    }

    // Detect provider from credential if not already set
    let provider: BatchProvider | undefined = params.provider as BatchProvider | undefined;

    if (!provider) {
      const getCredential = context.functions?.getCredential;
      if (!getCredential) {
        return { success: false, error: 'Credential lookup function not available' };
      }

      const credential = await getCredential(params.credentialId);
      if (!credential) {
        return { success: false, error: 'Selected credential was not found or is inaccessible' };
      }

      provider = detectProviderFromCredential(credential) ?? undefined;
      if (!provider) {
        return {
          success: false,
          error:
            'Unable to detect provider from credential. Ensure the credential includes an API URL or provider metadata.',
        };
      }
    }

    const useBatchProcessing = params.useBatchProcessing === true;

    const baseRequest = {
      systemPrompt: params.systemPrompt,
      prompt: params.prompt,
      model: params.model,
      maxTokens: params.maxTokens,
      provider,
      temperature: params.temperature,
      credentialId: params.credentialId,
      outputJsonSchema: params.outputJsonSchema || undefined,
    };

    const submitRequest: SubmitPromptRequest = useBatchProcessing
      ? {
          ...baseRequest,
          useBatchProcessing: true as const,
          nodeId: context.flowContext?.nodeId ?? '',
          flowRunId: context.flowContext?.flowRunId ?? '',
        }
      : baseRequest;

    context.logger.debug('Submitting AI request', { model: params.model, provider });

    try {
      const aiResult = await submitPrompt(submitRequest);

      if (aiResult.type === 'batch_submitted') {
        // The action executor will need to translate this into PENDING status.
        // Return a special metadata flag so the executor can detect it.
        return {
          success: true,
          output: undefined,
          metadata: {
            __batchSubmitted: true,
            batchJobId: aiResult.batchJobId,
            nodeId: aiResult.nodeId,
            flowRunId: aiResult.flowRunId,
          },
        };
      }

      const textOutput =
        aiResult.type === 'string' ? aiResult.value : JSON.stringify(aiResult.value);

      return {
        success: true,
        output: textOutput,
        metadata: {
          model: params.model,
          provider,
          promptLength: params.prompt.length,
          executedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Model execution failed: ${msg}` };
    }
  },
});

// ── loadOptions handler for the "model" field ─────────────────────────

/**
 * Fetches the model list from the AI provider using the credential's own
 * API key. Called by the generic `loadOptions` system when `credentialId`
 * changes.
 */
async function loadModelOptions(
  deps: Record<string, unknown>,
  ctx: LoadOptionsContext,
): Promise<LoadOptionsResult> {
  const credentialId = typeof deps.credentialId === 'string' ? deps.credentialId : '';
  if (!credentialId) {
    return { options: [], placeholder: 'Select a credential first' };
  }

  const credential = await ctx.services.credentials.getDecrypted(credentialId);
  if (!credential) {
    return { options: [], placeholder: 'Credential not found' };
  }

  const provider = detectProviderFromCredential(credential);
  if (!provider) {
    return { options: [], placeholder: 'Unable to detect provider from credential' };
  }

  const apiKey = (credential.config?.apiKey as string) ?? '';
  if (!apiKey) {
    return { options: [], placeholder: 'Credential has no API key' };
  }

  const aiClient = ctx.services.baseAIClient;
  if (!aiClient) {
    return { options: [], placeholder: 'AI client not configured in this host' };
  }

  if (!aiClient.hasAdapter(provider)) {
    aiClient.registerAdapter(provider, apiKey);
  }

  const result = (await aiClient.listModelsForProvider(provider)) as
    | { models: Model[]; defaultModel: string }
    | undefined;

  const models = result?.models ?? [];
  const defaultModelId = result?.defaultModel ?? '';

  if (models.length === 0) {
    return { options: [], placeholder: 'No models available', disabled: true };
  }

  const providerLabel =
    provider === BatchProvider.OPENAI
      ? 'OpenAI'
      : provider === BatchProvider.ANTHROPIC
        ? 'Anthropic'
        : provider === BatchProvider.OPENROUTER
          ? 'OpenRouter'
          : 'AI';

  return {
    options: models.map((m) => ({ label: m.name ?? m.id, value: m.id })),
    defaultValue: defaultModelId,
    placeholder: `Select a ${providerLabel} model`,
  };
}
