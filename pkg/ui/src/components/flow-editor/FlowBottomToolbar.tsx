import type React from 'react';
import { Plus } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';
import { ToolbarCollapsedProvider } from './toolbar-context';

interface FlowBottomToolbarProps {
  layoutSelector?: React.ReactNode;
  chatToggle?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function FlowBottomToolbar({
  layoutSelector,
  chatToggle,
  toolbarExtra,
  sidebarOpen = true,
  onToggleSidebar,
}: FlowBottomToolbarProps) {
  if (!onToggleSidebar && !layoutSelector && !chatToggle && !toolbarExtra) {
    return null;
  }

  const collapsed = true;

  return (
    <TooltipProvider>
      <ToolbarCollapsedProvider value={collapsed}>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-card/90 backdrop-blur-sm shadow-md p-1.5">
          {onToggleSidebar && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleSidebar}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  title={sidebarOpen ? 'Close node panel' : 'Open node panel'}
                >
                  <Plus className="w-4 h-4" />
                  {!collapsed && 'Add nodes'}
                </button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="top">Add nodes</TooltipContent>}
            </Tooltip>
          )}
          {layoutSelector}
          {chatToggle}
          {toolbarExtra && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              {toolbarExtra}
            </>
          )}
        </div>
      </ToolbarCollapsedProvider>
    </TooltipProvider>
  );
}

export default FlowBottomToolbar;
