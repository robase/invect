# Plan: Remove Nunjucks & node-jq — Replace with JS Expressions

## Goal

Replace both `nunjucks` and `node-jq` with JavaScript expressions evaluated via the existing `JsExpressionService` (QuickJS WASM sandbox). This:

- Drops 2 dependencies (`nunjucks`, `node-jq` — the latter requiring a native binary)
- Unifies the expression language to JavaScript everywhere
- Keeps the familiar `{{ }}` delimiter syntax for backward compatibility
- Reuses the existing `quickjs-emscripten` sandbox infrastructure

## Current State

### Nunjucks Usage

The `{{ }}` template syntax is used in **every node param field** to reference upstream outputs. The resolution pipeline is:

```
User types: "Hello {{ fetch_user.name }}!"
              ↓
NunjucksService.isTemplate() detects {{ }}
              ↓
NunjucksService.render(template, incomingData)
              ↓
Result: "Hello Alice!"
```

**Touch points:**
| Location | What it does |
|----------|-------------|
| `node-execution-coordinator.ts` → `resolveTemplateParams()` | Main execution path — resolves all `{{ }}` in node params during flow runs |
| `invect-core.ts` → `resolveTemplateParams()` | Test execution path — resolves templates for "Run Node" in editor |
| `node-data.service.ts` → `runTemplateReplacement()` | Standalone endpoint for template testing/preview |
| `template-string.ts` action | Dedicated "Template String" node type |
| `system-prompt.ts` | AI chat assistant documentation about template syntax |
| 15+ action `description` fields | Mention "Supports Nunjucks templating" |
| `codemirror-nunjucks-editor.tsx` | Frontend syntax highlighting for `{{ }}` |
| `DroppableInput.tsx` | Wraps the nunjucks editor with drag-drop variable insertion |

**Nunjucks features actually used:**
- Variable interpolation: `{{ var.path }}` ✅ (most common)
- Custom filters: `| json`, `| first`, `| last`, `| number`, `| bool`, `| default`, `| get`, `| value`, `| keys`, `| values`
- Custom globals: `exists()`, `isArray()`, `isObject()`
- **NOT used:** inheritance, macros, blocks, for loops, if/else blocks, includes

### node-jq Usage

Only 2 locations:
- `actions/core/jq.ts` — The "JQ Transformation" node/tool
- `node-data.service.ts` → `executeJq()` — Test endpoint for JQ preview

### Existing JS Expression Infrastructure

`JsExpressionService` (QuickJS sandbox) already exists and is used by the **Data Mapper** feature. It:

- Injects upstream data as local variables + `$input` escape hatch
- Auto-prepends `return` for one-liners
- Runs in a sandboxed WASM runtime (16MB memory limit)
- Is already initialized during `Invect.initialize()`

---

## Design

### 1. Template Resolution: JS inside `{{ }}`

**Keep the `{{ }}` delimiter** — it's familiar, backward-compatible, and the frontend syntax highlighting already handles it. But evaluate the content as **JavaScript** instead of Nunjucks.

#### How it works

```
Before (Nunjucks):  "Hello {{ fetch_user.name }}!"
After (JS):         "Hello {{ fetch_user.name }}!"   ← identical for simple paths!
```

Simple property access syntax is identical between Nunjucks and JS. The difference matters for:

| Pattern | Nunjucks | JS (new) |
|---------|----------|----------|
| Property access | `{{ user.name }}` | `{{ user.name }}` ← same |
| Nested path | `{{ user.address.city }}` | `{{ user.address.city }}` ← same |
| Filter: JSON | `{{ data \| json }}` | `{{ JSON.stringify(data) }}` |
| Filter: first | `{{ items \| first }}` | `{{ items[0] }}` |
| Filter: last | `{{ items \| last }}` | `{{ items[items.length - 1] }}` or `{{ items.at(-1) }}` |
| Filter: number | `{{ val \| number }}` | `{{ Number(val) }}` |
| Filter: bool | `{{ val \| bool }}` | `{{ Boolean(val) }}` |
| Filter: default | `{{ val \| default("fallback") }}` | `{{ val ?? "fallback" }}` |
| Filter: keys | `{{ obj \| keys }}` | `{{ Object.keys(obj) }}` |
| Filter: values | `{{ obj \| values }}` | `{{ Object.values(obj) }}` |
| Filter: get | `{{ obj \| get("a.b") }}` | `{{ obj?.a?.b }}` |
| Global: exists | `{{ exists(val) }}` | `{{ val != null }}` ← keep as helper |
| Global: isArray | `{{ isArray(val) }}` | `{{ Array.isArray(val) }}` |
| Global: isObject | `{{ isObject(val) }}` | `{{ typeof val === 'object' && val !== null }}` |
| String concat | `{{ "Hi " + name }}` | `{{ "Hi " + name }}` ← same |
| Ternary | N/A (use if block) | `{{ active ? "yes" : "no" }}` |
| Array ops | N/A | `{{ items.filter(x => x.active).length }}` |

