import React from 'react';
import { useNodeViewContext } from './NodeViewContext';

export function withNodeContext<
  P extends {
    data?: Record<string, unknown>;
    onEdit?: (...args: unknown[]) => void;
    isStatusView?: boolean;
    id: string;
  },
>(Component: React.ComponentType<P>) {
  return (props: P) => {
    const { mode, onEdit, stripExecutionData } = useNodeViewContext();

    // Process data based on context
    let processedData = props.data;
    if (stripExecutionData && props.data) {
      const { executionStatus: _, executionOutput, executionError, ...cleanData } = props.data;
      processedData = cleanData;
    }

    // Determine props based on context
    const contextProps = {
      ...props,
      data: processedData,
      onEdit: mode === 'edit' ? onEdit : undefined,
      isStatusView: mode === 'view' || mode === 'readonly',
    } as P;

    // In view or readonly mode, just pass through — UniversalNode handles status borders directly
    return <Component {...contextProps} />;
  };
}
