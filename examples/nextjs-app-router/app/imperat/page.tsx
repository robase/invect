'use client';

import dynamic from 'next/dynamic';
import '@invect/frontend/styles';

// Dynamic import with ssr:false — @invect/frontend bundles libraries
// (react-style-singleton, react-remove-scroll) that access `document` at
// module scope, which crashes during Next.js SSR.  The flow editor is
// inherently client-only so skipping SSR is the correct approach.
const Invect = dynamic(() => import('@invect/frontend').then((mod) => ({ default: mod.Invect })), {
  ssr: false,
});

export default function InvectPage() {
  return (
    <div className="w-full h-full">
      <Invect apiBaseUrl="/api/invect" basePath="/invect" />
    </div>
  );
}