**Key insight:** For 90%+ of real usage (simple property access), the syntax is **identical**. The migration is backward-compatible for the common case.

#### New `TemplateService` (replaces NunjucksService)

```typescript
// pkg/core/src/services/templating/template.service.ts

export class TemplateService {
  private jsExpressionService: JsExpressionService;

  constructor(jsExpressionService: JsExpressionService) {
    this.jsExpressionService = jsExpressionService;
  }

  /**
   * Check if a string contains template expressions {{ ... }}
   */
  isTemplate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return /\{\{[\s\S]*?\}\}/.test(value);
  }

  /**
   * Render a template string by evaluating {{ expr }} blocks as JavaScript.
   *
   * For each {{ ... }} block:
   * 1. Extract the JS expression inside the delimiters
   * 2. Evaluate it against the context using JsExpressionService
   * 3. Stringify the result and splice it into the output
   *
   * For "pure expression" templates (entire value is a single {{ expr }}),
   * return the raw JS value (object, array, number) instead of stringifying.
   */
  render(template: string, context: Record<string, unknown>): unknown {
    // Pure expression: entire string is one {{ expr }} → return raw value
    const pureMatch = template.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
    if (pureMatch) {
      return this.jsExpressionService.evaluate(pureMatch[1], context);
    }

    // Mixed template: string with embedded {{ expr }} blocks → string interpolation
    return template.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_match, expr) => {
      try {
        const result = this.jsExpressionService.evaluate(expr.trim(), context);
        if (result === null || result === undefined) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        return String(result);
      } catch {
        return ''; // Silently swallow errors for inline expressions
      }
    });
  }

  /**
   * Safe render variant returning a result object
   */
  safeRender(template: string, context: Record<string, unknown>): TemplateRenderResult { ... }

  /**
   * Extract variable references from a template (for dependency analysis)
   */
  extractVariableReferences(template: string): string[] {
    const refs: string[] = [];
    const pattern = /\{\{\s*([a-zA-Z_]\w*)/g;
    let m;
    while ((m = pattern.exec(template)) !== null) {
      if (!refs.includes(m[1])) refs.push(m[1]);
    }
    return refs;
  }
}
```

**Key difference from Nunjucks:** Pure expressions (`{{ some_object }}` as the entire field value) return the raw JS value, not a stringified version. This lets you pass objects/arrays between nodes without JSON.parse round-tripping.

### 2. JavaScript Node / Action / Tool

Replace `core.jq` with `core.javascript` — a general-purpose JavaScript action.

```typescript
// pkg/core/src/actions/core/javascript.ts

export const javascriptAction = defineAction({
  id: 'core.javascript',
  name: 'JavaScript',
  description: 'Transform data with JavaScript. Upstream node outputs are available as variables.',
  provider: CORE_PROVIDER,
  tags: ['javascript', 'js', 'transform', 'code', 'filter', 'map', 'script'],

  params: {
    schema: z.object({
      code: z.string().min(1, 'JavaScript code is required'),
    }),
    fields: [{
      name: 'code',
      label: 'JavaScript Code',
      type: 'code',
      required: true,
      description: 'JS code to execute. Upstream node data is available as local variables. Use `return` for multi-statement code; single expressions auto-return.',
      placeholder: 'items.filter(x => x.active).map(x => x.name)',
    }],
  },

  async execute(params, context) {
    const { code } = params;
    const data = context.incomingData ?? {};
    const jsService = context.functions?.getJsExpressionService?.();

    // Evaluate using the shared JsExpressionService (QuickJS sandbox)
    const result = jsService.evaluate(code, data);
    const output = typeof result === 'object' && result !== null
      ? JSON.stringify(result)
      : String(result ?? '');

    return {
      success: true,
      output,
      metadata: {
        resultType: Array.isArray(result) ? 'array' : typeof result,
        executedAt: new Date().toISOString(),
      },
    };
  },
});
```

