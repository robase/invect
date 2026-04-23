/**
 * Public SDK types.
 *
 * These are the shapes authored flow files produce and the serializer/runtime
 * consumes. Re-exports the canonical node shape from `@invect/action-kit` and
 * adds edge + flow-definition shapes on top.
 */

import type { SdkFlowNode, NodeOptions, MapperOptions } from '@invect/action-kit';

export type { SdkFlowNode, NodeOptions, MapperOptions };

/** Object form for edges: `{ from, to, handle? }`. */
export interface SdkEdgeObject {
  from: string;
  to: string;
  /** Source-handle for multi-output nodes (e.g. `true_output`, case slugs). */
  handle?: string;
}

/**
 * Tuple shorthand for edges — less verbose than `{ from, to, handle }`.
 * `[source, target]` or `[source, target, handle]`.
 */
export type SdkEdgeTuple = [string, string] | [string, string, string];

export type SdkEdge = SdkEdgeObject | SdkEdgeTuple;

/**
 * Accept either referenceId strings or the `SdkFlowNode` objects helpers
 * produce — `from: inputNode` works the same as `from: 'input_ref'`.
 */
export type EdgeEndpoint = string | SdkFlowNode;

/**
 * Flow definition as authored in a `.flow.ts` file or emitted from the DB.
 * This is the shape `defineFlow()` accepts.
 */
export interface SdkFlowDefinition {
  /** Display name — surfaces in the UI and as the DB metadata. */
  name?: string;
  /** Optional short description. */
  description?: string;
  /** Optional tags for categorisation. */
  tags?: string[];
  /** Ordered node list. */
  nodes: SdkFlowNode[];
  /** Edges linking node referenceIds. */
  edges: SdkEdge[];
}

/**
 * Edge resolved into canonical form — all endpoints are strings, handles are
 * explicit `sourceHandle` properties. This is the shape the runtime + emitter
 * consume internally.
 */
export interface ResolvedEdge {
  from: string;
  to: string;
  sourceHandle?: string;
}
