import React, { memo, useMemo } from 'react';
import {
  type EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  MarkerType,
} from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { X, Zap, AlertTriangle, SkipForward } from 'lucide-react';

// Enhanced edge data interface
export interface BatchFlowEdgeData extends Record<string, unknown> {
  label?: string;
  type?: 'default' | 'data' | 'conditional' | 'error' | 'skipped';
  animated?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  sourceHandle?: string;
  targetHandle?: string;
  sourceNodeStatus?: string;
  targetNodeStatus?: string;
  validation?: {
    valid: boolean;
    message?: string;
  };
}

// Edge styles based on type and state - Updated to match Invect's edge styling
const getEdgeStyles = (data?: BatchFlowEdgeData, selected?: boolean) => {
  const baseStyle = {
    strokeWidth: 2,
    stroke: 'var(--muted-foreground)', // Theme-aware default edge color
    fill: 'none', // Explicitly set fill to none for SVG paths
  };

  if (selected) {
    return {
      ...baseStyle,
      stroke: 'var(--edge-selected-stroke, #3b82f6)', // Blue for selected, uses CSS variable for theme awareness
      strokeWidth: 3,
    };
  }

  if (data?.highlighted) {
    return {
      ...baseStyle,
      stroke: '#3b82f6', // Blue for highlighted
      strokeWidth: 2.5,
    };
  }

  switch (data?.type) {
    case 'data':
      return {
        ...baseStyle,
        stroke: '#3b82f6', // Blue-500 equivalent
        strokeWidth: 2,
      };
    case 'conditional':
      return {
        ...baseStyle,
        stroke: '#f59e0b', // Amber-500 equivalent
        strokeWidth: 2,
        strokeDasharray: '5,5',
      };
    case 'error':
      return {
        ...baseStyle,
        stroke: '#ef4444', // Red-500
        strokeWidth: 2,
      };
    case 'skipped':
      return {
        ...baseStyle,
        stroke: '#6b7280', // Gray-500 for skipped edges
        strokeWidth: 1.5,
        strokeDasharray: '8,4', // Longer dashes for skipped appearance
        opacity: 0.5, // Make it more transparent
      };
    default:
      return baseStyle;
  }
};

// Main Invect Edge Component
export const BatchFlowEdge = memo(function BatchFlowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
    selected,
    markerEnd,
  } = props;

  const batchflowData = data as BatchFlowEdgeData;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25, // Add curvature for smooth bezier curves
  });

  const edgeStyle = useMemo(
    () => ({
      ...getEdgeStyles(batchflowData, selected),
      ...style,
    }),
    [
      batchflowData?.type,
      batchflowData?.highlighted,
      batchflowData?.validation?.valid,
      selected,
      style,
    ],
  );

  const showLabel = batchflowData?.label || batchflowData?.validation?.message;
  const isError =
    batchflowData?.type === 'error' ||
    (batchflowData?.validation && !batchflowData.validation.valid);

  return (
    <>
      <BaseEdge path={edgePath} style={edgeStyle} markerEnd={markerEnd} interactionWidth={20} />

      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {batchflowData?.label && (
              <div
                className={cn(
                  'bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-1.5 shadow-lg text-xs font-medium',
                  'transition-all duration-200 hover:shadow-xl hover:scale-105',
                  'max-w-[200px] truncate',
                  selected && 'ring-2 ring-primary/50 ring-offset-1',
                  isError && 'border-destructive/70 bg-destructive/10 text-destructive',
                )}
              >
                <div className="flex items-center gap-1.5">
                  {batchflowData.type === 'conditional' && (
                    <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                  )}
                  {batchflowData.type === 'skipped' && (
                    <SkipForward className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  {isError && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                  <span
                    className={cn(
                      'text-foreground truncate',
                      isError && 'text-destructive',
                      batchflowData.type === 'skipped' && 'text-muted-foreground',
                    )}
                  >
                    {batchflowData.label}
                  </span>
                </div>
                {batchflowData?.validation?.message && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {batchflowData.validation.message}
                  </div>
                )}
              </div>
            )}

            {selected && (
              <Button
                variant="destructive"
                size="icon"
                className="w-6 h-6 ml-2 opacity-80 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle edge deletion in parent component
                  console.log('Delete edge:', id);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

BatchFlowEdge.displayName = 'BatchFlowEdge';

// Predefined edge types matching Invect's patterns
const edgeTypes = {
  // invect: BatchFlowEdge,
  default: BatchFlowEdge,
};

// Edge creation utilities
const createBatchFlowEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string,
  data?: Partial<BatchFlowEdgeData>,
): Edge<BatchFlowEdgeData> => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: 'default',
  animated: data?.animated || false,
  data: {
    type: 'default',
    animated: false,
    highlighted: false,
    selected: false,
    ...data,
  },
  style: getEdgeStyles(data as BatchFlowEdgeData),
  markerEnd: {
    type: MarkerType.ArrowClosed, // Changed from string to enum
    width: 16,
    height: 16,
    color: getEdgeStyles(data as BatchFlowEdgeData).stroke,
  },
});

// Default edge styles for different connection types
export const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: {
    strokeWidth: 2,
    stroke: 'var(--muted-foreground)', // Theme-aware default edge color
    fill: 'none',
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: 'var(--muted-foreground)', // Theme-aware marker color
  },
};
