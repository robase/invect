/**
 * AuthProvider — Context provider for authentication state.
 *
 * Fetches the current session from the better-auth proxy endpoints
 * and caches it via React Query. Provides sign-in, sign-up, and
 * sign-out actions to child components.
 */

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AuthSession,
  AuthUser,
  SignInCredentials,
  SignUpCredentials,
} from '../../shared/types';

// ─────────────────────────────────────────────────────────────
// Context Types
// ─────────────────────────────────────────────────────────────

export interface AuthContextValue {
  /** Current authenticated user, null if not signed in */
  user: AuthUser | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether the session query is still loading */
  isLoading: boolean;
  /** Sign in with email/password */
  signIn: (credentials: SignInCredentials) => Promise<void>;
  /** Sign up with email/password */
  signUp: (credentials: SignUpCredentials) => Promise<void>;
  /** Sign out the current session */
  signOut: () => Promise<void>;
  /** Whether a sign-in is in progress */
  isSigningIn: boolean;
  /** Whether a sign-up is in progress */
  isSigningUp: boolean;
  /** Last auth error, if any */
  error: string | null;
}

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * Base URL for the Invect API (e.g. 'http://localhost:3000/invect').
   * Auth endpoints are at `${baseUrl}/plugins/auth/api/auth/*`.
   */
  baseUrl: string;
}

export function AuthProvider({ children, baseUrl }: AuthProviderProps) {
  const queryClient = useQueryClient();

  // Construct auth API base URL
  const authApiBase = `${baseUrl}/plugins/auth/api/auth`;

  // ── Session Query ──────────────────────────────────────────

  const { data: session, isLoading } = useQuery<AuthSession>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const response = await fetch(`${authApiBase}/get-session`, {
        credentials: 'include',
      });
      if (!response.ok) {
        return { user: null as unknown as AuthUser, isAuthenticated: false };
      }
      const data = await response.json();
      if (!data?.user) {
        return { user: null as unknown as AuthUser, isAuthenticated: false };
      }
      return {
        user: {
          id: data.user.id,
          name: data.user.name ?? undefined,
          email: data.user.email ?? undefined,
          image: data.user.image ?? undefined,
          role: data.user.role ?? undefined,
        },
        isAuthenticated: true,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // ── Sign In ────────────────────────────────────────────────

  const signInMutation = useMutation({
    mutationFn: async (credentials: SignInCredentials) => {
      const response = await fetch(`${authApiBase}/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Sign in failed' }));
        throw new Error(err.message || `Sign in failed (${response.status})`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
  });

  // ── Sign Up ────────────────────────────────────────────────

  const signUpMutation = useMutation({
    mutationFn: async (credentials: SignUpCredentials) => {
      const response = await fetch(`${authApiBase}/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Sign up failed' }));
        throw new Error(err.message || `Sign up failed (${response.status})`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
  });

  // ── Sign Out ───────────────────────────────────────────────

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${authApiBase}/sign-out`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const err = await response.json().catch(async () => ({
          message: (await response.text().catch(() => '')) || 'Sign out failed',
        }));
        throw new Error(err.message || `Sign out failed (${response.status})`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
    },
  });

  // ── Callbacks ──────────────────────────────────────────────

  const signIn = useCallback(
    async (credentials: SignInCredentials) => {
      await signInMutation.mutateAsync(credentials);
    },
    [signInMutation],
  );

  const signUp = useCallback(
    async (credentials: SignUpCredentials) => {
      await signUpMutation.mutateAsync(credentials);
    },
    [signUpMutation],
  );

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync();
  }, [signOutMutation]);

  // ── Error ──────────────────────────────────────────────────

  const error =
    signInMutation.error?.message ??
    signUpMutation.error?.message ??
    signOutMutation.error?.message ??
    null;

  // ── Context Value ──────────────────────────────────────────

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.isAuthenticated ? session.user : null,
      isAuthenticated: session?.isAuthenticated ?? false,
      isLoading,
      signIn,
      signUp,
      signOut,
      isSigningIn: signInMutation.isPending,
      isSigningUp: signUpMutation.isPending,
      error,
    }),
    [
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
      signInMutation.isPending,
      signUpMutation.isPending,
      error,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * Access auth context — current user, sign-in/sign-up/sign-out actions.
 *
 * Must be used within an `<AuthProvider>`.
 * Returns a safe fallback (unauthenticated) if provider is missing.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    // Graceful fallback
    return {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      signIn: async () => {
        throw new Error('AuthProvider not found');
      },
      signUp: async () => {
        throw new Error('AuthProvider not found');
      },
      signOut: async () => {
        throw new Error('AuthProvider not found');
      },
      isSigningIn: false,
      isSigningUp: false,
      error: null,
    };
  }

  return ctx;
}
