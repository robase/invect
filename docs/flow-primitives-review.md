# Flow Primitives Plan — Critical Review

## Summary

The plan is directionally correct but has several gaps ranging from subtle type issues
to fundamental misunderstandings of how the platform durability models work. Issues
are grouped by severity.

---

## 🔴 Showstoppers

### 1. `core.if_else`, `core.javascript`, and `core.switch` hardcode QuickJS — no injection point

All three call `getJsExpressionService()` via a **module-level singleton import**, not via
the execution context. There is no injection point to swap the evaluator:

```ts
// if-else.ts, javascript.ts, switch.ts — direct module import
const jsService = await getJsExpressionService(context.logger);
```

This is different from `core.template_string`, which delegates to
`context.functions.runTemplateReplacement` and fails gracefully when that function is
absent. The three actions above will **always** attempt to load QuickJS WASM regardless
of context. You cannot stub this out at the runner level.

**Three options, pick one:**

- Fork `core.if_else`, `core.javascript`, and `core.switch` as primitives-specific
  variants with function-typed params instead of string expressions. This is the cleanest
  path and aligns with the plan's stated goal.
- Add an optional evaluator injection to `JsExpressionService` — but this requires
  changing `pkg/core` itself.
- Accept QuickJS as a runtime dep in the primitives package for these nodes only —
  undermines the stated goal and breaks Cloudflare Workers (no WASM support in CF Workers
  by default; requires `--compatibility-flags=nodejs_compat`).

`core.switch` is also missing from the plan entirely and has the same problem.

---

### 2. The Vercel `VercelAdapter` design is architecturally wrong

The plan describes `VercelAdapter` implementing the Vercel Workflow SDK's `World`
interface. But `World` is the **storage/queue backend** interface — it controls _where_
step results are persisted, not _how_ steps are initiated.

Steps in Vercel Workflows are initiated by the `"use step"` directive, which is a
**compile-time SWC transform** that rewrites the function body. You cannot dynamically
wrap a closure as a `"use step"` function at runtime. The SWC plugin must see the
directive in your source file at build time.

This means the proposed `VercelAdapter.step(name, fn)` — which would try to route
`fn` as a Vercel step — is not possible without the SWC plugin processing the
adapter's source. The adapter cannot generate durable Vercel steps from arbitrary
runtime closures.

**What is actually possible:**

- Wrap the entire `runner.run()` call inside a single `"use step"` function — each
  flow run is one atomic durable step. No per-node durability.
- Model the whole execution as a `"use workflow"` function with each node wrapped in
  a manually-authored `"use step"` factory — but this requires compile-time knowledge
  of the flow's nodes, defeating the point of a generic runner.
- Use the Vercel Workflow SDK's lower-level `globalThis[Symbol.for("WORKFLOW_USE_STEP")]`
  escape hatch — this is the internal runtime call the SWC plugin emits. It's undocumented,
  unstable, and Vercel explicitly does not support it.

The Cloudflare adapter design is sound (`step.do()` is a runtime API). The Vercel
adapter design needs a fundamentally different approach or a frank acknowledgement
that Vercel Workflows require source-level integration.

---

### 3. Batch processing and the adapter don't compose

The plan shows:

```ts
// core.model with batch — becomes two checkpointed steps
adapter.step('submit-batch', () => submitBatch(...))
adapter.step('collect-batch', () => pollUntilComplete(...))
```

But `core.model`'s `execute()` function is not aware of the adapter. When
`useBatchProcessing: true`, the action calls `context.functions.submitPrompt(batchRequest)`
and returns `{ success: true, metadata: { __batchSubmitted: true } }`. The action
executor then maps this to `NodeExecutionStatus.PENDING`.

There is no mechanism in the current plan for the flow executor to intercept
a `PENDING` result and route it to `adapter.step()`. The `DurabilityAdapter`
interface is called at the _node dispatch level_, not inside the action. This
means the flow executor would need to:

1. Execute the node inside `adapter.step('submit', ...)`
2. Detect that the result is a batch submission
3. Call `adapter.step('collect', () => pollUntilDone(batchJobId))`
4. Return the collected result as the node's output

This is do-able but requires the flow executor to have explicit batch-awareness,
not just delegate to the adapter blindly. The plan does not describe this logic.

