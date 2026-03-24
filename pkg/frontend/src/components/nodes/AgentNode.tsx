'use client';

import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Card } from '../ui/card';
import { useNodeRegistry } from '../../contexts/NodeRegistryContext';
import { GraphNodeType, NodeExecutionStatus } from '@invect/core/types';
import { cn } from '../../lib/utils';
import { Loader2, Bot } from 'lucide-react';
import { NodeAppendix, type AppendixPosition } from './NodeAppendix';
import { AgentToolsBox } from './AgentToolsBox';
import type { ToolDefinition, AddedToolInstance } from './ToolSelectorModal';
import { useAgentToolCallbacks } from '../../contexts/AgentToolCallbacksContext';

// Stable style objects for Handles - avoids creating new objects on every render
const INPUT_HANDLE_STYLE = { top: '50%', transform: 'translate(-54%, -50%)' } as const;
const OUTPUT_HANDLE_STYLE_SINGLE = { top: '50%', transform: 'translate(54%, -50%)' } as const;
const OUTPUT_HANDLE_INNER_STYLE = { transform: 'translateX(54%)' } as const;
const HANDLE_CLASS =
  '!bg-background !w-4 !h-4 !border-2 !border-muted-foreground !rounded-full !transition-colors hover:!bg-muted hover:!border-foreground !shadow-none !ring-0';

interface AgentNodeData extends Record<string, unknown> {
  type?: GraphNodeType;
  display_name?: string;
  executionStatus?: NodeExecutionStatus;
  params?: {
    /** Added tool instances with their configurations */
    addedTools?: AddedToolInstance[];
    /** All available tools (populated by parent for tool resolution) */
    availableTools?: ToolDefinition[];
    toolsPosition?: AppendixPosition;
    [key: string]: unknown;
  };
  // Event handlers (injected by FlowEditor)
  /** Opens the tool selector modal */
  onOpenToolSelector?: () => void;
  /** Opens the tool selector modal with "show selected" filter enabled */
  onShowMoreTools?: () => void;
  /** Removes a tool instance from this node */
  onRemoveTool?: (instanceId: string) => void;
  /** Called when user clicks on a tool (to configure it) */
  onToolClick?: (tool: AddedToolInstance) => void;
  onToolsPositionChange?: (position: AppendixPosition) => void;
}

/**
 * Loading placeholder shown while node definition is being fetched.
 */
const AgentNodeLoadingPlaceholder = memo(
  ({ data, selected }: { data: AgentNodeData; selected: boolean }) => {
    const label = data.display_name || 'AI Agent';

    return (
      <Card
        className={`relative min-w-[200px] max-w-[240px] h-[60px] flex-row py-0 items-center cursor-move transition-colors bg-card hover:bg-card/80 ${
          selected
            ? 'border-blue-500 dark:border-blue-400 shadow-lg shadow-blue-500/25 dark:shadow-blue-400/30'
            : 'border-sidebar-ring hover:border-muted-foreground'
        }`}
      >
        <Handle
          id="input"
          type="target"
          position={Position.Left}
          style={INPUT_HANDLE_STYLE}
          className={HANDLE_CLASS}
        />

        <div className="flex items-center gap-3 px-3 py-0 overflow-hidden">
          <div className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-muted">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-card-foreground truncate tracking-tight">
              {label}
            </div>
            <div className="text-xs text-muted-foreground truncate tracking-tight">AGENT</div>
          </div>
        </div>

        <Handle
          id="output"
          type="source"
          position={Position.Right}
          style={OUTPUT_HANDLE_STYLE_SINGLE}
          className={HANDLE_CLASS}
        />
      </Card>
    );
  },
);

AgentNodeLoadingPlaceholder.displayName = 'AgentNodeLoadingPlaceholder';

/**
 * AgentNode - A specialized node for AI Agents with an attached tools box
 *
 * This node renders like the UniversalNode but with an additional "appendix"
 * panel that displays and manages the tools available to the agent.
 */
