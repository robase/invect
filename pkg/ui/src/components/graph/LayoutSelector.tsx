import React from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { AlignHorizontalDistributeCenter } from 'lucide-react';
import type { LayoutAlgorithm } from '../../utils/layoutUtils';

interface LayoutSelectorProps {
  currentLayout: LayoutAlgorithm;
  onLayoutChange: (layout: LayoutAlgorithm, direction?: 'TB' | 'BT' | 'LR' | 'RL') => void;
  className?: string;
}

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({ onLayoutChange, className }) => {
  const handleRealign = () => {
    onLayoutChange('elkjs', 'LR');
  };

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRealign}
          className="h-8 gap-1.5 rounded-md px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
          Realign
        </Button>
      </div>
    </div>
  );
};
