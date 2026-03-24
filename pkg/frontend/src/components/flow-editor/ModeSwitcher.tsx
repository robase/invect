import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Edit3, History } from 'lucide-react';

export type ViewMode = 'edit' | 'runs';

interface ModeSwitcherProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

export function ModeSwitcher({ mode, onModeChange }: ModeSwitcherProps) {
  const isEditMode = mode === 'edit';

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onModeChange('edit')}
        className={cn(
          'h-7 gap-1.5 rounded-sm px-2.5 text-xs',
          isEditMode
            ? 'bg-card text-foreground shadow-sm hover:bg-card'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Edit3 className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onModeChange('runs')}
        className={cn(
          'h-7 gap-1.5 rounded-sm px-2.5 text-xs',
          !isEditMode
            ? 'bg-card text-foreground shadow-sm hover:bg-card'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <History className="h-3.5 w-3.5" />
        Runs
      </Button>
    </div>
  );
}

export default ModeSwitcher;
