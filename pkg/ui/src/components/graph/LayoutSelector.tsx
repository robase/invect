import React from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
import { useToolbarCollapsed } from '../flow-editor/toolbar-context';
import type { LayoutAlgorithm } from '../../utils/layoutUtils';

interface LayoutSelectorProps {
  currentLayout: LayoutAlgorithm;
  onLayoutChange: (layout: LayoutAlgorithm, direction?: 'TB' | 'BT' | 'LR' | 'RL') => void;
  className?: string;
}

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({ onLayoutChange, className }) => {
  const collapsed = useToolbarCollapsed();

  const handleRealign = () => {
    onLayoutChange('elkjs', 'LR');
  };

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRealign}
              className="h-8 gap-1.5 rounded-md px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
              {!collapsed && 'Realign'}
            </Button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="top">Realign</TooltipContent>}
        </Tooltip>
      </div>
    </div>
  );
};
