// Layout utilities for automatically positioning nodes to avoid overlaps
import type { Node, Edge } from '@xyflow/react';
import {
  applyDagreLayout as applyDagreLayoutFromPackage,
  applyElkLayout as applyElkLayoutFromPackage,
  type ElkLayoutNode,
} from '@invect/layouts';

export interface Position {
  x: number;
  y: number;
}

// Layout algorithm options
export type LayoutAlgorithm = 'dagre' | 'elkjs';

export interface LayoutOptions {
  algorithm: LayoutAlgorithm;
  direction?: 'TB' | 'BT' | 'LR' | 'RL'; // Top-Bottom, Bottom-Top, Left-Right, Right-Left
  nodeSpacing?: number;
  rankSpacing?: number;
  /** Maximum width before wrapping to a new row (only applies to LR/RL layouts, 0 = no wrapping) */
  maxWidth?: number;
  /** Vertical spacing between wrapped rows */
  rowSpacing?: number;
}

// Define default layout options if not already defined elsewhere
// These values are examples; adjust them as needed.
const defaultLayoutOptions = {
  nodeWidth: 200,
  nodeHeight: 60,
  nodeSpacing: 70, // Default for dagre nodesep - increased for more vertical spacing
  rankSpacing: 100, // Default for dagre ranksep
  maxWidth: 2000, // Wrap to new row if layout exceeds this width
  rowSpacing: 150, // Vertical spacing between wrapped rows
};

/**
 * Derive explicit source handle ordering from node params.
 * This ensures ELK gets deterministic port positions matching the rendered
 * handle order, regardless of edge iteration order.
 */
function deriveSourceHandles(
  node: Node,
): Array<{ id: string; type: 'source'; position: 'right' }> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = node.data as Record<string, any> | undefined;
  const nodeType = data?.type ?? node.type;

  if (nodeType === 'core.switch' && Array.isArray(data?.params?.cases)) {
    const cases = data.params.cases as Array<{ slug: string }>;
    return [
      ...cases.map((c) => ({ id: c.slug, type: 'source' as const, position: 'right' as const })),
      { id: 'default', type: 'source' as const, position: 'right' as const },
    ];
  }

  if (nodeType === 'core.if_else') {
    return [
      { id: 'true_output', type: 'source' as const, position: 'right' as const },
      { id: 'false_output', type: 'source' as const, position: 'right' as const },
    ];
  }

  return undefined;
}

/**
 * Main layout function that applies the selected algorithm
 */
export const applyLayout = async (
  nodes: Node[],
  edges: Edge[],
  algorithm: LayoutAlgorithm,
  direction: 'TB' | 'BT' | 'LR' | 'RL' = 'LR',
  options?: LayoutOptions,
): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  switch (algorithm) {
    case 'dagre': {
      // Use shared layout utility from @invect/layouts
      const layoutedNodes = applyDagreLayoutFromPackage(nodes, edges, {
        direction,
        nodeSpacing: options?.nodeSpacing ?? defaultLayoutOptions.nodeSpacing,
        rankSpacing: options?.rankSpacing ?? defaultLayoutOptions.rankSpacing,
        nodeWidth: defaultLayoutOptions.nodeWidth,
        nodeHeight: defaultLayoutOptions.nodeHeight,
        maxWidth: options?.maxWidth ?? defaultLayoutOptions.maxWidth,
        rowSpacing: options?.rowSpacing ?? defaultLayoutOptions.rowSpacing,
      });
      return { nodes: layoutedNodes as Node[], edges };
    }
    case 'elkjs': {
      // Enrich branching nodes with explicit source handle ordering so ELK
      // places ports in the correct top-to-bottom order (matching the rendered handles).
      const enrichedNodes = nodes.map((node) => {
        const sourceHandles = deriveSourceHandles(node);
        if (sourceHandles) {
          return { ...node, sourceHandles } as ElkLayoutNode;
        }
        return node;
      }) as ElkLayoutNode[];

      // Use ElkJS layout with port/handle support for better edge routing
      // Let the @invect/layouts package defaults handle spacing and wrapping
      const elkDirection =
        direction === 'LR'
          ? 'RIGHT'
          : direction === 'RL'
            ? 'LEFT'
            : direction === 'TB'
              ? 'DOWN'
              : 'UP';
      const layoutedNodes = await applyElkLayoutFromPackage(enrichedNodes, edges, {
        direction: elkDirection,
        // Only pass nodeWidth/nodeHeight, let package defaults handle everything else
        nodeWidth: defaultLayoutOptions.nodeWidth,
        nodeHeight: defaultLayoutOptions.nodeHeight,
      });
      return { nodes: layoutedNodes as Node[], edges };
    }
    default:
      return { nodes, edges }; // No layout applied
  }
};
