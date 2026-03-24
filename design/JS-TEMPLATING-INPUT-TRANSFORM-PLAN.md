# Data Mapper Implementation Plan

Bake a **data mapper** into every node's execution model — a sandboxed JS expression that reshapes upstream data before the node runs. If the mapper returns an array, the node automatically iterates over each item. Nunjucks is **retained** for `{{ }}` template resolution in config form fields.

## Goals

1. **Per-node data mapper** — built into every node's execution pipeline (not a separate action). Sits between raw inputs and the config form. If the mapper returns an array → node runs once per item. If it returns an object → node runs once.
2. **Replaces `loopConfig`** — the mapper subsumes the current loop-over system with a simpler, more powerful model
3. **Retain Nunjucks** for `{{ }}` template resolution in config form params — unchanged, battle-tested, no migration needed
4. **Keep JQ action** — unchanged, still available
5. **JS sandbox (QuickJS) only for mapper expressions** — not for form templates

---

## Architecture Overview

### Current Pipeline (per node)

```
buildIncomingDataObject()
  → { upstream_a: [...], upstream_b: { ... } }

[if loopConfig] → LoopExecutionService resolves array, iterates
  → per iteration: resolveTemplateParams + executeNodeOnce

[if no loop] → resolveTemplateParams(params, incomingData)
  → Nunjucks renders {{ }} strings against incomingData
  → returns params with string values
  → executeNode(resolvedParams, incomingData)
```

### New Pipeline (per node)

```
buildIncomingDataObject()
  → { upstream_a: [...], upstream_b: { ... } }

runMapper(node.mapper, incomingData)                            ← NEW (JS sandbox)
  ├─ returns Array  → node executes once per item (auto-loop)
  │   └─ for each item:
  │       resolveTemplateParams(params, item)                   ← Nunjucks (unchanged)
  │       executeNodeOnce(resolvedParams, item)
  │       collect results → output = [result1, result2, ...]
  │
  └─ returns Object → node executes once (standard)
      resolveTemplateParams(params, mappedData)                 ← Nunjucks (unchanged)
      executeNodeOnce(resolvedParams, mappedData)

[if no mapper] → resolveTemplateParams(params, incomingData)    ← same as object path
  → executeNodeOnce(resolvedParams, incomingData)
```

### The Mapper is the Single Primitive

The mapper replaces three separate concepts:
- **`inputTransform`** (reshaping data) → mapper returning an object
- **`loopConfig`** (iterating over arrays) → mapper returning an array
- **combining multiple upstream arrays** → mapper with JS (zip, cross-product, merge, etc.)

```js
// Reshape (returns object → runs once):
return { activeUsers: users.filter(u => u.active), env: config.env }

// Iterate (returns array → runs once per item) — one-liner, auto-return:
users

// Zip two arrays (returns array → runs once per pair):
return users.map((u, i) => ({ ...u, score: scores[i] }))

// Cross-product (returns array → runs once per combo):
return users.flatMap(u => roles.map(r => ({ user: u, role: r })))

// Aggregate then pass (returns object → runs once with summary):
return { total: orders.reduce((s, o) => s + o.amount, 0), count: orders.length }

// Multi-statement with multiple inputs (returns array → iterate):
const active = users.filter(u => u.active);
const enriched = active.map((u, i) => ({
  ...u,
  score: scores[i],
  dept: departments.find(d => d.id === u.deptId)?.name
}));
return enriched;

// Conditional early return:
if (!users || users.length === 0) return [];
return users.filter(u => u.active);
```

### Two Engines, Two Purposes

| Concern | Engine | Why |
|---------|--------|-----|
| **Mapper expression** | QuickJS (JS sandbox) | Needs native types — arrays, objects, `.filter()`, `.map()`, `.reduce()`. Returns the actual JS value. |
| **Config form `{{ }}`** | Nunjucks (retained) | String interpolation is the right model for form fields. Battle-tested, no migration. Users already know it. |

The mapper runs **before** Nunjucks template resolution. Its output becomes the context that Nunjucks `{{ }}` expressions resolve against. This means:

```
Mapper:   users.filter(u => u.active)   →  [{ name: "Alice" }, { name: "Bob" }]
                                            ↓ (each item becomes template context)
Nunjucks:  "Hello {{ name }}"            →  "Hello Alice"  (iteration 1)
                                         →  "Hello Bob"    (iteration 2)
```

Nunjucks filters (`| first`, `| json`, `| default(...)`) continue to work in config form fields. No migration needed.

### Config Panel Layout (4 Panes)

Every node's config panel becomes:

```
┌──────────────────────────────────────────────────────────────────┐
│  Node: "Send Email"                                              │
├─────────┬──────────────┬───────────────────────┬─────────────────┤
│ INPUTS  │ DATA MAPPER  │ CONFIG                │ OUTPUT          │
│         │              │                       │                 │
│ Raw     │ JS expr that │ The node's param      │ Execution       │
│ upstream│ reshapes     │ form fields.          │ results.        │
│ data    │ inputs.      │ {{ }} expressions     │                 │
│ from    │              │ resolve against       │ If mapper       │
│ connected│ Returns     │ mapper output.        │ returned array: │
│ nodes.  │ object →     │                       │ shows array of  │
│         │ single run.  │                       │ results.        │
│ Read-   │ Returns      │                       │                 │
│ only.   │ array →      │                       │ If single run:  │
│         │ runs per     │                       │ shows single    │
│         │ item.        │                       │ result.         │
│         │              │                       │                 │
│         │ Omit for     │                       │                 │
│         │ passthrough. │                       │                 │
└─────────┴──────────────┴───────────────────────┴─────────────────┘
```

