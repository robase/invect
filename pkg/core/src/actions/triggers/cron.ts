/**
 * trigger.cron — Cron Trigger action
 *
 * Entry-point node for flows triggered on a recurring schedule.
 *
 * At execution time, the cron scheduler injects trigger data via
 * `flowInputs.__triggerData`. The action reads it and returns it as output
 * so downstream nodes can access metadata like `{{ cron_trigger.scheduledTime }}`.
 */

import { defineAction } from '../define-action';
import { TRIGGERS_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  /** Cron expression (standard 5-field or extended 6-field). */
  expression: z.string().min(1, 'Cron expression is required'),
  /** IANA timezone name. Defaults to UTC. */
  timezone: z.string().default('UTC'),
  /** Optional static inputs to include with every cron trigger. */
  staticInputs: z.record(z.string(), z.unknown()).optional(),
});

export const cronTriggerAction = defineAction({
  id: 'trigger.cron',
  name: 'Cron Trigger',
  description: 'Start this flow on a recurring schedule using a cron expression',
  provider: TRIGGERS_PROVIDER,
  noInput: true,
  maxInstances: 1,
  tags: ['trigger', 'cron', 'schedule', 'timer', 'recurring', 'periodic', 'interval', 'automate'],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'expression',
        label: 'Cron Expression',
        type: 'text',
        required: true,
        description:
          'Cron schedule (e.g. "0 * * * *" for every hour, "0 9 * * 1-5" for weekdays at 9am)',
        placeholder: '0 * * * *',
      },
      {
        name: 'timezone',
        label: 'Timezone',
        type: 'text',
        description: 'IANA timezone (e.g. "America/New_York", "Europe/London"). Defaults to UTC.',
        defaultValue: 'UTC',
        placeholder: 'UTC',
      },
      {
        name: 'staticInputs',
        label: 'Static Inputs',
        type: 'json',
        description: 'Optional JSON object of static values to include with every cron trigger',
        placeholder: '{ "environment": "production" }',
        extended: true,
      },
    ],
  },

  async execute(params, context) {
    // triggerData is injected via flowInputs.__triggerData (a native object)
    const data = context.flowInputs?.__triggerData as Record<string, unknown> | undefined;
    if (!data) {
      // Testing: return current time
      return {
        success: true,
        output: {
          scheduledTime: new Date().toISOString(),
          expression: params.expression,
          timezone: params.timezone,
          staticInputs: params.staticInputs ?? {},
        },
        metadata: { triggerType: 'cron', isTest: true },
      };
    }
    return {
      success: true,
      output: {
        ...data,
        staticInputs: params.staticInputs ?? {},
      },
      metadata: { triggerType: 'cron' },
    };
  },
});
