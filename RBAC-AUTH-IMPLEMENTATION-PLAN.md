# RBAC + BYO Auth Implementation Plan for Invect

## Executive Summary

Invect needs a flexible authorization system that:
1. **Does NOT own user authentication** - Invect is embedded in host apps that have their own auth systems
2. **Does NOT store user/role data** - All identity information comes from the host app at request time
3. **Provides RBAC for Invect resources** - Flows, credentials, executions, etc.
4. **Integrates with any auth provider** - JWT, sessions, API keys, OAuth, etc.
5. **Works across all framework adapters** - Express, NestJS, Next.js

This follows the "BYO Auth" (Bring Your Own Authentication) pattern used by AdminJS, BullBoard, and similar embeddable packages.

### Key Design Decision: Zero Invect Auth Tables

Invect operates as a **stateless authorization layer**. It does not store:
- User records
- Role definitions
- Permission assignments
- Session data

All identity and role information is provided by the host app via the `resolveUser` callback at request time. This keeps Invect lightweight and avoids duplicating user management that already exists in the host application.

---

## Research Summary: Common BYO Auth Patterns

### Pattern 1: Auth Adapter Function (AdminJS, BullBoard)
```typescript
// Host app provides a function that resolves request → user
const invectRouter = createInvectRouter({
  // ...config
  auth: {
    resolveUser: async (req) => {
      // Host app's logic to extract user from request
      const token = req.headers.authorization?.split('Bearer ')[1];
      return myJwtService.verify(token); // Returns user or null
    },
  }
});
```

### Pattern 2: Auth Provider Class (Payload CMS)
```typescript
// Custom strategy class
class MyAuthProvider extends BaseAuthProvider {
  async authenticate({ headers, payload }) {
    const user = await payload.find({ collection: 'users', where: {...} });
    return { user };
  }
}
```

### Pattern 3: Middleware Injection (Express-style)
```typescript
// Host app applies their auth middleware before Invect routes
app.use('/invect', myAuthMiddleware, createInvectRouter(config));
// Invect reads `req.user` set by the middleware
```

### Pattern 4: Context Callback (NestJS Guards)
```typescript
InvectModule.forRoot({
  // ...config
  auth: {
    guard: MyAuthGuard, // NestJS guard class
    userExtractor: (ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
  }
})
```

---

## Recommended Architecture

### Core Principle: **Invect handles Authorization, Host App handles Authentication**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Host Application                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Authentication Layer (JWT, Sessions, OAuth, API Keys, etc.)         │   │
│  │  - Verifies credentials                                               │   │
│  │  - Sets req.user / context.user                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Invect Integration Layer (via resolveUser callback)              │   │
│  │  - Receives user from host app                                        │   │
│  │  - Maps to Invect identity                                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Invect Core                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Authorization Layer (RBAC)                                           │   │
│  │  - Role definitions (admin, editor, viewer, etc.)                     │   │
│  │  - Permission checks per resource type                                │   │
│  │  - Resource-level access control (e.g., specific flows)              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Business Logic (Services)                                            │   │
│  │  - Flow management                                                    │   │
│  │  - Execution orchestration                                            │   │
│  │  - Credentials management                                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### 1. Core Types (`pkg/core/src/types/auth.types.ts`)

