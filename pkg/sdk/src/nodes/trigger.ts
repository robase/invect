/**
 * Trigger node helpers.
 *
 * Triggers are flow entry-points. A flow may have at most one `trigger.manual`,
 * but can have any number of `trigger.cron` and `trigger.webhook` nodes — when
 * a specific trigger fires, only that trigger node's downstream subtree runs;
 * other triggers and their subtrees are skipped.
 *
 * Exposed as a namespace to match the action ID layout (`trigger.manual`,
 * `trigger.cron`) and leave room for plugin-provided triggers like
 * `trigger.webhook` (from `@invect/webhooks`) to be called via the generic
 * `node()` helper until they ship their own SDK wrapper.
 */

import { manualTriggerAction, cronTriggerAction } from '@invect/actions/triggers';
import type { NodeOptions, SdkFlowNode } from '@invect/action-kit';

function manual(
  referenceId: string,
  params?: { defaultInputs?: Record<string, unknown> },
  options?: NodeOptions,
): SdkFlowNode {
  return manualTriggerAction(referenceId, { defaultInputs: params?.defaultInputs }, options);
}

function cron(
  referenceId: string,
  params: {
    expression: string;
    timezone?: string;
    staticInputs?: Record<string, unknown>;
  },
  options?: NodeOptions,
): SdkFlowNode {
  return cronTriggerAction(
    referenceId,
    {
      expression: params.expression,
      timezone: params.timezone ?? 'UTC',
      staticInputs: params.staticInputs,
    },
    options,
  );
}

export const trigger = { manual, cron } as const;
