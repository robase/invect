import { cn } from '../../lib/utils';
import { Play, Loader2, Power, PowerOff } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { useToolbarCollapsed } from './toolbar-context';

interface RunControlsProps {
  onExecute?: () => Promise<void>;
  isExecuting?: boolean;
  isActive?: boolean;
  isTogglingActive?: boolean;
  onToggleActive?: () => void;
}

/**
 * Run button + Active/Inactive toggle, rendered inside the bottom canvas toolbar.
 */
export function RunControls({
  onExecute,
  isExecuting = false,
  isActive,
  isTogglingActive = false,
  onToggleActive,
}: RunControlsProps) {
  const collapsed = useToolbarCollapsed();

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onExecute}
            disabled={isExecuting || !onExecute}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title={collapsed ? undefined : 'Run flow'}
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {!collapsed && 'Run'}
          </button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="top">Run flow</TooltipContent>}
      </Tooltip>

      {/* Active / Inactive segmented toggle */}
      {isActive !== undefined && onToggleActive && (
        <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  if (!isActive) {
                    onToggleActive();
                  }
                }}
                disabled={isTogglingActive}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors disabled:opacity-50',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isTogglingActive && !isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3 h-3" />
                )}
                {!collapsed && 'Active'}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="top">Active</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  if (isActive) {
                    onToggleActive();
                  }
                }}
                disabled={isTogglingActive}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm transition-colors disabled:opacity-50',
                  !isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isTogglingActive && isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PowerOff className="w-3 h-3" />
                )}
                {!collapsed && 'Inactive'}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="top">Inactive</TooltipContent>}
          </Tooltip>
        </div>
      )}
    </>
  );
}