```typescript
/**
 * Identity resolved from the host app's authentication system.
 * Invect doesn't care HOW you authenticated - just WHO you are.
 */
export interface InvectIdentity {
  /** Unique user identifier from host app (e.g., user ID, email, API key ID) */
  id: string;
  
  /** Optional display name */
  name?: string;
  
  /** 
   * Role within Invect (maps to permissions).
   * Host app can either:
   * 1. Provide a Invect role directly (if they store it)
   * 2. Use roleMapper in config to map their roles → Invect roles
   */
  role?: InvectRole;
  
  /**
   * Optional: Direct permission overrides (advanced use case).
   * Bypasses role-based permissions.
   */
  permissions?: InvectPermission[];
  
  /**
   * Optional: Resource-level access control.
   * E.g., user can only access specific flows.
   */
  resourceAccess?: {
    flows?: string[] | '*';      // Flow IDs or '*' for all
    credentials?: string[] | '*';
  };
  
  /** Any additional metadata from host app */
  metadata?: Record<string, unknown>;
}

/**
 * Built-in roles with predefined permission sets.
 * Users can define custom roles via config.
 */
export type InvectRole = 
  | 'admin'      // Full access
  | 'editor'     // Create/edit flows, run executions
  | 'operator'   // Run executions, view flows (no edit)
  | 'viewer'     // Read-only access
  | string;      // Custom roles

/**
 * Granular permissions for Invect resources.
 */
export type InvectPermission =
  // Flow permissions
  | 'flow:create'
  | 'flow:read'
  | 'flow:update'
  | 'flow:delete'
  | 'flow:publish'        // Set live version
  // Flow version permissions
  | 'flow-version:create'
  | 'flow-version:read'
  // Execution permissions
  | 'flow-run:create'     // Start executions
  | 'flow-run:read'
  | 'flow-run:cancel'
  // Credential permissions
  | 'credential:create'
  | 'credential:read'
  | 'credential:update'
  | 'credential:delete'
  // Agent/tool permissions
  | 'agent-tool:read'
  | 'agent-tool:configure'
  // Node testing
  | 'node:test'           // Test individual nodes
  // Admin permissions
  | 'admin:*';            // All permissions

/**
 * Request context provided to authorization checks.
 */
export interface AuthorizationContext {
  identity: InvectIdentity | null;
  /** The resource being accessed (if applicable) */
  resource?: {
    type: 'flow' | 'flow-version' | 'flow-run' | 'credential' | 'agent-tool';
    id?: string;
  };
  /** The action being performed */
  action: InvectPermission;
}

/**
 * Result of an authorization check.
 */
export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}
```

### 2. Auth Configuration (`pkg/core/src/types/schemas-fresh/invect-config.ts`)

```typescript
import { z } from 'zod';

/**
 * Authentication/Authorization configuration for Invect.
 */
export const InvectAuthConfigSchema = z.object({
  /**
   * Enable authentication requirement. 
   * When false, all requests are allowed (development mode).
   * Default: true in production, false otherwise
   */
  enabled: z.boolean().optional(),
  
  /**
   * Function to resolve user identity from incoming request.
   * This is where the host app plugs in their auth system.
   * 
   * @example Express: (req) => req.user
   * @example NestJS: Provided via guard/decorator
   * @example Next.js: (req) => getSession(req)
   */
  resolveUser: z.function()
    .args(z.any()) // Request object (varies by framework)
    .returns(z.promise(z.union([InvectIdentitySchema, z.null()])))
    .optional(),
  
  /**
   * Map host app roles to Invect roles.
   * Useful when host app has different role names.
   * 
   * @example { 'super_admin': 'admin', 'content_editor': 'editor' }
   */
  roleMapper: z.record(z.string(), z.string()).optional(),
  
  /**
   * Define custom roles with specific permissions.
   * Extends built-in roles (admin, editor, operator, viewer).
   */
  customRoles: z.record(z.string(), z.array(z.string())).optional(),
  
  /**
   * Callback for custom authorization logic.
   * Called after standard RBAC checks.
   * Return true to allow, false to deny, undefined to use default.
   */
  customAuthorize: z.function()
    .args(AuthorizationContextSchema)
    .returns(z.promise(z.union([z.boolean(), z.undefined()])))
    .optional(),
  
  /**
   * Allow unauthenticated access to specific routes.
   * E.g., health checks, public flow execution endpoints.
   */
  publicRoutes: z.array(z.string()).optional(),
  
  /**
   * Behavior when auth fails.
   */
  onAuthFailure: z.enum(['throw', 'log', 'ignore']).default('throw'),
});

export type InvectAuthConfig = z.infer<typeof InvectAuthConfigSchema>;
```

### 3. Authorization Service (`pkg/core/src/services/auth/authorization.service.ts`)

