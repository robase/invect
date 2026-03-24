# Run Node in CodeMirror Input Preview

## Goal

The intended UX is:

- The node config panel input preview shows upstream inputs keyed by the upstream node mapping slug.
- If an upstream node has not produced output yet, the input preview should show that slot as unresolved.
- The user should be able to trigger execution for that upstream node directly from the input preview.
- Running that upstream node should execute only the path required to produce that node's output.
- When execution completes, the input preview should refresh in place and replace the unresolved placeholder with the real output data.

This is meant to let the user inspect upstream outputs while editing a downstream node, without running the whole flow.

## Current End-to-End Code Path

### 1. The input preview is built from incoming edges

Frontend preview state is computed in:

- `pkg/frontend/src/components/flow-editor-v2/node-config-panel/hooks/useNodeConfigPanelState.ts`

`computeInputFromEdges()` walks all edges targeting the currently open node and builds a JSON object keyed by the upstream mapping slug:

- Preferred key: `sourceNodeData.reference_id`
- Fallback key: a generated slug from the source node display name

For each upstream node, it chooses output in this order:

- `previewOutput`
- `executionOutput`
- `mockOutputData`
- `exampleOutput`

If no output exists, it inserts the literal placeholder string:

`[NO DATA]`

So the input preview for a downstream node looks like:

```json
{
  "upstream_slug": "[NO DATA]"
}
```

That placeholder is the trigger for the current CodeMirror widget.

### 2. The input preview panel passes an `onRunNode` callback into the JSON editor

The node config panel wiring is:

- `pkg/frontend/src/components/flow-editor-v2/node-config-panel/NodeConfigPanel.tsx`
- `pkg/frontend/src/components/flow-editor-v2/node-config-panel/panels/InputPanel.tsx`
- `pkg/frontend/src/components/flow-editor-v2/node-config-panel/JsonPreviewPanel.tsx`
- `pkg/frontend/src/components/ui/codemirror-json-editor.tsx`

`NodeConfigPanel` passes `handleRunUpstreamNode` into `InputPanel`, which passes it through `JsonPreviewPanel`, which passes it to `CodeMirrorJsonEditor` as `onRunNode`.

### 3. The JSON editor looks for the literal `"[NO DATA]"` string

The widget lives in:

- `pkg/frontend/src/components/ui/codemirror-json-editor.tsx`

Current mechanism:

- `NO_DATA_PATTERN = /"\[NO DATA\]"/g`
- `runNodeButtonPlugin` scans the raw document text for exact matches
- For each match, `findPropertyKeyAtPosition()` regex-scans backward in the raw text to find the JSON key
- It creates `RunNodeWidget(propertyKey)`
- The widget currently replaces the entire value token `"[NO DATA]"`

Important detail:

- The widget is not attached to the JSON key node
- It is attached to the placeholder value token
- The upstream node identifier passed to the callback is inferred from the preceding key text

This means the current UI contract is:

- unresolved value string -> regex lookup of key -> use key as node identifier

### 4. Clicking the button resolves the upstream node by `reference_id`

The click callback lands in:

- `pkg/frontend/src/components/flow-editor-v2/node-config-panel/NodeConfigPanel.tsx`

`handleRunUpstreamNode(nodeReferenceId)` does the following:

1. Verifies `flowId` exists
2. Searches `storeNodes` for a node whose `data.reference_id === nodeReferenceId`
3. Auto-saves the flow via `flowActions.onSave({ skipSuccessToast: true })`
4. Calls the partial execution mutation with:

```ts
executeFlowToNodeMutation.mutateAsync({
  flowId,
  nodeId: targetNode.id,
  inputs: {},
  options: { useBatchProcessing: false },
})
```

### 5. Frontend mutation -> API client -> backend route

Frontend mutation and client:

- `pkg/frontend/src/hooks/useApiQueries.ts`
- `pkg/frontend/src/services/apiClient.ts`

This results in:

- `POST /flows/:flowId/run-to-node/:nodeId`

Adapter route example:

- `pkg/express/src/invect-router.ts`

That route forwards to:

- `Invect.executeFlowToNode(flowId, nodeId, inputs, options)`

### 6. Core orchestration executes only the target path

Core entrypoints:

- `pkg/core/src/invect-core.ts`
- `pkg/core/src/services/flow-orchestration.service.ts`
- `pkg/core/src/services/flow-orchestration/flow-run-coordinator.ts`
- `pkg/core/src/services/graph.service.ts`

Execution flow:

1. Load the latest flow definition
2. Validate that `targetNodeId` exists
3. Create a flow run record
4. Compute execution path with `graphService.getExecutionPathToNode(targetNodeId, nodes, edges)`
5. Execute only those upstream nodes plus the target node
6. Return traces for all executed nodes
7. Return `outputs` containing only the target node output

Important implementation detail from `FlowRunCoordinator.executeFlowToNode()`:

- `traces` contains every executed node trace
- `outputs` is deliberately narrowed to only the target node

That means the frontend relies on `traces` to hydrate upstream preview state, not just `outputs`.

### 7. Frontend hydrates preview state from traces, then recomputes the input preview

Back in `NodeConfigPanel.handleRunUpstreamNode()`:

- It iterates `result.traces`
- For each executed node trace, it writes:
  - `previewInput: trace.inputs`
  - `previewOutput: extractOutputValue(trace.outputs)`
- It also writes target-node outputs from `result.outputs`
- Finally it calls `previewState.refreshInputFromEdges()`

`refreshInputFromEdges()` recomputes the current node's input preview using `computeInputFromEdges()` again.

This is the intended moment where:

- `"[NO DATA]"` disappears
- real upstream output data appears in the input preview JSON

## Why The Current Feature Is Fragile

### 1. The UI is attached to the wrong token

The feature conceptually belongs to the JSON key, because that key is the mapping handle for the upstream node output.

Current behavior attaches the widget to the unresolved value token instead:

- key = semantic link to upstream node
- value = temporary unresolved placeholder string

That makes the UI dependent on a placeholder representation instead of the actual mapping identity.

### 2. The current implementation is text-regex based, not syntax- or data-model based

The widget depends on:

- finding exact raw text `"[NO DATA]"`
- regex-scanning backward to find the nearest property key

This is brittle for a few reasons:

- it is tied to one exact placeholder encoding
- it does not attach to the parsed JSON property node
- it assumes the key can always be recovered correctly from raw text scanning

### 3. The callback lookup assumes the displayed key always equals `reference_id`

This is one of the most important likely failure points.

In `computeInputFromEdges()` the preview key is:

- `reference_id`, if present
- otherwise `generateSlug(displayName)`

In `handleRunUpstreamNode()` the lookup is only:

```ts
data?.reference_id === nodeReferenceId
```

So if a source node does not have a `reference_id` and the preview used the generated display-name slug fallback, the run-node button can render with a valid key but the callback cannot resolve that key back to a real upstream node.

This creates a direct mismatch between:

- how the input preview key is produced
- how the run-node callback resolves the upstream node

### 4. The feature depends on the local preview store being hydrated correctly from traces

The partial execution API only returns `outputs` for the target node.

So this feature works only if:

- `traces` are present
- each upstream trace contains usable `outputs`
- `extractOutputValue()` can flatten that output correctly
- the node store is updated for every executed upstream node
- `refreshInputFromEdges()` re-runs after those writes

If any one of those steps fails, the current node input preview will continue to show `"[NO DATA]"` and the button will appear broken even though the backend execution succeeded.

### 5. The widget disappears as soon as the placeholder value is no longer in the raw JSON text

Because the widget is tied to the unresolved value string, not the key:

- any manual edit that changes or removes `"[NO DATA]"` removes the affordance
- test mode edits can erase the placeholder structure entirely
- formatting or alternate unresolved states are not supported

That makes the feature difficult to reason about and difficult to extend.

## What Is Actually Intended

The intended semantic join point is the JSON key on the current node's input preview.

That key is special because it is the visible representation of the upstream input mapping created from incoming edges.

Conceptually:

- current node input preview key = upstream mapping handle
- upstream mapping handle should resolve directly to an upstream source node
- clicking the play affordance beside that key should run that upstream node path
- the resulting output should replace the unresolved state in the same input preview editor

This means the control should be key-based, not placeholder-value-based.

## Full Redesign Proposal

---

### Design Principles

