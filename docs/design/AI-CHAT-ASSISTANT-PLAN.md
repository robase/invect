# AI Chat Assistant for Invect

> **Status**: Planning  
> **Date**: 2026-02-21 (revised)  
> **Scope**: `pkg/core` (chat toolkit + tools), `pkg/express` (streaming endpoint), `pkg/frontend` (chat panel UI)

---

## Overview

An AI-powered chat assistant embedded as a slide-out side panel in the Invect editor. Users interact with the assistant in natural language to **build flows**, **edit nodes**, **discover actions**, **manage credentials**, **configure webhooks**, and **test-run flows** — all without leaving the editor.

The backend implements its own streaming and tool-calling loop using the **existing Anthropic and OpenAI SDKs** already in the project — no Vercel AI SDK dependency in core. The frontend uses [`@ai-sdk/react`](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) (`useChat` hook) and [AI Elements](https://elements.ai-sdk.dev/) UI components for the chat UI, consuming a standard SSE stream from the backend.

The AI model credential for the chat is stored in the **existing credentials table** like any other credential — the deployer or user creates an OpenAI/Anthropic credential and selects it for the chat.

---

## Key Design Decisions

This section documents the rationale for each significant architectural choice.

### D1: `streamText` lives in framework adapters, not core — actually, core owns the stream natively

**Question**: *Should core depend on Vercel AI SDK's `streamText()` for LLM calls?*

**Decision**: Core does **not** depend on the `ai` package at all. Core provides:
- A `ChatToolkit` (tool definitions + system prompt builder + tool executor)
- A `ChatStreamSession` that uses the **existing** `AnthropicAdapter` / `OpenAIAdapter` streaming (Anthropic already streams natively; we add streaming to OpenAI)
- An `AsyncGenerator<ChatStreamEvent>` that yields provider-agnostic events (text deltas, tool calls, tool results, done)

The framework adapters (`pkg/express`, `pkg/nestjs`, `pkg/nextjs`) own the HTTP-to-SSE serialisation. Express reads the async iterator and writes SSE frames. The frontend consumes the SSE stream.

**Rationale**: Core already has `@anthropic-ai/sdk` and `openai` as direct dependencies. Adding `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai` would create two abstraction layers for the same providers. By implementing the chat stream in core ourselves, we keep zero new backend dependencies and full control over the streaming format.

### D2: Chat model credentials use the existing credentials table

**Question**: *How is the AI model for the chat resolved?*

**Decision**: The chat model is backed by a **credential from the credentials table** — the same table and encryption used by all other nodes and the agent executor.

**Flow**:
1. Deployer/user creates an Anthropic or OpenAI credential via the existing credential UI or API
2. The Invect config accepts an optional `chatConfig.credentialId` field — if set, the chat always uses that credential
3. Alternatively, the frontend chat panel header exposes a "Model" dropdown that lists AI-provider credentials; the user picks one per session
4. On each chat request, the backend calls `credentialsService.getDecryptedWithRefresh(credentialId)` to get the API key, then instantiates the appropriate adapter

**Credential resolution order**:
1. Per-request `credentialId` from frontend (user chose a model in the chat header)
2. `InvectConfig.chatConfig.credentialId` (deployer default)
3. First available AI credential from `aiClients` config (legacy fallback)

This means the deployer doesn't need to configure a separate key — if they already have an Anthropic credential for agent nodes, the chat can use it too.

### D3: No new dependencies in `pkg/core`

**Question**: *Three new AI SDK dependencies in core — does that conflict with existing SDKs?*

**Decision**: Zero new dependencies in core. We extend the existing `AnthropicAdapter` (which already streams via `client.messages.create({ stream: true })`) and add streaming to `OpenAIAdapter` (currently non-streaming). The chat-specific logic (tool-calling loop, system prompt builder, tool definitions) is pure TypeScript with Zod for validation.

| Existing dep | Currently used for | Chat uses same dep for |
|---|---|---|
| `@anthropic-ai/sdk` | Agent node, batch | Chat streaming (already streams) |
| `openai` | Agent node, batch | Chat streaming (add `stream: true`) |
| `zod` | Validation everywhere | Tool parameter schemas |

### D4: Granular node tools use a draft/commit pattern, not one-version-per-mutation

**Question**: *Node tools create a new flow version on every mutation — 5 tool calls = 5 versions?*

**Decision**: Introduce a **draft accumulator** pattern. When the chat starts mutating a flow, it:

1. Reads the latest version into a mutable in-memory draft
2. Applies all node tool calls (`add_node`, `remove_node`, `connect_nodes`, `update_node_config`) to the draft
3. On stream completion (or explicit `commit_changes` tool call), creates **one** new flow version from the accumulated draft

The draft lives in the `ChatStreamSession` object (per-request). If the stream errors out or the user cancels, the draft is discarded — no orphan versions.

**Tool behaviour**:
- `add_node`, `remove_node`, `connect_nodes`, `update_node_config`, `move_node` → mutate the in-memory draft, return a preview of the change
- `commit_changes` → persist draft as a new flow version, return the version ID
- `update_flow_definition` (bulk) → replaces the entire draft and auto-commits (for single-shot generation)

The frontend receives a `draft_updated` custom event via SSE whenever the draft changes, allowing the canvas to preview changes in real-time before they're committed.

### D5: The LLM should prefer bulk `update_flow_definition` for new flows, granular tools for edits

**Question**: *`update_flow_definition` vs granular node tools — which does the LLM prefer?*

**Decision**: The system prompt explicitly guides this:
- **Creating a new flow from scratch** or **major restructuring**: use `update_flow_definition` with the complete nodes+edges array in one shot
- **Small edits to an existing flow** (add a node, change a param, rewire an edge): use granular tools

This is enforced via system prompt instructions, not code. The granular tools exist because the LLM is more reliable at "add one Gmail node after the HTTP request" than regenerating a 20-node flow to add one node.

### D6: Node positions are auto-computed — the LLM never specifies coordinates

**Question**: *How does the LLM know where to place nodes on the canvas?*

**Decision**: The `add_node` tool does **not** accept a `position` parameter. Instead:
- When adding a node with a `connectAfter` param, position is computed relative to the connected node (offset below/right using dagre)
- When `update_flow_definition` is used, positions are omitted from the LLM output and the backend runs a full dagre auto-layout pass before persisting
- The frontend runs `fitView()` after receiving the draft update

The LLM has zero spatial awareness, so asking it for `{ x: 350, y: 200 }` would produce garbage. Auto-layout is the right default. Users can manually drag nodes after the assistant places them.

### D7: Additional tools — `duplicate_node`, `rename_node` but not `set_node_reference_id`

**Question**: *Missing common editor operations like duplicate, rename, referenceId control?*

**Decision**: Add `duplicate_node` and `rename_node` to the node tools group. `set_node_reference_id` is **not** exposed — referenceIds are always auto-derived from labels to prevent the LLM from creating inconsistencies. The system prompt explains that `referenceId = snake_case(label)` and that renaming a node auto-updates the referenceId. Downstream Nunjucks template references are updated by the `renameNode` tool.

### D8: Flow context is injected as a compact summary, not the full definition

**Question**: *Sending the full flow definition in every request could be 20-30k tokens.*

**Decision**: Three-tier context strategy:

| Flow size | System prompt injection | Fallback |
|-----------|----------------------|----------|
| ≤ 15 nodes | Compact JSON: `[{ id, type, label, refId, paramKeys }]` + edges (~1-3k tokens) | — |
| 16–50 nodes | Summary: "15 nodes: [labels+types]. 14 edges." (~500 tokens) | `get_current_flow_context` tool |
| > 50 nodes | Count only: "52 nodes, 61 edges." (~50 tokens) | `get_current_flow_context(nodeId?)` for filtered view |

The context is **not** sent in the request body from the frontend. Instead:
- The request sends only `flowId` + `selectedNodeId` + `viewMode`
- The backend loads the flow from the database (always fresh)
- The session caches the flow data and updates it after each mutation

This eliminates stale frontend state and avoids sending huge payloads with every message.

### D9: Action catalog is a tool call, not system prompt bloat

**Question**: *50+ actions in the system prompt — how many tokens does that cost?*

**Decision**: The system prompt includes only a **one-line-per-provider summary**:

```
Available providers: core (10 actions), http (1), gmail (5), slack (3), github (4), 
google_drive (4), google_docs (3), google_sheets (3), google_calendar (3), 
linear (3), postgres (2). Use search_actions for details.
```

~100 tokens total. The `search_actions` and `get_action_details` tools provide detailed info. This trades one tool call for ~3k tokens saved on every single request.

### D10: Message history is truncated with a sliding window + summary

**Question**: *Chat history grows unboundedly — what's the truncation strategy?*

**Decision**: Server-side truncation before each LLM call:

1. **Always keep**: System prompt, last 20 messages (or last ~8k tokens of conversation)
2. **Summarise**: When truncating, replace older messages with a single assistant message: "Earlier in this conversation: [bullet summary of tool calls made and key decisions]"
3. **Compress tool results**: Large tool outputs (flow definitions, run results with big outputs) are truncated to 2k chars with a note "…truncated, use get_flow_run for full details"

The summarisation can use a fast extractive approach (list tool names + key params from older messages) rather than an LLM call.

### D11: Chat panel and NodeConfigPanel coexist as independent panels

**Question**: *How does the chat panel interact with the existing NodeConfigPanel?*

**Decision**: They are **not** mutually exclusive. The `FlowLayout` uses `react-resizable-panels` (already a dependency) to support flexible layouts:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  FlowHeader                                              [💬] [Save]    │
├──────┬──────────────────────────────┬───────────────┬────────────────────┤
│ Node │                              │  NodeConfig   │   Chat Panel      │
│ Pal  │     React Flow Canvas        │  Panel        │   ┌────────────┐  │
│      │                              │  (selected    │   │ Messages   │  │
│      │   ┌──────┐    ┌──────┐      │   node)       │   │ ...        │  │
│      │   │ Node │───→│ Node │      │               │   │            │  │
│      │   └──────┘    └──────┘      │  [Params]     │   │ Tool cards │  │
│      │                              │  [Template]   │   ├────────────┤  │
│      │                              │  [Test]       │   │ [Type...]  │  │
├──────┴──────────────────────────────┴───────────────┴────────────────┘  │
```

- **Chat closed, node selected**: Normal layout (canvas + right config panel)
- **Chat open, no node selected**: Canvas + chat panel on far right
- **Chat open, node selected**: Canvas shrinks, both panels share the right side (configPanel | chatPanel), each resizable
- **Chat open on small screens**: Chat overlays as a drawer (using `vaul`, already a dependency)

Chat panel width is persisted in `uiStore` via zustand persist (localStorage).

### D12: Canvas animates to new nodes created by the assistant

**Question**: *When the LLM adds a node, should the canvas zoom to it?*

**Decision**: Yes, with visual feedback:

1. **New nodes**: Added with a pulsing blue dashed border (3s). If off-screen, `fitView({ nodes: [newNodeId], padding: 0.3, duration: 500 })` smoothly pans.
2. **Toast**: "Assistant added *Gmail: List Messages*" with a "Select" action.
3. **Removed nodes**: Fade to 30% opacity before removal.

Draft changes (pre-commit) show as dashed borders; committed changes show as solid borders.

### D13: The backend always reads fresh state — no stale frontend snapshots

**Question**: *What if the user types a message while the LLM's previous tool call mutates the flow?*

**Decision**: The backend always reads the latest flow from the database before each tool call (D8). The frontend only sends `flowId` (not the full definition). Messages are sequential — `useChat`/`useChatPanel` queues messages and waits for the current stream to complete before sending the next.

### D14: Keyboard shortcut is ⌘+L, not ⌘+I

**Question**: *⌘+I conflicts with italic formatting in CodeMirror.*

**Decision**: **⌘+L** (Mac) / **Ctrl+L** (Windows). This doesn't conflict with CodeMirror or text editing shortcuts and is used by other AI chat UIs (Claude, Cursor). Registered at the app level — if focus is in a native input/textarea, suppress.

### D15: Tool errors are returned to the LLM as structured error results

**Question**: *What happens when a tool call fails?*

**Decision**: Every tool execution is wrapped in try/catch. Errors become tool results:

```typescript
{
  success: false,
  error: "Flow 'xyz' not found",
  errorType: "NotFoundError",
  suggestion: "Available flows: 'Email Automation', 'Slack Bot'. Did you mean one of these?",
}
```

The LLM receives this in context and explains the failure to the user. The frontend renders it in a red-tinted tool result card. The stream does **not** crash — only unrecoverable errors (credential missing entirely, adapter failure) terminate the stream.

### D16: Multi-step tool calling shows real-time progress indicators

**Question**: *maxSteps=8 could take 30-60 seconds. What's the UX?*

**Decision**: The SSE stream includes typed progress events:

```
event: text_delta        → streaming text as it arrives
event: tool_call_start   → "🔧 Creating flow..." (pending state)
event: tool_call_result  → "✅ Created Email Automation" (resolved state)
event: draft_updated     → canvas preview updates
event: done              → spinner stops
```

The chat header shows a subtle animated bar during multi-step sequences. A **"Stop" button** appears during streaming — clicking it aborts the fetch. The backend detects the closed connection and stops the loop after the current step. Uncommitted draft changes are discarded.

### D17: Optimistic version locking prevents concurrent mutation conflicts

**Question**: *Race conditions — user drags a node while LLM adds nodes?*

**Decision**: The draft pattern (D4) isolates LLM mutations from persisted state. On commit:

1. Check: is `baseVersionId` still the latest version?
2. **Yes** → create new version from draft
3. **No** (user saved while assistant was working) → **merge**: load new latest version, replay the draft's add/remove/connect operations on top, create merged version
4. **Merge conflict** (user deleted a node the assistant modified) → return error to LLM, which explains: "Your manual changes conflicted with my edits. Would you like me to re-apply?"

In practice, conflicts are rare — the assistant works in seconds and the most common user action during that time is watching the canvas update.

### D18: Credential creation via chat requires user confirmation in the secure UI

**Question**: *Security concern — users pasting secrets into chat?*

**Decision**: The chat **cannot create credentials directly**. Instead:

- `list_credentials` — read-only, safe
- `test_credential` — read-only, safe
- `suggest_credential_setup` — emits a `ui_action` SSE event that opens the credential creation modal on the frontend
- `list_oauth2_providers` — read-only
- `get_expiring_credentials` — read-only

The user creates credentials through the existing secure UI, never by pasting keys into chat. The LLM can guide them: "You'll need an OpenAI credential. I've opened the setup dialog for you."

OAuth2: The LLM can suggest connecting a provider and trigger the OAuth popup via a `ui_action` event. The actual flow happens in the existing secure popup.

### D19: Tool calls inherit the request's auth context — RBAC enforced

**Question**: *Do tool calls respect RBAC?*

**Decision**: Yes. The chat endpoint's auth middleware extracts the identity (same as all routes). It's passed to `ChatStreamSession`, which passes it through to every tool execution. All tools delegate to `Invect` methods that already enforce RBAC.

If user A has no access to Flow Y, asking the chat "show me Flow Y" returns an auth error, and the LLM responds: "You don't have access to that flow."

### D20: Default model is the cheapest fast model — configurable per deployment

**Question**: *Cost management — every message could cost $0.10-0.50?*

**Decision**: Tiered model strategy:

| Tier | Model (default) | Used for | Est. cost/msg |
|------|----------------|----------|---------------|
| **Fast** | `claude-3-5-haiku` / `gpt-4o-mini` | Default for all chat | $0.005-0.02 |
| **Smart** | `claude-sonnet-4-20250514` / `gpt-4o` | User upgrades per-message | $0.05-0.20 |

- Default set via `chatConfig.defaultModel` or the credential's `defaultModel` field
- Chat composer has a model selector for per-message upgrades
- `maxSteps` defaults to 8; system prompt instructs preferring bulk operations over sequential tool calls
- Future: token budget per session with a warning at ~80%

### D21: All messages go through the LLM — no local bypass

**Question**: *Should simple queries like "list my flows" bypass the LLM?*

**Decision**: No local intent classifier. All messages go through the LLM. Rationale:
- Haiku/GPT-4o-mini is fast (~200ms first token) and cheap ($0.005/call)
- A local classifier adds complexity, is fragile, and misses nuance
- The LLM adds value on simple queries — formats results, suggests next steps, combines multiple reads
- The tier system (D20) handles cost better than a bypass heuristic

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  @invect/frontend                                           │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌───────────────────────────────────────┐  │  │
│  │  │ FlowEditor  │  │  ChatPanel (slide-out right)          │  │  │
│  │  │   V2        │  │  ┌─────────────────────────────────┐  │  │  │
│  │  │             │  │  │ AI Elements: Thread, Message,   │  │  │  │
│  │  │  Canvas     │  │  │ MessageContent, Composer        │  │  │  │
│  │  │  +          │  │  │                                 │  │  │  │
│  │  │  NodeConfig │◄─┤  │ useChatPanel → POST /chat → SSE│  │  │  │
│  │  │  Panel      │  │  │   ↕ text deltas + tool events   │  │  │  │
│  │  │             │  │  │                                 │  │  │  │
│  │  └─────────────┘  │  │ Tool result cards (inline)      │  │  │  │
│  │                    │  └─────────────────────────────────┘  │  │  │
│  │                    └───────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │  SSE stream (text/event-stream)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @invect/express   POST /chat                                      │
│    → Auth middleware (same as all routes)                            │
│    → Parse messages + flowId + credentialId from body               │
│    → core.createChatStream(messages, context, identity)             │
│    → Pipe AsyncGenerator<ChatStreamEvent> → SSE to response         │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @invect/core   ChatStreamService                                  │
│                                                                     │
│  ┌─ ChatStreamSession (per-request) ─────────────────────────────┐ │
│  │  1. Resolve credential → getDecryptedWithRefresh(credentialId)│ │
│  │  2. Build system prompt (flow context + action summary)       │ │
│  │  3. Stream LLM call via existing AnthropicAdapter / OpenAI    │ │
│  │  4. On tool_use → execute tool → yield tool_result event      │ │
│  │     → feed result back to LLM → continue streaming            │ │
│  │  5. On text → yield text_delta events                         │ │
│  │  6. On done → auto-commit draft if dirty → yield done event   │ │
│  │                                                                │ │
│  │  Draft accumulator: in-memory flow definition mutations       │ │
│  │  Max steps: 8 (configurable)                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ ChatToolkit ─────────────────────────────────────────────────┐ │
│  │  Flow Tools:     listFlows, getFlow, createFlow,              │ │
│  │                  updateFlowDefinition, validateFlow            │ │
│  │  Node Tools:     addNode, removeNode, connectNodes,           │ │
│  │                  updateNodeConfig, duplicateNode, renameNode   │ │
│  │  Run Tools:      runFlow, runNodeTest, getFlowRun,            │ │
│  │                  getNodeExecutionResults, listFlowRuns         │ │
│  │  Action Tools:   searchActions, getActionDetails,             │ │
│  │                  listProviders, getProviderActions             │ │
│  │  Cred Tools:     listCredentials, testCredential,             │ │
│  │                  suggestCredentialSetup, listOAuth2Providers   │ │
│  │  Trigger Tools:  listTriggers, createWebhookTrigger,          │ │
│  │                  getWebhookInfo, createCronTrigger             │ │
│  │  Context Tools:  getCurrentFlowContext, getAvailableModels    │ │
│  │  Draft Tools:    commitChanges                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Technology Choices

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend LLM calls** | Existing `@anthropic-ai/sdk` (streaming) + `openai` (add streaming) | Zero new deps; already proven in agent executor; full control over streaming format |
| **Backend tool loop** | Custom `ChatStreamSession` with async generator | Matches the agent executor pattern; yields typed events; no framework coupling |
| **Backend tool schemas** | `zod` (already a dep) | Same validation library used everywhere |
| **Frontend hook** | `@ai-sdk/react` — `useChat()` or custom `useChatPanel` | Manages messages, streaming state, loading, errors |
| **Frontend UI** | AI Elements (`ai-elements`) — `Thread`, `Message`, `Composer` | Pre-built chat components on shadcn/ui; source lives in-repo |
| **Transport** | Server-Sent Events via `text/event-stream` | Simple, uni-directional, works behind any reverse proxy |
| **Credential resolution** | Existing `CredentialsService.getDecryptedWithRefresh()` | Same encryption, same auto-refresh, same table |

### Why Not the Vercel AI SDK on the Backend?

1. **Dependency duplication**: Core already has `@anthropic-ai/sdk` and `openai`. The AI SDK wraps these same packages — adding it means two layers of abstraction for the same API calls.
2. **Control over streaming format**: We need custom SSE events (`draft_updated`, `ui_action`, `tool_call_start`) that `streamText`'s protocol doesn't support natively.
3. **Credential integration**: Our credentials come from an encrypted database table with auto-refresh. The AI SDK expects API keys passed directly — we'd bridge that anyway.
4. **Agent executor alignment**: The chat tool loop is structurally identical to the existing `AgentNodeExecutor` loop. Reusing the same adapter pattern keeps the codebase consistent.
5. **No vendor lock-in**: The core streaming logic is ~200 lines of async generator code. If the AI SDK becomes preferable later, migrating is straightforward.

### Why Keep `@ai-sdk/react` on the Frontend?

The `useChat` hook provides value with minimal coupling — message state management, streaming consumption, abort handling. However, since our SSE format differs from the AI SDK's wire protocol, we may use a **custom `useChatPanel` hook** instead that directly consumes our SSE events. The AI Elements components (`Thread`, `Message`, `Composer`) are pure presentational and don't depend on `useChat` — they take props.

Decision: Start with a custom `useChatPanel` hook (simpler, no format translation needed). Add `@ai-sdk/react` later only if we find ourselves reimplementing too much of its state management.

### Why a Separate Tool Set (Not Reusing Agent Tools)?

| Dimension | Agent Node Tools | Chat Assistant Tools |
|-----------|-----------------|---------------------|
| **Context** | Single node in a running flow | Editor session, user designing a flow |
| **Input** | Data from upstream nodes | User intent + flow metadata |
| **Side effects** | Call external APIs | Mutate flow definitions, query Invect state |
| **Auth** | Node-level credential | User's auth identity (RBAC) |
| **Output** | Data for downstream nodes | Streamed text + UI updates |

---

## Core Package Changes (`pkg/core`)

### New Files

```
pkg/core/src/services/chat/
├── chat-stream.service.ts       # ChatStreamService — orchestrates sessions
├── chat-stream-session.ts       # ChatStreamSession — per-request streaming loop
├── chat-toolkit.ts              # ChatToolkit — tool registry + executor
├── chat-tools.types.ts          # ChatTool, ChatStreamEvent, ChatContext types
├── chat-draft.ts                # FlowDraft — in-memory mutation accumulator
├── system-prompt.ts             # Dynamic system prompt builder
└── tools/                       # Tool implementations (one file per group)
    ├── flow-tools.ts            # listFlows, getFlow, createFlow, updateFlowDefinition, validateFlow
    ├── node-tools.ts            # addNode, removeNode, connectNodes, updateNodeConfig, duplicateNode, renameNode
    ├── run-tools.ts             # runFlow, runNodeTest, getFlowRun, getNodeExecutionResults, listFlowRuns
    ├── action-tools.ts          # searchActions, getActionDetails, listProviders, getProviderActions
    ├── credential-tools.ts      # listCredentials, testCredential, suggestCredentialSetup, listOAuth2Providers
    ├── trigger-tools.ts         # listTriggers, createWebhookTrigger, getWebhookInfo, createCronTrigger, deleteTrigger
    └── context-tools.ts         # getCurrentFlowContext, getAvailableModels
```

### `ChatStreamEvent` — Provider-Agnostic Event Type

```typescript
// pkg/core/src/services/chat/chat-tools.types.ts

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: 'tool_call_result'; toolName: string; toolCallId: string; result: ChatToolResult }
  | { type: 'draft_updated'; draft: { nodes: FlowNodeSummary[]; edges: FlowEdgeSummary[] } }
  | { type: 'ui_action'; action: string; data: Record<string, unknown> }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } };

