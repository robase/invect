// Agent tools React Query hooks
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiContext';
import { queryKeys } from './query-keys';

export function useAgentTools() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.agentTools,
    queryFn: () => apiClient.getAgentTools(),
    staleTime: 1000 * 60 * 30, // 30 minutes - tools don't change often
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
