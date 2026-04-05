import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Play, Save, Settings, Share2, Loader2, Power, PowerOff } from 'lucide-react';
import { InlineEdit } from './inline-edit';
import { cn } from '../../lib/utils';
import { usePluginRegistry } from '../../contexts/PluginRegistryContext';
import { useParams } from 'react-router';

interface FlowHeaderProps {
  flowName: string;
  onFlowNameChange: (name: string) => void;
  isDirty?: boolean;
  isActive?: boolean;
  isTogglingActive?: boolean;
  onToggleActive?: () => void;
  onSave?: () => Promise<boolean | void>;
  onExecute?: () => Promise<void>;
  isSaving?: boolean;
  isExecuting?: boolean;
}

export function FlowHeader({
  flowName,
  onFlowNameChange,
  isDirty = false,
  isActive,
  isTogglingActive = false,
  onToggleActive,
  onSave,
  onExecute,
  isSaving = false,
  isExecuting = false,
}: FlowHeaderProps) {
  const { flowId } = useParams();
  const registry = usePluginRegistry();
  const flowHeaderActions = registry.headerActions['flowHeader'] ?? [];

  return (
    <header className="flex items-center justify-between px-6 border-b h-14 border-border bg-imp-background text-card-foreground">
      <div className="flex items-center gap-4">
        <InlineEdit
          value={flowName}
          onChange={onFlowNameChange}
          placeholder="Enter flow name"
          displayClassName="text-lg font-semibold text-card-foreground"
          inputClassName="h-8 w-64 text-lg font-semibold"
        />
        {isDirty ? (
          <Badge
            variant="secondary"
            className="gap-1.5 text-xs border-amber-300/40 bg-amber-100/60 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/40"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved Changes
          </Badge>
        ) : (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
            Draft
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" title="Settings" aria-label="Settings">
          <Settings className="w-4 h-4" />
        </Button>
        {/* Plugin-contributed header actions (e.g. Share button from RBAC) */}
        {flowHeaderActions
          .filter((a) => !a.permission || registry.checkPermission(a.permission, { flowId }))
          .map((action, i) => (
            <action.component key={`plugin-action-${i}`} flowId={flowId} basePath="" />
          ))}
        {/* Fallback Share button when no plugin provides one */}
        {flowHeaderActions.length === 0 && (
          <Button variant="ghost" size="icon-sm" title="Share" aria-label="Share">
            <Share2 className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={!isDirty || isSaving || !onSave}
          className={cn(
            isDirty && 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
          )}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save
        </Button>
        <Button
          size="sm"
          onClick={onExecute}
          disabled={isExecuting || !onExecute}
          className="shadow-sm"
        >
          {isExecuting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run
        </Button>

        {/* Active / Inactive segmented toggle */}
        {isActive !== undefined && onToggleActive && (
          <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!isActive) onToggleActive();
              }}
              disabled={isTogglingActive}
              className={cn(
                'h-7 gap-1.5 rounded-sm px-2.5 text-xs',
                isActive
                  ? 'bg-card text-foreground shadow-sm hover:bg-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isTogglingActive && !isActive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5" />
              )}
              Active
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isActive) onToggleActive();
              }}
              disabled={isTogglingActive}
              className={cn(
                'h-7 gap-1.5 rounded-sm px-2.5 text-xs',
                !isActive
                  ? 'bg-card text-foreground shadow-sm hover:bg-card'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isTogglingActive && isActive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PowerOff className="w-3.5 h-3.5" />
              )}
              Inactive
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
