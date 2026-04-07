/**
 * Shared types for the copy-paste system.
 *
 * Extracted so both `use-copy-paste.ts` and `serialize-to-sdk.ts` can
 * reference the same clipboard payload shapes without circular imports.
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
