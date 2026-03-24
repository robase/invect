# Frontend Plugin System — Design Document

## Overview

This document explores a frontend plugin system for `@invect/frontend`, using an RBAC plugin as a concrete case study. The frontend and backend plugin systems are **independent** — they share only serializable types from `@invect/core/types`. The backend keeps its existing `InvectPlugin` interface; the frontend gets a new `InvectFrontendPlugin` interface based on typed extension points.

---

## Architecture

```
@invect/core/types (shared contract — serializable, no runtime)
├── InvectPluginUIManifest    ← backend plugins declare UI contributions as data
├── PluginUISidebarItem        ← { label, icon, path }
├── PluginUIPage               ← { path, componentId }
├── PluginUIPanelTab           ← { context, label, componentId }
└── PluginUIHeaderAction       ← { context, componentId }

@invect/core (backend)                    @invect/frontend (browser)
├── InvectPlugin                          ├── InvectFrontendPlugin
│   ├── hooks, endpoints, actions          │   ├── components (by componentId)
│   └── ui?: InvectPluginUIManifest       │   ├── sidebar, routes, panelTabs
│                                          │   ├── providers (React context wrappers)
│ GET /plugins/ui-manifest ──────────────► │   └── apiHeaders (auth token injection)
│   returns combined manifests             │
│   from all backend plugins               │ PluginRegistryProvider merges:
│                                          │   local plugins + fetched manifest
└──────────────────────────────────────────└──────────────────────────────────────
```

### Design Principles

