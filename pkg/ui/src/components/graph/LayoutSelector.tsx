import React from 'react';
import { Button } from '../ui/button';
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onRealign}
            className="h-9 gap-1.5 rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <AlignHorizontalDistributeCenter className="w-4.5 h-4.5" />
            {!collapsed && 'Realign'}
          </Button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="top">Realign</TooltipContent>}
      </Tooltip>
    </div>
  );
};
