import React, { memo } from 'react';
import { cn } from '../../lib/utils';

export type NodeStatusIndicatorStatus = 'initial' | 'loading' | 'success' | 'error';
export type NodeStatusIndicatorLoadingVariant = 'border' | 'overlay';

interface NodeStatusIndicatorProps {
  status: NodeStatusIndicatorStatus;
  loadingVariant?: NodeStatusIndicatorLoadingVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * A node wrapper that indicates the status of a node via a border effect.
 *
 * Status can be:
 * - "initial" - no status indicator (default state)
 * - "loading" - animated conic gradient border that rotates
 * - "success" - green border
 * - "error" - red border
 *
 * Loading variants:
 * - "border" - animated gradient border around the node (default)
 * - "overlay" - full overlay with spinner
 *
 * The animated border uses CSS @property for the conic gradient angle animation.
 * This is supported in Chrome/Chromium browsers. Firefox will show a static gradient.
 */
export const NodeStatusIndicator = memo(function NodeStatusIndicator({
  status,
  loadingVariant = 'border',
  children,
  className,
}: NodeStatusIndicatorProps) {
  // For initial status, just render children without any wrapper styling
  if (status === 'initial') {
    return <div className={className}>{children}</div>;
  }

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  return (
    <div className={cn('relative node-status-active', className)}>
      {/* Status border wrapper */}
      <div
        className={cn(
          'relative rounded-xl',
          // Success state - static green border
          isSuccess && 'ring-2 ring-green-500 ring-offset-0 ring-offset-background',
          // Error state - static red border
          isError && 'ring-2 ring-red-500 ring-offset-0 ring-offset-background',
          // Loading state with border variant - animated gradient border using CSS @property
          isLoading &&
            loadingVariant === 'border' &&
            'node-running-border rounded-xl border border-transparent animate-node-border',
        )}
      >
        {children}
      </div>

      {/* Loading overlay variant */}
      {isLoading && loadingVariant === 'overlay' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
          <div className="w-6 h-6 border-2 rounded-full border-t-transparent border-primary animate-spin" />
        </div>
      )}
    </div>
  );
});
