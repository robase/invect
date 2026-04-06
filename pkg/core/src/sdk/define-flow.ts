/**
 * defineFlow — Declarative flow definition
 *
 * Accepts a `FlowFileDefinition` with nodes and edges (tuples or objects),
 * and produces a validated `InvectDefinition` ready for the runtime.
 *
 * @example
 * import { defineFlow, input, model, output } from '@invect/core/sdk';
 *
 * export default defineFlow({
 *   name: 'My Flow',
 *   nodes: [
 *     input('query', { variableName: 'query' }),
 *     model('answer', { credentialId: 'cred', model: 'gpt-4o', prompt: '{{ query }}' }),
 *     output('result', { outputName: 'answer', outputValue: '{{ answer }}' }),
 *   ],
 *   edges: [
 *     ['query', 'answer'],
 *     { from: 'answer', to: 'result' },
 *   ],
 * });
 */

import type { InvectDefinition, FlowEdge } from 'src/services/flow-versions/schemas-fresh';
import type { FlowFileDefinition, EdgeInput, EdgeTuple, EdgeObject } from './types';

// ── Edge normalization ──────────────────────────────────────────────────

function isEdgeTuple(edge: EdgeInput): edge is EdgeTuple {
  return Array.isArray(edge);
}

function isEdgeObject(edge: EdgeInput): edge is EdgeObject {
  return typeof edge === 'object' && !Array.isArray(edge) && 'from' in edge && 'to' in edge;
}

/**
 * Normalize a mixed-format edge into a `FlowEdge`.
 *
 * Accepts:
 *   - Tuple:  `['source', 'target']` or `['source', 'target', 'handle']`
 *   - Object: `{ from: 'source', to: 'target', handle?: 'handle' }`
 *
 * Generates deterministic edge IDs from source/target/handle.
 * Prefixes node IDs with `node-` to match the convention from node helpers.
 */
function normalizeEdge(edge: EdgeInput): FlowEdge {
  let from: string;
  let to: string;
  let sourceHandle: string | undefined;

  if (isEdgeTuple(edge)) {
    from = edge[0];
    to = edge[1];
    sourceHandle = edge[2];
  } else if (isEdgeObject(edge)) {
    from = edge.from;
    to = edge.to;
    sourceHandle = edge.handle;
  } else {
    throw new Error(
      `Invalid edge format: expected [from, to] tuple or { from, to } object, got ${JSON.stringify(edge)}`,
    );
  }

  const sourceId = from.startsWith('node-') ? from : `node-${from}`;
  const targetId = to.startsWith('node-') ? to : `node-${to}`;
  const handleSuffix = sourceHandle ? `-${sourceHandle}` : '';

  return {
    id: `edge-${from}-${to}${handleSuffix}`,
    source: sourceId,
    target: targetId,
    ...(sourceHandle && { sourceHandle }),
  };
}

// ── Validation ──────────────────────────────────────────────────────────

function validateFlow(def: FlowFileDefinition): void {
  if (!def.name || typeof def.name !== 'string') {
    throw new Error('defineFlow: "name" is required and must be a non-empty string');
  }

  if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
    throw new Error('defineFlow: "nodes" must be a non-empty array');
  }

  if (!Array.isArray(def.edges)) {
    throw new Error('defineFlow: "edges" must be an array');
  }

  // Check for duplicate referenceIds
  const refIds = new Set<string>();
  for (const node of def.nodes) {
    const ref = node.referenceId;
    if (ref) {
      if (refIds.has(ref)) {
        throw new Error(`defineFlow: duplicate referenceId "${ref}"`);
      }
      refIds.add(ref);
    }
  }

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of def.nodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`defineFlow: duplicate node id "${node.id}"`);
    }
    nodeIds.add(node.id);
  }
}

function validateEdgeRefs(edges: FlowEdge[], nodeIds: Set<string>): void {
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(
        `defineFlow: edge "${edge.id}" references unknown source "${edge.source}". ` +
          `Available nodes: ${[...nodeIds].join(', ')}`,
      );
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(
        `defineFlow: edge "${edge.id}" references unknown target "${edge.target}". ` +
          `Available nodes: ${[...nodeIds].join(', ')}`,
      );
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Define a flow from a declarative specification.
 *
 * Produces a valid `InvectDefinition` that can be:
 * - Saved as a flow version via the API
 * - Exported to a `.flow.ts` file for GitHub sync
 * - Used in tests or scripts
 */
export function defineFlow(def: FlowFileDefinition): InvectDefinition {
  validateFlow(def);

  const edges = def.edges.map(normalizeEdge);

  // Collect node IDs for edge validation
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  validateEdgeRefs(edges, nodeIds);

  return {
    nodes: def.nodes,
    edges,
    metadata: {
      name: def.name,
      ...(def.description && { description: def.description }),
      ...(def.tags && { tags: def.tags }),
    },
  };
}
