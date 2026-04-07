/**
 * ElkJS Layout Implementation
 *
 * Based on the React Flow elkjs-multiple-handles example.
 * Uses a layered algorithm similar to dagre but with better edge crossing minimization.
 */

import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import type { LayoutNode, LayoutEdge, ElkLayoutNode, LayoutHandle } from './types';

export interface ElkJsLayoutOptions {
  /** Layout direction */
  direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP';

  // === Within-layer spacing (vertical when direction is RIGHT) ===
  /** Base spacing between nodes in the same layer */
  nodeSpacing?: number;
  /** Spacing between edges running in parallel */
  edgeSpacing?: number;
  /** Spacing between edges and nodes in the same layer */
  edgeNodeSpacing?: number;

  // === Between-layer spacing (horizontal when direction is RIGHT) ===
  /** Spacing between layers (node to node) */
  nodeNodeBetweenLayersSpacing?: number;
  /** Spacing between edges and nodes between layers */
  edgeNodeBetweenLayersSpacing?: number;
  /** Spacing between parallel edges between layers */
  edgeEdgeBetweenLayersSpacing?: number;

  // === Component spacing ===
  /** Spacing between disconnected components */
  componentSpacing?: number;

  // === Wrapping options ===
  /**
   * Graph wrapping strategy - splits long graphs into chunks placed side by side
   * - OFF: No wrapping (default)
   * - SINGLE_EDGE: Allow wrapping where only single edges cross the cut
   * - MULTI_EDGE: Allow wrapping even with multiple edges crossing the cut
   */
  wrappingStrategy?: 'OFF' | 'SINGLE_EDGE' | 'MULTI_EDGE';
  /**
   * Cutting strategy - how to determine where to split the graph
   * - MSD: Minimum sum of deltas (default) - balances chunk sizes
   * - ARD: Aspect ratio driven - tries to achieve target aspect ratio
   * - MANUAL: Use manually specified cuts
   */
  wrappingCuttingStrategy?: 'MSD' | 'ARD' | 'MANUAL';
  /** Target aspect ratio (width/height) when using ARD cutting strategy */
  aspectRatio?: number;
  /** Additional spacing for edges that wrap around */
  wrappingAdditionalEdgeSpacing?: number;
  /**
   * Minimum graph width (node edge to node edge) before wrapping is applied.
   * If the unwrapped graph width is less than this value, wrapping is disabled.
   * Default: 1400 (pixels)
   */
  minWidthForWrapping?: number;

  // === Alignment ===
  /**
   * Alignment of nodes relative to other nodes in the same layer
   * - AUTOMATIC: Let ELK decide (default)
   * - LEFT/TOP: Align to start
   * - RIGHT/BOTTOM: Align to end
   * - CENTER: Center alignment
   */
  alignment?: 'AUTOMATIC' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'CENTER';

  // === Default node dimensions ===
  /** Default node width if not specified */
  nodeWidth?: number;
  /** Default node height if not specified */
  nodeHeight?: number;
}

const DEFAULT_ELK_OPTIONS: ElkJsLayoutOptions = {
  // direction: 'RIGHT',
  // // Within-layer spacing
  nodeSpacing: 60, // Vertical space between nodes in same layer

  edgeSpacing: 0, // Space between edges and nodes in same layer
  // // Between-layer spacing
  edgeNodeSpacing: 0,
  nodeNodeBetweenLayersSpacing: 100, // Horizontal space between layers (node-to-node)
  // edgeNodeBetweenLayersSpacing: 0, // Space between edges and nodes between layers
  edgeEdgeBetweenLayersSpacing: 100, // Space between edges between layers
  // Component spacing
  // componentSpacing: 200, // Space between disconnected graph components
  // Wrapping
  wrappingStrategy: 'SINGLE_EDGE', // Allow wrapping with single edges crossing the cut
  wrappingCuttingStrategy: 'MSD', // Aspect ratio driven
  aspectRatio: 13 / 9, // Target aspect ratio (16:10 widescreen-ish)
  minWidthForWrapping: 2300, // Only wrap if graph width exceeds this value
  wrappingAdditionalEdgeSpacing: 100, // Extra spacing for wrapped edges
  // Alignment
  // alignment: "CENTER", // Center nodes within each layer
  // Node dimensions
  nodeWidth: 240,
  nodeHeight: 60,
};

// Singleton ELK instance
const elk = new ELK();

/**
 * Apply ElkJS layout algorithm with port/handle support.
 * This provides a hierarchical layout similar to dagre but with better edge routing.
 *
 * Based on the React Flow elkjs-multiple-handles example:
 * - Uses FIXED_ORDER port constraints to reduce edge crossings
 * - Configures ports on WEST (inputs) and EAST (outputs) sides
 * - Uses SIMPLE node placement strategy for cleaner layouts
 */