This replaces `core.jq` with a strictly more powerful alternative. Users who were writing `.data | {name: .name}` in JQ now write `({ name: data.name })` in JS — same sandbox, one less language to learn.

### 3. Frontend Changes

#### Rename editor conceptually (minimal code change)

The `codemirror-nunjucks-editor.tsx` component already highlights `{{ }}` using a regex-based decoration plugin. The decoration logic does **not** depend on Nunjucks — it's parsing `{{ }}` delimiters generically. Changes needed:

1. **Rename** `codemirror-nunjucks-editor.tsx` → `codemirror-template-editor.tsx`
2. **Rename** CSS classes: `cm-nunjucks-brace` → `cm-template-brace`, etc.
3. **Rename** export: `CodeMirrorNunjucksEditor` → `CodeMirrorTemplateEditor`
4. Update import in `DroppableInput.tsx`

The decoration plugin's regex (`/\{\{(.*?)\}\}/g`) and the variable/filter parsing already work for JS — a `|` in JS (bitwise OR) won't commonly appear in template expressions, and the variable path highlighting (`variable.property.path`) is identical.

#### Update action descriptions

Replace "Supports Nunjucks templating" → "Use `{{ expression }}` to reference upstream node data" in all action field descriptions.

#### Update CodeMirror editor for JS node

The new `core.javascript` action uses `type: 'code'` fields. The existing CodeMirror JSON/JS editors already handle this.

---

## Implementation Phases

### Phase 1: New TemplateService + JavaScript Action (additive, no breaking changes)

**Files to create:**
- `pkg/core/src/services/templating/template.service.ts` — New JS-based template service
- `pkg/core/src/actions/core/javascript.ts` — New JavaScript action

**Files to modify:**
- `pkg/core/src/services/templating/index.ts` — Export new TemplateService
- `pkg/core/src/actions/core/index.ts` — Export JavaScript action
- `pkg/core/src/actions/index.ts` — Add to `allBuiltinActions`

**Test:** Both old (Nunjucks) and new (JS) template services work side-by-side. The JavaScript action registers and executes correctly.

### Phase 2: Wire TemplateService into execution engine (swap)

**Files to modify:**
- `pkg/core/src/services/flow-orchestration/node-execution-coordinator.ts`
  - Replace `NunjucksService` dependency with `TemplateService`
  - `resolveTemplateParams()` uses `templateService.render()` instead of `nunjucksService.render()`
  - `isTemplate()` check uses `templateService.isTemplate()`
- `pkg/core/src/invect-core.ts`
  - Replace `getNunjucksService()` with `getTemplateService()`
  - Update `resolveTemplateParams()` private method
- `pkg/core/src/services/node-data.service.ts`
  - Replace `nunjucks.renderString()` in `runTemplateReplacement()` with `templateService.render()`
  - Replace `jq.run()` in `executeJq()` with `jsExpressionService.evaluate()` (or remove JQ endpoint)
- `pkg/core/src/actions/core/template-string.ts`
  - Update description text (remove "Nunjucks" mention)
  - Execution already delegates via `context.functions.runTemplateReplacement`; this function just needs to be re-pointed

**Expose `JsExpressionService` in action context:**
- `pkg/core/src/actions/types.ts` — Add `getJsExpressionService` to `ActionExecutionContext.functions`
- `pkg/core/src/actions/action-executor.ts` — Pass it through when building context

### Phase 3: Remove old dependencies

**Files to delete:**
- `pkg/core/src/services/templating/nunjucks.service.ts`
- `pkg/core/src/actions/core/jq.ts`