1. **The JSON key is the primary semantic handle** — it represents an upstream node's output slot. All affordances attach to the key, not the value.
2. **Structured metadata drives the editor, not regex scanning** — the CodeMirror layer receives typed slot data, never reverse-parses rendered JSON.
3. **Every upstream slot has an explicit state** — idle, loading, resolved, error. Each state has a clear visual treatment.
4. **The callback carries a stable node ID** — not a display string that can diverge from the actual node identity.
5. **The backend returns everything the frontend needs in one response** — no digging through traces to reconstruct per-node outputs.

---

### 1. Data Model: `UpstreamSlot`

A new type that replaces the current untyped `Record<string, unknown>` preview object. This is the single source of truth for what the input preview shows and what state each upstream connection is in.

```ts
// pkg/frontend/src/components/flow-editor-v2/node-config-panel/types.ts

type UpstreamSlotStatus = 'idle' | 'loading' | 'resolved' | 'error';

interface UpstreamSlot {
  /** The JSON key used in the input preview (reference_id or generated slug) */
  key: string;
  /** The real React Flow node ID — used for the API call */
  sourceNodeId: string;
  /** Human-readable label shown on hover / in tooltips */
  sourceLabel: string;
  /** Current state of this slot */
  status: UpstreamSlotStatus;
  /** The resolved output value, or null if not yet produced */
  output: unknown;
  /** Error message if execution failed */
  error: string | null;
}
```

**Key contract**: the `key` field is always derived the same way as the backend's `buildIncomingDataObject` — `referenceId || generateSlug(label)`. The `sourceNodeId` is always the React Flow node's `id`, which maps directly to the flow definition node ID used in API calls.

---

### 2. Backend Changes

#### 2a. Expand `outputs` in `executeFlowToNode` response

**Current behavior**: `outputs` contains only the target node's output.

**New behavior**: `outputs` contains a flattened map of `nodeId -> extractedOutput` for every node that executed successfully.

This is a small change in `FlowRunCoordinator.executeFlowToNode()`:

```ts
// pkg/core/src/services/flow-orchestration/flow-run-coordinator.ts

// CURRENT — only target node
const finalOutputs: Record<string, unknown> = {};
if (targetNodeOutput) {
  finalOutputs[targetNodeId] = targetNodeOutput;
}

// NEW — all executed nodes
const finalOutputs: Record<string, unknown> = {};
for (const [nodeId, output] of nodeOutputs.entries()) {
  finalOutputs[nodeId] = output;
}
```

**Why**: The frontend needs to know every upstream node's output after a partial run. Currently it digs through `traces[].outputs` and calls `extractOutputValue()` per trace. With `outputs` containing all nodes, the frontend gets a flat, pre-keyed map of `nodeId -> structuredOutput`. The `traces` array is still there for detailed inspection but is no longer the primary data source for preview hydration.

**Breaking risk**: Low. The existing frontend already checks `result.outputs` before `result.traces`. Adding more keys to `outputs` is additive. All framework adapters just forward the result object.

#### 2b. Add a per-node error map to the response (optional but recommended)

Add a `nodeErrors` field to `FlowRunResult`:

```ts
// pkg/core/src/services/flow-runs/flow-runs.service.ts

export type FlowRunResult = {
  status: FlowRunStatus;
  flowRunId: string;
  startedAt: Date;
  error?: string;
  metadata?: Record<string, unknown>;
  completedAt?: Date;
  duration?: number;
  outputs?: Record<string, unknown>;       // All executed node outputs
  nodeErrors?: Record<string, string>;     // nodeId -> error message
  inputs?: Record<string, unknown>;
  traces: NodeExecution[];
};
```

The coordinator populates this when a node fails:

```ts
const nodeErrors: Record<string, string> = {};

// ... in the execution loop, on failure:
if (trace.status === NodeExecutionStatus.FAILED) {
  nodeErrors[nodeId] = trace.error || 'Node execution failed';
  hasFailure = true;
}

// ... in the return:
return {
  // ...existing fields
  outputs: finalOutputs,
  nodeErrors: Object.keys(nodeErrors).length > 0 ? nodeErrors : undefined,
  traces: nodeExecutions,
};
```

**Why**: Lets the frontend show per-slot error messages without scanning traces.

#### 2c. No new endpoints needed

`POST /flows/:flowId/run-to-node/:nodeId` is the right shape. No new routes.

---

### 3. Frontend Changes

#### 3a. New hook: `useUpstreamSlots`

Replaces the current `computeInputFromEdges()` function. Lives alongside the existing preview hooks.

