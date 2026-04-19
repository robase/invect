# Flow Execution Primitives — Implementation Plan

## Goal

Expose a minimal, self-contained toolkit that can execute a TypeScript-native flow
definition end-to-end — including flow orchestration, branching, agent loops, model
calls, and action execution — without requiring:

- A database or persistence layer
- NestJS/Express DI framework
- The plugin hook system

**There is no template parsing.** Instead of `{{ expr }}` string interpolation, params
that need dynamic values are native TypeScript functions that receive the upstream node
context:

```ts
// Full engine (JSON-serialized, stored in DB)
{
  prompt: 'Summarise this: {{ document.text }}';
}

// Primitives (TypeScript, evaluated natively)
{
  prompt: (ctx) => `Summarise this: ${ctx.document.text}`;
}
```

**QuickJS note.** Three core actions — `core.if_else`, `core.javascript`, and
`core.switch` — import the QuickJS singleton directly at the module level with no
injection point. They cannot be reused in the primitives package without carrying WASM.
These are **forked** as primitive-specific variants with function-typed params. All other
existing `ActionDefinition` implementations (Gmail, HTTP, Slack, etc.) are reused as-is.

---

## Pre-work: fix existing compiler bug

**Before starting primitives work**, fix a confirmed bug in
`pkg/plugins/cloudflare-agents/src/compiler/flow-compiler.ts:205`:

```ts
// BUG — reads params.condition, but the action schema field is params.expression
String(node.params.condition ?? 'true');

// Fix
String(node.params.expression ?? 'true');
```

Every if/else node compiled to a Cloudflare Workflow currently always takes the true
branch. This is independent of the primitives work and should be shipped immediately.

---

## Scope

### In scope

- Topological graph traversal
- Callable param resolution (`(ctx: NodeContext) => value` or a plain value)
- Action param validation and execution (Zod, coercion, credential resolution)
- `primitives.if_else` — forked variant, condition is `(ctx) => boolean`
- `primitives.switch` — forked variant, cases are `{ condition: (ctx) => boolean, slug: string }[]`
- `primitives.javascript` — forked variant, code is `(ctx) => unknown`
- `core.input`, `core.output`, `core.model` — reused as-is
- `AGENT` node execution (via injected `submitAgentPrompt`; entire loop runs inside one adapter step)
- Node mapper functions (data reshaping before a node runs)
- Building `NodeContext` from upstream outputs
- `DurabilityAdapter` interface for pluggable step execution, sleep, and event waiting
- `InMemoryAdapter` — no-op adapter for local dev and short synchronous flows
- `defineFlow()` validation: reserved key checks, duplicate referenceId detection

### Out of scope

- `{{ expr }}` template string parsing — callers use native TS functions
- `core.template_string` — superseded by function params
- `beforeFlowRun` / `afterFlowRun` plugin hooks
- `executeFlowToNode` (partial execution)
- OAuth2 token refresh in `resolveCredential` — callers own this

---

## Flow definition format

```ts
import { defineFlow, input, output, model, ifElse, switchNode } from '@flow/primitives';
import { gmail } from '@flow/primitives/providers';

export default defineFlow({
  nodes: [
    input('query'),

    model('classify', {
      credentialId: process.env.OPENAI_CREDENTIAL,
      model: 'gpt-4o',
      prompt: (ctx) => `Classify this query: ${ctx.query}`,
    }),

    ifElse('check', {
      condition: (ctx) => ctx.classify === 'urgent',
    }),

    gmail.sendMessage('notify', {
      credentialId: process.env.GMAIL_CREDENTIAL,
      to: 'ops@example.com',
      subject: (ctx) => `Urgent: ${ctx.query}`,
      body: (ctx) => `Classification result: ${ctx.classify}`,
    }),

    output('result', {
      value: (ctx) => ctx.classify,
    }),
  ],

  edges: [
    ['query', 'classify'],
    ['classify', 'check'],
    ['check', 'notify', 'true'],
    ['check', 'result'],
  ],
});
```

### `referenceId` is the single node identifier

