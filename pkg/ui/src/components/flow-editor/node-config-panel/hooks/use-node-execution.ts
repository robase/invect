import { useCallback, useState } from 'react';
import { parseJson, stringifyJson } from '../utils';
import type { UseMutationResult } from '@tanstack/react-query';

// Options for save operation
interface SaveOptions {
  skipSuccessToast?: boolean;
}

// Flow actions interface
interface FlowActions {
  isDirty: boolean;
  onSave: (options?: SaveOptions) => Promise<boolean>;
  onExecute: () => Promise<void>;
  isSaving: boolean;
  isExecuting: boolean;
}

interface ExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  traces?: Array<{
    nodeId: string;
    inputs: unknown;
    outputs: unknown;
  }>;
}

// Type for the executeFlowToNode mutation
type ExecuteFlowToNodeMutation = UseMutationResult<
  unknown,
  Error,
  {
    flowId: string;
    nodeId: string;
    inputs?: Record<string, unknown>;
    options?: { useBatchProcessing?: boolean };
  }
>;

// Type for the testNode mutation
type TestNodeMutation = UseMutationResult<
  unknown,
  Error,
  {
    nodeType: string;
    params: Record<string, unknown>;
    inputs: Record<string, unknown>;
  }
>;

interface UseNodeExecutionOptions {
  nodeId: string | null;
  flowId: string;
  nodeType: string;
  nodeParams: Record<string, unknown>;
  executeFlowToNodeMutation: ExecuteFlowToNodeMutation;
  testNodeMutation?: TestNodeMutation;
  flowActions: FlowActions | null;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  isTestMode: boolean;
  inputPreview: string;
  onExecutionComplete: (input: string, output: string) => void;
}

/**
 * Extract output value from the structured node output format
 */
function extractOutputValue(nodeOutput: unknown): unknown {
  if (!nodeOutput || typeof nodeOutput !== 'object') {
    return null;
  }

  const typedOutput = nodeOutput as { data?: { variables?: Record<string, { value: unknown }> } };

  if (typedOutput.data?.variables?.output) {
    const outputVar = typedOutput.data.variables.output;
    return outputVar && typeof outputVar === 'object' && 'value' in outputVar
      ? outputVar.value
      : outputVar;
  }

  if (typedOutput.data?.variables) {
    const firstVar = Object.values(typedOutput.data.variables)[0];
    return firstVar && typeof firstVar === 'object' && 'value' in firstVar
      ? firstVar.value
      : firstVar;
  }

  return null;
}

export function useNodeExecution({
  nodeId,
  flowId,
  nodeType,
  nodeParams,
  executeFlowToNodeMutation,
  testNodeMutation,
  flowActions,
  updateNodeData,
  isTestMode,
  inputPreview,
  onExecutionComplete,
}: UseNodeExecutionOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);

  const runNode = useCallback(async () => {
    if (!nodeId || !flowId) {
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setOutputError(null);

    try {
      // Auto-save flow before running
      if (flowActions) {
        const saveSucceeded = await flowActions.onSave({ skipSuccessToast: true });
        if (!saveSucceeded) {
          setRunError('Failed to save flow. Please fix any validation errors and try again.');
          setOutputError('Save failed - check node configuration');
          setIsRunning(false);
          return;
        }
      }

      if (isTestMode) {
        // Test mode: run single node with custom input
        if (!testNodeMutation) {
          setRunError('Test mode is not available');
          setOutputError('Test mode is not available');
          setIsRunning(false);
          return;
        }

        const testInput = parseJson(inputPreview, () => ({})) || {};
        const result = (await testNodeMutation.mutateAsync({
          nodeType,
          params: nodeParams,
          inputs: testInput,
        })) as ExecutionResult;

        if (result.success && result.output) {
          const output = extractOutputValue(result.output) ?? result.output;
          const displayValue = typeof output === 'string' ? output : stringifyJson(output);

          updateNodeData(nodeId, { previewOutput: output });
          onExecutionComplete(inputPreview, displayValue);
        } else {
          setRunError(result.error || 'Test execution failed');
          setOutputError(result.error || 'Test execution failed');
        }
      } else {
        // Normal mode: run flow up to this node
        const result = (await executeFlowToNodeMutation.mutateAsync({
          flowId,
          nodeId,
          inputs: {},
          options: { useBatchProcessing: false },
        })) as {
          status: string;
          error?: string;
          nodeErrors?: Record<string, string>;
          traces?: Array<{ nodeId: string; inputs: unknown; outputs: unknown; error?: string }>;
          outputs?: Record<string, unknown>;
        };

        if (result.status === 'SUCCESS') {
          // Update all executed nodes from traces
          if (result.traces && Array.isArray(result.traces)) {
            for (const trace of result.traces) {
              const traceNodeId = trace.nodeId;
              if (!traceNodeId) {
                continue;
              }

              const traceOutput = extractOutputValue(trace.outputs);
              updateNodeData(traceNodeId, {
                previewInput: trace.inputs,
                previewOutput: traceOutput,
              });
            }
          }

          // Get current node's output
          const nodeOutput = result.outputs?.[nodeId];
          const output = extractOutputValue(nodeOutput);
          const displayValue = typeof output === 'string' ? output : stringifyJson(output);

          // Get current node's input from trace
          const currentTrace = result.traces?.find((t: { nodeId: string }) => t.nodeId === nodeId);
          const newInputPreview = currentTrace?.inputs
            ? stringifyJson(currentTrace.inputs)
            : inputPreview;

          onExecutionComplete(newInputPreview, displayValue);
        } else if (result.status === 'PAUSED_FOR_BATCH') {
          setRunError('Execution paused for batch processing. Check the Runs view for status.');
          setOutputError('Waiting for batch processing...');
        } else {
          // Extract the most specific error available:
          // 1. Error for this specific node from nodeErrors
          // 2. Top-level error from the result
          // 3. Error from the failed trace
          // 4. Generic fallback
          const specificError =
            result.nodeErrors?.[nodeId] ||
            result.error ||
            result.traces?.find((t) => t.error)?.error ||
            'Node execution failed';
          setRunError(specificError);
          setOutputError(specificError);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setRunError(errorMessage);
      setOutputError(errorMessage);
    } finally {
      setIsRunning(false);
    }
  }, [
    executeFlowToNodeMutation,
    testNodeMutation,
    nodeId,
    flowId,
    flowActions,
    isTestMode,
    inputPreview,
    nodeType,
    nodeParams,
    updateNodeData,
    onExecutionComplete,
  ]);

  return {
    isRunning,
    runError,
    outputError,
    runNode,
    setOutputError,
  };
}
