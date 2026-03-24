import { useMemo, useState } from 'react';
import { ExternalLink, Plus, Workflow } from 'lucide-react';
import { useGrantFlowAccess, useRevokeFlowAccess } from '../../hooks/useFlowAccess';
import { useEffectiveFlowAccess } from '../../hooks/useScopes';
import type { FlowAccessPermission, Team } from '../../../shared/types';
import type { AccessRow, AuthUser, PrincipalSelection } from './types';
import { AccessTable, RoleSelector } from './AccessTable';
import { FormDialog } from './FormDialog';
import { PrincipalCombobox } from './PrincipalCombobox';

export function FlowDetailPanel({
  flowId,
  flowName,
  users,
  userMap,
  teams,
  isAdmin,
}: {
  flowId: string;
  flowName: string;
  users: AuthUser[];
  userMap: Map<string, AuthUser>;
  teams: Team[];
  isAdmin: boolean;
}) {
  const effectiveFlowAccessQuery = useEffectiveFlowAccess(flowId);
  const grantFlowAccess = useGrantFlowAccess(flowId);
  const revokeFlowAccess = useRevokeFlowAccess(flowId);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [principalSelection, setPrincipalSelection] = useState<PrincipalSelection | null>(null);
  const [permission, setPermission] = useState<FlowAccessPermission>('viewer');

  const effectiveRecords = effectiveFlowAccessQuery.data?.records ?? [];
  const existingDirectUserIds = new Set(
    effectiveRecords
      .filter((record) => record.source === 'direct' && record.userId)
      .map((record) => record.userId),
  );
  const existingDirectTeamIds = new Set(
    effectiveRecords
      .filter((record) => record.source === 'direct' && record.teamId)
      .map((record) => record.teamId),
  );

  const accessRows = useMemo(() => {
    const rows: AccessRow[] = effectiveRecords.map((record) => {
      const isUser = !!record.userId;
      return {
        id: `${record.source}:${record.id}`,
        label: isUser
          ? userMap.get(record.userId!)?.name ||
            userMap.get(record.userId!)?.email ||
            record.userId!
          : teams.find((team) => team.id === record.teamId)?.name || record.teamId || 'Unknown',
        kind: isUser ? 'user' : 'team',
        permission: record.permission,
        source: record.source === 'direct' ? 'Direct grant' : `Via ${record.scopeName || 'team'}`,
        group: record.source === 'direct' ? 'Direct' : 'Inherited',
        canRemove: record.source === 'direct' && isAdmin,
        onPermissionChange:
          record.source === 'direct'
            ? (permission) =>
                grantFlowAccess.mutate({
                  ...(record.userId ? { userId: record.userId } : { teamId: record.teamId! }),
                  permission,
                })
            : undefined,
        onRemove: () => revokeFlowAccess.mutate(record.id),
      };
    });

    rows.sort((a, b) => {
      const aIsDirect = a.source === 'Direct grant' ? 1 : 0;
      const bIsDirect = b.source === 'Direct grant' ? 1 : 0;
      return bIsDirect - aIsDirect;
    });

    return rows;
  }, [effectiveRecords, userMap, teams, isAdmin, grantFlowAccess, revokeFlowAccess]);

  const openFlow = () => {
    const path = window.location.pathname;
    const accessIdx = path.lastIndexOf('/access');
    const basePath = accessIdx >= 0 ? path.slice(0, accessIdx) : path;
    window.open(`${basePath}/flow/${flowId}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b shrink-0 border-imp-border">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-imp-primary" />
          <h2 className="flex-1 min-w-0 text-base font-semibold truncate">{flowName}</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowGrantDialog(true)}
              className="flex items-center gap-1 rounded-md bg-imp-primary px-2 py-1 text-[11px] font-medium text-imp-primary-foreground hover:bg-imp-primary/90"
            >
              <Plus className="w-3 h-3" /> Grant Access
            </button>
          )}
          <button
            type="button"
            onClick={openFlow}
            className="flex items-center gap-1 rounded-md border border-imp-border px-2 py-1 text-[11px] text-imp-muted-foreground transition-colors hover:border-imp-primary/50 hover:text-imp-foreground"
          >
            <ExternalLink className="w-3 h-3" /> View
          </button>
        </div>
        <p className="mt-0.5 text-xs text-imp-muted-foreground">
          Shows all principals with access and how they got it.
        </p>
      </div>

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <AccessTable
          rows={accessRows}
          isLoading={effectiveFlowAccessQuery.isLoading}
          emptyLabel="No access assigned"
        />
      </div>

      <FormDialog
        open={showGrantDialog}
        onClose={() => setShowGrantDialog(false)}
        title="Grant Flow Access"
      >
        <div className="flex items-center gap-2">
          <PrincipalCombobox
            users={users}
            teams={teams}
            excludeUserIds={existingDirectUserIds}
            excludeTeamIds={existingDirectTeamIds}
            selection={principalSelection}
            onSelect={setPrincipalSelection}
          />
          <RoleSelector value={permission} onChange={setPermission} />
          <button
            type="button"
            onClick={() => {
              if (!principalSelection) {
                return;
              }
              grantFlowAccess.mutate({
                ...(principalSelection.type === 'user'
                  ? { userId: principalSelection.id }
                  : { teamId: principalSelection.id }),
                permission,
              });
              setPrincipalSelection(null);
              setShowGrantDialog(false);
            }}
            disabled={!principalSelection || grantFlowAccess.isPending}
            className="rounded bg-imp-primary px-2.5 py-1 text-xs font-medium text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
          >
            Grant
          </button>
        </div>
      </FormDialog>
    </div>
  );
}