In the full engine, nodes have a UUID `id` and a human-readable `referenceId`. In
primitives, the first argument to every builder (e.g. `'query'`, `'classify'`) **is**
the `referenceId`. It doubles as the node `id`. This eliminates the UUID/slug split
and makes edges readable.

**Reserved:** `"previous_nodes"` is forbidden as a `referenceId` — it is used by
`buildNodeContext` for indirect ancestor outputs. `defineFlow()` throws at call time
if any node uses it, or if two nodes share the same `referenceId`.

### `NodeContext` type

```ts
type NodeContext = {
  [referenceId: string]: unknown; // direct parent output values
  previous_nodes: Record<string, unknown>; // all ancestor output values
};
```

**Important:** the value at `ctx.someNode` is the node's primary output value, not the
full `NodeOutput` envelope. For most actions this is the string or object returned by
`ActionResult.output`. For `if_else` and `switch` nodes — which return named
`outputVariables` (`true_output` / `false_output` / case slugs) rather than a single
`output` — the downstream context receives the value from whichever variable was active.
This is the same extraction logic as `extractNodeOutputValue` in the full engine.

### Callable params

Any param value can be:

- A **plain value** (string, number, boolean, object) — used as-is
- A **function** `(ctx: NodeContext) => T` — called at execution time
- An **async function** `(ctx: NodeContext) => Promise<T>` — awaited

**Constraint for durable adapters:** param functions and mapper functions are called
during every replay pass before the `adapter.step()` call short-circuits. They must be
**pure and side-effect-free**. Any I/O or mutation that must run exactly once belongs
inside the step (i.e., in the action's `execute()` function), not in a param function.

```ts
type ParamValue<T> = T | ((ctx: NodeContext) => T) | ((ctx: NodeContext) => Promise<T>);
```

### Primitive `if_else` output

The full engine's `core.if_else` produces a mistyped passthrough (`type: 'object'` but
`value` is a JSON string). The primitives variant returns a clean discriminated result:

```ts
// Downstream ctx.check will be:
{ branch: 'true' | 'false', value: NodeContext }
// where value is the incoming context object passed through unchanged
```

Edges from `ifElse` still use `'true'` / `'false'` as `sourceHandle` values — the
branch-skipping logic reads `outputVariables` keys, which are `true_output` and
`false_output` exactly as in the full engine.

### Node mapper (optional)

```ts
model('summarise', {
  prompt: (ctx) => `Summarise: ${ctx.text}`,
  mapper: (ctx) => ({ text: ctx.raw_document.body }),
});
```

The mapper reshapes `NodeContext` before params are resolved. It is called on every
replay pass and must be pure.

---

## Architecture

```
createFlowRunner(config)
│
├── graph.ts            — pure topological sort
├── validate.ts         — defineFlow() constraints (reserved keys, duplicate ids)
└── flow-executor.ts    — orchestration loop
    └── action-executor.ts — param resolution, Zod validation, action dispatch
```

---

## `PrimitiveFlowDefinition` type

```ts
interface PrimitiveFlowDefinition {
  nodes: PrimitiveNode[];
  edges: PrimitiveEdge[];
}

interface PrimitiveNode {
  referenceId: string; // human slug, doubles as id
  type: string; // action ID e.g. "core.model"
  params: Record<string, ParamValue<unknown>>;
  mapper?: (ctx: NodeContext) => NodeContext | Promise<NodeContext>;
}

// Edges as tuples: [source, target] or [source, target, sourceHandle]
type PrimitiveEdge = [string, string] | [string, string, string];
```

---

## `FlowRunnerConfig` and `FlowRunner`

```ts
interface FlowRunnerConfig {
  // Resolve a credential by ID. For API-key credentials, return { apiKey: '...' }.
  // For OAuth2 credentials, the caller is responsible for token refresh.
  resolveCredential?: (credentialId: string) => Promise<Record<string, unknown>>;

  // Called by primitives.model nodes. The primitives package ships a built-in
  // implementation backed by platform-native fetch (no node-fetch dependency).
  // Callers can override with their own.
  submitPrompt?: (request: SubmitPromptRequest) => Promise<SubmitPromptResponse>;

  // Called by AGENT nodes.
  submitAgentPrompt?: (request: AgentPromptRequest) => Promise<AgentPromptResponse>;

  // Optional durability adapter. Omit for in-memory execution.
  adapter?: DurabilityAdapter;
}

interface FlowRunner {
  run(
    definition: PrimitiveFlowDefinition,
    inputs?: Record<string, unknown>,
  ): Promise<FlowRunResult>;
}

interface FlowRunResult {
  status: 'success' | 'failed';
  outputs: Record<string, unknown>; // keyed by referenceId of output nodes
  nodeOutputs: Record<string, unknown>; // all node outputs, keyed by referenceId
  error?: { nodeId: string; message: string };
}
```