export interface ChatToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  errorType?: string;
  suggestion?: string;
  uiAction?: { action: string; data: Record<string, unknown> };
}

export interface ChatContext {
  flowId?: string;
  selectedNodeId?: string;
  viewMode?: 'edit' | 'runs';
  credentialId?: string;  // Which AI credential to use for this request
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: { id: string; name: string; input: Record<string, unknown> }[];
  toolCallId?: string;
}
```

### `ChatStreamSession` — The Core Streaming Loop

```typescript
// pkg/core/src/services/chat/chat-stream-session.ts

export class ChatStreamSession {
  private draft: FlowDraft | null = null;
  private aborted = false;

  constructor(
    private invect: Invect,
    private identity: AuthIdentity | undefined,
    private toolkit: ChatToolkit,
    private config: ResolvedChatConfig,
  ) {}

  async *stream(
    messages: ChatMessage[],
    context: ChatContext,
  ): AsyncGenerator<ChatStreamEvent> {
    // 1. Load flow context from DB (not from frontend body)
    const flowContext = context.flowId 
      ? await this.invect.getFlowById(context.flowId)
      : null;
    
    // 2. Build system prompt with tiered context injection (D8)
    const systemPrompt = buildSystemPrompt(flowContext, context, this.invect);
    
    // 3. Truncate history (D10)
    const truncatedMessages = this.truncateHistory(messages);
    
    // 4. Get tool definitions in provider format
    const toolDefs = this.toolkit.getToolDefinitions();
    
    // 5. Resolve credential and get adapter
    const credential = await this.resolveCredential(context.credentialId);
    const adapter = this.getAdapter(credential);
    
    let conversationMessages = [...truncatedMessages];
    let steps = 0;
    
    while (steps < this.config.maxSteps && !this.aborted) {
      steps++;
      
      // Call LLM via existing adapter
      const response = await adapter.executeAgentPrompt({
        systemPrompt,
        messages: conversationMessages,
        tools: toolDefs,
        model: this.config.model,
      });
      
      // Yield text
      if (response.content) {
        yield { type: 'text_delta', text: response.content };
      }
      
      // No tool calls → done
      if (response.type !== 'tool_use' || !response.toolCalls?.length) {
        break;
      }
      
      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        yield { type: 'tool_call_start', toolName: toolCall.name, toolCallId: toolCall.id, args: toolCall.input };
        
        const result = await this.toolkit.executeTool(toolCall.name, toolCall.input, {
          invect: this.invect,
          identity: this.identity,
          draft: this.draft,
          context,
        });
        
        yield { type: 'tool_call_result', toolName: toolCall.name, toolCallId: toolCall.id, result };
        
        if (this.draft?.isDirty) {
          yield { type: 'draft_updated', draft: this.draft.getSummary() };
        }
        if (result.uiAction) {
          yield { type: 'ui_action', action: result.uiAction.action, data: result.uiAction.data };
        }
        
        // Append to conversation for next LLM iteration
        conversationMessages.push({ role: 'assistant', content: '', toolCalls: [toolCall] });
        conversationMessages.push({ role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(result) });
      }
    }
    
