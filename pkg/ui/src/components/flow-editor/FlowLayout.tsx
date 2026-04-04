import type React from 'react';
import { PanelLeft, Plus } from 'lucide-react';

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
  sidebarOpen = true,
  onToggleSidebar,
}: FlowLayoutProps) {
  return (
    <div className="flex flex-1 min-h-0">
      {sidebarOpen && sidebar}
      <div
        className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
        ref={viewportRef as React.RefObject<HTMLDivElement>}
      >
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          {!sidebarOpen && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card/90 backdrop-blur-sm text-card-foreground shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Open node panel"
            >
              <Plus className="w-3.5 h-3.5" />
              Add nodes
            </button>
          )}
          {modeSwitcher}
          {layoutSelector}
        </div>
        {chatToggle && <div className="absolute right-4 top-4 z-10">{chatToggle}</div>}
        {viewport}
        {chatOverlay}
      </div>
      {rightPanel}
      {chatPanel}
    </div>
  );
}

export default FlowLayout;
