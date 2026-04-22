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
            className={cn(
              'flex items-center gap-1.5 py-2 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-50 disabled:pointer-events-none',
              collapsed ? 'px-5' : 'px-4',
            )}
            title={collapsed ? undefined : 'Run flow'}
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run
          </button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="top">Run flow</TooltipContent>}
      </Tooltip>

      {/* Active / Inactive segmented toggle */}
      {isActive !== undefined && onToggleActive && (
        <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Active"
                onClick={() => {
                  if (!isActive) {
                    onToggleActive();
                  }
                }}
                disabled={isTogglingActive}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-sm transition-colors disabled:opacity-50',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isTogglingActive && !isActive ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                ) : (
                  <Power className={cn('w-4.5 h-4.5', isActive && 'text-emerald-500')} />
                )}
                {!collapsed && 'Active'}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="top">Active</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Inactive"
                onClick={() => {
                  if (isActive) {
                    onToggleActive();
                  }
                }}
                disabled={isTogglingActive}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-sm transition-colors disabled:opacity-50',
                  !isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isTogglingActive && isActive ? (
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                ) : (
                  <PowerOff className={cn('w-4.5 h-4.5', !isActive && 'text-red-400')} />
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
