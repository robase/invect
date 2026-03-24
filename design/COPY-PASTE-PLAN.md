# Flow Editor Copy/Paste

## Current State

- **React Flow v12.9.2** (`@xyflow/react`) with Zustand store (Immer middleware)
- **Selection** already works: drag-select (`SelectionMode.Partial`), shift+click (React Flow built-in)
- **No keyboard shortcuts** exist beyond Shift key tracking
- A `duplicateNode()` function exists in `useFlowEditorStore.ts` but it only duplicates a single node (no params, no edges) and isn't wired to any UI
- **No context menu** exists on the canvas or nodes
- Node IDs use `{type}-{Date.now()}` format; display names and reference IDs are auto-deduplicated via `nodeReferenceUtils.ts`
- `nanoid` is already a dependency (used for agent tool instance IDs in `FlowEditorV2.tsx`)
- Toast system is currently a `console.log` stub in `useFlowEditorStore.ts`

## Architecture

```
Cmd+C  →  serialize selected nodes + internal edges → write JSON to system clipboard + in-memory fallback
Cmd+V  →  read from system clipboard (or fallback) → remap IDs → deduplicate names → add to store
Cmd+X  →  copy + batch-delete selected nodes
Cmd+D  →  duplicate selection (in-memory copy + immediate paste with offset)
Delete →  batch-delete selected nodes
```

## Clipboard Data Format

Serialized as JSON. Written to both the system clipboard (`navigator.clipboard.writeText()`) and an in-memory `useRef` fallback. The in-memory ref is always written (synchronous, no permissions needed). The system clipboard write is best-effort.

```typescript
interface ClipboardData {
  _type: 'invect-flow-clipboard';  // Discriminator for safe parsing
  version: 1;
  sourceFlowId: string;            // Flow ID where the copy originated
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
  copyTime: number;
}

interface ClipboardNode {
  originalId: string;
  type: string;                      // Action ID (e.g., "core.jq")
  relativePosition: { x: number; y: number };  // Relative to selection bounding box origin
  data: {
    display_name: string;
    reference_id: string;
    params: Record<string, unknown>;  // credentialId preserved — stripped on paste if cross-flow
    mapper?: unknown;
    _loop?: unknown;
    // Agent-specific: addedTools instances are deep-cloned with new instanceIds on paste
  };
}

interface ClipboardEdge {
  originalId: string;
  source: string;       // Original source node ID
  target: string;       // Original target node ID
  sourceHandle?: string;
  targetHandle?: string;
}
```

### Why system clipboard?

- Users can copy nodes in one flow tab and paste into another flow or another browser window
- Standard expectation — Cmd+C/V should use the real clipboard
- The `_type` discriminator prevents pasting random text as nodes
- Falls back gracefully: if clipboard contains non-Invect JSON, paste is a no-op

### Dual clipboard strategy (system + in-memory fallback)

The system clipboard API has two problems: (1) `readText()` is async and requires user permission, and (2) it's blocked in iframes without the `clipboard-read` Permissions Policy.

**Strategy**: Always write to both. On paste, try system clipboard first; if it fails (permission denied, iframe restriction, async timing issue), fall back to the in-memory ref. This gives us:
- Cross-tab paste when system clipboard is available
- Guaranteed same-tab paste always works (in-memory ref is synchronous)
- No broken experience in iframe embeds (Next.js route mounts, etc.)

### What gets copied and what gets updated on paste

All `node.data.params` fields are deep-cloned — this means every config value (prompts, queries, model selection, JQ expressions, HTTP URLs, if-else conditions, etc.) is fully preserved. Specific handling:

| Data | On Copy | On Paste |
|------|---------|----------|
| All config params (`params.*`) | Deep-cloned | Kept as-is |
| `params.credentialId` | **Preserved** | **Kept** if pasting into same flow; **stripped** if pasting into a different flow |
| `params.addedTools` (agent tool instances) | Deep-cloned (name, description, toolId, per-tool params) | Each instance gets a **fresh `instanceId`** via `nanoid()` |
| `display_name` | Captured | **Regenerated** — deduplicated ("AI Model" → "AI Model 2") |
| `reference_id` | Captured | **Regenerated** — deduped slug for new display name |
| `mapper`, `_loop` config | Deep-cloned | Kept as-is |
| Node `position` | Stored as relative offset | **Recomputed** — placed at mouse cursor / viewport center |
| Runtime state (`executionOutput`, `previewOutput`, `status`, etc.) | **Not copied** | Pasted nodes arrive `idle` with no execution history |
| Internal edges | Captured | **Remapped** — new node IDs, fresh edge IDs |

### Credential handling

