# Node Config Panel — Editing Experience

## Overview

Verify the node configuration panel provides a seamless editing experience:
users can view structured JSON input from upstream nodes, run predecessor nodes
to populate data, drag-and-drop Nunjucks template variables into form fields,
and never see `[object Object]` where a full JSON object should appear.

**Seed data**: The Express-Drizzle example ships several pre-built flows that
exercise the patterns under test. The most relevant are:

| Seed flow                   | Why it matters                                                              |
| --------------------------- | --------------------------------------------------------------------------- |
| JQ Data Transform           | Input → JQ → Template — JSON objects flow between nodes                     |
| User Age Check              | Input → JQ → If-Else → Template — branching + template references           |
| E-Commerce Order Processing | Multi-input → JQ merge → nested If-Else → Templates — deeply nested objects |
| Simple Template Flow        | Input → Template — basic Nunjucks `{{ topic }}`                             |

---

## Scenario 1 — Open config panel and view three-pane layout

**Goal**: Double-clicking a node on the canvas opens the config panel dialog
with Input (left), Configuration (center), and Output (right) panes.

### Steps

1. Navigate to the app at `/`.
2. Click the flow card named **"JQ Data Transform"** to open it in the editor.
3. Double-click the **"Filter Admins"** (JQ) node on the canvas.
4. **Assert** the config panel dialog appears (`role=dialog`).
5. **Assert** the left pane header contains "INPUT" (uppercase label).
6. **Assert** the center pane contains "PARAMETERS" section header.
7. **Assert** the right pane header contains "OUTPUT" (uppercase label).
8. **Assert** the node name input shows "Filter Admins".

---

## Scenario 2 — Input panel shows structured JSON, not `[object Object]`

**Goal**: When an upstream node has output, the Input panel renders the full
JSON object — never the string `[object Object]`.

### Steps

