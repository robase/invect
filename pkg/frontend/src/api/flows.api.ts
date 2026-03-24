// Flow-related React Query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiContext';
import { queryKeys, getErrorMessage } from './query-keys';
import { ValidationError, type ReactFlowDataOptions } from './types';
import {
  FlowRunStatus,
  type CreateFlowDto,
  type CreateFlowVersionDto,
  type QueryOptions,
  type Flow,
  type FlowVersion,
  type ReactFlowData,
  type InvectDefinition,
  type FlowInputs,
} from '@invect/core/types';

export function useDashboardStats() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => apiClient.getDashboardStats(),
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refresh every minute
  });
}

export function useFlows(options?: QueryOptions<Flow>) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: [...queryKeys.flows, options],
    queryFn: () => apiClient.getFlows(options),
    staleTime: 1000 * 60 * 5, // 5 minutes
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

export function useFlow(id: string) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.flow(id),
    queryFn: () => apiClient.getFlow(id),
    enabled: !!id,
    staleTime: 1000 * 30, // 30 seconds - reduced to ensure fresh data after mutations
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

export function useFlowVersions(flowId: string, options?: QueryOptions<FlowVersion>) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: [...queryKeys.flowVersions(flowId), options],
    queryFn: () => apiClient.getFlowVersions(flowId, options),
    enabled: !!flowId,
    staleTime: 1000 * 30, // 30 seconds - reduced to ensure fresh data after mutations
  });
}

// React Flow Data Query
export function useFlowReactFlowData(
  flowId: string,
  options?: ReactFlowDataOptions & { flowRunStatus?: FlowRunStatus },
): ReturnType<typeof useQuery<ReactFlowData, Error>> {
  const apiClient = useApiClient();
  const flowRunStatus = options?.flowRunStatus;

  return useQuery({
    queryKey: queryKeys.reactFlow(flowId, options?.version, options?.flowRunId),
    queryFn: () => apiClient.getFlowReactFlowData(flowId, options),
    enabled: !!flowId,
    staleTime: options?.flowRunId ? 0 : 1000 * 30, // No stale time when tracking execution
    // Poll when we have a flowRunId and the run is active
    refetchInterval: () => {
      if (!options?.flowRunId || !flowRunStatus) {
        return false;
      }
      // Poll while execution is active
      if ([FlowRunStatus.RUNNING, FlowRunStatus.PENDING].includes(flowRunStatus)) {
        return 1000; // Poll every 1 second for real-time updates
      }
      if ([FlowRunStatus.PAUSED, FlowRunStatus.PAUSED_FOR_BATCH].includes(flowRunStatus)) {
        return 10000; // Poll slower for paused executions
      }
      return false; // Stop polling when complete
    },
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

// React Flow Data Query with Execution Status
export function useFlowReactFlowDataWithExecution(
  flowId: string,
  flowRunId: string,
  enabled: boolean = true,
  pollingInterval?: number,
): ReturnType<typeof useQuery<ReactFlowData, Error>> {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.reactFlow(flowId, undefined, flowRunId),
    queryFn: () => {
      console.log('🔍 Fetching flow data with execution status');
      return apiClient.getFlowReactFlowData(flowId, { flowRunId: flowRunId });
    },
    enabled: enabled && !!flowId && !!flowRunId,
    staleTime: 0, // Always consider data stale for real-time updates
    refetchInterval: pollingInterval || false, // Use custom polling interval
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

// Flow Mutations
export function useCreateFlow() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: CreateFlowDto) => apiClient.createFlow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows });
    },
    onError: (error) => {
      console.error('Error creating flow:', getErrorMessage(error));
    },
  });
}

export function useCreateFlowWithVersion() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: ({
      flowDto,
      versionDto,
    }: {
      flowDto: CreateFlowDto;
      versionDto: CreateFlowVersionDto;
    }) => apiClient.createFlowWithVersion(flowDto, versionDto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows });
    },
    onError: (error) => {
      console.error('Error creating flow with version:', getErrorMessage(error));
    },
  });
}

export function useUpdateFlow() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateFlowDto> }) =>
      apiClient.updateFlow(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flow(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.flows });
    },
    onError: (error) => {
      console.error('Error updating flow:', getErrorMessage(error));
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteFlow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.flows });
    },
    onError: (error) => {
      console.error('Error deleting flow:', getErrorMessage(error));
    },
  });
}

// Flow Version Mutations
export function useCreateFlowVersion() {
  const queryClient = useQueryClient();
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: ({ flowId, data }: { flowId: string; data: CreateFlowVersionDto }) => {
      console.log('🔄 Mutation: useCreateFlowVersion called');
      console.log('🔄 Mutation: flowId:', flowId);
      console.log('🔄 Mutation: data:', data);

      const result = apiClient.createFlowVersion(flowId, data);
      console.log('🔄 Mutation: apiClient.createFlowVersion called, result:', result);
      return result;
    },
    onSuccess: (result, { flowId }) => {
      console.log('✅ Mutation: useCreateFlowVersion succeeded');
      console.log('✅ Mutation: result:', result);
      console.log('✅ Mutation: flowId for invalidation:', flowId);

      console.log('🔄 Mutation: Invalidating flow versions query...');
      queryClient.invalidateQueries({ queryKey: queryKeys.flowVersions(flowId) });

      console.log('🔄 Mutation: Invalidating flow query...');
      queryClient.invalidateQueries({ queryKey: queryKeys.flow(flowId) });

      console.log('🔄 Mutation: Invalidating flows list query...');
      queryClient.invalidateQueries({ queryKey: queryKeys.flows });

      console.log('✅ Mutation: All queries invalidated');
    },
    onError: (error) => {
      console.error('❌ Mutation: Error creating flow version:', getErrorMessage(error));
      console.log('❌ Mutation: Full error object in mutation:', error);
      console.log(
        '❌ Mutation: Error instanceof ValidationError:',
        error instanceof ValidationError,
      );

      if (error instanceof ValidationError) {
        console.log('🔍 Validation Error Details:');
        console.log('🔍 - isValid:', error.validationResult.isValid);
        console.log('🔍 - warnings:', error.validationResult.warnings);

        if (!error.validationResult.isValid) {
          console.log('🔍 - errors:', error.validationResult.errors);

          error.validationResult.errors.forEach((validationError, index) => {
            console.log(`🔍 Error ${index + 1}:`, {
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

export function useValidateFlow() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: ({ flowId, flowData }: { flowId: string; flowData: InvectDefinition }) =>
      apiClient.validateFlow(flowId, flowData),
    retry: false,
    onError: (error) => {
      console.error('Error validating flow:', getErrorMessage(error));
    },
  });
}
