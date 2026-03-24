# Invect Plugin System — Implementation Plan

> A composable plugin system inspired by better-auth. Plugins declare actions, hooks, endpoints, and database schema using an abstract format. A CLI (`npx invect`) generates Drizzle schema files and runs migrations — merging core + plugin tables automatically.

---

## Current State (What's Already Built)

The foundational "plumbing" is fully implemented. The remaining work is **wiring** — connecting the built infrastructure into the execution engine and framework adapters, then validating end-to-end with a reference plugin.

| Layer | Status | File(s) |
|-------|--------|---------|
| Plugin type system | ✅ Done | `pkg/core/src/types/plugin.types.ts` (644 lines) |
| Plugin manager + hook runners | ✅ Done | `pkg/core/src/services/plugin-manager.ts` (325 lines) |
| Core `Invect` integration | ✅ Done | `pkg/core/src/invect-core.ts` — creates `PluginManager`, calls `initializePlugins()` |
| Config schema (`plugins` field) | ✅ Done | `pkg/core/src/invect-config.ts` |
| Abstract schema types | ✅ Done | `PluginFieldAttribute`, `InvectPluginSchema` in plugin.types.ts |
| Core tables in abstract format | ✅ Done | `pkg/core/src/database/core-schema.ts` (CORE_SCHEMA constant) |
| Schema merger | ✅ Done | `pkg/core/src/database/schema-merger.ts` — `mergeSchemas()`, `diffSchemas()` |
| Schema generators (3 dialects) | ✅ Done | `pkg/core/src/database/schema-generator.ts` — SQLite/PG/MySQL |
| CLI `init` command | ✅ Done | `pkg/cli/src/commands/init.ts` — interactive project scaffolding |
| CLI `generate` command | ✅ Done | `pkg/cli/src/commands/generate.ts` — loads config → merge → write schema files |
| CLI `migrate` command | ✅ Done | `pkg/cli/src/commands/migrate.ts` — wraps drizzle-kit |
| CLI config loader (jiti) | ✅ Done | `pkg/cli/src/utils/config-loader.ts` |
| Core exports | ✅ Done | All plugin types + schema utilities exported from `pkg/core/src/index.ts` |
| **Express plugin endpoints** | ❌ Missing | `pkg/express/src/invect-router.ts` doesn't mount `getPluginEndpoints()` |
| **Express plugin hooks** | ❌ Missing | Router doesn't execute `onRequest`/`onResponse` hooks |
| **NestJS adapter wiring** | ❌ Missing | `pkg/nestjs/` has no plugin integration |
| **Next.js adapter wiring** | ❌ Missing | `pkg/nextjs/` has no plugin integration |
| **Flow execution hooks** | ❌ Missing | `FlowOrchestrationService`/`FlowRunCoordinator` don't call `beforeFlowRun`/`afterFlowRun` |
| **Node execution hooks** | ❌ Missing | `NodeExecutionCoordinator` doesn't call `beforeNodeExecute`/`afterNodeExecute` |
| **Reference plugin** | ❌ Missing | No `@invect/plugin-rbac` or any real plugin package |
| **Plugin tests** | ❌ Missing | No unit/integration tests for the plugin system |
| **Runtime schema validation** | ❌ Missing | No DB introspection during `Invect.initialize()` |
| **CLI `schema:diff` command** | ❌ Missing | Preview-only command not yet created |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      User's invect.config.ts                     │
│  export default defineConfig({                                    │
│    databaseUrl: '...',                                            │
│    plugins: [rbac(), auditLog(), customPlugin()],                 │
│  })                                                               │
└───────────────────────────────┬──────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │  CLI Layer   │   │  Core Layer  │   │  Adapter Layer│
    │              │   │              │   │               │
    │ npx invect  │   │ Invect class│   │ Express/Nest/ │
    │  generate    │   │ .initialize()│   │ Next.js       │
    │  migrate     │   │              │   │               │
    │  schema:diff │   │ PluginManager│   │ Plugin        │
    └──────┬───────┘   │ HookRunner   │   │ endpoints +   │
           │           │              │   │ hooks mounted  │
           ▼           └──────────────┘   └───────────────┘
    ┌──────────────┐
    │ Schema Layer │
    │              │
    │ CORE_SCHEMA  │
    │ + plugin     │
    │   schemas    │
    │     ↓        │
    │ mergeSchemas │
    │     ↓        │
    │ generate*()  │
    │     ↓        │
    │ schema-*.ts  │  ← Generated Drizzle files (replace hand-written)
    │     ↓        │
    │ drizzle-kit  │
    │  generate    │
    └──────────────┘
