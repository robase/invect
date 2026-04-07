/**
 * parseSDKText — Parse SDK source text back into nodes + edges.
 *
 * Evaluates pasted SDK code in a sandboxed context where all SDK helper
 * functions are available. Collects the returned node definitions and
 * edge tuples and returns them as a structured result.
 *
 * Used by:
 * - The flow editor clipboard paste (paste SDK code onto canvas)
 * - The GitHub sync plugin (import `.flow.ts` files)
 *
 * @example
 * ```typescript
 * const result = parseSDKText(`
 *   input('query', { variableName: 'query' }),
 *   model('answer', { model: 'gpt-4o', prompt: '{{ query }}' }),
 *   ['query', 'answer'],
 * `);
 * // result.nodes = [FlowNodeDefinitions, FlowNodeDefinitions]
 * // result.edges = [['query', 'answer']]
 * ```
 */

import type { FlowNodeDefinitions } from 'src/services/flow-versions/schemas-fresh';
import type { EdgeInput } from './types';
import {
  input,
  output,
  model,
  javascript,
  ifElse,
  template,
  httpRequest,
  agent,
  node,
} from './nodes';
import { gmail, slack, github, provider } from './providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedSDK {
  nodes: FlowNodeDefinitions[];
  edges: EdgeInput[];
}

// ---------------------------------------------------------------------------
// Helpers map — all names available inside evaluated SDK text
// ---------------------------------------------------------------------------

const SDK_HELPERS: Record<string, unknown> = {
  // Core node helpers
  input,
  output,
  model,
  javascript,
  ifElse,
  template,
  httpRequest,
  agent,
  node,

  // Provider namespaces
  gmail,
  slack,
  github,
  provider,
};

/** Names injected as function parameters. */
const HELPER_NAMES = Object.keys(SDK_HELPERS);

/** Values injected as function arguments (same order as HELPER_NAMES). */
const HELPER_VALUES = HELPER_NAMES.map((k) => SDK_HELPERS[k]);

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function isNodeDefinition(item: unknown): item is FlowNodeDefinitions {
  return (
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    typeof (item as Record<string, unknown>).id === 'string' &&
    typeof (item as Record<string, unknown>).type === 'string'
  );
}

function isEdgeTuple(item: unknown): item is EdgeInput {
  if (!Array.isArray(item)) {
    return false;
  }
  if (item.length < 2 || item.length > 3) {
    return false;
  }
  return item.every((el) => typeof el === 'string');
}

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

/**
 * Strip comment lines and normalise whitespace so the expression array
 * evaluates cleanly. Handles both single-line `//` and block comments.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\/.*$/gm, '') // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse SDK source text into node definitions and edge tuples.
 *
 * The text should contain comma-separated SDK helper calls and/or edge
 * tuples — exactly the format produced by `serializeToSDK()`.
 *
 * Throws if the text contains syntax errors or produces unexpected values.
 */
export function parseSDKText(text: string): ParsedSDK {
  const cleaned = stripComments(text).trim();
  if (!cleaned) {
    return { nodes: [], edges: [] };
  }

  // Wrap the comma-separated expressions in an array literal so we can
  // collect all values in one evaluation.
  const body = `"use strict"; return [\n${cleaned}\n]`;

  let items: unknown[];
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...HELPER_NAMES, body);
    items = fn(...HELPER_VALUES) as unknown[];
  } catch (err) {
    throw new Error(
      `Failed to parse SDK text: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(items)) {
    throw new Error('SDK text evaluation did not produce an array');
  }

  // Separate nodes from edges, ignoring undefined/null (trailing commas)
  const nodes: FlowNodeDefinitions[] = [];
  const edges: EdgeInput[] = [];

  for (const item of items) {
    if (item === null || item === undefined) {
      continue;
    }

    if (isNodeDefinition(item)) {
      nodes.push(item);
    } else if (isEdgeTuple(item)) {
      edges.push(item as EdgeInput);
    }
    // Silently skip unrecognised items (e.g. stray strings)
  }

  return { nodes, edges };
}
