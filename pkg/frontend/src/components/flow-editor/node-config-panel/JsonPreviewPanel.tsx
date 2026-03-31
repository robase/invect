import { Button } from '../../ui/button';
import { CodeMirrorJsonEditor } from '../../ui/codemirror-json-editor';
import { Copy, RotateCcw, AlignLeft, Braces } from 'lucide-react';
import { useCallback } from 'react';
import type { UpstreamSlot } from './types';

interface JsonPreviewPanelProps {
  title: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string | null;
  /** Disable JSON syntax error highlighting (useful for output panels showing plain text) */
  disableLinting?: boolean;
  /** Show test mode indicator and reset button */
  isTestMode?: boolean;
  /** Callback when reset button is clicked */
  onReset?: () => void;
  /** Upstream slot metadata for inline run controls */
  upstreamSlots?: UpstreamSlot[];
  /** Called when user clicks the run/retry button for a slot */
  onRunSlot?: (slot: UpstreamSlot) => void;
  /** Icon to display in the toolbar */
  icon?: React.ReactElement;
  /** Extra toolbar content (e.g. "Run All" button) */
  toolbarExtra?: React.ReactNode;
}

export const JsonPreviewPanel = ({
  title,
  value,
  onChange,
  error,
  disableLinting = false,
  isTestMode = false,
  onReset,
  upstreamSlots,
  onRunSlot,
  icon,
  toolbarExtra,
}: JsonPreviewPanelProps) => {
  const isReadOnly = !onChange;

  const handleFormat = () => {
    if (!onChange) {
      return;
    }
    try {
      const formatted = JSON.stringify(JSON.parse(value || '{}'), null, 2);
      onChange(formatted);
    } catch {
      // noop - keep current value if parse fails
    }
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
  }, [value]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      {/* Toolbar header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          {icon || <Braces className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            {title}
          </span>
          {isTestMode && (
            <span className="text-[10px] font-medium text-accent-foreground bg-accent/50 border border-border px-1.5 py-0.5 rounded">
              TEST
            </span>
          )}
        </div>
        <div className="flex items-center justify-center">{toolbarExtra}</div>
        <div className="flex items-center gap-0.5 justify-end">
          {isTestMode && onReset && (
            <Button
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 text-accent-foreground hover:bg-accent/50"
              onClick={onReset}
              title="Reset to original input"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            <Copy className="w-3 h-3" />
          </Button>
          {onChange && (
            <Button
              variant="ghost"
              size="sm"
              className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleFormat}
              title="Format JSON"
            >
              <AlignLeft className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor area - fills remaining height */}
      <div className="relative flex-1 min-h-0">
        <CodeMirrorJsonEditor
          value={value}
          onChange={onChange}
          readOnly={isReadOnly}
          className="h-full"
          disableLinting={disableLinting}
          upstreamSlots={upstreamSlots}
          onRunSlot={onRunSlot}
        />
      </div>

      {error && (
        <div className="px-3 py-1.5 border-t border-destructive/20 bg-destructive/5 shrink-0">
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}
    </div>
  );
};
