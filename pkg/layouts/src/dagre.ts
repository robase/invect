/**
 * Dagre Layout Implementation
 */

import dagre from '@dagrejs/dagre';
import type { LayoutNode, LayoutEdge } from './types';

export interface DagreLayoutOptions {
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  /** Maximum width before wrapping to a new row (only applies to LR/RL layouts) */
  maxWidth?: number;
  /** Vertical spacing between wrapped rows */
  rowSpacing?: number;
}

const DEFAULT_OPTIONS: Required<DagreLayoutOptions> = {
  direction: 'LR',
  nodeSpacing: 70,
  rankSpacing: 100,
  nodeWidth: 200,
  nodeHeight: 60,
  maxWidth: 0, // 0 means no wrapping
  rowSpacing: 150,
};

/**
 * Wrap nodes to new rows when the layout exceeds maxWidth.
 * Groups nodes by their X position into "columns" and wraps when cumulative width exceeds threshold.
 * Each row independently grows to maxWidth before wrapping to the next row.
 * Only applies to LR/RL layouts.
 */
export function applyRowWrapping<N extends LayoutNode>(
  nodes: N[],
  maxWidth: number,
  rowSpacing: number,
  nodeHeight: number,
): N[] {
  if (maxWidth <= 0 || nodes.length === 0) {
    return nodes;
  }

  // Calculate current bounds
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const maxX = Math.max(...nodes.map((n) => n.position.x + (n.measured?.width ?? n.width ?? 200)));
  const currentWidth = maxX - minX;

  // No wrapping needed if within bounds
  if (currentWidth <= maxWidth) {
    return nodes;
  }

  // Group nodes into columns based on their X position
  // Use a tolerance to group nodes that are roughly at the same X
  const tolerance = 50;
  const columns: Array<{ x: number; nodes: N[]; width: number }> = [];

  // Sort nodes by X position
  const sortedNodes = [...nodes].sort((a, b) => a.position.x - b.position.x);

  sortedNodes.forEach((node) => {
    const nodeX = node.position.x;
    // Find existing column within tolerance
    let foundColumn = columns.find((col) => Math.abs(col.x - nodeX) < tolerance);

    if (!foundColumn) {
      foundColumn = { x: nodeX, nodes: [], width: 0 };
      columns.push(foundColumn);
    }
    foundColumn.nodes.push(node);
  });

  // Sort columns by X position
  columns.sort((a, b) => a.x - b.x);

  // Calculate width for each column (distance to next column, or node width for last)
  for (let i = 0; i < columns.length; i++) {
    if (i < columns.length - 1) {
      // Width is distance to next column
      columns[i].width = columns[i + 1].x - columns[i].x;
    } else {
      // Last column: use max node width
      const maxNodeWidth = Math.max(
        ...columns[i].nodes.map((n) => n.measured?.width ?? n.width ?? 200),
      );
      columns[i].width = maxNodeWidth;
    }
  }

  // Determine which columns go on which row
  // Each row can grow to maxWidth independently
  const rowAssignments: number[] = [];
  let currentRowWidth = 0;
  let currentRow = 0;

  columns.forEach((col) => {
    const colWidth = col.width;

    // Check if adding this column would exceed maxWidth for THIS row
    // (only check if there's already content on this row)
    if (currentRowWidth > 0 && currentRowWidth + colWidth > maxWidth) {
      // Start a new row
      currentRow++;
      currentRowWidth = 0;
    }

    rowAssignments.push(currentRow);
    currentRowWidth += colWidth;
  });

  // If no wrapping occurred, return original
  if (currentRow === 0) {
    return nodes;
  }

  // Calculate row heights (max height of nodes in each row)
  const rowHeights: number[] = [];
  for (let row = 0; row <= currentRow; row++) {
    const rowNodes = columns
      .filter((_, i) => rowAssignments[i] === row)
      .flatMap((col) => col.nodes);

    if (rowNodes.length > 0) {
      const minY = Math.min(...rowNodes.map((n) => n.position.y));
      const maxY = Math.max(
        ...rowNodes.map((n) => n.position.y + (n.measured?.height ?? n.height ?? nodeHeight)),
      );
      rowHeights.push(maxY - minY);
    } else {
      rowHeights.push(nodeHeight);
    }
  }

  // Calculate the X offset for each row (to shift nodes back to the left)
  // For each row, we need to know the X position of the first column in that row
  const rowStartX: number[] = [];
  for (let row = 0; row <= currentRow; row++) {
    const firstColIndexInRow = rowAssignments.findIndex((r) => r === row);
    if (firstColIndexInRow >= 0) {
      rowStartX[row] = columns[firstColIndexInRow].x - minX;
    } else {
      rowStartX[row] = 0;
    }
  }

  // Apply position adjustments
  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    nodePositions.set(node.id, { ...node.position });
  });

  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
    const col = columns[colIndex];
    const row = rowAssignments[colIndex];

    // Calculate X offset: shift nodes back to start at minX for this row
    const xOffset = rowStartX[row];

    // Calculate Y offset for this row (stack rows vertically)
    let yOffset = 0;
    for (let r = 0; r < row; r++) {
      yOffset += rowHeights[r] + rowSpacing;
    }

    // Apply offsets to all nodes in this column
    col.nodes.forEach((node) => {
      const pos = nodePositions.get(node.id);
      if (pos) {
        pos.x = pos.x - xOffset;
        pos.y = pos.y + yOffset;
      }
    });
  }

  // Return nodes with updated positions
  return nodes.map((node) => {
    const updatedPos = nodePositions.get(node.id);
    if (updatedPos) {
      return {
        ...node,
        position: updatedPos,
      };
    }
    return node;
  });
}

