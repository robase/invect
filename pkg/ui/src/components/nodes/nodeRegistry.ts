import { UniversalNode } from './UniversalNode';
import { AgentNode } from './AgentNode';

/**
 * Node types with a dedicated component. Everything else falls back to
 * `UniversalNode`, including all provider-action nodes resolved at runtime.
 */
// eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
export const NODE_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'core.agent': AgentNode,
};

/**
 * Resolve the React component for a given node type string.
 */
// eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
export function getNodeComponent(nodeType: string): React.ComponentType<any> {
  return NODE_COMPONENTS[nodeType] ?? UniversalNode;
}

export type NodeComponentType = string;
