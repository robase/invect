import { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { Node, Edge } from '@xyflow/react';
import { GraphNodeType } from '@invect/core/types';
import { useFlowReactFlowData, useCreateFlowVersion } from '../../api/flows.api';
import { useExecuteFlow } from '../../api/executions.api';
import { useFlowEditorStore, type LayoutDirection } from './flow-editor.store';
import { useNodeRegistry } from '~/contexts/NodeRegistryContext';
import { transformToInvectDefinition } from '~/utils/flowTransformations';
import { generateUniqueDisplayName, generateUniqueReferenceId } from '~/utils/nodeReferenceUtils';
import { applyLayout, type LayoutAlgorithm } from '~/utils/layoutUtils';

// Simple toast helper (can be replaced with proper toast library)
const toast = (options: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => {
  console.log(
    `[${options.variant === 'destructive' ? 'ERROR' : 'INFO'}] ${options.title}:`,
    options.description,
  );
};

interface UseFlowEditorOptions {
  flowId: string;
  version?: string;
  basePath?: string;
}

/**
 * Main hook that wires React Query with Zustand for the flow editor.
 *
 * React Query handles:
 * - Fetching flow data from the server
 * - Caching and background refetching
 * - Mutation (save) operations
 *
 * Zustand handles:
 * - Local node/edge state (working copy)
 * - Dirty tracking
 * - Selection state
 * - UI state (panels, layout)
 */
export function useFlowEditor({ flowId, version, basePath = '' }: UseFlowEditorOptions) {
  const navigate = useNavigate();

  // React Query - server state
  const {
    data: flowData,
    isLoading,
    error: queryError,
    refetch,
  } = useFlowReactFlowData(flowId, { version });

  const createVersionMutation = useCreateFlowVersion();
  const executeFlowMutation = useExecuteFlow();

  // Zustand - client state
  const store = useFlowEditorStore();
  const {
    nodes,
    edges,
    isDirty,
    flowName,
    currentLayout,
    layoutDirection,
    syncFromServer,
    markSaved,
    setFlowId,
    setLoading,
    setError,
  } = store;

  // Initialize flow ID in store
  useEffect(() => {
    setFlowId(flowId, version);
  }, [flowId, version, setFlowId]);

  // Sync loading state
  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading, setLoading]);

  // Sync error state
  useEffect(() => {
    setError(queryError?.message ?? null);
  }, [queryError, setError]);

  // Sync server data to Zustand when React Query fetches new data
  useEffect(() => {
    if (flowData?.nodes && flowData?.edges) {
      const versionInfo = flowData.version;
      const versionId = versionInfo
        ? `${versionInfo.flowId}:${versionInfo.version}`
        : `${flowId}:unknown`;

      // Server returns ReactFlowNode[] which is compatible with Node[]
      syncFromServer(flowData.nodes as Node[], flowData.edges as Edge[], versionId, flowData.name);
    }
  }, [flowData, flowId, syncFromServer]);

  // Save handler - persists Zustand state to server via React Query mutation
  const save = useCallback(
    async (options?: { skipSuccessToast?: boolean }) => {
      if (!flowId) {
        return false;
      }

      if (!nodes.length) {
        toast({
          title: 'Flow is empty',
          description: 'Add at least one node before saving.',
        });
        return false;
      }

      try {
        const invectDefinition = transformToInvectDefinition(nodes, edges);

        const result = await createVersionMutation.mutateAsync({
          flowId,
          data: { invectDefinition },
        });

        // Mark as saved with new version ID
        const savedVersionId = result ? `${result.flowId}:${result.version}` : undefined;
        if (savedVersionId) {
          markSaved(savedVersionId);
        }

        if (!options?.skipSuccessToast) {
          toast({
            title: 'Success',
            description: 'Flow saved successfully',
          });
        }

        return true;
      } catch (error: unknown) {
        console.error('Save error:', error);
        const message = error instanceof Error ? error.message : 'Failed to save flow';
        toast({
          title: 'Save Failed',
          description: message,
          variant: 'destructive',
        });
        return false;
      }
    },
    [flowId, nodes, edges, createVersionMutation, markSaved],
  );

  // Execute handler - saves then executes
  const execute = useCallback(async () => {
    if (!flowId) {
      return;
    }

    // Save first
    const saved = await save({ skipSuccessToast: true });
    if (!saved) {
      return;
    }

    try {
      // Start execution and wait for the flow run ID
      const result = await executeFlowMutation.mutateAsync({
        flowId,
        inputs: {},
        useBatchProcessing: false,
      });

      toast({
        title: 'Execution Started',
        description: 'Flow is now running',
      });

      // Navigate to the specific flow run
      if (result?.flowRunId) {
        navigate(`${basePath}/flow/${flowId}/runs?runId=${result.flowRunId}`);
      } else {
        // Fallback to runs view without specific run
        navigate(`${basePath}/flow/${flowId}/runs`);
      }
    } catch (error: unknown) {
      console.error('Execute error:', error);
      const message = error instanceof Error ? error.message : 'Failed to start execution';
      toast({
        title: 'Execution Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [flowId, save, executeFlowMutation, navigate, basePath]);

  // Apply layout to nodes
  const applyLayoutToNodes = useCallback(
    async (
      algorithm: LayoutAlgorithm = currentLayout as LayoutAlgorithm,
      direction: LayoutDirection = layoutDirection,
    ) => {
      const { nodes: layoutedNodes } = await applyLayout(nodes, edges, algorithm, direction);
      store.setLayoutedNodes(layoutedNodes);
      store.setLayout(algorithm, direction);
    },
    [nodes, edges, currentLayout, layoutDirection, store],
  );

  return {
    // Data
    flowId,
    flowName,
    nodes,
    edges,
    isActive: flowData?.isActive,

    // Loading states
    isLoading,
    error: queryError?.message ?? null,

    // Dirty state
    isDirty,

    // Save/Execute
    save,
    execute,
    isSaving: createVersionMutation.isPending,
    isExecuting: executeFlowMutation.isPending,

    // Layout
    currentLayout,
    layoutDirection,
    applyLayout: applyLayoutToNodes,

    // Refetch from server
    refetch,

    // Direct store access for advanced usage
    store,
  };
}

/**
 * Hook for node CRUD operations in the flow editor.
 * Uses Zustand store for immediate local updates.
 */
function useNodeOperations() {
  const { getNodeDefinition } = useNodeRegistry();
  const store = useFlowEditorStore();
  const { nodes, addNode, removeNode, updateNodeData } = store;

  const createNode = useCallback(
    (type: GraphNodeType, position: { x: number; y: number } = { x: 250, y: 150 }): Node => {
      const id = `${type}-${Date.now()}`;
      const definition = getNodeDefinition(type);

      const fieldDefaults = (definition?.paramFields || []).reduce<Record<string, unknown>>(
        (acc, field) => {
          if (field.defaultValue !== undefined) {
            acc[field.name] = field.defaultValue;
          }
          return acc;
        },
        {},
      );

      const defaultParams = {
        ...(definition?.defaultParams || {}),
        ...fieldDefaults,
      };

      const baseDisplayName = definition?.label || type;
      const displayName = generateUniqueDisplayName(baseDisplayName, nodes);
      const referenceId = generateUniqueReferenceId(displayName, nodes);

      // Create node with properly typed data conforming to ReactFlowNodeData
      const newNode: Node = {
        id,
        type,
        position,
        data: {
          id,
          type,
          display_name: displayName,
          reference_id: referenceId,
          status: 'idle',
          params: defaultParams,
        },
      };

      addNode(newNode);
      return newNode;
    },
    [getNodeDefinition, nodes, addNode],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        return null;
      }

      // Access node data - at runtime this will be ReactFlowNodeData
      const nodeData = node.data as Record<string, unknown>;
      const type = (nodeData.type ?? node.type) as GraphNodeType;

      return createNode(type, {
        x: node.position.x + 50,
        y: node.position.y + 50,
      });
    },
    [nodes, createNode],
  );

  return {
    createNode,
    duplicateNode,
    removeNode,
    updateNodeData,
    nodes,
  };
}

/**
 * Hook for edge operations in the flow editor.
 */
function useEdgeOperations() {
  const store = useFlowEditorStore();
  const { edges, addEdge, removeEdge, onConnect } = store;

  return {
    edges,
    addEdge,
    removeEdge,
    onConnect,
  };
}

/**
 * Hook for selection state in the flow editor.
 */
function useFlowSelection() {
  const store = useFlowEditorStore();
  const { selectedNodeId, configPanelOpen, selectNode, openConfigPanel, closeConfigPanel, nodes } =
    store;

  const selectedNode = useMemo(
    () => (selectedNodeId ? (nodes.find((n) => n.id === selectedNodeId) ?? null) : null),
    [selectedNodeId, nodes],
  );

  return {
    selectedNodeId,
    selectedNode,
    configPanelOpen,
    selectNode,
    openConfigPanel,
    closeConfigPanel,
  };
}

/**
 * Combined hook that provides all flow editor functionality.
 * This is the main hook components should use.
 */
function useFlowEditorFull(options: UseFlowEditorOptions) {
  const editor = useFlowEditor(options);
  const nodeOps = useNodeOperations();
  const edgeOps = useEdgeOperations();
  const selection = useFlowSelection();

  return {
    ...editor,
    ...nodeOps,
    ...edgeOps,
    ...selection,
  };
}
