import { UniversalNode } from './UniversalNode';
import { AgentNode } from './AgentNode';
import { GraphNodeType } from '@invect/core/types';

/**
 * Default component for known AGENT node type.
 * All other nodes (including dynamic action-based nodes) use UniversalNode.
 */
const AGENT_TYPE = GraphNodeType.AGENT;

/**
 * Base node component mapping for all known GraphNodeType values.
 * Provider-action nodes (e.g. "gmail.list_messages") are resolved
 * dynamically at runtime — see `getNodeComponent()`.
 */
const BASE_COMPONENTS: Record<string, React.ComponentType<any>> = {
  [GraphNodeType.TEMPLATE_STRING]: UniversalNode,
  [GraphNodeType.MODEL]: UniversalNode,
  [GraphNodeType.SQL_QUERY]: UniversalNode,
  [GraphNodeType.IF_ELSE]: UniversalNode,
  [GraphNodeType.INPUT]: UniversalNode,
  [GraphNodeType.OUTPUT]: UniversalNode,
  [GraphNodeType.JQ]: UniversalNode,
  [GraphNodeType.HTTP_REQUEST]: UniversalNode,
  [GraphNodeType.AGENT]: AgentNode,
  [GraphNodeType.GMAIL]: UniversalNode,
};

/**
 * Legacy export — static mapping of known enum node types.
 * For dynamic node type resolution (including action-based types),
 * use `getNodeComponent()` instead.
 */
export const NODE_COMPONENTS = BASE_COMPONENTS;

/**
 * Resolve the React component for a given node type string.
 * Returns the custom component for known special types (e.g. AGENT),
 * or UniversalNode as the default for everything else.
 */
export function getNodeComponent(nodeType: string): React.ComponentType<any> {
  if (nodeType === AGENT_TYPE) return AgentNode;
  return BASE_COMPONENTS[nodeType] ?? UniversalNode;
}

export type NodeComponentType = string;
