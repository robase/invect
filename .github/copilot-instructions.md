I am using fish shell, always use fish shell syntax when running commands

# Invect - AI Coding Agent Instructions

## Project Overview

Invect is a workflow orchestration system with visual flow editor and batch processing via OpenAI/Anthropic APIs. **pnpm monorepo** with framework-agnostic core (`pkg/core`) and framework adapters (`pkg/nestjs`, `pkg/express`, `pkg/nextjs`, `pkg/frontend`).

**Architecture**: Service-layer abstraction + dependency injection. Core business logic in `pkg/core/src/services/`, framework packages wrap core services. Database: Drizzle ORM (SQLite, PostgreSQL, MySQL).

## Monorepo Structure (pnpm Workspaces)

This repository uses **pnpm workspaces** defined in `pnpm-workspace.yaml`:

```yaml
packages:
  - pkg/*           # Publishable packages
  - pkg/plugins/*   # Plugin packages (nested one level deeper)
  - examples/*      # Development/demo apps
```

### `pkg/` - Publishable Packages (npm)

Published as scoped packages `@invect/*`. Built with watch mode: `pnpm dev:all`

```
pkg/
├── core/        # Framework-agnostic logic (services, nodes, database schemas)
├── nestjs/      # NestJS adapter (controllers, modules)
├── express/     # Express adapter (routes)
├── frontend/    # React components (React Router v7, flow editor)
├── nextjs/      # Next.js adapter (server actions, API routes)
├── cli/         # CLI tool (npx invect) — init, generate, migrate
├── plugins/     # Official plugins (auth, rbac)
│   ├── auth/    # @invect/user-auth — Better Auth integration
│   └── rbac/    # @invect/rbac — Role-Based Access Control
└── layouts/     # Layout components
```

### `examples/` - Dev/Demo Apps (not published)

Use `workspace:*` to link local packages. Run: `pnpm dev` (interactive menu).

```
examples/
├── express-drizzle/            # Backend: Express + Drizzle + SQLite
├── vite-react-frontend/        # Frontend: Vite + React (pairs with express-drizzle)
├── nest-prisma/                # NestJS + Prisma
├── nextjs-app-router/          # Next.js App Router (standalone)
└── nextjs-drizzle-auth-rbac/   # Next.js + Auth + RBAC plugins (full-featured)
```

#### Example Project Details

| Example | Framework | Database | Adapter | Purpose |
|---------|-----------|----------|---------|--------|
| `express-drizzle` | Express | SQLite (`./dev.db`) | `@invect/express` | Primary backend dev server. Paired with `vite-react-frontend` for fullstack dev. Uses `nodemon` for hot-reload. |
| `vite-react-frontend` | Vite + React | N/A (frontend only) | `@invect/frontend` | Standalone React frontend for the flow editor. Connects to Express backend on port 3000. Dev server on port 5173. |
| `nest-prisma` | NestJS | SQLite (`./prisma/dev.db`) | `@invect/nestjs` | NestJS adapter example. Uses Prisma ORM (not Drizzle). Jest test framework (not Vitest). |
| `nextjs-app-router` | Next.js 15 | SQLite (internal) | `@invect/nextjs` + `@invect/frontend` | Self-contained Next.js example. Mounts Invect UI at `/invect` route. |
| `nextjs-drizzle-auth-rbac` | Next.js 15 | PostgreSQL (Docker) | `@invect/nextjs` + `@invect/frontend` | Full-featured example with **plugins**: `@invect/user-auth` (Better Auth) + `@invect/rbac` (flow-level access control). Uses `pg` + Drizzle + Docker Compose for PostgreSQL. |

The **primary development workflow** is `express-drizzle` + `vite-react-frontend` running together (`pnpm dev:fullstack`). The Next.js examples are self-contained alternatives.

### Workspace Dependency Flow

```
examples/express-drizzle/package.json:
{
  "dependencies": {
    "@invect/core": "workspace:*",      // Links to pkg/core
    "@invect/express": "workspace:*"    // Links to pkg/express
  }
}

When you edit pkg/core/src/services/flows.service.ts:
  1. tsdown rebuilds → pkg/core/dist/*
  2. pnpm workspace automatically updates links
  3. nodemon in examples/express-drizzle detects change in pkg/core/dist
  4. Express server auto-restarts with new code ✨
```

### Why Monorepo?

Publishable code (`pkg/`) separated from demos (`examples/`). Core logic shared across frameworks. Workspace links enable instant hot-reload. Type-safe with path aliases. Independent package versioning.

## Critical Workflows

### Development
- `pnpm dev` - Interactive menu (start here)
- `pnpm dev:express-example` / `pnpm dev:vite-example` / `pnpm dev:fullstack`
- Hot-reload: Edit `pkg/core/src/*` → tsdown rebuilds → workspace links update → server restarts

### Database (CRITICAL: Plugin Schema System)
- **Legacy (direct editing)**: `cd pkg/core && pnpm db:generate` → `pnpm db:migrate` → `pnpm db:studio`
- **Plugin system (recommended)**: `npx invect generate` → `npx invect migrate` (merges core + plugin schemas automatically)
- Core schemas are now defined in abstract format in `pkg/core/src/database/core-schema.ts`
- The CLI generates dialect-specific Drizzle files for SQLite, PostgreSQL, and MySQL from the merged schema
- Plugins can declare their own tables and extend core tables via `plugin.schema`

### Agent Regression Guardrails
- Before changing workspace package imports/exports, verify all three layers stay aligned: package `exports`, emitted `dist` files, and example app direct dependencies. Monorepo workspace links do not guarantee examples can resolve transitive subpaths like `@invect/core/types`.
- When changing plugin schemas or plugin-owned persistence, update the real consumer surfaces together: the example app schema flow, any isolated test servers under `playwright/tests/platform/`, and any startup table checks. A plugin table that exists only in one of those places will regress builds or local dev.
- Be careful with watch-mode builds for workspace packages consumed from `dist/`. Cleaning `dist/` during rebuilds can trigger transient `ERR_MODULE_NOT_FOUND` crashes in example apps watching those folders.
- Do not trust stale terminal output after package or lockfile changes. Re-run the smallest targeted build or test that exercises the changed package graph before concluding a regression still exists.

### Testing & Type Checking
- `pnpm test` (all) | `cd pkg/core && pnpm test:unit` | `pnpm test:integration`
- `pnpm test:e2e` - Runs programmatic E2E tests in `pkg/core/e2e/` (requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for AI tests)
- `pnpm test:pw` - Runs Playwright tests (API parity, frontend rendering, config panel, credentials)
- `pnpm test:pw:ui` - Playwright tests in interactive UI mode
- `pnpm typecheck` - Runs `tsc --noEmit` across all `@invect/*` packages
- Vitest + NestJS utilities (see `TEST_IMPLEMENTATION_EXAMPLES.md`)
- `cd pkg/cli && pnpm test` - CLI schema generation + migration tests

## Invect Core Integration Pattern

The `Invect` class in `pkg/core/src/invect-core.ts` is the **framework-agnostic orchestrator** that exposes all business logic through a clean API. Framework packages (`pkg/express`, `pkg/nestjs`, `pkg/nextjs`) are thin adapters that wrap this core.

### Architecture: Core → Framework Adapters

```
┌─────────────────────────────────────────┐
│         @invect/core                 │
│  ┌───────────────────────────────────┐  │
│  │  Invect (invect-core.ts)   │  │
│  │  - initialize()                   │  │
│  │  - createFlow()                   │  │
│  │  - startFlowRun()                 │  │
│  │  - listFlows()                    │  │
│  │  - createCredential()             │  │
│  │  + 40+ methods                    │  │
│  └───────────────────────────────────┘  │
│             ▲    ▲    ▲                 │
│             │    │    │                 │
└─────────────┼────┼────┼─────────────────┘
              │    │    │
    ┌─────────┘    │    └─────────┐
    │              │              │
┌───▼────┐   ┌────▼─────┐   ┌───▼──────┐
│ Express│   │  NestJS  │   │ Next.js  │
│ Router │   │  Module  │   │  Server  │
│        │   │          │   │  Actions │
└────────┘   └──────────┘   └──────────┘
```

### How Framework Integration Works

#### Express (`pkg/express`)

**Pattern**: Function factory that creates Express router

