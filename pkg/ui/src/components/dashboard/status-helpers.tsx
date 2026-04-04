import { cn } from '~/lib/utils';
import { CheckCircle2, XCircle, Loader2, Clock, CircleDot } from 'lucide-react';

export function formatRelativeTime(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) {
    return 'Just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }
  return d.toLocaleDateString();
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (seconds < 3600) {
    return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const remainMin = Math.floor((seconds % 3600) / 60);
  return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
}

function statusColor(status: string) {
  switch (status) {
    case 'SUCCESS':
      return 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800';
    case 'FAILED':
      return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800';
    case 'RUNNING':
      return 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800';
    case 'PENDING':
      return 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800';
    case 'PAUSED_FOR_BATCH':
      return 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-800';
    case 'CANCELLED':
      return 'text-muted-foreground bg-muted border-border';
    default:
      return 'text-muted-foreground bg-muted border-border';
  }
}

function StatusIcon({ status, className }: { status: string; className?: string }) {
  const base = cn('h-3.5 w-3.5', className);
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle2 className={cn(base, 'text-emerald-500')} />;
    case 'FAILED':
      return <XCircle className={cn(base, 'text-red-500')} />;
    case 'RUNNING':
      return <Loader2 className={cn(base, 'text-blue-500 animate-spin')} />;
    case 'PENDING':
      return <Clock className={cn(base, 'text-amber-500')} />;
    case 'PAUSED_FOR_BATCH':
      return <Loader2 className={cn(base, 'text-purple-500 animate-spin')} />;
    case 'CANCELLED':
      return <CircleDot className={cn(base, 'text-muted-foreground')} />;
    default:
      return <CircleDot className={cn(base, 'text-muted-foreground')} />;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    SUCCESS: 'Success',
    FAILED: 'Failed',
    RUNNING: 'Running',
    PENDING: 'Pending',
    PAUSED_FOR_BATCH: 'Batch',
    CANCELLED: 'Cancelled',
    PAUSED: 'Paused',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        statusColor(status),
      )}
    >
      <StatusIcon status={status} className="h-3 w-3" />
      {labels[status] ?? status}
    </span>
  );
}
