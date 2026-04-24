import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
import { useToolbarCollapsed } from '../flow-editor/toolbar-context';

interface LayoutSelectorProps {
  onRealign: () => void;
  className?: string;
}

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({ onRealign, className }) => {
  const collapsed = useToolbarCollapsed();

  return (
    <div className={cn('relative', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onRealign}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <AlignHorizontalDistributeCenter className="w-4 h-4" />
            {!collapsed && 'Realign'}
          </button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="top">Realign</TooltipContent>}
      </Tooltip>
    </div>
  );
};
