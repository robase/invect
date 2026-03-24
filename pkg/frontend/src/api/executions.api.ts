// Execution-related React Query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApiClient } from '../contexts/ApiContext';
import { queryKeys, getErrorMessage } from './query-keys';
import { ValidationError } from './types';
import { FlowRunStatus, type FlowRun, type FlowInputs } from '@invect/core/types';

// Execution Queries
export function useFlowRuns(flowId: string, activeRunStatus?: FlowRunStatus) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.executions(flowId),
    queryFn: () => apiClient.getFlowRunsByFlowId(flowId),
    enabled: !!flowId,
    staleTime: 0, // Always fresh for real-time updates
    refetchInterval: () => {
      if (!activeRunStatus) {
        return false;
      }
      if ([FlowRunStatus.RUNNING, FlowRunStatus.PENDING].includes(activeRunStatus)) {
        return 1000;
      }
      if ([FlowRunStatus.PAUSED, FlowRunStatus.PAUSED_FOR_BATCH].includes(activeRunStatus)) {
        return 10000;
      }
      return false;
    },
  });
}

export function useFlowRun(id: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: queryKeys.flowRun(id),
    queryFn: () => apiClient.getFlowRun(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.status === FlowRunStatus.RUNNING || data.status === FlowRunStatus.PENDING)
      ) {
        console.log(`🔄 [POLLING] Polling execution ${id} status: ${data.status}`);
        return 5000;
      }
      if (
        data &&
        (data.status === FlowRunStatus.PAUSED || data.status === FlowRunStatus.PAUSED_FOR_BATCH)
      ) {
        console.log(`⏸️ [POLLING] Polling paused execution ${id} status: ${data.status}`);
        return 15000;
      }
      if (
        data &&
        (data.status === FlowRunStatus.SUCCESS ||
          data.status === FlowRunStatus.FAILED ||
          data.status === FlowRunStatus.CANCELLED)
      ) {
        console.log(
          `✅ [POLLING] Execution ${id} completed with status: ${data.status} - stopping polls`,
        );
        return false;
      }
      return false;
    },
    staleTime: 0,
  });
}

export function useNodeExecutions(flowRunId: string, flowRunStatus?: FlowRunStatus) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.nodeExecutions(flowRunId),
    queryFn: () => apiClient.getNodeExecutionsByFlowRun(flowRunId),
    enabled: !!flowRunId,
    refetchInterval: () => {
      if (!flowRunStatus) {
        return false;
      }

      if (flowRunStatus === FlowRunStatus.RUNNING || flowRunStatus === FlowRunStatus.PENDING) {
        return 5000;
      }

      if (flowRunStatus === FlowRunStatus.PAUSED_FOR_BATCH) {
        return 15000;
      }

      return false;
    },
    staleTime: 0,
  });
}

export function useLatestFlowRun(flowId: string) {
  const { data: executionsResponse } = useFlowRuns(flowId);
  const executions = executionsResponse?.data || [];

  const latestExecution = useMemo(() => {
    if (!executions.length) {
      return null;
    }
    return executions.sort(
      (a: FlowRun, b: FlowRun) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )[0];
  }, [executions]);

  return useFlowRun(latestExecution?.id || '');
}

export function useFlowRunLivePoll(flowId: string, executionId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ['flowExecution', flowId, executionId],
    queryFn: () => apiClient.getFlowRun(executionId),
    enabled: !!(flowId && executionId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.status === FlowRunStatus.RUNNING || data.status === FlowRunStatus.PENDING)
      ) {
        console.log(
          `🔄 [POLLING] Polling flow execution ${flowId}/${executionId} status: ${data.status}`,
        );
        return 5000;
      }
      if (
        data &&
        (data.status === FlowRunStatus.PAUSED || data.status === FlowRunStatus.PAUSED_FOR_BATCH)
      ) {
        console.log(
          `⏸️ [POLLING] Polling paused flow execution ${flowId}/${executionId} status: ${data.status}`,
        );
        return 15000;
      }
      if (
        data &&
        (data.status === FlowRunStatus.SUCCESS ||
          data.status === FlowRunStatus.FAILED ||
          data.status === FlowRunStatus.CANCELLED)
      ) {
        console.log(
          `✅ [POLLING] Flow execution ${flowId}/${executionId} completed with status: ${data.status} - stopping polls`,
        );
        return false;
      }
      return false;
    },
    staleTime: 0,
  });
}

