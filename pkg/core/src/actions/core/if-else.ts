/**
 * core.if_else — Conditional branching action
 *
 * Evaluates a JavaScript expression against incoming data and routes
 * execution to the true or false branch.
 *
 * Branch skipping is handled by the execution coordinator — this action
 * only returns outputVariables indicating which branch was taken.
 */

import { defineAction } from '../define-action';
import { CORE_PROVIDER } from '../providers';
import { z } from 'zod/v4';
import {
  getJsExpressionService,
  JsExpressionError,
} from 'src/services/templating/js-expression.service';

const paramsSchema = z.object({
  expression: z.string().min(1, 'A JavaScript expression is required'),
});

export const ifElseAction = defineAction({
  id: 'core.if_else',
  name: 'If / Else',
  description: 'Conditional branching — evaluates a JavaScript expression',
  provider: CORE_PROVIDER,
  icon: 'GitBranch',
  excludeFromTools: true,
  tags: ['if', 'else', 'condition', 'branch', 'logic', 'switch', 'conditional', 'filter', 'route'],

  outputs: [
    { id: 'true_output', label: 'True', type: 'any' },
    { id: 'false_output', label: 'False', type: 'any' },
  ],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'expression',
        label: 'Condition',
        type: 'code',
        required: true,
        description:
          'JavaScript expression evaluated against incoming data. Upstream node outputs are available as variables by their reference ID.',
        placeholder: 'user_data.age >= 18',
      },
    ],
  },

  async execute(params, context) {
    const evaluationData = (context.incomingData as Record<string, unknown>) ?? {};

    context.logger.debug('If-Else evaluating condition', {
      expression: params.expression,
      incomingDataKeys: Object.keys(evaluationData),
    });

    if (Object.keys(evaluationData).length === 0) {
      context.logger.warn('No incoming data available for condition evaluation');
    }

    let evaluationResult: boolean;
    let evaluationError: string | undefined;

    try {
      const jsService = await getJsExpressionService(context.logger);
      const result = jsService.evaluate(params.expression, evaluationData);
      evaluationResult = Boolean(result);
    } catch (error) {
      evaluationError =
        error instanceof JsExpressionError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      evaluationResult = false;
      context.logger.warn('Condition evaluation failed, defaulting to false', {
        expression: params.expression,
        error: evaluationError,
      });
    }

    // Passthrough — if/else output equals input
    const passthroughData = JSON.stringify(evaluationData);

    // Only the active branch handle gets an entry in outputVariables.
    // The coordinator uses the absence of a handle key to skip branches.
    const outputVariables: Record<string, { value: unknown; type: 'string' | 'object' }> = {};
    if (evaluationResult) {
      outputVariables.true_output = { type: 'object', value: passthroughData };
    } else {
      outputVariables.false_output = { type: 'object', value: passthroughData };
    }

    return {
      success: true,
      output: passthroughData,
      outputVariables,
      metadata: {
        expression: params.expression,
        evaluationError,
        conditionResult: evaluationResult,
        branchTaken: evaluationResult ? 'true_branch' : 'false_branch',
      },
    };
  },
});
