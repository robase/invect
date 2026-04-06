// Credential-related React Query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../contexts/ApiContext';
import { queryKeys, getErrorMessage } from './query-keys';
import type { CredentialFilters, CreateCredentialInput, UpdateCredentialInput } from './types';

// Credential Queries
export function useCredentials(filters?: CredentialFilters, options?: { enabled?: boolean }) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.credentials(filters),
    queryFn: () => apiClient.listCredentials(filters),
    staleTime: 1000 * 60 * 5,
    enabled: options?.enabled ?? true,
  });
}

export function useCredential(id: string) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.credential(id),
    queryFn: () => apiClient.getCredential(id),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });
}

export function useCredentialUsage(id: string, enabled: boolean = true) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: queryKeys.credentialUsage(id),
    queryFn: () => apiClient.getCredentialUsage(id),
    enabled: enabled && Boolean(id),
    staleTime: 1000 * 60,
  });
}

// Credential Mutations
export function useCreateCredential() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCredentialInput) => apiClient.createCredential(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
    onError: (error) => {
      console.error('Error creating credential:', getErrorMessage(error));
    },
  });
}

export function useUpdateCredential() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCredentialInput }) =>
      apiClient.updateCredential(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.credential(id) });
    },
    onError: (error) => {
      console.error('Error updating credential:', getErrorMessage(error));
    },
  });
}

export function useDeleteCredential() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
    onError: (error) => {
      console.error('Error deleting credential:', getErrorMessage(error));
    },
  });
}

export function useTestCredential() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.testCredential(id),
    onError: (error) => {
      console.error('Error testing credential:', getErrorMessage(error));
    },
  });
}

// Test Credential Request Mutation (for testing API connections)
export function useTestCredentialRequest() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: (params: {
      url: string;
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      headers?: Record<string, string>;
      body?: string;
    }) => apiClient.testCredentialRequest(params),
    onError: (error) => {
      console.error('Error testing credential request:', getErrorMessage(error));
    },
  });
}

// OAuth2 Queries
export function useOAuth2Providers() {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ['oauth2', 'providers'],
    queryFn: () => apiClient.getOAuth2Providers(),
    staleTime: 1000 * 60 * 60, // 1 hour - providers don't change
  });
}

export function useOAuth2Provider(providerId: string) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ['oauth2', 'provider', providerId],
    queryFn: () => apiClient.getOAuth2Provider(providerId),
    enabled: Boolean(providerId),
    staleTime: 1000 * 60 * 60,
  });
}

// OAuth2 Mutations
export function useStartOAuth2Flow() {
  const apiClient = useApiClient();

  return useMutation({
    mutationFn: (params: {
      providerId?: string;
      clientId?: string;
      clientSecret?: string;
      redirectUri: string;
      scopes?: string[];
      returnUrl?: string;
      credentialName?: string;
      existingCredentialId?: string;
    }) => apiClient.startOAuth2Flow(params),
    onError: (error) => {
      console.error('Error starting OAuth2 flow:', getErrorMessage(error));
    },
  });
}

export function useHandleOAuth2Callback() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      code: string;
      state: string;
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
    }) => apiClient.handleOAuth2Callback(params),
    onSuccess: () => {
      // Invalidate both the list and all individual credential queries
      // so the detail dialog picks up the new tokens
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
    },
    onError: (error) => {
      console.error('Error handling OAuth2 callback:', getErrorMessage(error));
    },
  });
}

export function useRefreshOAuth2Credential() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentialId: string) => apiClient.refreshOAuth2Credential(credentialId),
    onSuccess: (_, credentialId) => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.credential(credentialId) });
    },
    onError: (error) => {
      console.error('Error refreshing OAuth2 credential:', getErrorMessage(error));
    },
  });
}
