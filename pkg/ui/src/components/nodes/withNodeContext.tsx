import React from 'react';
import { useNodeViewContext } from './NodeViewContext';
import { NodeStatusIndicator, type NodeStatusIndicatorStatus } from './NodeStatusIndicator';
import { mapExecutionStatusToNodeStatus } from '../graph/styleUtils';

/**
 * Map UI node status to NodeStatusIndicator status
 */
function mapToIndicatorStatus(uiStatus: string | undefined): NodeStatusIndicatorStatus {
  switch (uiStatus) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'loading';
    case 'idle':
    case 'inactive':
    default:
      return 'initial';
  }
}

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

    // Extract execution status before potentially stripping it
    const executionStatus = props.data?.executionStatus;

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

    // In view or readonly mode with execution status, wrap with status indicator
    if ((mode === 'view' || mode === 'readonly') && executionStatus) {
      const uiStatus = mapExecutionStatusToNodeStatus(executionStatus);
      const indicatorStatus = mapToIndicatorStatus(uiStatus);

      return (
        <NodeStatusIndicator status={indicatorStatus}>
          <Component {...contextProps} />
        </NodeStatusIndicator>
      );
    }

    return <Component {...contextProps} />;
  };
}
