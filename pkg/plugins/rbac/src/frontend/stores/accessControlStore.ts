import { create } from 'zustand';
import type { MovePreviewResponse, ScopeTreeNode } from '../../shared/types';
import type { PendingMove, SelectedItem } from '../components/access-control/types';

export type HierarchyDragItem = {
  type: 'scope' | 'flow';
  id: string;
  name: string;
  /** Current parent scope id, or null if at root */
  parentId: string | null;
};

interface AccessControlState {
  // Selection
  selected: SelectedItem | null;
  setSelected: (item: SelectedItem | null) => void;

  // Tree
  expandedNodes: Set<string>;
  setExpandedNodes: (nodes: Set<string>) => void;
  toggleNode: (scopeId: string) => void;
  expandAll: (ids: string[]) => void;

  // Search
  search: string;
  setSearch: (q: string) => void;

  // New team creation
  showNewTeam: boolean;
  setShowNewTeam: (show: boolean) => void;
  newTeamName: string;
  setNewTeamName: (name: string) => void;

  // Drag-and-drop
  draggedItem: HierarchyDragItem | null;
  dropTarget: string | null; // scope id or 'root', null when nothing hovered
  startDrag: (item: HierarchyDragItem) => void;
  endDrag: () => void;
  /**
   * Called on dragover for a specific target.
   * Returns true if the drop is valid (caller should call event.preventDefault).
   */
  setDropTarget: (targetId: string | null) => void;

  // Move flow
  pendingMove: PendingMove | null;
  movePreview: MovePreviewResponse | null;
  moveError: string | null;
  setPendingMove: (move: PendingMove | null) => void;
  setMovePreview: (preview: MovePreviewResponse | null) => void;
  setMoveError: (error: string | null) => void;
  clearMove: () => void;
}

export const useAccessControlStore = create<AccessControlState>()((set) => ({
  // Selection
  selected: null,
  setSelected: (item) => set({ selected: item }),

  // Tree
  expandedNodes: new Set(),
  setExpandedNodes: (nodes) => set({ expandedNodes: nodes }),
  toggleNode: (scopeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (next.has(scopeId)) {
        next.delete(scopeId);
      } else {
        next.add(scopeId);
      }
      return { expandedNodes: next };
    }),
  expandAll: (ids) => set({ expandedNodes: new Set(ids) }),

  // Search
  search: '',
  setSearch: (q) => set({ search: q }),

  // New team
  showNewTeam: false,
  setShowNewTeam: (show) => set({ showNewTeam: show }),
  newTeamName: '',
  setNewTeamName: (name) => set({ newTeamName: name }),

  // Drag-and-drop
  draggedItem: null,
  dropTarget: null,
  startDrag: (item) => set({ draggedItem: item, dropTarget: null }),
  endDrag: () => set({ draggedItem: null, dropTarget: null }),
  setDropTarget: (targetId) => set({ dropTarget: targetId }),

  // Move
  pendingMove: null,
  movePreview: null,
  moveError: null,
  setPendingMove: (move) => set({ pendingMove: move }),
  setMovePreview: (preview) => set({ movePreview: preview }),
  setMoveError: (error) => set({ moveError: error }),
  clearMove: () => set({ pendingMove: null, movePreview: null, moveError: null }),
}));

// ─── Drag-and-drop helpers ───────────────────────────────────────────────────

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

export function isDescendantScope(
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

export { collectScopeIds };

/**
 * Returns true if dropping `dragged` onto `targetId` is a valid move.
 * targetId of null means "move to root".
 */
export function canDropOnTarget(
  dragged: HierarchyDragItem,
  targetId: string | null,
  allScopes: ScopeTreeNode[],
): boolean {
  // Can't drop a scope onto itself
  if (dragged.type === 'scope' && dragged.id === targetId) {
    return false;
  }
  // Can't drop a scope onto one of its own descendants
  if (
    dragged.type === 'scope' &&
    targetId !== null &&
    isDescendantScope(allScopes, dragged.id, targetId)
  ) {
    return false;
  }
  // No-op: item is already in this scope
  if (dragged.parentId === targetId) {
    return false;
  }
  return true;
}