Furthermore, `BatchRequest` requires a `flowRunId` and `nodeId` — DB-scoped IDs
from the full engine. The primitives runner has no `flowRunId`. The `core.model`
action will fail with empty strings if run via the primitives path with
`useBatchProcessing: true`.

---

### 4. Real bug in the existing compiler: `params.condition` vs `params.expression`

The CF Workflows compiler (`flow-compiler.ts:205`) reads:

```ts
String(node.params.condition ?? 'true');
```

But the `core.if_else` action's Zod schema defines the field as `expression`, not
`condition`. The `params.condition` lookup always returns `undefined`, so every compiled
`if/else` node evaluates the literal string `'true'` — all flows always take the true
branch. This is a silent correctness bug in every workflow the compiler has ever produced.

This needs to be fixed in the compiler independent of the primitives work.

---

## 🟠 Significant Gaps

### 5. `functions.recordToolExecution` writes to DB — needs a no-op

`ActionExecutionContext.functions` includes `recordToolExecution`. The codebase
investigation confirmed this is **only called from `AgentNodeExecutor.executeTool()`**,
not from any action's `execute()`. It is guarded: if `context.flowContext.traceId` is
absent (which it will be in primitives — there is no DB-assigned `nodeExecution.id`),
the agent executor already skips the write silently. No action needs to be taken, but
the plan should note this explicitly so it is not accidentally wired to a real DB call.

Also confirmed: `markDownstreamNodesAsSkipped` in `context.functions` is **dead code
from any action's perspective** — no `execute()` function in any action calls it. It
exists only for legacy `BaseNodeExecutor` subclasses. The primitives runner can omit it
without consequence.

### 6. `extractNodeOutputValue` has a non-obvious fallback chain

When building `NodeContext` from upstream outputs, `extractNodeOutputValue` does:

1. Look for `variables.output.value` — the standard single-output case
2. Fall back to `variables.output` directly
3. Fall back to `variables[firstKey].value` — the first named variable
4. Fall back to `variables[firstKey]`

For `if_else`, the output variables are `true_output` or `false_output` (never
`output`). So a node downstream of `if_else` receives whatever is at
`variables.true_output.value` — which is the JSON-stringified passthrough of
the entire `evaluationData` (a string, not an object), then JSON-parsed back.

This means `ctx.if_else_result` in a downstream param function will be the
deserialized upstream context object, not a simple value. This can surprise
authors writing `(ctx) => ctx.check.someField` — `ctx.check` will be the
full upstream incoming data object, not a condition result.

The plan needs to document this clearly, or the `if_else` primitive should
return a cleaner output (e.g. the raw condition boolean, or just pass through
the top-level values instead of a JSON-stringified blob).

### 6. `core.switch` is missing entirely

The plan lists `core.if_else` but ignores `core.switch`. The switch node:

- Also uses QuickJS (`getJsExpressionService()`)
- Has `dynamicOutputs: true` — the number of output handles is determined by
  `params.cases` at runtime
- Supports `matchMode: 'first' | 'all'` — in "all matches" mode, multiple
  branches execute in parallel

The primitives runner's `handleBranchSkipping` logic (mirroring
`FlowRunCoordinator.handleBranchSkipping`) is generic and will work correctly
for switch because it inspects `outputVariables` keys vs edge `sourceHandle`
values. But a `switch()` primitive helper and a non-QuickJS switch action need
to be defined.

### 7. Node slug generation depends on a utility not in the plan

`buildIncomingDataObject` calls `getNodeSlug()` which calls `generateNodeSlug(label, nodeId)`
when no `referenceId` is present. The primitives `PrimitiveNode` type requires
`referenceId: string` but the plan doesn't enforce it as non-optional, and the
plan's node builder helpers (`input()`, `model()`, etc.) use the first argument
as both the node `id` and `referenceId`.

Two questions to resolve:

- What is the `id` vs `referenceId` distinction in the primitive type? In the full
  engine, `id` is a UUID and `referenceId` is the human slug. In the plan's example,
  `input('query')` — is `'query'` the `id`, the `referenceId`, or both?
- If `referenceId` is always required and always set by the builder, `generateNodeSlug`
  is never needed. State this explicitly and drop the fallback.