---

## Phase 1: JS Expression Engine (QuickJS Sandbox)

The JS engine is used **only** for mapper expressions — pure JS code without `{{ }}` delimiters. Nunjucks continues to handle all `{{ }}` template resolution in config form fields.

### 1.1 — Add QuickJS Dependency

**File**: `pkg/core/package.json`

```bash
pnpm add quickjs-emscripten --filter @invect/core
```

### 1.2 — Create `JsExpressionService`

**New file**: `pkg/core/src/services/templating/js-expression.service.ts`

Responsible for:
- Evaluating pure JS expressions in a QuickJS sandbox
- Injecting context variables (upstream data) as globals
- Type-preserving evaluation (returns native types — arrays, objects, numbers, etc.)

```typescript
interface JsExpressionService {
  /**
   * Evaluate JS code against a context object.
   * User code is wrapped in a function body — use `return` to produce a value.
   * Context keys are injected as local variables.
   *
   * Single expression (auto-return when no `return` keyword present):
   *   evaluate("users.filter(u => u.active)", { users: [...] })
   *
   * Multi-statement (explicit return):
   *   evaluate(`
   *     const active = users.filter(u => u.active);
   *     return active.map((u, i) => ({ ...u, score: scores[i] }));
   *   `, { users: [...], scores: [...] })
   */
  evaluate(expression: string, context: Record<string, unknown>): unknown;
}
```

**QuickJS sandbox — context reuse**:

Creating a fresh QuickJS context per evaluation is expensive (~1-5ms + marshalling overhead). For flows with many nodes or large payloads, this adds up. Strategy: create a **single QuickJS runtime** at service construction, reuse it across evaluations, and create lightweight contexts only when needed.

```typescript
class JsExpressionService {
  private runtime: QuickJSRuntime;

  constructor() {
    // One runtime, created once at startup
    this.runtime = QuickJS.newRuntime();
    // Set memory limit (16MB) and execution timeout (5s) as safety rails
    this.runtime.setMemoryLimit(16 * 1024 * 1024);
    this.runtime.setMaxStackSize(1024 * 1024);
  }

  evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
    const vm = this.runtime.newContext();  // Lightweight within shared runtime
    try {
      // Inject each context key as a global variable
      for (const [key, value] of Object.entries(context)) {
        vm.setProp(vm.global, key, marshalToVM(vm, value));
      }

      // $input escape hatch for name collisions (e.g., upstream key named "name")
      vm.setProp(vm.global, '$input', marshalToVM(vm, context));

      // JSON, Math, Date, Array, Object, String, Number, RegExp — all built-in to QuickJS
      // No I/O, no require, no fetch, no process

      // Wrap user code in a function body.
      // Auto-prepend `return` for single-expression one-liners (no `return` keyword found).
      const body = /\breturn\b/.test(expression) ? expression : `return (${expression});`;
      const wrapped = `(function(){${body}})()`;
      const result = vm.evalCode(wrapped);
      if (result.error) {
        const errorMsg = vm.dump(result.error);
        result.error.dispose();
        throw new Error(`Mapper expression error: ${errorMsg}`);
      }
      const value = unmarshalFromVM(vm, result.value);
      result.value.dispose();
      return value;
    } finally {
      vm.dispose();  // Dispose context, keep runtime
    }
  }

  dispose() {
    this.runtime.dispose();  // Called on Invect shutdown
  }
}
```

Runtime is created once in `Invect.initialize()` and disposed in `Invect.shutdown()`. Contexts are cheap within a shared runtime (~0.1ms).

For large-payload marshalling (10k+ row arrays), consider a **size guard**: if `JSON.stringify(context).length > 5MB`, warn in logs and consider chunked processing. This is a per-iteration concern — the mapper expression itself is fast, marshalling dominates.

**New file**: `pkg/core/src/services/templating/js-expression.service.ts`
**New file**: `pkg/core/src/services/templating/quickjs-sandbox.ts` (low-level VM wrapper)

### 1.3 — Barrel Export

**File**: `pkg/core/src/services/templating/index.ts`

Add exports for `JsExpressionService` alongside existing Nunjucks exports.

### 1.4 — Tests

**New file**: `pkg/core/tests/unit/templating/js-expression.service.test.ts`

Test cases:
- Simple property access (auto-return): `"user.name"` with `{ user: { name: "alice" } }` → `"alice"`
- Nested access (auto-return): `"user.address.city"` → `"NYC"`
- Array methods (auto-return): `"items.filter(x => x > 2)"` with `{ items: [1,2,3,4,5] }` → `[3, 4, 5]`
- Multi-statement with explicit return: `"const a = items.filter(x => x > 2); return a.map(x => x * 10);"` → `[30, 40, 50]`
- Multi-statement with multiple inputs: `"const u = users.filter(u => u.active); return u.map((u, i) => ({...u, score: scores[i]}));"` → enriched array
- Object literal return: `"return { name: user.name, count: items.length }"` → `{ name: "alice", count: 3 }`
- Conditional early return: `"if (!items) return []; return items.filter(x => x > 2);"` → `[3, 4, 5]`
- Array map: `"users.map(u => u.name)"` → `["alice", "bob"]`
- Reduce: `"orders.reduce((s, o) => s + o.amount, 0)"` → `150`
- Array length: `"items.length"` → `3` (number)
- Ternary: `"active ? 'yes' : 'no'"` → `"yes"`
- Object construction: `"{ name: user.name, count: items.length }"` → `{ name: "alice", count: 3 }`
- `$input` escape hatch: `"$input.name"` when `name` is a context key → works even if `name` collides with builtins
- Sandbox safety: `"require('fs')"` → error (require not defined)
- Sandbox safety: `"fetch('http://evil.com')"` → error (fetch not defined)
- Sandbox safety: `"process.env"` → error (process not defined)
- Undefined variable: `"nonexistent.foo"` → ReferenceError
- Returns array: `"[1, 2, 3]"` → `[1, 2, 3]`
- Returns object: `"({ a: 1, b: 2 })"` → `{ a: 1, b: 2 }`
- Returns primitive: `"42"` → `42`
- Returns null: `"null"` → `null`

