# @invect/rbac

RBAC (Role-Based Access Control) plugin for Invect — adds flow sharing, permission management UI, and access control panels.

## Requirements

This plugin **requires** the `@invect/user-auth` plugin to be loaded for session resolution. RBAC handles *authorization* on top of the authentication layer that `@invect/user-auth` provides.

## Installation

```bash
pnpm add @invect/rbac
```

## Usage

### Backend

```typescript
import { userAuth } from '@invect/user-auth';
import { rbacPlugin } from '@invect/rbac';

app.use('/invect', createInvectRouter({
  databaseUrl: 'sqlite://...',
  auth: {
    enabled: true,
    useFlowAccessTable: true,
  },
  plugins: [
    userAuth({ auth }),  // Auth MUST be registered first
    rbacPlugin({
      useFlowAccessTable: true,
    }),
  ],
}));
```

### Frontend

```tsx
import { Invect } from '@invect/frontend';
import { rbacFrontendPlugin } from '@invect/rbac/ui';

function App() {
  return (
    <Invect
      apiBaseUrl="http://localhost:3000/invect"
      plugins={[rbacFrontendPlugin]}  // When plugin system is wired
    />
  );
}
```

### Using components directly (before plugin system is wired)

```tsx
import { RbacProvider, useRbac, ShareFlowModal, FlowAccessPanel } from '@invect/rbac/ui';
```

## What's Included

### Backend Plugin (`@invect/rbac`)
- Plugin endpoints for flow access management (namespaced under `/rbac/`)
- UI manifest endpoint (`GET /rbac/ui-manifest`)
- Authorization hooks for flow-level ACL enforcement
- Auth dependency checking (warns if `@invect/user-auth` is missing)

### Frontend Plugin (`@invect/rbac/ui`)
- **RbacProvider** — Context provider that fetches and caches user identity/permissions
- **useRbac()** — Hook for checking permissions in components
- **ShareButton** — Flow header action that opens the share modal
- **ShareFlowModal** — Modal for granting/revoking flow access
- **FlowAccessPanel** — Flow editor panel tab showing access records
- **AccessControlPage** — Admin page for viewing roles and permissions
- **UserMenuSection** — Sidebar component showing current user info

### Shared Types (`@invect/rbac/types`)
- `FlowAccessRecord`, `GrantFlowAccessRequest`, `FlowAccessPermission`
- `AuthMeResponse`, `RolePermissionEntry`
- Plugin UI manifest types

## Package Exports

| Entry Point | Import | Content |
|-------------|--------|---------|
| `@invect/rbac` | `import { rbacPlugin } from '@invect/rbac'` | Backend plugin (Node.js) |
| `@invect/rbac/ui` | `import { rbacFrontendPlugin } from '@invect/rbac/ui'` | Frontend plugin (Browser) |
| `@invect/rbac/types` | `import type { FlowAccessRecord } from '@invect/rbac/types'` | Shared types |

## Architecture

```
@invect/user-auth (authentication)
        │
        │ provides InvectIdentity via session resolution
        │
        ▼
@invect/rbac (authorization)
  ├── backend: hooks + endpoints
  │   └── delegates to core's FlowAccessService + AuthorizationService
  └── frontend: provider + components
      └── fetches /auth/me, renders access management UI
```
