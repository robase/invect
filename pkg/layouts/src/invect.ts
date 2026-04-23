/**
 * Invect Layout Implementation
 *
 * An opinionated hierarchical layout tailored to Invect flows. Inspired by
 * n8n's canvas layout algorithm but adapted to Invect's graph shape:
 *   - No sub-nodes (agent tools live inside node params, not as separate graph nodes)
 *   - No sticky notes
 *   - Multi-output branching via `if_else` / `switch` source handles
 *
 * Pipeline:
 *   1. Decompose into disconnected components.
 *   2. Lay out each component LR with dagre (dimension-aware).
 *   3. Post-process each component:
 *        a. Center multi-output branch targets around the branch source.
 *        b. Straighten linear chains (source with single child, target with single parent).
 *        c. Separate nodes that lie on a skip-edge path.
 *   4. Stack components vertically with a configurable gap.
 *   5. Snap everything to the grid.
 */

import dagre from '@dagrejs/dagre';
import type { LayoutNode, LayoutEdge } from './types';

export interface InvectLayoutOptions {
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  /** Vertical gap between disconnected components. */
  componentSpacing?: number;
  /** Grid size for final snapping. 0 disables snapping. */
  gridSize?: number;
  /** Attempt to straighten linear chains (single-parent/single-child runs). */
  straightenChains?: boolean;
  /** Nudge intermediate nodes sitting on a skip-edge path. */
  separateSkipEdges?: boolean;
}

const DEFAULTS: Required<InvectLayoutOptions> = {
  direction: 'LR',
  nodeSpacing: 80,
  rankSpacing: 120,
  nodeWidth: 200,
  nodeHeight: 60,
  componentSpacing: 120,
  gridSize: 20,
  straightenChains: true,
  separateSkipEdges: true,
};

// ---------------------------------------------------------------------------
// Helpers: graph traversal
// ---------------------------------------------------------------------------

interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function nodeDims(
  node: LayoutNode,
  fallbackW: number,
  fallbackH: number,
): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? fallbackW,
    height: node.measured?.height ?? node.height ?? fallbackH,
  };
}

function findComponents<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
): Array<Set<string>> {
  const parent = new Map<string, string>();
  nodes.forEach((n) => parent.set(n.id, n.id));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    // Path compression
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(ra, rb);
    }
  };

  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target);
    }
  }

  const groups = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const root = find(id);
    let set = groups.get(root);
    if (!set) {
      set = new Set();
      groups.set(root, set);
    }
    set.add(id);
  }

  return Array.from(groups.values());
}

function layoutComponent<N extends LayoutNode, E extends LayoutEdge>(
  componentIds: Set<string>,
  nodes: N[],
  edges: E[],
  opts: Required<InvectLayoutOptions>,
): LaidOutNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSpacing,
    ranksep: opts.rankSpacing,
    align: 'UL',
  });
  g.setDefaultEdgeLabel(() => ({}));

  const dims = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    if (!componentIds.has(node.id)) {
      continue;
    }
    const { width, height } = nodeDims(node, opts.nodeWidth, opts.nodeHeight);
    dims.set(node.id, { width, height });
    g.setNode(node.id, { width, height });
  }

  for (const edge of edges) {
    if (!componentIds.has(edge.source) || !componentIds.has(edge.target)) {
      continue;
    }
    g.setEdge(edge.source, edge.target, {});
  }

  dagre.layout(g);

  const laidOut: LaidOutNode[] = [];
  for (const id of componentIds) {
    const node = g.node(id);
    if (!node) {
      continue;
    }
    const d = dims.get(id) ?? { width: opts.nodeWidth, height: opts.nodeHeight };
    laidOut.push({
      id,
      x: node.x - d.width / 2,
      y: node.y - d.height / 2,
      width: d.width,
      height: d.height,
    });
  }

  return laidOut;
}

// ---------------------------------------------------------------------------
// Post-processing passes
// ---------------------------------------------------------------------------

