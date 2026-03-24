/**
 * CopyableField — Displays a value with copy-to-clipboard and optional masking.
 *
 * Follows the pattern from the Credentials page.
 */

import { useState, type FC } from 'react';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';

interface CopyableFieldProps {
  value: string;
  masked?: boolean;
}

export const CopyableField: FC<CopyableFieldProps> = ({ value, masked = false }) => {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!masked);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayValue = revealed ? value : '•'.repeat(Math.min(value.length, 32));

  return (
    <div className="flex items-center gap-1.5">
      <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-[11px]">
        {displayValue}
      </code>
      {masked && (
        <button
          onClick={() => setRevealed(!revealed)}
          className="shrink-0 rounded p-1 hover:bg-muted text-muted-foreground transition-colors"
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      <button
        onClick={copy}
        className="shrink-0 rounded p-1 hover:bg-muted text-muted-foreground transition-colors"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
};