    // Auto-commit draft on completion
    if (this.draft?.isDirty && !this.aborted) {
      const commitResult = await this.draft.commit();
      yield { type: 'tool_call_result', toolName: 'auto_commit', toolCallId: 'auto', result: commitResult };
    }
    
    yield { type: 'done', usage: this.accumulatedUsage };
  }
  
  abort() { this.aborted = true; }
  
  private async resolveCredential(requestCredentialId?: string) {
    // D2: resolution order
    const credentialId = requestCredentialId 
      ?? this.config.credentialId   // from InvectConfig.chatConfig
      ?? this.findFirstAICredential();  // legacy fallback
    
    return this.invect.getCredentialsService().getDecryptedWithRefresh(credentialId);
  }
  
  private getAdapter(credential: DecryptedCredential) {
    // Determine provider from credential type and instantiate adapter
    // Reuses existing AnthropicAdapter / OpenAIAdapter
  }
}
```

### `FlowDraft` — In-Memory Mutation Accumulator

```typescript
// pkg/core/src/services/chat/chat-draft.ts

export class FlowDraft {
  private nodes: FlowNodeDefinitions[];
  private edges: FlowEdge[];
  private baseVersionId: string;
  isDirty = false;

  constructor(
    private invect: Invect,
    private flowId: string,
    version: { id: string; nodes: FlowNodeDefinitions[]; edges: FlowEdge[] },
  ) {
    this.baseVersionId = version.id;
    this.nodes = structuredClone(version.nodes);
    this.edges = structuredClone(version.edges);
  }

