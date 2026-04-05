'use client';

import { useMemo } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CronPreviewProps {
  /** Cron expression (e.g. "0 * * * *") */
  expression: string;
  /** IANA timezone (e.g. "America/New_York") */
  timezone?: string;
  className?: string;
}

/**
 * Shows a human-readable preview of a cron expression + next fire time.
 */
export function CronPreview({ expression, timezone = 'UTC', className }: CronPreviewProps) {
  const { description, nextRun, isValid } = useMemo(() => {
    return parseCronPreview(expression, timezone);
  }, [expression, timezone]);

  if (!expression.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        isValid
          ? 'border-border bg-muted/30 text-muted-foreground'
          : 'border-destructive/30 bg-destructive/5 text-destructive',
        className,
      )}
    >
      {isValid ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span className="font-medium">{description}</span>
          </div>
          {nextRun && (
            <div className="text-[10px] opacity-75">
              Next run: {nextRun} ({timezone})
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          <span>Invalid cron expression</span>
        </div>
      )}
    </div>
  );
}

// ─── Cron Parsing ──────────────────────────────────────────────

interface CronPreviewResult {
  description: string;
  nextRun: string | null;
  isValid: boolean;
}

/**
 * Lightweight cron expression → human-readable description.
 * Handles common patterns without pulling in a heavy library.
 */
function parseCronPreview(expression: string, _timezone: string): CronPreviewResult {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return { description: '', nextRun: null, isValid: false };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  try {
    const description = describeCron(minute, hour, dayOfMonth, month, dayOfWeek);
    // Approximate next run (simple heuristic, not timezone-aware)
    const nextRun = approximateNextRun(minute, hour);

    return { description, nextRun, isValid: true };
  } catch {
    return { description: '', nextRun: null, isValid: false };
  }
}

function describeCron(
  minute: string,
  hour: string,
  dayOfMonth: string,
  month: string,
  dayOfWeek: string,
): string {
  // Every minute
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }

  // Every N minutes
  if (minute.startsWith('*/') && hour === '*') {
    return `Every ${minute.slice(2)} minutes`;
  }

  // Every hour at :MM
  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every hour at :${minute.padStart(2, '0')}`;
  }

  // Every N hours
  if (minute === '0' && hour.startsWith('*/')) {
    return `Every ${hour.slice(2)} hours`;
  }

  // Daily at HH:MM
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${formatTime(hour, minute)}`;
  }

  // Weekdays at HH:MM
  if (
    minute !== '*' &&
    hour !== '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    (dayOfWeek === '1-5' || dayOfWeek === 'MON-FRI')
  ) {
    return `Weekdays at ${formatTime(hour, minute)}`;
  }

  // Weekly on specific day
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const day = dayName(dayOfWeek);
    return `${day} at ${formatTime(hour, minute)}`;
  }

  // Fallback: show the raw expression parts
  return `${expression(minute, hour, dayOfMonth, month, dayOfWeek)}`;
}

function expression(min: string, hr: string, dom: string, mon: string, dow: string): string {
  const parts = [];
  if (min !== '*') {
    parts.push(`min ${min}`);
  }
  if (hr !== '*') {
    parts.push(`hour ${hr}`);
  }
  if (dom !== '*') {
    parts.push(`day ${dom}`);
  }
  if (mon !== '*') {
    parts.push(`month ${mon}`);
  }
  if (dow !== '*') {
    parts.push(`weekday ${dow}`);
  }
  return parts.join(', ') || 'Every minute';
}

function formatTime(hour: string, minute: string): string {
  const h = parseInt(hour, 10);
  const m = minute.padStart(2, '0');
  if (h === 0) {
    return `12:${m} AM`;
  }
  if (h < 12) {
    return `${h}:${m} AM`;
  }
  if (h === 12) {
    return `12:${m} PM`;
  }
  return `${h - 12}:${m} PM`;
}

function dayName(dow: string): string {
  const names: Record<string, string> = {
    '0': 'Sundays',
    '1': 'Mondays',
    '2': 'Tuesdays',
    '3': 'Wednesdays',
    '4': 'Thursdays',
    '5': 'Fridays',
    '6': 'Saturdays',
    '7': 'Sundays',
    SUN: 'Sundays',
    MON: 'Mondays',
    TUE: 'Tuesdays',
    WED: 'Wednesdays',
    THU: 'Thursdays',
    FRI: 'Fridays',
    SAT: 'Saturdays',
  };
  return names[dow.toUpperCase()] ?? `Day ${dow}`;
}

function approximateNextRun(minute: string, hour: string): string | null {
  try {
    const now = new Date();
    let next: Date;

    if (minute === '*' && hour === '*') {
      next = new Date(now.getTime() + 60_000);
    } else if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      const currentMin = now.getMinutes();
      const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
      next = new Date(now);
      next.setMinutes(nextMin, 0, 0);
      if (next <= now) {
        next.setMinutes(next.getMinutes() + interval);
      }
    } else if (hour === '*') {
      const min = parseInt(minute, 10);
      next = new Date(now);
      next.setMinutes(min, 0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
    } else {
      const hr = parseInt(hour, 10);
      const min = parseInt(minute, 10);
      next = new Date(now);
      next.setHours(hr, min, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    }

    return next.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default CronPreview;
