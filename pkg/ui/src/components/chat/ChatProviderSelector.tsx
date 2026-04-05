/**
 * ChatProviderSelector — Inline combobox for selecting the LLM credential/provider
 * directly from the chat input toolbar.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Check, ChevronsUpDown, Key, Plus } from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { useChatStore } from './chat.store';
import { useCredentials, useCreateCredential } from '~/api/credentials.api';
import { CreateCredentialModal } from '~/components/credentials/CreateCredentialModal';
import type { CreateCredentialInput } from '~/api/types';

interface ChatProviderSelectorProps {
  className?: string;
}

export function ChatProviderSelector({ className }: ChatProviderSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const credentialId = useChatStore((s) => s.settings.credentialId);
  const updateSettings = useChatStore((s) => s.updateSettings);

  const { data: credentials = [], isLoading } = useCredentials({ type: 'llm', isActive: true });
  const createCredentialMutation = useCreateCredential();

  const selectedCredential = useMemo(
    () => credentials.find((c) => c.id === credentialId),
    [credentials, credentialId],
  );

  const displayLabel = selectedCredential?.name ?? 'Select provider';

  const handleSelect = useCallback(
    (id: string) => {
      updateSettings({ credentialId: id, model: null });
      setOpen(false);
    },
    [updateSettings],
  );

  const handleCreateCredential = useCallback(
    (data: CreateCredentialInput) => {
      createCredentialMutation.mutate(data, {
        onSuccess: (created) => {
          setShowCreateModal(false);
          updateSettings({ credentialId: created.id, model: null });
        },
      });
    },
    [createCredentialMutation, updateSettings],
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'h-6 gap-1 px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground max-w-40',
              className,
            )}
          >
            <Key className="size-3 shrink-0" />
            <span className="truncate">{displayLabel}</span>
            <ChevronsUpDown className="ml-auto size-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start" side="top" sideOffset={8}>
          <Command>
            <CommandList>
              {isLoading && (
                <div className="py-4 text-xs text-center text-muted-foreground">
                  Loading providers…
                </div>
              )}
              {!isLoading && credentials.length === 0 && (
                <CommandEmpty>No LLM credentials found</CommandEmpty>
              )}
              {credentials.length > 0 && (
                <CommandGroup heading="LLM Providers">
                  {credentials.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => handleSelect(c.id)}
                      className="text-xs"
                    >
                      <span className="truncate">{c.name}</span>
                      {credentialId === c.id && <Check className="ml-auto size-3" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setShowCreateModal(true);
                  }}
                  className="text-xs"
                >
                  <Plus className="mr-1.5 size-3" />
                  New LLM Credential
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CreateCredentialModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateCredential}
        isLoading={createCredentialMutation.isPending}
        initialType="llm"
      />
    </>
  );
}
