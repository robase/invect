import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Route,
  Routes,
  Outlet,
  BrowserRouter,
  MemoryRouter,
  useInRouterContext,
} from 'react-router';
import { ValidationProvider } from './contexts/ValidationContext';
import { ApiProvider } from './contexts/ApiContext';
import { ThemeProvider, useOptionalTheme } from './contexts/ThemeProvider';
import { NodeRegistryProvider } from './contexts/NodeRegistryContext';
import { PluginRegistryProvider } from './contexts/PluginRegistryContext';
import type { InvectFrontendPlugin } from './types/plugin.types';
import { Home } from './routes/home';
import { Executions } from './routes/executions';
import { Flow } from './routes/flow';
import { FlowRuns } from './routes/flow-runs';
import { Credentials } from './routes/credentials';
import { FlowRouteLayout } from './routes/flow-route-layout';
import './app.css';
import { AppSideMenu } from './components/side-menu/side-menu';

export interface InvectProps {
  reactQueryClient?: QueryClient;
  apiBaseUrl?: string;
  basePath?: string;
  useMemoryRouter?: boolean; // Use MemoryRouter instead of BrowserRouter (useful for testing)
  /** Frontend plugins that contribute sidebar items, routes, panel tabs, header actions, etc. */
  plugins?: InvectFrontendPlugin[];
}

// Create a default QueryClient if none is provided
const createDefaultQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 3,
      },
    },
  });

/**
 * Layout component that provides the QueryClient context to all child routes
 */
const InvectLayout = React.memo(
  ({
    client,
    apiBaseUrl,
    basePath,
    plugins,
  }: {
    client: QueryClient;
    apiBaseUrl?: string;
    basePath?: string;
    plugins?: InvectFrontendPlugin[];
  }) => {
    const themeContext = useOptionalTheme();

    const content = (
      <QueryClientProvider client={client}>
        <ApiProvider baseURL={apiBaseUrl}>
          <PluginRegistryProvider plugins={plugins ?? []}>
            <ValidationProvider>
              <NodeRegistryProvider>
                <div className="imp-shell flex w-full h-screen font-sans antialiased bg-imp-background text-imp-foreground">
                  <AppSideMenu basePath={basePath} />
                  <div className="imp-page flex flex-1 h-full min-w-0 min-h-0 bg-imp-background">
                    <Outlet />
                  </div>
                </div>
              </NodeRegistryProvider>
            </ValidationProvider>
          </PluginRegistryProvider>
        </ApiProvider>
      </QueryClientProvider>
    );

    if (themeContext) {
      return content;
    }

    return (
      <ThemeProvider defaultTheme="dark" storageKey="invect-ui-theme">
        {content}
      </ThemeProvider>
    );
  },
);

InvectLayout.displayName = 'InvectLayout';

/**
 * Detect whether we are already inside a React Router context.
 * Returns false in non-Router environments (Next.js, plain React, etc.)
 */
function useHasRouterContext(): boolean {
  try {
    return useInRouterContext();
  } catch {
    return false;
  }
}

/**
 * Inner component that renders the Routes — must be inside a Router context
 */
const InvectRoutes = React.memo(
  ({
    client,
    apiBaseUrl,
    basePath,
    plugins,
  }: {
    client: QueryClient;
    apiBaseUrl: string;
    basePath: string;
    plugins?: InvectFrontendPlugin[];
  }) => {
    // Collect plugin routes
    const pluginRoutes = (plugins ?? []).flatMap((p) => p.routes ?? []);
    const topLevelPluginRoutes = pluginRoutes.filter((r) => !r.flowScoped);
    const flowScopedPluginRoutes = pluginRoutes.filter((r) => r.flowScoped);

    return (
      <div className="flex-1 w-full h-full min-h-0">
        <Routes>
          <Route
            path={basePath}
            element={
              <InvectLayout
                client={client}
                apiBaseUrl={apiBaseUrl}
                basePath={basePath}
                plugins={plugins}
              />
            }
          >
            <Route index element={<Home basePath={basePath} />} />
            <Route path="credentials" element={<Credentials basePath={basePath} />} />
            <Route path="executions" element={<Executions basePath={basePath} />} />
            {/* Flow-scoped layout with header */}
            <Route path="flow/:flowId" element={<FlowRouteLayout basePath={basePath} />}>
              <Route index element={<Flow basePath={basePath} />} />
              <Route path="runs" element={<FlowRuns basePath={basePath} />} />
              {/* Plugin flow-scoped routes */}
              {flowScopedPluginRoutes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path.replace(/^\//, '')}
                  element={<route.component basePath={basePath} />}
                />
              ))}
            </Route>
            {/* Plugin top-level routes */}
            {topLevelPluginRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path.replace(/^\//, '')}
                element={<route.component basePath={basePath} />}
              />
            ))}
          </Route>
        </Routes>
      </div>
    );
  },
);

InvectRoutes.displayName = 'InvectRoutes';

/**
 * Complete Invect component with internal routing
 * Use this for standalone applications or when mounting Invect at a specific route
 *
 * Automatically wraps in a BrowserRouter if no Router context is detected
 * (e.g. when used inside Next.js or other non-React-Router frameworks).
 * Pass useMemoryRouter=true to use MemoryRouter instead (useful for testing).
 *
 * For integration into existing React Router apps, use createInvectRoutes instead
 */
export const Invect = React.memo(
  ({
    reactQueryClient,
    apiBaseUrl = 'http://localhost:3000/invect',
    basePath = '/invect',
    useMemoryRouter = false,
    plugins,
  }: InvectProps) => {
    const client = reactQueryClient || createDefaultQueryClient();
    const hasRouter = useHasRouterContext();

    const routes = (
      <InvectRoutes client={client} apiBaseUrl={apiBaseUrl} basePath={basePath} plugins={plugins} />
    );

    // If already inside a Router (e.g. Vite + React Router app), render routes directly.
    // Otherwise, wrap in an appropriate Router for the environment.
    if (hasRouter) {
      return routes;
    }

    if (useMemoryRouter) {
      return <MemoryRouter initialEntries={[basePath]}>{routes}</MemoryRouter>;
    }

    return <BrowserRouter>{routes}</BrowserRouter>;
  },
);

Invect.displayName = 'Invect';
