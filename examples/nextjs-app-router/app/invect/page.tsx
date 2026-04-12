'use client';

import dynamic from 'next/dynamic';
import '@invect/ui/styles';

const Invect = dynamic(() => import('@invect/ui').then((mod) => ({ default: mod.Invect })), {
  ssr: false,
});

export default function InvectPage() {
  return (
    <div className="w-full h-full">
      <Invect apiPath="/api/invect" frontendPath="/invect" />
    </div>
  );
}