### 8. Replay-safe param functions: a documentation gap, not a bug

Both CF Workflows and Vercel Workflows use deterministic replay. When a workflow
resumes after a step, the orchestrator replays from the top. All `adapter.step()`
calls before the resume point short-circuit (returning cached results). But the
**param functions are called on every replay** before the `adapter.step()` call.

If a param function has side effects (logging, counters, external calls) it will
run multiple times. This is standard in replay-based systems but needs to be
documented as a constraint on primitive flow authors.

**Higher risk:** the `mapper` function is called even more often — it runs before
every node execution, including those whose `adapter.step()` short-circuits. If
the mapper is expensive or has side effects, this is a latent bug.

### 9. `coerceJsonStringParams` checks for `{{` to skip template strings

The existing coercion logic in `action-executor.ts:46`:

```ts
if (typeof value === 'string' && !value.includes('{{')) {
```

In the primitives runner, params can be functions — not strings. The type check
(`typeof value === 'string'`) means functions pass through untouched, which is
correct. But if a primitive flow author passes a function that returns a JSON
string, coercion will parse it after resolution. This is probably fine but
worth a test case.

---

## 🟡 Design Questions / Open Issues

### 10. Where does `submitPrompt` live in the primitives API?

`core.model` calls `context.functions?.submitPrompt`. The plan puts this in
`FlowRunnerConfig`:

```ts
interface FlowRunnerConfig {
  submitPrompt?: (request: PromptRequest) => Promise<PromptResponse>;
}
```

But `PromptRequest` includes `credentialId`, meaning the runner's `submitPrompt`
implementation needs to resolve credentials internally. Is the primitives author
expected to implement their own OpenAI/Anthropic client? Or does the primitives
package export a default `submitPrompt` backed by standard HTTP? This is not
defined.

For Cloudflare Workers: `node-fetch` is not available, but `fetch` is global.
The primitives package should either use the platform-native `fetch` or require
the caller to inject it.

### 11. `trigger.*` node types are not handled

The full engine has trigger nodes (`trigger.webhook`, `trigger.cron`, etc.)
that serve as flow entry points. The plan ignores these. In the primitives model
where flows are started by calling `runner.run()`, trigger nodes are conceptually
unnecessary — the caller provides inputs directly. But:

- If a primitive flow definition includes a trigger node (e.g. ported from a
  serialized `InvectDefinition`), what happens? It should be a no-op / passthrough.
- The `__triggerNodeId` logic in the coordinator (which skips inactive trigger
  branches) is not represented in the plan.

### 12. Parallel edges / diamond joins: output collision

If two edges point to the same node from different sources with the same `referenceId`
slug, `buildIncomingDataObject` will silently overwrite the first with the second.
The full engine has the same behavior. With primitive flows, flow authors writing
`(ctx) => ctx.my_node` in a diamond-join scenario may see the wrong value depending
on topological sort order. This should at minimum be documented.

### 13. What does `core.output` emit in the primitives result?

The full engine's `core.output` action (`output.ts`) reads a param value and stores
it as `nodeOutputs`. The plan says `FlowRunResult.outputs` is keyed by `referenceId`
of output nodes. But `core.output` takes a `value` param that is resolved via
template in the full engine. In the primitives, the `output()` builder takes
`{ value: (ctx) => ... }`. The plan needs to confirm that `core.output`'s `execute()`
function reads from `params.value` (already resolved by param functions) without
further QuickJS evaluation.

Looking at the actual implementation, `core.output` simply passes `params.outputValue`
through. But the primitive builder example uses `value`, not `outputValue`. There's
a naming mismatch — check the actual `output.ts` param schema.

### 14. Cloudflare: step name uniqueness and loops

CF Workflows require step names to be **unique per workflow instance**. If a flow
has a mapper that iterates over an array (running the same node N times), each
invocation needs a unique step name. The plan shows `adapter.step(name, fn)` with
the node's `referenceId` as the name — this would collide on iteration 2+.

Either the primitives runner must append an index to the step name during iteration,
or the mapper pattern (iterate-and-execute the same node) is incompatible with the
durable adapter path and must fall back to in-memory execution.

### 15. `waitForEvent` timeout design differs between the two platforms

