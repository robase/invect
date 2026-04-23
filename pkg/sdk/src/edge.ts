/**
 * Edge helpers.
 *
 * Tuple form is the author-friendly default; the object form lets callers
 * attach named source handles (`true_output`, case slugs) explicitly.
 */

import type { SdkEdge, SdkEdgeObject } from './types';

/**
 * Build an edge object. Preferred over the tuple form when the edge has a
 * source handle so the intent is explicit at the call site.
 */
export function edge(from: string, to: string, handle?: string): SdkEdgeObject {
  return handle === undefined ? { from, to } : { from, to, handle };
}

/** Type guard — distinguishes tuple form from object form. */
export function isEdgeTuple(e: SdkEdge): e is [string, string] | [string, string, string] {
  return Array.isArray(e);
}

/** Normalize any edge shape into `{ from, to, sourceHandle? }`. */
export function resolveEdge(e: SdkEdge): { from: string; to: string; sourceHandle?: string } {
  if (isEdgeTuple(e)) {
    return e.length === 3 ? { from: e[0], to: e[1], sourceHandle: e[2] } : { from: e[0], to: e[1] };
  }
  return e.handle === undefined
    ? { from: e.from, to: e.to }
    : { from: e.from, to: e.to, sourceHandle: e.handle };
}
