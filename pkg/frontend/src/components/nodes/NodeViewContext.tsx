import React, { createContext, useContext } from 'react';
import { Node } from '@xyflow/react';

export type NodeViewMode = 'edit' | 'view' | 'readonly';

interface NodeViewContextValue {
  mode: NodeViewMode;
  onEdit?: (node: Node) => void;
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
  children: React.ReactNode;
}

export const NodeViewProvider: React.FC<NodeViewProviderProps> = ({ mode, onEdit, children }) => {
  return (
    <NodeViewContext.Provider
      value={{
        mode,
        onEdit,
        stripExecutionData: mode === 'edit',
      }}
    >
      {children}
    </NodeViewContext.Provider>
  );
};