**Cloudflare:** `step.waitForEvent()` throws `WorkflowTimeoutError` on expiry.

**Vercel:** Hooks have **no built-in timeout parameter at all**. `createHook()` / `defineHook()` do not accept a `timeout` option. The documented pattern for adding a timeout is:

```ts
await Promise.race([
  hook,
  sleep('7d').then(() => {
    throw new Error('timed out');
  }),
]);
```

So the `DurabilityAdapter` interface as proposed:

```ts
waitForEvent<T>(name: string, options?: { timeout?: string }): Promise<T>
```

...cannot be implemented symmetrically. The Vercel adapter would need to synthesise the `timeout` by composing `createHook()` + `sleep()` internally, while CF takes the timeout as a native parameter. This is fine as an implementation detail, but the plan should acknowledge the adapter is not a thin wrapper on the Vercel side for this method.

Additionally: hooks in Vercel support **multiple events** from the same token (`AsyncIterable`). The `waitForEvent` abstraction only models a single event. A separate `subscribe(name)` method returning an `AsyncIterable` may be needed to fully represent Vercel's hook model.

### 16. No error retry policy on the `DurabilityAdapter.step()` interface

CF Workflows and Vercel Workflows both have configurable retry policies per step
(max retries, backoff, fatal vs retryable errors). The `DurabilityAdapter.step()`
interface as designed has no way to express retry configuration:

```ts
step<T>(name: string, fn: () => Promise<T>): Promise<T>
```

If a step throws a retryable error, the platform retries it automatically. But
the flow executor has no way to mark a step as fatal (no-retry). Extending the
interface with optional retry config:

```ts
step<T>(name: string, fn: () => Promise<T>, options?: StepOptions): Promise<T>

interface StepOptions {
  retries?: { maxAttempts: number; backoff?: 'exponential' | 'linear' }
  timeout?: string
}
```

### 17. Agent conversation history is not serializable — AGENT node cannot be paused mid-loop

The `AgentNodeExecutor` holds its `messages: AgentMessage[]` array as a plain local
variable in `runAgentLoop`. This conversation history is mutated in place through the
loop (including truncation for token limits). There is no DB persistence of mid-loop
conversation state.

Batch mode on the agent only works on iteration 1 (`useBatch = iteration === 1 && params.useBatchProcessing`). Subsequent iterations always run direct. This means if the agent runs more than one tool-calling round-trip, the whole multi-round conversation must complete within a single `adapter.step()` call — it cannot be suspended and resumed across two separate step calls.

For the primitives runner with a durable adapter: the entire AGENT node must be wrapped
in a single `adapter.step()` with no internal `sleep()` or event waits. Document this
constraint explicitly.

### 18. `getCredential` requires DB + OAuth2 refresh — not trivially injectable

The full engine's `getCredential` call path (`CredentialsService.getDecryptedWithRefresh`)
does DB lookup, decryption, and potentially hits the OAuth2 provider's token endpoint
if the access token is expired. It is not a simple key-value lookup.

For the primitives runner config's `resolveCredential` callback, callers who want to
support OAuth2 credentials (Gmail, Slack, HubSpot, etc.) must implement their own token
refresh logic or accept that expired tokens fail silently. This is an important
limitation for integration-heavy flows and should be called out prominently.

For non-OAuth credentials (API key, basic auth) the lookup is straightforward — just
return the stored key.

### 19. `previous_nodes` key collision

If any node in the flow has a `referenceId` of `"previous_nodes"`, the
`buildIncomingDataObject` function will silently overwrite it with the indirect
ancestor collection object. The primitives runner should validate that no node uses
`"previous_nodes"` as its `referenceId` and throw at flow definition time rather than
silently producing wrong `NodeContext` values at runtime.

---

## 🔵 Vercel Platform — Precise API Findings

These are concrete constraints from the Vercel Workflow SDK docs that affect the Vercel plugin design specifically.

### Implementing `World` is substantial work, not a thin adapter

`World` is a full event-sourced storage backend consisting of three sub-interfaces: `Storage` (append-only event log for runs, steps, hooks, events), `Queue` (at-least-once message delivery with retry tracking and idempotency), and `Streamer` (chunked stream storage with cursor-based access). The queue interface requires specific payload shapes (`WorkflowInvokePayload`, `StepInvokePayload`) and named queue topics matching `__wkf_workflow_<name>` and `__wkf_step_<name>`.

