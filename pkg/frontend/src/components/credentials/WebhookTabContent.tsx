import React, { useState } from 'react';
import { Webhook, Loader2, Check, Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { useCredentialWebhookInfo, useEnableCredentialWebhook } from '../../api/credentials.api';

function CopyableField({ value, masked = false }: { value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const displayValue = masked ? '•'.repeat(Math.min(value.length, 32)) : value;
  return (
    <div className="flex items-center gap-1.5">
      <code
        className={`flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-[11px]${
          masked ? ' tracking-widest' : ''
        }`}
        title={masked ? 'Click copy to reveal' : value}
      >
        {displayValue}
      </code>
      <button
        onClick={handleCopy}
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function WebhookTabContent({ credentialId }: { credentialId: string }) {
  const { data: webhookInfo, isLoading } = useCredentialWebhookInfo(credentialId);
  const enableMutation = useEnableCredentialWebhook();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading webhook info…
      </div>
    );
  }

  if (!webhookInfo) {
    return (
      <div className="pt-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground">Credential Webhook</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable a webhook so external services can trigger flows that use this credential.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => enableMutation.mutate(credentialId)}
          disabled={enableMutation.isPending}
        >
          {enableMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Enabling…
            </>
          ) : (
            <>
              <Webhook className="w-3.5 h-3.5 mr-1.5" />
              Enable Webhook
            </>
          )}
        </Button>
        {enableMutation.isError && (
          <p className="text-xs text-destructive">Failed to enable webhook. Please try again.</p>
        )}
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">Credential Webhook</p>
        <p className="mt-1 text-xs text-muted-foreground">
          External services send events to this URL. All flows with a Webhook Trigger node
          referencing this credential will be triggered automatically.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          URL
        </label>
        <CopyableField
          value={webhookInfo.fullUrl ?? `/webhooks/credentials/${webhookInfo.webhookPath}`}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Secret
        </label>
        <CopyableField value={webhookInfo.webhookSecret} masked />
      </div>
    </div>
  );
}