```

### Plugin Composition

```typescript
// Example: a plugin that adds audit logging
import { defineAction } from '@invect/core';

export function auditLog(opts?: { destination: 'database' | 'console' }): InvectPlugin {
  return {
    id: 'audit-log',
    name: 'Audit Log',

    // Abstract schema — generates Drizzle tables via CLI
    schema: {
      auditLogs: {
        fields: {
          id:        { type: 'uuid', primaryKey: true, defaultValue: 'uuid()' },
          action:    { type: 'string', required: true, index: true },
          userId:    { type: 'string' },
          flowId:    { type: 'string', references: { table: 'flows', field: 'id' } },
          metadata:  { type: 'json' },
          createdAt: { type: 'date', defaultValue: 'now()' },
        },
      },
    },

    // Lifecycle hooks
    hooks: {
      afterFlowRun: async (ctx) => {
        // Write audit record...
      },
    },

    // Custom API endpoints
    endpoints: [{
      method: 'GET',
      path: '/audit-log/entries',
      handler: async (ctx) => ({ body: { entries: [] } }),
    }],
  };
}
```

---

## Implementation Steps

### Step 1 — Wire Plugin Hooks into Flow Execution Engine

**Goal**: `PluginManager` hook runners are already built — they just need to be called at the right points in the execution pipeline.

**Files to modify**:

#### 1a. Thread `PluginManager` into execution services

The `Invect` class already holds a `PluginManager` instance. Pass it (or its `PluginHookRunner` interface) into the services that need it:

- `FlowOrchestrationService` — receives hook runner
- `FlowRunCoordinator` — receives hook runner
- `NodeExecutionCoordinator` — receives hook runner

This likely means updating `ServiceFactory` (or wherever these services are constructed) to inject the `PluginManager`.

#### 1b. Call `beforeFlowRun` / `afterFlowRun` in `FlowRunCoordinator`

In `FlowRunCoordinator.executeFlowRun()` (or the equivalent top-level method):

```typescript
// Before execution starts
const hookResult = await this.hookRunner.runBeforeFlowRun({
  flowId, flowRunId, flowVersion, inputs, identity
});
if (hookResult.cancelled) {
  // Mark flow run as CANCELLED with reason, return early
  return { status: 'CANCELLED', reason: hookResult.reason };
}
// Use potentially modified inputs
const resolvedInputs = hookResult.inputs ?? inputs;

// ... existing execution logic using resolvedInputs ...

// After execution completes (in finally block or success/error paths)
await this.hookRunner.runAfterFlowRun({
  flowId, flowRunId, flowVersion, inputs: resolvedInputs,
  status, outputs, error, duration
});
```

#### 1c. Call `beforeNodeExecute` / `afterNodeExecute` in `NodeExecutionCoordinator`

In `NodeExecutionCoordinator.executeNode()` (or the per-node method):

```typescript
// Before node execution
const hookResult = await this.hookRunner.runBeforeNodeExecute({
  flowRun: { flowId, flowRunId, flowVersion, inputs },
  nodeId, nodeType, nodeLabel, inputs: nodeInputs, params: resolvedParams,
});
if (hookResult.skipped) {
  // Mark node as SKIPPED, continue to next node
  return { status: 'SKIPPED' };
}
// Use potentially modified params
const finalParams = hookResult.params ?? resolvedParams;

// ... existing node execution logic using finalParams ...

