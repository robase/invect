export type UpstreamSlotStatus = 'idle' | 'loading' | 'resolved' | 'error';

export interface UpstreamSlot {
  /** The JSON key used in the input preview (reference_id or generated slug) */
  key: string;
  /** The real React Flow node ID — used for the API call */
  sourceNodeId: string;
  /** Human-readable label shown on hover / in tooltips */
  sourceLabel: string;
  /** The action type string (e.g. "core.model", "gmail.send_message") */
  sourceType: string;
  /** Lucide icon name for the node type (e.g. "Brain", "Mail") */
  sourceIcon?: string;
  /** Current state of this slot */
  status: UpstreamSlotStatus;
  /** The resolved output value, or null if not yet produced */
  output: unknown;
  /** Error message if execution failed */
  error: string | null;
}