```ts
// pkg/frontend/src/components/flow-editor-v2/node-config-panel/hooks/useUpstreamSlots.ts

function useUpstreamSlots(nodeId: string | null): {
  slots: UpstreamSlot[];
  slotMap: Map<string, UpstreamSlot>;
  runSlot: (slot: UpstreamSlot) => Promise<void>;
  runAllUnresolved: () => Promise<void>;
  isAnyLoading: boolean;
} {
  // Read nodes/edges from Zustand store
  // Build UpstreamSlot[] from incoming edges
  // Per-slot loading/error state is tracked in local useState/useReducer
  // runSlot: sets slot to loading, auto-saves, calls executeFlowToNode,
  //          hydrates all trace outputs, refreshes slots
  // runAllUnresolved: runs all idle/error slots sequentially
}
```

**How `slots` are built** (replaces `computeInputFromEdges`):

```ts
for (const edge of incomingEdges) {
  const sourceNode = nodes.find(n => n.id === edge.source);
  const sourceData = sourceNode?.data as ExtendedNodeData;
  const key = sourceData.reference_id || generateSlug(sourceData.display_name || sourceNode.id);
  const output = sourceData.previewOutput ?? sourceData.executionOutput ?? null;

  slots.push({
    key,
    sourceNodeId: sourceNode.id,      // ← stable ID, not reference_id
    sourceLabel: sourceData.display_name || sourceNode.id,
    status: slotStates[sourceNode.id]?.status ?? (output != null ? 'resolved' : 'idle'),
    output,
    error: slotStates[sourceNode.id]?.error ?? null,
  });
}
```

**How `runSlot` works**:

```ts
async function runSlot(slot: UpstreamSlot) {
  // 1. Set slot status to 'loading'
  updateSlotState(slot.sourceNodeId, { status: 'loading', error: null });

  // 2. Auto-save the flow
  const saved = await flowActions.onSave({ skipSuccessToast: true });
  if (!saved) {
    updateSlotState(slot.sourceNodeId, { status: 'error', error: 'Failed to save flow' });
    return;
  }

  // 3. Execute partial flow
  try {
    const result = await executeFlowToNodeMutation.mutateAsync({
      flowId,
      nodeId: slot.sourceNodeId,
      inputs: {},
      options: { useBatchProcessing: false },
    });

    if (result.status === 'SUCCESS') {
      // 4. Hydrate ALL executed nodes into the store
      for (const [executedNodeId, nodeOutput] of Object.entries(result.outputs ?? {})) {
        const extracted = extractOutputValue(nodeOutput);
        updateNodeDataInStore(executedNodeId, { previewOutput: extracted });
      }
      // 5. Mark this slot as resolved
      updateSlotState(slot.sourceNodeId, { status: 'resolved', error: null });
    } else {
      const errorMsg = result.nodeErrors?.[slot.sourceNodeId]
        || result.error
        || 'Execution failed';
      updateSlotState(slot.sourceNodeId, { status: 'error', error: errorMsg });
    }
  } catch (err) {
    updateSlotState(slot.sourceNodeId, {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unexpected error',
    });
  }
}
```

**How `runAllUnresolved` works**:

Iterates all slots with status `idle` or `error`, calls `runSlot` for each sequentially (to avoid saving the flow N times in parallel).

#### 3b. The input preview JSON is derived from slots

Instead of `computeInputFromEdges()` producing a `Record<string, unknown>` directly, it is now computed from `slots`:

```ts
const inputPreviewObject = Object.fromEntries(
  slots.map(slot => [
    slot.key,
    slot.status === 'resolved' ? slot.output : null,
  ])
);
const inputPreviewJson = JSON.stringify(inputPreviewObject, null, 2);
```

**Important**: unresolved slots are now `null` in the JSON, not `"[NO DATA]"`. This keeps the JSON always valid and parseable, removes the need for a magic string, and allows the CodeMirror layer to handle display purely via decorations.

#### 3c. CodeMirror editor: slot-aware line decorations

The `CodeMirrorJsonEditor` receives slots metadata as a new prop:

```ts
interface CodeMirrorJsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  // ... existing props

  /** Upstream slot metadata for inline run controls */
  upstreamSlots?: UpstreamSlot[];
  /** Called when user clicks the run button for a slot */
  onRunSlot?: (slot: UpstreamSlot) => void;
}
```

