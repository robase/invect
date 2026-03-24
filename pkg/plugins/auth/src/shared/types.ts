/**
 * @invect/user-auth — Shared Types
 *
 * Serializable types shared between backend and frontend.
 * No runtime code, no React, no Node.js dependencies.
 */

// ─────────────────────────────────────────────────────────────
// Session / Identity (mirrors what GET /auth/me returns)
// ─────────────────────────────────────────────────────────────

export interface AuthSession {
  user: AuthUser;
  isAuthenticated: boolean;
}

export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  role?: string;
}

// ─────────────────────────────────────────────────────────────
// Auth Action Types (for sign-in / sign-up forms)
// ─────────────────────────────────────────────────────────────

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  name?: string;
}

/**
 * Input for creating a new user (admin-only action).
 */
export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  role?: string;
}

/**
 * Input for updating a user's role (admin-only action).
 */
export interface UpdateUserRoleInput {
  role: string;
}

export interface AuthError {
  code: string;
  message: string;
}