---

## Phase 2: Data Mapper (Baked Into Every Node)

The mapper replaces both the old `inputTransform` concept and `loopConfig`. It's a single JS expression field on every node definition. The runtime behavior depends on the return type:
- **Returns object** → node executes once with that object as context
- **Returns array** → node executes once per element, results collected into array output
- **No mapper** → passthrough (node executes once with raw `incomingData`)

### 2.1 — Add `mapper` to Node Schema (replaces `_loop`)

**File**: `pkg/core/src/services/flow-versions/schemas-fresh.ts`

Remove `loopConfigSchema` (or keep commented out). Add:

```typescript
export const mapperConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * JS expression that receives all upstream outputs as variables.
   *
   * Examples:
   *   users                                              // pass array → iterate
   *   users.filter(u => u.active)                        // filter then iterate
   *   users.map((u, i) => ({ ...u, score: scores[i] }))  // zip then iterate
   *   { total: orders.reduce((s, o) => s + o.amount, 0) } // aggregate → single run
   */
  expression: z.string().min(1),
  /**
   * Explicit intent declaration — prevents accidental iteration.
   * - "auto"    (default): infer from return type (array → iterate, object → single)
   * - "iterate": assert the result is an array, fail if not
   * - "reshape": assert the result is NOT an array (wrap in object if it is), single run
   *
   * Frontend default: new mappers from the UI default to "iterate" or "reshape" based on
   * which button the user clicked. "auto" is for backward compat and programmatic use.
   */
  mode: z.enum(['auto', 'iterate', 'reshape']).default('auto'),
  /**
   * How to combine iteration results when mapper returns an array.
   * - "array"  (default): collect all outputs into [result1, result2, ...]
   * - "object": build { keyField: result } using a field as key
   * - "first":  return only the first iteration's output
   * - "last":   return only the last iteration's output
   * - "concat": join all string outputs
   */
  outputMode: z.enum(['array', 'object', 'first', 'last', 'concat']).default('array'),
  /** For outputMode "object": the field path in each result to use as key */
  keyField: z.string().optional(),
  /** Max parallel iterations (1 = sequential). Only applies when mapper returns array. */
  concurrency: z.number().int().min(1).max(50).default(1),
  /**
   * Behavior when mapper returns an empty array.
   * - "skip":   produce empty output, don't fail
   * - "error":  fail the node
   */
  onEmpty: z.enum(['error', 'skip']).default('skip'),
});

export type MapperConfig = z.infer<typeof mapperConfigSchema>;

export const flowNodeDefinitionsSchema = baseNodeSchema.extend({
  type: z.string().min(1, 'Node type is required'),
  params: z.record(z.string(), z.unknown()).default({}),
  mapper: mapperConfigSchema.optional(),     // ← NEW (replaces _loop)
});
```

### 2.2 — Rewrite `executeNode()` in `NodeExecutionCoordinator`

**File**: `pkg/core/src/services/flow-orchestration/node-execution-coordinator.ts`

The new `executeNode()` method:

```typescript
async executeNode(
  flowRunId: string,
  node: FlowNodeDefinitions,
  inputs: Record<string, unknown>,
  flowInputs: Record<string, unknown>,
  definition?: InvectDefinition,
  skippedNodeIds?: Set<string>,
  useBatchProcessing?: boolean,
  incomingData?: NodeIncomingDataObject,
): Promise<NodeExecution> {
  const rawData = incomingData ?? {};

  // ── Step 1: Run mapper ────────────────────────────────────────
  const mapperConfig = node.mapper;
  let mappedResult: unknown = rawData;

  if (mapperConfig?.enabled && mapperConfig?.expression) {
    mappedResult = this.jsExpressionService.evaluateExpression(
      mapperConfig.expression,
      rawData,
    );
  }

  // ── Step 2: Branch on mode + return type ──────────────────────
  const mode = mapperConfig?.mode ?? 'auto';
  const isArray = Array.isArray(mappedResult);

  if (mode === 'iterate' && !isArray) {
    throw new Error(`Mapper mode is "iterate" but expression returned ${typeof mappedResult}, not an array`);
  }

  if (mode === 'reshape' && isArray) {
    // Reshape mode: wrap array result in object to prevent accidental iteration
    mappedResult = { items: mappedResult };
  }

  const shouldIterate = mode === 'iterate' || (mode === 'auto' && isArray);

  if (shouldIterate) {
    // Array → iterate: execute node once per element
    return this.executeNodeIterating(
      flowRunId, node, mappedResult as unknown[], rawData, flowInputs,
      definition, skippedNodeIds, useBatchProcessing,
      mapperConfig!,
    );
  } else if (mappedResult !== null && typeof mappedResult === 'object') {
    // Object → single execution with mapped data as context
    return this.executeNodeOnce(
      flowRunId, node, inputs, flowInputs,
      definition, skippedNodeIds, useBatchProcessing,
      mappedResult as NodeIncomingDataObject,
    );
  } else {
    // Primitive / null (no mapper or mapper returned passthrough) → standard
    return this.executeNodeOnce(
      flowRunId, node, inputs, flowInputs,
      definition, skippedNodeIds, useBatchProcessing,
      rawData,
    );
  }
}
```

