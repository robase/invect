import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  FolderInput,
  GripVertical,
  Plus,
  Search,
  Shield,
  Users,
  Workflow,
} from 'lucide-react';
import { PageLayout } from '@invect/frontend';
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

type HierarchyDragItem = {
  type: 'scope' | 'flow';
  id: string;
  name: string;
  parentId: string | null;
};

function collectScopeIds(scopes: ScopeTreeNode[]): string[] {
  return scopes.flatMap((scope) => [scope.id, ...collectScopeIds(scope.children)]);
}

function findScopeNode(scopes: ScopeTreeNode[], scopeId: string): ScopeTreeNode | null {
  for (const scope of scopes) {
    if (scope.id === scopeId) {
      return scope;
    }
    const child = findScopeNode(scope.children, scopeId);
    if (child) {
      return child;
    }
  }
  return null;
}

function scopeContains(scope: ScopeTreeNode, potentialChildId: string): boolean {
  for (const child of scope.children) {
    if (child.id === potentialChildId || scopeContains(child, potentialChildId)) {
      return true;
    }
  }
  return false;
}

function isDescendantScope(
  scopes: ScopeTreeNode[],
  draggedScopeId: string,
  potentialTargetId: string,
): boolean {
  const draggedScope = findScopeNode(scopes, draggedScopeId);
  if (!draggedScope) {
    return false;
  }
  return scopeContains(draggedScope, potentialTargetId);
}

function filterScopes(scopes: ScopeTreeNode[], query: string): ScopeTreeNode[] {
  return scopes.reduce<ScopeTreeNode[]>((acc, scope) => {
    const normalizedDescription = scope.description?.toLowerCase() ?? '';
    const matchesScope =
      scope.name.toLowerCase().includes(query) || normalizedDescription.includes(query);
    const matchingChildren = filterScopes(scope.children, query);
    const matchingFlows = scope.flows.filter((flow) => flow.name.toLowerCase().includes(query));

    if (matchesScope || matchingChildren.length > 0 || matchingFlows.length > 0) {
      acc.push({
        ...scope,
        children: matchingChildren,
        flows: matchingFlows,
      });
    }

    return acc;
  }, []);
}

function findSelectedName(
  scopes: ScopeTreeNode[],
  flows: FlowSummary[],
  selected: SelectedItem | null,
): string | null {
  if (!selected) {
    return null;
  }

  if (selected.kind === 'team') {
    return findScopeNode(scopes, selected.id)?.name ?? selected.name;
  }

  const stack = [...flows];
  const scopeStack = [...scopes];
  while (scopeStack.length > 0) {
    const current = scopeStack.pop()!;
    stack.push(...current.flows);
    scopeStack.push(...current.children);
  }

  return stack.find((flow) => flow.id === selected.id)?.name ?? selected.name;
}

function FlowTreeRow({
  flow,
  depth,
  isSelected,
  draggedItem,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  flow: FlowSummary;
  depth: number;
  isSelected: boolean;
  draggedItem: HierarchyDragItem | null;
  onSelect: (flow: FlowSummary) => void;
  onDragStart: (item: HierarchyDragItem) => void;
  onDragEnd: () => void;
}) {
  const isDragging = draggedItem?.type === 'flow' && draggedItem.id === flow.id;

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart({
          type: 'flow',
          id: flow.id,
          name: flow.name,
          parentId: flow.scopeId ?? null,
        });
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(flow)}
      className={clsx(
        'group flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors',
        'hover:bg-imp-muted/50',
        isDragging && 'opacity-50',
        isSelected && 'bg-imp-primary/10 text-imp-primary ring-1 ring-imp-primary/30',
      )}
      style={{ paddingLeft: `${depth > 0 ? 16 : 0}px` }}
    >
      <Workflow
        className={clsx(
          'h-4 w-4 shrink-0',
          isSelected ? 'text-imp-primary' : 'text-imp-muted-foreground',
        )}
      />
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{flow.name}</span>
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-imp-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

