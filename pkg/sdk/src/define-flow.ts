/**
 * `defineFlow` — the canonical authoring entry point.
 *
 * Accepts an author-friendly `SdkFlowDefinition` (nodes + edges in tuple or
 * object form, optional metadata) and validates basic structural rules:
 * - non-empty nodes + edges arrays (empty is allowed, represents a blank flow)
 * - unique referenceIds
 * - edges reference existing nodes
 *
 * Does NOT mutate the input. Returns the definition as-is with edges
 * normalized so downstream consumers (emitter, runtime, save pipeline) can
 * iterate uniformly.
 *
 * Node IDs, canvas positions, mapper string-to-arrow conversions, and the
 * referenceId-match merge against a prior DB version are all handled by the
 * *save* pipeline — `defineFlow` is a pure function that just validates shape.
 */

import type { SdkFlowDefinition, SdkFlowNode, ResolvedEdge } from './types';
import { resolveEdge } from './edge';

export class FlowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowValidationError';
  }
}

/** Result type — same as input, but with edges guaranteed in canonical form. */
export interface DefinedFlow {
  name?: string;
  description?: string;
  tags?: string[];
  nodes: SdkFlowNode[];
  edges: ResolvedEdge[];
}

export function defineFlow(def: SdkFlowDefinition): DefinedFlow {
  validateStructure(def);

  const nodes = def.nodes;
  const edges = def.edges.map(resolveEdge);

  validateEdgeRefs(edges, nodes);

  return {
    ...(def.name !== undefined ? { name: def.name } : {}),
    ...(def.description !== undefined ? { description: def.description } : {}),
    ...(def.tags !== undefined ? { tags: def.tags } : {}),
    nodes,
    edges,
  };
}

function validateStructure(def: SdkFlowDefinition): void {
  if (!Array.isArray(def.nodes)) {
    throw new FlowValidationError('defineFlow: `nodes` must be an array');
  }
  if (!Array.isArray(def.edges)) {
    throw new FlowValidationError('defineFlow: `edges` must be an array');
  }

  const seenRefs = new Set<string>();
  for (const node of def.nodes) {
    if (typeof node.referenceId !== 'string' || node.referenceId.length === 0) {
      throw new FlowValidationError(
        `defineFlow: every node must have a non-empty referenceId (node type: "${node.type}")`,
      );
    }
    if (seenRefs.has(node.referenceId)) {
      throw new FlowValidationError(`defineFlow: duplicate referenceId "${node.referenceId}"`);
    }
    seenRefs.add(node.referenceId);
  }
}

function validateEdgeRefs(edges: ResolvedEdge[], nodes: SdkFlowNode[]): void {
  const refs = new Set(nodes.map((n) => n.referenceId));
  for (const edge of edges) {
    if (!refs.has(edge.from)) {
      throw new FlowValidationError(
        `defineFlow: edge references unknown source "${edge.from}". Known referenceIds: ${[...refs].join(', ')}`,
      );
    }
    if (!refs.has(edge.to)) {
      throw new FlowValidationError(
        `defineFlow: edge references unknown target "${edge.to}". Known referenceIds: ${[...refs].join(', ')}`,
      );
    }
  }
}
