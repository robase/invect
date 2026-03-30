'use client';

import dynamic from 'next/dynamic';
import '@invect/frontend/styles';

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
