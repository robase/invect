'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  StopCircle,
  ChevronsUpDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { cn } from '~/lib/utils';

export interface RunSelectorItem {
  id: string;
  status: string;
  startedAt?: string | Date;
  completedAt?: string | Date;
}

interface RunSelectorProps {
  runs: RunSelectorItem[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

type DateFilter = 'all' | 'today' | '7d' | '30d' | 'custom';

const PAGE_SIZE = 20;

function StatusDot({ status }: { status: string }) {
  const colorClass =
    status === 'SUCCESS'
      ? 'bg-green-500'
      : status === 'FAILED'
        ? 'bg-red-500'
        : status === 'RUNNING'
          ? 'bg-blue-500 animate-pulse'
          : status === 'CANCELLED'
            ? 'bg-yellow-500'
            : 'bg-muted-foreground';
  return <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', colorClass)} />;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />;
    case 'FAILED':
      return <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />;
    case 'CANCELLED':
      return <StopCircle className="w-3.5 h-3.5 text-yellow-600 shrink-0" />;
    case 'RUNNING':
      return <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
}

function formatSince(dateLike?: string | Date): string {
  if (!dateLike) {
    return '';
  }
  const d = new Date(dateLike).getTime();
  const diffMs = Date.now() - d;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${days}d ago`;
}

function formatTimestamp(dateLike?: string | Date): string {
  if (!dateLike) {
    return '';
  }
  const d = new Date(dateLike);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateFilterRange(filter: DateFilter): { start: Date | null; end: Date | null } {
  if (filter === 'all' || filter === 'custom') {
    return { start: null, end: null };
  }
  const now = new Date();
  if (filter === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: null };
  }
  if (filter === '7d') {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: null };
  }
  if (filter === '30d') {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: null };
  }
  return { start: null, end: null };
}

const DATE_FILTERS: { label: string; value: DateFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'Range', value: 'custom' },
];

export function RunSelector({ runs, selectedRunId, onSelectRun }: RunSelectorProps) {
  const [open, setOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(0);

  const selectedRun = runs.find((r) => r.id === selectedRunId);

  const filteredRuns = useMemo(() => {
    let result = runs;

    // Date filter
    if (dateFilter === 'custom') {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : null;
      const to = customTo ? new Date(customTo + 'T23:59:59') : null;
      if (from || to) {
        result = result.filter((r) => {
          if (!r.startedAt) {
            return false;
          }
          const d = new Date(r.startedAt);
          if (from && d < from) {
            return false;
          }
          if (to && d > to) {
            return false;
          }
          return true;
        });
      }
    } else {
      const { start } = getDateFilterRange(dateFilter);
      if (start) {
        result = result.filter((r) => {
          if (!r.startedAt) {
            return false;
          }
          return new Date(r.startedAt) >= start;
        });
      }
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter);
    }

    return result;
  }, [runs, dateFilter, statusFilter, customFrom, customTo]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRuns = filteredRuns.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of runs) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return counts;
  }, [runs]);

  const handleSelect = (runId: string) => {
    onSelectRun(runId);
    setOpen(false);
  };

  const handleDateFilterChange = (value: DateFilter) => {
    setDateFilter(value);
    setPage(0);
  };

  const handleStatusFilterChange = (status: string | null) => {
    setStatusFilter(status);
    setPage(0);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
          title="Select execution run"
        >
          {selectedRun ? (
            <>
              <StatusIcon status={selectedRun.status} />
              <span className="flex-1 text-left truncate font-medium">
                {formatSince(selectedRun.startedAt)}
              </span>
              <span
                className={cn(
                  'rounded-full border px-1.5 py-0 text-[10px] font-medium shrink-0',
                  selectedRun.status === 'SUCCESS' &&
                    'bg-green-500/10 text-green-600 border-green-500/20',
                  selectedRun.status === 'FAILED' && 'bg-red-500/10 text-red-600 border-red-500/20',
                  (selectedRun.status === 'RUNNING' ||
                    selectedRun.status === 'PENDING' ||
                    selectedRun.status === 'PAUSED' ||
                    selectedRun.status === 'PAUSED_FOR_BATCH') &&
                    'bg-blue-500/10 text-blue-600 border-blue-500/20',
                  selectedRun.status === 'CANCELLED' &&
                    'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
                )}
              >
                {selectedRun.status}
              </span>
            </>
          ) : (
            <span className="flex-1 text-left text-muted-foreground">Select a run…</span>
          )}
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold">Execution History</span>
            <span className="text-xs text-muted-foreground">
              {filteredRuns.length === runs.length
                ? `${runs.length} runs`
                : `${filteredRuns.length} / ${runs.length} runs`}
            </span>
          </div>

          {/* Date filters */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
            <Calendar className="w-3 h-3 text-muted-foreground shrink-0 mr-0.5" />
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => handleDateFilterChange(f.value)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded-md transition-colors',
                  dateFilter === f.value
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Custom date range inputs */}
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
              <input
                type="date"
                value={customFrom}
                max={customTo || toDateInputValue(new Date())}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(0);
                }}
                className="flex-1 h-7 px-1.5 text-xs rounded-md border border-border bg-background text-foreground"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                max={toDateInputValue(new Date())}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(0);
                }}
                className="flex-1 h-7 px-1.5 text-xs rounded-md border border-border bg-background text-foreground"
              />
            </div>
          )}

          {/* Status filter chips */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border flex-wrap">
            <button
              onClick={() => handleStatusFilterChange(null)}
              className={cn(
                'px-2 py-0.5 text-xs rounded-md transition-colors',
                !statusFilter
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              All
            </button>
            {Object.entries(statusCounts).map(([status, count]) => (
              <button
                key={status}
                onClick={() => handleStatusFilterChange(statusFilter === status ? null : status)}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors',
                  statusFilter === status
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                <StatusDot status={status} />
                {status.toLowerCase()} ({count})
              </button>
            ))}
          </div>

          {/* Runs list */}
          <div className="max-h-64 overflow-y-auto">
            <div className="py-1">
              {pagedRuns.length === 0 ? (
                <div className="px-3 py-4 text-xs text-center text-muted-foreground">
                  No runs match the current filters.
                </div>
              ) : (
                pagedRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => handleSelect(run.id)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors',
                      selectedRunId === run.id
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/40',
                    )}
                  >
                    <StatusIcon status={run.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{formatSince(run.startedAt)}</span>
                        <span
                          className={cn(
                            'rounded-full border px-1.5 py-0 text-[10px] font-medium',
                            run.status === 'SUCCESS' &&
                              'bg-green-500/10 text-green-600 border-green-500/20',
                            run.status === 'FAILED' &&
                              'bg-red-500/10 text-red-600 border-red-500/20',
                            (run.status === 'RUNNING' ||
                              run.status === 'PENDING' ||
                              run.status === 'PAUSED' ||
                              run.status === 'PAUSED_FOR_BATCH') &&
                              'bg-blue-500/10 text-blue-600 border-blue-500/20',
                            run.status === 'CANCELLED' &&
                              'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
                          )}
                        >
                          {run.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {formatTimestamp(run.startedAt)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border">
              <button
                onClick={() => setPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="p-0.5 rounded hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] text-muted-foreground">
                {safePage * PAGE_SIZE + 1}–
                {Math.min((safePage + 1) * PAGE_SIZE, filteredRuns.length)} of {filteredRuns.length}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
                className="p-0.5 rounded hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
