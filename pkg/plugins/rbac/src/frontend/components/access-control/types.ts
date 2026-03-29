import type { FlowAccessPermission, MovePreviewRequest } from '../../../shared/types';

export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
}

export type SelectedItem =
  | { kind: 'flow'; id: string; name: string }
  | { kind: 'team'; id: string; name: string };

export type PendingMove = MovePreviewRequest & { name: string };

export type PrincipalSelection = { type: 'user' | 'team'; id: string };

export interface AccessRow {
  id: string;
  label: string;
  kind: 'user' | 'team';
  permission: FlowAccessPermission | null;
  source: string;
  group?: string;
  canRemove: boolean;
  onPermissionChange?: (permission: FlowAccessPermission) => void;
  onRemove?: () => void;
}

export function formatPermissionLabel(permission: FlowAccessPermission): string {
  switch (permission) {
    case 'owner':
      return 'Owner';
    case 'editor':
      return 'Editor';
    case 'operator':
      return 'Operator';
    case 'viewer':
    default:
      return 'Viewer';
  }
}

export function getPermissionBadgeClasses(permission: FlowAccessPermission): string {
  switch (permission) {
    case 'owner':
      return 'border-amber-500/30 text-amber-600 dark:text-amber-400';
    case 'editor':
      return 'border-blue-500/30 text-blue-600 dark:text-blue-400';
    case 'operator':
      return 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
    case 'viewer':
    default:
      return 'border-imp-border text-imp-muted-foreground';
  }
}