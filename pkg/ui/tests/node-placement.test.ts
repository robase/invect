import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  findVisiblePlacementPosition,
  PLACEMENT_OFFSET,
} from '../src/components/flow-editor/node-placement';

function makeNode(id: string, x: number, y: number): Node {
  return {
    id,
    type: 'core.model',
    position: { x, y },
    data: {
      id,
      type: 'core.model',
      display_name: id,
      reference_id: id,
      params: {},
    },
  };
}

describe('node placement', () => {
  it('keeps the requested position when no node is directly on top of it', () => {
    const position = findVisiblePlacementPosition(172, 172, [makeNode('n1', 100, 100)]);

    expect(position).toEqual({ x: 172, y: 172 });
  });

  it('nudges diagonally when the requested position exactly matches an existing node', () => {
    const position = findVisiblePlacementPosition(172, 172, [makeNode('n1', 172, 172)]);

    expect(position).toEqual({
      x: 172 + PLACEMENT_OFFSET,
      y: 172 + PLACEMENT_OFFSET,
    });
  });

  it('allows partial overlap as long as the new node is not directly on top', () => {
    const position = findVisiblePlacementPosition(172, 172, [makeNode('n1', 140, 140)]);

    expect(position).toEqual({ x: 172, y: 172 });
  });
});
