import React from 'react';
import { NodeToolbar, Position } from '@xyflow/react';
import { Pencil } from 'lucide-react';
import { useNodeViewContext } from './NodeViewContext';

export function withNodeContext<
  P extends {
    data?: Record<string, unknown>;
    onEdit?: (...args: unknown[]) => void;
    isStatusView?: boolean;
    id: string;
  },
>(Component: React.ComponentType<P>) {
  const Wrapped = React.forwardRef<HTMLDivElement, P>((props, _ref) => {
    const { mode, onEdit, onEditNode, stripExecutionData } = useNodeViewContext();

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

    // In view mode with onEditNode, render a NodeToolbar with an Edit button
    if ((mode === 'view' || mode === 'readonly') && onEditNode) {
      return (
        <>
          <Component {...contextProps} />
          <NodeToolbar position={Position.Bottom} align="center" offset={8}>
            <button
              onClick={() => onEditNode(props.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-card-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </NodeToolbar>
        </>
      );
    }

    return <Component {...contextProps} />;
  });

  Wrapped.displayName = `WithNodeContext(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}