  addNode(actionId: string, label: string, params?: Record<string, unknown>, connectAfter?: string): FlowNodeDefinitions {
    // Generate ID, referenceId from label
    // If connectAfter specified, compute position relative to that node + add edge
    // Otherwise compute position via simple offset from last node
    // Push to this.nodes, set isDirty = true
    // Return the new node definition
  }

  removeNode(nodeId: string): void { /* filter nodes + edges, isDirty = true */ }
  connectNodes(sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string): FlowEdge { /* ... */ }
  updateNodeConfig(nodeId: string, params: Record<string, unknown>): void { /* merge params, isDirty = true */ }
  renameNode(nodeId: string, newLabel: string): void { /* update label + referenceId + downstream template refs */ }
  duplicateNode(nodeId: string): FlowNodeDefinitions { /* deep clone with _copy suffix */ }

  async commit(): Promise<ChatToolResult> {
    // D17: Optimistic locking
    const latest = await this.invect.getFlowVersion(this.flowId, 'latest');
    if (latest.id !== this.baseVersionId) {
      return this.mergeAndCommit(latest);
    }
    const version = await this.invect.createFlowVersion(this.flowId, {
      nodes: this.nodes,
      edges: this.edges,
    });
    this.isDirty = false;
    this.baseVersionId = version.id;
    return { success: true, data: { versionId: version.id, nodeCount: this.nodes.length } };
  }

