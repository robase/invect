import { UniversalNode } from './UniversalNode';
import { AgentNode } from './AgentNode';
import { GraphNodeType } from '@invect/core/types';

const AGENT_TYPE = GraphNodeType.AGENT;

/**
 * Node component mapping. ReactFlow looks up `node.type` in this map.
 *
 * - `AGENT` → AgentNode (custom iterative tool-calling UI)
 * - `default` → UniversalNode (ReactFlow's built-in fallback key — any
 *   unrecognised action ID string like "gmail.list_messages" or
 *   "core.model" automatically renders as UniversalNode)
 *
 * No static per-action-type entries are needed. The `default` key is
 * ReactFlow's documented fallback:
 * https://reactflow.dev/api-reference/react-flow#node-types
 */
// eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
export const NODE_COMPONENTS: Record<string, React.ComponentType<any>> = {
  [AGENT_TYPE]: AgentNode,
  default: UniversalNode,
};

/**
 * Resolve the React component for a given node type string.
 */
// eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
export function getNodeComponent(nodeType: string): React.ComponentType<any> {
  if (nodeType === AGENT_TYPE) {
    return AgentNode;
  }
  return UniversalNode;
}

export type NodeComponentType = string;
