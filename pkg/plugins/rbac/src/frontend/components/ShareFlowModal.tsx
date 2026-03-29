/**
 * ShareFlowModal — Modal for managing flow access permissions.
 *
 * Shows current access records and allows granting/revoking access.
 */

import { useState } from 'react';
import { ChevronDown, Share2, X } from 'lucide-react';
import { useFlowAccess, useGrantFlowAccess, useRevokeFlowAccess } from '../hooks/useFlowAccess';
import { useRbac } from '../providers/RbacProvider';
import type { FlowAccessPermission } from '../../shared/types';

const AVATAR_COLORS = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getPermissionColor(permission: FlowAccessPermission): string {
  switch (permission) {
    case 'owner':
      return 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400';
    case 'editor':
      return 'border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400';
    case 'operator':
      return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400';
    case 'viewer':
    default:
      return 'border-imp-border bg-imp-muted/50 text-imp-muted-foreground';
  }
}

const PERMISSION_OPTIONS: Array<{ value: FlowAccessPermission; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'operator', label: 'Operator' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

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
  const [openRoleDropdown, setOpenRoleDropdown] = useState<string | null>(null);

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

  const handleChangeRole = async (accessId: string, record: typeof accessRecords[0], newRole: FlowAccessPermission) => {
    try {
      await grantAccess.mutateAsync({
        ...(record.userId ? { userId: record.userId } : record.teamId ? { teamId: record.teamId } : {}),
        permission: newRole,
      });
      setOpenRoleDropdown(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-imp-border bg-imp-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-imp-foreground">Share Flow</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-imp-muted-foreground transition-colors hover:bg-imp-muted hover:text-imp-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Current access records */}
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-imp-muted-foreground">
            People with access
          </h3>
          {isLoading ? (
            <div className="py-4 text-center text-sm text-imp-muted-foreground">Loading...</div>
          ) : accessRecords.length === 0 ? (
            <div className="py-4 text-center text-sm text-imp-muted-foreground">
              No flow-specific access records yet.
            </div>
          ) : (
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {accessRecords.map((record) => {
                const principalId = record.userId ?? record.teamId ?? '?';
                const isCurrentUser = record.userId === user?.id;
                const isRoleDropdownOpen = openRoleDropdown === record.id;

                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-imp-muted/30"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(principalId)}`}
                      >
                        {principalId[0]?.toUpperCase()}
                      </div>
                      <span className="truncate text-sm font-medium text-imp-foreground">
                        {principalId}
                        {isCurrentUser && (
                          <span className="ml-1 font-normal text-imp-muted-foreground">(you)</span>
                        )}
                      </span>
                    </div>
                    <div className="relative">
                      {isCurrentUser ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getPermissionColor(record.permission)}`}
                        >
                          {record.permission}
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setOpenRoleDropdown(isRoleDropdownOpen ? null : record.id)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors hover:bg-imp-muted/50 ${getPermissionColor(record.permission)}`}
                          >
                            {record.permission}
                            <ChevronDown className="h-3 w-3" />
                          </button>
                          {isRoleDropdownOpen && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenRoleDropdown(null)} />
                              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-imp-border bg-imp-background py-1 shadow-lg">
                                {PERMISSION_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={`w-full px-3 py-1.5 text-left text-xs ${
                                      record.permission === opt.value
                                        ? 'bg-imp-muted font-medium text-imp-foreground'
                                        : 'text-imp-foreground hover:bg-imp-muted/50'
                                    }`}
                                    onClick={() => handleChangeRole(record.id, record, opt.value)}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                                <div className="my-1 border-t border-imp-border" />
                                <button
                                  type="button"
                                  className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                                  onClick={() => {
                                    handleRevoke(record.id);
                                    setOpenRoleDropdown(null);
                                  }}
                                >
                                  Remove access
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Grant new access */}
        <div className="border-t border-imp-border pt-4">
          <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-imp-muted-foreground">
            Add people
          </h3>
          <div className="flex gap-2">
            {/* Principal type toggle */}
            <button
              type="button"
              onClick={() => setPrincipalType(principalType === 'user' ? 'team' : 'user')}
              className="shrink-0 rounded-lg border border-imp-border bg-imp-background px-2.5 py-1.5 text-xs font-medium text-imp-foreground transition-colors hover:bg-imp-muted/50"
            >
              {principalType === 'user' ? 'User' : 'Team'}
            </button>

            {/* Principal ID input */}
            <input
              type="text"
              value={newPrincipal}
              onChange={(e) => setNewPrincipal(e.target.value)}
              placeholder={principalType === 'user' ? 'User ID' : 'Team ID'}
              className="flex-1 rounded-lg border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground focus:border-imp-primary/50 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleGrant();
                }
              }}
            />

            {/* Permission selector */}
            <button
              type="button"
              onClick={() => {
                const idx = PERMISSION_OPTIONS.findIndex((o) => o.value === newPermission);
                const next = PERMISSION_OPTIONS[(idx + 1) % PERMISSION_OPTIONS.length];
                setNewPermission(next.value);
              }}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${getPermissionColor(newPermission)}`}
            >
              {newPermission}
            </button>

            {/* Submit */}
            <button
              onClick={handleGrant}
              disabled={grantAccess.isPending}
              className="shrink-0 rounded-lg bg-imp-primary px-3.5 py-1.5 text-sm font-medium text-imp-primary-foreground transition-colors hover:bg-imp-primary/90 disabled:opacity-50"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
