import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ReactFlow,
  type NodeTypes,
  type EdgeTypes,
  Controls,
  Background,
  useReactFlow,
} from '@xyflow/react';

import { BatchFlowEdge, defaultEdgeOptions } from '../graph';
import { NodeViewProvider, createContextAwareNodes } from '../nodes';
import { getNodeComponent } from '../nodes/nodeRegistry';
import { withNodeContext } from '../nodes/withNodeContext';
import { FlowRunStatus, NodeExecutionStatus, ReactFlowNodeData } from '@invect/core/types';
import { FlowRun } from '@invect/core/types';
import { Node } from '@xyflow/react';
import { useTheme } from '~/contexts/ThemeProvider';
import { InvectLoader } from '../shared/InvectLoader';

// Import shared hook
import { useFlowData } from '../../hooks/use-flow-data';

// Base node types (enum-based) wrapped with view context
const baseNodeTypes = createContextAwareNodes();

const edgeTypes = {
  // invect: BatchFlowEdge,
  default: BatchFlowEdge,
} as EdgeTypes;

interface FlowStatusViewProps {
  flowId: string;
  flowVersion?: string;
  basePath?: string;
  selectedRunId: string | null;
  selectedRun: FlowRun | null | undefined;
  logsExpanded: boolean;
  onNodeClick?: (nodeId: string) => void;
  /** Node ID to focus/center on (only set on user-initiated selection) */
  focusNodeId?: string | null;
  /** Callback when focus animation completes */
  onFocusComplete?: () => void;
}

export function FlowStatusView({
  flowId,
  flowVersion,
  basePath: _basePath = '',
  selectedRunId,
  selectedRun,
  logsExpanded,
  onNodeClick,
  focusNodeId,
  onFocusComplete,
}: FlowStatusViewProps) {
  const _navigate = useNavigate();
  const reactFlowInstance = useReactFlow();
  const { resolvedTheme } = useTheme();

  // Get flow data — execution status is streamed via SSE (useFlowRunStream in
  // FlowRunsView), so we only need a single fetch of the graph structure here.
  const { flowData, loading, queryError, nodes, onNodesChange, edges, onEdgesChange } = useFlowData(
    flowId,
    flowVersion,
    selectedRunId || undefined,
  );

  // nodeTypes: AGENT gets a custom component, everything else renders as
  // UniversalNode. Register action types from current flow nodes to avoid
  // ReactFlow's fallback CSS class; "default" catches unknown types.
  const nodeTypes = useMemo(() => {
    const mapping = { ...baseNodeTypes };
    for (const node of nodes) {
      const nodeType = (node.data as { type?: string })?.type ?? node.type;
      if (nodeType && !(nodeType in mapping)) {
        mapping[nodeType] = withNodeContext(getNodeComponent(nodeType));
      }
    }
    return mapping as NodeTypes;
  }, [nodes]);

  // Fit view when logs panel is expanded/collapsed
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (typeof reactFlowInstance.fitView === 'function') {
        reactFlowInstance.fitView({ padding: 0.5, maxZoom: 1.2, duration: 200 });
      }
    }, 150);

    return () => clearTimeout(timeout);
  }, [logsExpanded, reactFlowInstance]);

  // Center on focused node when user explicitly clicks (not on auto-select)
  useEffect(() => {
    if (!focusNodeId || !nodes.length) {
      return;
    }

    // Find the node in the current nodes array
    const targetNode = nodes.find((n) => n.id === focusNodeId);
    if (!targetNode) {
      return;
    }

    // Use setCenter to pan and zoom to the node's position
    // Adding a small delay to ensure the view has settled
    const timeout = setTimeout(() => {
      const nodeWidth = targetNode.measured?.width ?? targetNode.width ?? 200;
      const nodeHeight = targetNode.measured?.height ?? targetNode.height ?? 60;

      // Center on the node's center point and zoom in
      const x = targetNode.position.x + nodeWidth / 2;
      const y = targetNode.position.y + nodeHeight / 2;

      // Zoom to 1.5x when focusing on a node (or current zoom if already higher)
      const targetZoom = Math.max(1.5, reactFlowInstance.getZoom());
      reactFlowInstance.setCenter(x, y, { duration: 300, zoom: targetZoom });

      // Clear the focus after centering is complete
      if (onFocusComplete) {
        setTimeout(onFocusComplete, 350);
      }
    }, 50);

    return () => clearTimeout(timeout);
  }, [focusNodeId, nodes, reactFlowInstance, onFocusComplete]);

  // Process nodes for batch execution state management
  const processNodesForBatchExecution = (originalNodes: Node[]) => {
    // If there's no execution or execution is not active, return nodes as-is
    if (!selectedRun || !selectedRun.status) {
      return originalNodes;
    }

    const isExecutionActive = [
      FlowRunStatus.RUNNING,
      FlowRunStatus.PENDING,
      FlowRunStatus.PAUSED_FOR_BATCH,
    ].includes(selectedRun.status);

    return originalNodes.map((node) => {
      const processedNode = { ...node };
      const nodeData = node.data as ReactFlowNodeData;

      if (isExecutionActive) {
        // If flow is running via batch, set nodes to appropriate states
        if (!nodeData.executionStatus) {
          // Node hasn't been executed yet - set to waiting
          processedNode.data = {
            ...node.data,
            executionStatus: NodeExecutionStatus.PENDING,
          };
        } else if (nodeData.executionStatus === NodeExecutionStatus.BATCH_SUBMITTED) {
          // Node is in batch processing - show as running
          processedNode.data = {
            ...node.data,
            executionStatus: NodeExecutionStatus.RUNNING,
          };
        }
        // Otherwise keep the current execution status (SUCCESS, FAILED, RUNNING, etc.)
      } else {
        // Flow is not active - clean up temporary states but keep final states
        if (
          nodeData.executionStatus &&
          [NodeExecutionStatus.PENDING, NodeExecutionStatus.RUNNING].includes(
            nodeData.executionStatus,
          )
        ) {
          const { executionStatus, executionOutput, executionError, ...cleanData } = nodeData;
          processedNode.data = cleanData;
        }
      }

      return processedNode;
    });
  };

  // Get current version's validation status (versions don't have isValid anymore)
  // const isValidFlow = displayVersion?.isValid;

  // Loading state
  if (loading) {
    return <InvectLoader className="w-full h-full" iconClassName="h-16" label="Loading flow..." />;
  }

  // Error state
  if (queryError) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
          <div className="text-red-800">{JSON.stringify(queryError)}</div>
        </div>
      </div>
    );
  }

  // No flow state
  if (!flowData) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-muted-foreground">No flow data available</div>
      </div>
    );
  }

  return (
    <NodeViewProvider mode="view">
      <div style={{ width: '100%', height: '100%', background: 'var(--canvas-background)' }}>
        <ReactFlow
          nodes={processNodesForBatchExecution(nodes)}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={resolvedTheme}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView={true}
          fitViewOptions={{
            padding: 0.5,
            maxZoom: 1.2,
          }}
          minZoom={0.1}
          maxZoom={4}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={true}
          edgesFocusable={false}
          elementsSelectable={true}
          onNodeClick={(_, node) => onNodeClick?.(node.id)}
          proOptions={{ hideAttribution: true }}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </NodeViewProvider>
  );
}