### 2.3 — New `executeNodeIterating()` Method

Replaces the current `executeNodeWithLoop()`. Handles array iteration with concurrency, output collection, and result packaging:

```typescript
private async executeNodeIterating(
  flowRunId: string,
  node: FlowNodeDefinitions,
  items: unknown[],
  incomingData: Record<string, unknown>,  // Full upstream data — preserved in each iteration
  flowInputs: Record<string, unknown>,
  definition: InvectDefinition | undefined,
  skippedNodeIds: Set<string> | undefined,
  useBatchProcessing: boolean | undefined,
  mapperConfig: MapperConfig,
): Promise<NodeExecution> {
  const { logger, nodeExecutionService } = this.deps;

  // Handle empty array
  if (items.length === 0) {
    if (mapperConfig.onEmpty === 'error') {
      // Create failed trace
      const trace = await nodeExecutionService.createNodeExecution(...);
      await nodeExecutionService.updateNodeExecutionStatus(trace.id, NodeExecutionStatus.FAILED);
      return trace;
    }
    // Skip: return success with empty output
    const trace = await nodeExecutionService.createNodeExecution(...);
    await nodeExecutionService.updateNodeExecutionStatus(trace.id, NodeExecutionStatus.SUCCESS);
    return trace;
  }

  const trace = await nodeExecutionService.createNodeExecution(flowRunId, node.id, node.type, {
    _mapper: { expression: mapperConfig.expression, itemCount: items.length },
  });
  await nodeExecutionService.updateNodeExecutionStatus(trace.id, NodeExecutionStatus.RUNNING);

  try {
    const results: unknown[] = [];
    const concurrency = mapperConfig.concurrency ?? 1;

    if (concurrency === 1) {
      // Sequential — stop on first failure
      for (let i = 0; i < items.length; i++) {
        const itemContext = this.buildItemContext(items[i], i, items.length, incomingData);
        const resolvedParams = this.resolveTemplateParams(nodeParams, itemContext, skipKeys);
        const result = await this.executeSingleIteration(node, resolvedParams, itemContext, ...);
        results.push(result);
      }
    } else {
      // Parallel with concurrency limit — within a batch, all items complete;
      // subsequent batches don't start on failure
      for (let start = 0; start < items.length; start += concurrency) {
        const batch = items.slice(start, start + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((item, batchIdx) => {
            const globalIdx = start + batchIdx;
            const itemContext = this.buildItemContext(item, globalIdx, items.length, incomingData);
            const resolvedParams = this.resolveTemplateParams(nodeParams, itemContext, skipKeys);
            return this.executeSingleIteration(node, resolvedParams, itemContext, ...);
          }),
        );
        // Collect fulfilled results; on any rejection, store partial results and stop
        for (const r of batchResults) {
          if (r.status === 'fulfilled') results.push(r.value);
          else { hasFailure = true; failureError = r.reason; }
        }
        if (hasFailure) break;  // Don't start next batch
      }
    }

    // Package results according to outputMode
    const packagedOutput = this.packageIterationResults(results, mapperConfig);

    // Update trace with packaged output
    await nodeExecutionService.updateNodeExecutionStatus(trace.id, NodeExecutionStatus.SUCCESS);
    trace.outputs = { nodeType: node.type, data: { variables: { output: { value: packagedOutput, type: 'object' } } } };
    return trace;
  } catch (error) {
    await nodeExecutionService.updateNodeExecutionStatus(trace.id, NodeExecutionStatus.FAILED);
    throw error;
  }
}
```

### 2.4 — Item Context Structure

When iterating, each item is **merged with the full upstream `incomingData`** — non-iterated upstream values remain accessible. This matches the current `buildIterationContext` behavior in `LoopExecutionService` and prevents a regression.

```typescript
private buildItemContext(
  item: unknown,
  index: number,
  total: number,
  incomingData: Record<string, unknown>,  // ← Full upstream data preserved
): Record<string, unknown> {
  // Start with ALL upstream data (config values, other node outputs, etc.)
  const context: Record<string, unknown> = { ...incomingData };

  // If item is an object, spread its properties into context (overrides upstream on collision)
  // This lets templates access {{ name }} directly instead of {{ item.name }}
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    Object.assign(context, item);
  } else {
    // Primitives/arrays available as {{ item }}
    context.item = item;
  }

  // Iteration metadata
  context._item = {
    value: item,           // Always available as {{ _item.value }}
    index,                 // 0-based: {{ _item.index }}
    iteration: index + 1,  // 1-based: {{ _item.iteration }}
    first: index === 0,
    last: index === total - 1,
    total,
  };

  return context;
}
```

**Context layering** (bottom → top, later wins on collision):
1. `incomingData` — all upstream node outputs, keyed by referenceId
2. Spread item properties (if item is an object) — or `{ item: value }` for primitives
3. `_item` metadata — iteration index, total, first/last flags

