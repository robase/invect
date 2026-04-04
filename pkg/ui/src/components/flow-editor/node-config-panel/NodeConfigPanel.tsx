import { useMemo, useCallback, useState } from 'react';
import { GraphNodeType, type ReactFlowNodeData } from '@invect/core/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../ui/dialog';
import { X } from 'lucide-react';
import { ResizablePanelGroup, ResizableHandle } from '../../ui/resizable';
import { cn } from '../../../lib/utils';
import { useNodeRegistry } from '../../../contexts/NodeRegistryContext';
import { useCredentials, useCreateCredential } from '../../../api/credentials.api';
import { useExecuteFlowToNode, useTestNode } from '../../../api/executions.api';
import { useTestMapper } from '../../../api/node-data.api';
import { CreateCredentialModal } from '../../credentials/CreateCredentialModal';

import { formatNodeTypeLabel, getIconComponent, stringifyJson } from './utils';
import { useNodeConfigState } from './use-node-config-state';
import { updateReferenceIdForDisplayName } from '../../../utils/nodeReferenceUtils';
import { useFlowActions } from '../../../routes/flow-route-layout';
import { usePreviewState, useNodeExecution } from './hooks';
import { useUpstreamSlots } from './hooks/use-upstream-slots';
import { InputPanel, OutputPanel, ConfigurationPanel } from './panels';
import { useFlowEditorStore } from '../flow-editor.store';

interface NodeConfigPanelProps {
  nodeId: string | null;
  flowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portalContainer?: HTMLElement | null;
}

export function NodeConfigPanel({
  nodeId,
  flowId,
  open,
  onOpenChange,
  portalContainer,
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
                  configWarnings={configWarnings}
                  configErrors={configErrors}
                  runError={execution.runError}
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
    </>
  );
}
