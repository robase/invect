'use client';

import dynamic from 'next/dynamic';
import '@invect/ui/styles';
import { auth } from '@invect/user-auth';
import { rbac } from '@invect/rbac';

const Invect = dynamic(() => import('@invect/ui').then((m) => ({ default: m.Invect })), {
  ssr: false,
  loading: () => <WorkflowsLoading />,
});

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
    <div className="-m-6 h-screen">
      <Invect
        config={{
          apiPath: '/api/invect',
          frontendPath: '/dashboard/workflows',
          theme: 'light',
          plugins: [auth(), rbac()],
        }}
      />
    </div>
  );
}
