import React, { useRef, useCallback, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { FlowLayout } from './FlowLayout';
import { ModeSwitcher } from './ModeSwitcher';
import { NodeSidebar } from './NodeSidebar';
import { ValidationPanel } from './ValidationPanel';
import { LayoutSelector } from '../graph/LayoutSelector';
import { BatchFlowEdge, defaultEdgeOptions } from '../graph';
import { applyLayout, type LayoutAlgorithm } from '~/utils/layoutUtils';
import { generateUniqueDisplayName, generateUniqueReferenceId } from '~/utils/nodeReferenceUtils';
import { GraphNodeType } from '@invect/core/types';
import {
  NodeTypes,
  EdgeTypes,
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  SelectionMode,
  useReactFlow,
  useNodesInitialized,
  type Node,
} from '@xyflow/react';
import { UniversalNode, AgentNode, type ToolDefinition, type AddedToolInstance } from '../nodes';
import { NodeConfigPanel } from './node-config-panel/NodeConfigPanel';
import { ToolConfigPanel } from './ToolConfigPanel';
import { ChatPanel, ChatToggleButton, ChatPromptOverlay } from '~/components/chat';
import { useNodeRegistry } from '~/contexts/NodeRegistryContext';
import { useFlowEditorStore, useIsLoading } from './flow-editor.store';
import { useUIStore } from '~/stores/uiStore';
import { useTheme } from '~/contexts/ThemeProvider';
import {
  AgentToolCallbacksProvider,
  type AgentToolCallbacks,
} from '~/contexts/AgentToolCallbacksContext';
import { InvectLoader } from '../shared/InvectLoader';
import { useAgentTools } from '~/api/agent-tools.api';
import { useNodeExecutions } from '~/api/executions.api';
import { extractOutputValue } from './node-config-panel/utils';
import { nanoid } from 'nanoid';
import { useCopyPaste } from './use-copy-paste';

// Stable references for React Flow - defined at module scope to avoid re-renders
const EDGE_TYPES: EdgeTypes = {
  default: BatchFlowEdge,
};

const FIT_VIEW_OPTIONS = {
  duration: 0,
  padding: 0.2,
} as const;

// Stable empty array to avoid re-render cascades when no tool panel node is selected
const EMPTY_TOOLS: AddedToolInstance[] = [];

// Node dimensions (must match max-w/h in UniversalNode / AgentNode)
const NODE_WIDTH = 240;
const NODE_HEIGHT = 60;
const PLACEMENT_OFFSET = 80; // Larger than NODE_HEIGHT so a single step always clears collisions

/**
 * Finds a position that doesn't overlap any existing node, stepping down-right
 * by PLACEMENT_OFFSET until a clear spot is found.
 */
function findNonOverlappingPosition(
  startX: number,
  startY: number,
  existingNodes: Node[],
): { x: number; y: number } {
  let x = Math.round(startX);
  let y = Math.round(startY);

  const overlaps = (cx: number, cy: number) =>
    existingNodes.some(
      (n) => Math.abs(n.position.x - cx) < NODE_WIDTH && Math.abs(n.position.y - cy) < NODE_HEIGHT,
    );

  while (overlaps(x, y)) {
    x += PLACEMENT_OFFSET;
    y += PLACEMENT_OFFSET;
  }

  return { x, y };
}

export interface FlowEditorProps {
  flowId: string;
  flowVersion?: string;
  basePath?: string;
  initialName?: string;
}

// Edit view shell - displays the flow editor
export function FlowEditor({ flowId, flowVersion, basePath = '' }: FlowEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const addNodeFnRef = useRef<(type: string) => void>(() => {
    // Default implementation
  });
  const [showValidation] = useState(false);
  const [layoutSelector, setLayoutSelector] = useState<React.ReactNode>(null);

  // Use Zustand store for loading state
  const loading = useIsLoading();

  // Sidebar visibility (persisted)
  const nodeSidebarOpen = useUIStore((s) => s.nodeSidebarOpen);
  const toggleNodeSidebar = useUIStore((s) => s.toggleNodeSidebar);

  const handleModeChange = (newMode: 'edit' | 'runs') => {
    if (newMode === 'runs') {
      const runsPath = flowVersion
        ? `${basePath}/flow/${flowId}/runs/version/${flowVersion}`
        : `${basePath}/flow/${flowId}/runs`;
      navigate(runsPath);
    }
  };

  const handleRegisterAddNode = useCallback((fn: (type: string) => void) => {
    addNodeFnRef.current = fn;
  }, []);

  const handleAddNode = useCallback((type: string) => {
    addNodeFnRef.current(type);
  }, []);

  // Sidebar & right panel render state (lifted from FlowWorkbenchView)
  const [sidebarElement, setSidebarElement] = useState<React.ReactNode>(null);
  const [rightPanelElement, setRightPanelElement] = useState<React.ReactNode>(null);

  if (loading) {
    return <InvectLoader className="w-full h-full" iconClassName="h-16" label="Loading flow..." />;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-col flex-1 min-h-0 bg-background text-foreground">
        <FlowLayout
          modeSwitcher={<ModeSwitcher mode="edit" onModeChange={handleModeChange} />}
          layoutSelector={layoutSelector}
          viewportRef={viewportRef}
          sidebar={
            sidebarElement ?? (
              <NodeSidebar mode="nodes" onAddNode={handleAddNode} onCollapse={toggleNodeSidebar} />
            )
          }
          sidebarOpen={nodeSidebarOpen}
          onToggleSidebar={toggleNodeSidebar}
          rightPanel={rightPanelElement}
          chatToggle={<ChatToggleButton />}
          chatPanel={<ChatPanel flowId={flowId} basePath={basePath} />}
          chatOverlay={<ChatPromptOverlay />}
          viewport={
            <FlowWorkbenchView
              flowId={flowId}
              onRegisterAddNode={handleRegisterAddNode}
              onLayoutSelectorRender={setLayoutSelector}
              onAddNode={handleAddNode}
              onSidebarRender={setSidebarElement}
              onRightPanelRender={setRightPanelElement}
            />
          }
        />
      </div>

      {/* Validation panel slides in from right */}
      {showValidation && <ValidationPanel />}
    </div>
  );
}

interface FlowWorkbenchViewProps {
  flowId: string;
  onRegisterAddNode?: (fn: (type: string) => void) => void;
  onLayoutSelectorRender?: (layoutSelector: React.ReactNode) => void;
  /** Callback to add a node (passed from shell, used for sidebar) */
  onAddNode: (type: string) => void;
  /** Renders the sidebar element (NodeSidebar with current mode + props) */
  onSidebarRender: (sidebar: React.ReactNode) => void;
  /** Renders the right panel element (ToolConfigPanel when active) */
  onRightPanelRender: (rightPanel: React.ReactNode | null) => void;
}

export function FlowWorkbenchView({
  flowId,
  onRegisterAddNode,
  onLayoutSelectorRender,
  onAddNode,
  onSidebarRender,
  onRightPanelRender,
}: FlowWorkbenchViewProps) {
  // Get theme for React Flow colorMode
  const { resolvedTheme } = useTheme();

  // === Zustand store: Fine-grained selectors ===
  // Each selector only re-renders when its specific value changes.
  // Previously useFlowEditorStore() without a selector re-rendered on ANY state change
  // (isDirty, flowName, activeFlowRunId, etc.) — even during unrelated updates.

  // Reactive state slices
  const storeNodes = useFlowEditorStore((s) => s.nodes);
  const storeEdges = useFlowEditorStore((s) => s.edges);
  const edgesReady = useFlowEditorStore((s) => s.edgesReady);
  const loading = useFlowEditorStore((s) => s.isLoading);
  const queryError = useFlowEditorStore((s) => s.error);
  const currentLayout = useFlowEditorStore((s) => s.currentLayout);
  const currentDirection = useFlowEditorStore((s) => s.layoutDirection);
  const configNodeId = useFlowEditorStore((s) => s.selectedNodeId);
  const configPanelOpen = useFlowEditorStore((s) => s.configPanelOpen);

  // Actions — stable function references, never trigger re-renders
  const onNodesChange = useFlowEditorStore((s) => s.applyNodeChanges);
  const onEdgesChange = useFlowEditorStore((s) => s.applyEdgeChanges);
  const setNodes = useFlowEditorStore((s) => s.setNodes);
  const onConnect = useFlowEditorStore((s) => s.onConnect);
  const setLayout = useFlowEditorStore((s) => s.setLayout);
  const setLayoutedNodes = useFlowEditorStore((s) => s.setLayoutedNodes);
  const openConfigPanel = useFlowEditorStore((s) => s.openConfigPanel);
  const closeConfigPanel = useFlowEditorStore((s) => s.closeConfigPanel);
  const selectNode = useFlowEditorStore((s) => s.selectNode);
  const markInitialLayoutApplied = useFlowEditorStore((s) => s.markInitialLayoutApplied);
  const needsInitialLayout = useFlowEditorStore((s) => s.needsInitialLayout);
  const setRegistryLoading = useFlowEditorStore((s) => s.setRegistryLoading);
  const setNodesInitialized = useFlowEditorStore((s) => s.setNodesInitialized);
  const setAllNodesHaveDefinitions = useFlowEditorStore((s) => s.setAllNodesHaveDefinitions);
  const updateNodeData = useFlowEditorStore((s) => s.updateNodeData);
  const addNodeToStore = useFlowEditorStore((s) => s.addNode);
  const populateFromRunData = useFlowEditorStore((s) => s.populateFromRunData);

  const { getNodeDefinition, isLoading: registryLoading } = useNodeRegistry();
  const reactFlowInstance = useReactFlow();
  const { fitView } = reactFlowInstance;

  // Copy/paste/cut/duplicate/delete keyboard shortcuts
  useCopyPaste({ flowId, reactFlowInstance });

  // Use React Flow's built-in hook to detect when nodes have been initialized
  // This is true when all nodes have been measured and their handles registered
  const nodesInitializedFromHook = useNodesInitialized();

  // Check that all nodes have their definitions loaded (handles depend on definitions)
  const allNodesHaveDefinitions = useMemo(() => {
    if (storeNodes.length === 0) {
      return false;
    }
    return storeNodes.every((node) => {
      const nodeType = (node.data as { type?: string })?.type;
      return nodeType && getNodeDefinition(nodeType);
    });
  }, [storeNodes, getNodeDefinition]);

  // Sync React Flow / registry state to Zustand for edge readiness tracking
  React.useEffect(() => {
    setRegistryLoading(registryLoading);
  }, [registryLoading, setRegistryLoading]);

  React.useEffect(() => {
    setNodesInitialized(nodesInitializedFromHook);
  }, [nodesInitializedFromHook, setNodesInitialized]);

  React.useEffect(() => {
    setAllNodesHaveDefinitions(allNodesHaveDefinitions);
  }, [allNodesHaveDefinitions, setAllNodesHaveDefinitions]);

  // Handle openNode + fromRunId query params (e.g. navigated from runs view "Edit" button)
  const [searchParams, setSearchParams] = useSearchParams();
  // Capture fromRunId in a ref so it survives URL param cleanup
  const fromRunIdRef = useRef<string | null>(null);
  if (searchParams.get('fromRunId') && !fromRunIdRef.current) {
    fromRunIdRef.current = searchParams.get('fromRunId');
  }

  React.useEffect(() => {
    const openNodeId = searchParams.get('openNode');
    if (openNodeId && storeNodes.length > 0) {
      const nodeExists = storeNodes.some((n) => n.id === openNodeId);
      if (nodeExists) {
        openConfigPanel(openNodeId);
      }
      // Clear the params to avoid re-opening on subsequent renders
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('openNode');
          next.delete('fromRunId');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, storeNodes, openConfigPanel, setSearchParams]);

  // Populate node preview data from a specific flow run (when navigating from runs view)
  const { data: fromRunNodeExecutions } = useNodeExecutions(fromRunIdRef.current ?? '');
  const fromRunPopulatedRef = useRef(false);
  React.useEffect(() => {
    if (
      !fromRunIdRef.current ||
      !fromRunNodeExecutions?.length ||
      storeNodes.length === 0 ||
      fromRunPopulatedRef.current
    ) {
      return;
    }
    fromRunPopulatedRef.current = true;

    const nodeExecutionMap: Record<string, { inputs?: unknown; outputs?: unknown }> = {};
    for (const exec of fromRunNodeExecutions) {
      const extracted = extractOutputValue(exec.outputs);
      nodeExecutionMap[exec.nodeId] = {
        inputs: exec.inputs,
        outputs: extracted ?? undefined,
      };
    }
    populateFromRunData(nodeExecutionMap);
  }, [fromRunNodeExecutions, storeNodes, populateFromRunData]);

  const dialogContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingNodeRef = useRef(false);
  const isShiftKeyHeldRef = useRef(false);
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tool panel state for Agent nodes
  const [toolSelectorPanelOpen, setToolSelectorPanelOpen] = useState(false);
  const [toolConfigPanelOpen, setToolConfigPanelOpen] = useState(false);
  const [toolPanelNodeId, setToolPanelNodeId] = useState<string | null>(null);
  const [selectedToolInstanceId, setSelectedToolInstanceId] = useState<string | null>(null);

  // Tracks which tool instance to pre-select when opening the config panel from AgentToolsBox
  const [configPanelToolInstanceId, setConfigPanelToolInstanceId] = useState<string | null>(null);

  // Sidebar mode: "nodes" (default) or "actions" (when editing agent tools)
  const sidebarMode = toolSelectorPanelOpen ? ('actions' as const) : ('nodes' as const);

  // Fetch available tools from API using React Query
  const { data: agentToolsData } = useAgentTools();

  // Transform API response to ToolDefinition format
  const availableTools: ToolDefinition[] = useMemo(() => {
    if (!agentToolsData) {
      return [];
    }
    return agentToolsData
      .filter((tool) => tool.provider?.id !== 'triggers' && !tool.id.startsWith('trigger.'))
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category as ToolDefinition['category'],
        tags: tool.tags,
        inputSchema: tool.inputSchema,
        nodeType: tool.nodeType, // Include nodeType for fetching node definition params
        docsUrl: undefined, // API doesn't provide this yet
        provider: tool.provider, // Provider info for grouping and branding
      }));
  }, [agentToolsData]);

  // Create stable callback refs for tool selector (to avoid re-renders when passing to nodes)
  const openToolSelectorRef = useRef<(nodeId: string) => void>(() => {
    // noop
  });
  const showMoreToolsRef = useRef<(nodeId: string) => void>(() => {
    // noop
  });
  const removeToolRef = useRef<(nodeId: string, toolId: string) => void>(() => {
    // noop
  });
  const toolClickRef = useRef<(nodeId: string, instanceId: string) => void>(() => {
    // noop
  });

  // Track shift key state to prevent config panel opening during drag selection
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftKeyHeldRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftKeyHeldRef.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Agent tool callbacks provided via context so AgentNode can read them directly.
  // This avoids the expensive pattern of remapping ALL nodes on every render just to
  // inject callbacks into Agent node data — which created new object references for
  // every node on every drag, defeating React Flow's internal shallow comparison.
  const agentToolCallbacks = useMemo<AgentToolCallbacks>(
    () => ({
      onOpenToolSelector: (nodeId: string) => openToolSelectorRef.current(nodeId),
      onShowMoreTools: (nodeId: string) => showMoreToolsRef.current(nodeId),
      onRemoveTool: (nodeId: string, instanceId: string) =>
        removeToolRef.current(nodeId, instanceId),
      onToolClick: (nodeId: string, instanceId: string) => toolClickRef.current(nodeId, instanceId),
      availableTools,
      selectedToolNodeId: toolPanelNodeId,
      selectedToolInstanceId,
    }),
    [availableTools, toolPanelNodeId, selectedToolInstanceId],
  );

  // Only pass edges to React Flow after edgesReady is true (from Zustand store)
  // This prevents "Couldn't create edge for source handle" errors on initial load
  const edges = edgesReady ? storeEdges : [];

  // Handle layout changes (user-triggered)
  // Reads nodes via getState() at call-time so callback doesn't recreate on every drag
  const handleLayoutChange = useCallback(
    async (algorithm: LayoutAlgorithm, direction: 'TB' | 'BT' | 'LR' | 'RL' = 'LR') => {
      setLayout(algorithm, direction);
      const { nodes: currentNodes, edges: currentEdges } = useFlowEditorStore.getState();
      const { nodes: layoutedNodes } = await applyLayout(
        currentNodes,
        currentEdges,
        algorithm,
        direction,
      );
      setLayoutedNodes(layoutedNodes);
      // Fit view after layout change - use animation for user-triggered changes
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
      }, 50);
    },
    [setLayout, setLayoutedNodes, fitView],
  );

  // Apply initial layout when nodes first load (using Zustand state)
  React.useEffect(() => {
    if (needsInitialLayout()) {
      markInitialLayoutApplied();
      const { nodes: currentNodes, edges: currentEdges } = useFlowEditorStore.getState();
      applyLayout(currentNodes, currentEdges, currentLayout, currentDirection).then(
        ({ nodes: layoutedNodes }) => {
          setNodes(layoutedNodes);
        },
      );
    }
  }, [
    needsInitialLayout,
    markInitialLayoutApplied,
    storeNodes,
    storeEdges,
    currentLayout,
    currentDirection,
    setNodes,
  ]);

  // Fit view once after initial render - triggered by onInit
  // Uses getState() instead of depending on nodes to avoid recreating on every position change
  const handleReactFlowInit = useCallback(() => {
    const currentNodes = useFlowEditorStore.getState().nodes;
    if (currentNodes.length > 0) {
      const hasValidPositions = currentNodes.some(
        (node) => node.position.x !== 0 || node.position.y !== 0,
      );

      if (hasValidPositions) {
        fitView({ padding: 0.2, duration: 0 });
      } else {
        // Layout is still being applied, wait and retry
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 0 });
        }, 100);
      }
    }
  }, [fitView]);

  // Close config panel if the selected node is deleted (already handled by removeNode in store,
  // but we keep this as a safety check for edge cases)
  React.useEffect(() => {
    if (configNodeId && !storeNodes.some((candidate) => candidate.id === configNodeId)) {
      closeConfigPanel();
      selectNode(null);
    }
  }, [configNodeId, storeNodes, closeConfigPanel, selectNode]);

  const handleNodeDoubleClick = useCallback(
    (event: React.MouseEvent, clickedNode: Node) => {
      if (isDraggingNodeRef.current || isShiftKeyHeldRef.current) {
        return;
      }
      setConfigPanelToolInstanceId(null); // reset tool pre-selection
      openConfigPanel(clickedNode.id);
    },
    [openConfigPanel],
  );

  const handleSelectionChange = useCallback<
    NonNullable<React.ComponentProps<typeof ReactFlow>['onSelectionChange']>
  >(
    ({ nodes: selectedNodes }) => {
      if (isDraggingNodeRef.current || isShiftKeyHeldRef.current) {
        return;
      }
      // Only close the panel when selection is cleared, don't open on selection
      // Opening is handled by double-click only
      if (selectedNodes.length === 0) {
        closeConfigPanel();
        selectNode(null);
      }
    },
    [closeConfigPanel, selectNode],
  );

  const handlePanelOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        // Panel is being opened - this shouldn't happen via this callback
      } else {
        closeConfigPanel();
        selectNode(null);
        setConfigPanelToolInstanceId(null);
      }
    },
    [closeConfigPanel, selectNode],
  );

  // Tool panel handlers for Agent nodes
  const _setNodeSidebarOpen = useUIStore((s) => s.setNodeSidebarOpen);

  const handleOpenToolSelector = useCallback(
    (nodeId: string) => {
      // Open NodeConfigPanel for this node — the Tools tab will show
      setConfigPanelToolInstanceId(null);
      openConfigPanel(nodeId);
    },
    [openConfigPanel],
  );

  // Opens tool selector panel (show more from agent tools box)
  const handleShowMoreTools = useCallback(
    (nodeId: string) => {
      setConfigPanelToolInstanceId(null);
      openConfigPanel(nodeId);
    },
    [openConfigPanel],
  );

  // Opens tool config panel when a tool instance is clicked
  const handleToolClick = useCallback(
    (nodeId: string, instanceId: string) => {
      setConfigPanelToolInstanceId(instanceId);
      openConfigPanel(nodeId);
    },
    [openConfigPanel],
  );

  // Close tool selector (returns sidebar to nodes mode)
  const handleCloseToolSelector = useCallback(() => {
    setToolSelectorPanelOpen(false);
    setToolConfigPanelOpen(false);
    setSelectedToolInstanceId(null);
    setToolPanelNodeId(null);
  }, []);

  // Close tool config panel
  const handleCloseToolConfig = useCallback(() => {
    setToolConfigPanelOpen(false);
    setSelectedToolInstanceId(null);
  }, []);

  // Handle selecting a tool instance for configuration (from selector panel)
  const handleSelectToolInstance = useCallback((instance: AddedToolInstance) => {
    setSelectedToolInstanceId(instance.instanceId);
    setToolConfigPanelOpen(true);
  }, []);

  // Keep refs in sync with callbacks
  openToolSelectorRef.current = handleOpenToolSelector;
  showMoreToolsRef.current = handleShowMoreTools;
  toolClickRef.current = handleToolClick;

  // Get added tools for the currently selected node
  // Reads nodes via getState() at call-time — stable callback, no storeNodes dependency
  const getAddedToolsForNode = useCallback((nodeId: string): AddedToolInstance[] => {
    const node = useFlowEditorStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) {
      return [];
    }
    const params = (node.data as Record<string, unknown>)?.params as Record<string, unknown>;
    return (params?.addedTools as AddedToolInstance[]) || [];
  }, []);

  const handleAddToolToNode = useCallback(
    (toolId: string): string => {
      if (!toolPanelNodeId) {
        return '';
      }
      const node = useFlowEditorStore.getState().nodes.find((n) => n.id === toolPanelNodeId);
      if (!node) {
        return '';
      }

      // Find the tool definition to get default name/description
      const toolDef = availableTools.find((t) => t.id === toolId);
      if (!toolDef) {
        return '';
      }

      // Create a new tool instance with unique ID
      const instanceId = nanoid();
      const newInstance: AddedToolInstance = {
        instanceId,
        toolId: toolId,
        name: toolDef.name,
        description: toolDef.description,
        params: {},
      };

      const currentTools = getAddedToolsForNode(toolPanelNodeId);
      updateNodeData(toolPanelNodeId, {
        params: {
          ...((node.data as Record<string, unknown>)?.params as Record<string, unknown>),
          addedTools: [...currentTools, newInstance],
        },
      });

      return instanceId;
    },
    [toolPanelNodeId, availableTools, getAddedToolsForNode, updateNodeData],
  );

  const handleRemoveToolFromNode = useCallback(
    (instanceId: string) => {
      if (!toolPanelNodeId) {
        return;
      }
      const node = useFlowEditorStore.getState().nodes.find((n) => n.id === toolPanelNodeId);
      if (!node) {
        return;
      }

      const currentTools = getAddedToolsForNode(toolPanelNodeId);
      updateNodeData(toolPanelNodeId, {
        params: {
          ...((node.data as Record<string, unknown>)?.params as Record<string, unknown>),
          addedTools: currentTools.filter((t) => t.instanceId !== instanceId),
        },
      });
      // If we just removed the tool that's being configured, close config panel
      if (selectedToolInstanceId === instanceId) {
        setToolConfigPanelOpen(false);
        setSelectedToolInstanceId(null);
      }
    },
    [toolPanelNodeId, getAddedToolsForNode, selectedToolInstanceId, updateNodeData],
  );

  const handleUpdateToolInNode = useCallback(
    (instanceId: string, updates: Partial<Omit<AddedToolInstance, 'instanceId' | 'toolId'>>) => {
      if (!toolPanelNodeId) {
        return;
      }
      const node = useFlowEditorStore.getState().nodes.find((n) => n.id === toolPanelNodeId);
      if (!node) {
        return;
      }

      const currentTools = getAddedToolsForNode(toolPanelNodeId);
      updateNodeData(toolPanelNodeId, {
        params: {
          ...((node.data as Record<string, unknown>)?.params as Record<string, unknown>),
          addedTools: currentTools.map((t) =>
            t.instanceId === instanceId ? { ...t, ...updates } : t,
          ),
        },
      });
    },
    [toolPanelNodeId, getAddedToolsForNode, updateNodeData],
  );

  // Helper to remove tool from a specific node (used by AgentNode directly)
  const handleRemoveToolFromSpecificNode = useCallback(
    (nodeId: string, instanceId: string) => {
      const node = useFlowEditorStore.getState().nodes.find((n) => n.id === nodeId);
      if (!node) {
        return;
      }

      const params = (node.data as Record<string, unknown>)?.params as Record<string, unknown>;
      const currentTools = (params?.addedTools as AddedToolInstance[]) || [];
      updateNodeData(nodeId, {
        params: {
          ...params,
          addedTools: currentTools.filter((t) => t.instanceId !== instanceId),
        },
      });
    },
    [updateNodeData],
  );

  // Keep ref in sync with callback
  removeToolRef.current = handleRemoveToolFromSpecificNode;

  const handleNodeDragStart = useCallback(() => {
    if (dragEndTimeoutRef.current) {
      clearTimeout(dragEndTimeoutRef.current);
      dragEndTimeoutRef.current = null;
    }
    isDraggingNodeRef.current = true;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    if (dragEndTimeoutRef.current) {
      clearTimeout(dragEndTimeoutRef.current);
    }
    dragEndTimeoutRef.current = setTimeout(() => {
      isDraggingNodeRef.current = false;
      dragEndTimeoutRef.current = null;
    }, 150);
  }, []);

  React.useEffect(() => {
    return () => {
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
        dragEndTimeoutRef.current = null;
      }
    };
  }, []);

  // Register add-node function for sidebar
  // Reads nodes via getState() at call-time — stable callback, doesn't recreate on every drag
  const createNewNode = useCallback(
    (type: string) => {
      const definition = getNodeDefinition(type);

      // Enforce maxInstances: check if adding this node would exceed the limit
      if (definition?.maxInstances !== null && definition?.maxInstances !== undefined) {
        const currentNodes = useFlowEditorStore.getState().nodes;
        const existingCount = currentNodes.filter(
          (n) => (n.data as Record<string, unknown>)?.type === type,
        ).length;
        if (existingCount >= definition.maxInstances) {
          console.warn(
            `[Node Limit] Cannot add another "${definition.label}" — only ${definition.maxInstances} allowed per flow.`,
          );
          return;
        }
      }

      const id = `${type}-${Date.now()}`;

      const fieldDefaults = (definition?.paramFields || []).reduce<Record<string, unknown>>(
        (acc, field) => {
          if (field.defaultValue !== undefined) {
            acc[field.name] = field.defaultValue;
          }
          return acc;
        },
        {},
      );

      const defaultParams = {
        ...definition?.defaultParams,
        ...fieldDefaults,
      };

      const baseDisplayName = definition?.label || type;
      const currentNodes = useFlowEditorStore.getState().nodes;
      const displayName = generateUniqueDisplayName(baseDisplayName, currentNodes);
      const referenceId = generateUniqueReferenceId(displayName, currentNodes);

      // Determine starting position for placement:
      // - No nodes: use viewport center so the first node appears where the user is looking
      // - Has nodes: cascade from the last added node to guarantee visible separation
      let startX: number;
      let startY: number;
      if (currentNodes.length === 0) {
        const viewportCenter = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        startX = Math.round(viewportCenter.x - NODE_WIDTH / 2);
        startY = Math.round(viewportCenter.y - NODE_HEIGHT / 2);
      } else {
        const lastNode = currentNodes[currentNodes.length - 1];
        startX = lastNode.position.x + PLACEMENT_OFFSET;
        startY = lastNode.position.y + PLACEMENT_OFFSET;
      }

      const position = findNonOverlappingPosition(startX, startY, currentNodes);

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          display_name: displayName,
          reference_id: referenceId,
          type,
          params: defaultParams,
        },
      };

      addNodeToStore(newNode);
    },
    [getNodeDefinition, addNodeToStore, reactFlowInstance],
  );

  React.useEffect(() => {
    if (onRegisterAddNode) {
      onRegisterAddNode(createNewNode);
    }
  }, [onRegisterAddNode, createNewNode]);

  // Render layout selector
  React.useEffect(() => {
    if (onLayoutSelectorRender) {
      onLayoutSelectorRender(
        <LayoutSelector currentLayout={currentLayout} onLayoutChange={handleLayoutChange} />,
      );
    }
  }, [currentLayout, handleLayoutChange, onLayoutSelectorRender]);

  // Compute current added tools and selected tool instance for panels.
  // IMPORTANT: useMemo to avoid creating a new [] reference every render,
  // which would cascade into the onSidebarRender effect → setSidebarElement → re-render loop.
  const currentNodeAddedTools = useMemo(() => {
    if (!toolPanelNodeId) {
      return EMPTY_TOOLS;
    }
    return getAddedToolsForNode(toolPanelNodeId);
  }, [toolPanelNodeId, getAddedToolsForNode, storeNodes]);
  const selectedToolInstance = selectedToolInstanceId
    ? (currentNodeAddedTools.find((t) => t.instanceId === selectedToolInstanceId) ?? null)
    : null;
  const selectedToolDef = selectedToolInstance
    ? (availableTools.find((t) => t.id === selectedToolInstance.toolId) ?? null)
    : null;

  // Push sidebar element to shell (switches between nodes / actions mode)
  const toggleNodeSidebar = useUIStore((s) => s.toggleNodeSidebar);
  React.useEffect(() => {
    onSidebarRender(
      <NodeSidebar
        mode={sidebarMode}
        onAddNode={onAddNode}
        onCollapse={toggleNodeSidebar}
        onClose={sidebarMode === 'actions' ? handleCloseToolSelector : undefined}
        availableTools={availableTools}
        addedTools={currentNodeAddedTools}
        onAddTool={handleAddToolToNode}
        onRemoveTool={handleRemoveToolFromNode}
        onSelectTool={handleSelectToolInstance}
        selectedInstanceId={selectedToolInstanceId}
      />,
    );
  }, [
    sidebarMode,
    onAddNode,
    toggleNodeSidebar,
    handleCloseToolSelector,
    availableTools,
    currentNodeAddedTools,
    handleAddToolToNode,
    handleRemoveToolFromNode,
    handleSelectToolInstance,
    selectedToolInstanceId,
    onSidebarRender,
  ]);

  // Push right panel element to shell (tool config panel when active)
  React.useEffect(() => {
    if (toolConfigPanelOpen && selectedToolDef && selectedToolInstance) {
      onRightPanelRender(
        <ToolConfigPanel
          open={toolConfigPanelOpen}
          onClose={handleCloseToolConfig}
          tool={selectedToolDef}
          instance={selectedToolInstance}
          onUpdate={handleUpdateToolInNode}
          onRemove={handleRemoveToolFromNode}
          portalContainer={dialogContainerRef.current}
        />,
      );
    } else {
      onRightPanelRender(null);
    }
  }, [
    toolConfigPanelOpen,
    selectedToolDef,
    selectedToolInstance,
    handleCloseToolConfig,
    handleUpdateToolInNode,
    handleRemoveToolFromNode,
    onRightPanelRender,
  ]);

  // Node types registry — AGENT gets a custom component, everything else
  // renders as UniversalNode. Known action types are registered explicitly
  // from nodeDefinitions to avoid ReactFlow's fallback CSS class
  // (.react-flow__node-default) which adds unwanted border/padding.
  // The "default" key catches any truly unknown types (e.g. pasted from SDK).
  const { nodeDefinitions } = useNodeRegistry();
  const nodeTypes: NodeTypes = useMemo(() => {
    // @ts-ignore React 19 vs 18 type mismatch in @xyflow/react
    // eslint-disable-next-line typescript/no-explicit-any -- React node components require generic any props
    const mapping: Record<string, React.ComponentType<any>> = {
      [GraphNodeType.AGENT]: AgentNode,
      default: UniversalNode,
    };
    for (const def of nodeDefinitions) {
      if (!(def.type in mapping)) {
        mapping[def.type] = UniversalNode;
      }
    }
    return mapping;
  }, [nodeDefinitions]);

  if (loading) {
    return <InvectLoader className="w-full h-full" iconClassName="h-16" label="Loading flow..." />;
  }

  if (queryError) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="p-4 text-red-800 border border-red-200 rounded bg-red-50">
          Error: {queryError}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{ width: '100%', height: '100%', background: 'var(--canvas-background)' }}
        ref={dialogContainerRef}
      >
        <AgentToolCallbacksProvider value={agentToolCallbacks}>
          <ReactFlow
            nodes={storeNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={handleNodeDoubleClick}
            onSelectionChange={handleSelectionChange}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={EDGE_TYPES}
            defaultEdgeOptions={defaultEdgeOptions}
            colorMode={resolvedTheme}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            onInit={handleReactFlowInit}
            panOnDrag={[1, 2]}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnScroll
          >
            <Controls />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
          </ReactFlow>
        </AgentToolCallbacksProvider>
      </div>
      <NodeConfigPanel
        open={configPanelOpen}
        nodeId={configNodeId}
        flowId={flowId}
        onOpenChange={handlePanelOpenChange}
        portalContainer={dialogContainerRef.current}
        availableTools={availableTools}
        initialToolInstanceId={configPanelToolInstanceId}
      />
    </>
  );
}
