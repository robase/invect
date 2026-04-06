import { useState, useCallback } from 'react';
import { ResizablePanel } from '../../../ui/resizable';
import { JsonPreviewPanel } from '../JsonPreviewPanel';
import { LogOut, AlertCircle, Copy, Check } from 'lucide-react';
import { Button } from '../../../ui/button';
import { CodeMirrorJsonEditor } from '../../../ui/codemirror-json-editor';

interface OutputPanelProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

/**
 * Try to pretty-print a string if it contains JSON.
 * Handles cases like "Google Drive API error: 403 - {json...}"
 */
function formatErrorForDisplay(error: string): string {
  // Try to parse the whole thing as JSON first
  try {
    const parsed = JSON.parse(error);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // noop
  }

  // Try to find JSON within the string (e.g. "Some prefix: {json}")
  const jsonStart = error.indexOf('{');
  if (jsonStart > 0) {
    const prefix = error.slice(0, jsonStart).trim();
    const jsonPart = error.slice(jsonStart);
    try {
      const parsed = JSON.parse(jsonPart);
      return `${prefix}\n\n${JSON.stringify(parsed, null, 2)}`;
    } catch {
      // noop
    }
  }

  return error;
}

export function OutputPanel({ value, onChange, error }: OutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyError = useCallback(() => {
    if (!error) {return;}
    navigator.clipboard.writeText(error).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [error]);

  // When there's an error, show a dedicated error view instead of the normal output
  if (error) {
    const formattedError = formatErrorForDisplay(error);

    return (
      <ResizablePanel defaultSize={25} minSize={15} className="h-full">
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
          {/* Error toolbar header */}
          <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 border-b border-destructive/30 bg-destructive/5 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-[11px] font-semibold tracking-wider uppercase text-destructive">
                Error Output
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-6 h-6 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                onClick={handleCopyError}
                title="Copy error to clipboard"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Error content in CodeMirror editor (scrollable, selectable) */}
          <div className="relative flex-1 min-h-0">
            <CodeMirrorJsonEditor
              value={formattedError}
              readOnly
              className="h-full"
              disableLinting
            />
          </div>
        </div>
      </ResizablePanel>
    );
  }

  return (
    <ResizablePanel defaultSize={25} minSize={15} className="h-full">
      <JsonPreviewPanel
        title="Output"
        value={value}
        onChange={onChange}
        disableLinting
        icon={<LogOut className="w-3.5 h-3.5 text-muted-foreground" />}
      />
    </ResizablePanel>
  );
}
