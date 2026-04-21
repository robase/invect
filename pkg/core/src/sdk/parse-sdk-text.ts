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
 * // Structured format (from clipboard copy)
 * const result = parseSDKText(`
 *   nodes: [
 *     input('query', { variableName: 'query' }),
 *     model('answer', { model: 'gpt-4o', prompt: '{{ query }}' }),
 *   ],
 *   edges: [
 *     ['query', 'answer'],
 *   ],
 * `);
 *
 * // Flat format (legacy, still supported)
 * const result = parseSDKText(`
 *   input('query', { variableName: 'query' }),
 *   model('answer', { model: 'gpt-4o', prompt: '{{ query }}' }),
 *   ['query', 'answer'],
 * `);
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
  tool,
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
  code: javascript,
  ifElse,
  template,
  httpRequest,
  agent,
  node,
  tool,

  // defineFlow — identity passthrough so a full-file paste unwraps cleanly.
  // The real `defineFlow` runs validation and wraps in metadata; inside the
  // parser we just want the object back.
  defineFlow: (def: unknown) => def,

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

/**
 * Unwrap a full `.flow.ts` file into the nodes/edges fragment format the
 * evaluator expects. Strips `import` statements and unwraps
 * `export default defineFlow({ ... });` down to the inner body.
 * Returns the text unchanged if no wrapper is present.
 */
function unwrapFullFile(text: string): string {
  let out = text.replace(/^\s*import[^;]*;/gm, '');

  const defineFlowMatch = out.match(
    /(?:export\s+default\s+)?defineFlow\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/,
  );
  if (defineFlowMatch) {
    const inner = defineFlowMatch[1].trim();
    // Strip outer braces so the result is `nodes: [...], edges: [...]` — the
    // same shape as the fragment format.
    if (inner.startsWith('{') && inner.endsWith('}')) {
      out = inner.slice(1, -1);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse SDK source text into node definitions and edge tuples.
 *
 * The text should contain `nodes: [...]` and `edges: [...]` properties —
 * exactly the format produced by `serializeToSDK()`.
 *
 * Throws if the text contains syntax errors or produces unexpected values.
 */
export function parseSDKText(text: string): ParsedSDK {
  const cleaned = unwrapFullFile(stripComments(text)).trim();
  if (!cleaned) {
    return { nodes: [], edges: [] };
  }

  // Wrap in an object literal so `nodes:` and `edges:` become properties.
  const body = `"use strict"; return ({\n${cleaned}\n})`;

  let result: unknown;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...HELPER_NAMES, body);
    result = fn(...HELPER_VALUES);
  } catch (err) {
    throw new Error(
      `Failed to parse SDK text: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof result !== 'object' || result === null) {
    throw new Error('SDK text evaluation did not produce an object');
  }

  const obj = result as Record<string, unknown>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];

  const nodes: FlowNodeDefinitions[] = [];
  const edges: EdgeInput[] = [];

  for (const item of rawNodes) {
    if (item !== null && item !== undefined && isNodeDefinition(item)) {
      nodes.push(item);
    }
  }

  for (const item of rawEdges) {
    if (item !== null && item !== undefined && isEdgeTuple(item)) {
      edges.push(item as EdgeInput);
    }
  }

  return { nodes, edges };
}
