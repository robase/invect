'use client';

import { memo, useState, useMemo, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Search, X, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProviderIcon } from '../shared/ProviderIcon';
import { CreateCredentialModal } from '../credentials/CreateCredentialModal';
import { OAuth2ProviderSelector } from '../credentials/OAuth2ProviderSelector';
import { useCreateCredential } from '../../api/credentials.api';
import type { AddCredentialRequest } from './ToolParamField';
import type { CreateCredentialInput, Credential } from '../../api/types';
import {
  BrowseToolCard,
  AddedToolTile,
  ToolDetailsPanel,
  categoryConfig,
  categoryOrder,
} from './ToolSelectorParts';

/**
 * Tool category for organization in UI
 */
export type ToolCategory = 'data' | 'web' | 'code' | 'utility' | 'custom';

/**
 * Full tool definition with schema information
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  /** Tags for filtering */
  tags?: string[];
  /** JSON Schema for tool inputs */
  inputSchema?: Record<string, unknown>;
  /** Documentation URL */
  docsUrl?: string;
  /** Whether this tool is enabled by default */
  enabledByDefault?: boolean;
  /** If this tool is backed by a node, this is the node type */
  nodeType?: string;
  /** Provider information for grouping and branding */
  provider?: {
    id: string;
    name: string;
    icon: string;
    /** Raw SVG markup for custom provider branding */
    svgIcon?: string;
  };
}

/**
 * An instance of a tool that has been added to the agent.
 * Multiple instances of the same tool can exist with different configurations.
 */
export interface AddedToolInstance {
  /** Unique instance ID */
  instanceId: string;
  /** Reference to the base tool definition */
  toolId: string;
  /** Custom name for this instance (defaults to tool name) */
  name: string;
  /** Custom description for this instance (defaults to tool description) */
  description: string;
  /** Tool-specific configuration parameters */
  params: Record<string, unknown>;
}

interface ToolSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All available tools */
  availableTools: ToolDefinition[];
  /** Currently added tool instances */
  addedTools: AddedToolInstance[];
  /** Called when a tool is added. Returns the new instance ID. */
  onAddTool: (toolId: string) => string;
  /** Called when a tool instance is removed */
  onRemoveTool: (instanceId: string) => void;
  /** Called when a tool instance is updated */
  onUpdateTool: (
    instanceId: string,
    updates: Partial<Omit<AddedToolInstance, 'instanceId' | 'toolId'>>,
  ) => void;
  /** Portal container for rendering the modal (needed when inside ReactFlow) */
  portalContainer?: HTMLElement | null;
  /** If true, start with focus on added tools section */
  initialShowSelected?: boolean;
  /** If provided, auto-select this tool instance when modal opens */
  initialSelectedInstanceId?: string | null;
}

/**
 * Custom hook for debounced value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
/**
 * ToolSelectorModal - Modal for managing agent tools
 *
 * Layout:
 * - Left side (60%):
 *   - Top: Search bar + category tabs + tag filters
 *   - Middle: Browse available tools grid
 *   - Horizontal divider (when tools added)
 *   - Bottom: Added tools (horizontally scrollable)
 * - Right side (40%): Tool details/configuration panel
 */
