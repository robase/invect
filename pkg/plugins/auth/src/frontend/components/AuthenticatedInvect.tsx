/**
 * AuthenticatedInvect — Wraps the Invect component with auth gating.
 *
 * Renders InvectShell → AuthProvider → AuthGate around Invect.
 * The shell establishes the `.invect` CSS scope so all theme tokens
 * work for both the sign-in page and the Invect editor.
 *
 * When the user is not authenticated, shows the sign-in page.
 * When authenticated, renders the full Invect UI.
 *
 * Sign-up is disabled — initial admin users are configured explicitly via
 * `userAuth({ globalAdmins: [...] })`, and subsequent users are
 * created by the admin through the User Management panel.
 *
 * @example
 * ```tsx
 * import { AuthenticatedInvect } from '@invect/user-auth/ui';
 * import { Invect, InvectShell } from '@invect/frontend';
 * import '@invect/frontend/styles';
 *
 * export default function Page() {
 *   return (
 *     <AuthenticatedInvect
 *       apiBaseUrl="/api/invect"
 *       basePath="/invect"
 *       InvectComponent={Invect}
 *       ShellComponent={InvectShell}
 *     />
 *   );
 * }
 * ```
 */

import { type ReactNode, type ComponentType, type MemoExoticComponent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../providers/AuthProvider';
import { AuthGate } from './AuthGate';
import { SignInPage } from './SignInPage';

/**
 * Accepts both a plain component and a React.memo-wrapped component.
 * React.memo returns MemoExoticComponent which isn't directly assignable
 * to ComponentType in TypeScript, but is valid in JSX.
 */
type ComponentOrMemo<P> = ComponentType<P> | MemoExoticComponent<ComponentType<P>>;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Generic over TPlugin so that passing a typed InvectComponent (e.g. one that
 * expects `plugins?: InvectFrontendPlugin[]`) causes TypeScript to infer the
 * correct element type for the `plugins` prop on AuthenticatedInvect itself.
 * Defaults to `unknown` for the no-plugins case.
 */
export interface AuthenticatedInvectProps<TPlugin = unknown> {
  /**
   * Base URL for the Invect API.
   * Used for both auth endpoints and the Invect component.
   * @example '/api/invect' or 'http://localhost:3000/invect'
   */
  apiBaseUrl?: string;
  /**
   * Base path where Invect is mounted in the browser.
   * @default '/invect'
   */
  basePath?: string;
  /**
   * The Invect component to render when authenticated.
   * Pass this to avoid a direct dependency on @invect/frontend.
   * Accepts both plain and React.memo-wrapped components.
   *
   * @example
   * ```tsx
   * import { Invect } from '@invect/frontend';
   * <AuthenticatedInvect InvectComponent={Invect} />
   * ```
   */
  InvectComponent: ComponentOrMemo<{
    apiBaseUrl?: string;
    basePath?: string;
    reactQueryClient?: QueryClient;
    plugins?: TPlugin[];
  }>;
  /**
   * The InvectShell component that provides the `.invect` CSS scope.
   * This ensures theme tokens work for both the sign-in page and the
   * Invect editor. Import from `@invect/frontend`.
   *
   * `children` is typed as `unknown` rather than `ReactNode` to avoid a
   * structural incompatibility between `@types/react@18` (used here) and
   * `@types/react@19` (used by `@invect/frontend`) where `ReactPortal`
   * changed between versions.
   *
   * If not provided, the auth UI renders without the Invect CSS scope
   * and must rely on the host app's styling.
   *
   * @example
   * ```tsx
   * import { InvectShell } from '@invect/frontend';
   * <AuthenticatedInvect ShellComponent={InvectShell} />
   * ```
   */
  ShellComponent?: ComponentOrMemo<{
    children: ReactNode;
    theme?: 'light' | 'dark' | 'system';
    className?: string;
  }>;
  /**
   * Optional React Query client. If provided, it's shared between
   * the auth provider and the Invect component.
   */
  reactQueryClient?: QueryClient;
  /**
   * Content to display while checking session status.
   */
  loading?: ReactNode;
  /**
   * Theme for the shell wrapper.
   * @default 'system'
   */
  theme?: 'light' | 'dark' | 'system';
  /**
   * Frontend plugins forwarded to InvectComponent.
   * The element type is inferred from InvectComponent's `plugins` prop type,
   * so this stays consistent with whatever component you pass.
   *
   * @example
   * ```tsx
   * import { rbacFrontendPlugin } from '@invect/rbac/ui';
   * <AuthenticatedInvect plugins={[rbacFrontendPlugin]} />
   * ```
   */
  plugins?: TPlugin[];
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

export function AuthenticatedInvect<TPlugin = unknown>({
  apiBaseUrl = 'http://localhost:3000/invect',
  basePath = '/invect',
  InvectComponent,
  ShellComponent,
  reactQueryClient,
  loading,
  theme = 'light',
  plugins,
}: AuthenticatedInvectProps<TPlugin>) {
  const client = reactQueryClient ?? defaultQueryClient;
  const Invect = InvectComponent as ComponentType<{
    apiBaseUrl?: string;
    basePath?: string;
    reactQueryClient?: QueryClient;
    plugins?: TPlugin[];
  }>;
  const Shell = ShellComponent as
    | ComponentType<{
        children?: ReactNode;
        theme?: 'light' | 'dark' | 'system';
        className?: string;
      }>
    | undefined;

  const content = (
    <QueryClientProvider client={client}>
      <AuthProvider baseUrl={apiBaseUrl}>
        <AuthGate loading={loading ?? <LoadingSpinner />} fallback={<SignInOnly />}>
          <Invect
            apiBaseUrl={apiBaseUrl}
            basePath={basePath}
            reactQueryClient={client}
            plugins={plugins}
          />
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );

  // Wrap in the shell if provided — gives us the .invect CSS scope
  if (Shell) {
    return (
      <Shell theme={theme} className="h-full">
        {content}
      </Shell>
    );
  }

  return content;
}

// ─────────────────────────────────────────────────────────────
// Internal: Sign-in only view (no sign-up)
// ─────────────────────────────────────────────────────────────

function SignInOnly() {
  return (
    <SignInPage
      onSuccess={() => {
        // Auth state change will cause AuthGate to re-render with children
      }}
      subtitle="Sign in to access Invect"
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: Loading spinner
// ─────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-imp-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-imp-muted border-t-imp-primary" />
    </div>
  );
}