**`submitPrompt` default implementation.** The primitives package exports a
`createFetchPromptClient(options)` factory that builds `submitPrompt` using
platform-native `fetch`. It accepts `{ fetch?: typeof fetch }` so callers can inject a
custom fetch (e.g. in Vercel Workflows where `globalThis.fetch` must be the workflow
SDK's fetch). Callers who need streaming or custom retry logic can pass their own
`submitPrompt` implementation.

---

## Execution loop

```
1. validateFlow(definition)          ← throws on reserved keys, duplicate referenceIds
2. topologicalSort(nodes, edges)
3. For each node in sorted order:
   a. Skip if in skipSet
   b. buildNodeContext(node, completedOutputs, edges)
   c. If node.mapper → call mapper(ctx), use result as ctx
   d. Resolve callable params: await all function-valued params with ctx
   e. Wrap execution in adapter.step(node.referenceId, async () => { ... })
      Inside the step:
        i.  Coerce JSON-string params
        ii. Zod validate params
        iii. Resolve credential if credentialId present
        iv. Call action.execute(params, actionContext)
        v.  Detect PENDING result (batch submission) — see batch section
        vi. Return NodeOutput
   f. handleBranchSkipping(node, output, edges, skipSet)
   g. Store output in completedOutputs[node.referenceId]
4. Collect core.output node values → FlowRunResult.outputs
```

**Branch skipping** mirrors `FlowRunCoordinator.handleBranchSkipping` exactly:
inspects `outputVariables` keys vs edge `sourceHandle` values, recursively marks
downstream nodes that have no active incoming path.

---

## Batch processing

When a node's action returns `metadata.__batchSubmitted: true` (i.e. `core.model` with
`useBatchProcessing: true`), the flow executor intercepts the `PENDING` result and
executes a collect step:

```ts
// Inside the step wrapper, after action.execute():
if (result.metadata?.__batchSubmitted) {
  const batchJobId = result.metadata.batchJobId as string;
  // adapter.step is already in progress — schedule collect as a second step
  return adapter.step(`${node.referenceId}:collect`, async () => {
    return pollBatchUntilComplete(batchJobId, config.submitPrompt);
  });
}
```

A synthetic `flowRunId` (e.g. a random UUID generated at `runner.run()` call time) is
passed to `BatchRequest.flowRunId`. This satisfies the type contract; in the primitives
runner there is no DB record behind it.

---

## Durability adapter

```ts
interface DurabilityAdapter {
  // Execute a named unit of work — result is persisted by the platform.
  // On replay, the cached result is returned without calling fn again.
  // Name must be unique within the flow run. For mapper iterations,
  // the executor appends the iteration index: `node-ref:0`, `node-ref:1`, etc.
  step<T>(name: string, fn: () => Promise<T>, options?: StepOptions): Promise<T>;

  // Suspend the workflow with zero compute consumed.
  sleep(duration: string | number): Promise<void>;

  // Suspend until an external event is delivered (single event).
  // On timeout throws WaitTimeoutError.
  waitForEvent<T>(name: string, options?: { timeout?: string }): Promise<T>;

  // Suspend and receive a stream of events on the same token (multi-event).
  // Returns an AsyncIterable — each call to resume(token, data) delivers a value.
  subscribe<T>(name: string): AsyncIterable<T>;
}

interface StepOptions {
  retries?: {
    maxAttempts: number;
    backoff?: 'exponential' | 'linear';
  };
  timeout?: string;
}

// Thrown by waitForEvent when the timeout expires.
// Both platform adapters translate their native timeout errors to this type.
class WaitTimeoutError extends Error {
  constructor(public readonly eventName: string) {
    super(`Timed out waiting for event: ${eventName}`);
  }
}
```

