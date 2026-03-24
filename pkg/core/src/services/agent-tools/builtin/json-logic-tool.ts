/**
 * JSON Logic Tool
 *
 * Agent tool for evaluating JSON Logic expressions.
 * Self-contained implementation using json-logic-js directly.
 */

import jsonLogic from 'json-logic-js';
import {
  AgentToolDefinition,
  AgentToolExecutor,
  AgentToolResult,
} from 'src/types/agent-tool.types';

export const jsonLogicToolDefinition: AgentToolDefinition = {
  id: 'json_logic',
  name: 'JSON Logic',
  description:
    'Evaluate conditional logic using JSON Logic rules. Use this for complex conditional checks, data validation, or rule-based decisions. Supports operators like ==, !=, <, >, <=, >=, and, or, not, if, in, cat, var, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      rule: {
        type: 'object',
        description:
          'The JSON Logic rule to evaluate. Examples: {"==": [{"var": "age"}, 18]}, {"and": [{">=": [{"var": "score"}, 80]}, {"var": "passed"}]}',
      },
      data: {
        type: 'object',
        description:
          'The data object to evaluate the rule against. Example: {"age": 25, "score": 85, "passed": true}',
      },
    },
    required: ['rule', 'data'],
    additionalProperties: false,
  },
  category: 'utility',
  tags: ['logic', 'conditional', 'rules'],
  enabledByDefault: true,
};

export const jsonLogicToolExecutor: AgentToolExecutor = async (
  input,
  context,
): Promise<AgentToolResult> => {
  const { logger } = context;

  try {
    const rule = input.rule as Record<string, unknown>;
    const data = input.data as object;

    if (!rule || typeof rule !== 'object') {
      return {
        success: false,
        error: 'Rule must be a JSON Logic object',
      };
    }

    if (!data || typeof data !== 'object') {
      return {
        success: false,
        error: 'Data must be an object',
      };
    }

    logger.debug('Executing JSON Logic tool', {
      rule: JSON.stringify(rule).substring(0, 100),
      dataKeys: Object.keys(data),
    });

    // Use json-logic-js directly - no context function needed
    const result = jsonLogic.apply(rule, data);

    return {
      success: true,
      output: Boolean(result),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('JSON Logic tool execution failed', { error: errorMessage });
    return {
      success: false,
      error: `JSON Logic evaluation failed: ${errorMessage}`,
    };
  }
};
