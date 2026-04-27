/**
 * Edge helpers.
 *
 * The canonical edge shape is `{ from, to, handle? }`. The `edge()` helper
 * is a convenience for programmatic construction; hand-authored flows write
 * the object literal directly.
 */

import type { SdkEdge, SdkEdgeObject } from './types';

/**
 * Build an edge object. Useful for programmatic construction; otherwise
 * write `{ from, to, handle? }` directly.
 */
export function edge(from: string, to: string, handle?: string): SdkEdgeObject {
  return handle === undefined ? { from, to } : { from, to, handle };
}

/** Normalize an edge into `{ from, to, sourceHandle? }` for the runtime. */
export function resolveEdge(e: SdkEdge): { from: string; to: string; sourceHandle?: string } {
  return e.handle === undefined
    ? { from: e.from, to: e.to }
    : { from: e.from, to: e.to, sourceHandle: e.handle };
}