```typescript
import { InvectIdentity, InvectPermission, AuthorizationContext, AuthorizationResult } from '../../types/auth.types';
import { InvectAuthConfig } from '../../types/schemas-fresh/invect-config';

/**
 * Default role → permissions mapping.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<string, InvectPermission[]> = {
  admin: ['admin:*'],
  editor: [
    'flow:create', 'flow:read', 'flow:update', 'flow:delete', 'flow:publish',
    'flow-version:create', 'flow-version:read',
    'flow-run:create', 'flow-run:read', 'flow-run:cancel',
    'credential:create', 'credential:read', 'credential:update', 'credential:delete',
    'agent-tool:read', 'agent-tool:configure',
    'node:test',
  ],
  operator: [
    'flow:read',
    'flow-version:read',
    'flow-run:create', 'flow-run:read', 'flow-run:cancel',
    'credential:read',
    'agent-tool:read',
    'node:test',
  ],
  viewer: [
    'flow:read',
    'flow-version:read',
    'flow-run:read',
    'credential:read',
    'agent-tool:read',
  ],
};

export class AuthorizationService {
  private rolePermissions: Record<string, InvectPermission[]>;

  constructor(private config: InvectAuthConfig) {
    // Merge default roles with custom roles
    this.rolePermissions = {
      ...DEFAULT_ROLE_PERMISSIONS,
      ...(config.customRoles || {}),
    };
  }

  /**
   * Check if identity has required permission.
   */
  async authorize(context: AuthorizationContext): Promise<AuthorizationResult> {
    const { identity, action, resource } = context;

    // If auth is disabled, allow everything
    if (this.config.enabled === false) {
      return { allowed: true };
    }

    // No identity = not authenticated
    if (!identity) {
      return { 
        allowed: false, 
        reason: 'Authentication required' 
      };
    }

    // Check direct permission overrides first
    if (identity.permissions?.includes(action) || identity.permissions?.includes('admin:*')) {
      return { allowed: true };
    }

    // Check role-based permissions
    const role = this.resolveRole(identity);
    const permissions = this.rolePermissions[role] || [];
    
    if (permissions.includes('admin:*') || permissions.includes(action)) {
      // Check resource-level access if applicable
      if (resource?.id && identity.resourceAccess) {
        const resourceAllowed = this.checkResourceAccess(identity, resource);
        if (!resourceAllowed) {
          return { 
            allowed: false, 
            reason: `No access to ${resource.type} ${resource.id}` 
          };
        }
      }
      return { allowed: true };
    }

    // Custom authorization callback
    if (this.config.customAuthorize) {
      const customResult = await this.config.customAuthorize(context);
      if (customResult !== undefined) {
        return { allowed: customResult };
      }
    }

    return { 
      allowed: false, 
      reason: `Permission '${action}' required` 
    };
  }

  /**
   * Map host app role to Invect role.
   */
  private resolveRole(identity: InvectIdentity): string {
    if (!identity.role) return 'viewer'; // Default role
    
    if (this.config.roleMapper && this.config.roleMapper[identity.role]) {
      return this.config.roleMapper[identity.role];
    }
    
    return identity.role;
  }

  /**
   * Check resource-level access control.
   */
  private checkResourceAccess(
    identity: InvectIdentity, 
    resource: { type: string; id?: string }
  ): boolean {
    if (!identity.resourceAccess || !resource.id) return true;

    const accessList = identity.resourceAccess[resource.type as keyof typeof identity.resourceAccess];
    if (!accessList) return true; // No restrictions for this resource type
    if (accessList === '*') return true;
    
    return accessList.includes(resource.id);
  }

  /**
   * Get all permissions for an identity.
   */
  getPermissions(identity: InvectIdentity | null): InvectPermission[] {
    if (!identity) return [];
    
    const role = this.resolveRole(identity);
    const rolePerms = this.rolePermissions[role] || [];
    const directPerms = identity.permissions || [];
    
    return [...new Set([...rolePerms, ...directPerms])];
  }
}
```

### 4. Express Integration (`pkg/express/src/invect-router.ts`)

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { Invect, InvectConfig, InvectIdentity } from '@invect/core';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      invectIdentity?: InvectIdentity | null;
    }
  }
}