/**
 * Detect skip edges: edges that bypass intermediate nodes
 * Example: In A -> B -> C with A -> C, the edge A -> C is a skip edge
 */
export function detectSkipEdges<E extends LayoutEdge>(edges: E[]): Set<string> {
  const skipEdges = new Set<string>();

  // Build adjacency list for outgoing edges
  const outgoing = new Map<string, Set<string>>();
  edges.forEach((edge) => {
    if (!outgoing.has(edge.source)) {
      outgoing.set(edge.source, new Set());
    }
    const sourceSet = outgoing.get(edge.source);
    if (sourceSet) {
      sourceSet.add(edge.target);
    }
  });

  // Check if there's a path from source to target using BFS
  const hasPath = (source: string, target: string, visited: Set<string>): boolean => {
    if (source === target) {
      return true;
    }
    if (visited.has(source)) {
      return false;
    }

    visited.add(source);
    const neighbors = outgoing.get(source);
    if (!neighbors) {
      return false;
    }

    for (const neighbor of neighbors) {
      if (hasPath(neighbor, target, visited)) {
        return true;
      }
    }
    return false;
  };

  // For each edge, check if there's a path through intermediate nodes
  edges.forEach((edge) => {
    const source = edge.source;
    const target = edge.target;

    // Check if source has other targets that eventually reach this target
    const sourceTargets = outgoing.get(source);
    if (sourceTargets && sourceTargets.size > 1) {
      // Check if there's an alternate path from source to target
      for (const intermediate of sourceTargets) {
        if (intermediate === target) {
          continue;
        }

        // Check if intermediate reaches target (direct or via more hops)
        if (hasPath(intermediate, target, new Set([source]))) {
          skipEdges.add(edge.id);
          break;
        }
      }
    }
  });

  return skipEdges;
}

/**
 * Apply vertical offsets to nodes when skip edges would overlap with direct paths
 * This spreads out nodes vertically when they would otherwise be in a straight line
 */
