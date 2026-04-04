import React from 'react';
import type { UseFlowDataResult } from '../hooks/use-flow-data';

const FlowDataContext = React.createContext<UseFlowDataResult | null>(null);

interface FlowDataProviderProps {
  value: UseFlowDataResult;
  children: React.ReactNode;
}

export function FlowDataProvider({ value, children }: FlowDataProviderProps) {
  return <FlowDataContext.Provider value={value}>{children}</FlowDataContext.Provider>;
}

export function useFlowDataContext(): UseFlowDataResult {
  const context = React.useContext(FlowDataContext);
  if (!context) {
    throw new Error('useFlowDataContext must be used within a FlowDataProvider');
  }
  return context;
}
