import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphService } from 'src/services/graph.service';
import type { FlowNodeDefinitions, FlowEdge } from 'src/services/flow-versions/schemas-fresh';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string, type = 'core.test'): FlowNodeDefinitions {
  return { id, type, params: {} };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
): FlowEdge {
  return {
    id,
    source,
    target,
    ...(sourceHandle !== undefined && { sourceHandle }),
    ...(targetHandle !== undefined && { targetHandle }),
  };
}

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeGraphService(): GraphService {
  return new GraphService(mockLogger, {} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe('GraphService.topologicalSort', () => {
  it('returns empty array for empty graph', () => {
    expect(GraphService.topologicalSort([], [])).toEqual([]);
  });

  it('returns single node for single-node graph', () => {
    expect(GraphService.topologicalSort([node('A')], [])).toEqual(['A']);
  });

  it('orders a linear chain correctly', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')];
    const order = GraphService.topologicalSort(nodes, edges);
    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('places root before all descendants in a diamond', () => {
    // A → B, A → C, B → D, C → D
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const edges = [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'C'),
      edge('e3', 'B', 'D'),
      edge('e4', 'C', 'D'),
    ];
    const order = GraphService.topologicalSort(nodes, edges);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    expect(order).toHaveLength(4);
  });

  it('handles parallel independent nodes (no edges)', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const order = GraphService.topologicalSort(nodes, []);
    expect(order).toHaveLength(3);
    expect(order).toContain('A');
    expect(order).toContain('B');
    expect(order).toContain('C');
  });

  it('ignores edges that reference nodes not in the nodes array', () => {
    const nodes = [node('A'), node('B')];
    const edges = [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'GHOST'), // GHOST not in nodes
    ];
    expect(() => GraphService.topologicalSort(nodes, edges)).not.toThrow();
  });

  it('throws when the graph contains a cycle', () => {
    // A → B → A
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')];
    expect(() => GraphService.topologicalSort(nodes, edges)).toThrow(
      'Flow contains cycles and cannot be executed',
    );
  });

  it('throws on a self-loop', () => {
    const nodes = [node('A')];
    const edges = [edge('e1', 'A', 'A')];
    expect(() => GraphService.topologicalSort(nodes, edges)).toThrow(
      'Flow contains cycles and cannot be executed',
    );
  });
});

// ---------------------------------------------------------------------------
// hasCycleDetection
// ---------------------------------------------------------------------------

describe('GraphService.hasCycleDetection', () => {
  it('returns no cycle for empty nodes', () => {
    expect(GraphService.hasCycleDetection([], [])).toEqual({ hasCycle: false });
  });

  it('returns no cycle for a simple DAG', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')];
    expect(GraphService.hasCycleDetection(nodes, edges)).toEqual({ hasCycle: false });
  });

  it('detects a simple two-node cycle', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')];
    const result = GraphService.hasCycleDetection(nodes, edges);
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toBeDefined();
  });

  it('detects a three-node cycle', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'A')];
    const result = GraphService.hasCycleDetection(nodes, edges);
    expect(result.hasCycle).toBe(true);
  });

  it('returns no cycle for a diamond (shared merge node)', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const edges = [
      edge('e1', 'A', 'B'),
      edge('e2', 'A', 'C'),
      edge('e3', 'B', 'D'),
      edge('e4', 'C', 'D'),
    ];
    expect(GraphService.hasCycleDetection(nodes, edges)).toEqual({ hasCycle: false });
  });
});

// ---------------------------------------------------------------------------
// getIncomingEdges / getOutgoingEdges
// ---------------------------------------------------------------------------

describe('GraphService.getIncomingEdges', () => {
  it('returns edges where target matches nodeId', () => {
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'C', 'B'), edge('e3', 'A', 'C')];
    expect(GraphService.getIncomingEdges('B', edges)).toHaveLength(2);
    expect(GraphService.getIncomingEdges('C', edges)).toHaveLength(1);
    expect(GraphService.getIncomingEdges('A', edges)).toHaveLength(0);
  });
});

