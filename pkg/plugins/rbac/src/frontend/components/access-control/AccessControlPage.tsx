import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Shield, Users, Workflow } from 'lucide-react';
import { TreeView, type TreeDataItem } from '@invect/frontend';
import { useRbac } from '../../providers/RbacProvider';
import { useTeams, useCreateTeam } from '../../hooks/useTeams';
import { useScopeTree, usePreviewMove } from '../../hooks/useScopes';
import type { FlowSummary, MovePreviewResponse, ScopeTreeNode } from '../../../shared/types';
import type { AuthUser, PendingMove, SelectedItem } from './types';
import {
  formatPermissionLabel,
  getPermissionBadgeClasses,
  getPermissionBranchClasses,
} from './types';
import { useUsers } from './useUsers';
import { ScopeDetailPanel } from './ScopeDetailPanel';
import { FlowDetailPanel } from './FlowDetailPanel';
import { MoveConfirmationDialog } from './MoveConfirmationDialog';

function buildTreeData(scopes: ScopeTreeNode[], unscopedFlows: FlowSummary[]): TreeDataItem[] {
  function mapScope(scope: ScopeTreeNode): TreeDataItem {
    const children: TreeDataItem[] = [
      ...scope.children.map(mapScope),
      ...scope.flows.map((flow) => ({
        id: `flow:${flow.id}`,
        name: flow.name,
        icon: Workflow,
        draggable: true,
        droppable: false,
      })),
    ];
    return {
      id: `scope:${scope.id}`,
      name: scope.name,
      icon: Users,
      openIcon: Users,
      trailingContent: scope.teamPermission ? (
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPermissionBadgeClasses(scope.teamPermission)}`}
        >
          {formatPermissionLabel(scope.teamPermission)}
        </span>
      ) : null,
      childContainerClassName: scope.teamPermission
        ? getPermissionBranchClasses(scope.teamPermission)
        : undefined,
      children: children.length > 0 ? children : undefined,
      draggable: true,
      droppable: true,
    };
  }

  const scopeItems = scopes.map(mapScope);
  const unscopedItems: TreeDataItem[] = unscopedFlows.map((flow) => ({
    id: `flow:${flow.id}`,
    name: flow.name,
    icon: Workflow,
    draggable: true,
    droppable: false,
  }));

  return [...scopeItems, ...unscopedItems];
}
export function AccessControlPage() {
  const { isAuthenticated, checkPermission } = useRbac();
  const isAdmin = isAuthenticated && checkPermission('admin:*');

  const users = useUsers();
  const userMap = useMemo(() => {
    const map = new Map<string, AuthUser>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const teamsQuery = useTeams();
  const teams = teamsQuery.data?.teams ?? [];
  const scopeTreeQuery = useScopeTree();
  const createTeam = useCreateTeam();
  const previewMove = usePreviewMove();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [movePreview, setMovePreview] = useState<MovePreviewResponse | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const treeData = useMemo(() => {
    if (!scopeTreeQuery.data) {
      return [];
    }
    return buildTreeData(scopeTreeQuery.data.scopes, scopeTreeQuery.data.unscopedFlows);
  }, [scopeTreeQuery.data]);

  const filteredTreeData = useMemo(() => {
    if (!search.trim()) {
      return treeData;
    }
    const q = search.toLowerCase();
    function filterItems(items: TreeDataItem[]): TreeDataItem[] {
      return items.reduce<TreeDataItem[]>((acc, item) => {
        const nameMatch = item.name.toLowerCase().includes(q);
        const filteredChildren = item.children ? filterItems(item.children) : undefined;
        if (nameMatch || (filteredChildren && filteredChildren.length > 0)) {
          acc.push({ ...item, children: filteredChildren });
        }
        return acc;
      }, []);
    }
    return filterItems(treeData);
  }, [treeData, search]);

  const handleSelect = useCallback((item: TreeDataItem | undefined) => {
    if (!item) {
      setSelected(null);
      return;
    }
    if (item.id.startsWith('scope:')) {
      setSelected({ kind: 'team', id: item.id.slice(6), name: item.name });
    } else if (item.id.startsWith('flow:')) {
      setSelected({ kind: 'flow', id: item.id.slice(5), name: item.name });
    }
  }, []);

  const handleDrag = useCallback(
    async (source: TreeDataItem, target: TreeDataItem) => {
      if (!target.id.startsWith('scope:')) {
        return;
      }
      const targetScopeId = target.id.slice(6);

      const type = source.id.startsWith('scope:') ? ('scope' as const) : ('flow' as const);
      const id = type === 'scope' ? source.id.slice(6) : source.id.slice(5);

      const move: PendingMove = { type, id, targetScopeId, name: source.name };
      setPendingMove(move);
      setMovePreview(null);
      setMoveError(null);

      try {
        const preview = await previewMove.mutateAsync({ type, id, targetScopeId });
        setMovePreview(preview);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : 'Failed to preview move');
      }
    },
    [previewMove],
  );

  // Fetch scope tree on mount
  useEffect(() => {
    scopeTreeQuery.refetch();
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-0 overflow-y-auto imp-page bg-imp-background text-imp-foreground">
        <p className="text-sm text-imp-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const isLoading = scopeTreeQuery.isLoading;

  return (
    <div className="w-full h-full min-h-0 overflow-y-auto imp-page bg-imp-background text-imp-foreground">
      <div className="flex flex-col w-full min-h-full gap-6 px-4 py-6 mx-auto sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 shrink-0 text-imp-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">Access Control</h1>
            </div>
            <p className="mt-0.5 text-sm text-imp-muted-foreground">
              Manage team hierarchy and flow-level access grants.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              showNewTeam ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Team name"
                    className="px-2 py-1 text-xs border rounded border-imp-border bg-imp-background"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTeamName.trim()) {
                        createTeam.mutate({ name: newTeamName.trim() });
                        setNewTeamName('');
                        setShowNewTeam(false);
                      }
                      if (e.key === 'Escape') {
                        setShowNewTeam(false);
                        setNewTeamName('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTeamName.trim()) {
                        createTeam.mutate({ name: newTeamName.trim() });
                        setNewTeamName('');
                        setShowNewTeam(false);
                      }
                    }}
                    disabled={!newTeamName.trim()}
                    className="px-2 py-1 text-xs font-medium rounded bg-imp-primary text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewTeam(false);
                      setNewTeamName('');
                    }}
                    className="px-2 py-1 text-xs rounded text-imp-muted-foreground hover:text-imp-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewTeam(true)}
                  className="flex items-center gap-1 rounded bg-imp-primary px-2.5 py-1.5 text-xs font-medium text-imp-primary-foreground hover:bg-imp-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" /> New Team
                </button>
              )
            ) : null}
          </div>
        </div>

        {/* Two-panel layout fills remaining space */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Tree Sidebar */}
          <div className="flex flex-col border-r w-72 shrink-0 border-imp-border">
            <div className="px-3 py-2.5 border-b shrink-0 border-imp-border">
              <div className="relative">
                <Search className="absolute w-3.5 h-3.5 pointer-events-none left-2.5 top-1/2 -translate-y-1/2 text-imp-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search teams & flows…"
                  className="w-full py-1.5 pr-2 text-xs border rounded-lg pl-8 border-imp-border bg-imp-background placeholder:text-imp-muted-foreground focus:border-imp-primary/50 outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-6 text-xs text-center text-imp-muted-foreground">
                  Loading…
                </div>
              ) : filteredTreeData.length === 0 ? (
                <div className="px-4 py-6 text-xs text-center text-imp-muted-foreground">
                  {search ? 'No matches found.' : 'No teams or flows yet.'}
                </div>
              ) : (
                <TreeView
                  data={filteredTreeData}
                  expandAll
                  onSelectChange={handleSelect}
                  onDocumentDrag={isAdmin ? handleDrag : undefined}
                  initialSelectedItemId={
                    selected
                      ? selected.kind === 'team'
                        ? `scope:${selected.id}`
                        : `flow:${selected.id}`
                      : undefined
                  }
                />
              )}
            </div>
          </div>

          {/* Right: Detail Panel */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-imp-muted-foreground">
                <Shield className="w-8 h-8 opacity-30" />
                <p className="text-sm">Select a team or flow to view access details.</p>
              </div>
            ) : selected.kind === 'team' ? (
              <ScopeDetailPanel
                scopeId={selected.id}
                scopeName={selected.name}
                users={users}
                userMap={userMap}
                teams={teams}
                isAdmin={!!isAdmin}
              />
            ) : (
              <FlowDetailPanel
                flowId={selected.id}
                flowName={selected.name}
                users={users}
                userMap={userMap}
                teams={teams}
                isAdmin={!!isAdmin}
              />
            )}
          </div>
        </div>

        {/* Move Confirmation Dialog */}
        {pendingMove && (
          <MoveConfirmationDialog
            pendingMove={pendingMove}
            preview={movePreview}
            error={moveError}
            onClose={() => setPendingMove(null)}
          />
        )}
      </div>
    </div>
  );
}
