import { createContext, useContext } from 'react';
import type { ToolDefinition } from '../components/nodes/ToolSelectorModal';

/**
 * Context for Agent node tool management callbacks.
 *
 * This avoids the expensive pattern of remapping ALL nodes on every render
 * just to inject callbacks into Agent node data. Instead, AgentNode reads
 * these callbacks directly from context, and the nodes array passed to
 * ReactFlow keeps its original object references — letting React Flow's
 * internal shallow comparison skip re-renders for unmoved nodes.
 */
export interface AgentToolCallbacks {
  onOpenToolSelector: (nodeId: string) => void;
  onShowMoreTools: (nodeId: string) => void;
  onRemoveTool: (nodeId: string, instanceId: string) => void;
  onToolClick: (nodeId: string, instanceId: string) => void;
  availableTools: ToolDefinition[];
  /** The node ID that currently has the tool selector/config open */
  selectedToolNodeId: string | null;
  /** The tool instance ID currently being configured */
  selectedToolInstanceId: string | null;
}

const AgentToolCallbacksContext = createContext<AgentToolCallbacks | null>(null);

export const AgentToolCallbacksProvider = AgentToolCallbacksContext.Provider;

export function useAgentToolCallbacks(): AgentToolCallbacks | null {
  return useContext(AgentToolCallbacksContext);
}