export function createInvectRouter(config: InvectConfig): Router {
  const core = new Invect(config);
  const router = Router();

  // Auth middleware - resolves identity and attaches to request
  router.use(async (req: Request, res: Response, next: NextFunction) => {
    // Skip auth if disabled
    if (config.auth?.enabled === false) {
      req.invectIdentity = null;
      return next();
    }

    // Check for public routes
    if (config.auth?.publicRoutes?.some(route => req.path.startsWith(route))) {
      req.invectIdentity = null;
      return next();
    }

    try {
      // Use host app's resolveUser function
      if (config.auth?.resolveUser) {
        req.invectIdentity = await config.auth.resolveUser(req);
      } else {
        // Fallback: try to read from common patterns
        req.invectIdentity = (req as any).user || null;
      }
      next();
    } catch (error) {
      if (config.auth?.onAuthFailure === 'throw') {
        return res.status(401).json({ error: 'Authentication failed' });
      }
      req.invectIdentity = null;
      next();
    }
  });

  // Example protected route with authorization
  router.post('/flows', asyncHandler(async (req: Request, res: Response) => {
    // Authorization check
    const authResult = await core.authorize({
      identity: req.invectIdentity,
      action: 'flow:create',
    });
    
    if (!authResult.allowed) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: authResult.reason 
      });
    }

    // Proceed with operation, passing identity for audit trail
    const flow = await core.createFlow(req.body, { 
      createdBy: req.invectIdentity?.id 
    });
    res.status(201).json(flow);
  }));

  // ... rest of routes
  return router;
}
```

### 5. NestJS Integration (`pkg/nestjs/src/auth/`)

```typescript
// invect-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Invect } from '@invect/core';

export const INVECT_PERMISSION_KEY = 'invect:permission';

// Decorator for marking required permissions
export const RequirePermission = (permission: string) => 
  SetMetadata(INVECT_PERMISSION_KEY, permission);

@Injectable()
export class InvectAuthGuard implements CanActivate {
  constructor(
    @Inject('INVECT_CORE') private core: Invect,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(
      INVECT_PERMISSION_KEY, 
      context.getHandler()
    );
    
    if (!permission) return true; // No permission required

    const request = context.switchToHttp().getRequest();
    const identity = request.invectIdentity || request.user;

    const result = await this.core.authorize({
      identity,
      action: permission as any,
    });

    return result.allowed;
  }
}

// Usage in controller
@Controller('invect')
@UseGuards(InvectAuthGuard)
export class InvectController {
  @Post('flows')
  @RequirePermission('flow:create')
  async createFlow(@Body() body: any, @Req() req: any) {
    return this.core.createFlow(body, { createdBy: req.user?.id });
  }
}
```

### 6. Next.js Integration (`pkg/nextjs/src/auth/`)

```typescript
// invect-auth.ts
import { Invect, InvectIdentity } from '@invect/core';
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth'; // Example with NextAuth

let core: Invect | null = null;

/**
 * Get Invect identity from Next.js request context.
 * Users can override this by providing their own resolveUser.
 */
export async function getInvectIdentity(): Promise<InvectIdentity | null> {
  // Example: Using NextAuth
  const session = await getServerSession();
  if (!session?.user) return null;
  
  return {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role, // Assuming role is in session
  };
}

/**
 * Higher-order function to protect server actions.
 */
export function withInvectAuth<T extends any[], R>(
  permission: string,
  action: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    'use server';
    
    const identity = await getInvectIdentity();
    const result = await getCore().authorize({
      identity,
      action: permission as any,
    });

    if (!result.allowed) {
      throw new Error(`Forbidden: ${result.reason}`);
    }

    return action(...args);
  };
}

// Usage
export const createFlow = withInvectAuth('flow:create', async (data) => {
  const identity = await getInvectIdentity();
  return getCore().createFlow(data, { createdBy: identity?.id });
});
```

---

## Database Schema: Zero Auth Tables

Invect does **not** create any database tables for authentication or authorization. All identity information is resolved at request time from the host app.

### What Invect Does NOT Store

| Data | Responsibility |
|------|----------------|
| User accounts | Host app |
| Passwords/credentials | Host app |
| Sessions/tokens | Host app |
| Role assignments | Host app |
| Permission mappings | Host app (or use Invect defaults) |
| Audit logs | Host app (Invect emits events) |

### What Invect DOES Store (existing tables)

The existing `createdBy` fields on `flowVersions` and `flowRuns` tables will store the `identity.id` value for audit trail purposes. This is just a string reference - Invect doesn't join to any user table.

```typescript
// Existing schema - no changes needed
export const flowVersions = pgTable("flow_versions", {
  // ...
  createdBy: text("created_by"), // Stores identity.id from resolveUser
});