export const AgentNode = memo(({ id, data, selected }: NodeProps) => {
  const typedData = data as AgentNodeData;
  const nodeType = GraphNodeType.AGENT;

  const { getNodeDefinition, isLoading: registryLoading } = useNodeRegistry();
  const definition = getNodeDefinition(nodeType);

  // Read callbacks and available tools from context instead of data injection.
  // This avoids the parent having to remap ALL nodes just to inject these into Agent data.
  const toolCallbacks = useAgentToolCallbacks();

  // Local state for tools position (can be controlled externally via data.params.toolsPosition)
  const [localToolsPosition, setLocalToolsPosition] = useState<AppendixPosition>('bottom');
  const toolsPosition = typedData.params?.toolsPosition ?? localToolsPosition;

  // Available tools from context (provided by FlowEditor), falling back to data injection for non-editor views
  const availableTools: ToolDefinition[] =
    toolCallbacks?.availableTools ?? typedData.params?.availableTools ?? [];

  // Get added tool instances from params
  const addedTools: AddedToolInstance[] = typedData.params?.addedTools ?? [];

  // Handle position change
  const handlePositionChange = useCallback(
    (position: AppendixPosition) => {
      setLocalToolsPosition(position);
      typedData.onToolsPositionChange?.(position);
    },
    [typedData],
  );

  // Show loading placeholder if registry is still loading or definition not found
  if (registryLoading || !definition) {
    return <AgentNodeLoadingPlaceholder data={typedData} selected={selected ?? false} />;
  }

  const label = typedData.display_name || definition.label || 'AI Agent';

  // Agent nodes always use green/AI color
  const iconColorClass = 'bg-green-500/15 text-green-600 dark:text-green-400';

  // Get handle definitions from the node definition
  const inputHandle = definition.input;
  const outputs = definition.outputs || [];

  const hasIncomingHandle = !!inputHandle;

  // Check execution status for running state
  const isRunning =
    typedData.executionStatus === NodeExecutionStatus.RUNNING ||
    typedData.executionStatus === NodeExecutionStatus.PENDING ||
    typedData.executionStatus === NodeExecutionStatus.BATCH_SUBMITTED;
  const isSuccess = typedData.executionStatus === NodeExecutionStatus.SUCCESS;
  const isError = typedData.executionStatus === NodeExecutionStatus.FAILED;
  const isSkipped = typedData.executionStatus === NodeExecutionStatus.SKIPPED;

  const outputHandleConfigs = outputs.map((output, index) => {
    if (outputs.length === 1) {
      return { output, topPercent: 50 };
    }
    const EDGE_OFFSET = 28;
    const availableSpace = 100 - EDGE_OFFSET * 2;
    const topPercent = EDGE_OFFSET + (index / (outputs.length - 1)) * availableSpace;
    return { output, topPercent };
  });

  return (
    <div className="relative">
      {/* Main node card */}
      <Card
        className={cn(
          'relative min-w-[200px] max-w-[240px] h-[60px] flex-row py-0 items-center cursor-move transition-colors bg-card hover:bg-card/80',
          // Default border
          !isRunning &&
            !isSuccess &&
            !isError &&
            !isSkipped &&
            'border-sidebar-ring hover:border-muted-foreground',
          // Running state - animated gradient border
          isRunning && 'node-running-border animate-node-border rounded-xl',
          // Success state - green border
          isSuccess && 'border-2 border-green-500 shadow-lg shadow-green-500/20',
          // Error state - red border
          isError && 'border-2 border-red-500 shadow-lg shadow-red-500/20',
          // Skipped state - greyed out with dashed border
          isSkipped && 'border-2 border-dashed border-muted-foreground/50 opacity-50',
          // Selection state - change existing border color to blue for visibility
          selected &&
            !isRunning &&
            !isSuccess &&
            !isError &&
            !isSkipped &&
            'border-blue-500 dark:border-blue-400 shadow-lg shadow-blue-500/25 dark:shadow-blue-400/30',
        )}
      >
        {/* Unified Input Handle */}
        {hasIncomingHandle && (
          <Handle
            id={inputHandle?.id || 'input'}
            type="target"
            position={Position.Left}
            style={INPUT_HANDLE_STYLE}
            className={HANDLE_CLASS}
          />
        )}

        <div className="flex items-center gap-3 px-3 py-0 overflow-hidden">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconColorClass}`}
          >
            <Bot className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-card-foreground truncate tracking-tight">
              {label}
            </div>
            <div className="text-xs text-muted-foreground truncate tracking-tight">{nodeType}</div>
          </div>
        </div>

        {/* Output Handles */}
        {outputHandleConfigs.map(({ output, topPercent }) => {
          const showLabel = outputs.length > 1;
          return (
            <div
              key={output.id}
              className="absolute right-0"
              style={{ top: `${topPercent}%`, transform: 'translateY(-50%)' }}
            >
              <div className="relative flex items-center">
                <Handle
                  id={output.id}
                  type="source"
                  position={Position.Right}
                  style={OUTPUT_HANDLE_INNER_STYLE}
                  className="!relative !bg-background !w-4 !h-4 !border-2 !border-muted-foreground !rounded-full !transition-colors hover:!bg-muted hover:!border-foreground !shadow-none !ring-0"
                />
                {showLabel && (
                  <div className="absolute px-1 text-xs border rounded left-8 text-card-foreground whitespace-nowrap bg-card border-sidebar-ring">
                    {output.label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Tools Appendix - attached to the node */}
      <NodeAppendix
        position={toolsPosition}
        onPositionChange={handlePositionChange}
        showPositionToggle={true}
      >
        <AgentToolsBox
          tools={addedTools}
          availableTools={availableTools}
          onAddTool={
            toolCallbacks
              ? () => toolCallbacks.onOpenToolSelector(id)
              : typedData.onOpenToolSelector
          }
          onShowMore={
            toolCallbacks ? () => toolCallbacks.onShowMoreTools(id) : typedData.onShowMoreTools
          }
          onToolClick={
            toolCallbacks
              ? (tool: AddedToolInstance) => toolCallbacks.onToolClick(id, tool.instanceId)
              : typedData.onToolClick
          }
          onRemoveTool={
            toolCallbacks
              ? (instanceId: string) => toolCallbacks.onRemoveTool(id, instanceId)
              : typedData.onRemoveTool
          }
        />
      </NodeAppendix>
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
