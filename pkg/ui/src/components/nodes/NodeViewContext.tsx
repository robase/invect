import React, { createContext, useContext } from 'react';
import { Node } from '@xyflow/react';

export type NodeViewMode = 'edit' | 'view' | 'readonly';

interface NodeViewContextValue {
  mode: NodeViewMode;
  onEdit?: (node: Node) => void;
  onEditNode?: (nodeId: string) => void;
  stripExecutionData: boolean;
}

const NodeViewContext = createContext<NodeViewContextValue>({
  mode: 'view',
  stripExecutionData: false,
});

export const useNodeViewContext = () => useContext(NodeViewContext);

export interface NodeViewProviderProps {
  mode: NodeViewMode;
  onEdit?: (node: Node) => void;
  onEditNode?: (nodeId: string) => void;
  children: React.ReactNode;
}

export const NodeViewProvider: React.FC<NodeViewProviderProps> = ({
  mode,
  onEdit,
  onEditNode,
  children,
}) => {
  return (
    <NodeViewContext.Provider
      value={{
        mode,
        onEdit,
        onEditNode,
        stripExecutionData: mode === 'edit',
      }}
    >
      {children}
    </NodeViewContext.Provider>
  );
};