export const flowRuns = pgTable("flow_executions", {
  // ...
  createdBy: text("created_by"), // Stores identity.id from resolveUser
});
```

### Host App Responsibilities

The host app is responsible for:

1. **User Storage** - Maintain user accounts in their own database
2. **Authentication** - Verify credentials (JWT, sessions, OAuth, etc.)
3. **Role Assignment** - Store which Invect role each user has
4. **Permission Mapping** - Optionally extend/customize permissions
5. **Audit Logging** - Subscribe to Invect events for audit trails

---

## Host App Integration Guide

### How to Store Invect Roles in Your App

Add a `invectRole` field to your existing users table:

```typescript
// Example: Prisma schema
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  // ... your other fields
  
  // Invect integration
  invectRole String   @default("viewer") // "admin" | "editor" | "operator" | "viewer"
}

// Example: Drizzle schema
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  // ... your other fields
  
  // Invect integration
  invectRole: text("invect_role").notNull().default("viewer"),
});
```

### Mapping Your Existing Roles

If you already have roles in your app, use `roleMapper` to map them:

```typescript
// Your app has: "superadmin", "manager", "staff", "guest"
// Map to Invect roles:

createInvectRouter({
  auth: {
    roleMapper: {
      'superadmin': 'admin',
      'manager': 'editor',
      'staff': 'operator', 
      'guest': 'viewer',
    },
    resolveUser: async (req) => ({
      id: req.user.id,
      role: req.user.role, // Your app's role - will be mapped automatically
    }),
  },
});
```

### Resource-Level Access Control

For fine-grained access (e.g., users can only see their own flows), compute `resourceAccess` in your `resolveUser`:

```typescript
// Host app database schema
model FlowAccess {
  id       String @id
  userId   String
  flowId   String
  canEdit  Boolean @default(false)
}

// resolveUser implementation
resolveUser: async (req) => {
  const user = req.user;
  if (!user) return null;
  
  // Query your database for this user's flow access
  const flowAccess = await prisma.flowAccess.findMany({
    where: { userId: user.id },
  });
  
  return {
    id: user.id,
    name: user.name,
    role: user.invectRole,
    resourceAccess: {
      flows: flowAccess.map(fa => fa.flowId),
      credentials: '*', // Or specific credential IDs
    },
  };
},
```

### Request Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              HTTP Request                                     │
│  POST /invect/flows  { name: "My Flow" }                                  │
│  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Host App Auth Middleware                              │
│  1. Extract JWT from Authorization header                                     │
│  2. Verify signature, check expiry                                           │
│  3. Decode payload → { sub: "user_123", role: "manager" }                    │
│  4. Attach to request: req.user = { id: "user_123", role: "manager" }        │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Invect resolveUser                                 │
│  config.auth.resolveUser(req) → InvectIdentity                            │
│  {                                                                            │
│    id: "user_123",                                                           │
│    role: "manager",        // Will be mapped to "editor" via roleMapper      │
│    resourceAccess: { flows: ["flow_1", "flow_2"] }                           │
│  }                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Invect Authorization                               │
│  1. Map role "manager" → "editor" (via roleMapper)                           │
│  2. Check: Does "editor" have "flow:create" permission? ✅ YES               │
│  3. (No resource ID check needed for create)                                  │
│  4. Result: { allowed: true }                                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Invect Business Logic                              │
│  flowService.createFlow({ name: "My Flow" }, { createdBy: "user_123" })      │
│  → Stores "user_123" in createdBy field                                       │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              HTTP Response                                    │
│  201 Created                                                                  │
│  { id: "flow_abc", name: "My Flow", createdBy: "user_123", ... }             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Event Emission for Audit Logging

Invect emits events that the host app can subscribe to for audit logging:

```typescript
// Host app subscribes to Invect events
const core = new Invect(config);

core.on('auth:authorized', (event) => {
  // event: { identity, action, resource, allowed: true }
  auditLogger.info('Invect access granted', event);
});

core.on('auth:forbidden', (event) => {
  // event: { identity, action, resource, allowed: false, reason }
  auditLogger.warn('Invect access denied', event);
});

