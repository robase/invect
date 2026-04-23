/**
 * Shared types for the copy-paste system.
 *
 * Extracted from `use-copy-paste.ts` so tests and any future
 * clipboard-adjacent helpers can reference the same payload shapes without
 * importing the React hook itself.
 */

export interface ClipboardData {
  sourceFlowId: string;
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
  copyTime: number;
}

export interface ClipboardNode {
  originalId: string;
  type: string;
  relativePosition: { x: number; y: number };
  absolutePosition?: { x: number; y: number };
  data: {
    display_name: string;
    reference_id: string;
    params: Record<string, unknown>;
    mapper?: unknown;
    _loop?: unknown;
  };
}

export interface ClipboardEdge {
  originalId: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
