import type { PrimitiveNode, PrimitiveEdge } from './types';

// Kahn's algorithm — ported from GraphService.topologicalSort
export function topologicalSort(nodes: PrimitiveNode[], edges: PrimitiveEdge[]): string[] {
  const nodeIds = nodes.map((n) => n.referenceId);
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    adjList.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of edges) {
    const from = edge[0];
    const to = edge[1];

    const fromList = adjList.get(from);
    if (fromList && adjList.has(to)) {
      fromList.push(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result: string[] = [];
  let current = queue.shift();
  while (current !== undefined) {
    result.push(current);

    for (const neighbor of adjList.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
    current = queue.shift();
  }

  if (result.length !== nodeIds.length) {
    throw new Error('Flow contains cycles and cannot be executed');
  }

  return result;
}