  getSummary(): { nodes: FlowNodeSummary[]; edges: FlowEdgeSummary[] } {
    // Compact representation for SSE draft_updated event
  }
}
```

### `ChatToolkit` — Tool Registry

```typescript
// pkg/core/src/services/chat/chat-toolkit.ts

export interface ChatTool {
  id: string;
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown, ctx: ChatToolContext) => Promise<ChatToolResult>;
}

export interface ChatToolContext {
  invect: Invect;
  identity: AuthIdentity | undefined;
  draft: FlowDraft | null;
  context: ChatContext;
}

export class ChatToolkit {
  private tools = new Map<string, ChatTool>();

  constructor(invect: Invect) {
    this.registerAll();
  }

  /** Convert to provider-agnostic tool defs for LLM calls */
  getToolDefinitions(): AgentToolDefinition[] {
    // Reuse existing AgentToolDefinition type — compatible with both adapters
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.parameters),
      category: 'utility' as const,
    }));
  }

  async executeTool(name: string, rawInput: unknown, ctx: ChatToolContext): Promise<ChatToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { success: false, error: `Unknown tool: ${name}` };

    const parsed = tool.parameters.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: `Invalid params: ${parsed.error.message}` };

    try {
      return await tool.execute(parsed.data, ctx);
    } catch (error: any) {
      return { success: false, error: error.message, errorType: error.constructor.name };
    }
  }

  private registerAll() {
    for (const tool of [
      ...flowTools, ...nodeTools, ...runTools, 
      ...actionTools, ...credentialTools, ...triggerTools, ...contextTools,
    ]) {
      this.tools.set(tool.id, tool);
    }
  }
}
```

### Chat Tool Definitions — Full Reference

#### Flow Tools

| Tool ID | Parameters | Description | Maps to |
|---------|-----------|-------------|---------|
| `list_flows` | `{ page?, limit?, search? }` | List flows with optional search | `invect.listFlows()` |
| `get_flow` | `{ flowId }` | Get flow details + latest version | `invect.getFlowById()` + `getFlowVersion()` |
| `create_flow` | `{ name, description? }` | Create a new empty flow | `invect.createFlow()` |
| `update_flow_definition` | `{ flowId, nodes, edges }` | Replace full definition (auto-layout, auto-commit) | `invect.createFlowVersion()` |
| `validate_flow` | `{ flowId }` | Validate definition for errors | `invect.validateFlow()` |

#### Node Tools (operate on in-memory draft — D4)

| Tool ID | Parameters | Description |
|---------|-----------|-------------|
| `add_node` | `{ actionId, label, params?, connectAfter? }` | Add node to draft, optionally connect after existing node |
| `remove_node` | `{ nodeId }` | Remove node and its edges from draft |
| `connect_nodes` | `{ sourceNodeId, targetNodeId, sourceHandle?, targetHandle? }` | Add edge to draft |
| `update_node_config` | `{ nodeId, params }` | Merge params into node's config in draft |
| `duplicate_node` | `{ nodeId }` | Clone node in draft with "_copy" suffix |
| `rename_node` | `{ nodeId, label }` | Change label (auto-updates referenceId + downstream templates) |
| `commit_changes` | — | Persist draft as new flow version |

#### Run & Test Tools

| Tool ID | Parameters | Description | Maps to |
|---------|-----------|-------------|---------|
| `run_flow` | `{ flowId, inputs? }` | Execute flow synchronously | `invect.startFlowRun()` |
| `run_node_test` | `{ nodeId, testInputs? }` | Test single node | `invect.testNode()` |
| `get_flow_run` | `{ flowRunId }` | Get run results | `invect.getFlowRun()` |
| `get_node_execution_results` | `{ flowRunId }` | Get all node executions for run | `invect.getNodeExecutionsForRun()` |
| `list_flow_runs` | `{ flowId, limit? }` | List recent runs | `invect.getFlowRunsForFlow()` |

#### Action Discovery Tools

| Tool ID | Parameters | Description | Maps to |
|---------|-----------|-------------|---------|
| `search_actions` | `{ query, category?, provider? }` | Fuzzy search available actions | `ActionRegistry` filtered |
| `get_action_details` | `{ actionId }` | Full action definition + param schema | `ActionRegistry.get()` |
| `list_providers` | — | List all providers | `invect.getProviders()` |
| `get_provider_actions` | `{ providerId }` | Actions for a provider | `invect.getActionsForProvider()` |

#### Credential Tools (read-only + UI triggers — D18)

| Tool ID | Parameters | Description | Maps to |
|---------|-----------|-------------|---------|
| `list_credentials` | `{ provider? }` | List credentials (config omitted) | `invect.listCredentials()` |
| `test_credential` | `{ credentialId }` | Test credential validity | `invect.testCredential()` |
| `suggest_credential_setup` | `{ provider, reason? }` | Emit `ui_action` to open credential modal | Frontend handles |
| `list_oauth2_providers` | — | List OAuth2 providers | `invect.getOAuth2Providers()` |
| `get_expiring_credentials` | `{ days? }` | Find expiring credentials | `invect.getExpiringCredentials()` |

#### Trigger & Webhook Tools

| Tool ID | Parameters | Description | Maps to |
|---------|-----------|-------------|---------|
| `list_triggers` | `{ flowId }` | List triggers for flow | `invect.listTriggers()` |
| `create_webhook_trigger` | `{ flowId, path?, method? }` | Create webhook trigger | `invect.createTrigger()` |
| `get_webhook_info` | `{ triggerId }` | Get webhook URL/config | `invect.getWebhookInfo()` |
| `create_cron_trigger` | `{ flowId, cronExpression, timezone? }` | Create cron trigger | `invect.createTrigger()` |
| `delete_trigger` | `{ triggerId }` | Delete trigger | `invect.deleteTrigger()` |

#### Context Tools

| Tool ID | Parameters | Description |
|---------|-----------|-------------|
| `get_current_flow_context` | `{ nodeId? }` | Get flow definition (optionally filtered to one node's subgraph) |
| `get_available_models` | `{ credentialId? }` | List AI models for a credential |

### Integration with `Invect` Class

```typescript
// New methods on Invect class (pkg/core/src/invect-core.ts):

