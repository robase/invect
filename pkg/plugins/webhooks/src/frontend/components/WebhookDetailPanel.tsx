/**
 * WebhookDetailPanel — Detail view rendered inside a Dialog.
 *
 * Tabs: Overview | Edit
 * Shows webhook URL, secret, status, linked flow, stats.
 * Allows toggling enabled/disabled, editing, and deleting.
 */

import { useState, type FC } from 'react';
import {
  Globe,
  Trash2,
  ExternalLink,
  Clock,
  Hash,
  ToggleLeft,
  ToggleRight,
  Workflow,
  Loader2,
} from 'lucide-react';
import { DialogHeader, DialogTitle, DialogDescription } from '@invect/frontend';
import {
  useUpdateWebhookTrigger,
  useDeleteWebhookTrigger,
} from '../hooks/useWebhookQueries';
import { CopyableField } from './CopyableField';
import type { WebhookTrigger, UpdateWebhookTriggerInput } from '../../shared/types';

// ─── Constants ──────────────────────────────────────────────────────

const AUTH_MODE_CONFIG: Record<string, { label: string; color: string }> = {
  generic: {
    label: 'Unauthenticated',
    color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400',
  },
  signed: {
    label: 'Signed',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
};

function getAuthModeConfig(trigger: WebhookTrigger) {
  if (trigger.provider === 'generic') {
    return AUTH_MODE_CONFIG.generic;
  }
  return AUTH_MODE_CONFIG.signed;
}

function formatFullDate(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Component ──────────────────────────────────────────────────────

type Section = 'overview' | 'edit';

interface WebhookDetailPanelProps {
  trigger: WebhookTrigger;
  flowName?: string;
  onClose: () => void;
}

export const WebhookDetailPanel: FC<WebhookDetailPanelProps> = ({
  trigger,
  flowName,
  onClose,
}) => {
  const [section, setSection] = useState<Section>('overview');
  const updateMutation = useUpdateWebhookTrigger();
  const deleteMutation = useDeleteWebhookTrigger();

  const authModeConfig = getAuthModeConfig(trigger);

  const handleToggleEnabled = () => {
    updateMutation.mutate({ id: trigger.id, isEnabled: !trigger.isEnabled });
  };

  const handleDelete = () => {
    if (confirm(`Delete webhook "${trigger.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(trigger.id, { onSuccess: onClose });
    }
  };

  return (
    <>
      {/* Fixed header */}
      <div className="px-6 pt-6 pb-0">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/60 shrink-0">
              <Globe className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{trigger.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-0.5 text-xs">
                <span
                  className={`inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[10px] font-medium ${authModeConfig.color}`}
                >
                  {authModeConfig.label}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    trigger.isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  }`}
                />
                <span>{trigger.isEnabled ? 'Enabled' : 'Disabled'}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab nav */}
        <div className="flex gap-1 border-b -mx-6 px-6 mt-4">
          {([
            { key: 'overview' as const, label: 'Overview' },
            { key: 'edit' as const, label: 'Edit' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                section === key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {section === 'overview' ? (
          <OverviewSection
            trigger={trigger}
            flowName={flowName}
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
            isToggling={updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
          />
        ) : (
          <EditSection
            trigger={trigger}
            onSuccess={() => setSection('overview')}
          />
        )}
      </div>
    </>
  );
};

// ─── Overview Section ───────────────────────────────────────────────

const OverviewSection: FC<{
  trigger: WebhookTrigger;
  flowName?: string;
  onToggleEnabled: () => void;
  onDelete: () => void;
  isToggling: boolean;
  isDeleting: boolean;
}> = ({ trigger, flowName, onToggleEnabled, onDelete, isToggling, isDeleting }) => (
  <div className="pt-4 space-y-5">
    {/* Endpoint URL */}
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Webhook URL
      </label>
      <CopyableField value={`/plugins/webhooks/receive/${trigger.webhookPath}`} />
    </div>

    {/* Signing secret */}
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Endpoint Secret
      </label>
      <CopyableField value={trigger.webhookSecret} masked />
      <p className="text-xs text-muted-foreground">
        Used when signed verification is enabled for this endpoint.
      </p>
    </div>

    {/* Info grid */}
    <div className="grid grid-cols-2 gap-4 py-2">
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Methods</span>
        <span className="text-sm font-mono">{trigger.allowedMethods}</span>
      </div>
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Authentication</span>
        <span className="text-sm">{getAuthModeConfig(trigger).label}</span>
      </div>
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Created</span>
        <span className="text-sm">{formatFullDate(trigger.createdAt)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Hash className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Triggers:</span>
        <span className="text-sm font-medium">{trigger.triggerCount}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Last:</span>
        <span className="text-sm">{formatFullDate(trigger.lastTriggeredAt)}</span>
      </div>
    </div>

    {/* Linked flow */}
    {trigger.flowId && (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground block">Linked Flow</span>
            <a
              href={`/invect/flow/${trigger.flowId}`}
              className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              {flowName ?? trigger.flowId}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    )}

    {/* Last payload */}
    {trigger.lastPayload != null && (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Last Payload
        </label>
        <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-auto max-h-32">
          {JSON.stringify(trigger.lastPayload, null, 2)}
        </pre>
      </div>
    )}

    {/* Actions */}
    <div className="flex items-center justify-between pt-3 border-t">
      <button
        onClick={onToggleEnabled}
        disabled={isToggling}
        className={`inline-flex items-center gap-2 rounded-md text-sm font-medium h-8 px-3 border transition-colors ${
          trigger.isEnabled
            ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30'
            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
        }`}
      >
        {isToggling ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : trigger.isEnabled ? (
          <ToggleLeft className="w-3.5 h-3.5" />
        ) : (
          <ToggleRight className="w-3.5 h-3.5" />
        )}
        {trigger.isEnabled ? 'Disable' : 'Enable'}
      </button>

      <button
        onClick={onDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-2 rounded-md text-sm font-medium h-8 px-3 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
      >
        {isDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
        Delete
      </button>
    </div>
  </div>
);

// ─── Edit Section ───────────────────────────────────────────────────

const EditSection: FC<{
  trigger: WebhookTrigger;
  onSuccess: () => void;
}> = ({ trigger, onSuccess }) => {
  const [name, setName] = useState(trigger.name);
  const [description, setDescription] = useState(trigger.description ?? '');
  const [methods, setMethods] = useState(trigger.allowedMethods);
  const updateMutation = useUpdateWebhookTrigger();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const input: UpdateWebhookTriggerInput & { id: string } = {
      id: trigger.id,
      name: name.trim(),
      description: description.trim() || undefined,
      allowedMethods: methods,
    };
    updateMutation.mutate(input, { onSuccess });
  };

  return (
    <form onSubmit={handleSubmit} className="pt-4 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="wh-edit-name">
          Name *
        </label>
        <input
          id="wh-edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="wh-edit-desc">
          Description
        </label>
        <textarea
          id="wh-edit-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          className="w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 field-sizing-content"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-sm font-medium">Authentication</div>
        <p className="text-xs text-muted-foreground">
          This endpoint is currently configured as {getAuthModeConfig(trigger).label.toLowerCase()}.
          Provider-specific verification is not configured from this screen.
        </p>
      </div>

      <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="wh-edit-methods">
            HTTP Methods
          </label>
          <select
            id="wh-edit-methods"
            value={methods}
            onChange={(e) => setMethods(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
          >
            <option value="POST">POST only</option>
            <option value="POST,PUT">POST + PUT</option>
            <option value="ANY">Any method</option>
          </select>
      </div>

      {updateMutation.isError && (
        <p className="text-sm text-red-500">
          {updateMutation.error?.message || 'Failed to save changes'}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onSuccess}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 border bg-background shadow-xs hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || updateMutation.isPending}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
};