**The old regex-based system is completely removed**: `NO_DATA_PATTERN`, `findPropertyKeyAtPosition`, `RunNodeWidget`, `runNodeButtonPlugin`, `runNodeCallbackRef` — all deleted.

**New decoration approach**: a CodeMirror `ViewPlugin` or `StateField` that:

1. Receives `upstreamSlots` via a `StateEffect` / compartment (updated when slots change)
2. Parses the document minimally to find lines containing top-level JSON keys
3. For each line whose key matches a slot's `key`, creates a **gutter marker** or **line decoration**

The decoration per slot status:

| Status | Left gutter icon | Value display | Tooltip |
|--------|-----------------|---------------|---------|
| `idle` | ▶ play (muted) | `null` (dimmed) | "Run {label} to get its output" |
| `loading` | ⟳ spinner | `null` (dimmed, shimmer) | "Running {label}..." |
| `resolved` | ▶ play (subtle) | actual value (normal) | "Re-run {label}" |
| `error` | ⚠ warning | `null` (red-tinted) | "Error: {message}. Click to retry" |

**Implementation detail for the gutter**:

```ts
// A custom gutter that shows run controls
const runSlotGutter = gutter({
  class: 'cm-run-slot-gutter',
  markers: (view) => {
    // Read slots from a StateField
    // For each line, check if it starts a top-level JSON key matching a slot
    // Return the appropriate GutterMarker (play, spinner, warning)
  },
  domEventHandlers: {
    click: (view, line) => {
      // Find which slot this line corresponds to
      // Call onRunSlot(slot)
      return true;
    },
  },
});
```

**Why gutter instead of inline widget**: The gutter is stable — it doesn't move when the value changes, doesn't get destroyed by formatting, and provides a consistent click target. The play icon sits in its own column, visually separated from the JSON content.

#### 3d. Visual states in detail

**Idle (no data yet)**:
```
▶  "upstream_node":  null
```
- Play icon in gutter: muted foreground color, 12px
- `null` value rendered in dimmed/italic style via line decoration
- Hover tooltip: "Run **Upstream Node** to get its output"

**Loading**:
```
⟳  "upstream_node":  null
```
- Animated spinner icon replaces play icon
- `null` value has a subtle pulse/shimmer CSS animation
- Line has a faint highlight background
- Click is disabled (the gutter marker ignores clicks during loading)

**Resolved**:
```
▶  "upstream_node":  {"id": 123, "name": "Alice"}
```
- Play icon in gutter: very subtle, almost invisible until hover
- Value rendered normally
- Hover tooltip: "Re-run **Upstream Node**"
- Clicking re-runs and re-hydrates

**Error**:
```
⚠  "upstream_node":  null
```
- Warning triangle icon in amber/red
- `null` value rendered with a subtle red tint
- Line has a faint red background highlight
- Hover tooltip: "Error: Connection refused. Click to retry"
- Clicking retries the execution

#### 3e. "Run All" button in the Input panel toolbar

The `InputPanel` toolbar (above the editor) gets a "Run All" button that calls `runAllUnresolved()`:

```tsx
<div className="flex items-center gap-1">
  <span className="text-xs font-medium">Input</span>
  {unresolvedCount > 0 && (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 px-1.5 text-[10px]"
      onClick={runAllUnresolved}
      disabled={isAnyLoading}
    >
      {isAnyLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      Run all ({unresolvedCount})
    </Button>
  )}
</div>
```

#### 3f. Updated component wiring

```
NodeConfigPanel
  ├── useUpstreamSlots(nodeId)          ← NEW: computes slots, manages per-slot state
  │     ├── slots: UpstreamSlot[]
  │     ├── runSlot(slot)
  │     ├── runAllUnresolved()
  │     └── isAnyLoading
  │
  ├── inputPreviewJson                  ← derived from slots (not computeInputFromEdges)
  │
  ├── InputPanel
  │     ├── value={inputPreviewJson}
  │     ├── upstreamSlots={slots}       ← NEW
  │     ├── onRunSlot={runSlot}         ← NEW (replaces onRunNode)
  │     ├── onRunAll={runAllUnresolved} ← NEW
  │     └── isAnyLoading               ← NEW
  │
  └── JsonPreviewPanel
        └── CodeMirrorJsonEditor
              ├── upstreamSlots={slots} ← NEW
              └── onRunSlot={runSlot}   ← NEW (replaces onRunNode)
```

