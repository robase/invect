# Integration Test Plan — Core & Plugin Packages

## Goal

Add a Vitest integration test layer that exercises **real service wiring + real SQLite database** without HTTP or browser overhead. This fills the gap between heavily-mocked unit tests and full-stack Playwright/E2E tests.

## Current Test Landscape

| Layer | Coverage | Tool |
|-------|----------|------|
| **Unit tests** | 8 files in core, 1 in auth plugin | Vitest, heavy mocking |
| **Playwright** | 27+ specs (API parity, UI, credentials, config panel) | Playwright, isolated SQLite per worker |
| **Core E2E** | 8 flow examples (AI-dependent) | Programmatic `Invect` init, real DB |
| **CLI tests** | 4 files (schema gen, diff) | Vitest |

**The gap**: No middle layer between heavily-mocked unit tests and full-stack Playwright/E2E tests. Service-to-service wiring, database interactions, and plugin hook sequencing go undetected until Playwright runs.

## Strategy

Use a **real in-memory SQLite database** + real service wiring via `Invect.initialize()`, but **no HTTP layer**. Tests exercise actual database queries, service interactions, and plugin hooks without spawning servers or browsers.

## Directory Structure

```
pkg/core/tests/integration/
├── helpers/
│   └── test-invect.ts              # Shared bootstrap: creates Invect with :memory: SQLite
├── flows/
│   ├── flow-crud.test.ts            # Create, read, update, delete flows
│   └── flow-execution.test.ts       # Execute flows (non-AI: jq, if_else, template, input/output)
├── credentials/
│   └── credential-lifecycle.test.ts # CRUD + encryption roundtrip
├── plugins/
│   ├── plugin-hooks.test.ts         # Hook firing order, cancel, param override
│   └── plugin-schema.test.ts        # Plugin table creation + schema merge at DB level
├── actions/
│   └── action-registry.test.ts      # Registration, lookup, node/tool definition conversion
└── orchestration/
    ├── template-resolution.test.ts  # Nunjucks param resolution with real upstream data
    └── branching-flow.test.ts       # If/else routing, skipped nodes
```

## Test Bootstrap Helper

Shared helper that creates a fully-wired `Invect` instance with a temporary SQLite file:

```typescript
// pkg/core/tests/integration/helpers/test-invect.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export async function createTestInvect(opts?: {
  plugins?: InvectPlugin[];
}) {
  // 1. Create temp SQLite file
  // 2. Run Drizzle migrations to create all tables
  // 3. Create Invect instance pointing at the temp file
  // 4. Call initialize()
  // 5. Patch shutdown() to clean up temp files
  return invect;
}
```

## Test Scope

### 1. Flow CRUD & Versioning
- Create flow → verify in DB → update → get by ID → list → delete
- Create version → get latest → get specific version
- ReactFlow renderer produces valid visualization data

### 2. Flow Execution (non-AI, highest value)
- Input → JQ → Output chain (data flows correctly between nodes)
- If/else branching (correct branch taken, other nodes skipped)
- Template string resolution with upstream data
- Error propagation when a node fails

### 3. Plugin Hooks
- `beforeFlowRun` returning `{ cancel: true }` stops execution
- `beforeFlowRun` returning `{ inputs }` mutates inputs
- `beforeNodeExecute` returning `{ skip: true }` skips node
- `afterNodeExecute` returning `{ output }` overrides output
- Hook execution order matches plugin registration order

### 4. Credentials
- Create credential → encrypted in DB → decrypt → matches original
- OAuth2 config roundtrip through encryption

### 5. Action Registry
- All builtin actions registered after init
- `toNodeDefinition()` and `toAgentToolDefinition()` produce valid schemas
- Action execution with Zod validation (valid passes, invalid rejects)

### 6. Orchestration
- Topological sort ordering
- Nunjucks template resolution with real upstream data
- If/else branch routing with correct node skipping

## Out of Scope

- **HTTP routing** — covered by Playwright API parity tests
- **AI/LLM calls** — mock-heavy and flaky; leave to E2E tests
- **Frontend rendering** — Playwright's domain
- **Cross-framework parity** — Playwright's `shared-api-contract.ts`

## Database Isolation

- Temporary on-disk SQLite files (one per `createTestInvect()` call)
- Drizzle migrations run against the fresh file before Invect starts
- `:memory:` is not used because Invect's `DatabaseService.initialize()` skips migrations and expects tables to already exist
- Each test file creates its own `Invect` instance in `beforeAll`
- Temp files are automatically cleaned up during `invect.shutdown()`
- No shared state between test files

## Running

```bash
# Run all integration tests
cd pkg/core && pnpm test:integration

# Run specific suite
cd pkg/core && pnpm vitest run tests/integration/flows/
```

The script `"test:integration": "vitest run tests/integration"` already exists in `pkg/core/package.json`.

## Priority Order

1. Test bootstrap helper — everything depends on this
2. Flow execution — core product; tests input→node→output data flow
3. Plugin hooks — most complex integration surface
4. Credentials lifecycle — encryption is security-critical
5. Flow CRUD & versioning — catches DB schema regressions
6. Action registry — validates registration correctness
7. Orchestration — template resolution and branching