function ScopeTreeRow({
  scope,
  allScopes,
  depth,
  expandedNodes,
  selected,
  draggedItem,
  dropTarget,
  onToggle,
  onSelectScope,
  onSelectFlow,
  onDragStart,
  onDragEnd,
  onDragOverTarget,
  onDragLeaveTarget,
  onDropTarget,
}: {
  scope: ScopeTreeNode;
  allScopes: ScopeTreeNode[];
  depth: number;
  expandedNodes: Set<string>;
  selected: SelectedItem | null;
  draggedItem: HierarchyDragItem | null;
  dropTarget: string | null;
  onToggle: (scopeId: string) => void;
  onSelectScope: (scope: ScopeTreeNode) => void;
  onSelectFlow: (flow: FlowSummary) => void;
  onDragStart: (item: HierarchyDragItem) => void;
  onDragEnd: () => void;
  onDragOverTarget: (targetId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeaveTarget: (targetId: string) => void;
  onDropTarget: (targetId: string, event: React.DragEvent<HTMLDivElement>) => void;
}) {
  const isExpanded = expandedNodes.has(scope.id);
  const isSelected = selected?.kind === 'team' && selected.id === scope.id;
  const isDragging = draggedItem?.type === 'scope' && draggedItem.id === scope.id;
  const hasChildren = scope.children.length > 0 || scope.flows.length > 0;
  const canDrop =
    draggedItem !== null &&
    !(draggedItem.type === 'scope' && draggedItem.id === scope.id) &&
    !(draggedItem.type === 'scope' && isDescendantScope(allScopes, draggedItem.id, scope.id));
  const isDropTarget = dropTarget === scope.id && canDrop;

  return (
    <div>
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart({
            type: 'scope',
            id: scope.id,
            name: scope.name,
            parentId: scope.parentId ?? null,
          });
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => onDragOverTarget(scope.id, event)}
        onDragLeave={() => onDragLeaveTarget(scope.id)}
        onDrop={(event) => onDropTarget(scope.id, event)}
        onClick={() => onSelectScope(scope)}
        className={clsx(
          'group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 transition-colors',
          isDragging && 'opacity-50',
          isDropTarget && 'ring-2 ring-imp-primary/30',
          isSelected ? 'text-imp-primary ring-1 ring-imp-primary/30' : 'hover:bg-accent',
        )}
        style={{ paddingLeft: `${depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(scope.id);
            }}
            className="rounded p-0.5 text-imp-muted-foreground hover:bg-imp-muted"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Users
          className={clsx(
            'h-4 w-4 shrink-0',
            isSelected ? 'text-imp-primary' : 'text-imp-muted-foreground',
          )}
        />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{scope.name}</span>
        {scope.teamPermission ? (
          <span
            className={clsx(
              'inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
              getPermissionBadgeClasses(scope.teamPermission),
            )}
          >
            {formatPermissionLabel(scope.teamPermission)}
          </span>
        ) : null}
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-imp-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      {isExpanded ? (
        <div
          className={clsx('space-y-1 border-l border-imp-border')}
          style={{ marginLeft: `${depth * 18 + 10}px` }}
        >
          {scope.flows.map((flow) => (
            <FlowTreeRow
              key={flow.id}
              flow={flow}
              depth={depth + 1}
              isSelected={selected?.kind === 'flow' && selected.id === flow.id}
              draggedItem={draggedItem}
              onSelect={onSelectFlow}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
          {scope.children.map((child) => (
            <ScopeTreeRow
              key={child.id}
              scope={child}
              allScopes={allScopes}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              selected={selected}
              draggedItem={draggedItem}
              dropTarget={dropTarget}
              onToggle={onToggle}
              onSelectScope={onSelectScope}
              onSelectFlow={onSelectFlow}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverTarget={onDragOverTarget}
              onDragLeaveTarget={onDragLeaveTarget}
              onDropTarget={onDropTarget}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_SCOPES: ScopeTreeNode[] = [];
const EMPTY_FLOWS: FlowSummary[] = [];

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
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<HierarchyDragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const scopes = scopeTreeQuery.data?.scopes ?? EMPTY_SCOPES;
  const unscopedFlows = scopeTreeQuery.data?.unscopedFlows ?? EMPTY_FLOWS;

  useEffect(() => {
    setExpandedNodes(new Set(collectScopeIds(scopes)));
  }, [scopes]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredScopes = useMemo(() => {
    if (!normalizedSearch) {
      return scopes;
    }
    return filterScopes(scopes, normalizedSearch);
  }, [scopes, normalizedSearch]);

  const filteredUnscopedFlows = useMemo(() => {
    if (!normalizedSearch) {
      return unscopedFlows;
    }
    return unscopedFlows.filter((flow) => flow.name.toLowerCase().includes(normalizedSearch));
  }, [unscopedFlows, normalizedSearch]);

  const selectedName = useMemo(
    () => findSelectedName(scopes, unscopedFlows, selected),
    [scopes, unscopedFlows, selected],
  );

  const hasTreeItems = filteredScopes.length > 0 || filteredUnscopedFlows.length > 0;

  const handleMovePreview = useCallback(
    async (item: HierarchyDragItem, targetScopeId: string | null) => {
      if (item.type === 'scope' && item.parentId === targetScopeId) {
        setDraggedItem(null);
        setDropTarget(null);
        return;
      }

      if (item.type === 'flow' && item.parentId === targetScopeId) {
        setDraggedItem(null);
        setDropTarget(null);
        return;
      }

      const move: PendingMove = {
        type: item.type,
        id: item.id,
        name: item.name,
        targetScopeId,
      };

      setPendingMove(move);
      setMovePreview(null);
      setMoveError(null);
      setDraggedItem(null);
      setDropTarget(null);

      try {
        const preview = await previewMove.mutateAsync({
          type: item.type,
          id: item.id,
          targetScopeId,
        });
        setMovePreview(preview);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : 'Failed to preview move');
      }
    },
    [previewMove],
  );

  useEffect(() => {
    scopeTreeQuery.refetch();
  }, []);

  if (!isAuthenticated) {
    return (
      <PageLayout
        title="Access Control"
        subtitle="Manage team hierarchy and flow-level access grants."
        icon={Shield}
      >
        <p className="text-sm text-imp-muted-foreground">Please sign in to access this page.</p>
      </PageLayout>
    );
  }

  const isLoading = scopeTreeQuery.isLoading;

  const newTeamAction = isAdmin ? (
    showNewTeam ? (
      <div className="flex items-center gap-1.5">
        <input
          value={newTeamName}
          onChange={(event) => setNewTeamName(event.target.value)}
          placeholder="Team name"
          className="px-2.5 py-1.5 text-xs border rounded-lg border-imp-border bg-imp-background"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && newTeamName.trim()) {
              createTeam.mutate({ name: newTeamName.trim() });
              setNewTeamName('');
              setShowNewTeam(false);
            }
            if (event.key === 'Escape') {
              setShowNewTeam(false);
              setNewTeamName('');
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (!newTeamName.trim()) {
              return;
            }
            createTeam.mutate({ name: newTeamName.trim() });
            setNewTeamName('');
            setShowNewTeam(false);
          }}
          disabled={!newTeamName.trim()}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-imp-primary text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setShowNewTeam(false);
            setNewTeamName('');
          }}
          className="px-2.5 py-1.5 text-xs rounded-lg text-imp-muted-foreground hover:text-imp-foreground"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setShowNewTeam(true)}
        className="flex items-center gap-1 rounded-lg bg-imp-primary px-3 py-1.5 text-xs font-medium text-imp-primary-foreground hover:bg-imp-primary/90"
      >
        <Plus className="h-3.5 w-3.5" /> New Team
      </button>
    )
  ) : null;

  return (
    <PageLayout
      title="Access Control"
      subtitle="Manage team hierarchy and flow-level access grants."
      icon={Shield}
      actions={newTeamAction}
    >
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute w-3.5 h-3.5 pointer-events-none left-3 top-1/2 -translate-y-1/2 text-imp-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teams and flows…"
            className="w-full py-2 pr-3 text-sm border rounded-lg outline-none pl-9 border-imp-border bg-imp-background placeholder:text-imp-muted-foreground focus:border-imp-primary/50"
          />
        </div>
      </div>

      {/* Two-pane layout */}
      <div
        className="grid h-[calc(100vh-220px)] px-2 min-h-[520px] border rounded-lg overflow-hidden"
        style={{ gridTemplateColumns: '320px 1fr' }}
      >
        {/* Left: hierarchy tree */}
        <div className="flex flex-col overflow-hidden bg-imp-muted/20">
          <div
            className="flex-1 p-2 overflow-y-auto"
            onDragOver={(event) => {
              if (!draggedItem) {
                return;
              }
              event.preventDefault();
              if (dropTarget !== 'root') {
                setDropTarget('root');
              }
            }}
            onDragLeave={() => {
              if (dropTarget === 'root') {
                setDropTarget(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedItem) {
                return;
              }
              handleMovePreview(draggedItem, null);
            }}
          >
            <div
              className={clsx(
                'min-h-full rounded-lg py-1 transition-colors',
                dropTarget === 'root'
                  ? 'border-imp-primary bg-imp-primary/5'
                  : 'border-transparent',
              )}
            >
              {isLoading ? (
                <div className="flex items-center justify-center px-4 py-12 text-sm text-center text-imp-muted-foreground">
                  Loading hierarchy…
                </div>
              ) : !hasTreeItems ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <FolderInput className="w-10 h-10 mb-3 opacity-30 text-imp-muted-foreground" />
                  <h3 className="text-base font-medium text-imp-foreground">
                    {normalizedSearch ? 'No matching teams or flows' : 'No teams or flows yet'}
                  </h3>
                  <p className="max-w-sm mt-2 text-sm text-imp-muted-foreground">
                    {normalizedSearch
                      ? 'Adjust the search to find a team or flow in the hierarchy.'
                      : 'Create a team to start organizing flows and access scopes.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredUnscopedFlows.map((flow) => (
                    <FlowTreeRow
                      key={flow.id}
                      flow={flow}
                      depth={0}
                      isSelected={selected?.kind === 'flow' && selected.id === flow.id}
                      draggedItem={draggedItem}
                      onSelect={(nextFlow) =>
                        setSelected({ kind: 'flow', id: nextFlow.id, name: nextFlow.name })
                      }
                      onDragStart={setDraggedItem}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setDropTarget(null);
                      }}
                    />
                  ))}

                  {filteredScopes.map((scope) => (
                    <ScopeTreeRow
                      key={scope.id}
                      scope={scope}
                      allScopes={scopes}
                      depth={0}
                      expandedNodes={expandedNodes}
                      selected={selected}
                      draggedItem={draggedItem}
                      dropTarget={dropTarget}
                      onToggle={(scopeId) => {
                        setExpandedNodes((previous) => {
                          const next = new Set(previous);
                          if (next.has(scopeId)) {
                            next.delete(scopeId);
                          } else {
                            next.add(scopeId);
                          }
                          return next;
                        });
                      }}
                      onSelectScope={(nextScope) =>
                        setSelected({ kind: 'team', id: nextScope.id, name: nextScope.name })
                      }
                      onSelectFlow={(nextFlow) =>
                        setSelected({ kind: 'flow', id: nextFlow.id, name: nextFlow.name })
                      }
                      onDragStart={setDraggedItem}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setDropTarget(null);
                      }}
                      onDragOverTarget={(targetId, event) => {
                        if (!draggedItem) {
                          return;
                        }
                        const canDrop =
                          !(draggedItem.type === 'scope' && draggedItem.id === targetId) &&
                          !(
                            draggedItem.type === 'scope' &&
                            isDescendantScope(scopes, draggedItem.id, targetId)
                          );
                        if (!canDrop) {
                          return;
                        }
                        event.preventDefault();
                        if (dropTarget !== targetId) {
                          setDropTarget(targetId);
                        }
                      }}
                      onDragLeaveTarget={(targetId) => {
                        if (dropTarget === targetId) {
                          setDropTarget(null);
                        }
                      }}
                      onDropTarget={(targetId, event) => {
                        event.preventDefault();
                        if (!draggedItem) {
                          return;
                        }
                        handleMovePreview(draggedItem, targetId);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: detail panel */}
        <aside className="flex flex-col overflow-hidden border-l border-imp-border bg-imp-muted/30">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center text-imp-muted-foreground">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-imp-primary/5">
                <Shield className="w-6 h-6 text-imp-primary/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-imp-foreground">Select a team or flow</p>
                <p className="mt-1.5 text-xs text-imp-muted-foreground max-w-[280px]">
                  Choose an item from the tree to manage its members and permissions.
                </p>
              </div>
              {hasTreeItems ? null : isAdmin ? (
                <button
                  type="button"
                  onClick={() => setShowNewTeam(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-imp-border px-3 py-1.5 text-xs font-medium text-imp-foreground transition-colors hover:border-imp-primary/50 hover:bg-imp-muted/50"
                >
                  <Plus className="h-3.5 w-3.5" /> Create your first team
                </button>
              ) : null}
            </div>
          ) : selected.kind === 'team' ? (
            <ScopeDetailPanel
              scopeId={selected.id}
              scopeName={selectedName ?? selected.name}
              users={users}
              userMap={userMap}
              teams={teams}
              isAdmin={!!isAdmin}
            />
          ) : (
            <FlowDetailPanel
              flowId={selected.id}
              flowName={selectedName ?? selected.name}
              users={users}
              userMap={userMap}
              teams={teams}
              isAdmin={!!isAdmin}
            />
          )}
        </aside>
      </div>

      {pendingMove ? (
        <MoveConfirmationDialog
          pendingMove={pendingMove}
          preview={movePreview}
          error={moveError}
          onClose={() => setPendingMove(null)}
        />
      ) : null}
    </PageLayout>
  );
}