**Removed props**: `onRunNode: (nodeReferenceId: string) => void` is replaced everywhere by `onRunSlot: (slot: UpstreamSlot) => void`.

**Removed code**:
- `computeInputFromEdges()` — replaced by slot derivation
- `handleRunUpstreamNode()` in `NodeConfigPanel` — replaced by `useUpstreamSlots.runSlot`
- `RunNodeWidget`, `runNodeButtonPlugin`, `NO_DATA_PATTERN`, `findPropertyKeyAtPosition`, `runNodeCallbackRef`, `runNodeButtonStyles` in `codemirror-json-editor.tsx` — all replaced by the gutter-based system
- `isRunningUpstream` state in `NodeConfigPanel` — per-slot state lives in `useUpstreamSlots`

---

### 4. State Flow Diagram

```
User opens node config panel
  │
  ▼
useUpstreamSlots(nodeId) computes slots from edges + node store
  │
  ├── For each incoming edge:
  │     sourceNodeId = edge.source
  │     key = reference_id || generateSlug(label)
  │     output = node.data.previewOutput ?? executionOutput ?? null
  │     status = output != null ? 'resolved' : 'idle'
  │
  ▼
inputPreviewJson = JSON.stringify(slotsToObject(slots))
  │
  ▼
CodeMirrorJsonEditor renders JSON with gutter markers per slot
  │
  ├── idle slots:    ▶ play icon, `null` dimmed
  ├── resolved slots: ▶ subtle, real value
  │
  ▼
User clicks ▶ on an idle slot
  │
  ▼
runSlot(slot) called
  │
  ├── slot.status = 'loading'           → gutter shows ⟳ spinner
  ├── auto-save flow
  ├── POST /flows/:flowId/run-to-node/:slot.sourceNodeId
  │
  ▼
Backend executes upstream path
  │
  ├── Returns { outputs: { nodeId: output, ... }, nodeErrors?: {...} }
  │
  ▼
Frontend hydrates ALL executed nodes into store
  │
  ├── For each (nodeId, output) in result.outputs:
  │     updateNodeData(nodeId, { previewOutput: extractOutputValue(output) })
  │
  ▼
useUpstreamSlots recomputes (store changed → slots re-derive)
  │
  ├── slot.status = 'resolved', slot.output = real data
  │
  ▼
CodeMirrorJsonEditor re-renders
  │
  ├── gutter: ▶ subtle
  ├── value: real data replaces null
  │
  ▼
Done — user sees upstream output inline
```

---

### 5. Error Handling Matrix

| Scenario | Slot State | Gutter | Value | User Action |
|----------|-----------|--------|-------|-------------|
| Flow save fails | `error` | ⚠ | `null` | "Failed to save flow" tooltip. Click to retry. |
| Network error | `error` | ⚠ | `null` | Error message in tooltip. Click to retry. |
| Upstream node execution fails | `error` | ⚠ | `null` | Per-node error from `nodeErrors`. Click to retry. |
| Batch pause | `error` | ⏸ | `null` | "Paused for batch processing" tooltip. |
| Upstream node not found in flow | (slot not shown) | — | — | Edge exists but node deleted → edge cleanup needed |
| Partial success (some nodes fail) | mixed | per-slot | per-slot | Failed slots show ⚠, succeeded slots show data |

---

### 6. CSS / Styling

All styles scoped inside `.cm-run-slot-gutter` and using existing `--cm-vscode-widget-*` CSS variables:

