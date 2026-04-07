import type React from 'react';
import { Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';
import { useUIStore } from '../../stores/uiStore';
import { ToolbarCollapsedProvider } from './toolbar-context';

interface FlowLayoutProps {
  sidebar: React.ReactNode;
  viewport: React.ReactNode;
  modeSwitcher: React.ReactNode;
  layoutSelector?: React.ReactNode;
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  /** Panel that appears on the right side (e.g. tool config, node config) */
  rightPanel?: React.ReactNode;
  /** Chat toggle button rendered in the top-right toolbar */
  chatToggle?: React.ReactNode;
  /** Chat panel rendered as a right sidebar */
  chatPanel?: React.ReactNode;
  /** Floating chat overlay rendered above the viewport (for empty flows) */
  chatOverlay?: React.ReactNode;
  /** Extra controls rendered in the bottom toolbar (e.g. Run button, Active/Inactive) */
  toolbarExtra?: React.ReactNode;
  /** Whether the sidebar is open */
  sidebarOpen?: boolean;
  /** Called to toggle sidebar visibility */
  onToggleSidebar?: () => void;
}

export function FlowLayout({
  sidebar,
  viewport,
  modeSwitcher,
  layoutSelector,
  viewportRef,
  rightPanel,
  chatToggle,
  chatPanel,
  chatOverlay,
  toolbarExtra,
  sidebarOpen = true,
  onToggleSidebar,
}: FlowLayoutProps) {
  const collapsed = useUIStore((s) => s.toolbarCollapsed);
  const toggleCollapsed = useUIStore((s) => s.toggleToolbarCollapsed);

  return (
    <div className="flex flex-1 min-h-0">
      {sidebarOpen && sidebar}
      <div
        className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
        ref={viewportRef as React.RefObject<HTMLDivElement>}
      >
        {/* Mode switcher - top center */}
        <div className="absolute left-1/2 -translate-x-1/2 top-4 z-10">{modeSwitcher}</div>

        {viewport}
        {chatOverlay}

        {/* Bottom toolbar - Figma-style */}
        {(onToggleSidebar || layoutSelector || chatToggle || toolbarExtra) && (
          <TooltipProvider>
            <ToolbarCollapsedProvider value={collapsed}>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-lg border border-border bg-card/90 backdrop-blur-sm shadow-md p-1">
                {/* Collapse / expand toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleCollapsed}
                      className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {collapsed ? (
                        <PanelLeftOpen className="w-3.5 h-3.5" />
                      ) : (
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
                  </TooltipContent>
                </Tooltip>

                {onToggleSidebar && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onToggleSidebar}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        title={sidebarOpen ? 'Close node panel' : 'Open node panel'}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {!collapsed && 'Add nodes'}
                      </button>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="top">Add nodes</TooltipContent>
                    )}
                  </Tooltip>
                )}
                {layoutSelector}
                {chatToggle}
                {toolbarExtra && (
                  <>
                    <div className="w-px h-4 bg-border mx-0.5" />
                    {toolbarExtra}
                  </>
                )}
              </div>
            </ToolbarCollapsedProvider>
          </TooltipProvider>
        )}
      </div>
      {rightPanel}
      {chatPanel}
    </div>
  );
}

export default FlowLayout;
