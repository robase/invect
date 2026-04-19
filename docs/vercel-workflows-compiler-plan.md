# Vercel Workflows Compiler — Implementation Plan

## Problem

Vercel Workflows uses a **compile-time SWC transform** that rewrites `"use step"` and
`"use workflow"` function bodies into durable API routes at
`/.well-known/workflow/v1/step/<stepId>`. This transform runs at build time — it
cannot be emulated at runtime. There is no runtime equivalent of `step.do()`.

The current `createVercelFlowRunner` wraps the entire `runner.run()` call inside a
single user-authored `"use step"` function (Option A). This gives observability and
retry semantics for the whole flow, but no per-node durability. For flows with AI model
calls, webhook waits, or total execution time exceeding 240 seconds, per-node steps are
required.

**The solution:** a code generator that takes a `PrimitiveFlowDefinition` and emits a
`.ts` file containing one `"use workflow"` orchestrator function and one `"use step"`
function per node. The generated file is static TypeScript that the SWC plugin can see
at build time.

---

## What the generator produces

For a flow `input → model → ifElse → [true: email → output_a | false: output_b]`:

```ts
// generated/my-flow.workflow.ts

import { fetch } from 'workflow'
import { executeStep } from '@invect/vercel-workflows/runtime'
import { myFlow } from '../my-flow'           // original flow — param functions live here

export async function myFlowWorkflow(inputs: Record<string, unknown>) {
  'use workflow'
  globalThis.fetch = fetch                    // must precede any action that calls fetch

  const completedOutputs: Record<string, unknown> = {}

  const r_query = await step_query({ inputs, completedOutputs: {} })
  completedOutputs['query'] = r_query.output

  const r_classify = await step_classify({ inputs, completedOutputs })
  completedOutputs['classify'] = r_classify.output

  const r_check = await step_check({ inputs, completedOutputs })
  completedOutputs['check'] = r_check.output

  // Branch on outputVariables — mirrors handleBranchSkipping
  if ('true_output' in (r_check.outputVariables ?? {})) {
    const r_email = await step_email({ inputs, completedOutputs })
    completedOutputs['email'] = r_email.output
    return (await step_output_a({ inputs, completedOutputs })).output
  } else {
    return (await step_output_b({ inputs, completedOutputs })).output
  }
}

// ── One "use step" function per node ──────────────────────────────────────────

type StepCtx = { inputs: Record<string, unknown>; completedOutputs: Record<string, unknown> }

async function step_query(ctx: StepCtx) {
  'use step'
  return executeStep(myFlow, 'query', ctx.completedOutputs, ctx.inputs)
}

async function step_classify(ctx: StepCtx) {
  'use step'
  return executeStep(myFlow, 'classify', ctx.completedOutputs, ctx.inputs)
}

async function step_check(ctx: StepCtx) {
  'use step'
  return executeStep(myFlow, 'check', ctx.completedOutputs, ctx.inputs)
}

// ... one per node
```

`executeStep` is a small runtime helper (~40 lines) that does:
`buildNodeContext → mapper → resolveCallableParams → executeNodeAction`. It reads param
functions from the imported flow definition — they are never passed across step
boundaries, only `completedOutputs` (a plain serialisable object) is.

---

## Design decisions

### Step arguments

Each step receives `{ inputs, completedOutputs }`. `completedOutputs` accumulates as
the orchestrator advances. Passing the full accumulation means `buildNodeContext` and
`previous_nodes` work identically to the in-memory runner.

This is serialised by `devalue` on every step resume. For flows with hundreds of nodes
producing large outputs, this grows. The alternative — passing only direct parent
outputs — breaks the `ctx.previous_nodes` contract. Accept the tradeoff and document
the ~100-node / 1 GB guidance from Vercel (split into child workflows above that).

### Param functions are never serialised

Param functions (`(ctx) => ...`) live in the user's imported flow definition. The
generated `step_*` functions call `executeStep(myFlow, 'nodeRef', ...)` which resolves
params inside the step body. No closures cross step boundaries. `devalue` never sees
them.

### Branch control flow generation

The generator must convert the flow DAG into nested TypeScript `if/else` and `switch`
control flow for the orchestrator:

| Node type | Generated control flow |
|---|---|
| `primitives.if_else` | `if ('true_output' in result.outputVariables) { ... } else { ... }` |
| `primitives.switch` (first) | `if (...) { } else if (...) { } else { /* default */ }` |
| `primitives.switch` (all) | Multiple independent `if` blocks, no `else` |
| Diamond join | Detect convergence point; emit the join node after both arms |
| Linear segment | Sequential `await step_X(...)` calls, no branching |

The generator runs a DFS from root nodes. When it encounters a branching node, it
recursively generates each arm, then finds the convergence point (the first node
reachable from all arms) and emits it after the branch block.

### `sleep` and `waitForEvent`

Vercel's `sleep` is imported from `'workflow'`:
```ts
import { sleep } from 'workflow'
await sleep('24h')
```

`waitForEvent` is a Vercel hook:
```ts
import { createHook } from 'workflow'
const hook = createHook()
const event = await hook  // or: for await (const e of hook) { ... }
```

These cannot be expressed via the current `DurabilityAdapter` interface since Vercel
hooks are created in the orchestrator and consumed in steps, not hidden inside a step
fn. Two options:

