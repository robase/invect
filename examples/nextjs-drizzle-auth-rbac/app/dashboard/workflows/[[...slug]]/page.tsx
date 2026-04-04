'use client';

import dynamic from 'next/dynamic';
import '@invect/ui/styles';

/**
 * Invect flow editor, embedded as a page inside the Acme Dashboard.
 *
 * The flow editor is loaded dynamically (no SSR) because it uses
 * browser-only APIs (React Flow, CodeMirror, etc.).
 *
 * API calls go to /api/invect/* which is handled by @invect/nextjs.
 */
const InvectEditor = dynamic(
  () =>
    Promise.all([
      import('@invect/ui'),
      import('@invect/user-auth/ui'),
      import('@invect/rbac/ui'),
    ]).then(([frontend, authUi, rbacUi]) => ({
      default: function InvectPage() {
        return (
          <authUi.AuthenticatedInvect
            apiBaseUrl="/api/invect"
            basePath="/dashboard/workflows"
            InvectComponent={frontend.Invect}
            ShellComponent={frontend.InvectShell}
            theme="light"
            plugins={[authUi.authFrontendPlugin, rbacUi.rbacFrontendPlugin]}
          />
        );
      },
    })),
  { ssr: false, loading: () => <WorkflowsLoading /> },
);

function WorkflowsLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center">
        <div className="text-2xl">⚡</div>
        <div className="mt-2 text-sm text-muted">Loading Workflow Editor…</div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <div className="-m-6 h-[calc(100vh-0px)]">
      <InvectEditor />
    </div>
  );
}
