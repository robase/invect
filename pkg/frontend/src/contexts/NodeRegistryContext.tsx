import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useAvailableNodes } from '../api/node-data.api';
import { NodeDefinition } from '../types/node-definition.types';

interface NodeRegistryContextType {
  nodeDefinitions: NodeDefinition[];
  isLoading: boolean;
  error: Error | null;
  getNodeDefinition: (type: string) => NodeDefinition | undefined;
  refreshDefinitions: () => Promise<void>;
}

const NodeRegistryContext = createContext<NodeRegistryContextType | undefined>(undefined);

export const NodeRegistryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: nodeDefinitions = [], isLoading, error, refetch } = useAvailableNodes();

  const getNodeDefinition = useCallback(
    (type: string) => {
      return nodeDefinitions.find((def) => def.type === type);
    },
    [nodeDefinitions],
  );

  const refreshDefinitions = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo(
    () => ({
      nodeDefinitions,
      isLoading,
      error:
        error instanceof Error
          ? error
          : error
            ? new Error('Failed to fetch node definitions')
            : null,
      getNodeDefinition,
      refreshDefinitions,
    }),
    [nodeDefinitions, isLoading, error, getNodeDefinition, refreshDefinitions],
  );

  return <NodeRegistryContext.Provider value={value}>{children}</NodeRegistryContext.Provider>;
};

export const useNodeRegistry = () => {
  const context = useContext(NodeRegistryContext);
  if (context === undefined) {
    throw new Error('useNodeRegistry must be used within a NodeRegistryProvider');
  }
  return context;
};
