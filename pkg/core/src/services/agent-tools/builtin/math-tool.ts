/**
 * Math Evaluation Tool
 *
 * Agent tool for evaluating mathematical expressions.
 */

import {
  AgentToolDefinition,
  AgentToolExecutor,
  AgentToolResult,
} from 'src/types/agent-tool.types';

export const mathToolDefinition: AgentToolDefinition = {
  id: 'math_eval',
  name: 'Math Evaluate',
  description:
    'Evaluate mathematical expressions. Use this for arithmetic calculations, percentages, and basic math operations. Supports: +, -, *, /, %, ^, parentheses, and common functions like sqrt, sin, cos, tan, log, exp, abs, round, floor, ceil.',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          "The mathematical expression to evaluate. Examples: '2 + 3 * 4', 'sqrt(16)', '(100 - 20) / 5', 'round(3.7)'",
      },
      variables: {
        type: 'object',
        description:
          'Optional variables to substitute in the expression. Example: { "x": 5, "y": 10 } for expression \'x + y\'',
        additionalProperties: { type: 'number' },
      },
    },
    required: ['expression'],
    additionalProperties: false,
  },
  category: 'utility',
  tags: ['math', 'calculation', 'arithmetic'],
  enabledByDefault: true,
};

// Safe math functions
const mathFunctions: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  random: Math.random,
};

// Constants
const mathConstants: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  LN2: Math.LN2,
  LN10: Math.LN10,
};

/**
 * Safe math expression evaluator
 * Only allows numbers, basic operators, parentheses, and whitelisted functions
 */
function evaluateMathExpression(
  expression: string,
  variables: Record<string, number> = {},
): number {
  // Validate expression - only allow safe characters
  const safePattern = /^[\d\s+\-*/().,%^a-zA-Z_]+$/;
  if (!safePattern.test(expression)) {
    throw new Error(`Invalid characters in expression: ${expression}`);
  }

  // Replace constants
  let processedExpr = expression;
  for (const [name, value] of Object.entries(mathConstants)) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    processedExpr = processedExpr.replace(regex, String(value));
  }

  // Replace variables
  for (const [name, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    processedExpr = processedExpr.replace(regex, String(value));
  }

  // Replace ^ with ** for exponentiation
  processedExpr = processedExpr.replace(/\^/g, '**');

  // Replace % with * 0.01 for percentage
  processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1 * 0.01)');

  // Replace function calls with Math. prefix
  for (const funcName of Object.keys(mathFunctions)) {
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    processedExpr = processedExpr.replace(regex, `Math.${funcName}(`);
  }

  // Final validation - ensure no function calls except Math.*
  const funcCallPattern = /\b(?!Math\.)[a-zA-Z_][a-zA-Z0-9_]*\s*\(/;
  if (funcCallPattern.test(processedExpr)) {
    throw new Error(`Unsupported function call in expression: ${expression}`);
  }

  // Evaluate using Function constructor (safer than eval but still constrained)
  try {
    // Create a restricted scope with only Math available
    const evaluator = new Function('Math', `"use strict"; return (${processedExpr});`);
    const result = evaluator(Math);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Invalid result: ${result}`);
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const mathToolExecutor: AgentToolExecutor = async (
  input,
  context,
): Promise<AgentToolResult> => {
  const { logger } = context;

  try {
    const expression = input.expression as string;
    const variables = (input.variables as Record<string, number>) || {};

    if (!expression || typeof expression !== 'string') {
      return {
        success: false,
        error: 'Expression must be a non-empty string',
      };
    }

    logger.debug('Executing math tool', { expression, variables });

    const result = evaluateMathExpression(expression.trim(), variables);

    return {
      success: true,
      output: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Math tool execution failed', { error: errorMessage });
    return {
      success: false,
      error: `Math evaluation failed: ${errorMessage}`,
    };
  }
};
