/**
 * ChatModelSelector — Combobox for selecting the LLM model in the chat input area.
 *
 * Shows models from the provider's API (server-filtered with debounced search),
 * with a "Recent" section for recently used models tracked via localStorage.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Check, ChevronsUpDown, Clock, Loader2, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { useApiClient } from '~/contexts/ApiContext';
import { useChatStore } from './chat.store';

const MAX_RECENT_MODELS = 5;
const DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface ChatModelSelectorProps {
  className?: string;
}

export function ChatModelSelector({ className }: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS);
  const apiClient = useApiClient();

  const credentialId = useChatStore((s) => s.settings.credentialId);
  const selectedModel = useChatStore((s) => s.settings.model);
  const recentModels = useChatStore((s) => s.settings.recentModels);
  const updateSettings = useChatStore((s) => s.updateSettings);

  // Fetch models with server-side search filter
  const {
    data: models = [],
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['chat-models', credentialId, debouncedSearch],
    queryFn: () => apiClient.getChatModels(credentialId ?? '', debouncedSearch || undefined),
    enabled: !!credentialId && open,
    staleTime: 5 * 60 * 1000, // 5 min cache per query
    retry: 1,
  });

  // Reset search when popover closes
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const handleSelect = useCallback(
    (modelId: string) => {
      const newRecents = [modelId, ...recentModels.filter((id) => id !== modelId)].slice(
        0,
        MAX_RECENT_MODELS,
      );
      updateSettings({ model: modelId, recentModels: newRecents });
      setOpen(false);
    },
    [recentModels, updateSettings],
  );

  // Recent models (only shown when not searching)
  const recentModelItems = useMemo(() => {
    if (debouncedSearch || !recentModels.length || !models.length) {
      return [];
    }
    return recentModels
      .map((id) => models.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => m != null);
  }, [debouncedSearch, recentModels, models]);

  const displayLabel = useMemo(() => {
    if (!selectedModel) {
      return 'Default model';
    }
    return selectedModel;
  }, [selectedModel]);

  if (!credentialId) {
    return null;
  }

  const showSpinner = isFetching && debouncedSearch !== search;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-6 gap-1 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground max-w-50',
            className,
          )}
        >
          <Sparkles className="size-3 shrink-0" />
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-auto size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-70 p-0" align="start" side="top" sideOffset={8}>
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Search models…"
              className="h-8 text-xs focus:ring-0 focus:outline-none"
              value={search}
              onValueChange={setSearch}
            />
            {showSpinner && (
              <Loader2 className="absolute size-3 animate-spin right-2 top-2.5 text-muted-foreground" />
            )}
          </div>
          <CommandList className="max-h-62.5">
            {isLoading && (
              <div className="py-4 text-xs text-center text-muted-foreground">Loading models…</div>
            )}
            {isError && (
              <div className="py-4 text-xs text-center text-muted-foreground">
                Failed to load models
              </div>
            )}
            {!isLoading && !isError && models.length === 0 && debouncedSearch && (
              <CommandEmpty>No models matching &ldquo;{debouncedSearch}&rdquo;</CommandEmpty>
            )}

            {/* Default option (only when not searching) */}
            {!debouncedSearch && (
              <CommandGroup>
                <CommandItem
                  value="__default__"
                  onSelect={() => {
                    updateSettings({ model: null });
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <span className="text-muted-foreground">Provider default</span>
                  {!selectedModel && <Check className="ml-auto size-3" />}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Recent models (only when not searching) */}
            {recentModelItems.length > 0 && (
              <CommandGroup heading="Recent">
                {recentModelItems.map((model) => (
                  <CommandItem
                    key={`recent-${model.id}`}
                    value={`recent-${model.id}`}
                    onSelect={() => handleSelect(model.id)}
                    className="text-xs"
                  >
                    <Clock className="mr-1.5 size-3 text-muted-foreground/60" />
                    <span className="truncate">{model.name || model.id}</span>
                    {selectedModel === model.id && <Check className="ml-auto size-3" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* All / filtered models */}
            {models.length > 0 && (
              <CommandGroup heading={debouncedSearch ? 'Results' : 'All models'}>
                {models.map((model) => (
                  <CommandItem
                    key={model.id}
                    value={model.id}
                    onSelect={() => handleSelect(model.id)}
                    className="text-xs"
                  >
                    <span className="truncate">{model.name || model.id}</span>
                    {selectedModel === model.id && <Check className="ml-auto size-3" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