This means templates can access **both** iterated item properties and non-iterated upstream data:
```nunjucks
{{ name }}           → from current item (spread)
{{ config.apiKey }}  → from upstream "config" node (preserved from incomingData)
{{ _item.index }}    → iteration metadata
```

If a spread item property collides with an upstream key, the item wins (same behavior as current `buildIterationContext` where `[itemAs]: item` overwrites).

### 2.5 — Result Packaging (from existing `outputMode`)

Reuse the output mode logic from the current `LoopExecutionService.packageResults()`:

```typescript
private packageIterationResults(results: unknown[], config: MapperConfig): unknown {
  switch (config.outputMode) {
    case 'array':   return results;
    case 'object':  return this.buildKeyedObject(results, config.keyField!);
    case 'first':   return results[0] ?? null;
    case 'last':    return results[results.length - 1] ?? null;
    case 'concat':  return results.map(r => String(r ?? '')).join('');
    default:        return results;
  }
}
```

### 2.6 — Remove `LoopExecutionService`

**File**: `pkg/core/src/services/flow-orchestration/loop-execution.service.ts`

- **Delete the file.** No backward compat — `_loop` is fully removed.
- Remove references from `NodeExecutionCoordinator` constructor and `service-factory.ts`
- Remove `loopConfigSchema` and `_loop` field from `schemas-fresh.ts`
- The iteration logic is now inline in `executeNodeIterating()`

### 2.8 — Tests

**New file**: `pkg/core/tests/unit/mapper/mapper-execution.test.ts`

Test cases:

**Object return (single execution)**:
- No mapper → passthrough, runs once
- Mapper returns object → runs once with mapped context
- Mapper aggregates: `({ orders }) => ({ total: orders.reduce((s,o) => s + o.amount, 0) })` → single run
- Mapper combines: `({ a, b }) => ({ merged: [...a, ...b] })` → single run with merged array

**Array return (auto-iteration)**:
- Mapper returns array → runs once per item
- Template params resolve per-item: `{{ name }}` resolves to each item's name
- Array of primitives: `{{ item }}` available, `{{ _item.index }}` for metadata
- Array of objects: properties spread into context
- Empty array + `onEmpty: "skip"` → empty output, no failure
- Empty array + `onEmpty: "error"` → node fails
- Concurrency: sequential (1) vs parallel (>1)
- Output modes: array, object (with keyField), first, last, concat
- Zip: `({ users, scores }) => users.map((u,i) => ({...u, score: scores[i]}))` → iterate pairs
- Cross: `({ users, roles }) => users.flatMap(u => roles.map(r => ({user: u, role: r})))` → iterate combos
- Filter: `({ users }) => users.filter(u => u.active)` → iterate active only

**Error handling**:
- Mapper expression throws → node fails with clear error
- Mapper returns null/undefined → treated as no mapper (passthrough)
- Mapper returns primitive (string, number) → wrapped into `{ item: value }`, single run

---

## Phase 3: Frontend — 4-Pane Config Panel

### 3.1 — Config Panel Restructure (4 Panes)

The node config panel currently has 3 panes. Extend to 4:

```
CURRENT:  [ Input ]  [ Config Form ]  [ Output ]
NEW:      [ Input ]  [ Data Mapper ]  [ Config Form ]  [ Output ]
```

**File**: `pkg/frontend/src/components/flow-editor-v2/node-config-panel/` — restructure

The 4 panes:

#### Pane 1: Inputs (read-only, existing)
Shows the raw `incomingData` from upstream nodes. No changes — this already exists.

#### Pane 2: Data Mapper (NEW)
**New file**: `DataMapperPane.tsx`