describe('GraphService.getOutgoingEdges', () => {
  it('returns edges where source matches nodeId', () => {
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'A', 'C'), edge('e3', 'C', 'B')];
    expect(GraphService.getOutgoingEdges('A', edges)).toHaveLength(2);
    expect(GraphService.getOutgoingEdges('C', edges)).toHaveLength(1);
    expect(GraphService.getOutgoingEdges('B', edges)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// markDownstreamNodesAsSkipped
// ---------------------------------------------------------------------------

describe('GraphService.markDownstreamNodesAsSkipped', () => {
  it('skips all nodes in a linear chain downstream of start', () => {
    // A → B → C. The caller adds A to skipped first (matching handleBranchSkipping usage),
    // then asks the method to propagate through the chain.
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')];
    const skipped = new Set<string>(['A']); // caller pre-adds A before calling
    const svc = makeGraphService();
    svc.markDownstreamNodesAsSkipped('A', edges, skipped);
    expect(skipped.has('B')).toBe(true);
    expect(skipped.has('C')).toBe(true);
    expect(skipped.has('A')).toBe(true); // A was pre-added by caller
  });

  it('does not skip a join node when only one of its sources is skipped', () => {
    // A → C, B → C; skip from A — C should NOT be skipped because B is active
    const edges = [edge('e1', 'A', 'C'), edge('e2', 'B', 'C')];
    const skipped = new Set<string>();
    const svc = makeGraphService();
    svc.markDownstreamNodesAsSkipped('A', edges, skipped);
    expect(skipped.has('C')).toBe(false);
  });

  it('skips join node when ALL its sources are skipped', () => {
    // A → C, B → C. Both A and B are pre-added to skipped by the caller.
    // markDownstreamNodesAsSkipped('A', ...) then finds C, sees all its
    // incoming sources (A, B) are in skipped, and marks C as skipped too.
    const edges = [edge('e1', 'A', 'C'), edge('e2', 'B', 'C')];
    const skipped = new Set<string>(['A', 'B']); // both pre-added
    const svc = makeGraphService();
    svc.markDownstreamNodesAsSkipped('A', edges, skipped);
    expect(skipped.has('C')).toBe(true);
  });

  it('marks the start node itself as skipped when isFromIfElse=true', () => {
    // isFromIfElse=true means nodeId is the first node on the inactive branch
    const edges = [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')];
    const skipped = new Set<string>();
    const svc = makeGraphService();
    svc.markDownstreamNodesAsSkipped('B', edges, skipped, true);
    expect(skipped.has('B')).toBe(true);
    expect(skipped.has('C')).toBe(true);
  });

  it('does not re-add already-skipped nodes', () => {
    const edges = [edge('e1', 'A', 'B')];
    const skipped = new Set<string>(['B']);
    const svc = makeGraphService();
    svc.markDownstreamNodesAsSkipped('A', edges, skipped);
    expect(skipped.size).toBe(1);
  });

  it('does not skip a root node (no incoming edges)', () => {
    // A → B; B → A-like root C (no incoming)
    const edges = [edge('e1', 'A', 'B')];
    const skipped = new Set<string>();
    const svc = makeGraphService();
    // C has no incoming edges and is not downstream of A — should stay unskipped
    svc.markDownstreamNodesAsSkipped('A', edges, skipped);
    expect(skipped.has('C')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findDisconnectedNodes
// ---------------------------------------------------------------------------

describe('GraphService.findDisconnectedNodes', () => {
  it('returns empty array when all nodes connect to the output', () => {
    const nodes = [node('A'), node('B', 'core.output')];
    const edges = [edge('e1', 'A', 'B')];
    expect(GraphService.findDisconnectedNodes(nodes, edges, 'core.output')).toEqual([]);
  });

  it('returns disconnected nodes that cannot reach the output', () => {
    const nodes = [node('A'), node('B'), node('C', 'core.output')];
    // A → C (connected), B is isolated
    const edges = [edge('e1', 'A', 'C')];
    const result = GraphService.findDisconnectedNodes(nodes, edges, 'core.output');
    expect(result).toContain('B');
    expect(result).not.toContain('A');
  });

  it('returns all non-output nodes when there are no output nodes', () => {
    const nodes = [node('A'), node('B')];
    const result = GraphService.findDisconnectedNodes(nodes, [], 'core.output');
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('returns empty array for empty node list', () => {
    expect(GraphService.findDisconnectedNodes([], [], 'core.output')).toEqual([]);
  });
});
