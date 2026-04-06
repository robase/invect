import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { GraphNodeType, type ReactFlowNodeData } from '@invect/core/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { ResizablePanelGroup, ResizableHandle } from '../../ui/resizable';
import { cn } from '../../../lib/utils';
import { useNodeRegistry } from '../../../contexts/NodeRegistryContext';
import {
  useCredentials,
  useCreateCredential,
  useUpdateCredential,
  useTestCredential,
  useStartOAuth2Flow,
  useHandleOAuth2Callback,
} from '../../../api/credentials.api';
import { useExecuteFlowToNode, useTestNode } from '../../../api/executions.api';
import { useTestMapper } from '../../../api/node-data.api';
import { CreateCredentialModal } from '../../credentials/CreateCredentialModal';
import { EditCredentialModal } from '../../credentials/EditCredentialModal';
import type { Credential } from '../../../api/types';

import { formatNodeTypeLabel, getIconComponent } from './utils';
import { useNodeConfigState } from './use-node-config-state';
import { updateReferenceIdForDisplayName } from '../../../utils/nodeReferenceUtils';
import { useFlowActions } from '../../../routes/flow-route-layout';
import { usePreviewState, useNodeExecution } from './hooks';
import { useUpstreamSlots } from './hooks/use-upstream-slots';
import { InputPanel, OutputPanel, ConfigurationPanel } from './panels';
import { useFlowEditorStore } from '../flow-editor.store';
import type { ToolDefinition, AddedToolInstance } from '../../nodes/ToolSelectorModal';

interface NodeConfigPanelProps {
  nodeId: string | null;
  flowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalContainer?: HTMLElement | null;
  /** Available agent tools — only needed for AGENT node type */
  availableTools?: ToolDefinition[];
  /** If set, open the Tools tab with this instance pre-selected */
  initialToolInstanceId?: string | null;
}

