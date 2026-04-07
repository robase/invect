/**
 * DemoInvect — Full Invect UI powered by static demo data.
 *
 * Renders the complete Invect dashboard (sidebar, flow editor, credentials page, etc.)
 * without requiring a backend server. All API calls resolve from the provided DemoData.
 *
 * @example
 * ```tsx
 * import { DemoInvect } from '@invect/ui/demo';
 * import '@invect/ui/styles';
 *
 * const demoData = {
 *   flows: [{ id: 'flow-1', name: 'My Flow', ... }],
 *   flowReactFlowData: { 'flow-1': { nodes: [...], edges: [...], ... } },
 *   nodeDefinitions: [...],
 * };
 *
 * <div style={{ height: '600px' }}>
 *   <DemoInvect data={demoData} />
 * </div>
 * ```
 */

import React, { useMemo } from 'react';
import { Invect, type InvectProps } from '../Invect';
import { createDemoApiClient, type DemoData } from './demo-api-client';
import type { ApiClient } from '../api/client';

export interface DemoInvectProps extends Omit<InvectProps, 'apiBaseUrl' | 'apiClient'> {
  /** Static data to power the demo UI */
  data: DemoData;
}

/**
 * Full Invect UI with no backend — all data comes from the `data` prop.
 * Uses MemoryRouter by default so it doesn't affect the host page's URL.
 */
export function DemoInvect({ data, useMemoryRouter = true, ...rest }: DemoInvectProps) {
  const mockClient = useMemo(() => createDemoApiClient(data) as unknown as ApiClient, [data]);

  return <Invect apiClient={mockClient} useMemoryRouter={useMemoryRouter} {...rest} />;
}
