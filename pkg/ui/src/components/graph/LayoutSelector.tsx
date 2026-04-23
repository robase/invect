import React from 'react';
import { Button } from '../ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { AlignHorizontalDistributeCenter, ChevronDown } from 'lucide-react';
import { useToolbarCollapsed } from '../flow-editor/toolbar-context';
import type { LayoutAlgorithm } from '../../utils/layoutUtils';

type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

interface LayoutSelectorProps {
  currentLayout: LayoutAlgorithm;
  currentDirection?: LayoutDirection;
  onLayoutChange: (layout: LayoutAlgorithm, direction?: LayoutDirection) => void;
  className?: string;
}

const ALGORITHM_OPTIONS: Array<{
  value: LayoutAlgorithm;
  label: string;
  description: string;
}> = [
  {
    value: 'invect',
    label: 'Invect',
    description: 'Tuned for Invect flows (branch centering, chain alignment, grid snap)',
  },
  { value: 'elkjs', label: 'ELK', description: 'Port-aware layered (best edge routing)' },
  { value: 'dagre', label: 'Dagre', description: 'Hierarchical with branch offsets' },
];

const DIRECTION_OPTIONS: Array<{ value: LayoutDirection; label: string }> = [
  { value: 'LR', label: 'Left → Right' },
  { value: 'RL', label: 'Right → Left' },
  { value: 'TB', label: 'Top → Bottom' },
  { value: 'BT', label: 'Bottom → Top' },
];

export const LayoutSelector: React.FC<LayoutSelectorProps> = ({
  currentLayout,
  currentDirection = 'LR',
  onLayoutChange,
  className,
}) => {
  const collapsed = useToolbarCollapsed();

  const handleRealign = () => {
    onLayoutChange(currentLayout, currentDirection);
  };

  const handleAlgorithmChange = (value: string) => {
    onLayoutChange(value as LayoutAlgorithm, currentDirection);
  };

  const handleDirectionChange = (value: string) => {
    onLayoutChange(currentLayout, value as LayoutDirection);
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
              className="h-9 gap-1.5 rounded-r-none rounded-l-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <AlignHorizontalDistributeCenter className="w-4.5 h-4.5" />
              {!collapsed && 'Realign'}
            </Button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="top">Realign</TooltipContent>}
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Layout options"
                  className="h-9 w-7 rounded-l-none rounded-r-md border-l border-border/50 px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Layout options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center" sideOffset={8} className="w-64">
            <DropdownMenuLabel>Algorithm</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={currentLayout} onValueChange={handleAlgorithmChange}>
              {ALGORITHM_OPTIONS.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className="items-start"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Direction</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={currentDirection} onValueChange={handleDirectionChange}>
              {DIRECTION_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