core.on('flow:created', (event) => {
  // event: { flow, identity }
  auditLogger.info('Flow created', event);
});
```

---

## Implementation Phases

### Phase 1: Core Authorization Infrastructure ✅ COMPLETE
1. ✅ Define auth types (`InvectIdentity`, `InvectPermission`, etc.) in `pkg/core/src/types/auth.types.ts`
2. ✅ Add `auth` config to `InvectConfigSchema`
3. ✅ Implement `AuthorizationService` with default role→permission mappings
4. ✅ Add `authorize()` method to `Invect` core class
5. ✅ Add auth event emitter for host app to hook into (audit logging, etc.)
6. ✅ Unit tests for authorization logic (29 tests passing)

**Files created/modified:**
- `pkg/core/src/types/auth.types.ts` - All auth type definitions
- `pkg/core/src/types/schemas-fresh/invect-config.ts` - Auth config schema
- `pkg/core/src/services/auth/authorization.service.ts` - Authorization service
- `pkg/core/src/services/auth/index.ts` - Service exports
- `pkg/core/src/invect-core.ts` - Auth API methods
- `pkg/core/src/index.ts` - Public exports
- `pkg/core/tests/unit/auth/authorization.service.test.ts` - Unit tests

### Phase 2: Express Integration ✅ COMPLETE
1. ✅ Add auth middleware to router that calls `resolveUser`
2. ✅ Add authorization checks to key routes (flows, flow-runs, credentials)
3. ✅ Update error handling for 401/403 responses
4. ✅ Pass `identity.id` to `createdBy` fields on mutations
5. ⏳ Integration tests (pending)

**Files modified:**
- `pkg/express/src/invect-router.ts` - Auth middleware, permission checks, auth info routes

**New endpoints:**
- `GET /auth/me` - Get current user identity and permissions
- `GET /auth/roles` - Get available roles

### Phase 2.5: Invect-Managed Flow Access ✅ COMPLETE
Added optional `flow_access` database table for Invect-managed flow permissions.
When `auth.useFlowAccessTable: true`:
- Invect stores flow access records in its own database
- Supports user-level and team-level access
- Host app just provides userId and teamIds in resolveUser
- Three permission levels: owner, editor, viewer

**Files created/modified:**
- `pkg/core/src/database/schema-sqlite.ts` - Added `flowAccess` table
- `pkg/core/src/database/schema-postgres.ts` - Added `flowAccess` table  
- `pkg/core/src/database/schema-mysql.ts` - Added `flowAccess` table
- `pkg/core/src/services/auth/flow-access.service.ts` - Flow access CRUD
- `pkg/core/src/services/service-factory.ts` - Added FlowAccessService
- `pkg/core/src/invect-core.ts` - Added flow access API methods
- `pkg/express/src/invect-router.ts` - Added flow access routes

**New endpoints:**
- `GET /flows/:flowId/access` - List access records for a flow
- `POST /flows/:flowId/access` - Grant access to user/team
- `DELETE /flows/:flowId/access/:accessId` - Revoke access
- `GET /flows/accessible` - Get flow IDs current user can access

**New Invect API methods:**
- `grantFlowAccess()` - Grant access to a flow
- `revokeFlowAccess()` - Revoke a specific access record
- `revokeFlowAccessForUserOrTeam()` - Revoke all access for user/team
- `listFlowAccess()` - List access records for a flow
- `getAccessibleFlowIds()` - Get all accessible flow IDs
- `hasFlowAccess()` - Check if user has access
- `getFlowPermission()` - Get user's permission level

### Phase 3: NestJS Integration
1. Create `InvectAuthGuard`
2. Create `@RequirePermission()` decorator
3. Update controller with permission decorators
4. Support custom guard injection via module config
5. Integration tests

### Phase 4: Next.js Integration
1. Create auth utilities for server actions
2. Create `withInvectAuth` HOF for protected actions
3. Update server actions with auth
4. API route auth handling
5. Integration tests

### Phase 5: Frontend Integration
1. Auth context provider in `pkg/frontend` (receives identity from host)
2. `useInvectPermissions()` hook for checking permissions
3. `<RequirePermission>` component for conditional rendering
4. API client passes auth headers from host app
5. Permission-aware UI (disable buttons, hide elements, etc.)

---

## Invect-Managed Flow Access (useFlowAccessTable)

When `auth.useFlowAccessTable: true`, Invect manages flow permissions internally using the `flow_access` table.

### Configuration

```typescript
createInvectRouter({
  // ... database config
  auth: {
    enabled: true,
    useFlowAccessTable: true,  // Enable Invect-managed flow permissions
    resolveUser: async (req) => ({
      id: req.user.id,
      name: req.user.name,
      role: 'editor',  // Base role for permissions
      teamIds: req.user.teams?.map(t => t.id) || [],  // Team memberships
    }),
  },
});
```

### Database Schema

```sql
CREATE TABLE flow_access (
  id UUID PRIMARY KEY,
  flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  user_id TEXT,        -- Either user_id OR team_id, not both
  team_id TEXT,
  permission TEXT NOT NULL DEFAULT 'viewer',  -- 'owner' | 'editor' | 'viewer'
  granted_by TEXT,
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP  -- Optional expiration
);
```

### Permission Levels

| Level | Can View | Can Edit | Can Delete | Can Share |
|-------|----------|----------|------------|-----------|
| viewer | ✅ | ❌ | ❌ | ❌ |
| editor | ✅ | ✅ | ❌ | ❌ |
| owner | ✅ | ✅ | ✅ | ✅ |

### API Usage

```typescript
// Grant access
await invect.grantFlowAccess({
  flowId: 'flow_123',
  userId: 'user_456',      // OR teamId: 'team_abc'
  permission: 'editor',
  grantedBy: currentUser.id,
  expiresAt: '2025-12-31',  // Optional
});

