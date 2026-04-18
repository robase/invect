/**
 * VcHeaderButton — Header action that opens version control details for a flow.
 *
 * Shows sync state and exposes flow version history, sync actions, and restore/open
 * controls for previous versions.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  GitBranch,
  ArrowUpFromLine,
  ArrowDownToLine,
  Loader2,
  ExternalLink,
  History,
  RotateCcw,
  Send,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useCreateFlowVersion,
  useFlowVersions,
  type HeaderActionProps,
} from '@invect/ui';
import type { FlowVersion } from '@invect/core/types';
import {
  useFlowSyncHistory,
  useFlowSyncStatus,
  usePublishFlow,
  usePullFlow,
  usePushFlow,
} from '../hooks/useFlowSync';

export function VcHeaderButton({ flowId, basePath }: HeaderActionProps) {
  if (!flowId) {
    return null;
  }

  return <VcHeaderButtonInner flowId={flowId} basePath={basePath} />;
}

function VcHeaderButtonInner({ flowId, basePath }: { flowId: string; basePath: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useFlowSyncStatus(flowId);
  const { data: syncHistoryData } = useFlowSyncHistory(flowId);
  const { data: versionsData, isLoading: versionsLoading } = useFlowVersions(flowId, {
    sort: { sortBy: 'version', sortOrder: 'desc' },
    pagination: { page: 1, limit: 20 },
  });
  const createVersionMutation = useCreateFlowVersion();
  const pushMutation = usePushFlow(flowId);
  const pullMutation = usePullFlow(flowId);
  const publishMutation = usePublishFlow(flowId);

  const status = data?.status;
  const config = data?.config;
  const syncHistory = syncHistoryData?.history ?? [];
  const versions = useMemo(() => {
    const items = versionsData?.data ?? [];
    return [...items].sort((left, right) => right.version - left.version);
  }, [versionsData]);

  const isBusy =
    isLoading ||
    pushMutation.isPending ||
    pullMutation.isPending ||
    publishMutation.isPending ||
    createVersionMutation.isPending;
  const canPush = config?.syncDirection !== 'pull';
  const canPull = config?.syncDirection !== 'push';
  const canPublish = config?.mode === 'pr-per-publish' && config.syncDirection !== 'pull';
  const currentViewedVersion = getCurrentViewedVersion();
  const latestVersion = versions[0]?.version ?? null;

  const statusColor =
    status === 'synced'
      ? 'text-green-500'
      : status === 'pending'
        ? 'text-yellow-500'
        : status === 'conflict'
          ? 'text-red-500'
          : 'text-imp-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
          title="Open version control details"
        >
          <span className={statusColor}>
            <GitBranch className="h-4 w-4" />
          </span>
          <span>Version Control</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Version Control</DialogTitle>
          <DialogDescription>
            Review Git sync status and work with previous flow versions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[75vh] gap-0 overflow-hidden md:grid-cols-[1.1fr_1.4fr]">
          <div className="border-b px-6 py-5 md:border-r md:border-b-0">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Git Sync</h3>
              <span className={`text-xs font-medium capitalize ${statusColor}`}>
                {status ?? 'unknown'}
              </span>
            </div>

            {config ? (
              <>
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                  <InfoRow label="Repository" value={config.repo} mono />
                  <InfoRow label="Branch" value={config.branch} mono />
                  <InfoRow label="File" value={config.filePath} mono />
                  <InfoRow label="Mode" value={config.mode} />
                  <InfoRow label="Direction" value={config.syncDirection} />
                  {config.activePrUrl ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Active PR</span>
                      <a
                        href={config.activePrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        #{config.activePrNumber}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {canPush ? (
                    <ActionButton
                      label="Push"
                      busy={pushMutation.isPending}
                      disabled={isBusy}
                      icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
                      onClick={() => pushMutation.mutate()}
                    />
                  ) : null}
                  {canPull ? (
                    <ActionButton
                      label="Pull"
                      busy={pullMutation.isPending}
                      disabled={isBusy}
                      icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                      onClick={() => pullMutation.mutate()}
                    />
                  ) : null}
                  {canPublish ? (
                    <ActionButton
                      label="Publish"
                      busy={publishMutation.isPending}
                      disabled={isBusy}
                      primary
                      icon={<Send className="h-3.5 w-3.5" />}
                      onClick={() => publishMutation.mutate()}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                This flow is not connected to a Git remote yet. Local version history is still
                available below.
              </div>
            )}

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recent Sync Activity</h3>
              </div>
              {syncHistory.length > 0 ? (
                <div className="space-y-2">
                  {syncHistory.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="rounded-lg border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium capitalize">
                          {entry.action.replace('-', ' ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(entry.createdAt)}
                        </span>
                      </div>
                      {entry.message ? (
                        <p className="mt-1 text-xs text-muted-foreground">{entry.message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sync activity recorded yet.</p>
              )}
            </div>
          </div>

          <div className="min-h-0 px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">Flow Versions</h3>
                <p className="text-sm text-muted-foreground">
                  Open any previous version or restore it as the latest version.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Showing {versions.length} versions
              </span>
            </div>

            <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
              {versionsLoading ? (
                <div className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading versions...
                </div>
              ) : versions.length > 0 ? (
                versions.map((version) => {
                  const isLatest = latestVersion === version.version;
                  const isCurrentView = currentViewedVersion
                    ? currentViewedVersion === version.version
                    : isLatest;

                  return (
                    <div
                      key={`${version.flowId}-${version.version}`}
                      className="rounded-xl border p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">v{version.version}</span>
                            {isCurrentView ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                Open now
                              </span>
                            ) : null}
                            {isLatest ? (
                              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700">
                                Latest
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <p>Created {formatTimestamp(version.createdAt)}</p>
                            <p>Author {version.createdBy ?? 'Unknown'}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isCurrentView}
                            onClick={() => openVersion(basePath, flowId, version.version)}
                            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            disabled={createVersionMutation.isPending}
                            onClick={() =>
                              restoreVersion({
                                basePath,
                                flowId,
                                version,
                                onDone: () => setOpen(false),
                                restore: createVersionMutation.mutateAsync,
                              })
                            }
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {createVersionMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restore
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  No saved versions found for this flow yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionButton({
  label,
  icon,
  busy,
  disabled,
  onClick,
  primary = false,
}: {
  label: string;
  icon: ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
          : 'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50'
      }
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={mono ? 'max-w-[16rem] truncate font-mono text-xs' : 'text-right'}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getCurrentViewedVersion() {
  if (typeof window === 'undefined') {
    return null;
  }

  const match = window.location.pathname.match(/\/version\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function openVersion(basePath: string, flowId: string, version: number) {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(`${basePath}/flow/${flowId}/version/${version}`);
}

async function restoreVersion({
  basePath,
  flowId,
  version,
  restore,
  onDone,
}: {
  basePath: string;
  flowId: string;
  version: FlowVersion;
  restore: (input: {
    flowId: string;
    data: { invectDefinition: FlowVersion['invectDefinition'] };
  }) => Promise<unknown>;
  onDone: () => void;
}) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(
      `Restore flow version v${version.version} as the latest version? This creates a new version using that definition.`,
    );
    if (!confirmed) {
      return;
    }
  }

  await restore({
    flowId,
    data: { invectDefinition: version.invectDefinition },
  });
  onDone();

  if (typeof window !== 'undefined') {
    window.location.assign(`${basePath}/flow/${flowId}`);
  }
}