```typescript
// pkg/express/src/invect-router.ts
export function createInvectRouter(config: InvectConfig): Router {
  const core = new Invect(config);  // Create core instance
  
  // Initialize asynchronously
  core.initialize().then(() => {
    core.startBatchPolling();  // Auto-start batch processing
  });
  
  const router = Router();
  
  // Middleware: Check initialization
  router.use((req, res, next) => {
    if (!core.isInitialized()) {
      return res.status(503).json({ error: "Service initializing" });
    }
    next();
  });
  
  // Route: Maps HTTP → Core method
  router.post("/flows/:flowId/run", async (req, res) => {
    const result = await core.startFlowRun(req.params.flowId, req.body.inputs);
    res.json(result);
  });
  
  // ... 30+ routes, all delegate to core methods
  return router;
}

// Usage in Express app:
import { createInvectRouter } from '@invect/express';
app.use('/invect', createInvectRouter({ databaseUrl: '...' }));
```

**Key Characteristics**:
- Router factory pattern - create new instance per app
- Each route = thin wrapper around `core.<method>()`
- Error handling via middleware
- Auto-initialization on router creation

#### NestJS (`pkg/nestjs`)

**Pattern**: NestJS module with dependency injection

```typescript
// pkg/nestjs/src/invect-nestjs.module.ts
@Module({})
export class InvectModule {
  static forRoot(config: InvectConfig): DynamicModule {
    const invectProvider = {
      provide: 'INVECT_CORE',
      useFactory: () => {
        const core = new Invect(config);  // Create singleton
        core.initialize();
        return core;
      },
    };
    
    return {
      controllers: [InvectController],  // HTTP endpoints
      providers: [invectProvider, InvectService],  // DI tokens
      exports: [invectProvider, InvectService],  // For other modules
    };
  }
}

// pkg/nestjs/src/invect-nestjs.service.ts
@Injectable()
export class InvectService {
  constructor(
    @Inject('INVECT_CORE') private readonly core: Invect
  ) {}
  
  getCore(): Invect {
    return this.core;  // Expose core for advanced usage
  }
}

// pkg/nestjs/src/invect-nestjs.controller.ts
@Controller('invect')
export class InvectController {
  constructor(private readonly invectService: InvectService) {}
  
  @Post('flows/:flowId/run')
  async executeFlow(@Param('flowId') flowId: string, @Body() body: any) {
    const core = this.invectService.getCore();
    return core.startFlowRun(flowId, body.inputs);  // Delegate to core
  }
}

// Usage in NestJS app:
@Module({
  imports: [
    InvectModule.forRoot({ databaseUrl: process.env.DATABASE_URL })
  ],
})
export class AppModule {}
```

**Key Characteristics**:
- Module factory pattern (`forRoot`, `forRootAsync`)
- Single `Invect` instance via dependency injection
- Controller delegates to service → core
- Full NestJS ecosystem support (guards, interceptors, etc.)

#### Next.js (`pkg/nextjs`)

**Pattern**: Server actions and API routes

```typescript
// pkg/nextjs/src/server-actions.ts
import { Invect } from '@invect/core';

// Singleton core instance
let core: Invect | null = null;

function getCore() {
  if (!core) {
    core = new Invect({ databaseUrl: process.env.DATABASE_URL });
    core.initialize();
  }
  return core;
}

// Server Action: Direct core method call
export async function executeFlow(flowId: string, inputs: any) {
  'use server';
  const core = getCore();
  return core.startFlowRun(flowId, inputs);
}

// API Route: app/api/invect/flows/[flowId]/run/route.ts
export async function POST(req: Request, { params }: { params: { flowId: string } }) {
  const core = getCore();
  const body = await req.json();
  const result = await core.startFlowRun(params.flowId, body.inputs);
  return Response.json(result);
}
```

**Key Characteristics**:
- Singleton pattern with lazy initialization
- Server actions for React Server Components
- API routes for traditional REST endpoints
- Build-time vs runtime initialization handling

### Why This Pattern?

Single source of truth (all logic in `Invect`). Framework agnostic. Easy testing. Type-safe. Consistent API. Minimal adapters (<500 lines).

**New Framework**: Create `pkg/<framework>/`, import `Invect`, wrap routes → `core.<method>()`. See existing adapters for patterns.

## Core Architecture Concepts

### 1. Service Layer Pattern

**All business logic flows through services** in `pkg/core/src/services/`:

```typescript
FlowOrchestrationService      // Orchestrates complete flow execution
├── FlowRunCoordinator        // Coordinates full flow run lifecycle
├── NodeExecutionCoordinator  // Handles individual node execution + template resolution
├── FlowsService              // Flow CRUD operations
├── FlowVersionsService       // Flow version management
├── FlowRunsService           // Flow execution records
├── NodeExecutionService      // Node-level execution traces
├── BatchJobsService          // Batch processing integration
└── CredentialsService        // Secure credential storage

NodeDataService               // Cross-cutting operations (SQL, JQ, AI)
GraphService                  // Topological sorting, dependency analysis
NunjucksService               // Template rendering
ReactFlowRendererService      // Flow visualization data for frontend
```

**Never bypass services** - don't access database models directly from controllers/executors.

### 2. Provider-Actions Architecture (Primary)

**All node types (except AGENT) are defined as Actions** using the `defineAction()` pattern in `pkg/core/src/actions/`. An action is a single-file definition that serves as both a flow node and an agent tool.

Node types use **string-based action IDs** (e.g., `"core.jq"`, `"gmail.send_message"`) instead of the legacy `GraphNodeType` enum. Actions are grouped by **provider** (core, http, gmail, slack, github, google-drive, etc.).

```typescript
// pkg/core/src/actions/core/jq.ts
import { defineAction } from '../define-action';
import { CORE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

export const jqAction = defineAction({
  id: 'core.jq',                          // Node type string used in flow definitions
  name: 'JQ Transformation',
  description: 'Query and transform JSON data using JQ syntax',
  provider: CORE_PROVIDER,                 // Provider grouping for UI palette

  params: {
    schema: z.object({ query: z.string() }),  // Zod validation
    fields: [{ name: 'query', label: 'JQ Query', type: 'code', required: true }],
  },

  async execute(params, context) {
    // params are Zod-validated and template-resolved
    // context has logger, credential, incomingData, functions (submitPrompt, etc.)
    const result = jq.run(params.query, context.incomingData);
    return { success: true, output: result };
  },
});
```

**Action directory structure**:
```
pkg/core/src/actions/
├── types.ts              # ActionDefinition, ActionExecutionContext, ActionResult
├── define-action.ts      # defineAction() helper
├── action-registry.ts    # ActionRegistry class + toNodeDefinition() + toAgentToolDefinition()
├── action-executor.ts    # executeActionAsNode(), executeActionAsTool() bridges
├── providers.ts          # Provider definitions (CORE_PROVIDER, GMAIL_PROVIDER, etc.)
├── index.ts              # Barrel: allBuiltinActions[], registerBuiltinActions()
├── core/                 # core.input, core.output, core.jq, core.if_else, core.model, etc.
├── http/                 # http.request
├── gmail/                # gmail.list_messages, gmail.send_message, gmail.get_message, etc.
├── slack/                # slack.send_message, slack.list_channels
├── github/               # github.create_issue, github.list_repos
├── google-drive/         # google_drive.list_files, google_drive.create_file, etc.
├── google-docs/          # google_docs.get_document, google_docs.create_document, etc.
├── google-sheets/        # google_sheets.get_values, google_sheets.append_values, etc.
├── google-calendar/      # google_calendar.list_events, google_calendar.create_event, etc.
├── linear/               # linear.create_issue, linear.list_issues, etc.
├── microsoft/            # microsoft.list_events, microsoft.list_messages, etc.
├── postgres/             # postgres.execute_query, postgres.list_tables, etc.
└── triggers/             # trigger.cron, trigger.manual, trigger.webhook
```

**Key characteristics**:
- One file = one action. Self-contained definition + execution.
- Every action auto-registers as both a flow node AND an agent tool.
- Actions use `ActionExecutionContext` which provides: `logger`, `credential`, `incomingData`, `flowInputs`, `functions` (submitPrompt, getCredential, markDownstreamNodesAsSkipped, etc.), `flowRunState`.
- The `ActionResult` can optionally include `outputVariables` for multi-output nodes like if-else (with `true_output`/`false_output`).

### Legacy Node Executors (AGENT only)