// After node execution
const afterResult = await this.hookRunner.runAfterNodeExecute({
  flowRun: { flowId, flowRunId, flowVersion, inputs },
  nodeId, nodeType, nodeLabel, inputs: nodeInputs, params: finalParams,
  status, output, error, duration,
});
// Use potentially modified output
const finalOutput = afterResult.output ?? output;
```

**Testing**: Unit tests with mock plugins that track hook invocations. Integration test that runs a flow with a plugin that modifies inputs/outputs.

---

### Step 2 — Surface Plugin Endpoints in Framework Adapters

**Goal**: Plugins declare endpoints via `endpoints: InvectPluginEndpoint[]`. Framework adapters must mount these at runtime.

#### 2a. Express adapter (`pkg/express/src/invect-router.ts`)

After mounting all core routes, iterate plugin endpoints:

```typescript
// Mount plugin endpoints
const pluginEndpoints = core.getPluginEndpoints();
for (const endpoint of pluginEndpoints) {
  const method = endpoint.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
  router[method](endpoint.path, async (req, res) => {
    const context: PluginEndpointContext = {
      body: req.body ?? {},
      params: req.params,
      query: req.query as Record<string, string | undefined>,
      headers: req.headers as Record<string, string | undefined>,
      identity: (req as any).identity ?? null,
      request: /* convert Express req → Web Request if needed */,
    };
    try {
      const result = await endpoint.handler(context);
      if (result instanceof Response) {
        // Stream Web API Response to Express
      } else if ('stream' in result) {
        // Handle streaming response (SSE)
      } else {
        res.status(result.status ?? 200).json(result.body);
      }
    } catch (error) {
      res.status(500).json({ error: 'Plugin endpoint error' });
    }
  });
}
```

#### 2b. Express `onRequest` / `onResponse` hooks

Wrap the entire router in middleware that calls `PluginManager.runOnRequest()` before dispatch and `runOnResponse()` after:

```typescript
// Before route dispatch
router.use(async (req, res, next) => {
  const webRequest = expressToWebRequest(req);
  const hookResult = await core.getPluginManager().runOnRequest(webRequest, {
    path: req.path, method: req.method, identity: (req as any).identity ?? null,
  });
  if (hookResult.intercepted && hookResult.response) {
    // Send the intercepted response, skip normal routing
    return sendWebResponse(res, hookResult.response);
  }
  next();
});
```

#### 2c. NestJS adapter (`pkg/nestjs/`)

Add a catch-all `@All('ext/*')` method in `InvectController` that delegates to plugin endpoints by path matching. Or dynamically register routes via `ModuleRef`.

#### 2d. Next.js adapter (`pkg/nextjs/`)

Add a wildcard API route `app/api/invect/ext/[...path]/route.ts` that matches plugin endpoint paths and dispatches to the corresponding handler.

**Testing**: E2E test — register a plugin with a `GET /test-plugin/ping` endpoint, hit it via HTTP, verify response.

---

### Step 3 — CLI `schema:diff` Command

**Goal**: Preview what the `generate` command would do, without writing files.

**File**: `pkg/cli/src/commands/schema-diff.ts` (new)

```
npx invect schema:diff [--config path]
```

Implementation:
1. Load config via `config-loader.ts`
2. Call `mergeSchemas(CORE_SCHEMA, pluginSchemas)`
3. Call `diffSchemas(currentSchema, mergedSchema)` (already exists in `schema-merger.ts`)
4. Pretty-print: new tables, added columns, column type changes
5. Exit 0 if no changes, exit 1 if changes detected (useful in CI)

Register in `pkg/cli/src/index.ts` alongside the other commands.

---

### Step 4 — Runtime Schema Validation

**Goal**: During `Invect.initialize()`, optionally introspect the DB and warn if plugin-required tables/columns are missing — don't crash, just log warnings.

**File**: `pkg/core/src/database/schema-validator.ts` (new)

Implementation:
1. After plugin initialization, collect the merged schema (core + plugin schemas)
2. Run a lightweight DB introspection query:
   - SQLite: `SELECT name FROM sqlite_master WHERE type='table'` + `PRAGMA table_info(tableName)`
   - PostgreSQL: `SELECT table_name FROM information_schema.tables` + `SELECT column_name FROM information_schema.columns`
   - MySQL: Same approach via `information_schema`
3. Compare expected tables/columns from merged schema vs. actual DB state
4. Log warnings for:
   - Missing tables: `⚠ Plugin "audit-log" requires table "audit_logs" — run "npx invect generate && npx invect migrate"`
   - Missing columns: `⚠ Plugin "rbac" added column "owner_id" to "flows" — run migrations`
5. Never throw — this is informational only

**Integration point**: Call from `Invect.initialize()` after `PluginManager.initializePlugins()` completes, gated behind a config flag (`validateSchema?: boolean`, default `true`).

---

### Step 5 — Reference Plugin: `@invect/plugin-rbac`

**Goal**: Extract RBAC as a plugin to validate the entire system end-to-end and serve as a reference implementation for plugin authors.

**Package**: `pkg/plugin-rbac/`

```
pkg/plugin-rbac/
├── package.json          # @invect/plugin-rbac, depends on @invect/core
├── tsconfig.json
├── tsdown.config.ts
├── src/
│   ├── index.ts          # export { rbac } from './plugin'
│   ├── plugin.ts         # rbac() function returning InvectPlugin
│   └── types.ts          # RbacOptions, Role, Permission types
└── tests/
    └── rbac.test.ts