function centerMultiOutputBranches<E extends LayoutEdge>(laidOut: LaidOutNode[], edges: E[]): void {
  const byId = new Map(laidOut.map((n) => [n.id, n]));

  // Group edges by source, then by source handle
  const bySource = new Map<string, Map<string, string[]>>();
  for (const edge of edges) {
    const src = edge.source;
    const handle = edge.sourceHandle ?? '__default__';
    if (!bySource.has(src)) {
      bySource.set(src, new Map());
    }
    const handleMap = bySource.get(src) as Map<string, string[]>;
    if (!handleMap.has(handle)) {
      handleMap.set(handle, []);
    }
    (handleMap.get(handle) as string[]).push(edge.target);
  }

  const branchSpacing = 90;

  for (const [sourceId, handleMap] of bySource) {
    if (handleMap.size < 2) {
      continue;
    } // Not a multi-handle branch
    const source = byId.get(sourceId);
    if (!source) {
      continue;
    }

    // Sort handles: alpha, then reverse so "true" sits above "false", "case_a" above "case_b", etc.
    const handles = Array.from(handleMap.keys()).sort().reverse();
    const totalSpan = (handles.length - 1) * branchSpacing;
    const sourceCenterY = source.y + source.height / 2;
    const startY = sourceCenterY - totalSpan / 2;

    handles.forEach((handle, idx) => {
      const targets = handleMap.get(handle) ?? [];
      const targetY = startY + idx * branchSpacing;
      for (const targetId of targets) {
        const target = byId.get(targetId);
        if (!target) {
          continue;
        }
        // Align target center to targetY
        target.y = targetY - target.height / 2;
      }
    });
  }
}

function straightenLinearChains<E extends LayoutEdge>(laidOut: LaidOutNode[], edges: E[]): void {
  const byId = new Map(laidOut.map((n) => [n.id, n]));

  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  for (const edge of edges) {
    outCount.set(edge.source, (outCount.get(edge.source) ?? 0) + 1);
    inCount.set(edge.target, (inCount.get(edge.target) ?? 0) + 1);
  }

  // For every edge where the source has exactly one outgoing and the target
  // has exactly one incoming, align the target's vertical center to the source's.
  // Sorted by source X so upstream alignments cascade downstream.
  const candidates = edges
    .filter((e) => (outCount.get(e.source) ?? 0) === 1 && (inCount.get(e.target) ?? 0) === 1)
    .map((e) => ({ edge: e, sourceX: byId.get(e.source)?.x ?? 0 }))
    .sort((a, b) => a.sourceX - b.sourceX);

  for (const { edge } of candidates) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const sourceCenterY = source.y + source.height / 2;
    target.y = sourceCenterY - target.height / 2;
  }
}

/**
 * When a branch source has multiple outgoing paths that eventually merge,
 * and one path is shorter than another, dagre clusters the short path's nodes
 * near the source — leaving a visible X gap before the merge point.
 *
 * This pass detects those "diamond" patterns and redistributes the chain's X
 * coordinates evenly across the span between the fork and the merge. For the
 * longest branch this is a no-op; for shorter branches it spreads them out so
 * they visually balance the longer path.
 */
function distributeShortBranches<E extends LayoutEdge>(laidOut: LaidOutNode[], edges: E[]): void {
  const byId = new Map(laidOut.map((n) => [n.id, n]));

  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outAdj.has(edge.source)) {
      outAdj.set(edge.source, []);
    }
    (outAdj.get(edge.source) as string[]).push(edge.target);
    if (!inAdj.has(edge.target)) {
      inAdj.set(edge.target, []);
    }
    (inAdj.get(edge.target) as string[]).push(edge.source);
  }

  for (const [sourceId, children] of outAdj) {
    if (children.length < 2) {
      continue;
    }
    const source = byId.get(sourceId);
    if (!source) {
      continue;
    }

    for (const childId of children) {
      if ((inAdj.get(childId)?.length ?? 0) !== 1) {
        continue;
      }

      // Walk a linear chain (1-in, 1-out) from the branch child forward,
      // stopping at the first merge point (node with >1 incoming) or dead-end.
      const chain: string[] = [childId];
      const visited = new Set<string>([childId]);
      let cursor = childId;
      let mergeId: string | null = null;

      while (true) {
        const out = outAdj.get(cursor) ?? [];
        if (out.length !== 1) {
          break;
        }
        const next = out[0];
        if (visited.has(next)) {
          break;
        }
        const nextIn = inAdj.get(next)?.length ?? 0;
        if (nextIn !== 1) {
          mergeId = next;
          break;
        }
        chain.push(next);
        visited.add(next);
        cursor = next;
      }

      if (!mergeId) {
        continue;
      }
      const merge = byId.get(mergeId);
      if (!merge) {
        continue;
      }

      const sourceCx = source.x + source.width / 2;
      const mergeCx = merge.x + merge.width / 2;
      const span = mergeCx - sourceCx;
      if (span <= 0) {
        continue;
      }

      const k = chain.length;
      for (let i = 0; i < k; i++) {
        const node = byId.get(chain[i]);
        if (!node) {
          continue;
        }
        const newCx = sourceCx + ((i + 1) / (k + 1)) * span;
        node.x = newCx - node.width / 2;
      }
    }
  }
}