export function NodeConfigPanel({
  nodeId,
  flowId,
  open,
  onOpenChange,
  portalContainer,
  availableTools = [],
  initialToolInstanceId,
}: NodeConfigPanelProps) {
  const { getNodeDefinition } = useNodeRegistry();

  // Use Zustand store for all node state (single source of truth)
  const updateNodeDataInStore = useFlowEditorStore((s) => s.updateNodeData);
  const storeNodes = useFlowEditorStore((s) => s.nodes);

  // Find the current node from our Zustand store
  const node = useMemo(() => {
    if (!nodeId) {
      return null;
    }
    return storeNodes.find((n) => n.id === nodeId) ?? null;
  }, [nodeId, storeNodes]);

  // Access node data - cast to ReactFlowNodeData for proper typing
  // At runtime, nodes from the server always have this shape
  const nodeData = node?.data as ReactFlowNodeData | undefined;
  const nodeType = nodeData?.type ?? GraphNodeType.TEMPLATE_STRING;
  const nodeParams = nodeData?.params ?? {};
  const definition = node ? getNodeDefinition(nodeType) : undefined;

  // Node configuration state (validation, dynamic fields)
  const {
    definition: activeDefinition,
    values: formValues,
    warnings: configWarnings,
    errors: configErrors,
    updateField,
    isUpdating: isConfigUpdating,
  } = useNodeConfigState({ node: node ?? null, nodeType, definition });

  const flowActions = useFlowActions();
  const executeFlowToNodeMutation = useExecuteFlowToNode();
  const testNodeMutation = useTestNode();
  const testMapperMutation = useTestMapper();

  // Upstream slots — replaces computeInputFromEdges + handleRunUpstreamNode
  const upstream = useUpstreamSlots({ nodeId, flowId });

  // Preview state (input/output)
  const previewState = usePreviewState({ nodeId, updateNodeData: updateNodeDataInStore });

  // Credential modal state
  const [isCreateCredentialOpen, setIsCreateCredentialOpen] = useState(false);
  const [activeCredentialField, setActiveCredentialField] = useState<string | null>(null);

  // Edit credential state
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const updateCredentialMutation = useUpdateCredential();

  // OAuth refresh state
  const testCredentialMutation = useTestCredential();
  const startOAuth2Flow = useStartOAuth2Flow();
  const handleOAuth2Callback = useHandleOAuth2Callback();
  const [refreshingCredentialId, setRefreshingCredentialId] = useState<string | null>(null);
  const [oauthPopupWindow, setOAuthPopupWindow] = useState<Window | null>(null);
  const oauthCallbackParamsRef = useRef<{ credentialId: string } | null>(null);

  // Listen for OAuth callback message from popup (for credential refresh)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const { type, code, state, error } = event.data;
      if (type !== 'oauth2_callback') return;

      if (oauthPopupWindow && !oauthPopupWindow.closed) {
        oauthPopupWindow.close();
      }
      setOAuthPopupWindow(null);

      if (error || !code || !state) {
        setRefreshingCredentialId(null);
        return;
      }

      try {
        await handleOAuth2Callback.mutateAsync({ code, state });
      } catch {
        // Credential cache is invalidated by the mutation hook on success
      }
      setRefreshingCredentialId(null);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [oauthPopupWindow, handleOAuth2Callback]);

  // Check if popup was closed without completing
  useEffect(() => {
    if (!oauthPopupWindow) return;
    const check = setInterval(() => {
      if (oauthPopupWindow.closed) {
        clearInterval(check);
        setOAuthPopupWindow(null);
        setRefreshingCredentialId(null);
      }
    }, 500);
    return () => clearInterval(check);
  }, [oauthPopupWindow]);

  // Mapper config state — stored in node data as `mapper`
  const mapperConfig = (nodeData as Record<string, unknown> | undefined)?.mapper as
    | {
        enabled: boolean;
        expression: string;
        mode: 'auto' | 'iterate' | 'reshape';
        outputMode: 'array' | 'object' | 'first' | 'last' | 'concat';
        keyField?: string;
        concurrency: number;
        onEmpty: 'skip' | 'error';
      }
    | undefined;

  const handleMapperChange = useCallback(
    (config: typeof mapperConfig) => {
      if (!nodeId) {
        return;
      }
      updateNodeDataInStore(nodeId, { mapper: config } as Partial<ReactFlowNodeData>);
    },
    [nodeId, updateNodeDataInStore],
  );

  // Parse current input for mapper testing
  const parsedInputData = useMemo(() => {
    const raw = upstream.slots.length > 0 ? upstream.inputPreviewJson : previewState.inputPreview;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }, [upstream.slots.length, upstream.inputPreviewJson, previewState.inputPreview]);

  const handleTestMapper = useCallback(
    (request: {
      expression: string;
      incomingData: Record<string, unknown>;
      mode?: 'auto' | 'iterate' | 'reshape';
    }) => {
      testMapperMutation.mutate(request);
    },
    [testMapperMutation],
  );

  // Node execution
  const execution = useNodeExecution({
    nodeId,
    flowId,
    nodeType,
    nodeParams: nodeParams as Record<string, unknown>,
    executeFlowToNodeMutation,
    testNodeMutation,
    flowActions,
    updateNodeData: updateNodeDataInStore,
    isTestMode: previewState.isTestMode,
    inputPreview: previewState.inputPreview,
    onExecutionComplete: useCallback(
      (newInput: string, newOutput: string) => {
        previewState.updateFromExecution(newInput, newOutput);
      },
      [previewState],
    ),
  });

  // Credentials
  const {
    data: credentials = [],
    isLoading: credentialsLoading,
    isError: credentialsError,
    refetch: refetchCredentials,
  } = useCredentials({ includeShared: true }, { enabled: open });

  const createCredentialMutation = useCreateCredential();

  // Derived display values
  const displayName = (nodeData?.display_name as string) || definition?.label || 'Untitled Node';
  const Icon = useMemo(
    () => getIconComponent(activeDefinition?.icon || definition?.icon),
    [activeDefinition?.icon, definition?.icon],
  );
  const categoryColor = 'bg-primary text-primary-foreground';
  const nodeTypeLabel = useMemo(() => formatNodeTypeLabel(nodeType), [nodeType]);

  // Model-specific status message
  const modelStatusMessage = useMemo(() => {
    if (nodeType !== GraphNodeType.MODEL) {
      return '';
    }

    const selectedCredentialId = (formValues.credentialId as string) || '';
    const providerLabel =
      typeof formValues.provider === 'string' ? (formValues.provider as string) : '';
    const visibleFields = (activeDefinition?.paramFields || []).filter((f) => !f.hidden);
    const modelField = visibleFields.find((f) => f.name === 'model');

    if (!selectedCredentialId) {
      return 'Select a credential to load provider-specific models.';
    }
    if (isConfigUpdating) {
      return 'Updating configuration...';
    }
    if (configErrors.length) {
      return configErrors[0];
    }
    if (!providerLabel) {
      return 'Detecting provider from credential...';
    }
    if (modelField?.disabled) {
      return `No models available for provider ${providerLabel}.`;
    }
    return `Detected provider: ${providerLabel}`;
  }, [nodeType, formValues, activeDefinition, isConfigUpdating, configErrors]);

  // Handlers
  const handleLabelChange = useCallback(
    (newLabel: string) => {
      if (!nodeId) {
        return;
      }
      const allNodes = storeNodes;
      const referenceId = updateReferenceIdForDisplayName(newLabel, nodeId, allNodes);
      updateNodeDataInStore(nodeId, { display_name: newLabel, reference_id: referenceId });
    },
    [nodeId, updateNodeDataInStore, storeNodes],
  );

  const handleFieldChange = useCallback(
    (fieldName: string, value: unknown) => {
      if (!nodeId) {
        return;
      }
      updateField(fieldName, value);
      const currentNode = storeNodes.find((n) => n.id === nodeId);
      const currentParams = (currentNode?.data as ReactFlowNodeData | undefined)?.params ?? {};
      // Use type assertion since we're merging params dynamically
      const newParams = { ...currentParams, [fieldName]: value } as ReactFlowNodeData['params'];
      updateNodeDataInStore(nodeId, { params: newParams });
    },
    [nodeId, updateNodeDataInStore, updateField, storeNodes],
  );

  const handleAddNewCredential = useCallback((fieldName: string) => {
    setActiveCredentialField(fieldName);
    setIsCreateCredentialOpen(true);
  }, []);

  const handleCloseCredentialModal = useCallback(() => {
    setIsCreateCredentialOpen(false);
    setActiveCredentialField(null);
  }, []);

  const handleCreateCredential = useCallback(
    (input: Parameters<typeof createCredentialMutation.mutate>[0]) => {
      createCredentialMutation.mutate(input, {
        onSuccess: (createdCredential) => {
          if (activeCredentialField) {
            handleFieldChange(activeCredentialField, createdCredential.id);
          }
          handleCloseCredentialModal();
        },
      });
    },
    [
      createCredentialMutation,
      activeCredentialField,
      handleFieldChange,
      handleCloseCredentialModal,
    ],
  );

  // Edit credential handler
  const handleEditCredential = useCallback((credential: Credential) => {
    setEditingCredential(credential);
  }, []);

  const handleCloseEditCredential = useCallback(() => {
    setEditingCredential(null);
  }, []);

  const handleUpdateCredential = useCallback(
    (data: Parameters<typeof updateCredentialMutation.mutate>[0]['data']) => {
      if (!editingCredential) return;
      updateCredentialMutation.mutate(
        { id: editingCredential.id, data },
        { onSuccess: () => setEditingCredential(null) },
      );
    },
    [editingCredential, updateCredentialMutation],
  );

  // OAuth refresh handler: test credential → if fails → start re-auth flow
  const handleRefreshOAuthCredential = useCallback(
    async (credential: Credential) => {
      setRefreshingCredentialId(credential.id);
      oauthCallbackParamsRef.current = { credentialId: credential.id };

      try {
        // First test the credential
        const testResult = await testCredentialMutation.mutateAsync(credential.id);
        if (testResult.success) {
          // Credential is valid, just refresh credentials list
          setRefreshingCredentialId(null);
          refetchCredentials();
          return;
        }
      } catch {
        // Test failed — proceed to re-authorize
      }

      // Start OAuth re-auth flow
      try {
        const result = await startOAuth2Flow.mutateAsync({
          existingCredentialId: credential.id,
          redirectUri: `${window.location.origin}/oauth/callback`,
          returnUrl: window.location.href,
        });

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          result.authorizationUrl,
          `oauth2_refresh_${credential.id}`,
          `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
        );

        if (!popup) {
          setRefreshingCredentialId(null);
          return;
        }

        setOAuthPopupWindow(popup);
      } catch {
        setRefreshingCredentialId(null);
      }
    },
    [testCredentialMutation, startOAuth2Flow, refetchCredentials],
  );

  // ── Agent Tool Handlers (only used when nodeType is AGENT) ──────

  const addedTools = useMemo<AddedToolInstance[]>(() => {
    return (nodeParams.addedTools as AddedToolInstance[]) ?? [];
  }, [nodeParams]);

  const handleAddTool = useCallback(
    (toolId: string): string => {
      if (!nodeId) {
        return '';
      }
      const toolDef = availableTools.find((t) => t.id === toolId);
      if (!toolDef) {
        return '';
      }

      const instanceId = nanoid();
      const newInstance: AddedToolInstance = {
        instanceId,
        toolId,
        name: toolDef.name,
        description: toolDef.description,
        params: {},
      };

      const currentNode = storeNodes.find((n) => n.id === nodeId);
      const currentParams = (currentNode?.data as ReactFlowNodeData | undefined)?.params ?? {};
      const currentTools =
        ((currentParams as Record<string, unknown>).addedTools as AddedToolInstance[]) ?? [];
      updateNodeDataInStore(nodeId, {
        params: { ...currentParams, addedTools: [...currentTools, newInstance] },
      });
      return instanceId;
    },
    [nodeId, availableTools, storeNodes, updateNodeDataInStore],
  );

  const handleRemoveTool = useCallback(
    (instanceId: string) => {
      if (!nodeId) {
        return;
      }
      const currentNode = storeNodes.find((n) => n.id === nodeId);
      const currentParams = (currentNode?.data as ReactFlowNodeData | undefined)?.params ?? {};
      const currentTools =
        ((currentParams as Record<string, unknown>).addedTools as AddedToolInstance[]) ?? [];
      updateNodeDataInStore(nodeId, {
        params: {
          ...currentParams,
          addedTools: currentTools.filter((t) => t.instanceId !== instanceId),
        },
      });
    },
    [nodeId, storeNodes, updateNodeDataInStore],
  );

  const handleUpdateTool = useCallback(
    (instanceId: string, updates: Partial<Omit<AddedToolInstance, 'instanceId' | 'toolId'>>) => {
      if (!nodeId) {
        return;
      }
      const currentNode = storeNodes.find((n) => n.id === nodeId);
      const currentParams = (currentNode?.data as ReactFlowNodeData | undefined)?.params ?? {};
      const currentTools =
        ((currentParams as Record<string, unknown>).addedTools as AddedToolInstance[]) ?? [];
      updateNodeDataInStore(nodeId, {
        params: {
          ...currentParams,
          addedTools: currentTools.map((t) =>
            t.instanceId === instanceId ? { ...t, ...updates } : t,
          ),
        },
      });
    },
    [nodeId, storeNodes, updateNodeDataInStore],
  );

  const agentToolsProps = useMemo(() => {
    if (nodeType !== GraphNodeType.AGENT) {
      return undefined;
    }
    return {
      availableTools,
      addedTools,
      onAddTool: handleAddTool,
      onRemoveTool: handleRemoveTool,
      onUpdateTool: handleUpdateTool,
      initialToolInstanceId: initialToolInstanceId ?? null,
    };
  }, [
    nodeType,
    availableTools,
    addedTools,
    handleAddTool,
    handleRemoveTool,
    handleUpdateTool,
    initialToolInstanceId,
  ]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          container={portalContainer}
          showCloseButton={false}
          className={cn(
            'h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0 bg-card border-border',
            'sm:max-w-[95vw] w-[95vw]',
          )}
        >
          <DialogTitle className="sr-only">Configure {displayName} node</DialogTitle>
          <DialogDescription className="sr-only">
            Review node inputs, mapper settings, configuration, and output preview for the
            {` ${displayName} `}
            node.
          </DialogDescription>
          {node ? (
            <>
              <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 gap-0">
                <InputPanel
                  value={
                    upstream.slots.length > 0
                      ? upstream.inputPreviewJson
                      : previewState.inputPreview
                  }
                  onChange={previewState.handleInputPreviewChange}
                  error={previewState.inputError}
                  isTestMode={previewState.isTestMode}
                  onReset={previewState.handleResetTestMode}
                  upstreamSlots={upstream.slots}
                  onRunSlot={upstream.runSlot}
                  onRunAll={upstream.runAllUnresolved}
                  unresolvedCount={upstream.unresolvedCount}
                  isAnyLoading={upstream.isAnyLoading}
                  mapperValue={mapperConfig}
                  onMapperChange={handleMapperChange}
                  mapperAvailableVariables={upstream.upstreamVariables}
                  onTestMapper={handleTestMapper}
                  mapperPreviewResult={testMapperMutation.data ?? null}
                  isTestingMapper={testMapperMutation.isPending}
                  mapperInputData={parsedInputData}
                  portalContainer={portalContainer}
                />

                <ResizableHandle withHandle />

                <ConfigurationPanel
                  definition={activeDefinition}
                  formValues={formValues}
                  onFieldChange={handleFieldChange}
                  credentials={credentials}
                  credentialsLoading={credentialsLoading}
                  credentialsError={credentialsError}
                  onRefreshCredentials={() => refetchCredentials()}
                  onAddNewCredential={handleAddNewCredential}
                  onEditCredential={handleEditCredential}
                  onRefreshOAuthCredential={handleRefreshOAuthCredential}
                  refreshingCredentialId={refreshingCredentialId}
                  configWarnings={configWarnings}
                  configErrors={configErrors}
                  runError={execution.runError}
                  fieldErrors={execution.fieldErrors ?? undefined}
                  nodeType={nodeType}
                  modelStatusMessage={modelStatusMessage}
                  portalContainer={portalContainer}
                  upstreamVariables={upstream.upstreamVariables}
                  inputData={parsedInputData}
                  headerLabel={displayName}
                  onHeaderLabelChange={handleLabelChange}
                  headerNodeTypeLabel={nodeTypeLabel}
                  HeaderIcon={Icon}
                  headerCategoryColor={categoryColor}
                  onRunNode={execution.runNode}
                  isRunning={execution.isRunning}
                  agentTools={agentToolsProps}
                />

                <ResizableHandle withHandle />

                <OutputPanel
                  value={previewState.outputPreview}
                  onChange={previewState.handleOutputPreviewChange}
                  error={execution.outputError}
                />
              </ResizablePanelGroup>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Select a node to configure.</div>
          )}
          <DialogClose className="absolute bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full bg-foreground/10 hover:bg-foreground/15 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors shadow-md">
            <X className="w-3.5 h-3.5" />
            Close
          </DialogClose>
        </DialogContent>
      </Dialog>

      <CreateCredentialModal
        open={isCreateCredentialOpen}
        onClose={handleCloseCredentialModal}
        onSubmit={handleCreateCredential}
        isLoading={createCredentialMutation.isPending}
        portalContainer={portalContainer}
      />

      {editingCredential && (
        <EditCredentialModal
          credential={editingCredential}
          open={true}
          onClose={handleCloseEditCredential}
          onSubmit={handleUpdateCredential}
          isLoading={updateCredentialMutation.isPending}
        />
      )}
    </>
  );
}
