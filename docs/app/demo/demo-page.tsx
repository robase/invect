'use client';

import { useEffect, useState } from 'react';
import '@invect/ui/styles';

type DemoInvectType = React.ComponentType<{ data: unknown; useMemoryRouter?: boolean }>;
type DemoData = unknown;

export function DemoPage() {
  const [DemoInvect, setDemoInvect] = useState<DemoInvectType | null>(null);
  const [data, setData] = useState<DemoData | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@invect/ui/demo').then((mod) => {
      if (cancelled) return;
      setDemoInvect(() => mod.DemoInvect as unknown as DemoInvectType);
      setData(mod.sampleDemoData);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!DemoInvect || !data) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: 14,
        }}
      >
        Loading demo…
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <DemoInvect data={data} useMemoryRouter />
    </div>
  );
}