function separateSkipEdges<E extends LayoutEdge>(laidOut: LaidOutNode[], edges: E[]): void {
  const byId = new Map(laidOut.map((n) => [n.id, n]));

  // Build outgoing adjacency for reachability check
  const outgoing = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, new Set());
    }
    (outgoing.get(edge.source) as Set<string>).add(edge.target);
  }

  const reaches = (start: string, goal: string, visited: Set<string>): boolean => {
    if (start === goal) {
      return true;
    }
    if (visited.has(start)) {
      return false;
    }
    visited.add(start);
    const out = outgoing.get(start);
    if (!out) {
      return false;
    }
    for (const next of out) {
      if (reaches(next, goal, visited)) {
        return true;
      }
    }
    return false;
  };

  // Identify skip edges: A -> C exists AND A -> (X -> ...) -> C exists
  const skipEdges = new Set<E>();
  for (const edge of edges) {
    const out = outgoing.get(edge.source);
    if (!out || out.size < 2) {
      continue;
    }
    for (const intermediate of out) {
      if (intermediate === edge.target) {
        continue;
      }
      if (reaches(intermediate, edge.target, new Set([edge.source]))) {
        skipEdges.add(edge);
        break;
      }
    }
  }

  if (skipEdges.size === 0) {
    return;
  }

  const verticalOffset = 60;
  const yTolerance = 30;
  const processed = new Set<string>();

  for (const edge of skipEdges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const minX = Math.min(source.x, target.x);
    const maxX = Math.max(source.x, target.x);
    const avgY = (source.y + target.y + source.height / 2 + target.height / 2) / 2;

    for (const node of laidOut) {
      if (node.id === edge.source || node.id === edge.target) {
        continue;
      }
      if (processed.has(node.id)) {
        continue;
      }
      const nodeCenterY = node.y + node.height / 2;
      if (node.x > minX && node.x < maxX && Math.abs(nodeCenterY - avgY) < yTolerance) {
        node.y += verticalOffset;
        processed.add(node.id);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bounding box & stacking
// ---------------------------------------------------------------------------

function computeBoundingBox(laidOut: LaidOutNode[]): BoundingBox {
  if (laidOut.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of laidOut) {
    if (n.x < minX) {
      minX = n.x;
    }
    if (n.y < minY) {
      minY = n.y;
    }
    if (n.x + n.width > maxX) {
      maxX = n.x + n.width;
    }
    if (n.y + n.height > maxY) {
      maxY = n.y + n.height;
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function translate(laidOut: LaidOutNode[], dx: number, dy: number): void {
  for (const n of laidOut) {
    n.x += dx;
    n.y += dy;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Apply the Invect-specific layout: dagre LR per-component, with post-processing
 * passes for branch centering, chain straightening, skip-edge separation, and
 * grid snapping, then vertical stacking of disconnected components.
 */
export function applyInvectLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: InvectLayoutOptions = {},
): N[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const opts: Required<InvectLayoutOptions> = { ...DEFAULTS, ...options };

  const components = findComponents(nodes, edges);
  // Sort so larger / earlier components render first (stable visual ordering)
  components.sort((a, b) => b.size - a.size);

  // Post-processing passes only make sense for horizontal flow (LR/RL);
  // for TB/BT, dagre's default vertical layout is already reasonable.
  const isHorizontal = opts.direction === 'LR' || opts.direction === 'RL';

  const componentLayouts: LaidOutNode[][] = components.map((componentIds) => {
    const laid = layoutComponent(componentIds, nodes, edges, opts);
    if (isHorizontal) {
      // Order matters: center branch targets first so they anchor new Y values,
      // then straighten chains so those Ys cascade to descendants,
      // then redistribute X for branches that dagre clustered near the fork.
      centerMultiOutputBranches(laid, edges);
      if (opts.straightenChains) {
        straightenLinearChains(laid, edges);
      }
      distributeShortBranches(laid, edges);
      if (opts.separateSkipEdges) {
        separateSkipEdges(laid, edges);
      }
    }
    return laid;
  });

  // Stack components vertically
  let cursorY = 0;
  const byId = new Map<string, LaidOutNode>();
  for (const laid of componentLayouts) {
    if (laid.length === 0) {
      continue;
    }
    const bbox = computeBoundingBox(laid);
    // Normalize: top-left of each component starts at (0, cursorY)
    translate(laid, -bbox.x, cursorY - bbox.y);
    cursorY += bbox.height + opts.componentSpacing;
    for (const n of laid) {
      byId.set(n.id, n);
    }
  }

  // Snap to grid
  if (opts.gridSize > 0) {
    const g = opts.gridSize;
    for (const n of byId.values()) {
      n.x = Math.round(n.x / g) * g;
      n.y = Math.round(n.y / g) * g;
    }
  }

  return nodes.map((node) => {
    const laid = byId.get(node.id);
    if (!laid) {
      return node;
    }
    return { ...node, position: { x: laid.x, y: laid.y } };
  });
}