```

#### Plugin contract:

```typescript
export function rbac(options: RbacOptions): InvectPlugin {
  return {
    id: 'rbac',
    name: 'Role-Based Access Control',

    // No schema — reuses core's flow_access table
    // (or declares new tables if needed for roles/permissions)

    hooks: {
      // Resolve identity from request
      onRequest: async (request, context) => {
        const identity = await options.resolveUser(request);
        // Attach identity to context for downstream hooks
      },

      // Check permissions
      onAuthorize: async ({ identity, action, resource }) => {
        if (!identity) return { allowed: false, reason: 'Unauthenticated' };
        const allowed = checkPermission(identity, action, resource, options);
        return { allowed, reason: allowed ? undefined : 'Insufficient permissions' };
      },
    },

    async init(ctx) {
      ctx.logger.info('RBAC plugin initialized');
    },
  };
}
```

#### Backward compatibility:

If `config.auth` is set (legacy), internally convert it to the RBAC plugin. In `Invect.initialize()`:

```typescript
if (config.auth && !config.plugins?.some(p => p.id === 'rbac')) {
  config.plugins = [
    rbac({ resolveUser: config.auth.resolveUser, roles: config.auth.roles }),
    ...(config.plugins ?? []),
  ];
  logger.warn('config.auth is deprecated — use the @invect/plugin-rbac plugin instead');
}
```

---

### Step 6 — Plugin System Tests

#### Unit tests (`pkg/core/src/services/__tests__/plugin-manager.test.ts`)

- Plugin initialization order
- Duplicate ID rejection
- Hook execution order
- `beforeFlowRun` cancellation
- `beforeNodeExecute` skip + param override
- `afterNodeExecute` output override
- `onRequest` interception
- `onAuthorize` override
- Shutdown in reverse order
- Plugin store isolation

#### Integration tests (`pkg/core/e2e/plugins.test.ts`)

- Run a flow with a plugin that:
  - Modifies flow inputs via `beforeFlowRun`
  - Logs node executions via `afterNodeExecute`
  - Adds a custom endpoint
- Verify the modified inputs propagate through the flow
- Verify the custom endpoint responds correctly

#### Schema tests (`pkg/core/src/database/__tests__/schema-merger.test.ts`)

- Merge core + plugin schema → correct merged output
- Plugin extending core table → fields added
- Duplicate field → throws error
- Foreign key validation
- `diffSchemas()` detects new tables and columns
- Generator produces valid TypeScript for each dialect

---

## Design Decisions & Rationale

### Abstract Schema as Source of Truth

The generators overwrite the three Drizzle schema files (`schema-sqlite.ts`, `schema-postgres.ts`, `schema-mysql.ts`). Core tables are already defined in abstract format (`CORE_SCHEMA` in `core-schema.ts`), so the generator produces the complete schema — core + plugins — in one pass. The existing hand-written schema files become **generated output**. This eliminates the "update 3 files" pitfall permanently.

### Migration Strategy: Let Drizzle Kit Do the Diffing

The CLI is a **pre-step** that produces schema files, then delegates to `drizzle-kit generate` for migration SQL. This means:
- Additive changes (CREATE TABLE, ADD COLUMN) work out of the box
- ALTER/DROP is handled by Drizzle Kit's diffing (users review the generated SQL)
- No custom migration engine needed — leverage the existing Drizzle ecosystem
- Users can still use `drizzle-kit studio` and other tooling

### Hook Short-Circuiting

Following better-auth's pattern:
- `beforeFlowRun` returning `{ cancel: true }` prevents the run entirely
- `beforeNodeExecute` returning `{ skip: true }` skips the node
- `onRequest` returning `{ response }` intercepts the HTTP request
- Hooks run in plugin array order — first plugin to short-circuit wins
- `after*` hooks always run (for logging/audit) and cannot cancel

### Plugin Endpoint Mounting

Plugin endpoints use a framework-agnostic `PluginEndpointContext` / `PluginEndpointResponse` interface. Each framework adapter converts to/from its native format:
- **Express**: `req`/`res` → `PluginEndpointContext`, response → `res.json()`
- **NestJS**: Catch-all controller method or dynamic route registration
- **Next.js**: Wildcard API route `[...path]`

This avoids plugins needing to know which framework they're running in.

### No Plugin-Specific ORM Access

Plugins declare schemas abstractly — they never import Drizzle directly. If a plugin needs to query its own tables at runtime, it should:
1. Declare the tables in `schema`
2. Access the database via `context.store` or a service injected at `init()` time
3. Use raw SQL or a query builder provided by the core

This keeps plugins framework- and dialect-agnostic. A future enhancement could expose a typed query builder that the schema generator creates alongside the Drizzle files.

---

## Implementation Priority & Sequencing

```
Step 1: Wire hooks into execution engine     ← Highest value, unlocks all plugins
  ↓