export const ToolSelectorModal = memo(function ToolSelectorModal({
  open,
  onOpenChange,
  availableTools,
  addedTools,
  onAddTool,
  onRemoveTool,
  onUpdateTool,
  portalContainer,
  initialShowSelected = false,
  initialSelectedInstanceId = null,
}: ToolSelectorModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  // Selection can be either a browse tool (toolId) or an added instance (instanceId)
  const [selectedBrowseToolId, setSelectedBrowseToolId] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Credential modal state
  const [isCreateCredentialOpen, setIsCreateCredentialOpen] = useState(false);
  const [isOAuth2SelectorOpen, setIsOAuth2SelectorOpen] = useState(false);
  const [activeCredentialField, setActiveCredentialField] = useState<string | null>(null);
  const [activeOAuth2Providers, setActiveOAuth2Providers] = useState<string[] | null>(null);
  const createCredentialMutation = useCreateCredential();

  // Debounce search query (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Extract all unique tags from tools
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const tool of availableTools) {
      if (tool.tags) {
        for (const tag of tool.tags) {
          tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [availableTools]);

  // Toggle tag selection
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // Clear all tag filters
  const clearTagFilters = useCallback(() => {
    setSelectedTags([]);
  }, []);

  // Filter tools based on search, category, and tags
  const filteredBrowseTools = useMemo(() => {
    let tools = availableTools;

    // Filter by category
    if (selectedCategory !== 'all') {
      tools = tools.filter((t) => t.category === selectedCategory);
    }

    // Filter by tags (must match ALL selected tags)
    if (selectedTags.length > 0) {
      tools = tools.filter((t) => {
        if (!t.tags) {
          return false;
        }
        return selectedTags.every((tag) => t.tags!.includes(tag));
      });
    }

    // Filter by debounced search query
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      tools = tools.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(query))),
      );
    }

    return tools;
  }, [availableTools, debouncedSearchQuery, selectedCategory, selectedTags]);

  // Group browse tools by provider for display (matching NodeSidebar pattern)
  const { providerGroups, sortedProviderIds } = useMemo(() => {
    const byProvider: Record<
      string,
      { name: string; icon?: string; svgIcon?: string; tools: ToolDefinition[] }
    > = {};
    for (const tool of filteredBrowseTools) {
      const providerId = tool.provider?.id ?? tool.category;
      if (!byProvider[providerId]) {
        byProvider[providerId] = {
          name: tool.provider?.name ?? categoryConfig[tool.category]?.label ?? tool.category,
          icon: tool.provider?.icon,
          svgIcon: tool.provider?.svgIcon,
          tools: [],
        };
      }
      byProvider[providerId].tools.push(tool);
    }

    // Sort: core-like providers first, then alphabetical
    const providerOrder = ['core', 'ai', 'logic', 'data', 'utility', 'io'];
    const sorted = Object.keys(byProvider).sort((a, b) => {
      const idxA = providerOrder.indexOf(a);
      const idxB = providerOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) {
        return -1;
      }
      if (idxB !== -1) {
        return 1;
      }
      return byProvider[a].name.localeCompare(byProvider[b].name);
    });

    return { providerGroups: byProvider, sortedProviderIds: sorted };
  }, [filteredBrowseTools]);

  // Get selected tool/instance for details panel
  const selectedBrowseTool = selectedBrowseToolId
    ? (availableTools.find((t) => t.id === selectedBrowseToolId) ?? null)
    : null;
  const selectedInstance = selectedInstanceId
    ? (addedTools.find((t) => t.instanceId === selectedInstanceId) ?? null)
    : null;
  const selectedInstanceToolDef = selectedInstance
    ? (availableTools.find((t) => t.id === selectedInstance.toolId) ?? null)
    : null;

  // Count tools per category (for tabs)
  const categoryCounts = useMemo(() => {
    const counts: Record<ToolCategory | 'all', number> = {
      all: availableTools.length,
      data: 0,
      web: 0,
      code: 0,
      utility: 0,
      custom: 0,
    };
    for (const tool of availableTools) {
      counts[tool.category]++;
    }
    return counts;
  }, [availableTools]);

  // Handle selecting a browse tool (clears instance selection)
  const handleSelectBrowseTool = useCallback((toolId: string) => {
    setSelectedBrowseToolId(toolId);
    setSelectedInstanceId(null);
  }, []);

  // Handle selecting an added instance (clears browse selection)
  const handleSelectInstance = useCallback((instanceId: string) => {
    setSelectedInstanceId(instanceId);
    setSelectedBrowseToolId(null);
  }, []);

  // Handle adding a tool and auto-selecting it
  const handleAddTool = useCallback(
    (toolId: string) => {
      const instanceId = onAddTool(toolId);
      // Auto-select the newly added tool to show config
      setSelectedInstanceId(instanceId);
      setSelectedBrowseToolId(null);
    },
    [onAddTool],
  );

  // Handle opening credential modal (either OAuth2 or regular)
  const handleAddCredential = useCallback((request: AddCredentialRequest) => {
    setActiveCredentialField(request.fieldName);

    if (request.oauth2Providers && request.oauth2Providers.length > 0) {
      // OAuth2 credential - open OAuth2 provider selector
      setActiveOAuth2Providers(request.oauth2Providers);
      setIsOAuth2SelectorOpen(true);
    } else {
      // Regular credential - open standard create modal
      setIsCreateCredentialOpen(true);
    }
  }, []);

  // Handle closing credential modal
  const handleCloseCredentialModal = useCallback(() => {
    setIsCreateCredentialOpen(false);
    setActiveCredentialField(null);
  }, []);

  // Handle closing OAuth2 selector
  const handleCloseOAuth2Selector = useCallback(() => {
    setIsOAuth2SelectorOpen(false);
    setActiveCredentialField(null);
    setActiveOAuth2Providers(null);
  }, []);

  // Handle credential created (from either modal)
  const handleCredentialCreated = useCallback(
    async (createdCredential: Credential) => {
      console.log(
        '[ToolSelectorModal] handleCredentialCreated called with credential:',
        createdCredential.id,
      );
      console.log('[ToolSelectorModal] activeCredentialField:', activeCredentialField);
      console.log('[ToolSelectorModal] selectedInstanceId:', selectedInstanceId);

      // Explicitly refetch credentials to ensure the list is up-to-date
      // This is needed because the ToolParamField's useCredentials hook may have stale data
      console.log('[ToolSelectorModal] Refetching credentials...');
      await queryClient.refetchQueries({ queryKey: ['credentials'] });
      console.log('[ToolSelectorModal] Credentials refetched');

      // If we have a selected instance and active field, update it with the new credential
      // Note: We capture these values before closing modals which clear them
      const fieldToUpdate = activeCredentialField;
      const instanceToUpdate = selectedInstanceId;

      if (instanceToUpdate && fieldToUpdate) {
        const instance = addedTools.find((t) => t.instanceId === instanceToUpdate);
        console.log(
          '[ToolSelectorModal] Updating tool instance:',
          instanceToUpdate,
          'field:',
          fieldToUpdate,
        );
        if (instance) {
          onUpdateTool(instanceToUpdate, {
            params: { ...instance.params, [fieldToUpdate]: createdCredential.id },
          });
          console.log('[ToolSelectorModal] Tool updated with credential ID');
        }
      }
      // Close whichever modal is open (this clears activeCredentialField)
      setIsCreateCredentialOpen(false);
      setIsOAuth2SelectorOpen(false);
      setActiveCredentialField(null);
      setActiveOAuth2Providers(null);
    },
    [queryClient, selectedInstanceId, activeCredentialField, addedTools, onUpdateTool],
  );

  // Handle creating a regular credential (non-OAuth2)
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

  // Set initial selected instance when modal opens
  useEffect(() => {
    if (open && initialSelectedInstanceId) {
      setSelectedInstanceId(initialSelectedInstanceId);
      setSelectedBrowseToolId(null);
    }
  }, [open, initialSelectedInstanceId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedBrowseToolId(null);
      setSelectedInstanceId(null);
      setSelectedCategory('all');
      setSelectedTags([]);
    }
  }, [open]);

  // Determine what to show in details panel
  const detailsTool = selectedInstance ? selectedInstanceToolDef : selectedBrowseTool;
  const detailsInstance = selectedInstance;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        className="h-[90vh] max-h-[90vh] sm:max-w-[95vw] w-[95vw] p-0 gap-0 flex flex-col bg-card border-border"
      >
        <DialogHeader className="p-4 pb-0 shrink-0">
          <DialogTitle>Manage Agent Tools</DialogTitle>
          <DialogDescription className="sr-only">
            Add, configure, and manage tools for your AI agent
          </DialogDescription>
        </DialogHeader>

        {/* Main content area */}
        <div className="flex flex-1 min-h-0">
          {/* Left side: Browse tools */}
          <div className="flex flex-col flex-1 min-w-0 border-r">
            {/* Search and filters */}
            <div className="p-4 space-y-3 border-b shrink-0">
              {/* Search bar */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search tools by name, description, or tag…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-border bg-transparent py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute -translate-y-1/2 right-3 top-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex gap-2 pb-1 overflow-x-auto">
                <Button
                  size="sm"
                  variant={selectedCategory === 'all' ? 'default' : 'ghost'}
                  onClick={() => setSelectedCategory('all')}
                  className="shrink-0"
                >
                  All ({categoryCounts.all})
                </Button>
                {categoryOrder.map((cat) => {
                  const config = categoryConfig[cat];
                  const Icon = config.icon;
                  const count = categoryCounts[cat];
                  if (count === 0) {
                    return null;
                  }
                  return (
                    <Button
                      key={cat}
                      size="sm"
                      variant={selectedCategory === cat ? 'default' : 'ghost'}
                      onClick={() => setSelectedCategory(cat)}
                      className="shrink-0 gap-1.5"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {config.label} ({count})
                    </Button>
                  );
                })}
              </div>

              {/* Tag filters */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Tag className="w-3 h-3" />
                    <span>Tags:</span>
                  </div>
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                      className={cn(
                        'cursor-pointer text-xs transition-colors',
                        selectedTags.includes(tag)
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'hover:bg-muted',
                      )}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                      {selectedTags.includes(tag) && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  ))}
                  {selectedTags.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearTagFilters}
                      className="h-6 px-2 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              )}

              {/* Active filters summary */}
              {(selectedTags.length > 0 || debouncedSearchQuery || selectedCategory !== 'all') && (
                <div className="text-xs text-muted-foreground">
                  Showing {filteredBrowseTools.length} of {availableTools.length} tools
                </div>
              )}
            </div>

            {/* Browse tools grid — grouped by provider */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {filteredBrowseTools.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No tools found</p>
                  </div>
                ) : (
                  sortedProviderIds.map((providerId) => {
                    const group = providerGroups[providerId];
                    return (
                      <div key={providerId}>
                        <h3 className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                          <ProviderIcon
                            providerId={providerId}
                            svgIcon={group.svgIcon}
                            icon={group.icon}
                            className="w-5 h-5"
                          />
                          {group.name}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                          {group.tools.map((tool) => (
                            <BrowseToolCard
                              key={tool.id}
                              tool={tool}
                              isActive={selectedBrowseToolId === tool.id}
                              onAdd={() => handleAddTool(tool.id)}
                              onPreview={() => handleSelectBrowseTool(tool.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Middle: Added tools vertical list */}
          <div className="flex flex-col w-48 min-h-0 border-r shrink-0 bg-muted/10">
            <div className="p-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Added Tools</span>
                <span className="flex items-center justify-center w-5 h-5 text-xs rounded-full bg-primary/10 text-primary">
                  {addedTools.length}
                </span>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {addedTools.length === 0 ? (
                  <div className="py-6 text-center">
                    <div className="text-xs text-muted-foreground">No tools added yet</div>
                    <div className="mt-1 text-[10px] text-muted-foreground/60">
                      Click + on a tool to add it
                    </div>
                  </div>
                ) : (
                  addedTools.map((instance) => {
                    const toolDef = availableTools.find((t) => t.id === instance.toolId);
                    return (
                      <AddedToolTile
                        key={instance.instanceId}
                        instance={instance}
                        toolDef={toolDef}
                        isActive={selectedInstanceId === instance.instanceId}
                        onSelect={() => handleSelectInstance(instance.instanceId)}
                        onRemove={() => onRemoveTool(instance.instanceId)}
                      />
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right side: Tool details/config panel */}
          <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-muted/30">
            <ToolDetailsPanel
              tool={detailsTool}
              instance={detailsInstance}
              onAdd={selectedBrowseTool ? () => handleAddTool(selectedBrowseTool.id) : undefined}
              onUpdate={
                selectedInstance
                  ? (updates) => onUpdateTool(selectedInstance.instanceId, updates)
                  : undefined
              }
              onRemove={
                selectedInstance ? () => onRemoveTool(selectedInstance.instanceId) : undefined
              }
              onAddCredential={handleAddCredential}
              portalContainer={portalContainer}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t shrink-0">
          <div className="text-sm text-muted-foreground">
            {addedTools.length} tool{addedTools.length !== 1 ? 's' : ''} added
          </div>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>

      {/* Regular credential creation modal (for non-OAuth2) */}
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
    </Dialog>
  );
});

ToolSelectorModal.displayName = 'ToolSelectorModal';