// List access
const access = await invect.listFlowAccess('flow_123');
// [{ id, flowId, userId, teamId, permission, grantedBy, grantedAt, expiresAt }]

// Check access
const canEdit = await invect.hasFlowAccess('flow_123', userId, teamIds, 'editor');

// Get accessible flows for a user
const flowIds = await invect.getAccessibleFlowIds(userId, teamIds);

// Revoke access
await invect.revokeFlowAccess(accessId);
```

### Access Check Flow

```
Request: PUT /flows/:flowId { ... }
           │
           ▼
┌─────────────────────────────┐
│  Resolve Identity           │
│  (userId, teamIds, role)    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Check flow_access table    │
│  for user_id OR team_ids    │
│  with permission >= editor  │
└──────────────┬──────────────┘
               │
      ┌────────┴────────┐
      │                 │
   Found?            Not Found
      │                 │
      ▼                 ▼
┌───────────┐    ┌───────────────┐
│ Check role│    │ 403 Forbidden │
│ permission│    │ No flow access│
└─────┬─────┘    └───────────────┘
      │
      ▼
┌───────────────────────────────┐
│ Role has 'flow:update'?       │
│ (editor, admin roles do)      │
└──────────────┬────────────────┘
               │
      ┌────────┴────────┐
      │                 │
     Yes               No
      │                 │
      ▼                 ▼
┌───────────┐    ┌───────────────┐
│ 200 OK    │    │ 403 Forbidden │
│ Proceed   │    │ No permission │
└───────────┘    └───────────────┘
```

---

## Usage Examples

### Example 1: Express with JWT Auth
```typescript
import express from 'express';
import jwt from 'jsonwebtoken';
import { createInvectRouter } from '@invect/express';

const app = express();

