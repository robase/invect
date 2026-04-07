import { createContext, useContext } from 'react';

const ToolbarCollapsedContext = createContext(false);

export const ToolbarCollapsedProvider = ToolbarCollapsedContext.Provider;

export function useToolbarCollapsed() {
  return useContext(ToolbarCollapsedContext);
}