**`InMemoryAdapter`** (bundled in `pkg/primitives`):

- `step(name, fn)` — calls `fn()` directly, no persistence
- `sleep()` — resolves immediately
- `waitForEvent()` — throws `WaitTimeoutError` immediately (unsupported in-memory)
- `subscribe()` — throws (unsupported in-memory)

---

## Plugin: `pkg/plugins/cloudflare-agents`

Extends the existing plugin. Adds a `./adapter` export path:

```ts
import { CloudflareAdapter } from '@flow/cloudflare-agents/adapter';

// Inside WorkflowEntrypoint.run():
await runner.run(myFlow, event.payload, {
  adapter: new CloudflareAdapter(step),
});
```

**`CloudflareAdapter` implementation:**

- `step(name, fn, opts)` → `step.do(name, fn, { retries: opts?.retries })`
- `sleep(d)` → `step.sleep(d)`
- `waitForEvent(name, opts)` → `step.waitForEvent(name, opts)`, catches
  `WorkflowTimeoutError` and re-throws as `WaitTimeoutError`
- `subscribe()` → not natively supported by CF Workflows; throws with a clear message

**Step name uniqueness.** CF Workflows requires unique step names per run. The executor
uses `node.referenceId` as the step name. For mapper iterations (same node executed N
times), it appends `:0`, `:1`, etc. Flow authors must not use `:` in `referenceId`
values — `defineFlow()` validates this.

**`AGENT` node.** The entire agent loop (all LLM iterations + tool calls) runs inside a
single `step.do()`. The agent's in-memory conversation history is not serializable
across step boundaries, so the loop cannot be suspended mid-way. If the agent requires
more than one `step.do()` granularity, authors must model it as multiple nodes.

---

## Plugin: `pkg/plugins/vercel-workflows` (new)

### What the Vercel platform requires

Vercel Workflows uses a compile-time SWC transform to turn `"use step"` directives into
isolated API routes (`POST /.well-known/workflow/v1/step/<id>`). This transform runs at
build time — it cannot be emulated at runtime. A generic `VercelAdapter` that
dynamically wraps arbitrary closures as durable steps is **not possible**.

### What the plugin provides instead

**Option A — Single-step wrapping (simple flows, < 240s total).**
The entire `runner.run()` call is wrapped in one `"use step"` function. No per-node
durability, but the flow is observable in the Vercel Workflows dashboard and retries on
failure.

```ts
// app/steps/run-flow.ts
import { runner } from './runner';
import { myFlow } from './my-flow';

export async function runFlow(inputs: Record<string, unknown>) {
  'use step';
  return runner.run(myFlow, inputs);
}

// app/workflows/my-flow-workflow.ts
import { runFlow } from '../steps/run-flow';

export async function myFlowWorkflow(inputs: Record<string, unknown>) {
  'use workflow';
  return runFlow(inputs);
}
```

**Option B — Per-node durability (long flows, batch, event waits).**
Each node in the flow definition is a separately-authored `"use step"` function. The
`defineFlow()` call serves as the registry; the Vercel plugin generates the workflow
orchestrator from it. This requires a build-time code generation step (similar to the
existing CF compiler) rather than a runtime adapter. This is out of scope for the
initial release — document it as the upgrade path.

### World configuration

The Vercel Workflow SDK requires a `World` implementation for durable storage and queue.
The plugin does **not** implement a new World — it documents which existing packages to
use:

- `@workflow/world-vercel` — managed (Vercel-hosted, zero config)
- `@workflow/world-postgres` — self-hosted, PostgreSQL + `graphile-worker`
- `@workflow/worlds/redis` — self-hosted, BullMQ + Redis Streams

Configured via `WORKFLOW_TARGET_WORLD` env var.

### Required boilerplate

Inside any `"use workflow"` function that calls `runner.run()`:

```ts
import { fetch, sleep } from 'workflow';

export async function myFlowWorkflow(inputs) {
  'use workflow';
  // Required: patch globalThis.fetch before any action makes HTTP calls.
  // Without this, AI SDK and HTTP action calls throw inside the workflow sandbox.
  globalThis.fetch = fetch;
  return runner.run(myFlow, inputs);
}
```

### Performance constraint: 240-second replay budget

Every Vercel workflow resume re-runs the orchestrator function from the top. The replay
budget is **240 seconds**. For the single-step wrapping (Option A), this is not a
concern — there are no intermediate step boundaries to replay across. For Option B
(per-node durability), a flow with many completed nodes will accumulate replay overhead.
The Vercel recommendation is to split into child workflows above ~2,000 events (~100
nodes in a flow). Document this constraint for users of Option B.

### `NodeOutput` serializability

Vercel uses `devalue` for step serialization. Step return values must be serializable.
`devalue` supports plain objects, arrays, `Map`, `Set`, `Date`, `URL`, typed arrays, and
`Request`/`Response`. It does **not** support class instances without custom
`WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE` symbols or functions.

The primitives runner's `NodeOutput` (the output of each action) flows through step
boundaries in Option B. Actions must return plain objects, strings, numbers, or arrays
from `ActionResult.output`. The plugin documentation must call this out; ideally
`defineFlow()` validates at the type level that outputs are `devalue`-compatible (this
may be a TypeScript constraint rather than a runtime check).

---

## `ActionExecutionContext` in the primitives runner

The primitives runner constructs `ActionExecutionContext` inline with no DI container.
The following table documents what is provided and what is safe to omit:

| Function                       | Provided?  | Notes                                                                                                  |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| `getCredential`                | ✅ Yes     | Calls `config.resolveCredential`. OAuth2 token refresh is caller's responsibility.                     |
| `submitPrompt`                 | ✅ Yes     | Calls `config.submitPrompt` (or the built-in fetch client).                                            |
| `submitAgentPrompt`            | ✅ Yes     | Calls `config.submitAgentPrompt`.                                                                      |
| `runTemplateReplacement`       | ❌ Omitted | No actions except `core.template_string` call this, and that node is out of scope.                     |
| `markDownstreamNodesAsSkipped` | ❌ Omitted | Confirmed dead code — no `execute()` function calls it. Coordinator owns branch skipping.              |
| `recordToolExecution`          | ❌ Omitted | Agent executor is guarded: skips DB write when `traceId` is absent (which it always is in primitives). |

`flowContext.traceId` is omitted (no DB). `flowContext.flowRunId` is a synthetic UUID
generated at `runner.run()` call time.

---

## Package structure

```
pkg/primitives/
  package.json          name: "@flow/primitives"
  src/
    types.ts            PrimitiveFlowDefinition, PrimitiveNode, NodeContext, ParamValue,
                        FlowRunResult, DurabilityAdapter, StepOptions, WaitTimeoutError
    validate.ts         defineFlow() — validates reserved keys, duplicate referenceIds, colon constraint
    helpers.ts          defineFlow, input, output, model, agent node builders
    actions/
      if-else.ts        primitives.if_else — function-typed condition, clean discriminated output
      switch.ts         primitives.switch  — function-typed cases, matchMode support
      javascript.ts     primitives.javascript — function-typed code param
    graph.ts            topological sort (ported from GraphService, no class wrapper)
    action-executor.ts  callable param resolution + batch PENDING detection + action dispatch
    flow-executor.ts    orchestration loop, createFlowRunner, InMemoryAdapter
    fetch-prompt.ts     createFetchPromptClient() — built-in fetch-based submitPrompt
    index.ts            public barrel

pkg/plugins/cloudflare-agents/   (existing — extended)
  src/
    adapter/
      index.ts          CloudflareAdapter, WaitTimeoutError re-export
    ...existing files

pkg/plugins/vercel-workflows/    (new)
  src/
    index.ts            vercelWorkflowsPlugin() for the flow server
    boilerplate.ts      documented workflow wrapper pattern, fetch shim
```

---

## Imported from `@flow/core` (types only)