The `events.create` method must atomically persist events AND update entity state. Hook token conflicts require a `hook_conflict` event rather than throwing. Terminal run states must auto-dispose all hooks.

This is not a simple adapter — it is a production-grade event-sourcing backend. The Postgres reference implementation uses PostgreSQL + `graphile-worker`. An existing World implementation can be used unchanged (Postgres, Redis, Turso, MongoDB all exist). The primitives plugin does not need to implement its own — it should document which World to use and how to configure it via `WORKFLOW_TARGET_WORLD`.

### `"use step"` is compile-time only — no runtime-only mode confirmed

There is no documented runtime-only mode. The `withWorkflow()` Next.js config wrapper (not a separate `@workflow/swc-plugin` in any public API) enables the build transform. Without it, `"use step"` directives are syntactically valid strings that become no-ops — the function runs as a plain async function with no retry, no event log, no replay.

This confirms the showstopper: the `VercelAdapter` cannot dynamically emit durable step semantics at runtime. The Vercel plugin must use source-level directives and scope its promise to: the whole flow runs as a `"use workflow"` function; each node is a manually-authored `"use step"` function. Per-node durability requires knowing the flow's node set at build time.

### 240-second replay budget is a real constraint for large flows

Every time a Vercel workflow resumes after a step, it replays the entire orchestration function from the top. All completed steps short-circuit instantly, but the code still runs. The replay budget is **240 seconds** — if replaying all previously-completed step results takes over 240 seconds, the run fails with a corrupted event log error.

For a flow with hundreds of nodes, the replay pass iterates through the entire topological sort, calls `buildNodeContext` for each node, resolves params, etc. This overhead accumulates. For large flows, this is a real ceiling and should be documented. The Vercel docs recommend splitting into child workflows above 2,000 events or 1 GB storage.

### Vercel hooks support multiple events — `waitForEvent` is a subset

Vercel's `createHook()` / `defineHook()` implement `AsyncIterable` — a single hook token can receive multiple events via `for await (const event of hook)`. The proposed `DurabilityAdapter.waitForEvent()` abstraction only models single-event receipt. For human-in-the-loop flows where a node may receive a stream of approval/rejection decisions, the interface is insufficient. A separate `subscribe()` returning `AsyncIterable<T>` should be considered.

### `NodeOutput` objects must be serializable across step boundaries

Vercel uses `devalue` for step serialization. `devalue` supports: primitives, plain objects, arrays, `Map`, `Set`, `Date`, `URL`, typed arrays, `Request`, `Response`, `ReadableStream`. It does NOT support: class instances (without custom `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE` symbols), functions, `WeakMap`, `WeakSet`, symbols.

The primitives runner passes `NodeContext` (a `Record<string, unknown>`) between steps. As long as action outputs are plain objects/strings (which the current `ActionResult.output` contract encourages), serialization is safe. But if any action returns a class instance (e.g. a `Date`, a `URL`, a custom model object), it will fail at the Vercel step boundary. The primitives runner should validate or document this constraint.

### Global `fetch` in workflow context throws

Inside a `"use workflow"` function, calling `globalThis.fetch` throws `"Global 'fetch' is unavailable in workflow functions."` The Vercel-native `fetch` (imported from `"workflow"`) must be used instead, and it must be set as `globalThis.fetch = fetch` before any npm package (including AI SDKs) that calls `fetch` internally. The Vercel plugin's boilerplate wrapper must include this shim.

---

## 🟢 Things the Plan Gets Right

- The core `DurabilityAdapter` pattern is the right abstraction for Cloudflare.
- Reusing `ActionDefinition` and `ActionExecutionContext` types unchanged means
  existing third-party action implementations (Gmail, HTTP, Slack, etc.) work
  in the primitives runner with zero modification — as long as they don't call
  `context.functions?.runTemplateReplacement` or `recordToolExecution` (both confirmed
  as safe to omit).
- `handleBranchSkipping` logic based on `outputVariables` keys is generic enough
  to work for both `if_else` and `switch` without changes.
