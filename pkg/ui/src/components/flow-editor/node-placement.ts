import type { Node } from '@xyflow/react';

// Node dimensions (must match max-w/h in UniversalNode / AgentNode)
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 60;
export const PLACEMENT_OFFSET = 72;

/**
 * Finds a visible placement position for a newly added node.
 *
 * Overlap is allowed, but we avoid dropping a node at the exact same position
 * as an existing one so a new node is still immediately discoverable.
 */
export function findVisiblePlacementPosition(
  startX: number,
  startY: number,
  existingNodes: Node[],
): { x: number; y: number } {
  let x = Math.round(startX);
  let y = Math.round(startY);

  const isDirectlyOnTop = (cx: number, cy: number) =>
    existingNodes.some(
      (node) => Math.round(node.position.x) === cx && Math.round(node.position.y) === cy,
    );

  while (isDirectlyOnTop(x, y)) {
    x += PLACEMENT_OFFSET;
    y += PLACEMENT_OFFSET;
  }

  return { x, y };
}
