import { DialogHeader, DialogTitle } from '../../ui/dialog';
import { InlineEdit } from '../inline-edit';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Loader2, Play } from 'lucide-react';

interface NodeConfigPanelHeaderProps {
  label: string;
  onLabelChange: (value: string) => void;
  nodeTypeLabel: string;
  Icon: React.ComponentType<{ className?: string }>;
  categoryColor: string;
  onRunNode?: () => void;
  runButtonLabel?: string;
  runDisabled?: boolean;
  isRunning?: boolean;
}

export function NodeConfigPanelHeader({
  label,
  onLabelChange,
  nodeTypeLabel,
  Icon,
  categoryColor,
  onRunNode,
  runButtonLabel = 'Run Node',
  runDisabled = false,
  isRunning = false,
}: NodeConfigPanelHeaderProps) {
  const handleRunClick = () => {
    if (runDisabled || isRunning) {
      return;
    }
    if (onRunNode) {
      onRunNode();
    } else {
      // Provide a safe fallback so the button still responds even if no handler is passed
      // eslint-disable-next-line no-console
      console.warn('Run Node action not implemented yet');
    }
  };

  return (
    <DialogHeader className="pt-0 pb-2 text-left border-b border-border">
      <DialogTitle className="sr-only">Configure {label || 'selected'} node</DialogTitle>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
              categoryColor,
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <InlineEdit
              value={label}
              onChange={onLabelChange}
              placeholder="Untitled Node"
              displayClassName="text-base font-semibold"
              inputClassName="text-base font-semibold h-auto py-0.5 px-1.5"
            />
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">
              {nodeTypeLabel}
            </Badge>
          </div>
        </div>
        <Button
          size="sm"
          className="px-4 gap-2 shrink-0"
          onClick={handleRunClick}
          disabled={runDisabled || isRunning}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              {runButtonLabel}
            </>
          )}
        </Button>
      </div>
    </DialogHeader>
  );
}
