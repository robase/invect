import { useEffect, useMemo, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Loader2 } from 'lucide-react';
import { useLoadFieldOptions } from '../../../api/node-data.api';
import type { NodeParamField } from '../../../types/node-definition.types';

interface DynamicSelectFieldProps {
  /** The action / node type id (e.g. "core.model"). */
  actionId: string;
  /** The field definition — must have `loadOptions`. */
  field: NodeParamField;
  /** Current field value. */
  value: unknown;
  /** Called when the user picks a new value. */
  onChange: (value: unknown) => void;
  /** Current form values — used to extract dependency values. */
  formValues: Record<string, unknown>;
  /** Portal container for the dropdown. */
  portalContainer?: HTMLElement | null;
}

/**
 * A select field whose options are loaded from the server via the
 * `loadOptions` system.  Re-fetches whenever any of the declared
 * dependency fields change.
 */
export function DynamicSelectField({
  actionId,
  field,
  value,
  onChange,
  formValues,
  portalContainer,
}: DynamicSelectFieldProps) {
  const dependsOn = field.loadOptions?.dependsOn ?? [];

  // Build dependency values from formValues
  const dependencyValues = useMemo(() => {
    const deps: Record<string, unknown> = {};
    for (const dep of dependsOn) {
      deps[dep] = formValues[dep];
    }
    return deps;
  }, [dependsOn, ...dependsOn.map((d) => formValues[d])]);

  // Only fetch when all dependency values are non-empty
  const hasDeps = dependsOn.every(
    (d) =>
      dependencyValues[d] !== undefined &&
      dependencyValues[d] !== null &&
      dependencyValues[d] !== '',
  );

  const { data, isLoading, isError, error } = useLoadFieldOptions(
    actionId,
    field.name,
    dependencyValues,
    { enabled: hasDeps },
  );

  // Auto-select the default value when options arrive (only on first load
  // or when the current value is not in the new option set).
  const prevDepsKey = useRef<string>('');
  useEffect(() => {
    if (!data) {
      return;
    }
    const depsKey = JSON.stringify(dependencyValues);
    if (depsKey === prevDepsKey.current) {
      return;
    }
    prevDepsKey.current = depsKey;

    const currentStr = value === undefined || value === null ? '' : String(value);
    const inList = data.options.some((o) => String(o.value) === currentStr);

    if (!inList && data.defaultValue !== undefined) {
      onChange(data.defaultValue);
    } else if (!inList && data.options.length > 0 && currentStr) {
      // Current value is stale — clear it so the user picks a new one
      onChange('');
    }
  }, [data, dependencyValues, value, onChange]);

  // Merge static options from field definition with dynamic options
  const options = data?.options ?? field.options ?? [];
  const placeholder = data?.placeholder ?? field.placeholder ?? 'Select…';
  const disabled = field.disabled || data?.disabled || false;

  const stringValue = value === undefined || value === null ? '' : String(value);

  // If the current value is not in the options list, prepend it so the
  // user can still see what was previously selected.
  const optionEntries = options.map((o) => ({ label: o.label, value: String(o.value) }));
  const hasCurrentValue = stringValue ? optionEntries.some((o) => o.value === stringValue) : false;
  const renderOptions =
    hasCurrentValue || !stringValue
      ? optionEntries
      : [{ label: stringValue, value: stringValue }, ...optionEntries];

  return (
    <div className="relative">
      <Select
        value={stringValue}
        onValueChange={(val) => onChange(val)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger
          id={field.name}
          className={isLoading ? 'font-mono text-xs opacity-60' : 'font-mono text-xs'}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent className="z-[80] font-mono text-xs" container={portalContainer}>
          {renderOptions
            .filter((o) => o.value !== '')
            .map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          {renderOptions.length === 0 && !isLoading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {!hasDeps ? 'Fill in required fields first' : 'No options available'}
            </div>
          )}
        </SelectContent>
      </Select>
      {isError && (
        <p className="mt-1 text-xs text-destructive">
          {error instanceof Error ? error.message : 'Failed to load options'}
        </p>
      )}
    </div>
  );
}