```
┌─────────────────────────────────────┐
│ DATA MAPPER                         │
│                                     │
│ ┌─ JS Expression ─────────────────┐ │
│ │ users.filter(u => u.active)     │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Available: users, config, api_result│
│                                     │
│ ┌─ Preview ───────────────────────┐ │
│ │ Returns: Array (3 items)        │ │
│ │ → Node will execute 3 times     │ │
│ │                                 │ │
│ │ [0]: { name: "Alice", ... }     │ │
│ │ [1]: { name: "Bob", ... }       │ │
│ │ [2]: { name: "Charlie", ... }   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Output Settings ───────────────┐ │
│ │ Collect results as: [array ▼]   │ │
│ │ Concurrency:        [1     ▼]   │ │
│ │ On empty array:     [skip  ▼]   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Features:
- CodeMirror with `@codemirror/lang-javascript` for the expression
- **Live preview**: When input data is available (from a previous run or test mode), evaluate the mapper expression and show the result type (array vs object) and preview of the data
- **Cold-start support**: Inherits test mode — user can paste/edit sample JSON in the Inputs pane when no upstream run data exists. The mapper preview evaluates against this test data.
- **Behavior indicator**: Clear label — "Node will execute 3 times" or "Node will execute once"
- **Mode buttons**: Two clearly labeled buttons — "Iterate" (sets mode: iterate, expects array) and "Transform" (sets mode: reshape, expects object). Visually distinct from the config form's `{{ }}` Nunjucks fields. No Nunjucks syntax is valid here.
- **Language labeling**: The Data Mapper pane header says "JavaScript Expression" with a JS icon. Config form fields say "Template (Nunjucks)" in their tooltips. Clear visual separation between the two authoring contexts.
- Available variable names derived from connected upstream edges
- Output settings (outputMode, concurrency, onEmpty) shown only when mode is "iterate" or when preview detects an array
- When mapper is empty/disabled, show a dimmed "No mapping — raw inputs passed through" state

#### Pane 3: Config Form (existing, minor updates)
The existing parameter form. Minor change: when the mapper is active and returns an array, the form fields should indicate that `{{ }}` expressions resolve per-item. Show the available per-item variables.

#### Pane 4: Output (existing, minor updates)
When mapper produces array iteration, show the collected results (e.g., `[result1, result2, ...]`). When single execution, show single result.

### 3.2 — Delete LoopConfigSection

**File**: `pkg/frontend/src/components/flow-editor-v2/node-config-panel/LoopConfigSection.tsx`

Delete. Its functionality is replaced by the Data Mapper pane.

---

## Phase 4: Clean Break (`_loop` Removal)

No backward compatibility. `_loop` is removed entirely — schema, runtime, and frontend.

### 4.1 — Schema Removal

**File**: `pkg/core/src/services/flow-versions/schemas-fresh.ts`

- Delete `loopConfigSchema` entirely
- Remove `_loop` field from `flowNodeDefinitionsSchema`
- The `mapper` field is the only iteration mechanism

### 4.2 — Runtime Removal

- Delete `pkg/core/src/services/flow-orchestration/loop-execution.service.ts`
- Remove all `hasLoopConfig()` / `executeNodeWithLoop()` code paths from `NodeExecutionCoordinator`
- Remove `LoopExecutionService` from `service-factory.ts` and DI
- Delete `pkg/core/tests/unit/loop-execution/` test directory

### 4.3 — Frontend Removal

- Delete `LoopConfigSection.tsx` (not deprecated — deleted)
- Remove any references to `_loop` / `loopConfig` in config panel components

---

## Phase 5: API & Type Updates

### 5.1 — Export New Types

**File**: `pkg/core/src/types-export.ts`

```typescript
export type { MapperConfig } from './services/flow-versions/schemas-fresh';
```

Remember: `import type` only — no runtime code.

### 5.2 — API Endpoints

Add a test endpoint for JS expression and mapper evaluation (like the existing JQ test endpoint):

**File**: `pkg/core/src/invect-core.ts`

```typescript
async testJsExpression(request: {
  expression: string;
  context: Record<string, unknown>;
}): Promise<{ success: boolean; result?: unknown; error?: string }>;

