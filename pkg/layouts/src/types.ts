/**
 * Shared types for layout utilities
 */

// Generic interfaces for layout operations
// These are compatible with both React Flow types and core types
export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  data?: {
    type?: string;
    targetHandles?: Array<{ id: string }>;
    sourceHandles?: Array<{ id: string }>;
    [key: string]: unknown;
  };
  type?: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/**
 * Handle/port information for ElkJS layout
 */
export interface LayoutHandle {
  id: string;
  type: 'source' | 'target';
  /** Position on the node: top, bottom, left, right */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Extended node interface for ElkJS with handle information
 */
export interface ElkLayoutNode extends LayoutNode {
  /** Source handles (outputs) */
  sourceHandles?: LayoutHandle[];
  /** Target handles (inputs) */
  targetHandles?: LayoutHandle[];
}

/**
 * Extended edge interface for ElkJS with handle references
 */
export interface ElkLayoutEdge extends LayoutEdge {
  targetHandle?: string | null;
}
