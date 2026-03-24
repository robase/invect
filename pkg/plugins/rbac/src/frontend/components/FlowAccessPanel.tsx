/**
 * FlowAccessPanel — Panel tab for the flow editor.
 *
 * Shows the current access records for the selected flow in a
 * compact list. Registered as a panelTab contribution for the
 * 'flowEditor' context.
 */

import { Shield, Users, User } from 'lucide-react';
import { useFlowAccess } from '../hooks/useFlowAccess';
import { useRbac } from '../providers/RbacProvider';
import type { PanelTabProps } from '../types';

export function FlowAccessPanel({ flowId }: PanelTabProps) {
  const { user } = useRbac();
  const { data, isLoading, error } = useFlowAccess(flowId);

  const accessRecords = data?.access ?? [];
  const myRecord = accessRecords.find((r) => r.userId === user?.id);

  return (
    <div className="flex h-full flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-imp-muted-foreground" />
          <h3 className="text-sm font-medium">Access Control</h3>
        </div>
        {myRecord && (
          <span className="rounded-full border border-imp-border px-2 py-0.5 text-xs font-medium capitalize">
            {myRecord.permission}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-imp-muted-foreground">Loading access records...</span>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-red-500">
            {error instanceof Error ? error.message : 'Failed to load access records'}
          </span>
        </div>
      ) : accessRecords.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Users className="h-8 w-8 text-imp-muted-foreground/50" />
          <p className="text-sm text-imp-muted-foreground">No access records</p>
          <p className="text-xs text-imp-muted-foreground">Use the Share button to grant access.</p>
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {accessRecords.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 rounded-md px-3 py-2 bg-imp-muted/30"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-imp-primary/10">
                {record.teamId ? (
                  <Users className="h-3.5 w-3.5 text-imp-primary" />
                ) : (
                  <User className="h-3.5 w-3.5 text-imp-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm">
                  {record.userId ?? record.teamId}
                  {record.userId === user?.id && (
                    <span className="ml-1 text-imp-muted-foreground">(you)</span>
                  )}
                </p>
                {record.expiresAt && (
                  <p className="text-xs text-imp-muted-foreground">
                    Expires {new Date(record.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-imp-muted px-2 py-0.5 text-xs font-medium capitalize">
                {record.permission}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer — summary */}
      {accessRecords.length > 0 && (
        <div className="mt-3 border-t border-imp-border pt-3">
          <p className="text-xs text-imp-muted-foreground">
            {accessRecords.length} {accessRecords.length === 1 ? 'person' : 'people'} with access
          </p>
        </div>
      )}
    </div>
  );
}
