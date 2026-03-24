/**
 * ShareFlowModal — Modal for managing flow access permissions.
 *
 * Shows current access records and allows granting/revoking access.
 */

import { useState } from 'react';
import { useFlowAccess, useGrantFlowAccess, useRevokeFlowAccess } from '../hooks/useFlowAccess';
import { useRbac } from '../providers/RbacProvider';
import type { FlowAccessPermission } from '../../shared/types';

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface ShareFlowModalProps {
  flowId: string;
  onClose: () => void;
}

export function ShareFlowModal({ flowId, onClose }: ShareFlowModalProps) {
  const { user } = useRbac();
  const { data, isLoading } = useFlowAccess(flowId);
  const grantAccess = useGrantFlowAccess(flowId);
  const revokeAccess = useRevokeFlowAccess(flowId);

  const [newPrincipal, setNewPrincipal] = useState('');
  const [newPermission, setNewPermission] = useState<FlowAccessPermission>('viewer');
  const [principalType, setPrincipalType] = useState<'user' | 'team'>('user');
  const [error, setError] = useState<string | null>(null);

  const accessRecords = data?.access ?? [];

  const handleGrant = async () => {
    if (!newPrincipal.trim()) {
      setError('Please enter a user ID or team ID');
      return;
    }

    setError(null);
    try {
      await grantAccess.mutateAsync({
        ...(principalType === 'user' ? { userId: newPrincipal } : { teamId: newPrincipal }),
        permission: newPermission,
      });
      setNewPrincipal('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant access');
    }
  };

  const handleRevoke = async (accessId: string) => {
    try {
      await revokeAccess.mutateAsync(accessId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-imp-border bg-imp-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-imp-foreground">Share Flow</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-imp-muted-foreground hover:text-imp-foreground"
          >
            ✕
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Current access records */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-imp-muted-foreground">People with access</h3>
          {isLoading ? (
            <div className="py-4 text-center text-sm text-imp-muted-foreground">Loading...</div>
          ) : accessRecords.length === 0 ? (
            <div className="py-4 text-center text-sm text-imp-muted-foreground">
              No flow-specific access records yet.
            </div>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {accessRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-imp-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-imp-primary/10 text-xs font-medium text-imp-primary">
                      {(record.userId ?? record.teamId ?? '?')[0]?.toUpperCase()}
                    </div>
                    <span className="truncate text-sm">
                      {record.userId ?? record.teamId}
                      {record.userId === user?.id && (
                        <span className="ml-1 text-imp-muted-foreground">(you)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-imp-muted px-2 py-0.5 text-xs font-medium capitalize">
                      {record.permission}
                    </span>
                    {record.userId !== user?.id && (
                      <button
                        onClick={() => handleRevoke(record.id)}
                        className="text-imp-muted-foreground hover:text-red-500 text-xs"
                        title="Revoke access"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Grant new access */}
        <div className="border-t border-imp-border pt-4">
          <h3 className="mb-2 text-sm font-medium text-imp-muted-foreground">Add people</h3>
          <div className="flex gap-2">
            {/* Principal type toggle */}
            <select
              value={principalType}
              onChange={(e) => setPrincipalType(e.target.value as 'user' | 'team')}
              className="rounded-md border border-imp-border bg-imp-background px-2 py-1.5 text-sm"
            >
              <option value="user">User</option>
              <option value="team">Team</option>
            </select>

            {/* Principal ID input */}
            <input
              type="text"
              value={newPrincipal}
              onChange={(e) => setNewPrincipal(e.target.value)}
              placeholder={principalType === 'user' ? 'User ID' : 'Team ID'}
              className="flex-1 rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleGrant();
                }
              }}
            />

            {/* Permission selector */}
            <select
              value={newPermission}
              onChange={(e) => setNewPermission(e.target.value as FlowAccessPermission)}
              className="rounded-md border border-imp-border bg-imp-background px-2 py-1.5 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="operator">Operator</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>

            {/* Submit */}
            <button
              onClick={handleGrant}
              disabled={grantAccess.isPending}
              className="rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
            >
              {grantAccess.isPending ? '...' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