async testMapper(request: {
  expression: string;
  incomingData: Record<string, unknown>;
}): Promise<{
  success: boolean;
  result?: unknown;
  resultType?: 'array' | 'object' | 'primitive';
  itemCount?: number;  // If array, how many iterations would run
  error?: string;
}>;
```

Expose via framework adapters:
- `POST /node-data/test-expression`
- `POST /node-data/test-mapper`

The mapper test endpoint is critical for the frontend **live preview** in the Data Mapper pane.

---

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `pkg/core/src/services/templating/js-expression.service.ts` | JS expression engine (QuickJS sandbox) — mapper only |
| `pkg/core/src/services/templating/quickjs-sandbox.ts` | Low-level QuickJS VM wrapper |
| `pkg/core/tests/unit/templating/js-expression.service.test.ts` | Expression engine tests |
| `pkg/core/tests/unit/mapper/mapper-execution.test.ts` | Mapper + auto-iteration tests |
| `pkg/frontend/src/components/flow-editor-v2/node-config-panel/DataMapperPane.tsx` | Data mapper UI pane |

### Modified Files
| File | Change |
|------|--------|
| `pkg/core/package.json` | Add `quickjs-emscripten` dependency |
| `pkg/core/src/services/templating/index.ts` | Export `JsExpressionService` alongside existing Nunjucks exports |
| `pkg/core/src/services/flow-orchestration/node-execution-coordinator.ts` | Add `JsExpressionService` as new dependency. Rewrite `executeNode()` with mapper→branch logic. New `executeNodeIterating()`. Remove `executeNodeWithLoop()`. Nunjucks stays for `resolveTemplateParams()`. |
| `pkg/core/src/invect-core.ts` | Instantiate `JsExpressionService`. Add `testMapper()` method. |
| `pkg/core/src/services/flow-versions/schemas-fresh.ts` | Add `mapperConfigSchema` + `mapper` field. Delete `loopConfigSchema`/`_loop`. |
| `pkg/core/src/services/service-factory.ts` | Remove `LoopExecutionService` from DI |
| `pkg/core/src/types-export.ts` | Export `MapperConfig` type |
| `pkg/core/src/index.ts` | Export `JsExpressionService` |
| `pkg/frontend/src/components/flow-editor-v2/node-config-panel/` | Add DataMapperPane, restructure to 4-pane layout |
| Express/NestJS/Next.js router files | Add `/node-data/test-mapper` endpoint |

### Deleted Files
| File | Reason |
|------|--------|
| `pkg/core/src/services/flow-orchestration/loop-execution.service.ts` | Replaced by mapper iteration in coordinator. Clean break — no deprecation. |
| `pkg/core/tests/unit/loop-execution/loop-execution.service.test.ts` | Replaced by mapper tests |
| `pkg/frontend/src/components/flow-editor-v2/node-config-panel/LoopConfigSection.tsx` | Replaced by Data Mapper pane |

### Untouched Files
| File | Reason |
|------|--------|
| `pkg/core/src/services/templating/nunjucks.service.ts` | **Retained** — still powers all `{{ }}` template resolution in config forms |
| `pkg/core/src/services/node-data.service.ts` | Unchanged — still uses Nunjucks for `runTemplateReplacement` |
| `pkg/core/src/actions/core/template-string.ts` | Unchanged — templates still use Nunjucks |
| `pkg/core/src/actions/core/jq.ts` | JQ action unchanged, still functional |
| `pkg/frontend/src/components/ui/codemirror-nunjucks-editor.tsx` | Unchanged — `{{ }}` editors still highlight Nunjucks |

---

## Implementation Order

```
Phase 1 (JS Engine)       ██████████  DONE — QuickJS sandbox, 43 unit tests passing
Phase 5 (API/Types)       ██████████  DONE — MapperConfig schema, types-export, API endpoints
Phase 2 (Data Mapper)     ██████████  DONE — executeNodeWithMapper in coordinator, 13 integration tests
Phase 3 (Frontend)        ██████████  DONE — 4-pane config panel with DataMapperPane
Phase 4 (_loop Removal)   ██████████  DONE — loop system fully deleted
```

Order: **1 → 5 → 2 → 3 → 4**

### Completed Work

**Phase 1** — `JsExpressionService` created at `pkg/core/src/services/templating/js-expression.service.ts`. Uses `quickjs-emscripten` with function-body wrapping, auto-return for one-liners, `$input` escape hatch, 16MB memory limit, 5s interrupt. Barrel-exported from `templating/index.ts` and `pkg/core/src/index.ts`. 43 unit tests at `tests/unit/templating/js-expression.service.test.ts`.

**Phase 5** — `mapperConfigSchema` + `MapperConfig` type added to `schemas-fresh.ts`. `mapper` field added to `flowNodeDefinitionsSchema`. Types exported from `types-export.ts`. `testJsExpression()` and `testMapper()` methods on `Invect` class. Express routes at `POST /node-data/test-expression` and `POST /node-data/test-mapper`.

**Phase 2** — `executeNodeWithMapper()`, `executeNodeMapperIterating()`, `executeSingleMapperIteration()`, `buildMapperItemContext()`, `packageMapperResults()` added to `NodeExecutionCoordinator`. `JsExpressionService` wired through `ServiceFactory` → `FlowOrchestrationService` → coordinator deps. 13 integration tests at `tests/unit/mapper/mapper-execution.test.ts`. Mapper runs before standard execution — when node has a mapper, iter/reshape happens before the node's core logic.

**Phase 3** — Frontend DataMapperPane component at `pkg/frontend/src/components/flow-editor-v2/node-config-panel/panels/DataMapperPane.tsx`. CodeMirror JS editor with `@codemirror/lang-javascript`. 4-pane resizable layout: Input | Data Mapper | Config | Output. API client methods `testJsExpression()` and `testMapper()` with React Query mutation hooks. Mapper state persisted through `ReactFlowRendererService` → `flowTransformations.ts` round-trip.

**Phase 4** — Deleted `LoopExecutionService`, `LoopConfigSection.tsx`, `loop-execution.service.test.ts` (17 tests), `loop-flow.ts` (3 E2E examples). Removed all loop references from `NodeExecutionCoordinator`, `schemas-fresh.ts` (replaced `_loop` with `z.unknown().optional()` for backward compat), `index.ts`, `types-export.ts`, `react-flow-renderer.service.ts`, `AgentNode.tsx`, `UniversalNode.tsx`, `flowTransformations.ts`, `ConfigurationPanel.tsx`, and seed data. 146 unit tests passing.

---

## Decisions (Resolved)

### D1. Statements vs. expressions only?

**Decision: Function-body wrapping. IMPLEMENTED.**

The service wraps user code in `(function(){ ... })()` before passing to QuickJS `evalCode()`. Users write the function body — they use `return` to produce a value and can use `const`, `if/else`, early returns, etc.

For single-expression one-liners, the service **auto-prepends `return`** when the code contains no `return` keyword (checked via `/\breturn\b/`). This means `users.filter(u => u.active)` works without typing `return`, while multi-statement code uses explicit `return`.

Rationale:

1. **Object literals just work** — `return { a: 1, b: 2 }` is unambiguous. Without wrapping, `{ a: 1 }` is a SyntaxError (parsed as a block statement), forcing `({ a: 1 })` which is a footgun.
2. **Conditional logic** — `if (x.length === 0) return []; return x.map(...)` is natural. Can't do that with dangling expressions.
3. **Explicit intent** — `return` makes it obvious what the mapper produces.

```js
// One-liner — auto-return (no return keyword, no semicolons except end):
users.filter(u => u.active)

// Multi-statement — explicit return:
const active = users.filter(u => u.active);
const enriched = active.map((u, i) => ({
  ...u,
  score: scores[i],
  dept: departments.find(d => d.id === u.deptId)?.name
}));
return enriched;