app.use('/invect', createInvectRouter({
  // ... database config
  auth: {
    enabled: true,
    resolveUser: async (req) => {
      const token = req.headers.authorization?.split('Bearer ')[1];
      if (!token) return null;
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
          id: decoded.sub,
          name: decoded.name,
          role: decoded.invectRole || 'viewer',
        };
      } catch {
        return null;
      }
    },
    roleMapper: {
      'super_admin': 'admin',
      'content_manager': 'editor',
    },
  },
}));
```

### Example 2: NestJS with Passport
```typescript
// app.module.ts
@Module({
  imports: [
    AuthModule, // Your auth module with Passport
    InvectModule.forRootAsync({
      inject: [AuthService],
      useFactory: (authService: AuthService) => ({
        // ... database config
        auth: {
          enabled: true,
          resolveUser: async (req) => {
            // Request already has user from Passport middleware
            return req.user ? {
              id: req.user.id,
              role: req.user.role,
            } : null;
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

### Example 3: Next.js with NextAuth
```typescript
// app/api/invect/[...path]/route.ts
import { getServerSession } from 'next-auth';
import { createInvectHandler } from '@invect/nextjs';

const handler = createInvectHandler({
  // ... database config
  auth: {
    enabled: true,
    resolveUser: async () => {
      const session = await getServerSession();
      if (!session?.user) return null;
      
      return {
        id: session.user.id,
        name: session.user.name,
        role: session.user.role,
      };
    },
  },
});

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

### Example 4: Resource-Level Access Control
```typescript
// User can only access specific flows they created or were granted access to
const invectRouter = createInvectRouter({
  auth: {
    resolveUser: async (req) => {
      const user = await getUserFromToken(req);
      if (!user) return null;
      
      // Fetch user's flow access from your database
      const accessibleFlows = await db.flowAccess.findMany({
        where: { userId: user.id },
        select: { flowId: true },
      });
      
      return {
        id: user.id,
        role: user.role,
        resourceAccess: {
          flows: accessibleFlows.map(a => a.flowId),
          credentials: '*', // All credentials
        },
      };
    },
  },
});
```

### Example 5: Development Mode (Auth Disabled)
```typescript
const invectRouter = createInvectRouter({
  auth: {
    enabled: process.env.NODE_ENV !== 'production' ? false : true,
  },
});
```

---

## Security Considerations

1. **Invect trusts the resolved identity** - The host app is responsible for verifying credentials; Invect assumes `resolveUser` returns a legitimate user
2. **Never trust client-side role claims** - Always resolve identity on the server via `resolveUser`
3. **Credential encryption** - Credentials remain encrypted; auth controls who can access them
4. **Audit logging is host app's responsibility** - Invect emits events; host app should log them
5. **Rate limiting** - Host app should implement rate limits; Invect can optionally include `identity.id` in rate limit keys
6. **Token validation** - Host app is responsible for token expiry, revocation, etc.
7. **HTTPS requirement** - Document that HTTPS is required in production
8. **No session state** - Invect is stateless; each request must include auth info

---

## Open Questions

1. **Multi-tenancy**: Should Invect support workspace/organization-level isolation? (Would be implemented via `resourceAccess` in identity, not DB tables)
2. **Default role**: What should the default role be for authenticated users without explicit role? (Currently: `viewer`)
3. **Permission inheritance**: Should flows inherit permissions from parent folders/tags? (Would be resolved in host app's `resolveUser`)
4. **Auth events**: What events should Invect emit for host app audit logging?
   - `auth:success`, `auth:failure`, `auth:forbidden`?
5. **Anonymous access**: Should certain operations (e.g., webhook triggers) support anonymous/system identity?

---

## Alternatives Considered

### 1. Using CASL for Authorization
**Pros**: Powerful ABAC library, good TypeScript support, database query integration
**Cons**: Additional dependency, learning curve, may be overkill for initial implementation

**Decision**: Start with simple RBAC. Can integrate CASL later if attribute-based requirements grow.

### 2. Full User Management in Invect (Option A in original plan)
**Pros**: Self-contained, no integration needed, good for standalone deployments
**Cons**: Duplicates functionality of host app, security risk, more complexity

**Decision**: Rejected. Invect should stay lightweight and delegate identity to host app.

### 3. OAuth2/OIDC Native Support
**Pros**: Standardized, supports many providers
**Cons**: Complex, requires redirect handling, not needed if host app already has auth

**Decision**: Rejected. Host app handles OAuth; Invect receives the resolved identity.

### 4. API Key System in Invect
**Pros**: Useful for programmatic access, CI/CD pipelines
**Cons**: Adds database tables, duplicates what host app might provide

**Decision**: Rejected for now. Host app can include API key ID in `resolveUser`. Revisit if there's strong demand.

---

## References

- [AdminJS Authentication](https://docs.adminjs.co/basics/authentication)
- [Payload CMS Custom Strategies](https://payloadcms.com/docs/authentication/custom-strategies)
- [CASL Authorization Library](https://casl.js.org/v6/en/guide/intro)
- [Directus Event Hooks](https://directus.io/docs/guides/extensions/api-extensions/hooks)