Node params may contain `credentialId` values referencing specific credential records. Credentials are **preserved in the clipboard data** (the `ClipboardData` includes `sourceFlowId` to enable comparison). On paste:

- **Same flow** (`sourceFlowId === current flowId`): `credentialId` is kept as-is. This is the common case — duplicating nodes within a flow should preserve their credential config.
- **Different flow** (`sourceFlowId !== current flowId`): `credentialId` is **stripped** (set to `undefined`). Nodes arrive with the credential selector as "not configured." This prevents dangling references and silent auth failures when credentials may not apply in the new context.

Note: credentials are workspace-scoped (not flow-scoped), so cross-flow paste within the same workspace would technically work. But stripping is the safer default — credential requirements may differ between flows, and the user should explicitly confirm the credential choice. This can be relaxed in a future iteration if needed.

### Position encoding

Positions are stored **relative to the selection's bounding box top-left corner**, not as absolute canvas coordinates. This means pasted nodes appear near the paste target (mouse cursor or viewport center) rather than overlapping the originals.

```
On copy:
  minX = min(selected nodes' x positions)
  minY = min(selected nodes' y positions)
  relativePosition = { x: node.x - minX, y: node.y - minY }

On paste:
  anchor = mouse position in flow coords (or viewport center if mouse isn't on canvas)
  node.position = { x: anchor.x + relativePosition.x, y: anchor.y + relativePosition.y }
```

## Operations

### Copy (`Cmd+C`)

1. Get currently selected nodes from `getNodes().filter(n => n.selected)`
2. If no nodes are selected, no-op
3. Get all edges from the store
4. Filter edges to only those where **both** source and target are in the selected set (internal edges only — edges to unselected nodes are not captured, matching standard behavior in Figma/Miro/etc.)
5. Compute bounding box origin of selected nodes, convert positions to relative
6. Deep-clone node data (params, mapper, _loop). Strip `credentialId` from params.
7. For agent nodes with `addedTools`, deep-clone the tool instances
8. Serialize as `ClipboardData` JSON
9. Write to in-memory `clipboardRef` (always succeeds)
10. Write to system clipboard via `navigator.clipboard.writeText(json)` — wrapped in try/catch, failure is non-fatal

**Focus guard**: Skip if the keyboard event target is inside the `.react-flow` container's overlay elements (config panel, modals) or is an editable element. Specifically, only handle shortcuts when focus is on the ReactFlow canvas itself — check `el.closest('.react-flow')` AND none of `INPUT`, `TEXTAREA`, `[contenteditable]`, `.cm-editor`. This is more robust than enumerating all editable elements because it positively asserts "focus is on the canvas."

### Paste (`Cmd+V`)

**Critical: `preventDefault` timing.** Since `navigator.clipboard.readText()` is async, we cannot conditionally `preventDefault()` after the await. Instead:

