/**
 * AuthGate — Conditionally renders children based on auth state.
 *
 * Useful for protecting routes or showing different content for
 * authenticated vs unauthenticated users.
 */

import type { ReactNode } from 'react';
import { useAuth } from '../providers/AuthProvider';

export interface AuthGateProps {
  /** Content to show when authenticated */
  children: ReactNode;
  /** Content to show when NOT authenticated (defaults to null) */
  fallback?: ReactNode;
  /** Content to show while loading (defaults to null) */
  loading?: ReactNode;
}

export function AuthGate({ children, fallback = null, loading = null }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <>{loading}</>;
  }

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
