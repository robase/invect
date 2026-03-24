/**
 * core.if_else — Conditional branching action
 *
 * Evaluates a JSON Logic expression against incoming data and routes
 * execution to the true or false branch.
 *
 * This is a flow-control node — it requires `markDownstreamNodesAsSkipped`
 * and access to the edges/skippedNodeIds from the flow run state.
 */

import { defineAction } from '../define-action';
import { CORE_PROVIDER } from '../providers';
import jsonLogic from 'json-logic-js';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  condition: z.record(z.string(), z.unknown()).default({ '==': [true, true] }),
});

export const ifElseAction = defineAction({
  id: 'core.if_else',
  name: 'If / Else',
  description: 'Conditional branching using JSON Logic',
  provider: CORE_PROVIDER,
  tags: ['if', 'else', 'condition', 'branch', 'logic', 'switch', 'conditional', 'filter', 'route'],

  // IMPORTANT: These handle IDs MUST match the sourceHandle values used in flow
  // edges AND the outputVariables keys returned by execute() below. If they
  // don't match, React Flow will fail to render the edges with error #008.
  outputs: [
    { id: 'true_output', label: 'True', type: 'any' },
    { id: 'false_output', label: 'False', type: 'any' },
  ],

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'condition',
        label: 'Condition (JSON Logic)',
        type: 'json',
        required: true,
        description:
          'JSON Logic expression evaluated against incoming data. Example: { ">": [{ "var": "user_data.age" }, 18] }',
        placeholder: '{ "==": [{ "var": "some_node.value" }, true] }',
      },
    ],
  },

  async execute(params, context) {
    const { condition } = params;
    const evaluationData = context.incomingData ?? {};
    const nodeId = context.flowContext?.nodeId;

    context.logger.debug('If-Else evaluating condition', {
      condition,
      incomingDataKeys: Object.keys(evaluationData),
    });

    if (Object.keys(evaluationData).length === 0) {
      context.logger.warn('No incoming data available for condition evaluation');
    }

    // Evaluate JSON Logic
    let evaluationResult: boolean;
    let evaluationError: string | undefined;

    try {
      const result = jsonLogic.apply(condition as Record<string, unknown>, evaluationData);
      evaluationResult = Boolean(result);
    } catch (error) {
      evaluationError = error instanceof Error ? error.message : String(error);
      evaluationResult = false;
      context.logger.warn('Condition evaluation failed, defaulting to false', {
        condition,
        error: evaluationError,
      });
    }

    // Mark the skipped branch's downstream nodes
    const mark = context.functions?.markDownstreamNodesAsSkipped;
    const edges = context.flowRunState?.edges;
    const skippedNodeIds = context.flowRunState?.skippedNodeIds;

    if (mark && edges && skippedNodeIds && nodeId) {
      const skipOutputHandle = evaluationResult ? 'false_output' : 'true_output';

      // Find edges from this node on the skipped branch
      const edgesToSkip = edges.filter(
        (edge) =>
          edge.source === nodeId &&
          edge.sourceHandle &&
          edge.sourceHandle.endsWith(skipOutputHandle),
      );

      for (const edge of edgesToSkip) {
        mark(edge.target, edges, skippedNodeIds, true);
      }
    }

    // Pass through incoming data as the output (flow-control nodes are passthrough)
    const passthroughData = JSON.stringify(evaluationData);

    // Build branch-specific output variables so the coordinator can resolve
    // edges with sourceHandle "true_output" / "false_output" correctly.
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
        condition,
        evaluationError,
        conditionResult: evaluationResult,
        branchTaken: evaluationResult ? 'true_branch' : 'false_branch',
      },
    };
  },
});