- Keeping `PrimitiveFlowDefinition` separate from `InvectDefinition` is correct —
  the two formats serve different purposes and should not be conflated.
- Plugin placement for the adapters is right.
- `markDownstreamNodesAsSkipped` in `context.functions` is confirmed dead code — no
  action calls it, so the primitives runner can safely omit it.

---

## Recommended Actions

| #     | Issue                                                                         | Action                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | QuickJS hardcoded in if_else / javascript / switch via module-level singleton | Fork as primitives-specific variants with function-typed params; these cannot be patched via injection                                                                    |
| 2     | Vercel adapter design is architecturally wrong                                | Scope Vercel plugin to single-step flow wrapping; document that per-node durability requires source-level `"use step"`                                                    |
| 3     | Batch + adapter composition gap                                               | Add explicit `PENDING` detection in the flow executor; generate a synthetic `flowRunId`; call `adapter.step('collect', pollFn)`                                           |
| **4** | **Compiler bug: `params.condition` vs `params.expression` in CF compiler**    | **Fix `flow-compiler.ts:205` to read `node.params.expression` — affects every if/else node ever compiled**                                                                |
| 5     | `recordToolExecution` / `markDownstreamNodesAsSkipped`                        | Confirmed safe to omit — no action calls them. Document explicitly.                                                                                                       |
| 6     | `extractNodeOutputValue` / if_else passthrough type lie                       | Change primitives if_else to return a clear discriminated output (`{ branch: 'true' \| 'false', value: unknown }`) rather than re-using the full-engine passthrough       |
| 7     | `core.switch` missing                                                         | Add to scope; define `switch()` primitive helper                                                                                                                          |
| 8     | `id` vs `referenceId` ambiguity                                               | Enforce `referenceId` as the sole required identifier in primitive builders; drop `id` or auto-generate it                                                                |
| 9     | Replay-safe param functions                                                   | Document: param functions and mappers must be pure / side-effect-free                                                                                                     |
| 10    | `submitPrompt` ownership                                                      | Decide: ship a platform-`fetch`-based built-in client, or require caller-provided only                                                                                    |
| 11    | Trigger nodes                                                                 | Validate at flow definition time that trigger nodes are absent; throw rather than silently no-op                                                                          |
| 12    | Step name uniqueness under mapper iteration                                   | Append iteration index to step name; document durable adapter + mapper interaction                                                                                        |
| 13    | `waitForEvent` timeout asymmetry — CF throws, Vercel has no native timeout    | Vercel adapter synthesises timeout via `Promise.race(hook, sleep(...).then(throw))`; `DurabilityAdapter` contract defines a `WaitTimeoutError` both adapters translate to |
| 14    | Retry policy                                                                  | Add `StepOptions` to `DurabilityAdapter.step()`                                                                                                                           |
| 15    | Agent conversation not serializable mid-loop                                  | Document: entire AGENT node runs inside one `adapter.step()`; cannot suspend mid-loop                                                                                     |
| 16    | `getCredential` OAuth2 refresh complexity                                     | Document: primitives `resolveCredential` must handle token refresh for OAuth2 integrations; API-key integrations are trivial                                              |
| 17    | `previous_nodes` key collision                                                | Validate at `defineFlow()` call time that no `referenceId` is `"previous_nodes"`                                                                                          |
| 18    | Vercel `World` is a full event-sourcing backend                               | Vercel plugin should document which existing World package to use (`@workflow/world-postgres`, etc.) rather than implementing a new one                                   |
| 19    | 240-second Vercel replay budget for large flows                               | Document: flows with many nodes should be split into child workflows above ~100 nodes to stay within replay budget                                                        |
| 20    | `NodeOutput` serializability across Vercel step boundaries                    | Document or validate: action outputs must be `devalue`-compatible (plain objects/strings/arrays); class instances without `WORKFLOW_SERIALIZE` symbols will fail          |
| 21    | Global `fetch` shim required in Vercel workflow context                       | Vercel plugin boilerplate must include `globalThis.fetch = fetch` (workflow's fetch) before calling `runner.run()`                                                        |
| 22    | Vercel multi-event hooks not expressible via `waitForEvent`                   | Add `subscribe(name): AsyncIterable<T>` to `DurabilityAdapter` for multi-event patterns                                                                                   |