1. **Backend is optional.** Frontend plugins work standalone — they can declare sidebar items, routes, and providers without any backend manifest.
2. **Backend is source of truth for structure.** When a backend plugin declares `ui.sidebar`, that item appears in the sidebar even if no frontend plugin is loaded (it just won't have a component to render). This prevents orphaned UI when backend plugins are removed.
3. **Frontend plugins provide implementations.** A `componentId` from the backend manifest is resolved to a React component via the frontend plugin registry.
4. **No runtime coupling.** The only bridge is `GET /plugins/ui-manifest` returning JSON. The frontend plugin system has zero Node.js dependencies. The backend plugin system has zero React dependencies.
5. **Typed extension points.** The frontend declares a fixed set of extension points (sidebar, routes, panels, providers, headers). Plugins contribute to these points. New extension points are added explicitly — no catch-all.

---

## Frontend Plugin Interface

```typescript
// @invect/frontend — plugin type definition

import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface InvectFrontendPlugin {
  /** Unique plugin ID — should match backend plugin ID for manifest resolution */
  id: string;

  // ──────────────────────────────────────
  // UI Extension Points
  // ──────────────────────────────────────

  /** Add items to the sidebar navigation */
  sidebar?: PluginSidebarContribution[];

  /** Add top-level routes (pages) */
  routes?: PluginRouteContribution[];

  /** Add tabs to contextual panels (flow editor right panel, node config, etc.) */
  panelTabs?: PluginPanelTabContribution[];

  /** Add action buttons to contextual headers */
  headerActions?: PluginHeaderActionContribution[];

  /** Provide named component implementations (resolved from backend componentIds) */
  components?: Record<string, ComponentType<any>>;

  // ──────────────────────────────────────
  // Non-UI Extension Points
  // ──────────────────────────────────────

  /** Wrap the React tree with additional providers (auth context, feature flags, etc.) */
  providers?: ComponentType<{ children: ReactNode }>[];

  /** Inject headers into every API request (auth tokens, tenant IDs, etc.) */
  apiHeaders?: () => Record<string, string> | Promise<Record<string, string>>;

  /**
   * Override permission checks in the UI.
   * Called by components to determine visibility/disabled state.
   * Returns undefined to defer to default behavior.
   */
  checkPermission?: (permission: string, context?: PermissionContext) => boolean | undefined;
}

interface PluginSidebarContribution {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string | (() => string | undefined);
  /** Position hint: 'top' (above default items), 'bottom' (before theme toggle) */
  position?: 'top' | 'bottom';
  /** Required permission — item hidden if check fails */
  permission?: string;
}

interface PluginRouteContribution {
  path: string;
  component: ComponentType<{ basePath: string }>;
  /** If true, route is nested under the flow layout (has flow header + sidebar) */
  flowScoped?: boolean;
}

interface PluginPanelTabContribution {
  /** Where the tab appears */
  context: 'flowEditor' | 'nodeConfig';
  label: string;
  icon?: LucideIcon;
  component: ComponentType<PanelTabProps>;
  /** Required permission — tab hidden if check fails */
  permission?: string;
}

interface PluginHeaderActionContribution {
  /** Where the action appears */
  context: 'flowHeader' | 'flowList';
  component: ComponentType<HeaderActionProps>;
  /** Required permission — action hidden if check fails */
  permission?: string;
}

interface PanelTabProps {
  flowId: string;
  basePath: string;
}

interface HeaderActionProps {
  flowId?: string;
  basePath: string;
}

interface PermissionContext {
  resourceType?: string;
  resourceId?: string;
  flowId?: string;
}
```

---

## Plugin Registry & Resolution

### PluginRegistryProvider

The registry collects contributions from all plugins and merges them with backend-declared manifests.

```typescript
// @invect/frontend — internal

interface PluginRegistry {
  /** All sidebar items (from local plugins + backend manifest) */
  sidebarItems: ResolvedSidebarItem[];
  /** All routes (from local plugins + backend manifest) */
  routes: ResolvedRoute[];
  /** Panel tabs grouped by context */
  panelTabs: Record<string, ResolvedPanelTab[]>;
  /** Header actions grouped by context */
  headerActions: Record<string, ResolvedHeaderAction[]>;
  /** Providers to wrap the React tree */
  providers: ComponentType<{ children: ReactNode }>[];
  /** Combined API headers from all plugins */
  getApiHeaders: () => Promise<Record<string, string>>;
  /** Permission checker (first plugin to return non-undefined wins) */
  checkPermission: (permission: string, context?: PermissionContext) => boolean;
  /** Resolve a componentId to a React component */
  resolveComponent: (componentId: string) => ComponentType<any> | null;
}
```

### Resolution Flow

```
1. <Invect plugins={[authPlugin, rbacPlugin]}> mounts

2. PluginRegistryProvider:
   a. Collects from local plugins:
      - sidebar items, routes, panelTabs, headerActions
      - providers, apiHeaders, checkPermission
      - components map (keyed by componentId)
   
   b. Fetches GET /plugins/ui-manifest (via React Query):
      - Returns { plugins: [{ id, sidebar, pages, panelTabs, headerActions }] }
      - Merges backend sidebar items with local sidebar items
      - For backend pages: resolves componentId via components map
      - Deduplicates by plugin ID + path
   
   c. Builds final PluginRegistry

3. Components consume via usePluginRegistry():
   - AppSideMenu reads sidebarItems
   - Router reads routes
   - FlowEditorV2 reads panelTabs['flowEditor']
   - FlowHeader reads headerActions['flowHeader']
```

### Merge Strategy

| Source | Priority | Behavior |
|--------|----------|----------|
| Local frontend plugin declares sidebar item | Rendered immediately (no network wait) |
| Backend manifest declares sidebar item | Merged after fetch; shown after load |
| Both declare same path | Frontend takes precedence (has actual component) |
| Backend declares page, no frontend component | Renders `<PluginPagePlaceholder>` with "Plugin UI not loaded" |
| Frontend declares provider | Wraps tree in order of plugin array |

---

## RBAC Plugin — Concrete Case Study

### What the RBAC plugin needs to do in the UI

1. **Show who owns a flow** — avatar/name badge on flow cards in the flow list
2. **Share button that works** — the FlowHeader already has a Share button (dead), wire it to a sharing modal
3. **Manage permissions panel** — a tab in the flow editor right panel showing access records
4. **Permission-gated actions** — disable Save/Run/Delete for viewers, hide "New Flow" for non-creators
5. **User avatar in sidebar** — show the current user's name/role in the sidebar footer
6. **Access control admin page** — a dedicated page for managing roles (admin only)

### Plugin Package Structure

```
@invect/plugin-rbac/
├── package.json
│   exports:
│     ".":       "./dist/backend/index.js"    ← InvectPlugin (Node.js)
│     "./ui":    "./dist/frontend/index.js"   ← InvectFrontendPlugin (Browser)
│     "./types": "./dist/shared/types.js"     ← Shared types (isomorphic)
│
├── src/
│   ├── backend/
│   │   ├── index.ts              ← definePlugin({ id: 'rbac', ... })
│   │   ├── endpoints.ts          ← flow access CRUD, roles API
│   │   └── hooks.ts              ← onAuthorize hook
│   │
│   ├── frontend/
│   │   ├── index.ts              ← defineFrontendPlugin({ id: 'rbac', ... })
│   │   ├── hooks/
│   │   │   ├── useFlowAccess.ts  ← React Query hooks for access records
│   │   │   ├── useCurrentUser.ts ← fetches /auth/me, caches identity
│   │   │   └── usePermission.ts  ← permission check hook
│   │   ├── components/
│   │   │   ├── ShareFlowModal.tsx     ← modal for granting/revoking access
│   │   │   ├── FlowAccessPanel.tsx    ← editor panel tab — list of access records
│   │   │   ├── FlowOwnerBadge.tsx     ← avatar badge for flow cards
│   │   │   ├── ShareButton.tsx        ← header action — opens share modal
│   │   │   ├── UserMenuSection.tsx    ← sidebar footer — avatar + role
│   │   │   └── AccessControlPage.tsx  ← admin page for managing roles
│   │   └── providers/
│   │       └── RbacProvider.tsx        ← context with current user + permissions
│   │
│   └── shared/
│       └── types.ts              ← FlowAccessRecord, Role, Permission enums
```

### Backend Plugin Declaration

```typescript
// @invect/plugin-rbac/src/backend/index.ts
import type { InvectPlugin } from '@invect/core';

export const rbacPlugin: InvectPlugin = {
  id: 'rbac',
  name: 'Role-Based Access Control',

  endpoints: [
    // These already exist in the express router — would move to plugin
    { method: 'GET',    path: '/flows/:flowId/access',           handler: listFlowAccess,   permission: 'flow:read' },
    { method: 'POST',   path: '/flows/:flowId/access',           handler: grantFlowAccess,  permission: 'flow:update' },
    { method: 'DELETE', path: '/flows/:flowId/access/:accessId', handler: revokeFlowAccess, permission: 'flow:update' },
    { method: 'GET',    path: '/flows/accessible',               handler: listAccessible,   permission: 'flow:read' },
    { method: 'GET',    path: '/auth/roles',                     handler: listRoles },
    { method: 'GET',    path: '/auth/me',                        handler: getMe },
  ],

  hooks: {
    onAuthorize: async (context) => {
      // Custom authorization logic — check flow access table, etc.
    },
  },

  // UI manifest — declares what the frontend should render
  // The frontend resolves componentIds via its plugin registry
  ui: {
    sidebar: [
      { label: 'Access Control', icon: 'Shield', path: '/access', permission: 'admin:*' },
    ],
    pages: [
      { path: '/access', componentId: 'rbac.AccessControlPage' },
    ],
    panelTabs: [
      { context: 'flowEditor', label: 'Access', componentId: 'rbac.FlowAccessPanel' },
    ],
    headerActions: [
      { context: 'flowHeader', componentId: 'rbac.ShareButton' },
    ],
  },
};
```

### Frontend Plugin Declaration

```typescript
// @invect/plugin-rbac/ui  (browser entry point)
import type { InvectFrontendPlugin } from '@invect/frontend';
import { Shield } from 'lucide-react';
import { RbacProvider } from './providers/RbacProvider';
import { ShareFlowModal } from './components/ShareFlowModal';
import { FlowAccessPanel } from './components/FlowAccessPanel';
import { ShareButton } from './components/ShareButton';
import { AccessControlPage } from './components/AccessControlPage';
import { UserMenuSection } from './components/UserMenuSection';

export const rbacFrontendPlugin: InvectFrontendPlugin = {
  id: 'rbac',

  // ─── Providers ───
  // Wraps the entire app with RBAC context (current user, permissions cache)
  providers: [RbacProvider],

  // ─── Sidebar ───
  sidebar: [
    {
      label: 'Access Control',
      icon: Shield,
      path: '/access',
      position: 'bottom',
      permission: 'admin:*',
    },
  ],

  // ─── Routes ───
  routes: [
    { path: '/access', component: AccessControlPage },
  ],

  // ─── Panel Tabs ───
  panelTabs: [
    {
      context: 'flowEditor',
      label: 'Access',
      icon: Shield,
      component: FlowAccessPanel,
      permission: 'flow:read',
    },
  ],

  // ─── Header Actions ───
  headerActions: [
    {
      context: 'flowHeader',
      component: ShareButton,
      permission: 'flow:update',
    },
  ],

  // ─── Component Implementations ───
  // These resolve backend-declared componentIds to actual React components
  components: {
    'rbac.AccessControlPage': AccessControlPage,
    'rbac.FlowAccessPanel': FlowAccessPanel,
    'rbac.ShareButton': ShareButton,
  },

  // ─── Permission Checking ───
  checkPermission: (permission, context) => {
    // This would read from the RbacProvider's cached permissions
    // Returns undefined to defer to default (show everything)
    return undefined; // Implementation in RbacProvider
  },
};
```

### Host App Wiring

```typescript
// Express server (examples/express-drizzle/index.ts)
import { rbacPlugin } from '@invect/plugin-rbac';
import { betterAuthPlugin } from '@invect/plugin-rbac/auth'; // or separate package

app.use('/invect', createInvectRouter({
  databaseUrl: '...',
  plugins: [betterAuthPlugin({ auth }), rbacPlugin],
}));

// Vite frontend (examples/vite-react-frontend/src/App.tsx)
import { rbacFrontendPlugin } from '@invect/plugin-rbac/ui';

<Invect
  apiBaseUrl="http://localhost:3000/invect"
  plugins={[rbacFrontendPlugin]}
/>
```

---

## Component-Level Integration

This section traces exactly how each UI element works, from the extension point through to the rendered pixels.

### 1. Sidebar — User Avatar + Role Badge

**Extension point:** `providers` + `sidebar[position='bottom']`

The `RbacProvider` fetches `GET /auth/me` on mount and caches the result:

```typescript
// RbacProvider.tsx
const RbacContext = createContext<RbacContextValue | null>(null);

export function RbacProvider({ children }: { children: ReactNode }) {
  const api = useApiClient();
  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get('/auth/me'),
    staleTime: 5 * 60 * 1000,
  });

  const permissions = useMemo(
    () => new Set(me?.permissions ?? []),
    [me?.permissions]
  );

  const checkPermission = useCallback(
    (perm: string) => permissions.has(perm) || permissions.has('admin:*'),
    [permissions]
  );

  return (
    <RbacContext.Provider value={{ user: me?.identity, permissions, checkPermission }}>
      {children}
    </RbacContext.Provider>
  );
}
```

The sidebar renders a `UserMenuSection` in its footer area. Currently the sidebar looks like:

```
┌──────────────────┐
│ F  Invect        │
├──────────────────┤
│ 🏠 Home           │
│ 📄 Executions     │   ← existing hardcoded items
│ 🔑 Credentials    │
│ ⚙️ Settings       │
│                   │
│ 🛡️ Access Control │   ← injected by RBAC plugin (sidebar contribution)
├──────────────────┤
│ 🌙 Dark Mode      │   ← existing
│                   │
│ 👤 Rohan          │   ← injected by RBAC plugin (sidebar.bottom)
│    Editor         │      reads from RbacProvider context
└──────────────────┘
```

**How `AppSideMenu` changes:**

```tsx
// Current (hardcoded)
const menuItems = [
  { icon: Home, label: 'Home', href: basePath || '/' },
  { icon: FileText, label: 'Executions', href: `${basePath}/executions` },
  { icon: KeyRound, label: 'Credentials', href: `${basePath}/credentials` },
  { icon: Settings, label: 'Settings', href: `${basePath}/settings` },
];

// With plugin system
const registry = usePluginRegistry();

const menuItems = [
  // Default items
  { icon: Home, label: 'Home', href: basePath || '/' },
  { icon: FileText, label: 'Executions', href: `${basePath}/executions` },
  { icon: KeyRound, label: 'Credentials', href: `${basePath}/credentials` },
  { icon: Settings, label: 'Settings', href: `${basePath}/settings` },
  // Plugin-contributed items (filtered by permission)
  ...registry.sidebarItems
    .filter(item => !item.permission || registry.checkPermission(item.permission))
    .map(item => ({
      icon: item.icon,
      label: item.label,
      href: `${basePath}${item.path}`,
    })),
];
```

**Change surface:** `AppSideMenu` gets `usePluginRegistry()` call. ~15 lines added. No props change needed — reads from context.

### 2. Flow List — Owner Badges

**Extension point:** `headerActions[context='flowList']` (or a dedicated `flowListDecorators` point)

The RBAC plugin wants to show who owns each flow. This requires either:
- (A) Backend returns `createdBy` / `owner` on the Flow model (requires schema change)
- (B) Frontend fetches access records per-flow and displays the owner

Option A is simpler and doesn't need a plugin extension point at all — it's a data field. The plugin would:
1. Add a `createdBy` column to the flows table via `schema` in the backend plugin
2. The frontend's `FlowCard` already renders all fields from the Flow object — just add a badge

For the **"My Flows / Shared / All" filter tabs**, the extension point is more useful:

```typescript
// The RBAC plugin contributes a filter component to the flow list
headerActions: [
  {
    context: 'flowList',
    component: FlowListFilter, // renders tabs: My Flows | Shared | All
  },
],
```

```tsx
// FlowListFilter.tsx (plugin component)
export function FlowListFilter({ basePath }: HeaderActionProps) {
  const { user } = useRbac();
  const [filter, setFilter] = useState<'all' | 'mine' | 'shared'>('all');

  // This filter state would be lifted into a URL param or shared context
  // so the flow list query can use it
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-muted">
      <Button variant={filter === 'all' ? 'secondary' : 'ghost'} size="sm"
        onClick={() => setFilter('all')}>All</Button>
      <Button variant={filter === 'mine' ? 'secondary' : 'ghost'} size="sm"
        onClick={() => setFilter('mine')}>My Flows</Button>
      <Button variant={filter === 'shared' ? 'secondary' : 'ghost'} size="sm"
        onClick={() => setFilter('shared')}>Shared</Button>
    </div>
  );
}
```

**How `Home` page changes:**

```tsx
// In the flow list header area
const registry = usePluginRegistry();
const flowListActions = registry.headerActions['flowList'] ?? [];

return (
  <div className="flex items-center justify-between">
    <h2>Flows</h2>
    <div className="flex items-center gap-2">
      {/* Plugin-contributed flow list actions */}
      {flowListActions.map((action, i) => (
        <action.component key={i} basePath={basePath} />
      ))}
      {/* Existing "New Flow" button — now permission-gated */}
      {registry.checkPermission('flow:create') && (
        <Button onClick={() => setShowAddFlow(true)}>+ New Flow</Button>
      )}
    </div>
  </div>
);
```

### 3. Flow Header — Share Button

**Extension point:** `headerActions[context='flowHeader']`

The FlowHeader already has a dead Share button. The plugin system replaces it:

```tsx
// FlowHeader.tsx — with plugin system
const registry = usePluginRegistry();
const flowHeaderActions = registry.headerActions['flowHeader'] ?? [];

return (
  <header className="flex items-center justify-between px-6 border-b h-14">
    <div className="flex items-center gap-4">
      <InlineEdit
        value={flowName}
        onChange={onFlowNameChange}
        disabled={!registry.checkPermission('flow:update', { flowId })}
      />
      {isDirty && <Badge variant="secondary">Unsaved Changes</Badge>}
    </div>
    <div className="flex items-center gap-2">
      {/* Plugin-contributed header actions (Share button from RBAC) */}
      {flowHeaderActions
        .filter(a => !a.permission || registry.checkPermission(a.permission, { flowId }))
        .map((action, i) => (
          <action.component key={i} flowId={flowId} basePath={basePath} />
        ))}

      {/* Built-in actions — now permission-gated */}
      {registry.checkPermission('flow:update', { flowId }) && (
        <Button variant="outline" size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
          <Save className="w-4 h-4 mr-2" /> Save
        </Button>
      )}
      {registry.checkPermission('flow-run:create', { flowId }) && (
        <Button size="sm" onClick={onExecute} disabled={isExecuting}>
          <Play className="w-4 h-4 mr-2" /> Run
        </Button>
      )}
    </div>
  </header>
);
```

The RBAC plugin's `ShareButton` component:

```tsx
// ShareButton.tsx (plugin component)
export function ShareButton({ flowId }: HeaderActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="w-4 h-4 mr-2" /> Share
      </Button>
      {open && <ShareFlowModal flowId={flowId!} onClose={() => setOpen(false)} />}
    </>
  );
}
```

The `ShareFlowModal` component:

```tsx
// ShareFlowModal.tsx (plugin component)
export function ShareFlowModal({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const api = useApiClient();
  const { data: accessRecords } = useQuery({
    queryKey: ['flow-access', flowId],
    queryFn: () => api.get(`/flows/${flowId}/access`),
  });

  const grantAccess = useMutation({
    mutationFn: (data: GrantAccessInput) => api.post(`/flows/${flowId}/access`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flow-access', flowId] }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Flow</DialogTitle>
        </DialogHeader>

        {/* Current access records */}
        <div className="space-y-2">
          {accessRecords?.map(record => (
            <div key={record.id} className="flex items-center justify-between">
              <span>{record.userId || record.teamId}</span>
              <Badge>{record.permission}</Badge>
              <Button variant="ghost" size="sm" onClick={() => revokeAccess(record.id)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Grant new access */}
        <div className="flex gap-2">
          <Input placeholder="User or team ID" value={newUserId} onChange={...} />
          <Select value={permission} onValueChange={setPermission}>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </Select>
          <Button onClick={() => grantAccess.mutate({ userId: newUserId, permission })}>
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Flow Editor — Access Panel Tab

**Extension point:** `panelTabs[context='flowEditor']`

The RBAC plugin contributes a tab to the flow editor's right panel. Currently the right panel shows node config when a node is selected and tool config for agent tools. The plugin adds an "Access" tab.

```tsx
// FlowAccessPanel.tsx (plugin component)
export function FlowAccessPanel({ flowId }: PanelTabProps) {
  const api = useApiClient();
  const { data: accessRecords, isLoading } = useQuery({
    queryKey: ['flow-access', flowId],
    queryFn: () => api.get(`/flows/${flowId}/access`),
  });

  const { user } = useRbac();
  const myPermission = accessRecords?.find(r => r.userId === user?.id)?.permission;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Access Control</h3>
        {myPermission && <Badge variant="outline">{myPermission}</Badge>}
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="space-y-2">
          {accessRecords?.map(record => (
            <div key={record.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
              <Avatar className="w-6 h-6">
                <AvatarFallback>{(record.userId || record.teamId)?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{record.userId || record.teamId}</p>
              </div>
              <Badge variant="secondary" className="text-xs">{record.permission}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**How `FlowEditorV2` changes:**

The editor currently has a right panel that shows either `NodeConfigPanel` or `ToolConfigPanel`. Plugin tabs are added alongside these:

```tsx
// FlowEditorV2.tsx — right panel area
const registry = usePluginRegistry();
const editorPanelTabs = registry.panelTabs['flowEditor'] ?? [];

// In the right panel section:
<div className="flex flex-col h-full border-l border-border">
  {/* Tab bar — existing panels + plugin panels */}
  <div className="flex border-b border-border">
    {selectedNode && <TabButton active={activeTab === 'config'}>Config</TabButton>}
    {editorPanelTabs
      .filter(tab => !tab.permission || registry.checkPermission(tab.permission))
      .map(tab => (
        <TabButton key={tab.label} active={activeTab === tab.label}>
          {tab.icon && <tab.icon className="w-4 h-4 mr-1" />}
          {tab.label}
        </TabButton>
      ))}
  </div>

  {/* Tab content */}
  {activeTab === 'config' && selectedNode && <NodeConfigPanel ... />}
  {editorPanelTabs.map(tab =>
    activeTab === tab.label ? (
      <tab.component key={tab.label} flowId={flowId} basePath={basePath} />
    ) : null
  )}
</div>
```

### 5. Permission-Gated Editor Actions

**Extension point:** `checkPermission`

When the RBAC provider loads the user's permissions, it registers a `checkPermission` function. Components use `registry.checkPermission()` to gate actions:

| Action | Permission | Component | Behavior when denied |
|--------|-----------|-----------|---------------------|
| Edit flow name | `flow:update` | `FlowHeader` | `InlineEdit` becomes read-only |
| Save flow | `flow:update` | `FlowHeader` | Save button hidden |
| Run flow | `flow-run:create` | `FlowHeader` | Run button hidden |
| Delete flow | `flow:delete` | `FlowHeader` | Delete option hidden |
| Create flow | `flow:create` | `Home` | "New Flow" button hidden |
| Add/remove nodes | `flow:update` | `FlowEditorV2` | `nodesDraggable=false`, add button hidden |
| Edit node config | `flow:update` | `NodeConfigPanel` | Fields become read-only |
| Manage credentials | `credential:create` | `Credentials` | Create button hidden |

**Without RBAC plugin:** `checkPermission()` returns `true` for everything (default behavior). No plugin = no restrictions.

**With RBAC plugin:** `checkPermission()` reads from `RbacProvider` context, which caches the user's permissions from `GET /auth/me`.

---

## Changes Required in `@invect/frontend`

### New Files (plugin system infrastructure)

| File | Purpose | Size |
|------|---------|------|
| `types/plugin.types.ts` | `InvectFrontendPlugin` interface + contribution types | ~80 lines |
| `contexts/PluginRegistryContext.tsx` | `PluginRegistryProvider` + `usePluginRegistry()` hook | ~120 lines |
| `components/shared/PluginPagePlaceholder.tsx` | Fallback when componentId has no implementation | ~20 lines |

### Modified Files (wire up extension points)

| File | Change | Size |
|------|--------|------|
| `Invect.tsx` | Accept `plugins` prop, wrap with `PluginRegistryProvider`, add plugin routes | ~30 lines added |
| `components/side-menu/side-menu.tsx` | Read `sidebarItems` from registry, render plugin items + user section | ~20 lines added |
| `components/flow-editor-v2/FlowHeader.tsx` | Read `headerActions['flowHeader']` from registry, permission-gate built-in buttons | ~15 lines changed |
| `routes/home.tsx` | Read `headerActions['flowList']` from registry, permission-gate "New Flow" | ~10 lines added |
| `components/flow-editor-v2/FlowEditorV2.tsx` | Read `panelTabs['flowEditor']` from registry, render plugin tabs | ~20 lines added |
| `contexts/ApiContext.tsx` | Merge `apiHeaders` from registry into `ApiClient` constructor | ~10 lines changed |

**Total: ~3 new files (~220 lines), ~6 modified files (~105 lines added/changed).**

### Files NOT Changed

| File | Why |
|------|-----|
| `services/apiClient.ts` | No changes needed — `apiHeaders` are merged at the `ApiContext` level before the client is created |
| `stores/flowEditorStore.ts` | Zustand store is pure client state — no permission logic here |
| `contexts/NodeRegistryContext.tsx` | Node definitions are already dynamic — plugins don't need to touch this |
| `contexts/ValidationContext.tsx` | Validation is flow-definition-level, not permission-level |

---

## Backend Changes Required

### `@invect/core` (minimal)

1. **Add `ui` field to `InvectPlugin`** — optional `InvectPluginUIManifest`:

```typescript
// types/plugin.types.ts — add to InvectPlugin
interface InvectPlugin {
  // ... existing fields ...
  ui?: InvectPluginUIManifest;
}

interface InvectPluginUIManifest {
  sidebar?: PluginUISidebarItem[];
  pages?: PluginUIPage[];
  panelTabs?: PluginUIPanelTab[];
  headerActions?: PluginUIHeaderAction[];
}

// All fields are serializable — string icon names, string componentIds
// No React types, no runtime code
interface PluginUISidebarItem {
  label: string;
  icon: string;        // Lucide icon name as string
  path: string;
  permission?: string;
}

interface PluginUIPage {
  path: string;
  componentId: string;
  title?: string;
}

interface PluginUIPanelTab {
  context: string;
  label: string;
  componentId: string;
  permission?: string;
}

interface PluginUIHeaderAction {
  context: string;
  componentId: string;
  permission?: string;
}
```

2. **Add `getPluginUIManifests()` to `Invect`**:

```typescript
// invect-core.ts
getPluginUIManifests(): { plugins: Array<{ id: string } & InvectPluginUIManifest> } {
  return {
    plugins: this.plugins
      .filter(p => p.ui)
      .map(p => ({ id: p.id, ...p.ui! })),
  };
}
```

3. **Add endpoint in framework packages**:

```typescript
// Express router
router.get('/plugins/ui-manifest', (_req, res) => {
  res.json(core.getPluginUIManifests());
});
```

**Total backend change: ~40 lines across 3 files.**

---

## Comparison: With vs Without Plugin System

### Without Plugin System (status quo)

To add RBAC UI, you'd:
1. Modify `AppSideMenu` directly — add "Access Control" nav item
2. Modify `FlowHeader` directly — wire Share button, add permission checks
3. Modify `Home` directly — add owner badges, permission-gate buttons
4. Modify `FlowEditorV2` directly — add Access tab, permission-gate editing
5. Modify `ApiContext` directly — add auth token support
6. Add all RBAC components directly into `@invect/frontend`

**Problem:** RBAC becomes a non-removable part of the frontend. Users who don't need RBAC still ship all that code. Every RBAC change requires a new `@invect/frontend` release. Can't have different RBAC implementations.

### With Plugin System

The frontend core ships with ~220 lines of plugin infrastructure. RBAC is a separate package. Users opt in:

```tsx
// Without RBAC — no auth UI, no permission checks, no overhead
<Invect apiBaseUrl="..." />

// With RBAC — auth UI, permission checks, share modals, access panels
import { rbacUI } from '@invect/plugin-rbac/ui';
<Invect apiBaseUrl="..." plugins={[rbacUI]} />
```

---

## Open Questions

1. **Should `checkPermission` be sync or async?** Sync is simpler (reads from cached state). Async allows per-request checks but complicates component rendering.
   → **Recommendation: Sync.** The `RbacProvider` pre-fetches permissions. Components read from cache.

2. **Should plugin routes be lazy-loaded?** If a plugin contributes a page, should it use `React.lazy()` to avoid loading the component until the route is visited?
   → **Recommendation: Yes, but let the plugin decide.** The plugin can export `React.lazy(() => import('./AccessControlPage'))` as its component.

3. **Should the `GET /plugins/ui-manifest` endpoint exist even without backend plugins?** If yes, it returns `{ plugins: [] }`. If no, the frontend gracefully handles a 404.
   → **Recommendation: Always return the endpoint.** An empty response is cleaner than 404 handling.

4. **How do plugins access `@invect/frontend`'s UI components (Button, Badge, Dialog)?** Plugin components need to render consistent UI.
   → **Recommendation: Export UI primitives from `@invect/frontend/ui`.** This avoids plugins bundling their own shadcn copies. Add a `"./ui"` export to the frontend package.

5. **What about plugin-to-plugin communication?** E.g., an audit-log plugin wants to listen to RBAC events.
   → **Recommendation: Not in v1.** Plugins are independent. If needed later, add a simple event bus.

6. **Should the `providers` extension point have ordering guarantees?** E.g., "RbacProvider must wrap after AuthProvider".
   → **Recommendation: Array order = nesting order.** `plugins={[authPlugin, rbacPlugin]}` means AuthProvider wraps RbacProvider. Document this.