export function applyVerticalOffsetForSkipEdges<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  skipEdges: Set<string>,
): N[] {
  if (skipEdges.size === 0) {
    return nodes;
  }

  // Create position map for quick lookup
  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    nodePositions.set(node.id, { ...node.position });
  });

  // Find intermediate nodes that are between skip edge endpoints
  // and apply vertical offset if they're at the same Y position
  const verticalOffset = 80; // Pixels to offset
  const processedNodes = new Set<string>();

  for (const edge of edges) {
    if (!skipEdges.has(edge.id)) {
      continue;
    }

    const sourcePos = nodePositions.get(edge.source);
    const targetPos = nodePositions.get(edge.target);
    if (!sourcePos || !targetPos) {
      continue;
    }

    // Find nodes that are between source and target horizontally
    // and at approximately the same Y position
    const minX = Math.min(sourcePos.x, targetPos.x);
    const maxX = Math.max(sourcePos.x, targetPos.x);
    const avgY = (sourcePos.y + targetPos.y) / 2;
    const yTolerance = 30; // Consider nodes "at same Y" if within this tolerance

    nodes.forEach((node) => {
      if (node.id === edge.source || node.id === edge.target) {
        return;
      }
      if (processedNodes.has(node.id)) {
        return;
      }

      const pos = nodePositions.get(node.id);
      if (!pos) {
        return;
      }

      // Check if this node is between the skip edge endpoints
      const isBetweenX = pos.x > minX && pos.x < maxX;
      const isAtSameY = Math.abs(pos.y - avgY) < yTolerance;

      if (isBetweenX && isAtSameY) {
        // Offset this intermediate node downward to create visual separation
        pos.y += verticalOffset;
        processedNodes.add(node.id);
      }
    });
  }

  // Apply updated positions
  return nodes.map((node) => {
    const updatedPos = nodePositions.get(node.id);
    if (updatedPos) {
      return {
        ...node,
        position: updatedPos,
      };
    }
    return node;
  });
}

/**
 * Apply vertical offsets for nodes with multiple outputs (2+ output handles)
 * Targets from different output handles are evenly spaced and centered around the source node's Y position
 */
export function applyMultiOutputBranchOffsets<N extends LayoutNode, E extends LayoutEdge>(
  layoutedNodes: N[],
  edges: E[],
  _originalNodes?: N[],
): N[] {
  // Group edges by source node
  const edgesBySource = new Map<string, E[]>();
  edges.forEach((edge) => {
    if (!edgesBySource.has(edge.source)) {
      edgesBySource.set(edge.source, []);
    }
    const sourceEdges = edgesBySource.get(edge.source);
    if (sourceEdges) {
      sourceEdges.push(edge);
    }
  });

  // Find nodes with multiple distinct output handles
  const multiOutputNodes: Array<{ nodeId: string; handleGroups: Map<string, string[]> }> = [];

  edgesBySource.forEach((nodeEdges, sourceId) => {
    // Group edges by source handle
    const handleGroups = new Map<string, string[]>();
    nodeEdges.forEach((edge) => {
      const handle = edge.sourceHandle || 'output'; // Default handle name
      if (!handleGroups.has(handle)) {
        handleGroups.set(handle, []);
      }
      const handleTargets = handleGroups.get(handle);
      if (handleTargets) {
        handleTargets.push(edge.target);
      }
    });

    // Only process if node has 2+ distinct output handles
    if (handleGroups.size >= 2) {
      multiOutputNodes.push({ nodeId: sourceId, handleGroups });
    }
  });

  if (multiOutputNodes.length === 0) {
    return layoutedNodes;
  }

  // Create position map for quick lookup
  const nodePositions = new Map<string, { x: number; y: number }>();
  layoutedNodes.forEach((node) => {
    nodePositions.set(node.id, { ...node.position });
  });

  const branchSpacing = 80; // Vertical spacing between branch groups

  for (const { nodeId, handleGroups } of multiOutputNodes) {
    const sourcePos = nodePositions.get(nodeId);
    if (!sourcePos) {
      continue;
    }

    // Get actual source node height for correct centering
    const sourceNode = layoutedNodes.find((n) => n.id === nodeId);
    const sourceHeight = sourceNode?.measured?.height ?? sourceNode?.height ?? 60;

    // Get all handles sorted in reverse alphabetical order
    // This puts "true" before "false", "output_1" before "output_0", etc.
    // which results in the first handle being at the top (lower Y)
    const handles = Array.from(handleGroups.keys()).sort().reverse();
    const numBranches = handles.length;

    // Calculate the total height needed and center offset
    // Center branches around the source node's vertical center
    const totalSpan = (numBranches - 1) * branchSpacing;
    const sourceCenterY = sourcePos.y + sourceHeight / 2;
    const startY = sourceCenterY - totalSpan / 2;

    // Position each branch group
    handles.forEach((handle, branchIndex) => {
      const targetY = startY + branchIndex * branchSpacing;
      const targets = handleGroups.get(handle) || [];

      targets.forEach((targetId) => {
        const targetPos = nodePositions.get(targetId);
        if (targetPos) {
          targetPos.y = targetY;
        }
      });
    });
  }

  // Apply updated positions
  return layoutedNodes.map((node) => {
    const updatedPos = nodePositions.get(node.id);
    if (updatedPos) {
      return {
        ...node,
        position: updatedPos,
      };
    }
    return node;
  });
}

