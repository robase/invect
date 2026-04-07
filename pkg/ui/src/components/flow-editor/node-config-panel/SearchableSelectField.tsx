import { useState, useCallback, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
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

interface SearchableSelectFieldProps {
  id?: string;
  value: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/**
 * A searchable select field using a combobox pattern (Popover + Command).
 * Used for select fields with many options (e.g. model lists).
 */
export function SearchableSelectField({
  id,
  value,
  options,
  placeholder = 'Select…',
  disabled,
  onChange,
}: SearchableSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) {
      return options;
    }
    const lower = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower),
    );
  }, [options, search]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const displayLabel = useMemo(() => {
    if (!value) {
      return null;
    }
    const match = options.find((o) => o.value === value);
    return match?.label ?? value;
  }, [value, options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={id}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-mono text-xs h-9',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{displayLabel ?? placeholder}</span>
          <ChevronsUpDown className="w-3 h-3 ml-auto opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search…"
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-52">
            {filtered.length === 0 && (
              <CommandEmpty className="text-xs">
                {search ? 'No matching options' : 'No options available'}
              </CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered
                  .filter((o) => o.value !== '')
                  .map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option.value)}
                      className="font-mono text-xs"
                    >
                      <span className="truncate">{option.label}</span>
                      {value === option.value && <Check className="w-3 h-3 ml-auto shrink-0" />}
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
