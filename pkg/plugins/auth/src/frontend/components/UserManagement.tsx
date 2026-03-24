/**
 * UserManagement — Admin panel for managing users.
 *
 * Displays a list of users with the ability to:
 * - Create new users (email/password/role)
 * - Change user roles
 * - Delete users
 *
 * Only visible to admin users. Uses the auth plugin's
 * `/plugins/auth/users` endpoints.
 */

import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { useAuth } from '../providers/AuthProvider';
import {
  AUTH_ADMIN_ROLE,
  AUTH_ASSIGNABLE_ROLES,
  AUTH_DEFAULT_ROLE,
  formatAuthRoleLabel,
  isAuthAssignableRole,
} from '../../shared/roles';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ManagedUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  createdAt?: string;
}

export interface UserManagementProps {
  /** Base URL for the Invect API (same as AuthProvider's baseUrl) */
  apiBaseUrl: string;
  /** Additional CSS class names */
  className?: string;
}

const ASSIGNABLE_ROLE_OPTIONS: Array<{
  value: (typeof AUTH_ASSIGNABLE_ROLES)[number];
  label: string;
}> = [
  { value: AUTH_DEFAULT_ROLE, label: 'No Access' },
  { value: 'owner', label: 'Owner' },
  { value: 'editor', label: 'Editor' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
];

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function UserManagement({ apiBaseUrl, className }: UserManagementProps) {
  const { user, isAuthenticated } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_SIZE = 25;

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q),
    );
  }, [users, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const authApiBase = `${apiBaseUrl}/plugins/auth`;

  // ── Fetch Users ────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${authApiBase}/users`, { credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to fetch users' }));
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUsers(data.users ?? []);
      setHasFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, [authApiBase]);

  // ── Delete User ────────────────────────────────────────────

  const deleteUser = useCallback(
    async (userId: string) => {
      if (!confirm('Are you sure you want to delete this user?')) return;
      try {
        const res = await fetch(`${authApiBase}/users/${userId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user');
      }
    },
    [authApiBase],
  );

  // ── Update Role ────────────────────────────────────────────

  const updateRole = useCallback(
    async (userId: string, role: string) => {
      try {
        const res = await fetch(`${authApiBase}/users/${userId}/role`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update role');
      }
    },
    [authApiBase],
  );

  // Guard: only admins see this
  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  // Auto-fetch on first render
  if (!hasFetched && !isLoading) {
    fetchUsers();
  }

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold shrink-0">User Management</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search users..."
          className="max-w-xs flex-1 rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground focus:outline-none focus:ring-2 focus:ring-imp-primary/50"
        />
        <div className="flex gap-2 shrink-0">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="rounded-md border border-imp-border px-3 py-1.5 text-sm hover:bg-imp-muted disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground hover:bg-imp-primary/90"
          >
            {showCreateForm ? 'Cancel' : 'Create User'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 rounded-md bg-red-50 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      {showCreateForm && (
        <CreateUserForm
          apiBaseUrl={authApiBase}
          onCreated={(newUser) => {
            setUsers((prev) => [...prev, newUser]);
            setShowCreateForm(false);
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Users Table */}
      <div className="overflow-hidden border rounded-lg border-imp-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium tracking-wider text-left uppercase border-b border-imp-border bg-imp-muted/30">
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imp-border">
            {paginatedUsers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-imp-muted-foreground">
                  {!hasFetched
                    ? 'Loading...'
                    : searchQuery
                      ? 'No users match your search'
                      : 'No users found'}
                </td>
              </tr>
            )}
            {paginatedUsers.map((u) => (
              <tr key={u.id} className="hover:bg-imp-muted/20">
                <td className="px-4 py-2">
                  <div className="font-medium">{u.name || 'Unnamed'}</div>
                  <div className="text-xs text-imp-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-2">
                  {u.role === AUTH_ADMIN_ROLE ? (
                    <div className="space-y-1">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-imp-muted">
                        {formatAuthRoleLabel(u.role)}
                      </span>
                    </div>
                  ) : (
                    <select
                      value={isAuthAssignableRole(u.role) ? u.role : AUTH_DEFAULT_ROLE}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      disabled={u.id === user?.id}
                      className="px-2 py-1 text-xs bg-transparent border rounded border-imp-border disabled:opacity-50"
                    >
                      {ASSIGNABLE_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {u.role === AUTH_ADMIN_ROLE && (
                    <span className="text-xs text-imp-muted-foreground">Config managed</span>
                  )}
                  {u.role !== AUTH_ADMIN_ROLE && u.id !== user?.id && (
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="px-2 py-1 text-xs text-red-600 rounded hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-imp-muted-foreground">
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-imp-border px-2.5 py-1 text-xs hover:bg-imp-muted disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-xs text-imp-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-imp-border px-2.5 py-1 text-xs hover:bg-imp-muted disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: Create User Form
// ─────────────────────────────────────────────────────────────

function CreateUserForm({
  apiBaseUrl,
  onCreated,
  onCancel,
}: {
  apiBaseUrl: string;
  onCreated: (user: ManagedUser) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(AUTH_DEFAULT_ROLE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name: name.trim() || undefined, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || `HTTP ${res.status}`);
      }
      onCreated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3 border rounded-lg border-imp-border">
      <h3 className="text-sm font-medium">Create New User</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block mb-1 text-xs font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="User name"
            className="w-full rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground focus:outline-none focus:ring-2 focus:ring-imp-primary/50"
          />
        </div>
        <div>
          <label className="block mb-1 text-xs font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-imp-primary/50"
          >
            {ASSIGNABLE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-imp-muted-foreground">
            Default grants no global access; flow access can still be granted through RBAC.
          </p>
        </div>
      </div>

      <div>
        <label className="block mb-1 text-xs font-medium">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
          className="w-full rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground focus:outline-none focus:ring-2 focus:ring-imp-primary/50"
        />
      </div>

      <div>
        <label className="block mb-1 text-xs font-medium">
          Password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 8 characters"
          required
          minLength={8}
          className="w-full rounded-md border border-imp-border bg-imp-background px-3 py-1.5 text-sm placeholder:text-imp-muted-foreground focus:outline-none focus:ring-2 focus:ring-imp-primary/50"
        />
      </div>

      {error && (
        <div className="p-2 text-xs text-red-600 rounded-md bg-red-50 dark:bg-red-950/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-imp-border px-3 py-1.5 text-sm hover:bg-imp-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground hover:bg-imp-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  );
}