/**
 * @deprecated Use applyMultiOutputBranchOffsets instead
 * Kept for backwards compatibility
 */
export function applyIfElseBranchOffsets<N extends LayoutNode, E extends LayoutEdge>(
  layoutedNodes: N[],
  edges: E[],
  originalNodes: N[],
): N[] {
  return applyMultiOutputBranchOffsets(layoutedNodes, edges, originalNodes);
}

/**
 * Apply dagre layout algorithm with post-processing for skip edges and multi-output branches
 */
export function applyDagreLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: DagreLayoutOptions = {},
): N[] {
  if (nodes.length === 0) {
    return nodes;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create dagre graph
  const g = new dagre.graphlib.Graph();

  // Set graph configuration
  g.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSpacing,
    ranksep: opts.rankSpacing,
    align: 'UL',
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph
  nodes.forEach((node) => {
    g.setNode(node.id, {
      width: node.measured?.width ?? node.width ?? opts.nodeWidth,
      height: node.measured?.height ?? node.height ?? opts.nodeHeight,
    });
  });

  // Detect skip edges for minlen adjustment
  const skipEdges = detectSkipEdges(edges);

  // Add edges to graph with minlen for skip edges to encourage vertical spread
  edges.forEach((edge) => {
    const isSkipEdge = skipEdges.has(edge.id);
    g.setEdge(edge.source, edge.target, {
      // Skip edges get minlen 2 to encourage dagre to route them differently
      minlen: isSkipEdge ? 2 : 1,
    });
  });

  // Calculate layout
  dagre.layout(g);

  // Apply calculated positions to nodes
  let layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      const width = node.measured?.width ?? node.width ?? opts.nodeWidth;
      const height = node.measured?.height ?? node.height ?? opts.nodeHeight;

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        },
      };
    }
    return node;
  });

  // Post-process: add vertical offsets to nodes involved in skip edges
  // to prevent edge overlap when nodes are in a straight line
  layoutedNodes = applyVerticalOffsetForSkipEdges(layoutedNodes, edges, skipEdges);

  // Post-process: apply vertical offsets for multi-output branch nodes
  // Branches are evenly spaced and centered around the source node
  layoutedNodes = applyMultiOutputBranchOffsets(layoutedNodes, edges);

  // Post-process: wrap to new rows if layout exceeds maxWidth (LR/RL layouts only)
  if (opts.maxWidth > 0 && (opts.direction === 'LR' || opts.direction === 'RL')) {
    layoutedNodes = applyRowWrapping(
      layoutedNodes,
      opts.maxWidth,
      opts.rowSpacing,
      opts.nodeHeight,
    );
  }

  return layoutedNodes;
}
