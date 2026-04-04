import { useMemo, useState } from 'react';
import { ChevronsUpDown, Check, Loader2, Plus, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../ui/command';
import { ProviderIcon } from '../../shared/ProviderIcon';
import type { Credential } from '../../../api/types';
import { cn } from '../../../lib/utils';
import { getCredentialBranding } from '../../../utils/credentialBranding';

const NO_CREDENTIAL_VALUE = '__invect_no_credential__';

interface Props {
  credentials: Credential[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAddNew: () => void;
  container?: HTMLElement | null;
  disablePortal?: boolean;
  /** Custom label for the add button (default: "Add new credential") */
  addButtonLabel?: string;
}

export function CredentialCombobox({
  credentials,
  value,
  onChange,
  placeholder = 'Select credential',
  isLoading,
  isError,
  onRetry,
  onAddNew,
  container,
  disablePortal = true,
  addButtonLabel = 'Add new credential',
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedCredential = useMemo(
    () => credentials.find((cred) => cred.id === value),
    [credentials, value],
  );
  const selectedCredentialBranding = useMemo(
    () => (selectedCredential ? getCredentialBranding(selectedCredential) : null),
    [selectedCredential],
  );

  const handleSelect = (nextValue: string) => {
    const normalizedValue = nextValue === NO_CREDENTIAL_VALUE ? '' : nextValue;
    onChange(normalizedValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between gap-2 w-full font-mono text-xs"
        >
          <span className="flex min-w-0 items-center gap-2 overflow-hidden">
            {selectedCredential && selectedCredentialBranding ? (
              <ProviderIcon
                providerId={selectedCredentialBranding.providerId}
                icon={selectedCredentialBranding.icon}
                className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
              />
            ) : null}
            <span className="truncate">
              {selectedCredential ? selectedCredential.name : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        container={container}
        disablePortal={disablePortal}
      >
        <Command>
          <CommandInput
            className="h-8 border-0 rounded-none py-1 font-mono text-xs shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Search credentials..."
          />
          <CommandList>
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading credentials...
              </div>
            )}
            {isError && !isLoading && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span>Failed to load credentials.</span>
                  <Button variant="ghost" size="sm" className="mt-1" onClick={onRetry}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                  </Button>
                </div>
              </CommandEmpty>
            )}
            {!isLoading && !isError && credentials.length === 0 && (
              <CommandEmpty>No credentials found.</CommandEmpty>
            )}
            {!isLoading && !isError && (
              <>
                <CommandGroup>
                  <CommandItem
                    value={NO_CREDENTIAL_VALUE}
                    onSelect={handleSelect}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    <Check className={cn('h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                    No credential
                  </CommandItem>
                  {credentials.map((credential) => {
                    const branding = getCredentialBranding(credential);

                    return (
                      <CommandItem
                        key={credential.id}
                        value={credential.id}
                        onSelect={handleSelect}
                        className="flex items-center gap-2 font-mono text-xs"
                      >
                        <Check
                          className={cn(
                            'h-4 w-4',
                            credential.id === value ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <ProviderIcon
                          providerId={branding.providerId}
                          icon={branding.icon}
                          className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate">{credential.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <div className="p-2 border-t">
                  <Button
                    onClick={() => {
                      setOpen(false);
                      onAddNew();
                    }}
                    className="w-full"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" /> {addButtonLabel}
                  </Button>
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