- `ActionDefinition`, `defineAction` — identical contract; all third-party actions work as-is
- `ActionExecutionContext` — same shape, constructed inline
- `SubmitPromptRequest`, `SubmitPromptResponse` types
- All existing action implementations (gmail, http, slack, postgres, etc.) — zero changes needed

---

## Key differences from the full engine

| Concern                             | Full engine                                  | Primitives                                          |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| Param dynamics                      | `"{{ expr }}"` strings, QuickJS              | `(ctx) => \`...\`` functions, native TS             |
| `if_else` / `switch` / `javascript` | QuickJS module-level singleton               | Forked primitive variants with function params      |
| `core.template_string`              | QuickJS via `runTemplateReplacement`         | Out of scope — use function params                  |
| Branch skipping                     | `handleBranchSkipping` in coordinator        | Same algorithm, same output                         |
| Flow definition                     | `InvectDefinition` (JSON, DB-stored)         | `PrimitiveFlowDefinition` (TypeScript)              |
| Node identity                       | UUID `id` + snake_case `referenceId`         | `referenceId` only (doubles as id)                  |
| Persistence                         | DB via `FlowRunRepository`                   | Via `DurabilityAdapter` (pluggable)                 |
| Batch AI                            | `BATCH_SUBMITTED` DB pause/resume            | Intercepted by executor → `adapter.step('collect')` |
| Webhook / event wait                | Not supported                                | `adapter.waitForEvent()` / `adapter.subscribe()`    |
| Sleep                               | Not supported                                | `adapter.sleep()`                                   |
| Plugin hooks                        | `beforeFlowRun` / `afterFlowRun`             | Not supported                                       |
| DI                                  | NestJS `@Injectable()`                       | Plain factory function                              |
| `submitPrompt`                      | Injected `BaseAIClient` service              | Built-in fetch client or caller-provided            |
| OAuth2 refresh                      | `CredentialsService.getDecryptedWithRefresh` | Caller's `resolveCredential` owns this              |
| Runtime target                      | Node.js server + DB + Redis                  | Any JS runtime                                      |

---

## Milestone order

**0. Pre-work (ship independently)**
Fix `flow-compiler.ts:205`: `params.condition` → `params.expression`.

**1. `types.ts` + `validate.ts`**
Define `PrimitiveNode`, `NodeContext`, `ParamValue`, `FlowRunResult`, `DurabilityAdapter`,
`StepOptions`, `WaitTimeoutError`. Implement `validateFlow()`.

**2. `graph.ts`**
Port `topologicalSort` from `GraphService`. Smoke test.

**3. `actions/if-else.ts`, `actions/switch.ts`, `actions/javascript.ts`**
Fork the three QuickJS-dependent actions as primitives-specific variants with
function-typed params and clean output shapes.

**4. `helpers.ts`**
`defineFlow()`, `input()`, `output()`, `model()`, `ifElse()`, `switchNode()`, `agent()`.

**5. `action-executor.ts`**
Callable param resolution, JSON coercion, Zod validation, credential resolution, batch
`PENDING` detection (`metadata.__batchSubmitted`), `ActionResult` → `NodeOutput` mapping.
Unit test with a mock action.

**6. `fetch-prompt.ts`**
`createFetchPromptClient()` — OpenAI/Anthropic/OpenRouter backed by platform `fetch`.

**7. `flow-executor.ts`**
Orchestration loop: `buildNodeContext`, skip logic, mapper, adapter dispatch,
`InMemoryAdapter`. Integration test: input → model → if_else → action → output.

**8. `index.ts` barrel + `package.json` exports**

**9. `pkg/plugins/cloudflare-agents` — `CloudflareAdapter`**
Add `./adapter` export. `CloudflareAdapter` wrapping `WorkflowStep`. Handles step name
uniqueness (`:index` suffix for mapper iterations). `WorkflowTimeoutError` → `WaitTimeoutError`.
Integration test with CF Workflow stub.

**10. `pkg/plugins/vercel-workflows` — new plugin**
`vercelWorkflowsPlugin()` server integration. Documented Option A boilerplate
(single-step wrapping + `globalThis.fetch` shim). World configuration docs
(`@workflow/world-vercel`, `@workflow/world-postgres`). Integration test using
`@workflow/vitest`.