/** Create a chat stream — returns async generator of ChatStreamEvents */
async createChatStream(
  messages: ChatMessage[],
  context: ChatContext,
  identity?: AuthIdentity,
): Promise<AsyncGenerator<ChatStreamEvent>> {
  this.ensureInitialized();
  const session = new ChatStreamSession(this, identity, this.chatToolkit, this.resolvedChatConfig);
  return session.stream(messages, context);
}

/** Get the ChatToolkit for inspection/testing */
getChatToolkit(): ChatToolkit {
  return this.chatToolkit;
}
```

### New `InvectConfig` Fields

```typescript
// Added to InvectConfigSchema:
chatConfig: z.object({
  /** Credential ID for the chat model (from credentials table) */
  credentialId: z.string().optional(),
  /** Default model (e.g. "claude-3-5-haiku-20241022", "gpt-4o-mini") */
  defaultModel: z.string().optional(),
  /** Max tool-calling steps per message (default: 8) */
  maxSteps: z.number().min(1).max(20).default(8).optional(),
  /** Max message history to send to LLM (default: 20) */
  maxHistoryMessages: z.number().min(1).max(100).default(20).optional(),
  /** Whether chat is enabled (default: true if a credential is available) */
  enabled: z.boolean().optional(),
}).optional(),
```

### No New Dependencies in `pkg/core`

| Need | Existing dep | How it's used for chat |
|------|-------------|----------------------|
| LLM streaming (Anthropic) | `@anthropic-ai/sdk` | `client.messages.create({ stream: true })` — already implemented |
| LLM streaming (OpenAI) | `openai` | `client.chat.completions.create({ stream: true })` — add streaming mode |
| Tool param validation | `zod` | Zod schemas on each tool |
| JSON Schema conversion | Existing `zodToJsonSchema` util | Convert Zod → JSON Schema for LLM tool definitions |
| Credential resolution | `CredentialsService` | `getDecryptedWithRefresh()` |
| Auto-layout | Simple position offset computation | For `FlowDraft.addNode()` positioning |

---

## Express Package Changes (`pkg/express`)

### New Endpoint

```
POST /chat
```

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "Add a Gmail node that lists messages" }
  ],
  "flowId": "flow_abc123",
  "credentialId": "cred_xyz",
  "selectedNodeId": "node_1",
  "viewMode": "edit"
}
```

