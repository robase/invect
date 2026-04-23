import { Code2 } from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip';
import { useUIStore } from '~/stores/uiStore';

export function ViewCodeToggleButton({ className }: { className?: string }) {
  const isOpen = useUIStore((s) => s.codePanelOpen);
  const toggle = useUIStore((s) => s.toggleCodePanel);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-label={isOpen ? 'Close code view' : 'View code'}
          className={cn(
            'hover:bg-accent',
            isOpen
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
            className,
          )}
        >
          <Code2 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{isOpen ? 'Close code view' : 'View code'}</TooltipContent>
    </Tooltip>
  );
}

export default ViewCodeToggleButton;