Step 2: Surface plugin endpoints in adapters ← Enables plugin API routes
  ↓
Step 3: CLI schema:diff command              ← Developer UX
  ↓
Step 4: Runtime schema validation            ← Safety net
  ↓
Step 5: Reference plugin (@invect/plugin-rbac) ← End-to-end validation
  ↓
Step 6: Plugin system tests                  ← Confidence + regression protection
```

Steps 3 and 4 are independent and can be done in parallel with Step 2. Step 5 depends on Steps 1 + 2 being complete. Step 6 should be written alongside each step (TDD preferred).

---

## File Inventory

### Already Exists (no changes needed unless bugs found)

| File | Purpose |
|------|---------|
| `pkg/core/src/types/plugin.types.ts` | All plugin type definitions |
| `pkg/core/src/services/plugin-manager.ts` | Plugin lifecycle + hook runners |
| `pkg/core/src/database/core-schema.ts` | Core tables in abstract format |
| `pkg/core/src/database/schema-merger.ts` | `mergeSchemas()`, `diffSchemas()` |
| `pkg/core/src/database/schema-generator.ts` | 3 dialect generators |
| `pkg/core/src/invect-config.ts` | `plugins` field in config schema |
| `pkg/core/src/invect-core.ts` | Plugin init in `initialize()` |
| `pkg/cli/src/commands/generate.ts` | `npx invect generate` |
| `pkg/cli/src/commands/migrate.ts` | `npx invect migrate` |
| `pkg/cli/src/commands/init.ts` | `npx invect init` |
| `pkg/cli/src/utils/config-loader.ts` | jiti-based config loading |

### Needs Modification

| File | Change |
|------|--------|
| `pkg/core/src/services/flow-run-coordinator.ts` | Call `beforeFlowRun`/`afterFlowRun` hooks |
| `pkg/core/src/services/node-execution-coordinator.ts` | Call `beforeNodeExecute`/`afterNodeExecute` hooks |
| `pkg/core/src/services/flow-orchestration.service.ts` | Thread `PluginHookRunner` to coordinators |
| `pkg/core/src/services/service-factory.ts` | Inject `PluginManager` into services |
| `pkg/express/src/invect-router.ts` | Mount plugin endpoints, run `onRequest`/`onResponse` hooks |
| `pkg/nestjs/src/invect-nestjs.controller.ts` | Add catch-all for plugin endpoints |
| `pkg/nextjs/src/` | Add wildcard route for plugin endpoints |
| `pkg/cli/src/index.ts` | Register `schema:diff` command |

### New Files

| File | Purpose |
|------|---------|
| `pkg/cli/src/commands/schema-diff.ts` | `npx invect schema:diff` command |
| `pkg/core/src/database/schema-validator.ts` | Runtime DB introspection + warnings |
| `pkg/plugin-rbac/` | Reference RBAC plugin package |
| `pkg/core/src/services/__tests__/plugin-manager.test.ts` | Plugin manager unit tests |
| `pkg/core/e2e/plugins.test.ts` | Plugin integration tests |
| `pkg/core/src/database/__tests__/schema-merger.test.ts` | Schema merger/generator tests |