Note: No `flowDefinition` in the body — backend loads it from database (D8).

Response: `text/event-stream` (SSE):

```typescript
// In invect-router.ts
router.post('/chat', async (req, res) => {
  const { messages, flowId, credentialId, selectedNodeId, viewMode } = req.body;
  const identity = req.invectIdentity;

  const context: ChatContext = { flowId, selectedNodeId, viewMode, credentialId };
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const stream = await core.createChatStream(messages, context, identity);
    
    for await (const event of stream) {
      if (req.destroyed) { stream.return(); break; }
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message: error.message, recoverable: false })}\n\n`);
  }

  res.end();
});
```

### NestJS / Next.js Adapters

Same pattern — consume `AsyncGenerator<ChatStreamEvent>` and serialise to SSE:

- **NestJS**: Manual `res.write()` in controller, or `@Sse()` decorator
- **Next.js**: `ReadableStream` from the async generator in an API route

---

## Frontend Package Changes (`pkg/frontend`)

### Dependencies

Start with **zero new package dependencies**. The custom `useChatPanel` hook handles SSE consumption directly. AI Elements components are installed as **source files** (not a package).

If we find ourselves reimplementing too much state management, add `@ai-sdk/react` later.

### New Files

```
pkg/frontend/src/
├── components/
│   ├── ai-chat/
│   │   ├── ChatPanel.tsx              # Main slide-out panel container
│   │   ├── ChatPanelHeader.tsx        # Header: model selector, stop btn, close btn
│   │   ├── ChatThread.tsx             # Message thread using AI Elements
│   │   ├── ChatComposer.tsx           # Input area using AI Elements Composer
│   │   ├── ChatToolResultCard.tsx     # Inline cards for tool call results
│   │   ├── ChatSuggestions.tsx        # Contextual quick-action chips
│   │   ├── ChatDraftOverlay.tsx       # Canvas overlay for draft node previews
│   │   └── useChatPanel.ts           # Custom hook: SSE + message state + editor sync
│   ├── ai-elements/                   # AI Elements installed components (source)
│   │   ├── thread.tsx
│   │   ├── message.tsx
│   │   └── composer.tsx
```

### `useChatPanel` Hook

Custom hook managing SSE connection, message state, and editor synchronisation:

```typescript
export function useChatPanel() {
  const { flowId, selectedNodeId, viewMode } = useFlowEditorStore();
  const { apiClient } = useApiContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingTools, setPendingTools] = useState<PendingToolCall[]>([]);
  const [draftPreview, setDraftPreview] = useState<DraftSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { refetchFlowData } = useFlowData();

  const sendMessage = useCallback(async (content: string, credentialId?: string) => {
    const userMsg: ChatMessage = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    const res = await fetch(`${apiClient.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, userMsg],
        flowId, selectedNodeId, viewMode, credentialId,
      }),
      signal: abortRef.current.signal,
    });

    // Parse SSE events from ReadableStream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let assistantText = '';

    // ... parse SSE frames, dispatch by event.type:
    // text_delta      → assistantText += text, update last assistant message
    // tool_call_start → add to pendingTools
    // tool_call_result → resolve pending tool, append result card
    // draft_updated   → setDraftPreview(draft)
    // ui_action       → dispatch to uiStore (e.g. openModal)
    // done            → setIsStreaming(false), refetchFlowData(), setDraftPreview(null)

  }, [messages, flowId, selectedNodeId, viewMode]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setDraftPreview(null); // Discard uncommitted draft preview
  }, []);

  return { messages, sendMessage, stop, isStreaming, pendingTools, draftPreview };
}
```

### Chat Panel ↔ NodeConfigPanel Layout

```typescript
// FlowLayout uses react-resizable-panels (already a dep)
<PanelGroup direction="horizontal">
  <Panel defaultSize={15}><NodeSidebar /></Panel>
  <PanelResizeHandle />
  <Panel><ReactFlowCanvas /></Panel>
  {configPanelOpen && <>
    <PanelResizeHandle />
    <Panel defaultSize={25}><NodeConfigPanel /></Panel>
  </>}
  {chatPanelOpen && <>
    <PanelResizeHandle />
    <Panel defaultSize={30} minSize={20}><ChatPanel /></Panel>
  </>}
</PanelGroup>
```

### UI Store Additions

```typescript
interface UIState {
  // ... existing ...
  chatPanelOpen: boolean;
}

interface UIActions {
  // ... existing ...
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;
}
```

### Canvas Draft Preview

When `draft_updated` events arrive:
- **New nodes**: Dashed blue border, pulsing animation, "(draft)" in label
- **Removed nodes**: 30% opacity, strikethrough label
- **New edges**: Dashed blue lines
- **On commit**: Borders go solid, "(draft)" removed
- **On cancel**: Draft elements fade out

### Keyboard Shortcut

**⌘+L** (Mac) / **Ctrl+L** (Windows) — toggle chat panel. Registered at app level.

### Suggestion Chips

| Context | Suggestions |
|---------|------------|
| Empty flow | "Help me build a flow…", "What integrations are available?", "Show example flows" |
| Existing flow (edit) | "Explain this flow", "Add error handling", "Test this flow", "Suggest improvements" |
| Runs view | "Why did this run fail?", "Show output of [node]", "Re-run with different inputs" |

### Tool Result Cards

| Tool | Card |
|------|------|
| `add_node` | "✅ Added *Gmail: List Messages*" + "Select" button |
| `remove_node` | "🗑️ Removed *Old Node*" |
| `run_flow` | Status badge + duration + collapsible output preview |
| `search_actions` | Grid of action cards with "Add to flow" buttons |
| `suggest_credential_setup` | "🔑 Opening credential setup…" |
| `create_webhook_trigger` | Webhook URL + copy button |
| `commit_changes` | "💾 Saved version *v12*" |

---

## System Prompt Design

```markdown
# Identity
You are the Invect assistant, an AI helper embedded in the Invect workflow editor.
You help users build, edit, test, and debug automation flows.

# Capabilities
- Create flows, add/remove/connect/configure nodes
- Search integrations (actions) across providers like Gmail, Slack, GitHub, etc.
- Configure node parameters including Nunjucks templates for dynamic data
- Run flows, test individual nodes, inspect execution results
- Guide credential and OAuth2 setup (via secure UI, never in chat)
- Set up webhook and cron triggers

# Guidelines

## Flow Building Strategy
- For new flows or major restructuring: use update_flow_definition (single bulk operation)
- For small edits to existing flows: use granular tools (add_node, update_node_config, etc.)
- Node labels should be descriptive: "Fetch User Emails" not "Gmail 1"
- Reference IDs auto-generate as snake_case from labels — don't reference them directly
- Use Nunjucks: {{ upstream_ref.property }} for dynamic data between nodes
- Use the connectAfter parameter on add_node to automatically wire nodes together
- After making changes, offer to test

## Credential Safety
- NEVER ask users to paste API keys or secrets in chat
- Use suggest_credential_setup to open the secure credential UI
- Check list_credentials before suggesting a new credential

## Response Style
- Concise and action-oriented
- Briefly explain what you changed and why
- If ambiguous, ask one clarifying question
- Show Nunjucks template examples when explaining data flow

# Current Context
[DYNAMIC — see D8 tiered injection]

# Available Providers
[DYNAMIC — one-line summary, ~100 tokens. See D9]
```

---

## Implementation Phases

### Phase 1: Foundation — End-to-End Streaming

**Goal**: User opens chat, sends a message, sees a streamed response. Context-aware but no tools yet.

1. **Core**: `ChatStreamService`, `ChatStreamSession` (no tools), `system-prompt.ts`, add streaming to `OpenAIAdapter`, add `chatConfig` to config schema, add `createChatStream()` to `Invect`, wire in `service-factory.ts`
2. **Express**: `POST /chat` with SSE response
3. **Frontend**: Install AI Elements source, create `ChatPanel`/`ChatThread`/`ChatComposer`/`useChatPanel`, add toggle to `FlowHeader` (⌘+L), add `chatPanelOpen` to `uiStore`, update `FlowLayout`

### Phase 2: Flow Building Tools

**Goal**: Assistant creates, modifies, validates flows.

1. **Core**: `FlowDraft`, `ChatToolkit`, flow tools, node tools, `commit_changes`, `get_current_flow_context`
2. **Frontend**: `ChatToolResultCard`, canvas draft preview, `draft_updated` → overlay, `done` → refetch

### Phase 3: Action Discovery & Credentials

**Goal**: Assistant finds actions and guides credential setup.

1. **Core**: `search_actions`, `get_action_details`, `list_providers`, `list_credentials`, `test_credential`, `suggest_credential_setup`, `list_oauth2_providers`
2. **Frontend**: Action cards with "Add to flow", `ui_action` → open modal, credential status cards

### Phase 4: Execution & Testing

**Goal**: Assistant runs flows and helps debug.

1. **Core**: `run_flow`, `run_node_test`, `get_flow_run`, `get_node_execution_results`, `list_flow_runs`
2. **Frontend**: Run result cards, node execution traces

### Phase 5: Triggers & Webhooks

**Goal**: Assistant configures triggers.

1. **Core**: `list_triggers`, `create_webhook_trigger`, `get_webhook_info`, `create_cron_trigger`, `delete_trigger`
2. **Frontend**: Webhook URL cards, cron previews

### Phase 6: Polish

1. **Chat history persistence** — `chat_sessions` table (all three schemas)
2. **Model selection UI** — Dropdown in chat header listing AI credentials
3. **Undo integration** — `commit_changes` creates undo checkpoint
4. **Multi-flow context** — "Compare Flow A with Flow B"
5. **Prompt templates** — "Build an email automation", "Create a Slack bot"
6. **Token budget** — Show usage, warn at ~80%

---

## Database Schema Changes

### Chat History Table (Phase 6)

```typescript
// Add to schema-sqlite.ts, schema-postgres.ts, schema-mysql.ts
export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').references(() => flows.id, { onDelete: 'cascade' }),
  title: text('title'),
  messages: text('messages'),  // JSON array of ChatMessage[]
  metadata: text('metadata'),  // JSON: { model, credentialId, tokenUsage }
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

No schema changes for Phases 1–5. Chat credential is an existing credential record.

---

## Security

1. **Auth**: Same middleware as all routes. Identity passed through to every tool. RBAC enforced at `Invect` method level (D19).
2. **No credential creation in chat**: Only read-only credential tools + `suggest_credential_setup` UI action (D18).
3. **Rate limiting**: Stricter limits on `/chat` (e.g., 20 msg/min) since each message may trigger multiple LLM calls.
4. **Model credential**: Resolved via `getDecryptedWithRefresh()` — same encryption, auto-refresh, audit trail (D2).
5. **Zod validation**: Every tool param validated before execution (D15).
6. **Abort safety**: Cancelled streams discard uncommitted drafts (D16).
7. **No secrets in prompts**: System prompt contains flow structure (labels, types) but never credential values or sensitive outputs (D8).

---

## Testing Strategy

| Layer | Approach |
|-------|----------|
| **Chat tools** | Unit tests — mock `Invect`, call each tool's `execute()`, assert method calls + return shapes |
| **ChatStreamSession** | Integration test — mock adapter to return canned responses (text + tool_use), assert event stream |
| **FlowDraft** | Unit tests — apply mutations, assert node/edge state, test optimistic lock conflict + merge |
| **System prompt** | Snapshot tests — given `ChatContext`, assert prompt sections and size tier |
| **SSE endpoint** | Integration test — POST `/chat`, consume SSE, assert events arrive correctly |
| **Frontend** | Component tests — render `ChatPanel` with mocked hook, verify messages, tool cards, draft preview |
| **E2E** | Playwright — open editor, ⌘+L, send message, verify stream + canvas update |