1. Apply focus guard (same as copy). If focus guard fails, return immediately (don't interfere).
2. `e.preventDefault()` synchronously — we've already confirmed focus is on the canvas, so there's nothing useful the browser's default paste would do here anyway.
3. Try `navigator.clipboard.readText()`. On failure (permission denied, iframe), fall back to `clipboardRef.current`.
4. Parse JSON. If it doesn't have `_type: 'invect-flow-clipboard'`, no-op and return.
5. **Remap node IDs**: Create `Map<oldId, newId>` where `newId = {type}-{nanoid()}` (using nanoid instead of `Date.now()` to avoid collisions on rapid paste or parallel tabs)
6. **Deduplicate names**: For each node, call `generateUniqueDisplayName()` and `generateUniqueReferenceId()` against current store nodes + already-pasted nodes in this batch
7. **Compute paste anchor**: Use `reactFlowInstance.screenToFlowPosition(mousePosition)` if mouse is over canvas, otherwise use viewport center
8. **Set positions**: `anchor + relativePosition` for each node
9. **Validate `maxInstances`**: For each node type, check if adding it would exceed the limit. Skip violating nodes. Collect skipped node IDs.
10. **Remap edges**: Replace `source`/`target` with new IDs from the mapping. Generate new edge IDs via `nanoid()`. Drop edges whose source or target was skipped due to maxInstances.
11. **Regen agent tool instanceIds**: For agent nodes with `addedTools`, generate fresh `nanoid()` for each tool instance's `instanceId` to avoid collisions with existing agent nodes.
12. **Batch add**: Call `pasteNodesAndEdges(newNodes, newEdges)` — single store update, all nodes marked `selected: true`
13. If any nodes were skipped, show toast warning.

### Cut (`Cmd+X`)

1. Copy (above)
2. Batch-delete all selected nodes via `removeNodes(ids[])` — single store update (see store additions below)

### Duplicate (`Cmd+D`)

1. Serialize selected nodes + internal edges into `ClipboardData` (same as copy, but write to internal ref only — don't touch system clipboard)
2. Immediately run paste logic using the internal ref, with a fixed offset of `(50, 50)` from original positions instead of mouse position

### Delete Selection (`Backspace` / `Delete`)

1. Get selected nodes
2. Batch-delete via `removeNodes(ids[])` — single store update
3. Same focus guard as copy

## File Changes

| File | Change |
|------|--------|
| **New**: `pkg/frontend/src/hooks/useCopyPaste.ts` | Core hook: clipboard serialization, paste with ID remapping, keyboard listeners |
| `pkg/frontend/src/stores/flowEditorStore.ts` | Add `pasteNodesAndEdges(nodes[], edges[])` and `removeNodes(nodeIds[])` batch actions |
| `pkg/frontend/src/hooks/useFlowEditorStore.ts` | Export `useCopyPaste` from the hook barrel, remove old `duplicateNode` (superseded) |
| `pkg/frontend/src/components/flow-editor-v2/FlowEditorV2.tsx` | Call `useCopyPaste({ reactFlowInstance })`, pass the React Flow instance ref |

### No changes needed

- `nodeReferenceUtils.ts` — `generateUniqueDisplayName` and `generateUniqueReferenceId` already handle dedup correctly
- `flowTransformations.ts` — paste creates React Flow `Node` objects directly, not `InvectDefinition`
- Backend / `pkg/core` — purely a frontend feature

## Store Additions

### `pasteNodesAndEdges` — Atomic paste

Single Zustand `set()` call. All validation (maxInstances, edge remapping, ID generation) is done by the caller in the hook **before** calling this action. The store action is a dumb batch insert — it trusts that the caller has produced valid nodes and edges.

```typescript
pasteNodesAndEdges: (newNodes: Node[], newEdges: Edge[]) =>
  set((state) => {
    // Deselect all existing nodes
    state.nodes = state.nodes.map(n => ({ ...n, selected: false }));
    // Add new nodes (already marked selected: true by caller)
    state.nodes.push(...newNodes);
    // Add new edges
    state.edges.push(...newEdges);
    state.isDirty = true;
    // Close config panel since selection changed
    state.selectedNodeId = null;
    state.configPanelOpen = false;
  }),
```

### `removeNodes` — Atomic batch delete

Replaces the N separate `removeNode()` calls that would cause N re-renders on cut/delete:

```typescript
removeNodes: (nodeIds: string[]) =>
  set((state) => {
    const idSet = new Set(nodeIds);
    state.nodes = state.nodes.filter(n => !idSet.has(n.id));
    // Remove all connected edges (both internal and external)
    state.edges = state.edges.filter(e => !idSet.has(e.source) && !idSet.has(e.target));
    state.isDirty = true;
    if (state.selectedNodeId && idSet.has(state.selectedNodeId)) {
      state.selectedNodeId = null;
      state.configPanelOpen = false;
    }
  }),
```

## Keyboard Handler

```typescript
useEffect(() => {
  const handler = async (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;

    // Positive assertion: only handle when focus is on the ReactFlow canvas
    // and NOT on an editable sub-element (input, textarea, codemirror, etc.)
    const isOnCanvas = el.closest('.react-flow') !== null;
    const isEditing =
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable ||
      el.closest('.cm-editor') !== null ||
      el.closest('[role="dialog"]') !== null;  // Modals (config panel, tool selector, etc.)

    if (!isOnCanvas || isEditing) return;

    const isMod = e.metaKey || e.ctrlKey;

    if (isMod && e.key === 'c') { e.preventDefault(); await copy(); }
    else if (isMod && e.key === 'x') { e.preventDefault(); await cut(); }
    else if (isMod && e.key === 'v') { e.preventDefault(); await paste(); }
    else if (isMod && e.key === 'd') { e.preventDefault(); duplicate(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
  };

  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [copy, paste, cut, duplicate, deleteSelection]);
```

## Edge Cases

| Case | Handling |
|------|----------|
| Focus in input/textarea/CodeMirror/modal | Skip — positive canvas focus check fails |
| `maxInstances` overflow on paste | Skip those nodes, log warning via toast stub |
| Empty selection on copy | No-op |
| Non-Invect clipboard content on paste | No-op after JSON parse fails discriminator check |
| System clipboard permission denied / iframe blocked | Fall back to in-memory ref (same-tab paste always works) |
| Cross-flow paste (different flow in another tab) | Works via system clipboard when available. IDs remapped, names deduplicated against target flow's nodes. |
| Repeated paste from same copy | Each paste generates new IDs (nanoid) and deduplicates names. Position anchors to mouse each time. |
| Agent node with `enabledTools` | Tool IDs are global — copy cleanly. `addedTools` instances get fresh `instanceId`s on paste. |
| Agent node tool instance params | Deep-cloned. Tool instance `credentialId` refs are stripped same as node-level ones. |
| Node params with `{{ reference_id }}` templates | Left as-is for v1. Stale references are an accepted tradeoff — user edits after paste. |
| Pasting nodes with `mapper` or `_loop` config | Deep-cloned during copy, pasted as-is |
| Copy in flow A, paste in flow B (same tab) | Works via system clipboard. `sourceFlowId` differs → credential IDs stripped. |
| Node params contain `credentialId` | Preserved if same-flow paste; stripped if cross-flow paste (compared via `sourceFlowId`) |
| `Cmd+V` while clipboard has non-Invect text | `preventDefault` already fired (we're on canvas, no useful default paste). JSON parse check rejects, function returns silently. No side effects. |
| Invect embedded in iframe (Next.js, etc.) | System clipboard blocked → in-memory fallback used seamlessly. Cross-tab paste unavailable but same-tab paste works. |
| RBAC: user copies from read-only flow | Copy is a frontend-only operation on data already loaded into the client. If the user can view the flow, they can copy from it. This matches standard UX (you can copy text from a read-only document). No additional RBAC enforcement needed — edit permission is enforced on save. |
| Cut deletes edges to unselected nodes | Yes, external edges are destroyed. Without undo, this is irreversible. Acceptable for v1 — will pair with undo/redo. |

## Design Decisions & Rationale

### Why `nanoid` instead of `Date.now()` for IDs?

The existing `createNode` uses `{type}-{Date.now()}` which has a collision window when creating multiple nodes in the same millisecond. Paste amplifies this — we generate N IDs at once. `nanoid` is already a dependency (used for agent tool instances in `FlowEditorV2.tsx`). New ID format: `{type}-{nanoid()}` (e.g., `core.jq-V1StGXR8_Z5jdHi6B-myT`). This eliminates collisions entirely.

> **Note**: This changes the ID format for pasted nodes only. Existing `createNode` in `useFlowEditorStore.ts` keeps `Date.now()` for now — migrating it is a separate concern.

### Why `preventDefault` synchronously on paste?

The original plan called for "conditionally preventDefault after confirming clipboard data." This is **impossible** — `preventDefault()` must be called synchronously in the event handler, but `navigator.clipboard.readText()` is async. By the time the promise resolves, the event is stale.

**Resolution**: Since the focus guard already confirms we're on the ReactFlow canvas (not in any editable element), `preventDefault` is always safe — there's no useful default paste behavior on a canvas div. So we call it synchronously, then proceed with the async clipboard read.

### Why strip `credentialId` only on cross-flow paste?

Credential IDs are workspace-scoped database references. Within the same flow, duplicating a node should preserve its credential — the user expects an exact copy. Cross-flow, the credential may not apply (different context, different required scopes). The `ClipboardData` includes `sourceFlowId`; on paste, the hook compares it to the current flow's ID. Same flow = keep credentials. Different flow = strip. This is done at paste time, not copy time, so the clipboard data is always complete.

### Why validation lives in the hook, not the store?

The `pasteNodesAndEdges` store action is deliberately dumb — it trusts its inputs. All validation (maxInstances, edge remapping, dedup) lives in `useCopyPaste.ts`. This keeps the store thin and testable, and keeps validation logic co-located with the serialization logic that produces the data.

### Why not use React Flow's built-in `addEdge` for pasted edges?

React Flow's `addEdge()` from `@xyflow/react` does dedup and validation, but it operates one edge at a time and triggers re-renders. Since we've already validated the edges in the hook (confirmed source/target exist, generated unique IDs), pushing directly into `state.edges` in a single batch is correct and avoids N re-renders.

## Future Enhancements (Not in v1)

- **Undo/redo**: Zustand history middleware or command pattern. Pairs naturally with copy/paste. This is the most important follow-up — cut/delete are currently irreversible.
- **Context menu**: Right-click node → Copy / Cut / Duplicate / Delete. Right-click canvas → Paste.
- **Template reference fixup**: When pasting a group that includes both a referencing and referenced node, rewrite `{{ old_ref }}` → `{{ new_ref }}` in params. Requires scanning all string-valued params for Nunjucks template patterns.
- **Visual paste preview**: Show ghost nodes at cursor position before confirming paste.
- **Toast system**: The current toast is a `console.log` stub. Copy/paste warnings (maxInstances skip, clipboard permission failure) will use this stub initially. A proper toast library (e.g., sonner) should be added to the frontend package — tracked separately.
