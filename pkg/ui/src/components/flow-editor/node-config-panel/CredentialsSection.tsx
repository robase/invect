import { useCallback } from 'react';
import { Label } from '../../ui/label';
import { Button } from '../../ui/button';
import { Code2, Type } from 'lucide-react';
import type { NodeParamField } from '../../../types/node-definition.types';
import type { Credential } from '../../../api/types';
import { CredentialCombobox } from './CredentialCombobox';
import { DroppableInput } from './DroppableInput';
import { cn } from '../../../lib/utils';
import { filterCredentialsForField } from '../../../utils/credentialFiltering';

interface CredentialsSectionProps {
  fields: NodeParamField[];
  formValues: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: string) => void;
  credentials: Credential[];
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => void;
  onAddNewCredential: (fieldName: string) => void;
  onEditCredential?: (credential: Credential) => void;
  onRefreshOAuthCredential?: (credential: Credential) => void;
  refreshingCredentialId?: string | null;
  portalContainer?: HTMLElement | null;
  disablePortal?: boolean;
}

/**
 * Get the template modes object from form values.
 */
function getTemplateModes(formValues: Record<string, unknown>): Record<string, boolean> {
  const modes = formValues._templateModes;
  if (modes && typeof modes === 'object' && !Array.isArray(modes)) {
    return modes as Record<string, boolean>;
  }
  return {};
}

export const CredentialsSection = ({
  fields,
  formValues,
  onFieldChange,
  credentials,
  isLoading,
  isError,
  onRefresh,
  onAddNewCredential,
  onEditCredential,
  onRefreshOAuthCredential,
  refreshingCredentialId,
  portalContainer,
  disablePortal = true,
}: CredentialsSectionProps) => {
  const templateModes = getTemplateModes(formValues);

  const handleTemplateModeChange = useCallback(
    (fieldName: string, enabled: boolean) => {
      const currentModes = getTemplateModes(formValues);
      const updatedModes = {
        ...currentModes,
        [fieldName]: enabled,
      };
      // We need to use a generic field change for _templateModes
      // Since onFieldChange expects string value, we'll use a workaround
      // by storing it in formValues through a parent handler
      (onFieldChange as (fieldName: string, value: unknown) => void)(
        '_templateModes',
        updatedModes,
      );
    },
    [formValues, onFieldChange],
  );

  if (!fields.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 pb-3">
      {isLoading && <div className="text-[11px] text-muted-foreground">Loading credentials…</div>}
      {isError && !isLoading && (
        <div className="text-[11px] text-destructive">
          Failed to load credentials. Please try again.
        </div>
      )}
      {fields.map((field) => {
        const isTemplateMode = templateModes[field.name] ?? false;
        const fieldCredentials = filterCredentialsForField(credentials, field);

        const templateModeToggle = (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-5 px-1.5 text-[10px] gap-0.5',
              isTemplateMode ? 'text-primary' : 'text-muted-foreground',
            )}
            onClick={() => handleTemplateModeChange(field.name, !isTemplateMode)}
            title={isTemplateMode ? 'Switch to static value' : 'Switch to template'}
          >
            {isTemplateMode ? (
              <>
                <Code2 className="h-2.5 w-2.5" />
                <span>Template</span>
              </>
            ) : (
              <>
                <Type className="h-2.5 w-2.5" />
                <span>Static</span>
              </>
            )}
          </Button>
        );

        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`credential-${field.name}`} className="text-xs">
                {field.label}
              </Label>
              {templateModeToggle}
            </div>
            {isTemplateMode ? (
              <DroppableInput
                id={`credential-${field.name}`}
                className="font-mono text-xs"
                rows={1}
                value={(formValues[field.name] as string) ?? ''}
                placeholder="{{ config_node.data.variables.credential_id.value }}"
                onChange={(newValue) => onFieldChange(field.name, newValue)}
              />
            ) : (
              <CredentialCombobox
                credentials={fieldCredentials}
                value={(formValues[field.name] as string) ?? ''}
                onChange={(value) => onFieldChange(field.name, value)}
                placeholder={field.placeholder || 'Select credential'}
                isLoading={isLoading}
                isError={isError}
                onRetry={onRefresh}
                onAddNew={() => onAddNewCredential(field.name)}
                onEditCredential={onEditCredential}
                onRefreshOAuthCredential={onRefreshOAuthCredential}
                refreshingCredentialId={refreshingCredentialId}
                container={portalContainer}
                disablePortal={disablePortal}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