The `BaseNodeExecutor` pattern in `pkg/core/src/nodes/` is **legacy**. Only the `AgentNodeExecutor` still uses it because the agent's iterative tool-calling loop is too complex to migrate yet. All other node types (input, output, model, jq, template_string, if_else, sql_query, http_request) have been migrated to actions.

```typescript
// executor-registry.ts only registers AGENT now
static async createDefault(): Promise<NodeExecutorRegistry> {
  const registry = new NodeExecutorRegistry();
  registry.register(new AgentNodeExecutor(toolRegistry));
  return registry;
}
```

The `GraphNodeType` enum still exists in `pkg/core/src/types/graph-node-types.ts`. While new nodes should always use action ID strings, the enum is **not** fully vestigial — `GraphNodeType.TEMPLATE_STRING`, `GraphNodeType.IF_ELSE`, and others are still actively referenced in `NodeExecutionCoordinator` and `FlowRunCoordinator` for special-case handling (e.g., template string param resolution, if-else branch routing).

### 3. Workflow Execution Model

#### Input Data Construction

When a node executes (or when viewing its config panel), its **input data** is a JSON object built from upstream node outputs:

- **Keys**: Each upstream node's `referenceId` (or label normalized to `snake_case`)
- **Values**: The output of each upstream node (JSON-parsed if valid, otherwise raw string)
- **Collision handling**: If two nodes produce the same key, append incrementing numbers (`some_a`, `some_a1`)

```json
// Example: Node Z has upstream nodes "Fetch User" and "Get Config"
{
  "fetch_user": { "id": 123, "name": "Alice" },
  "get_config": "production"
}
```

#### Config Param Resolution

Each node defines its own config params (form fields). Users set these as:

1. **Literal values**: Used as-is
2. **Nunjucks templates**: Resolved against the input data object

```typescript
// If input data is { "fetch_user": { "id": 123 } }
// A config param "User ID: {{ fetch_user.id }}" resolves to "User ID: 123"
```

**Key Services**: `NunjucksService` (template rendering), `NodeExecutionCoordinator.buildIncomingDataObject()` (input construction), `NodeExecutionCoordinator.resolveTemplateParams()` (param resolution)

#### Execution Flow

```
executeFlow(flowId, inputs)
  ├── FlowsService.getFlowById() → Get flow + version
  ├── FlowOrchestrationService.initiateFlowRun()
  │   ├── FlowRunsService.createFlowRun() → Create execution record
  │   ├── GraphService.topologicalSort() → Determine node order
  │   ├── For each node in order:
  │   │   ├── buildIncomingDataObject() → Construct input data from upstream outputs
  │   │   ├── resolveTemplateParams() → Resolve Nunjucks templates in config
  │   │   ├── executeNode()
  │   │   │   ├── NodeExecutionService.createNodeExecution() → Create trace
  │   │   │   ├── Dispatch: legacy executor (AGENT only) or action registry
  │   │   │   │   ├── nodeRegistry.get(nodeType) → AgentNodeExecutor.execute()
  │   │   │   │   └── actionRegistry.get(nodeType) → executeActionAsNode()
  │   │   │   └── NodeExecutionService.updateNodeExecutionStatus()
  │   │   └── Store output for downstream nodes
  │   └── markExecutionSuccess/Failed()
  └── Return FlowRunResult
```

#### Flow Control Nodes

If/else and similar nodes have multiple output ports but act as **passthrough**—their output equals their input. Downstream nodes on the active branch receive the flow control node's input data unchanged.

**Batch Processing**: When a node returns `state: "PENDING"`, flow pauses (`PAUSED_FOR_BATCH`). Polling service resumes when batch completes.

### 4. Database Layer Abstraction

```typescript
// Models handle CRUD across all database types
class FlowsModel {
  constructor(private db: DatabaseConnection, private dbType: DatabaseType) {}
  
  async create(data: NewFlow): Promise<Flow> {
    // Drizzle handles dialect differences automatically
    return this.db.insert(flows).values(data).returning();
  }
}

// Services use models
class FlowsService {
  constructor(private databaseService: DatabaseService) {}
  
  async createFlow(input: CreateFlowInput): Promise<Flow> {
    return this.databaseService.flows.create(input);
  }
}
```

**Never write SQL directly** - use Drizzle ORM methods.

## Project-Specific Conventions

### Import Paths

```typescript
// CORRECT - Use path aliases from tsconfig
import { FlowsService } from "src/services/flows/flows.service";
import { Logger } from "src/types/schemas";
import type { InvectDefinition } from "src/services/flow-versions/schemas-fresh";

// WRONG - Avoid relative paths beyond parent
import { FlowsService } from "../../services/flows/flows.service";
```

### Frontend/Backend Type Separation (CRITICAL)

The `@invect/core` package has two entry points:
- **`@invect/core`** - Main entry, contains Node.js-specific runtime code (executors, services)
- **`@invect/core/types`** - Types-only entry for frontend consumption (via `types-export.ts`)

**The `types-export.ts` file MUST NOT import runtime code.** If it does, the frontend build will fail with:
```
"createRequire" is not exported by "__vite-browser-external"
```

**Rules for `pkg/core/src/types-export.ts`:**
1. Use `import type` for all imports from service/node files
2. Never import Zod schemas that have runtime code (use types only)
3. Never import from barrel files like `./nodes` or `./services` that re-export runtime code
4. Only export pure TypeScript types, enums, and type-only re-exports

