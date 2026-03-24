import { ResizablePanel } from '../../../ui/resizable';
import { JsonPreviewPanel } from '../JsonPreviewPanel';
import { LogOut } from 'lucide-react';

interface OutputPanelProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

export function OutputPanel({ value, onChange, error }: OutputPanelProps) {
  return (
    <ResizablePanel defaultSize={25} minSize={15} className="h-full">
      <JsonPreviewPanel
        title="Output"
        value={value}
        onChange={onChange}
        error={error}
        disableLinting
        icon={<LogOut className="w-3.5 h-3.5 text-muted-foreground" />}
      />
    </ResizablePanel>
  );
}
