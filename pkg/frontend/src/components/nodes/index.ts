import { Node, NodeProps } from '@xyflow/react';
import { GraphNodeType, GRAPH_NODE_TYPE_NAMES, NodeExecutionStatus } from '@invect/core/types';

// New universal node component
export { UniversalNode } from './UniversalNode';

// Agent node with tools box
export { AgentNode } from './AgentNode';
export { NodeAppendix, type AppendixPosition } from './NodeAppendix';
export { AgentToolsBox, type AgentToolDisplay, type ToolCategory } from './AgentToolsBox';
export { type ToolDefinition, type AddedToolInstance } from './ToolSelectorModal';
export { ToolParamField, type AddCredentialRequest } from './ToolParamField';

// Node status indicator for showing execution status
export {
  NodeStatusIndicator,
  type NodeStatusIndicatorStatus,
  type NodeStatusIndicatorLoadingVariant,
} from './NodeStatusIndicator';

// Legacy node components (kept for reference, no longer used)
// export { BaseNode, type BaseNodeProps } from "./BaseNode";
// export { TemplateStringNode } from "./TemplateStringNode";
// export { ModelNode } from "./ModelNode";
// export { SqlQueryNode } from "./SqlQueryNode";
// export { IfElseNode } from "./IfElseNode";
// export { InputNode } from "./InputNode";
// export { OutputNode } from "./OutputNode";
// export { JQNode } from "./JQNode";

// Context-based node utilities
export {
  NodeViewProvider,
  useNodeViewContext,
  type NodeViewMode,
  type NodeViewProviderProps,
} from './NodeViewContext';
export { withNodeContext } from './withNodeContext';
export { createContextAwareNodes } from './createContextAwareNodes';

// Export from node registry
export { NODE_COMPONENTS, getNodeComponent, type NodeComponentType } from './nodeRegistry';

// Common node data interface
export interface BaseNodeData {
  // display_name?: string;
  description?: string;
  icon?: string;
  status?: string;
  executionStatus?: NodeExecutionStatus;
  executionOutput?: any;
  executionError?: string;
}

export type FBNodeProps<T> = NodeProps<Node<T & BaseNodeData & Record<string, unknown>>>;

// Default node configurations matching the seed data
export const DEFAULT_NODE_CONFIGS = {
  [GraphNodeType.TEMPLATE_STRING]: {
    template: 'Hello {{ name }}!',
  },
  [GraphNodeType.MODEL]: {
    provider: 'OPENAI', // Default provider
    model: 'gpt-4o-mini', // Default model so validation passes
    temperature: 0.7,
    maxTokens: 1024,
    outputSchema: '',
  },
  [GraphNodeType.SQL_QUERY]: {
    query: 'SELECT * FROM users LIMIT 10;',
    databaseType: 'sqlite',
    databaseId: 'default',
  },
  [GraphNodeType.IF_ELSE]: {
    condition: { '==': [{ var: 'value' }, true] },
    true_output_handle: 'true_output',
    false_output_handle: 'false_output',
  },
  [GraphNodeType.INPUT]: {
    variableName: 'my_variable',
    defaultValue: '',
  },
  [GraphNodeType.OUTPUT]: {
    variables: [{ name: 'output', label: 'Output' }],
  },
  [GraphNodeType.JQ]: {
    query: '.',
  },
} as const;

// Node metadata for the palette - DEPRECATED: Use NodeRegistry instead
export const NODE_DEFINITIONS = {} as const;
