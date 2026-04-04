'use client';

import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  X,
  Check,
  Settings,
  Database,
  Globe,
  Code2,
  Wrench,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  PanelRightClose,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNodeRegistry } from '../../contexts/NodeRegistryContext';
import { ToolParamField, type AddCredentialRequest } from '../nodes/ToolParamField';
import { CreateCredentialModal } from '../credentials/CreateCredentialModal';
import { OAuth2ProviderSelector } from '../credentials/OAuth2ProviderSelector';
import { useCreateCredential } from '../../api/credentials.api';
import type { NodeParamField } from '../../types/node-definition.types';
import type { CreateCredentialInput, Credential } from '../../api/types';
import type { ToolDefinition, AddedToolInstance, ToolCategory } from '../nodes/ToolSelectorModal';

// ─── Category Config ───────────────────────────────────────────────

const categoryConfig: Record<
  ToolCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  data: { label: 'Data', icon: Database, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  web: { label: 'Web', icon: Globe, color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  code: {
    label: 'Code',
    icon: Code2,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  utility: {
    label: 'Utility',
    icon: Wrench,
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  custom: {
    label: 'Custom',
    icon: Sparkles,
    color: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  },
};

// ─── Main Panel ────────────────────────────────────────────────────

// ─── Delete Confirm Button ─────────────────────────────────────────

function DeleteConfirmButton({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] text-destructive font-medium">Remove?</span>
        <Button
          variant="ghost"
          size="sm"
          className="w-6 h-6 p-0 bg-destructive/10 text-destructive hover:text-destructive hover:bg-destructive/20"
          onClick={onConfirm}
          title="Confirm remove"
        >
          <Check className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-6 h-6 p-0 text-muted-foreground"
          onClick={() => setConfirming(false)}
          title="Cancel"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="p-0 w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
        title="Remove tool"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="p-0 w-7 h-7" onClick={onClose}>
        <PanelRightClose className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────

export interface ToolConfigPanelProps {
  open: boolean;
  onClose: () => void;
  /** The base tool definition */
  tool: ToolDefinition | null;
  /** The tool instance being configured */
  instance: AddedToolInstance | null;
  /** Called when the tool instance is updated */
  onUpdate: (
    instanceId: string,
    updates: Partial<Omit<AddedToolInstance, 'instanceId' | 'toolId'>>,
  ) => void;
  /** Called when the tool instance is removed */
  onRemove: (instanceId: string) => void;
  /** Portal container for sub-modals (credential creation) */
  portalContainer?: HTMLElement | null;
}

export const ToolConfigPanel = memo(function ToolConfigPanel({
  open,
  onClose,
  tool,
  instance,
  onUpdate,
  onRemove,
  portalContainer,
}: ToolConfigPanelProps) {
  const queryClient = useQueryClient();
  const [showSchema, setShowSchema] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Credential modal state
  const [isCreateCredentialOpen, setIsCreateCredentialOpen] = useState(false);
  const [isOAuth2SelectorOpen, setIsOAuth2SelectorOpen] = useState(false);
  const [activeCredentialField, setActiveCredentialField] = useState<string | null>(null);
  const [activeOAuth2Providers, setActiveOAuth2Providers] = useState<string[] | null>(null);
  const createCredentialMutation = useCreateCredential();

  // Get node definition if tool is backed by a node
  const { getNodeDefinition } = useNodeRegistry();
  const nodeDefinition = tool?.nodeType ? getNodeDefinition(tool.nodeType) : undefined;

  // Filter out hidden fields, sort credential fields to top
  const paramFields = useMemo(() => {
    const allFields = nodeDefinition?.paramFields ?? [];
    const visibleFields = allFields.filter((field: NodeParamField) => !field.hidden);
    return visibleFields.sort((a: NodeParamField, b: NodeParamField) => {
      if (a.type === 'credential' && b.type !== 'credential') {
        return -1;
      }
      if (a.type !== 'credential' && b.type === 'credential') {
        return 1;
      }
      return 0;
    });
  }, [nodeDefinition]);

  // Compute effective input schema
  const effectiveInputSchema = useMemo(() => {
    if (!tool?.inputSchema || !instance) {
      return tool?.inputSchema;
    }

    const aiChosenModes = (instance.params._aiChosenModes as Record<string, boolean>) ?? {};
    const schema = tool.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    if (!schema.properties) {
      return schema;
    }

    const filteredProperties: Record<string, unknown> = {};
    const staticParams: string[] = [];

    for (const [key, value] of Object.entries(schema.properties)) {
      const isAiChosen = aiChosenModes[key] ?? true;
      if (isAiChosen) {
        filteredProperties[key] = value;
      } else {
        staticParams.push(key);
      }
    }

    const filteredRequired = schema.required?.filter((key) => aiChosenModes[key] ?? true);

    return {
      ...schema,
      properties: filteredProperties,
      required: filteredRequired,
      _staticParams: staticParams.length > 0 ? staticParams : undefined,
    };
  }, [tool?.inputSchema, instance]);

  // Sync local state with instance
  useEffect(() => {
    if (instance) {
      setEditName(instance.name);
      setEditDescription(instance.description);
    }
  }, [instance?.instanceId, instance?.name, instance?.description]);

  // Reset schema visibility when tool changes
  useEffect(() => {
    setShowSchema(false);
  }, [instance?.instanceId]);

  // ─── Credential Handlers ────────────────────────────────────────

  const handleAddCredential = useCallback((request: AddCredentialRequest) => {
    setActiveCredentialField(request.fieldName);
    if (request.oauth2Providers && request.oauth2Providers.length > 0) {
      setActiveOAuth2Providers(request.oauth2Providers);
      setIsOAuth2SelectorOpen(true);
    } else {
      setIsCreateCredentialOpen(true);
    }
  }, []);

  const handleCloseCredentialModal = useCallback(() => {
    setIsCreateCredentialOpen(false);
    setActiveCredentialField(null);
  }, []);

  const handleCloseOAuth2Selector = useCallback(() => {
    setIsOAuth2SelectorOpen(false);
    setActiveCredentialField(null);
    setActiveOAuth2Providers(null);
  }, []);

  const handleCredentialCreated = useCallback(
    async (createdCredential: Credential) => {
      await queryClient.refetchQueries({ queryKey: ['credentials'] });

      const fieldToUpdate = activeCredentialField;
      const instanceToUpdate = instance?.instanceId;

      if (instanceToUpdate && fieldToUpdate && instance) {
        onUpdate(instanceToUpdate, {
          params: { ...instance.params, [fieldToUpdate]: createdCredential.id },
        });
      }

      setIsCreateCredentialOpen(false);
      setIsOAuth2SelectorOpen(false);
      setActiveCredentialField(null);
      setActiveOAuth2Providers(null);
    },
    [queryClient, instance, activeCredentialField, onUpdate],
  );

  const handleCreateCredential = useCallback(
    (input: CreateCredentialInput) => {
      createCredentialMutation.mutate(input, {
        onSuccess: (createdCredential) => {
          handleCredentialCreated(createdCredential);
        },
      });
    },
    [createCredentialMutation, handleCredentialCreated],
  );

  // ─── Name/Description Handlers ──────────────────────────────────

  const handleNameBlur = useCallback(() => {
    if (instance && editName !== instance.name) {
      onUpdate(instance.instanceId, { name: editName });
    }
  }, [instance, editName, onUpdate]);

  const handleDescriptionBlur = useCallback(() => {
    if (instance && editDescription !== instance.description) {
      onUpdate(instance.instanceId, { description: editDescription });
    }
  }, [instance, editDescription, onUpdate]);

  if (!open || !tool || !instance) {
    return null;
  }

  const config = categoryConfig[tool.category];
  const Icon = config.icon;

  return (
    <>
      <div className="flex flex-col duration-200 border-l w-96 border-border bg-card text-card-foreground animate-in slide-in-from-right fade-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="flex items-center min-w-0 gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
                config.color,
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold truncate text-card-foreground">
                {instance.name}
              </h2>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                {config.label}
              </Badge>
            </div>
          </div>
          <DeleteConfirmButton
            onConfirm={() => {
              onRemove(instance.instanceId);
              onClose();
            }}
            onClose={onClose}
          />
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {/* Tool Configuration section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Configuration
                </h4>
              </div>

              {/* Editable name */}
              <div className="space-y-1.5">
                <Label htmlFor="tool-config-name" className="text-sm">
                  Name
                </Label>
                <Input
                  id="tool-config-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleNameBlur}
                  className="text-sm h-9"
                />
              </div>

              {/* Editable description */}
              <div className="space-y-1.5">
                <Label htmlFor="tool-config-description" className="text-sm">
                  Description
                </Label>
                <Textarea
                  id="tool-config-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            {/* Node params from definition */}
            {tool.nodeType && paramFields.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Parameters
                </h4>
                {paramFields.map((field: NodeParamField) => {
                  const aiChosenModes =
                    (instance.params._aiChosenModes as Record<string, boolean>) ?? {};
                  const isAiChosen = aiChosenModes[field.name] ?? true;
                  return (
                    <ToolParamField
                      key={field.name}
                      field={field}
                      value={instance.params[field.name]}
                      onChange={(value) => {
                        onUpdate(instance.instanceId, {
                          params: { ...instance.params, [field.name]: value },
                        });
                      }}
                      aiChosen={isAiChosen}
                      onAiChosenChange={(enabled) => {
                        const updatedModes = { ...aiChosenModes, [field.name]: enabled };
                        onUpdate(instance.instanceId, {
                          params: { ...instance.params, _aiChosenModes: updatedModes },
                        });
                      }}
                      onAddCredential={handleAddCredential}
                    />
                  );
                })}
              </div>
            )}

            {tool.nodeType && paramFields.length === 0 && (
              <p className="text-sm italic text-muted-foreground">
                This tool has no configurable parameters.
              </p>
            )}

            {/* Tags */}
            {tool.tags && tool.tags.length > 0 && (
              <div>
                <h4 className="mb-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1">
                  {tool.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Documentation link */}
            {tool.docsUrl && (
              <a
                href={tool.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                View Documentation
              </a>
            )}

            {/* Input Schema */}
            {tool.inputSchema && (
              <div>
                <button
                  onClick={() => setShowSchema(!showSchema)}
                  className="flex items-center gap-2 text-xs font-medium transition-colors hover:text-primary"
                >
                  {showSchema ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  Effective Input Schema
                </button>
                {showSchema && (
                  <div className="p-2 mt-2 overflow-auto rounded-lg bg-muted/50">
                    {effectiveInputSchema &&
                      '_staticParams' in effectiveInputSchema &&
                      (effectiveInputSchema as { _staticParams?: string[] })._staticParams && (
                        <div className="pb-2 mb-2 text-[10px] border-b text-muted-foreground">
                          <span className="font-medium">Static params (not sent to AI): </span>
                          {(
                            (effectiveInputSchema as { _staticParams?: string[] })._staticParams ??
                            []
                          ).join(', ')}
                        </div>
                      )}
                    <pre className="text-[10px] whitespace-pre-wrap text-muted-foreground">
                      {JSON.stringify(effectiveInputSchema, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Tool ID */}
            <div className="pt-2 border-t">
              <div className="text-[10px] text-muted-foreground">
                Tool ID: <code className="bg-muted px-1 py-0.5 rounded">{tool.id}</code>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Regular credential creation modal */}
      <CreateCredentialModal
        open={isCreateCredentialOpen}
        onClose={handleCloseCredentialModal}
        onSubmit={handleCreateCredential}
        isLoading={createCredentialMutation.isPending}
        portalContainer={portalContainer}
      />

      {/* OAuth2 provider selector modal */}
      <OAuth2ProviderSelector
        open={isOAuth2SelectorOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseOAuth2Selector();
          }
        }}
        onCredentialCreated={handleCredentialCreated}
        portalContainer={portalContainer}
        filterProviders={activeOAuth2Providers ?? undefined}
      />
    </>
  );
});

ToolConfigPanel.displayName = 'ToolConfigPanel';
