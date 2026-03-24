export const AUTH_ADMIN_ROLE = 'admin';
export const AUTH_DEFAULT_ROLE = 'default';

export const AUTH_FLOW_ACCESS_ROLES = ['owner', 'editor', 'operator', 'viewer'] as const;

export const AUTH_ASSIGNABLE_ROLES = [AUTH_DEFAULT_ROLE, ...AUTH_FLOW_ACCESS_ROLES] as const;

export const AUTH_VISIBLE_ROLES = [AUTH_ADMIN_ROLE, ...AUTH_ASSIGNABLE_ROLES] as const;

export type AuthAssignableRole = (typeof AUTH_ASSIGNABLE_ROLES)[number];
export type AuthVisibleRole = (typeof AUTH_VISIBLE_ROLES)[number];

const AUTH_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  default: 'Default',
  owner: 'Owner',
  editor: 'Editor',
  operator: 'Operator',
  viewer: 'Viewer',
};

export function isAuthAssignableRole(role: string | null | undefined): role is AuthAssignableRole {
  return !!role && AUTH_ASSIGNABLE_ROLES.includes(role as AuthAssignableRole);
}

export function isAuthVisibleRole(role: string | null | undefined): role is AuthVisibleRole {
  return !!role && AUTH_VISIBLE_ROLES.includes(role as AuthVisibleRole);
}

export function formatAuthRoleLabel(role: string | null | undefined): string {
  if (!role) {
    return AUTH_ROLE_LABELS.default;
  }

  if (AUTH_ROLE_LABELS[role]) {
    return AUTH_ROLE_LABELS[role];
  }

  return role
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