export function useListFlowRuns(
  flowId?: string,
  status?: string,
  page?: number,
  limit?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
) {
  const apiClient = useApiClient();

  const filter: Record<string, string[]> = {};
  if (flowId) {
    filter.flowId = [flowId];
  }
  if (status) {
    filter.status = [status];
  }

  const queryOptions = {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    pagination: page && limit ? { page, limit } : undefined,
    sort: sortBy && sortOrder ? { sortBy: sortBy as keyof FlowRun, sortOrder } : undefined,
  };

  return useQuery({
    queryKey: queryKeys.allExecutions(flowId, status, page, limit, sortBy, sortOrder),
    queryFn: () => apiClient.getAllFlowRuns(queryOptions),
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: (failureCount, error) => {
      if (failureCount >= 2) {
        return false;
      }
      if (error instanceof Error && error.message.includes('4')) {
        return false;
      }
      return true;
    },
  });
}

// Execution Mutations
export function useExecuteFlow() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      flowId,
      inputs,
      useBatchProcessing,
    }: {
      flowId: string;
      inputs?: FlowInputs;
      useBatchProcessing?: boolean;
    }) =>
      apiClient.executeFlow(flowId, inputs, {
        version: 'latest',
        useBatchProcessing: useBatchProcessing,
      }),
    onSuccess: (_, { flowId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.executions(flowId) });
    },
    onError: (error) => {
      console.error('Error executing flow:', getErrorMessage(error));

      if (error instanceof ValidationError) {
        console.log('🔍 Flow Execution Validation Error Details:');
        console.log('🔍 - isValid:', error.validationResult.isValid);
        console.log('🔍 - warnings:', error.validationResult.warnings);

        if (!error.validationResult.isValid) {
          console.log('🔍 - errors:', error.validationResult.errors);

          error.validationResult.errors.forEach((validationError, index) => {
            console.log(`🔍 Execution Error ${index + 1}:`, {
              nodeId: validationError.nodeId,
              message: validationError.message,
              type: validationError.type,
              severity: validationError.severity,
              additionalContext: validationError.additionalContext,
            });
          });
        }
      }
    },
  });
}

// Execution Control Mutations
export function usePauseFlowRun() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: ({ executionId, reason }: { executionId: string; reason?: string }) =>
      apiClient.pauseFlowRun(executionId, reason),
    onSuccess: (_, { executionId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flowRun(executionId) });
    },
    onError: (error) => {
      console.error('Failed to pause execution:', error);
    },
  });
}

export function useResumeFlowRun() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (executionId: string) => apiClient.resumeFlowRun(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.flowRun(executionId) });
    },
    onError: (error) => {
      console.error('Failed to resume execution:', error);
    },
  });
}

export function useCancelFlowRun() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (executionId: string) => apiClient.cancelFlowRun(executionId),
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.flowRun(executionId) });
    },
    onError: (error) => {
      console.error('Failed to cancel execution:', error);
    },
  });
}

// Execute Flow To Node Mutation
export function useExecuteFlowToNode() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: (params: {
      flowId: string;
      nodeId: string;
      inputs?: Record<string, unknown>;
      options?: { useBatchProcessing?: boolean };
    }) =>
      apiClient.executeFlowToNode(
        params.flowId,
        params.nodeId,
        params.inputs || {},
        params.options,
      ),
    onError: (error) => {
      console.error('Error executing flow to node:', getErrorMessage(error));
    },
  });
}

// Test Node Mutation
export function useTestNode() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: (params: {
      nodeType: string;
      params: Record<string, unknown>;
      inputs: Record<string, unknown>;
    }) => apiClient.testNode(params.nodeType, params.params, params.inputs),
    onError: (error) => {
      console.error('Error testing node:', getErrorMessage(error));
    },
  });
}