**Option A (scope-limited):** Treat `sleep` and `waitForEvent` as orchestrator-level
concerns. The flow definition expresses them as special node types (`primitives.sleep`,
`primitives.waitForEvent`) that the generator emits as top-level `await sleep()` /
`await hook` calls rather than `await step_*(...)` calls.

**Option B (general):** Add a `vercelHooks` metadata field to `PrimitiveNode` that the
generator reads to emit hook setup above the step call. More expressive but couples flow
definitions to Vercel.

**Recommendation:** Option A for the first release. Add `primitives.sleep` and
`primitives.waitForEvent` as no-op node types in the in-memory runner (resolve
immediately), and emit their Vercel equivalents in the compiler.

---

## Package structure

```
pkg/plugins/vercel-workflows/
  src/
    compiler/
      flow-compiler.ts    DAG → TS source string
      control-flow.ts     Branch analysis: find arms, convergence points
      step-emitter.ts     Generate step_* function bodies
      index.ts            compile(flow, options): string  (public API)
    runtime/
      execute-step.ts     executeStep() — used by generated files at runtime
    cli.ts                npx invect-vercel generate <flow-file> [--out dir]
    index.ts              re-exports createVercelFlowRunner + compiler + executeStep
```

The compiler has zero runtime dependencies beyond TypeScript types — it outputs a
string. The runtime helper (`executeStep`) depends on `@invect/primitives`.

---

## `executeStep` runtime helper

```ts
// runtime/execute-step.ts
import type { PrimitiveFlowDefinition, ActionResult } from '@invect/primitives'
import { buildNodeContext, resolveCallableParams, executeNodeAction } from '@invect/primitives'

export async function executeStep(
  flow: PrimitiveFlowDefinition,
  nodeRef: string,
  completedOutputs: Record<string, unknown>,
  inputs: Record<string, unknown>,
  config: FlowRunnerConfig,
): Promise<ActionResult> {
  const node = flow.nodes.find(n => n.referenceId === nodeRef)!
  let ctx = buildNodeContext(nodeRef, flow.edges, completedOutputs)
  if (node.mapper) ctx = await node.mapper(ctx)
  const resolvedParams = await resolveCallableParams(node.params as Record<string, unknown>, ctx)
  return executeNodeAction({ node, resolvedCtx: ctx, resolvedParams, config, ... })
}
```

`config` (for credential resolution, submitPrompt) must be provided somewhere. Two
options: pass it through every step argument, or use module-level state. Module-level
state is cleaner for generated code:

```ts
// in the generated file, before the workflow function:
import { configureVercelRuntime } from '@invect/vercel-workflows/runtime'
configureVercelRuntime({ resolveCredential: ..., fetch })
```

---

## CLI usage

```bash
# Generate from a flow definition file
npx invect-vercel generate ./flows/triage.ts --out ./app/workflows/generated

# Generates: app/workflows/generated/triage.workflow.ts
# Add to package.json scripts: "prebuild": "invect-vercel generate ..."
```

The CLI:
1. Loads the flow definition file via `tsx` (supports TS without build step)
2. Calls `compile(flow, options)` → string
3. Writes the output file
4. Runs `prettier` on the output if available (optional)

For monorepos / Turborepo: add the generation as a `prebuild` task with the flow files
as inputs and the generated files as outputs, so it only re-runs when the flow changes.

---

## What stays out of scope (first release)

- **`primitives.sleep` / `primitives.waitForEvent` node types** — documented as
  follow-on; the step-based architecture supports them once the no-op in-memory
  variants exist
- **Child workflow splitting** — for flows > ~100 nodes, the recommended pattern is to
  split into child workflows manually. The compiler could detect large flows and warn.
- **Incremental re-generation** — first release regenerates all specified flows on
  every `prebuild`
- **Source maps** — the generated file is standalone TS; no source-map back to the
  flow definition is produced

---

## Milestone order

**1. `runtime/execute-step.ts`**
Expose `buildNodeContext`, `resolveCallableParams`, `executeNodeAction` from
`@invect/primitives` public API (some are already exported). Implement `executeStep`
with module-level config store.

**2. `compiler/control-flow.ts`**
Graph analysis: given nodes + edges, identify linear segments, branch points,
convergence points. Unit-testable without code emission.

**3. `compiler/flow-compiler.ts` + `compiler/step-emitter.ts`**
Emit the orchestrator function and step functions as a string. Start with linear
flows only, then add if/else branching, then switch.

**4. `compiler/index.ts` + `cli.ts`**
Public API + CLI. Wire in `tsx` for loading flow files.

**5. Integration test**
A flow definition file → `compile()` → write to disk → `tsc --noEmit` on output.
Confirms the generated TypeScript is valid.

---

## Relationship to CF compiler

The existing `pkg/plugins/cloudflare-agents/src/compiler/flow-compiler.ts` compiles
`InvectDefinition` (the JSON database format) into a standalone CF Workers script with
no external deps. The Vercel compiler compiles `PrimitiveFlowDefinition` (the TypeScript
format) into a Vercel Workflow file that imports from `@invect/vercel-workflows/runtime`.

They are parallel tools — same DAG-to-control-flow problem, different output targets.
The `compiler/control-flow.ts` graph analysis module can be shared or inlined in both.
