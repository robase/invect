import { useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@invect/frontend';
import {
  useAddTeamMember,
  useDeleteTeam,
  useTeam,
  useRemoveTeamMember,
} from '../../hooks/useTeams';
import { useGrantScopeAccess, useRevokeScopeAccess, useScopeAccess } from '../../hooks/useScopes';
import type { FlowAccessPermission, Team } from '../../../shared/types';
import type { AccessRow, AuthUser } from './types';
import { formatPermissionLabel, getPermissionBadgeClasses } from './types';
import { AccessTable, OptionalRoleSelector, RoleSelector } from './AccessTable';
import { FormDialog } from './FormDialog';
import { MemberCombobox } from './MemberCombobox';

export function ScopeDetailPanel({
  scopeId,
  scopeName,
  users,
  userMap,
  teams,
  isAdmin,
}: {
  scopeId: string;
  scopeName: string;
  users: AuthUser[];
  userMap: Map<string, AuthUser>;
  teams: Team[];
  isAdmin: boolean;
}) {
  const scopeQuery = useTeam(scopeId);
  const scopeAccessQuery = useScopeAccess(scopeId);
  const grantScopeAccess = useGrantScopeAccess(scopeId);
  const revokeScopeAccess = useRevokeScopeAccess(scopeId);
  const addTeamMember = useAddTeamMember(scopeId);
  const removeTeamMember = useRemoveTeamMember(scopeId);
  const deleteScope = useDeleteTeam();

  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [permission, setPermission] = useState<FlowAccessPermission>('viewer');
  const [grantUserId, setGrantUserId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState<string | null>(null);

  const members = scopeQuery.data?.members ?? [];
  const scopeAccess = scopeAccessQuery.data?.access ?? [];
  const existingMemberIds = new Set(members.map((member) => member.userId));
  const existingScopeUserIds = new Set(
    scopeAccess.map((record) => record.userId).filter(Boolean) as string[],
  );
  const teamRoleRecord = scopeAccess.find((record) => record.teamId === scopeId) ?? null;

  const isLoading = scopeQuery.isLoading || scopeAccessQuery.isLoading;

  const accessRows = useMemo(() => {
    const rows: AccessRow[] = [];
    for (const member of members) {
      const user = userMap.get(member.userId);
      rows.push({
        id: `member:${member.id}`,
        label: user?.name || user?.email || member.userId,
        kind: 'user',
        permission: null,
        source: 'Member',
        group: 'Members',
        canRemove: isAdmin,
        onRemove: () => removeTeamMember.mutate(member.userId),
      });
    }
    for (const record of scopeAccess) {
      if (record.teamId === scopeId) {
        continue;
      }
      const isUser = !!record.userId;
      const userId = record.userId ?? null;
      rows.push({
        id: `access:${record.id}`,
        label: isUser
          ? userMap.get(userId ?? '')?.name ||
            userMap.get(userId ?? '')?.email ||
            userId ||
            'Unknown'
          : teams.find((team) => team.id === record.teamId)?.name || record.teamId || 'Unknown',
        kind: isUser ? 'user' : 'team',
        permission: record.permission,
        source: 'Direct grant',
        group: 'Access Grants',
        canRemove: isAdmin,
        onPermissionChange: userId
          ? (permission) =>
              grantScopeAccess.mutate({
                userId,
                permission,
              })
          : undefined,
        onRemove: () => revokeScopeAccess.mutate(record.id),
      });
    }
    return rows;
  }, [
    members,
    scopeAccess,
    userMap,
    teams,
    isAdmin,
    removeTeamMember,
    grantScopeAccess,
    revokeScopeAccess,
  ]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b shrink-0 border-imp-border">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-imp-primary" />
          <h2 className="flex-1 min-w-0 text-base font-semibold truncate">{scopeName}</h2>
          {teamRoleRecord?.permission ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getPermissionBadgeClasses(teamRoleRecord.permission)}`}
            >
              {formatPermissionLabel(teamRoleRecord.permission)}
            </span>
          ) : null}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setShowMemberDialog(true)}
                className="flex items-center gap-1 rounded-md border border-imp-border px-2 py-1 text-[11px] text-imp-muted-foreground transition-colors hover:border-imp-primary/50 hover:text-imp-foreground"
              >
                <Plus className="w-3 h-3" /> Add Member
              </button>
              <button
                type="button"
                onClick={() => setShowGrantDialog(true)}
                className="flex items-center gap-1 rounded-md bg-imp-primary px-2 py-1 text-[11px] font-medium text-imp-primary-foreground hover:bg-imp-primary/90"
              >
                <Plus className="w-3 h-3" /> Grant Access
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded p-1.5 text-imp-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                title="Delete team"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <p className="mt-0.5 text-xs text-imp-muted-foreground">
          Access applies to all flows inside this team and its child teams.
        </p>
      </div>

      <div className="flex-1 px-5 py-4 overflow-y-auto">
        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-imp-foreground">
                Team Role on Child Flows
              </h3>
              <p className="mt-1 text-xs text-imp-muted-foreground">
                This is the base role this team carries into every flow inside this team and its
                child teams. If someone also has more specific access elsewhere, they still keep
                whichever role is higher.
              </p>
            </div>

            <OptionalRoleSelector
              value={teamRoleRecord?.permission ?? null}
              emptyLabel="No team role"
              onChange={(nextPermission) => {
                if (nextPermission === null) {
                  if (teamRoleRecord) {
                    revokeScopeAccess.mutate(teamRoleRecord.id);
                  }
                  return;
                }

                grantScopeAccess.mutate({
                  teamId: scopeId,
                  permission: nextPermission,
                });
              }}
            />
          </section>

          <AccessTable rows={accessRows} isLoading={isLoading} emptyLabel="No members" />
        </div>
      </div>

      <FormDialog
        open={showGrantDialog}
        onClose={() => setShowGrantDialog(false)}
        title="Grant Scope Access"
      >
        <div className="flex items-center gap-2">
          <MemberCombobox
            users={users}
            excludeIds={existingScopeUserIds}
            selectedUserId={grantUserId}
            onSelect={setGrantUserId}
          />
          <RoleSelector value={permission} onChange={setPermission} />
          <button
            type="button"
            onClick={() => {
              if (!grantUserId) {
                return;
              }
              grantScopeAccess.mutate({
                userId: grantUserId,
                permission,
              });
              setGrantUserId(null);
              setShowGrantDialog(false);
            }}
            disabled={!grantUserId || grantScopeAccess.isPending}
            className="rounded bg-imp-primary px-2.5 py-1 text-xs font-medium text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
          >
            Grant
          </button>
        </div>
      </FormDialog>

      <FormDialog
        open={showMemberDialog}
        onClose={() => setShowMemberDialog(false)}
        title="Add Team Member"
      >
        <div className="flex items-center gap-2">
          <MemberCombobox
            users={users}
            excludeIds={existingMemberIds}
            selectedUserId={memberUserId}
            onSelect={setMemberUserId}
          />
          <button
            type="button"
            onClick={() => {
              if (!memberUserId) {
                return;
              }
              addTeamMember.mutate({ userId: memberUserId });
              setMemberUserId(null);
              setShowMemberDialog(false);
            }}
            disabled={!memberUserId || addTeamMember.isPending}
            className="rounded bg-imp-primary px-2.5 py-1 text-xs font-medium text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </FormDialog>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
      >
        <DialogContent className="max-w-sm border-imp-border bg-imp-background text-imp-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Delete team</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-imp-muted-foreground">
            Are you sure you want to delete{' '}
            <strong className="text-imp-foreground">{scopeName}</strong>? Flows directly inside this
            team will move to the parent team when one exists, and this team's access grants will be
            removed.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border border-imp-border px-3 py-1.5 text-xs font-medium text-imp-muted-foreground hover:text-imp-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteScope.mutate(scopeId);
                setShowDeleteConfirm(false);
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
