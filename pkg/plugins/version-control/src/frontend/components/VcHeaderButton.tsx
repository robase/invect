/**
 * VcHeaderButton — Header action for quick push/pull from the flow editor header.
 *
 * Shows sync status as an icon and provides one-click push/pull.
 */

import { GitBranch, ArrowUpFromLine, ArrowDownToLine, Loader2 } from 'lucide-react';
import { useFlowSyncStatus, usePushFlow, usePullFlow } from '../hooks/useFlowSync';
import type { HeaderActionProps } from '@invect/ui';

export function VcHeaderButton({ flowId }: HeaderActionProps) {
  if (!flowId) {
    return null;
  }

  return <VcHeaderButtonInner flowId={flowId} />;
}

function VcHeaderButtonInner({ flowId }: { flowId: string }) {
  const { data, isLoading } = useFlowSyncStatus(flowId);
  const pushMutation = usePushFlow(flowId);
  const pullMutation = usePullFlow(flowId);

  const status = data?.status;
  const config = data?.config;

  // Don't show if not connected
  if (!config || status === 'not-connected') {
    return null;
  }

  const isBusy = isLoading || pushMutation.isPending || pullMutation.isPending;
  const canPush = config.syncDirection !== 'pull';
  const canPull = config.syncDirection !== 'push';

  const statusColor =
    status === 'synced'
      ? 'text-green-500'
      : status === 'pending'
        ? 'text-yellow-500'
        : status === 'conflict'
          ? 'text-red-500'
          : 'text-imp-muted-foreground';

  return (
    <div className="flex items-center gap-1">
      <span className={`${statusColor}`} title={`Sync: ${status}`}>
        <GitBranch className="h-4 w-4" />
      </span>

      {canPush && (
        <button
          onClick={() => pushMutation.mutate()}
          disabled={isBusy}
          title="Push to remote"
          className="rounded-md p-1 text-imp-muted-foreground hover:bg-imp-muted hover:text-imp-foreground disabled:opacity-50"
        >
          {pushMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUpFromLine className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {canPull && (
        <button
          onClick={() => pullMutation.mutate()}
          disabled={isBusy}
          title="Pull from remote"
          className="rounded-md p-1 text-imp-muted-foreground hover:bg-imp-muted hover:text-imp-foreground disabled:opacity-50"
        >
          {pullMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
