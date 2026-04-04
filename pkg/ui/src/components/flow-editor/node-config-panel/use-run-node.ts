import { useCallback } from 'react';
import { GraphNodeType } from '@invect/core/types';
import { useApiClient } from '../../../contexts/ApiContext';
import { useFlowActions } from '../../../routes/flow-route-layout';
import { useNodeConfigPanelStore, useParsedInputPreview } from './use-node-config-panel-store';

interface UseRunNodeOptions {
  nodeId: string | null;
  flowId: string;
  nodeType: GraphNodeType;
  nodeParams: Record<string, unknown>;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}

/**
 * Hook that handles all node execution logic (both test mode and normal mode)
 */
export function useRunNode({
  nodeId,
  flowId,
  nodeType,
  nodeParams,
  updateNodeData,
}: UseRunNodeOptions) {
  const apiClient = useApiClient();
  const flowActions = useFlowActions();
  const parsedInput = useParsedInputPreview();

  const {
    isTestMode,
    isRunningNode,
    setIsRunningNode,
    handleTestModeSuccess,
    handleNormalModeSuccess,
    handleExecutionError,
    setRunError,
    setOutputError,
  } = useNodeConfigPanelStore();

  const runNode = useCallback(async () => {
    if (!apiClient || !nodeId || !flowId) {
      return;
    }

    setIsRunningNode(true);
    setRunError(null);
    setOutputError(null);

    try {
      // Auto-save flow before running to ensure backend has latest nodes
      if (flowActions) {
        const saveSucceeded = await flowActions.onSave({ skipSuccessToast: true });
        if (!saveSucceeded) {
          handleExecutionError(
            'Failed to save flow. Please fix any validation errors and try again.',
          );
          setIsRunningNode(false);
          return;
        }
      }

      if (isTestMode) {
        // Test mode: Use testNode API with custom input (skip upstream nodes)
        const result = await apiClient.testNode(nodeType, nodeParams, parsedInput);

        if (result.success && result.output) {
          // Extract output value
          const typedOutput = result.output as {
            data?: { variables?: Record<string, { value: unknown }> };
          };
          let output: unknown = null;

          if (typedOutput.data?.variables?.output) {
            const outputVar = typedOutput.data.variables.output;
            output =
              outputVar && typeof outputVar === 'object' && 'value' in outputVar
                ? outputVar.value
                : outputVar;
          } else if (typedOutput.data?.variables) {
            const firstVar = Object.values(typedOutput.data.variables)[0];
            output =
              firstVar && typeof firstVar === 'object' && 'value' in firstVar
                ? firstVar.value
                : firstVar;
          } else {
            output = result.output;
          }

          handleTestModeSuccess(output);
          updateNodeData(nodeId, { previewOutput: output });
        } else {
          handleExecutionError(result.error || 'Test execution failed');
        }
      } else {
        // Normal mode: Execute the flow up to this node
        // Always use direct execution (no batch processing) when running from node config panel
        const result = await apiClient.executeFlowToNode(
          flowId,
          nodeId,
          {},
          { useBatchProcessing: false },
        );

        if (result.status === 'SUCCESS') {
          handleNormalModeSuccess(result, nodeId, updateNodeData);
        } else if (result.status === 'PAUSED_FOR_BATCH') {
          handleExecutionError(
            'Execution paused for batch processing. Check the Runs view for status.',
          );
        } else {
          handleExecutionError(result.error || 'Node execution failed');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      handleExecutionError(errorMessage);
    } finally {
      setIsRunningNode(false);
    }
  }, [
    apiClient,
    nodeId,
    flowId,
    flowActions,
    isTestMode,
    nodeType,
    nodeParams,
    parsedInput,
    updateNodeData,
    setIsRunningNode,
    setRunError,
    setOutputError,
    handleTestModeSuccess,
    handleNormalModeSuccess,
    handleExecutionError,
  ]);

  return {
    runNode,
    isRunningNode,
  };
}
