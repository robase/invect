import React, { createContext, useContext, useMemo } from 'react';
import { ApiClient } from '../api/client';

interface ApiContextValue {
  apiClient: ApiClient;
  baseURL: string;
}

const ApiContext = createContext<ApiContextValue | undefined>(undefined);

export interface ApiProviderProps {
  children: React.ReactNode;
  baseURL?: string;
}

export const ApiProvider: React.FC<ApiProviderProps> = ({
  children,
  baseURL = 'http://localhost:3000/invect',
}) => {
  const apiClient = useMemo(() => new ApiClient(baseURL), [baseURL]);

  const value = useMemo(
    () => ({
      apiClient,
      baseURL,
    }),
    [apiClient, baseURL],
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export const useApiClient = (): ApiClient => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApiClient must be used within an ApiProvider');
  }
  return context.apiClient;
};

export const useApiBaseURL = (): string => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApiBaseURL must be used within an ApiProvider');
  }
  return context.baseURL;
};
