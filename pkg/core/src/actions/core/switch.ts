/**
 * core.switch — Multi-way conditional branching action
 *
 * Evaluates multiple JavaScript expressions against incoming data and routes
 * execution to the first matching branch. Like core.if_else but with N
 * configurable output branches plus a default fallback.
 *
 * This is a flow-control node — the execution coordinator owns all
 * branch-skipping logic based on the outputVariables returned here.
 */

import { defineAction } from '../define-action';
import { CORE_PROVIDER } from '../providers';
import { z } from 'zod/v4';
import {
  getJsExpressionService,
  JsExpressionError,
} from 'src/services/templating/js-expression.service';

const switchCaseSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  expression: z.string().min(1),
});

const paramsSchema = z.object({
  cases: z.array(switchCaseSchema).min(1).max(20),
});

export const switchAction = defineAction({
  id: 'core.switch',
  name: 'Switch',
  description:
    'Multi-way conditional branching. Evaluates JS expressions top-to-bottom, routes to the first match or default.',
  provider: CORE_PROVIDER,
  icon: 'GitFork',
  excludeFromTools: true,
  tags: ['switch', 'branch', 'condition', 'route', 'case', 'multi', 'conditional'],

  dynamicOutputs: true,
  outputs: [
    { id: 'case_0', label: 'Case 0', type: 'any' },
    { id: 'default', label: 'Default', type: 'any' },
  ],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'cases',
        label: 'Cases',
        type: 'switch-cases' as const,
        required: true,
        description:
          'Each case has a label and a JS expression. First truthy match wins. Upstream data available as local variables by reference ID.',
      },
    ],
  },

  async execute(params, context) {
    const { cases } = params;
    const evaluationData = (context.incomingData as Record<string, unknown>) ?? {};

    context.logger.debug('Switch evaluating cases', {
      caseCount: cases.length,
      incomingDataKeys: Object.keys(evaluationData),
    });

    const jsService = await getJsExpressionService(context.logger);

    let matchedSlug: string | undefined;
    let matchedLabel: string | undefined;
    const caseResults: Array<{
      slug: string;
      label: string;
      matched: boolean;
      error?: string;
    }> = [];

    for (const c of cases) {
      try {
        const result = jsService.evaluate(c.expression, evaluationData);
        const matched = Boolean(result);
        caseResults.push({ slug: c.slug, label: c.label, matched });

        if (matched && !matchedSlug) {
          matchedSlug = c.slug;
          matchedLabel = c.label;
        }
      } catch (error) {
        const msg =
          error instanceof JsExpressionError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        caseResults.push({ slug: c.slug, label: c.label, matched: false, error: msg });
        context.logger.warn(`Switch case "${c.label}" evaluation failed`, {
          expression: c.expression,
          error: msg,
        });
      }
    }

    const matchedHandle = matchedSlug ?? 'default';

    // Passthrough — switch output equals input
    const passthroughData = JSON.stringify(evaluationData);

    // Only the matched handle gets an entry. The coordinator uses the
    // absence of a handle key to determine which branches to skip.
    const outputVariables: Record<string, { value: unknown; type: 'string' | 'object' }> = {
      [matchedHandle]: { type: 'object', value: passthroughData },
    };

    return {
      success: true,
      output: passthroughData,
      outputVariables,
      metadata: {
        caseResults,
        matchedSlug: matchedHandle,
        matchedLabel: matchedLabel ?? 'default',
      },
    };
  },
});