**Files to modify:**
- `pkg/core/src/services/templating/index.ts` — Remove Nunjucks exports
- `pkg/core/src/actions/core/index.ts` — Remove JQ action export
- `pkg/core/src/actions/index.ts` — Remove from `allBuiltinActions`
- `pkg/core/src/index.ts` — Remove NunjucksService from barrel exports
- `pkg/core/package.json` — Remove `nunjucks`, `node-jq`, `@types/nunjucks`
- `pkg/core/src/services/node-data.service.ts` — Remove `import nunjucks` and `import jq`

### Phase 4: Frontend & documentation cleanup

**Files to rename:**
- `codemirror-nunjucks-editor.tsx` → `codemirror-template-editor.tsx`

**Files to modify:**
- `DroppableInput.tsx` — Update import
- `ConfigFieldWithTemplate.tsx` — Update any Nunjucks references in comments/labels
- All action files with "Supports Nunjucks" descriptions (~15 files)
- `system-prompt.ts` — Replace Nunjucks docs with JS expression docs
- `agent-executor.ts` — Update taskPrompt field description

---

## Migration / Backward Compatibility

### What breaks

**Nothing for simple property access** — `{{ user.name }}`, `{{ fetch_user.email }}` work identically in JS.

**Nunjucks filters break** — `{{ data | json }}`, `{{ items | first }}` etc. are not valid JS. These will need migration:
- `| json` → `JSON.stringify(data)` 
- `| first` → `items[0]`
- `| last` → `items.at(-1)`
- `| number` → `Number(val)`
- `| default("x")` → `val ?? "x"`
- `| keys` → `Object.keys(obj)`
- `| values` → `Object.values(obj)`
- `| get("a.b")` → `obj?.a?.b`

**Nunjucks globals break** — `exists(val)`, `isArray(val)`, `isObject(val)`. Options:
1. Inject these as helpers in the QuickJS context (zero migration cost)
2. Or let users write native JS (`val != null`, `Array.isArray(val)`, etc.)

**Recommendation:** Inject the helpers for v1 to keep backward compat, remove later.

### Migration heuristic (optional auto-migration)

Could add a one-time migration pass that detects Nunjucks filter syntax (`| filterName`) in saved flow params and rewrites them:

```typescript
function migrateNunjucksToJs(template: string): string {
  return template
    .replace(/\|\s*json\b/g, (m) => /* rewrite to JSON.stringify */)
    .replace(/\|\s*first\b/g, '[0]')
    // etc.
}
```

This is optional — only needed if there are stored flows using filter syntax.

### JQ migration

Users with `core.jq` nodes in saved flows will see a "node type not found" error after removal. Options:
1. **Keep `core.jq` as a deprecated alias** that internally runs JS (parse JQ → JS translation is hard, don't do this)
2. **Leave `core.jq` registered but show a deprecation warning** in the UI, pointing users to `core.javascript`
3. **Remove and document** — simplest; JQ usage is niche

**Recommendation:** Option 2 for a release cycle, then option 3.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| QuickJS perf for template resolution (many `{{ }}` per node × many nodes) | High — called on every param of every node during execution | Benchmark: single QuickJS `evaluate()` call is ~0.1ms. A node with 10 params = ~1ms. Acceptable. |
| QuickJS initialization time | Medium — WASM module load | Already initialized at startup; `TemplateService` reuses the existing singleton |
| Saved flows with Nunjucks filter syntax | Medium — existing flows break | Inject compat helpers (`json()`, `first()`, etc.) as global functions in QuickJS context |
| JQ power users | Low — small audience | Provide migration docs; JS is strictly more capable |
| Frontend syntax highlighting for JS inside `{{ }}` | Low — current regex-based highlighting still works | Variable paths highlight identically; no change needed for basic usage |

---

## Files Changed Summary

| Phase | Files Created | Files Modified | Files Deleted |
|-------|--------------|----------------|---------------|
| 1 | 2 | 3 | 0 |
| 2 | 0 | 5-6 | 0 |
| 3 | 0 | 7 | 2 |
| 4 | 0 | ~20 | 0 |
| **Total** | **2** | **~35** | **2** |

Dependencies removed: `nunjucks`, `node-jq`, `@types/nunjucks`
Dependencies kept: `quickjs-emscripten` (already present, now used for both templates and JS action)
