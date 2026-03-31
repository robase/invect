import { useCallback, useMemo, useState } from 'react';
import type { NodeParamField } from '../../../types/node-definition.types';
import { ConfigFieldWithTemplate } from './ConfigFieldWithTemplate';
import { Button } from '../../ui/button';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ParametersSectionProps {
  fields: NodeParamField[];
  formValues: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: unknown) => void;
  emptyMessage?: string;
  portalContainer?: HTMLElement | null;
  /** Action / node type id — passed through to ConfigFieldWithTemplate for dynamic option loading. */
  nodeType?: string;
  /** Input data from upstream nodes — passed through for autocomplete in code fields. */
  inputData?: Record<string, unknown>;
}

/**
 * Get the template modes object from form values.
 * Template modes track which fields are in "template mode" vs "static mode".
 */
function getTemplateModes(formValues: Record<string, unknown>): Record<string, boolean> {
  const modes = formValues._templateModes;
  if (modes && typeof modes === 'object' && !Array.isArray(modes)) {
    return modes as Record<string, boolean>;
  }
  return {};
}

export const ParametersSection = ({
  fields,
  formValues,
  onFieldChange,
  emptyMessage,
  portalContainer,
  nodeType,
  inputData,
}: ParametersSectionProps) => {
  const templateModes = getTemplateModes(formValues);
  const [showExtended, setShowExtended] = useState(false);

  // Separate standard and extended fields
  const { standardFields, extendedFields } = useMemo(() => {
    const standard: NodeParamField[] = [];
    const extended: NodeParamField[] = [];

    for (const field of fields) {
      if (field.extended) {
        extended.push(field);
      } else {
        standard.push(field);
      }
    }

    return { standardFields: standard, extendedFields: extended };
  }, [fields]);
  const hasExpandableFields = useMemo(
    () => fields.some((field) => ['textarea', 'json', 'code'].includes(field.type)),
    [fields],
  );
  const hasExpandableExtendedFields = useMemo(
    () => extendedFields.some((field) => ['textarea', 'json', 'code'].includes(field.type)),
    [extendedFields],
  );

  const handleTemplateModeChange = useCallback(
    (fieldName: string, enabled: boolean) => {
      const currentModes = getTemplateModes(formValues);
      const updatedModes = {
        ...currentModes,
        [fieldName]: enabled,
      };
      onFieldChange('_templateModes', updatedModes);
    },
    [formValues, onFieldChange],
  );

  const renderField = (field: NodeParamField) => (
    <ConfigFieldWithTemplate
      key={field.name}
      field={field}
      value={formValues[field.name]}
      onChange={(value) => onFieldChange(field.name, value)}
      templateMode={templateModes[field.name] ?? false}
      onTemplateModeChange={(enabled) => handleTemplateModeChange(field.name, enabled)}
      portalContainer={portalContainer}
      nodeType={nodeType}
      formValues={formValues}
      inputData={inputData}
    />
  );

  if (!fields.length) {
    return <div className="text-xs text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className={cn('flex flex-col gap-3 text-xs', hasExpandableFields && 'flex-1 min-h-0')}>
      {/* Standard fields */}
      {standardFields.map(renderField)}

      {/* Extended options section */}
      {extendedFields.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'justify-start gap-1.5 h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground',
              showExtended && 'text-foreground',
            )}
            onClick={() => setShowExtended(!showExtended)}
          >
            {showExtended ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <Settings2 className="w-3 h-3" />
            <span>More Options</span>
            <span className="text-muted-foreground">({extendedFields.length})</span>
          </Button>

          {showExtended && (
            <div
              className={cn(
                'flex flex-col gap-3 pl-3 ml-2 border-l-2 border-muted',
                hasExpandableExtendedFields && 'flex-1 min-h-0',
              )}
            >
              {extendedFields.map(renderField)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