export async function applyElkLayout<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
  options: ElkJsLayoutOptions = {},
): Promise<N[]> {
  if (nodes.length === 0) {
    return nodes;
  }

  const opts = { ...DEFAULT_ELK_OPTIONS, ...options };

  // ELK layout options for the root graph
  // See: https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/spacingdocumentation.html
  // See: https://eclipse.dev/elk/reference/options.html
  const layoutOptions: Record<string, string> = {
    // Algorithm selection
    'elk.algorithm': 'layered',
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- merged with DEFAULT_ELK_OPTIONS
    'elk.direction': opts.direction!,

    // Node placement strategy - SIMPLE provides cleaner, more predictable layouts
    'elk.layered.nodePlacement.strategy': 'SIMPLE',

    // === Within-layer spacing (vertical when direction is RIGHT) ===
    // Space between nodes in the same layer
    'elk.spacing.nodeNode': String(opts.nodeSpacing),
    // Space between edges running in parallel within a layer
    'elk.spacing.edgeEdge': String(opts.edgeSpacing),
    // Space between edges and nodes within a layer
    'elk.spacing.edgeNode': String(opts.edgeNodeSpacing),

    // === Between-layer spacing (horizontal when direction is RIGHT) ===
    // Space between nodes in adjacent layers
    'elk.layered.spacing.nodeNodeBetweenLayers': String(opts.nodeNodeBetweenLayersSpacing),
    // Space between edges and nodes in adjacent layers (controls horizontal edge routing room)
    'elk.layered.spacing.edgeNodeBetweenLayers': String(opts.edgeNodeBetweenLayersSpacing),
    // Space between parallel edges between layers
    'elk.layered.spacing.edgeEdgeBetweenLayers': String(opts.edgeEdgeBetweenLayersSpacing),

    // === Component spacing ===
    // Space between disconnected components of the graph
    'elk.spacing.componentComponent': String(opts.componentSpacing),

    // === Wrapping options ===
    // See: https://eclipse.dev/elk/reference/groups/org-eclipse-elk-layered-wrapping.html
    // Strategy: OFF, SINGLE_EDGE, or MULTI_EDGE
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- merged with DEFAULT_ELK_OPTIONS
    'elk.layered.wrapping.strategy': opts.wrappingStrategy!,
    // Cutting strategy: MSD (minimum sum of deltas), ARD (aspect ratio driven), or MANUAL
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- merged with DEFAULT_ELK_OPTIONS
    'elk.layered.wrapping.cutting.strategy': opts.wrappingCuttingStrategy!,
    // Target aspect ratio (width/height) - used by ARD cutting strategy
    'elk.aspectRatio': String(opts.aspectRatio),
    // Additional spacing for wrapped edges
    'elk.layered.wrapping.additionalEdgeSpacing': String(opts.wrappingAdditionalEdgeSpacing),

    // === Alignment ===
    // Alignment of nodes within each layer (AUTOMATIC, LEFT, RIGHT, TOP, BOTTOM, CENTER)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- merged with DEFAULT_ELK_OPTIONS
    'elk.alignment': opts.alignment!,

    // === Model order ===
    // When crossing minimization has ties (e.g. all branches converge to one node),
    // use the model order of edges to break ties. This ensures branch targets are
    // placed in the same vertical order as their source handle positions.
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  };

  // First, collect all unique source and target handles per node from edges
  const nodeSourceHandles = new Map<string, Set<string>>();
  const nodeTargetHandles = new Map<string, Set<string>>();

  edges.forEach((edge) => {
    // Track source handles
    if (!nodeSourceHandles.has(edge.source)) {
      nodeSourceHandles.set(edge.source, new Set());
    }
    if (edge.sourceHandle) {
      nodeSourceHandles.get(edge.source)?.add(edge.sourceHandle);
    }

    // Track target handles
    if (!nodeTargetHandles.has(edge.target)) {
      nodeTargetHandles.set(edge.target, new Set());
    }
    if (edge.targetHandle) {
      nodeTargetHandles.get(edge.target)?.add(edge.targetHandle);
    }
  });

  // Build ELK graph structure
  const elkChildren: ElkNode[] = nodes.map((node) => {
    const width = node.measured?.width ?? node.width ?? opts.nodeWidth;
    const height = node.measured?.height ?? node.height ?? opts.nodeHeight;

    // Get handles from node data if available (React Flow pattern)
    const explicitTargetHandles: Array<{ id: string }> =
      (node as ElkLayoutNode).targetHandles ||
      (node.data?.targetHandles as Array<{ id: string }>) ||
      [];
    const explicitSourceHandles: Array<{ id: string }> =
      (node as ElkLayoutNode).sourceHandles ||
      (node.data?.sourceHandles as Array<{ id: string }>) ||
      [];

    // Combine explicit handles with handles discovered from edges
    const allTargetHandleIds = new Set<string>(explicitTargetHandles.map((h) => h.id));
    const allSourceHandleIds = new Set<string>(explicitSourceHandles.map((h) => h.id));

    // Add handles discovered from edges
    nodeTargetHandles.get(node.id)?.forEach((id) => allTargetHandleIds.add(id));
    nodeSourceHandles.get(node.id)?.forEach((id) => allSourceHandleIds.add(id));

    // Build ports array with properties for port side
    // This matches the React Flow elkjs example exactly:
    // https://reactflow.dev/examples/layout/elkjs
    //
    // IMPORTANT: Port IDs must be GLOBALLY UNIQUE across all nodes!
    // We prefix them with nodeId to ensure uniqueness, e.g., "nodeA-output" instead of just "output"
    // This allows ELK to correctly resolve which node's port an edge connects to.
    //
    // Target ports (inputs) on WEST side, source ports (outputs) on EAST side
    const targetPorts = Array.from(allTargetHandleIds).map((handleId) => ({
      id: `${node.id}-${handleId}`, // Make globally unique
      // ⚠️ it's important to let elk know on which side the port is
      properties: {
        side: 'WEST',
      },
    }));

    const sourcePorts = Array.from(allSourceHandleIds).map((handleId) => ({
      id: `${node.id}-${handleId}`, // Make globally unique
      properties: {
        side: 'EAST',
      },
    }));

    return {
      id: node.id,
      width,
      height,
      // ⚠️ we need to tell elk that the ports are fixed, in order to reduce edge crossings
      properties: {
        'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
      },
      // We pass the node id as a default port for edges without sourceHandle or targetHandle
      // It needs a side assigned for algorithms like mrtree that require all ports to have sides
      ports: [
        { id: node.id, properties: { side: 'EAST' } }, // Default port (output side)
        ...targetPorts,
        ...sourcePorts,
      ],
    };
  });

  // Build ELK edges with GLOBALLY UNIQUE port references
  // If edge has sourceHandle "output" from node "nodeA", reference becomes "nodeA-output"
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    // Use node-prefixed handle ID if provided, otherwise use source node ID directly
    sources: [edge.sourceHandle ? `${edge.source}-${edge.sourceHandle}` : edge.source],
    // Use node-prefixed handle ID if provided, otherwise use target node ID directly
    targets: [edge.targetHandle ? `${edge.target}-${edge.targetHandle}` : edge.target],
  }));

  // Sort edges by source port index so that considerModelOrder breaks ties correctly.
  // When branches converge to one node, the backward crossing-minimization sweep sees
  // equal barycenters; model order is the tiebreaker, so edges from the same source
  // must appear in port order (e.g. bug before feature before incident before default).
  const portGlobalIndex = new Map<string, number>();
  let portIdx = 0;
  for (const child of elkChildren) {
    if (child.ports) {
      for (const port of child.ports) {
        portGlobalIndex.set(port.id, portIdx++);
      }
    }
  }
  elkEdges.sort((a, b) => {
    const aIdx = portGlobalIndex.get(a.sources[0]) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = portGlobalIndex.get(b.sources[0]) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });

  // Build the complete graph
  const graph: ElkNode = {
    id: 'root',
    layoutOptions,
    children: elkChildren,
    edges: elkEdges,
  };

  try {
    // If minWidthForWrapping is set and wrapping is enabled, first check if wrapping is needed
    const shouldCheckWidth = opts.minWidthForWrapping && opts.wrappingStrategy !== 'OFF';

    if (shouldCheckWidth) {
      // First pass: run layout WITHOUT wrapping to measure natural width
      const noWrapLayoutOptions = {
        ...layoutOptions,
        'elk.layered.wrapping.strategy': 'OFF',
      };
      const noWrapGraph: ElkNode = {
        id: 'root',
        layoutOptions: noWrapLayoutOptions,
        children: elkChildren,
        edges: elkEdges,
      };

      const noWrapResult = await elk.layout(noWrapGraph);
      const graphWidth = noWrapResult.width ?? 0;

      // If width is under threshold, return the unwrapped layout
      if (graphWidth <= (opts.minWidthForWrapping ?? 0)) {
        const layoutedNodes = nodes.map((node) => {
          const layoutedNode = noWrapResult.children?.find((lgNode) => lgNode.id === node.id);
          return {
            ...node,
            position: {
              x: layoutedNode?.x ?? 0,
              y: layoutedNode?.y ?? 0,
            },
          };
        });
        return layoutedNodes;
      }
      // Otherwise, fall through to run with wrapping enabled
    }

    // Run ELK layout (with wrapping if enabled and width exceeded threshold)
    const layoutedGraph = await elk.layout(graph);

    // Apply calculated positions to nodes
    const layoutedNodes = nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((lgNode) => lgNode.id === node.id);

      return {
        ...node,
        position: {
          x: layoutedNode?.x ?? 0,
          y: layoutedNode?.y ?? 0,
        },
      };
    });

    return layoutedNodes;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('ElkJS layout failed:', error);
    // Return original nodes on failure
    return nodes;
  }
}

/**
 * Helper to convert React Flow nodes to ElkLayoutNodes with handle information
 * This extracts handle data from node definitions for proper port-based routing
 */
export function enrichNodesWithHandles<N extends LayoutNode>(
  nodes: N[],
  getHandles?: (node: N) => { sourceHandles: LayoutHandle[]; targetHandles: LayoutHandle[] },
): ElkLayoutNode[] {
  return nodes.map((node) => {
    const handles = getHandles?.(node) || { sourceHandles: [], targetHandles: [] };
    return {
      ...node,
      sourceHandles: handles.sourceHandles,
      targetHandles: handles.targetHandles,
    };
  });
}