```css
.cm-run-slot-gutter {
  width: 20px;
  /* Gutter column to the left of line numbers */
}
.cm-run-slot-gutter .cm-gutterElement {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0 2px;
}

/* Play icon — idle */
.cm-slot-idle svg {
  width: 12px; height: 12px;
  color: var(--cm-vscode-widget-fg-muted);
  opacity: 0.5;
  transition: opacity 0.15s;
}
.cm-slot-idle:hover svg {
  opacity: 1;
  color: var(--cm-vscode-widget-accent);
}

/* Spinner — loading */
.cm-slot-loading svg {
  width: 12px; height: 12px;
  color: var(--cm-vscode-widget-accent);
  animation: cm-slot-spin 0.8s linear infinite;
}
@keyframes cm-slot-spin {
  to { transform: rotate(360deg); }
}

/* Check — resolved (very subtle, only visible on hover) */
.cm-slot-resolved svg {
  width: 12px; height: 12px;
  color: var(--cm-vscode-widget-fg-muted);
  opacity: 0;
  transition: opacity 0.15s;
}
.cm-slot-resolved:hover svg {
  opacity: 0.6;
}

/* Warning — error */
.cm-slot-error svg {
  width: 12px; height: 12px;
  color: var(--cm-vscode-widget-error, #f85149);
}

/* Dimmed null for unresolved slots */
.cm-slot-null-value {
  opacity: 0.4;
  font-style: italic;
}

/* Shimmer for loading slots */
.cm-slot-loading-value {
  opacity: 0.4;
  animation: cm-slot-shimmer 1.5s ease-in-out infinite;
}
@keyframes cm-slot-shimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

/* Error line tint */
.cm-slot-error-line {
  background: color-mix(in srgb, var(--cm-vscode-widget-error, #f85149) 8%, transparent);
}
```

---

### 7. Files Changed

| Layer | File | Change |
|-------|------|--------|
| **Core types** | `pkg/core/src/services/flow-runs/flow-runs.service.ts` | Add optional `nodeErrors` to `FlowRunResult` |
| **Core coordinator** | `pkg/core/src/services/flow-orchestration/flow-run-coordinator.ts` | `executeFlowToNode` populates `outputs` for all executed nodes + `nodeErrors` for failures |
| **Frontend types** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/types.ts` | New `UpstreamSlot`, `UpstreamSlotStatus` types |
| **Frontend hook** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/hooks/useUpstreamSlots.ts` | New hook: slot computation, per-slot execution state, `runSlot`, `runAllUnresolved` |
| **Frontend hook** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/hooks/useNodeConfigPanelState.ts` | Remove `computeInputFromEdges`. Input preview derived from slots. |
| **Frontend panel** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/NodeConfigPanel.tsx` | Replace `handleRunUpstreamNode` + `isRunningUpstream` with `useUpstreamSlots`. Wire new props. |
| **Frontend panel** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/panels/InputPanel.tsx` | Accept `upstreamSlots`, `onRunSlot`, `onRunAll`, `isAnyLoading`. Add "Run All" button. |
| **Frontend panel** | `pkg/frontend/src/components/flow-editor-v2/node-config-panel/JsonPreviewPanel.tsx` | Pass `upstreamSlots` + `onRunSlot` through to editor. Remove `onRunNode`. |
| **Frontend editor** | `pkg/frontend/src/components/ui/codemirror-json-editor.tsx` | Remove `RunNodeWidget`, `runNodeButtonPlugin`, regex scanning, `runNodeCallbackRef`. Add gutter-based slot system with `StateField`, `GutterMarker`s, line decorations. |
| **Frontend editor styles** | (injected via `<style>` or CSS file) | New `.cm-run-slot-gutter` styles, `.cm-slot-*` state classes |

---

### 8. Migration / Backward Compatibility

- The `onRunNode?: (nodeReferenceId: string) => void` prop on `CodeMirrorJsonEditor`, `JsonPreviewPanel`, and `InputPanel` is replaced by `onRunSlot?: (slot: UpstreamSlot) => void`. This is internal to `@invect/frontend` — not a public API.
- The backend `FlowRunResult.outputs` expanding from target-only to all-nodes is additive. Existing consumers that only read `outputs[targetNodeId]` are unaffected.
- `nodeErrors` is optional, so existing consumers ignore it.
- The `"[NO DATA]"` placeholder string is removed entirely. Unresolved slots are `null` in JSON.

---

### 9. What Is Explicitly Not In Scope

- **Streaming execution progress** — the partial run is still request/response. No SSE or WebSocket for per-node progress during a single `run-to-node` call.
- **Parallel slot execution** — slots are run one at a time (sequentially) to avoid concurrent saves. This could be optimized later since each `run-to-node` call auto-saves first.
- **Caching/memoization of upstream outputs across panel opens** — outputs are stored in `previewOutput` on the node data, which persists across panel opens within the same editing session, but not across page reloads.
- **Changes to the "Run Node" button in the ConfigurationPanel header** — that button runs the *current* node (not an upstream). It uses `useNodeExecution` and is unaffected by this redesign.