1. Open the **"JQ Data Transform"** flow.
2. Double-click the **"User List"** (Input) node.
3. Click the **"Run Node"** button in the center panel header.
4. Wait for execution to complete (button stops showing "Running…").
5. Close the config panel (press Escape or click outside).
6. Double-click the **"Filter Admins"** (JQ) node.
7. In the Input panel (left pane), read the JSON content.
8. **Assert** the JSON contains the key `"data"` (the upstream node's `referenceId`).
9. **Assert** the JSON contains nested properties like `"users"` with array items.
10. **Assert** the text `[object Object]` does **not** appear anywhere in the Input panel.
11. **Assert** the JSON is valid (parseable with `JSON.parse`).

---

## Scenario 3 — Run previous node via inline `[NO DATA]` button

**Goal**: When an upstream node has no output yet, the Input panel shows
`"[NO DATA]"` with an inline "Run node" button that executes the upstream node.

### Steps

1. Open the **"JQ Data Transform"** flow (fresh, no prior executions).
2. Double-click the **"Filter Admins"** (JQ) node.
3. In the Input panel, **assert** the value for `"data"` is `"[NO DATA]"`.
4. **Assert** an inline **"Run node"** button/widget is visible within the JSON editor.
5. Click the inline **"Run node"** button.
6. Wait for execution to finish.
7. **Assert** the `"[NO DATA]"` placeholder is replaced with a JSON object.
8. **Assert** the replacement contains `"users"` array with items (`id`, `name`, `role`).
9. **Assert** the text `[object Object]` does **not** appear.

---

## Scenario 4 — Edit input JSON manually (Test Mode)

**Goal**: Users can manually edit the Input JSON to override upstream values.
A "TEST" badge appears and the reset button restores original data.

### Steps

1. Open the **"JQ Data Transform"** flow.
2. Run the **"User List"** (Input) node first so data is populated.
3. Double-click the **"Filter Admins"** (JQ) node.
4. In the Input panel, the JSON should show the upstream output.
5. Click inside the JSON editor and modify a value (e.g., change `"Alice"` to `"TestUser"`).
6. **Assert** a **"TEST"** badge appears in the Input panel toolbar.
7. **Assert** a reset button (↺ icon) appears next to the TEST badge.
8. Click the **"Run Node"** button in the center panel to run with test data.
9. Wait for execution to complete.
10. In the Output panel (right pane), **assert** the result reflects the modified input (e.g., contains `"TestUser"` if the JQ passes names through).
11. Click the reset button (↺).
12. **Assert** the TEST badge disappears.
13. **Assert** the JSON reverts to the original upstream output.

---

## Scenario 5 — Nunjucks templates in form fields

**Goal**: Template String nodes use `{{ variable }}` syntax in their config
fields, and the resolved values are visible after execution.

### Steps

1. Open the **"Simple Template Flow"** flow.
2. Double-click the **"Build Prompt"** (Template String) node.
3. In the Configuration (center) panel, locate the `template` field.
4. **Assert** the field value contains `{{ topic }}`.
5. **Assert** Nunjucks syntax (`{{` and `}}`) is visually highlighted/styled.
6. Run the upstream **"Topic Input"** node (via the inline Run button in the Input panel, or by running it separately first).
7. Click **"Run Node"** in the center panel header.
8. In the Output panel, **assert** the rendered text contains "artificial intelligence" (the default input value resolved from `{{ topic }}`).
9. **Assert** the output does **not** contain the literal string `{{ topic }}`.

---

## Scenario 6 — Drag-and-drop JSON key into template field

**Goal**: Users can drag a JSON key handle (⋮⋮) from the Input panel into
a template field to insert a Nunjucks variable reference.

### Steps

1. Open the **"User Age Check"** flow.
2. Run the **"User Data"** (Input) node so it has output.
3. Double-click the **"Extract User Info"** (JQ) node.
4. In the Input panel, the JSON should show `"user_data": { "name": "Alice", ... }`.
5. Locate the drag handle (⋮⋮) next to the `"name"` key inside `user_data`.
6. Drag the handle and drop it into the `query` field in the Configuration panel.
7. **Assert** the text `{{ user_data.name }}` (or the appropriate dot-path) was inserted into the field.
8. **Assert** no `[object Object]` text was inserted.

---

## Scenario 7 — Deeply nested objects display correctly

**Goal**: The E-Commerce flow has deeply nested JSON objects (shipping address,
item arrays, calculated totals). All levels render as proper JSON, never
`[object Object]`.

### Steps

1. Open the **"E-Commerce Order Processing"** flow.
2. Double-click the **"Order Data"** (Input) node and click **"Run Node"**.
3. Close the panel. Double-click **"Customer Data"** (Input) node and click **"Run Node"**.
4. Close the panel. Double-click the **"Merge Data"** (JQ) node.
5. In the Input panel, **assert** two top-level keys: `"order"` and `"customer"`.
6. **Assert** `"order"` contains nested `"items"` array with objects having `"sku"`, `"name"`, `"price"`.
7. **Assert** `"order"` contains nested `"shippingAddress"` object with `"street"`, `"city"`, `"state"`, `"zip"`.
8. **Assert** `"customer"` contains nested `"preferences"` object with `"newsletter"`, `"promotions"`.
9. **Assert** no `[object Object]` text appears anywhere in the Input panel.
10. Click **"Run Node"** on the Merge Data node.
11. In the Output panel, **assert** the merged result has all nested properties intact.
12. **Assert** no `[object Object]` in the Output panel.

---

## Scenario 8 — If-Else node passthrough preserves full objects

**Goal**: If-Else nodes pass their input through to the active branch.
The downstream node's Input panel should show the full object, not a
stringified `[object Object]`.

### Steps

1. Open the **"User Age Check"** flow.
2. Run all nodes up to and including the **"Is Adult?"** (If-Else) node:
   - Double-click "User Data", click "Run Node".
   - Close panel, double-click "Extract User Info", click "Run Node".
   - Close panel, double-click "Is Adult?", click "Run Node".
3. Close the panel. Double-click the **"Adult Message"** (Template) node.
4. In the Input panel, **assert** the key `"age_check"` exists.
5. **Assert** `"age_check"` contains the nested object from the If-Else (e.g., `"user_info"` with `"name"`, `"age"`, `"isAdult"`).
6. **Assert** no `[object Object]` in the Input panel.
7. Click **"Run Node"**.
8. In the Output panel, **assert** the rendered template contains "Alice" (resolved from `{{ age_check.user_info.name }}`).

---

## Scenario 9 — Output panel shows valid JSON for object results

**Goal**: After running a JQ or Model node that returns a JSON object,
the Output panel displays it as formatted JSON, not `[object Object]`.

### Steps

1. Open the **"JQ Data Transform"** flow.
2. Run all nodes in order: "User List" → "Filter Admins" → "Format Result".
3. Double-click the **"Filter Admins"** (JQ) node.
4. In the Output panel, **assert** the content is valid JSON.
5. **Assert** the JSON contains `"admins"` (array) and `"count"` (number).
6. **Assert** the text `[object Object]` does not appear.
7. **Assert** the JSON is properly formatted (indented, not single-line).

---

## Scenario 10 — Template field with object reference uses `| dump` correctly

**Goal**: When a Nunjucks template references an object (not a primitive),
the rendered output should show the serialized JSON, not `[object Object]`.

### Steps

1. Open the **"E-Commerce Order Processing"** flow.
2. Run nodes through to the **"Calculate Totals"** (JQ) node.
3. Double-click the **"VIP Welcome"** (Template) node.
4. In the Configuration panel, verify the template field contains references like `{{ vip_check.order_summary.customer.name }}` (string property) and `{{ vip_check.order_summary.total | round(2) }}` (number with filter).
5. Run all upstream nodes, then run this node.
6. In the Output panel, **assert** the rendered message contains:
   - The customer name ("Alice Johnson"), not `[object Object]`.
   - A dollar amount (numeric), not `NaN` or `[object Object]`.
7. **Assert** every `{{ ... }}` template expression was resolved (no unresolved `{{` literals in output).

---

## Scenario 11 — Copy button copies valid JSON from Input panel

**Goal**: The copy button in the Input panel toolbar copies the full JSON
to clipboard, preserving object structure.

### Steps

1. Open the **"JQ Data Transform"** flow.
2. Run the "User List" node.
3. Double-click the "Filter Admins" node.
4. In the Input panel toolbar, click the **Copy** button.
5. Read clipboard contents.
6. **Assert** the clipboard contains valid JSON.
7. **Assert** parsing the JSON yields an object with key `"data"` containing `"users"` array.
8. **Assert** no `[object Object]` in clipboard text.

---

## Scenario 12 — Format button pretty-prints JSON in Input panel

**Goal**: The Format button re-indents the JSON in the Input panel editor.

### Steps

1. Open a flow and populate input data for a downstream node.
2. Double-click the downstream node to open its config panel.
3. Manually compact the JSON in the Input editor (remove some whitespace).
4. Click the **Format** button in the Input panel toolbar.
5. **Assert** the JSON is re-indented with consistent spacing.
6. **Assert** the content is unchanged (same keys/values after formatting).
7. **Assert** no `[object Object]` introduced by formatting.

---

## Cross-cutting assertions (apply to ALL scenarios)

- The text `[object Object]` must **never** appear in the Input panel, Output panel, or resolved template output.
- All JSON displayed in Input/Output panels must be parseable via `JSON.parse`.
- Nested objects and arrays must render with their full structure visible.
- Nunjucks templates referencing object properties via dot-notation (e.g., `{{ order.items }}`) should resolve to the serialized value, not `[object Object]`.