**Rules for `pkg/core/src/types-fresh.ts`:**
1. Same rules apply - this file is imported by `types-export.ts`
2. Use `import type` for imports from `./services/*` files
3. Zod schemas defined here are OK (they're needed for runtime validation)
4. But imports FROM other files must be type-only

```typescript
// CORRECT in types-export.ts / types-fresh.ts
import type { FlowEdge } from "./services/flow-versions/schemas-fresh";
import type { BatchProvider } from "./services/ai/ai-types";
export type { NodeExecutionResult } from "./types/node-execution.types";

// WRONG - pulls in runtime code
import { FlowEdge } from "./services/flow-versions/schemas-fresh";
import { NodeExecutionResult } from "./nodes";  // barrel file has executors!
export { loopConfigSchema } from "./services/flow-versions/schemas-fresh";  // Zod schema = runtime
```

**If frontend build fails with Node.js module errors:**
1. Check `pkg/core/dist/types-export.js` for `rolldown_runtime` imports
2. Trace which import is pulling in runtime code
3. Change to `import type` or move the type to a pure types file

### Type Safety for Node I/O

```typescript
// Node outputs stored via StructuredOutput
type NodeOutputs = {
  nodeType: string;  // Action ID (e.g., "core.jq", "gmail.send_message") or "AGENT"
  data: {
    variables: Record<string, { value: unknown; type: "string" | "object" }>;
    metadata?: Record<string, unknown>;
  };
};

// Input data for downstream nodes (built by buildIncomingDataObject)
// Keys are upstream node referenceId/slug, values are their outputs
type NodeIncomingDataObject = Record<string, unknown>;
// Example: { "fetch_user": { id: 123 }, "api_result": "success" }
```

**Flow node definitions** use string-based types (not the GraphNodeType enum):
```typescript
// FlowNodeDefinitions — type field is an arbitrary string
// Can be an action ID ("core.model", "gmail.send_message") or legacy ("AGENT")
{
  id: "my-node",
  type: "core.jq",        // Action ID string
  label: "Transform Data",
  referenceId: "data",
  params: { query: ".user.name" },
  position: { x: 100, y: 200 },
}
```

**Template access**: Use `{{ upstream_node_slug }}` or `{{ upstream_node_slug.property }}` in Nunjucks templates.

### Error Handling

```typescript
// Custom error types in src/types/common/errors.types.ts
throw new ValidationError("Flow definition invalid", { flowId });
throw new DatabaseError("Failed to create flow", { error });

// Services catch and log, controllers re-throw
try {
  return await this.flowService.createFlow(dto);
} catch (error) {
  this.logger.error("Flow creation failed", { error });
  throw new DatabaseError("Failed to create flow", { error });
}
```

### Logging

```typescript
// Structured logging with context
this.logger.info("Flow execution started", { flowId, flowRunId });
this.logger.debug("Node inputs prepared", { nodeId, inputKeys: Object.keys(inputs) });
this.logger.error("Node execution failed", { nodeId, error: error.message });
```

## Integration & Security

**NestJS**: `InvectModule.forRoot({ databaseUrl, ANTHROPIC_API_KEY, ... })`  
**Frontend**: `Invect` component via `ApiClient` in `pkg/frontend/src/services/apiClient.ts`  
**Credentials**: AES-256-GCM encrypted. Set `INVECT_ENCRYPTION_KEY` (base64, 32 bytes). Access: `context.functions.getCredential(id)`

## AI Agent & Tool Calling Architecture

Invect supports AI agent workflows with tool calling via the **AGENT** node type. Agents run a prompt→tool→iterate loop using OpenAI or Anthropic APIs.

### Agent Node Overview

The `AgentNodeExecutor` (`pkg/core/src/nodes/agent-executor.ts`) manages an iterative loop:

1. Send task prompt + available tools to LLM
2. LLM responds with text or tool call(s)
3. Execute requested tools and return results to LLM
4. Repeat until stop condition (explicit stop, max iterations, or first tool result)

```typescript
// Agent node params
{
  credentialId: string,      // OpenAI or Anthropic API credential
  model: string,             // e.g., "gpt-4o-mini", "claude-sonnet-4-0"
  taskPrompt: string,        // Main task/goal (supports Nunjucks templating)
  systemPrompt?: string,     // Optional system instructions
  enabledTools: string[],    // Array of tool IDs to enable
  maxIterations: number,     // Loop limit (1-50, default 10)
  stopCondition: "explicit_stop" | "tool_result" | "max_iterations",
  enableParallelTools: boolean,  // Allow parallel tool execution
}
```

### Tool System Architecture

Tools are registered in `AgentToolRegistry` (`pkg/core/src/services/agent-tools/agent-tool-registry.ts`). There are three sources of tools:

#### 1. Action-Based Tools (Primary — via Provider-Actions system)

Every action registered with `defineAction()` is **automatically** converted to an agent tool during `Invect.initialize()`. The `registerActionsAsTools()` method iterates all actions in the `ActionRegistry`, converts each to an `AgentToolDefinition` via `toAgentToolDefinition()`, and registers it with the tool registry using `createToolExecutorForAction()` as the executor wrapper.

This means all Gmail, Slack, GitHub, Google Drive, etc. actions are available as agent tools with no extra work.

#### 2. Standalone Tools (no corresponding node)

Registered directly in `pkg/core/src/services/agent-tools/builtin/`:

```typescript
// pkg/core/src/services/agent-tools/builtin/math-tool.ts
export const mathToolDefinition: AgentToolDefinition = {
  id: "math_eval",
  name: "Math Evaluate",
  description: "Evaluate mathematical expressions...",
  inputSchema: { /* JSON Schema */ },
  category: "utility",
  enabledByDefault: true,
};

export const mathToolExecutor: AgentToolExecutor = async (input, context) => {
  // Tool implementation
};
```

**Current standalone tools**: `math_eval`, `json_logic`

#### 3. Legacy Node-Based Tools (deprecated path)

The `AgentToolCapable` interface still exists on old executor classes (JqNodeExecutor, HttpRequestNodeExecutor), but those executors are **no longer registered** in the node registry. This path is effectively dead — kept only for backward compatibility. New tools should use the action system.

### Tool Definition Schema

```typescript
interface AgentToolDefinition {
  id: string;                    // Unique identifier (snake_case)
  name: string;                  // Human-readable name
  description: string;           // For LLM to understand when to use
  inputSchema: Record<string, unknown>;  // JSON Schema for inputs
  category: "data" | "web" | "code" | "utility" | "custom";
  tags?: string[];
  enabledByDefault?: boolean;
  nodeType?: string;             // If backed by a node executor
}
```

### Tool Registry Initialization

During `Invect.initialize()`:

1. `initializeGlobalActionRegistry()` creates the action registry
2. `registerBuiltinActions()` registers all ~50+ actions from all providers
3. Node registry is initialized (only registers `AgentNodeExecutor`)
4. `initializeGlobalToolRegistry()` registers standalone tools (math_eval, json_logic)
5. `registerActionsAsTools()` iterates all actions, converts each to `AgentToolDefinition`, registers as tools
6. Tools are accessible via `Invect.getAgentTools()` → `GET /agent/tools`

### LLM Provider Adapters

Tool calling uses provider-specific adapters in `pkg/core/src/services/ai/`:

- `OpenAIAdapter.executeAgentPrompt()` - Uses OpenAI function calling format
- `AnthropicAdapter.executeAgentPrompt()` - Uses Anthropic tool_use format (streaming)

Both implement `convertTools(AgentToolDefinition[])` to transform to provider format.

### Frontend Tool Management

- `AgentNode.tsx` - Renders agent node with attached tools box
- `ToolSelectorModal.tsx` - Modal for browsing/selecting/configuring tools
- `AgentToolsBox.tsx` - Visual display of enabled tools on the node
- `useApiQueries.ts` - `useAgentTools()` hook fetches from `/agent/tools`

Tool instances support per-instance configuration (custom name, description, params).

### Adding a New Agent Tool

**Option A: Create a new action** (preferred — also becomes a flow node)
1. Create `pkg/core/src/actions/<provider>/<action-name>.ts` using `defineAction()`
2. Export from the provider's `index.ts` barrel
3. Add to `allBuiltinActions` in `pkg/core/src/actions/index.ts`
4. The action auto-registers as both a flow node AND an agent tool during `Invect.initialize()`

**Option B: Create standalone tool** (no corresponding node — utility tools only)
1. Create `pkg/core/src/services/agent-tools/builtin/<tool-name>.ts`
2. Export `<toolName>Definition: AgentToolDefinition` and `<toolName>Executor: AgentToolExecutor`
3. Register in `pkg/core/src/services/agent-tools/builtin/index.ts`

### Key Files for Agent/Tool System

- `pkg/core/src/nodes/agent-executor.ts` - Agent node executor + loop logic
- `pkg/core/src/types/agent-tool.types.ts` - All agent/tool type definitions
- `pkg/core/src/services/agent-tools/agent-tool-registry.ts` - Tool registration + global registry
- `pkg/core/src/services/agent-tools/builtin/` - Standalone tool implementations
- `pkg/core/src/actions/action-registry.ts` - Action registry (primary source of tools)
- `pkg/core/src/actions/action-executor.ts` - executeActionAsNode() + executeActionAsTool() bridges
- `pkg/core/src/services/ai/openai-adapter.ts` - OpenAI tool calling
- `pkg/core/src/services/ai/anthropic-adapter.ts` - Anthropic tool calling
- `pkg/frontend/src/components/nodes/AgentNode.tsx` - Agent node UI
- `pkg/frontend/src/components/nodes/ToolSelectorModal.tsx` - Tool selection UI

## OAuth2 Credential System

Invect supports OAuth2 authentication for connecting to third-party services like Google, GitHub, Slack, etc. The system handles the complete OAuth2 flow including authorization, token exchange, and automatic token refresh.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OAuth2 Provider Registry                     │
│  pkg/core/src/services/credentials/oauth2-providers.ts          │
├─────────────────────────────────────────────────────────────────┤
│  Built-in providers: Google (Docs, Sheets, Drive, Gmail,        │
│  Calendar), GitHub, Slack, Microsoft 365, Notion, Jira, etc.    │
│  Each defines: authorizationUrl, tokenUrl, scopes, refresh      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OAuth2Service                                │
│  pkg/core/src/services/credentials/oauth2.service.ts            │
├─────────────────────────────────────────────────────────────────┤
│  - startAuthorizationFlow() → Generate auth URL + PKCE          │
│  - exchangeCodeForTokens() → Exchange code for tokens           │
│  - refreshAccessToken() → Refresh expired tokens                │
│  - State management for CSRF protection                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CredentialsService                              │
│  pkg/core/src/services/credentials/credentials.service.ts       │
├─────────────────────────────────────────────────────────────────┤
│  - getDecryptedWithRefresh() → Auto-refresh expired tokens      │
│  - Encrypted storage via EncryptionService                      │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth2 Flow Sequence

```
1. User clicks "Connect Google Docs" in frontend
   └── Frontend calls: POST /credentials/oauth2/start
       └── Backend: OAuth2Service.startAuthorizationFlow()
           └── Returns: { authorizationUrl, state }

2. Frontend opens popup with authorizationUrl
   └── User authorizes in Google's UI
       └── Google redirects to callback with ?code=...&state=...

3. Popup sends code+state to parent window via postMessage
   └── Frontend calls: POST /credentials/oauth2/callback
       └── Backend: OAuth2Service.exchangeCodeForTokens()
           └── Creates encrypted Credential record
               └── Returns: Credential { id, name, config: { accessToken, refreshToken, ... } }

4. When tool/node uses the credential:
   └── credentialsService.getDecryptedWithRefresh(credentialId)
       └── If token expired && has refreshToken:
           └── OAuth2Service.refreshAccessToken()
           └── Update credential in DB
       └── Return credential with valid accessToken
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/credentials/oauth2/providers` | GET | List all available OAuth2 providers |
| `/credentials/oauth2/providers/:id` | GET | Get specific provider details |
| `/credentials/oauth2/start` | POST | Start OAuth flow, returns auth URL |
| `/credentials/oauth2/callback` | POST | Exchange code for tokens, create credential |
| `/credentials/:id/refresh` | POST | Force refresh an OAuth2 credential |

### Adding a New OAuth2 Provider

Add provider definition to `pkg/core/src/services/credentials/oauth2-providers.ts`:

```typescript
export const OAUTH2_PROVIDERS: Record<string, OAuth2ProviderDefinition> = {
  // ... existing providers ...
  
  my_service: {
    id: "my_service",
    name: "My Service",
    description: "Access My Service API",
    icon: "Cloud",  // Lucide icon name
    authorizationUrl: "https://myservice.com/oauth/authorize",
    tokenUrl: "https://myservice.com/oauth/token",
    defaultScopes: ["read", "write"],
    additionalAuthParams: {
      // Provider-specific params (e.g., access_type, prompt)
    },
    supportsRefresh: true,
    docsUrl: "https://myservice.com/docs/oauth",
    category: "other",  // "google" | "microsoft" | "github" | "slack" | "other"
  },
};
```

### Frontend Components

- **`OAuth2ProviderSelector`** - Modal to browse/select providers and enter client credentials
- **`OAuth2ConnectButton`** - Button that triggers OAuth popup flow
- **`OAuth2CallbackHandler`** - Component for the `/oauth/callback` page

### Using OAuth2 Credentials in Actions

When implementing actions that need OAuth2 credentials:

```typescript
export const myAction = defineAction({
  id: 'my_provider.my_action',
  // ...
  credential: {
    required: true,
    oauth2Provider: 'my_service',
    description: 'My Service OAuth2 credential',
  },

  async execute(params, context) {
    const credential = context.credential;
    if (!credential?.config?.accessToken) {
      return { success: false, error: 'OAuth2 credential required' };
    }

    // Use the access token (auto-refreshed by getDecryptedWithRefresh)
    const response = await fetch("https://api.example.com/data", {
      headers: {
        Authorization: `Bearer ${credential.config.accessToken}`,
      },
    });

    return { success: true, output: await response.json() };
  },
});
```

### CredentialConfig Fields for OAuth2

```typescript
interface CredentialConfig {
  // OAuth2 tokens
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;        // Usually "Bearer"
  scope?: string;            // Granted scopes
  expiresAt?: string;        // ISO timestamp when accessToken expires
  
  // OAuth2 app credentials (stored for refresh)
  clientId?: string;
  clientSecret?: string;
  
  // Provider identification
  oauth2Provider?: string;   // e.g., "google_docs", "github"
  
  // Custom provider URLs (for non-standard providers)
  authorizationUrl?: string;
  tokenUrl?: string;
}
```

### Key Files

- `pkg/core/src/services/credentials/oauth2-providers.ts` - Provider definitions
- `pkg/core/src/services/credentials/oauth2.service.ts` - OAuth2 flow logic
- `pkg/core/src/services/credentials/credentials.service.ts` - Credential storage + auto-refresh
- `pkg/express/src/invect-router.ts` - OAuth2 API endpoints
- `pkg/frontend/src/components/credentials/OAuth2ProviderSelector.tsx` - Provider selection UI
- `pkg/frontend/src/components/credentials/OAuth2ConnectButton.tsx` - Connect button + popup handling
- `pkg/frontend/src/hooks/useApiQueries.ts` - `useOAuth2Providers()`, `useStartOAuth2Flow()`, etc.

## Pitfalls & Key Files

**Pitfalls**: Node executors are singletons (use `NodeExecutionContext` for state) | Always Zod validate inputs | Handle batch `state: "PENDING"` | Test SQLite + PostgreSQL | Types from `@invect/core/types` (never duplicate) | Restart watch if stalled

### tsconfig `paths` Inheritance & pnpm Workspace Bundling (CRITICAL)

The root `tsconfig.json` has `"paths": { "src/*": ["pkg/core/src/*"] }` for core development convenience. **Any package tsconfig that extends root MUST override `paths` to `{}`**, otherwise tsdown/rolldown follows the path alias into core's source tree and inlines all of `@invect/core` (18+ MB) into the package dist instead of keeping it as an external `import ... from "@invect/core"`.

**Root cause**: pnpm workspace links `@invect/core` via symlink (`node_modules/@invect/core → ../../../core`). When tsdown resolves imports, the inherited `src/*` path alias directs the resolver into `../core/src/...` — a relative file path — so `external`/`deps.neverBundle` patterns like `@invect/core` never match. The fix is to override `paths: {}` so tsdown resolves `@invect/core` as a bare package specifier.

**Also note**: The root tsconfig has `"noEmit": true`. Packages that use `tsc --emitDeclarationOnly` must override `"noEmit": false` or tsc silently emits zero `.d.ts` files (exits 0 with no output).

```jsonc
// CORRECT — any pkg that extends root tsconfig
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,        // Override root's noEmit: true
    "baseUrl": ".",         // Override root's baseUrl
    "paths": {}             // Override root's src/* alias — CRITICAL
  }
}

// WRONG — inherits root paths, causes @invect/core to be bundled
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    // Missing paths override → tsdown inlines core into dist
  }
}
```

**Symptoms if missing**: dist output is 18+ MB instead of <500 KB | `head dist/index.js` shows `from "./pkg/core/src/..."` instead of `from "@invect/core"` | `tsc --emitDeclarationOnly` produces no `.d.ts` files

**tsdown v0.21+**: Use `deps.neverBundle` instead of the deprecated `external` option. Also use `outExtensions` (plural) instead of `outExtension` (singular, silently ignored).

**Key Files**: `flow-orchestration.service.ts` (execution) | `flow-run-coordinator.ts` (flow run lifecycle) | `node-execution-coordinator.ts` (input data + template resolution) | `nunjucks.service.ts` (templating) | `executor-registry.ts` (nodes) | `service-factory.ts` (DI) | `schema-*.ts` (DB) | `types/` + `types-fresh.ts` (types) | `agent-executor.ts` (agent loop) | `agent-tool-registry.ts` (tools) | `actions/action-registry.ts` (action registry) | `actions/action-executor.ts` (action→node/tool bridge) | `actions/types.ts` (action types) | `TEST_IMPLEMENTATION_EXAMPLES.md`

**Plugin Key Files**: `types/plugin.types.ts` (plugin types) | `services/plugin-manager.ts` (lifecycle) | `database/core-schema.ts` (abstract DB schema) | `database/schema-merger.ts` (merge) | `database/schema-generator.ts` (codegen) | `database/schema-verification.ts` (startup verification) | `pkg/plugins/auth/` (auth plugin) | `pkg/plugins/rbac/` (RBAC plugin)

**CLI Key Files**: `pkg/cli/src/commands/` (all commands) | `pkg/cli/src/generators/` (schema generators) | `pkg/cli/src/utils/config-loader.ts` (config discovery)

## When Adding/Updating/Removing Node Types

New node types should be added as **actions** using the `defineAction()` pattern. The legacy `BaseNodeExecutor` pattern is only used for the AGENT node.

### Adding a New Action (Recommended Path)

#### 1. Create the Action File

Create `pkg/core/src/actions/<provider>/<action-name>.ts`:

```typescript
import { defineAction } from '../define-action';
import { MY_PROVIDER } from '../providers';
import { z } from 'zod/v4';

export const myAction = defineAction({
  id: 'my_provider.my_action',  // This becomes the node type string
  name: 'My Action',
  description: 'What this action does',
  provider: MY_PROVIDER,

  params: {
    schema: z.object({ /* Zod schema for params */ }),
    fields: [{ name: 'param1', label: 'Parameter', type: 'text', required: true }],
  },

  async execute(params, context) {
    // params are Zod-validated and template-resolved
    // context.credential has OAuth2 tokens if needed
    // context.incomingData has upstream node outputs
    // context.functions has service functions (submitPrompt, getCredential, etc.)
    return { success: true, output: result };
  },
});
```

#### 2. Register the Action

1. Export from `pkg/core/src/actions/<provider>/index.ts` barrel
2. Add to `allBuiltinActions` array in `pkg/core/src/actions/index.ts`
3. If new provider, add `ProviderDef` to `pkg/core/src/actions/providers.ts`

#### 3. Frontend (if needed)

- Most actions render automatically using the dynamic node system
- Custom node visuals go in `pkg/frontend/src/components/nodes/`
- The node palette reads action definitions from the API

#### 4. Framework Packages (rarely needed)

- Standard flow execution handles most actions automatically
- Only add custom API routes if the action needs testing/preview endpoints

### Areas That May Still Need Updates

#### Type System
- Export any new types from `pkg/core/src/types-export.ts` for frontend consumption
- Remember: `types-export.ts` must use `import type` only (no runtime code)

#### Database (if action stores data)
- Update ALL THREE schemas: `schema-sqlite.ts`, `schema-postgres.ts`, `schema-mysql.ts`
- Run `cd pkg/core && pnpm db:generate`

### Common Pitfalls

- **Missing from `allBuiltinActions`**: Action created but not added to barrel → invisible at runtime
- **Type sync issues**: Backend types updated but not exported for frontend → import errors
- **Partial database updates**: Only one schema file updated → crashes on other database types
- **Missing validation**: No Zod schema → invalid data passes through
- **Stale type caches**: Types exported but bundler not rebuilding → stale imports
- **Runtime imports in types-export.ts**: Pulls in Node.js code → breaks frontend build

## When Adding New Features (Non-Node)

1. **New service**: Add to `pkg/core/src/services/`, wire in `service-factory.ts`, export from `pkg/core/src/index.ts`
2. **New API endpoint**: Add to `Invect` core class, add routes to framework packages, update frontend API client
3. **Database schema change**: Update ALL THREE schema files, run `pnpm db:generate`, test migration

## Plugin System

Invect has a **composable plugin system** (inspired by better-auth) where plugins declare actions, lifecycle hooks, API endpoints, database schema, and middleware. Plugins span both backend and frontend.

### Plugin Architecture

```
┌─────────────────────────────────────────────────────┐
│                Plugin (InvectPlugin)                │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Schema  │ │ Actions │ │Endpoints │ │  Hooks   │ │
│  │(DB tabs)│ │(nodes)  │ │(API rtes)│ │(lifecycl)│ │
│  └─────────┘ └─────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
   CLI generates     ActionRegistry   Framework adapters
   Drizzle files     auto-registers   mount routes
```

### InvectPlugin Interface

```typescript
interface InvectPlugin {
  id: string;                              // Unique identifier (required)
  name?: string;                           // Display name
  init?: (ctx: InvectPluginContext) => Promise<InvectPluginInitResult | void>;
  schema?: InvectPluginSchema;            // Abstract DB tables (dialect-agnostic)
  requiredTables?: string[];               // Tables that must exist at startup
  actions?: ActionDefinition[];            // Flow nodes + agent tools
  endpoints?: InvectPluginEndpoint[];     // Custom API routes
  hooks?: InvectPluginHooks;              // Lifecycle hooks (7 hook points)
  setupInstructions?: string;              // Shown when required tables are missing
  $ERROR_CODES?: Record<string, {...}>;    // Custom error codes
  shutdown?: () => Promise<void> | void;   // Cleanup on shutdown
}
```

### Plugin Hooks

| Hook | When | Can short-circuit? |
|------|------|--------------------|
| `beforeFlowRun` | Before flow execution | Yes — returning `{ cancel: true }` stops the run, or `{ inputs }` to modify inputs |
| `afterFlowRun` | After flow completes | No |
| `beforeNodeExecute` | Before each node | Yes — returning `{ skip: true }` skips node, or `{ params }` to override |
| `afterNodeExecute` | After each node | No, but can return `{ output }` to override |
| `onRequest` | Before every API request | Yes — return `{ response }` to intercept, or `{ request }` to modify |
| `onResponse` | After every API response | Can return `{ response }` to replace |
| `onAuthorize` | During auth checks | Yes — return `{ allowed: true/false }` to override |

### Frontend Plugin Interface

The `InvectFrontendPlugin` interface is currently defined in `pkg/plugins/rbac/src/frontend/types.ts` (not yet promoted to core). It defines how plugins contribute UI elements:

```typescript
interface InvectFrontendPlugin {
  id: string;
  name?: string;
  sidebar?: PluginSidebarContribution[];           // Nav items
  routes?: PluginRouteContribution[];              // Pages
  panelTabs?: PluginPanelTabContribution[];        // Editor panel tabs
  headerActions?: PluginHeaderActionContribution[]; // Action buttons
  components?: Record<string, ComponentType>;      // Named component implementations
  providers?: ComponentType<{ children }>[];       // React context providers
  apiHeaders?: () => Record<string, string>;       // Inject API request headers
  checkPermission?: (perm, ctx?) => boolean | undefined;
}
```

### Plugin Registration & Lifecycle

```typescript
// Plugins are passed in the Invect config
new Invect({
  databaseUrl: '...',
  plugins: [betterAuthPlugin({ auth }), rbacPlugin()],
});
```

**Initialization sequence** (in `Invect.initialize()`):
1. Action registry created, all built-in actions registered
2. `pluginManager.initializePlugins()` called:
   - For each plugin: register `plugin.actions` → call `plugin.init(context)`
3. Node registry initialized (only registers `AgentNodeExecutor`)
4. `registerActionsAsTools()` — converts all actions to agent tools
5. `initializeServices()` → `ServiceFactory` built, `DatabaseService.initialize()` runs:
   - Core table existence check (from `core-schema.ts`)
   - Plugin table existence check (`requiredTables` or inferred from `schema`)
   - Opt-in detailed schema verification (columns)

**Shutdown**: Plugins shut down in **reverse order** (last initialized → first shutdown).

### Official Plugins

#### `@invect/user-auth` (pkg/plugins/auth)

Better Auth integration. Backend (`src/backend/`) wraps a better-auth instance, proxies auth routes (sign-in, session) as plugin endpoints. The `onRequest` hook resolves sessions. The `onAuthorize` hook enforces session-based access.

**Admin-only user management**: Sign-up is disabled in the UI. The initial admin user is seeded on startup from `INVECT_ADMIN_EMAIL` / `INVECT_ADMIN_PASSWORD` env vars (or `adminEmail`/`adminPassword` plugin options). Subsequent users are created by admins through the `UserManagement` component or the `POST /plugins/auth/users` endpoint.

Frontend (`src/frontend/`) exports: `AuthProvider`, `useAuth`, `SignInForm`, `SignInPage`, `UserButton`, `AuthGate`, `UserManagement`, `AuthenticatedInvect`.

Shared types (`src/shared/`) are browser-safe.

#### `@invect/rbac` (pkg/plugins/rbac)

Role-Based Access Control. Depends on the auth plugin. Backend provides flow access management endpoints and the `onAuthorize` hook enforces flow-level ACLs.

Frontend contributes: sidebar items, routes (`/access`), panel tabs (`FlowAccessPanel`), header actions (`ShareButton`), context providers (`RbacProvider`).

### Frontend Component Composition: Shell → Plugin → Core

The `@invect/frontend` package scopes **all** CSS (Tailwind utilities, theme tokens, dark mode) inside a `.invect` CSS class. Any component that uses `imp-*` theme tokens (e.g., `bg-imp-background`, `border-imp-border`) **must render inside this scope** or the styles won't apply.

This matters for plugins like `@invect/user-auth` that render UI (sign-in page) *before* the full `<Invect />` component mounts — the sign-in form needs theme tokens but sits outside the Invect router.

#### The Three Layers

```
┌───────────────────────────────────────────────────────────┐
│  InvectShell  (@invect/frontend)                        │
│  └─ <div class="invect light|dark">                      │
│     CSS scope: all imp-* tokens, Tailwind utilities,      │
│     dark mode, font, shadows                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Plugin UI  (@invect/user-auth, @invect/rbac)     │  │
│  │  └─ AuthProvider → AuthGate                         │  │
│  │     ├─ fallback: SignInPage (uses imp-* tokens ✓)   │  │
│  │     └─ children: ↓                                  │  │
│  │                                                     │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │  Invect  (@invect/frontend)                 │  │  │
│  │  │  └─ <div class="invect"> (nested, harmless)  │  │  │
│  │  │     └─ Router → Layout → Sidebar → Pages      │  │  │
│  │  │     Full app shell with all providers          │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

#### `InvectShell` — CSS Scope Only

`InvectShell` (`pkg/frontend/src/InvectShell.tsx`) is a lightweight wrapper that **only** provides:
- The `.invect` CSS class (activates all theme tokens and scoped Tailwind)
- Theme resolution (light / dark / system, with OS preference listener)

It does **not** include routing, sidebar, API providers, QueryClient, or any app logic. Use it when you need Invect styling around content that renders outside the full `<Invect />` component.

```typescript
// @invect/frontend exports:
export { Invect } from './Invect';           // Full app (router + sidebar + providers)
export { InvectShell } from './InvectShell'; // CSS scope only (no app logic)
```

#### `AuthenticatedInvect` — The Composition Pattern

`AuthenticatedInvect` (`pkg/plugins/auth`) is the recommended way to compose all three layers. It accepts both the `Invect` component and the `InvectShell` as props (avoiding a hard dependency on `@invect/frontend`):

```typescript
import { Invect, InvectShell } from '@invect/frontend';
import { AuthenticatedInvect } from '@invect/user-auth/ui';
import '@invect/frontend/styles';

<AuthenticatedInvect
  apiBaseUrl="/api/invect"
  basePath="/invect"
  InvectComponent={Invect}        // Full app, rendered when authenticated
  ShellComponent={InvectShell}     // CSS scope, wraps everything
  theme="light"                     // Shell theme
/>
```

When `ShellComponent` is provided, the render tree is:
```
InvectShell (.invect CSS scope)
  └─ QueryClientProvider
      └─ AuthProvider
          └─ AuthGate
              ├─ loading: <LoadingSpinner />  ← has imp-* tokens ✓
              ├─ fallback: <SignInPage />      ← has imp-* tokens ✓
              └─ children: <Invect />         ← has its own nested .invect (harmless)
```

When `ShellComponent` is **not** provided, plugin UI renders without Invect styling and must rely on the host app's CSS (useful if the host app provides its own design system).

#### Why Not Just Use `<Invect />`?

`<Invect />` includes a full React Router with sidebar navigation. It **cannot** render a sign-in page as a fallback because:
1. The router takes over the entire mount point
2. The sidebar renders before auth state is known
3. Plugin UI (auth gates, RBAC panels) needs to render *around* Invect, not inside it

`InvectShell` solves this by providing **just the CSS scope** — plugins can render their own UI (sign-in forms, permission gates) with full Invect theming, then hand off to the full `<Invect />` component once their preconditions are met.

#### Rules for Plugin Frontend Components

1. **Always use `imp-*` theme tokens** — `bg-imp-background`, `text-imp-foreground`, `border-imp-border`, etc. Never use raw colors.
2. **Assume the `.invect` scope exists** — either from `InvectShell` or from the `<Invect />` component's own wrapper.
3. **Accept components as props** — plugins should accept `InvectComponent` and `ShellComponent` as props rather than importing `@invect/frontend` directly. This avoids circular dependencies and allows tree-shaking.
4. **Dark mode works automatically** — the shell resolves `system` → `light`/`dark` and adds the class. Components just use `imp-*` tokens.

### Plugin Schema System

Plugins declare database tables using an **abstract schema format** (dialect-agnostic). The CLI merges core + plugin schemas and generates dialect-specific Drizzle files.

There are **two distinct mechanisms** for plugin DB requirements:

1. **`schema`** — Abstract table definitions used by `npx invect generate` to produce Drizzle schema files. Plugins that declare `schema` get their tables included in the generated output automatically.
2. **`requiredTables`** — A list of table names checked at **startup** (existence check only). Used when a plugin relies on externally-managed tables (e.g., better-auth creates its own). If `requiredTables` is not set but `schema` is, table names are **inferred from `schema`** automatically.

The auth plugin uses **both**: it declares `schema` (so `npx invect generate` includes the auth tables in the Drizzle files) AND `requiredTables` (so the startup check verifies them before the app runs).

```typescript
// Plugin schema declaration
const myPlugin: InvectPlugin = {
  id: 'my-plugin',
  schema: {
    // New table — will be included in generated Drizzle files
    my_table: {
      fields: {
        id: { type: 'string', primaryKey: true },
        name: { type: 'string', required: true },
        flowId: { type: 'string', references: { table: 'flows', field: 'id' } },
      },
    },
    // Extend existing core table (additive only — new fields merged in)
    flows: {
      fields: {
        tenantId: { type: 'string' },  // Adds column to core flows table
      },
    },
  },
  // Optional: explicit list of tables to check at startup
  // If omitted, inferred from schema keys above
  requiredTables: ['my_table'],
};
```

#### Startup Table Verification

During `DatabaseService.initialize()`, two checks run in sequence:

1. **Core table check** — Verifies all core Invect tables exist (from `core-schema.ts`)
2. **Plugin table check** — For each plugin, checks `requiredTables` (explicit) or infers from `schema` keys. Missing tables produce a clear, plugin-attributed error with setup instructions.

If tables are missing, the error message directs the developer to:
```
npx invect generate   # generate schema files (core + plugins)
npx drizzle-kit push   # push schema to the database
```

### Adding a New Plugin

1. Create `pkg/plugins/<name>/` with `src/backend/`, `src/frontend/`, `src/shared/` directories
2. Backend: export a factory function returning `InvectPlugin`
3. Frontend: export an `InvectFrontendPlugin` object
4. Shared: export browser-safe types only
5. If plugin has DB tables: declare in `schema`, run `npx invect generate` to regenerate Drizzle files
6. Register in consumer app: `plugins: [myPlugin()]` in Invect config

### Key Plugin Files

- `pkg/core/src/types/plugin.types.ts` — All plugin type definitions (`InvectPlugin`, hooks, schema types)
- `pkg/core/src/services/plugin-manager.ts` — `PluginManager` class (lifecycle, hook execution)
- `pkg/core/src/invect-core.ts` — Plugin integration in `Invect` class
- `pkg/core/src/database/core-schema.ts` — Core DB tables in abstract format
- `pkg/core/src/database/schema-merger.ts` — Merges core + plugin schemas
- `pkg/core/src/database/schema-generator.ts` — Generates dialect-specific Drizzle files
- `pkg/core/src/database/schema-verification.ts` — Detailed startup schema verification (opt-in, checks columns)
- `pkg/core/src/services/database/database.service.ts` — Startup table existence checks (core + plugin)
- `pkg/plugins/auth/` — `@invect/user-auth` plugin
- `pkg/plugins/rbac/` — `@invect/rbac` plugin

## CLI (`@invect/cli`)

The CLI (`npx invect <command>`) manages project initialization, database schema generation, and migrations. Published as `@invect/cli`.

### Commands

| Command | Description |
|---------|-------------|
| `npx invect init` | Interactive setup wizard — detects framework, installs deps, creates `invect.config.ts`, generates schemas, runs initial migration |
| `npx invect generate` | Generates Drizzle schema files (all 3 dialects) from core + plugin schemas. Optionally chains to migration |
| `npx invect migrate` | Applies pending migrations via `drizzle-kit migrate` or pushes schema directly with `drizzle-kit push` (dev mode) |
| `npx invect info` | Displays diagnostic info — system, frameworks, databases, config, plugins |
| `npx invect secret` | Generates a cryptographically secure 32-byte base64 key for `INVECT_ENCRYPTION_KEY` |

### Config Loading (`invect.config.ts`)

The CLI discovers and loads `invect.config.ts` (or `.js`/`.mjs`) using **jiti** for runtime TypeScript support:

1. **Discovery**: Searches `.`, `src`, `lib`, `config`, `utils` directories (or explicit `--config` path)
2. **TSConfig alias resolution**: Reads `tsconfig.json` (follows `extends` for monorepos) to resolve path aliases
3. **Loading**: Uses jiti with TypeScript + path alias support
4. **Validation**: Ensures each plugin has an `id` property

```typescript
// invect.config.ts
import type { InvectConfig } from '@invect/core';
import { betterAuthPlugin } from '@invect/user-auth/backend';

export const invectConfig: InvectConfig = {
  baseDatabaseConfig: {
    type: 'sqlite',
    connectionString: 'file:./dev.db',
    id: 'main',
  },
  plugins: [betterAuthPlugin({ auth })],
};
```

### Schema Generation Pipeline

```
invect generate
  ├── Load invect.config.ts (config-loader.ts)
  ├── Import core schema + dialect generators from @invect/core
  ├── mergeSchemas(coreSchema, ...pluginSchemas)
  │   └── Validates no conflicting field definitions
  ├── Generate 3 dialect files (SQLite, PostgreSQL, MySQL)
  │   └── Compare against existing files → skip unchanged
  ├── Display summary (table counts, per-plugin details)
  ├── Prompt for confirmation
  ├── Write changed files to disk
  └── Optionally chain to `invect migrate`
```

### CLI Key Files

- `pkg/cli/src/index.ts` — CLI entry point (Commander.js)
- `pkg/cli/src/api.ts` — Programmatic API for tests/scripts
- `pkg/cli/src/commands/` — Command implementations (init, generate, migrate, info, secret)
- `pkg/cli/src/generators/` — Schema generators (Drizzle + Prisma)
- `pkg/cli/src/utils/config-loader.ts` — Config discovery + jiti loading
- `pkg/cli/test/` — Tests for generation, diff, Prisma merge, fixtures

## Playwright Tests

Playwright tests validate API parity across all framework adapters, frontend rendering, and end-to-end UI workflows.

### Running Playwright Tests

```bash
pnpm test:pw          # Run all Playwright tests
pnpm test:pw:ui       # Interactive UI mode
pnpm test:pw:headed   # Headed browser mode
```

### Test Structure

```
playwright/
├── playwright.config.ts           # Config: 3 test projects, shared web servers
├── tests/
│   ├── fixtures.ts                # Shared helpers (navigateToFlow, openNodeConfigPanel, etc.)
│   ├── seed.spec.ts               # Bootstrap test: proves app is alive
│   ├── config-panel/              # 4 specs testing node config panel UI
│   ├── credentials/               # 9 specs testing credential management (CRUD, webhooks)
│   └── platform/                  # Cross-platform API parity + frontend rendering
│       ├── shared-api-contract.ts # runApiContract() — shared CRUD contract
│       ├── test-server.ts         # Isolated Express test server
│       ├── test-server-nestjs.ts  # Isolated NestJS test server
│       ├── test-server-nextjs.ts  # Isolated Next.js handler test server
│       ├── platform-fixtures.ts   # Server isolation fixtures
│       ├── express-api.spec.ts    # Express API parity
│       ├── nestjs-api.spec.ts     # NestJS API parity
│       ├── nextjs-api.spec.ts     # Next.js API parity
│       ├── express-frontend.spec.ts  # Vite + Express frontend integration
│       └── nextjs-frontend.spec.ts   # Next.js frontend rendering
```

### Three Test Projects

| Project | Match Pattern | Description |
|---------|--------------|-------------|
| **api** | `platform/(express\|nestjs\|nextjs)-api.spec.ts` | API parity tests — each worker spawns its own isolated server |
| **frontend** | `platform/(express\|nextjs)-frontend.spec.ts` | Frontend rendering tests — use shared dev servers |
| **e2e** | Everything outside `platform/` | Config panel, credentials, seed — use shared dev servers |

### Database Configuration for Tests

**API tests (platform/)**: Each Playwright **worker** gets a completely isolated SQLite database:

1. A temp file is created per worker
2. Drizzle migrations run from `pkg/core/drizzle/` on the fresh temp file
3. A test server (Express/NestJS/Next.js) is spawned as a **child process** with a random free port and `DATABASE_URL` pointing to the temp file
4. After all tests in the worker finish, the child process is killed and the DB file is deleted (including `-journal`, `-wal`, `-shm` files)

**Frontend/E2E tests**: Use the shared Express dev server on port 3000 with its `./db/invect.db` in `examples/express-drizzle/`.

### Shared API Contract (`shared-api-contract.ts`)

The `runApiContract()` function validates **identical behavior** across Express, NestJS, and Next.js:

1. **Flow CRUD**: List → Create → Get by ID → Get versions → Get React Flow → Delete
2. **Credential CRUD**: List → Create → Get by ID → Test → Delete → Verify deleted
3. **Agent tools**: Returns non-empty array with `id`/`name` fields
4. **Node data**: Returns valid response
5. **Flow runs**: Returns valid response
6. **Cleanup**: Deletes test flows and credentials by name pattern

### Shared Web Servers (frontend/e2e projects only)

The `playwright.config.ts` defines shared web servers that start before tests:

1. **Express backend** on `http://localhost:3000` (from `examples/express-drizzle/`)
2. **Vite frontend** on `http://localhost:5173` (from `examples/vite-react-frontend/`)
3. **Next.js example** on `http://localhost:3002` (from `examples/nextjs-app-router/`)

Servers reuse existing instances if already running locally.

### Custom Test Fixtures (`fixtures.ts`)

Extended Playwright `test` with helpers:
- `navigateToFlow(flowName)` — Navigate to dashboard, find flow card, click it
- `openNodeConfigPanel(nodeName)` — Double-click a node, wait for dialog
- `closeConfigPanel()` — Press Escape
- `runNode()` / `runNodeAndWait()` — Click "Run Node" button, wait for completion
- `getEditorContent()` / `getEditorJSON()` — Read CodeMirror editor content
- `ensureNoLoadingSpinner()` — Guard against loading state rendering bugs
- `parseJSON(text)` — Parse JSON or throw with context

### Key Playwright Files

- `playwright/playwright.config.ts` — Test configuration, projects, web servers
- `playwright/tests/fixtures.ts` — Shared test helpers
- `playwright/tests/platform/shared-api-contract.ts` — Cross-platform API validation
- `playwright/tests/platform/test-server.ts` — Isolated Express test server spawner
- `playwright/tests/platform/test-server-nestjs.ts` — Isolated NestJS test server spawner
- `playwright/tests/platform/test-server-nextjs.ts` — Isolated Next.js test server spawner

## Core E2E Tests (`pkg/core/e2e/`)

Separate from Playwright — these are **programmatic E2E tests** that exercise the `Invect` core directly (no HTTP, no browser).

- **Run**: `pnpm test:e2e` — initializes `Invect` with a local SQLite file, runs all examples sequentially
- **Requires**: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for AI-powered tests
- **Entry point**: `e2e/run.ts` — creates `Invect` instance, runs each example's `setup()` + `run()` + `assert()`

**Test examples** (8 files):

| File | AI Required? | What it tests |
|------|-------------|---------------|
| `loop-flow.ts` (3 examples) | No | Loop-over: array output, object output, concat output |
| `complex-branching-flow.ts` (2 examples) | No | If/else branching logic |
| `input-template-model.ts` | Yes | Input → template → AI model chain |
| `comprehensive-flow.ts` (2 examples) | Yes | All node types combined |
| `simple-agent-flow.ts` | Yes | Agent with tool calling |
| `complex-agent-flow.ts` | Yes | Complex agent workflows |

## Drizzle Configuration Files

Multiple `drizzle.config.*` files exist for different contexts:

| Location | Dialect | Schema | Migrations | DB URL | Purpose |
|----------|---------|--------|------------|--------|---------|
| `pkg/core/drizzle.config.sqlite.ts` | SQLite | `src/database/schema-sqlite.ts` | `drizzle/sqlite/` | `./dev.db` (hardcoded) | Core dev + test migrations (used by Playwright test servers) |
| `pkg/core/drizzle.config.ts` | PostgreSQL | `src/database/schema-*.ts` (wildcard) | `drizzle/` | `DATABASE_URL` env or `postgresql://localhost:5432/invect` | Core PostgreSQL migrations |
| `examples/express-drizzle/drizzle.config.ts` | SQLite | `./db/schema.ts` | `drizzle/` | `DB_FILE_NAME` env | Express example migrations |
| `examples/nextjs-drizzle-auth-rbac/drizzle.config.ts` | PostgreSQL | `./db/schema.ts` | `drizzle/` | `DATABASE_URL` env or `postgresql://acme:acme@localhost:5432/acme_dashboard` | Next.js + auth example migrations |