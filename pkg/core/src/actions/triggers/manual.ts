/**
 * trigger.manual — Manual Trigger action
 *
 * The primary entry-point node for flows.  Every flow should have exactly
 * one Manual Trigger.  It is invoked when the flow is started from the UI
 * "Run" button, the REST API, or programmatically via `startFlowRun()`.
 *
 * Optionally accepts **input definitions** — a JSON array of expected input
 * fields with names and default values.  When input definitions are provided
 * the node validates that each expected variable exists in `flowInputs` and
 * falls back to the configured default.  When no definitions are provided the
 * node simply passes through all `flowInputs` unchanged.
 *
 * Downstream nodes can reference values via
 * `{{ manual_trigger.variableName }}`.
 */

import { defineAction } from '../define-action';
import { TRIGGERS_PROVIDER } from '../providers';
import { z } from 'zod/v4';

/**
 * Schema for a single expected input field.
 */
const inputFieldSchema = z.object({
  /** Variable name — must match the key callers pass in `flowInputs`. */
  name: z.string().min(1),
  /** Optional default value used when the caller omits this variable. */
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const paramsSchema = z.object({
  /**
   * Optional list of expected input fields.
   * When provided the node extracts only these variables (applying defaults),
   * giving downstream nodes a predictable, documented shape.
   * When omitted ALL flowInputs are passed through.
   */
  inputDefinitions: z.array(inputFieldSchema).optional(),
});

export const manualTriggerAction = defineAction({
  id: 'trigger.manual',
  name: 'Manual Trigger',
  description:
    'Start this flow manually from the UI or via the API. ' +
    'Optionally define expected input fields with default values.',
  provider: TRIGGERS_PROVIDER,
  noInput: true,
  maxInstances: 1,
  tags: [
    'trigger',
    'manual',
    'start',
    'run',
    'execute',
    'begin',
    'launch',
    'input',
    'variable',
    'parameter',
    'entry',
  ],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'inputDefinitions',
        label: 'Input Fields',
        type: 'json',
        description:
          'Optional list of expected inputs. ' +
          'Each entry should have a "name" and an optional "defaultValue". ' +
          'When defined, only these variables are extracted from the flow inputs.',
        placeholder: '[{ "name": "topic", "defaultValue": "hello world" }, { "name": "count" }]',
      },
    ],
  },

  async execute(params, context) {
    // Strip internal trigger keys before processing
    const flowInputs = { ...(context.flowInputs ?? {}) };
    delete flowInputs.__triggerData;
    delete flowInputs.__triggerNodeId;

    const { inputDefinitions } = params;

    context.logger.debug('Manual trigger fired', {
      inputKeys: Object.keys(flowInputs),
      hasInputDefinitions: !!inputDefinitions?.length,
    });

    // When no input definitions are configured, pass everything through.
    if (!inputDefinitions || inputDefinitions.length === 0) {
      return {
        success: true,
        output: flowInputs,
        metadata: { triggerType: 'manual' },
      };
    }

    // Build output from defined inputs, applying defaults for missing values.
    const output: Record<string, unknown> = {};
    const missing: string[] = [];

    for (const field of inputDefinitions) {
      const value = flowInputs[field.name];
      if (value !== undefined && value !== null) {
        output[field.name] = value;
      } else if (field.defaultValue !== undefined && field.defaultValue !== null) {
        output[field.name] = field.defaultValue;
      } else {
        missing.push(field.name);
      }
    }

    if (missing.length > 0) {
      return {
        success: false,
        error:
          `Missing required input(s): ${missing.join(', ')}. ` +
          `Available inputs: ${Object.keys(flowInputs).join(', ') || '(none)'}`,
      };
    }

    return {
      success: true,
      output,
      metadata: {
        triggerType: 'manual',
        definedInputs: inputDefinitions.map((d) => d.name),
      },
    };
  },
});