// Conditional early return:
if (!users || users.length === 0) return [];
return users.filter(u => u.active);
```

The UI editor shows a hint: "Write JS code. Use `return` to produce the mapper result." CodeMirror uses full `@codemirror/lang-javascript` with multi-line support.

### D2. Error UX — mapper throws

**Decision: Node fails with clear error.** The node execution trace stores the error message from QuickJS, the expression text, and a truncated snapshot of the input context. No silent passthrough — a broken mapper means the flow author made a mistake and needs to know immediately.

### D3. `$input` context variable

**Decision: Yes.** `$input` is always injected as the full `incomingData` object. This is the escape hatch when upstream keys collide with JS globals (`name`, `length`, `status`) or with each other. Documented in the Data Mapper pane tooltip.

### D4. QuickJS vs. alternatives

**Decision: `quickjs-emscripten` for MVP.** The ~2MB WASM binary is acceptable for server-side. The shared-runtime pattern (one runtime, per-eval contexts) keeps context creation cheap (~0.1ms). Re-evaluate if benchmarks show marshalling > 10ms for typical payloads.

**Deployment note**: `quickjs-emscripten` works in Node.js and Deno. It does NOT work in Cloudflare Workers (no WASM instantiation of that size) or Next.js Edge Runtime (same constraint). Since `@invect/core` only runs in Node.js server contexts (Express, NestJS, Next.js API routes — not Edge), this is fine. If Edge Runtime support becomes a goal, switch to `isolated-vm` (V8 isolate, native addon, faster but platform-dependent).

### D5. Mapper live preview

**Decision: `new Function()` client-side for preview, QuickJS server-side for execution.** The preview is cosmetic — it shows the user what their expression would return given the current input data. Since it runs in the user's own browser tab, sandboxing is unnecessary. The actual execution always runs server-side in QuickJS.

For the cold-start case (no upstream data available), the Data Mapper pane inherits the existing **test mode** pattern: the user can paste or edit sample JSON in the Inputs pane, which feeds into the mapper preview. The "TEST" badge and reset button work the same as today's input test mode.

### D6. Implicit array detection is a footgun

**Decision: Add explicit `mode` field to mapper schema.** Three modes:
- `"auto"` — infer from return type (array → iterate, object → single). Default for programmatic/migration use.
- `"iterate"` — assert the result is an array, fail if not. Frontend default when user clicks "Iterate over items".
- `"reshape"` — assert the result is NOT iterated. If it happens to be an array, wrap it in `{ items: [...] }`. Frontend default when user clicks "Transform data".

The frontend Data Mapper pane has two buttons: **"Iterate"** (sets mode: iterate) and **"Transform"** (sets mode: reshape). The "auto" mode exists for backward compat and API use, but the UI always forces an explicit choice. This prevents the accidental-200-iterations footgun.

### D7. Node type restrictions for mapper

**Decision: Mapper is allowed on all node types except `core.input` and `core.output`.** These are structural — input nodes define flow entry points, output nodes define flow results. A mapper on them makes no semantic sense.

For IF_ELSE: the mapper transforms `incomingData` before the condition evaluates. The mapper output becomes the context for `{{ }}` in the condition param. This is valid and useful (e.g., reshape data before branching). The IF_ELSE branch-skipping logic in `FlowRunCoordinator` runs AFTER node execution, so no conflict.

For TEMPLATE_STRING: the mapper transforms context before the template renders. Also valid.

For AGENT: the mapper transforms context before the agent prompt resolves. Valid.

Validation: `mapperConfigSchema` accepts the mapper, but `executeNode()` skips it (with a warning log) for `core.input` and `core.output`.

### D8. `itemAs` removal — clean break

**Decision: No backward compatibility. `_loop` is removed entirely.** No migration function, no runtime auto-conversion, no template rewriting.

- `loopConfigSchema` is deleted from `schemas-fresh.ts`
- `_loop` field is removed from `flowNodeDefinitionsSchema`
- `LoopExecutionService` is deleted (not deprecated — removed)
- `LoopConfigSection.tsx` is deleted from the frontend
- Any existing flows using `_loop` will need to be manually updated to use `mapper` by the flow author

Rationale: The `_loop` system is internal and has no external consumers. Maintaining backward compat adds code paths that need testing and creates confusion about which system to use. Clean break is simpler.

### D9. Iteration observability — per-item traces

**Decision: Single parent trace + lightweight iteration log in metadata.** Creating N individual `NodeExecution` rows for N iterations would explode the database for large arrays. Instead:

- One `NodeExecution` trace for the entire iterated node execution
- `outputs.data.metadata._iterations` contains a summary array:
  ```json
  {
    "_iterations": [
      { "index": 0, "status": "success", "durationMs": 12 },
      { "index": 1, "status": "success", "durationMs": 8 },
      { "index": 2, "status": "failed", "error": "API rate limit", "durationMs": 150 }
    ],
    "expression": "users.filter(u => u.active)",
    "itemCount": 3,
    "outputMode": "array"
  }
  ```
- Full per-item inputs/outputs are NOT stored (too large). The user can re-run individual items via the frontend test mode if they need to debug a specific iteration.
- The frontend Output pane shows the iteration summary with expandable rows: index, status, duration, and a truncated output preview.

For large iterations (100+ items), the metadata summary is capped at the first 10 + last 5 + any failures. This prevents trace bloat.

### D10. Concurrency for side-effecting nodes

**Decision: Sequential by default. Concurrency > 1 is opt-in and comes with partial-failure semantics.**

- `concurrency: 1` (default) — sequential, stop on first failure. The output contains all successful results up to the failure point, plus the error. The node is marked FAILED.
- `concurrency: N > 1` — parallel batches of N. Within a batch, if any item fails, the remaining items in that batch still complete (they're already in-flight). Subsequent batches do NOT start. Output contains all completed results + the error.
- No built-in rate limiting — that's the action's responsibility (e.g., Gmail action should handle 429s internally). The mapper's `concurrency` controls parallelism, not rate.
- Partial results are always stored in the trace output, even on failure. The `_iterations` metadata shows which succeeded and which failed.

This matches the behavior users expect from `Promise.allSettled`-style execution: don't lose completed work when one item fails.
