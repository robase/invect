# Provider-Actions Architecture for Node/Tool Definitions

## Executive Summary

This document proposes a new architecture for organizing nodes and tools around **Providers** and **Actions**. Instead of a single "Gmail" node, users would add action-specific nodes like "Send Email" or "List Messages" with Gmail as the underlying **provider**.

### Key Design Principles

1. **Nodes and Tools are the same thing** - A single `execute()` function handles both node execution (in flows) and tool execution (by AI agents). The only difference is how they're configured and invoked.

2. **Single-file action definitions** - Third-party developers can add a new action by creating a single file with all definition + execution logic.

3. **Shared execution context** - Whether invoked as a node or tool, the same `execute()` function runs with the same context interface.

---

## Current Architecture Problems

### Duplication Between Nodes and Tools

Currently, `GmailNodeExecutor` implements both `BaseNodeExecutor` and `AgentToolCapable`:

```typescript
class GmailNodeExecutor 
  extends BaseNodeExecutor<GraphNodeType.GMAIL>
  implements AgentToolCapable 
{
  // Node definition
  getDefinition(): NodeDefinition { ... }
  
  // Node execution
  async execute(inputs, node, context): Promise<NodeExecutionResult> { ... }
  
  // Tool definition (duplicates node definition info)
  getAgentToolDefinition(): AgentToolDefinition { ... }
  
  // Tool execution (duplicates node execution logic)  
  async executeAsTool(input, context): Promise<AgentToolResult> { ... }
  
  // Shared logic extracted to avoid duplication
  private async executeGmailList(options): Promise<AgentToolResult> { ... }
}
```

This pattern requires:
- Maintaining two definition methods (`getDefinition` + `getAgentToolDefinition`)
- Two execution entry points that delegate to shared logic
- Manual sync between node params and tool input schema

### Scaling Problem

Each new Gmail action (send, delete, get, etc.) would require:
1. A new `GraphNodeType` enum value, OR
2. Complex branching logic in one executor, OR  
3. Separate executor classes per action

### GraphNodeType Enum Limitation

The current `GraphNodeType` enum requires manual updates for every new node:

```typescript
// Current: Must add entry for EVERY node type
enum GraphNodeType {
  TEMPLATE_STRING = "TEMPLATE_STRING",
  MODEL = "MODEL",
  GMAIL = "GMAIL",
  // ... would need 100s more entries
}
```

This doesn't scale when we need hundreds of integration nodes.

---

## Proposed Architecture

### Core Insight: Actions ARE Nodes ARE Tools

An **Action** is the fundamental unit. It can be:
- Rendered as a **Node** in the flow editor
- Exposed as a **Tool** for AI agents
- Both simultaneously

The only differences are:

| Aspect | As Node | As Tool |
|--------|---------|---------|
| Credential | Configured in node params | Configured on tool instance (static) |
| Parameters | Set by user in UI / Nunjucks templates | Some static, some AI-provided at runtime |
| Invocation | Flow orchestrator calls `execute()` | Agent executor calls `execute()` |
| Output | Goes to downstream nodes | Returned to AI for reasoning |

### Dynamic Node Types (No More GraphNodeType Enum)

Node types are now **string-based action IDs** instead of enum values:

```typescript
// OLD: Fixed enum (doesn't scale)
node.type = GraphNodeType.GMAIL;  // Limited to enum values

// NEW: Dynamic string (scales infinitely)
node.type = "gmail.list_messages";  // Any registered action ID
node.type = "slack.send_message";
node.type = "github.create_issue";
```

The action ID format is `provider.action_name` (e.g., `gmail.send_message`, `http.request`).

---

## The `defineAction()` Pattern

**One file = One action.** Everything needed to define an action lives in a single file:

```typescript
// pkg/core/src/actions/gmail/list-messages.ts

import { defineAction } from "../define-action";
import { z } from "zod/v4";

export default defineAction({
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  id: "gmail.list_messages",
  name: "List Emails",
  description: "Search and list emails from Gmail inbox",
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER (for grouping in UI)
  // ═══════════════════════════════════════════════════════════════════════════
  provider: {
    id: "gmail",
    name: "Gmail", 
    icon: "Mail",
    category: "email",
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CREDENTIAL REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  credential: {
    required: true,
    type: "oauth2",
    oauth2Provider: "google_gmail",
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PARAMETERS
  // - schema: Zod validation (used for both node and tool)
  // - fields: UI configuration for node config panel
  // ═══════════════════════════════════════════════════════════════════════════
  params: {
    schema: z.object({
      maxResults: z.number().int().min(1).max(100).default(10),
      query: z.string().optional().default(""),
      labelIds: z.array(z.string()).optional().default([]),
      includeSpamTrash: z.boolean().optional().default(false),
    }),
    
    fields: [
      {
        name: "maxResults",
        label: "Max Results", 
        type: "number",
        description: "Maximum emails to return (1-100)",
      },
      {
        name: "query",
        label: "Search Query",
        type: "text", 
        placeholder: "is:unread from:someone@example.com",
        description: "Gmail search syntax",
        aiProvided: true,  // AI provides this at runtime for tools
      },
      {
        name: "labelIds",
        label: "Label Filter",
        type: "json",
        defaultValue: [],
        extended: true,
      },
      {
        name: "includeSpamTrash", 
        label: "Include Spam/Trash",
        type: "boolean",
        extended: true,
      },
    ],
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION - Same function for node AND tool
  // ═══════════════════════════════════════════════════════════════════════════
  async execute(params, context) {
    const { maxResults, query, labelIds, includeSpamTrash } = params;
    const { credential, logger } = context;
    
    const accessToken = credential?.config.accessToken as string;
    if (!accessToken) {
      return { success: false, error: "No valid access token" };
    }
    
    // Build Gmail API URL
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(maxResults));
    if (query) url.searchParams.set("q", query);
    labelIds?.forEach(id => url.searchParams.append("labelIds", id));
    if (includeSpamTrash) url.searchParams.set("includeSpamTrash", "true");
    
    logger.debug("Fetching Gmail messages", { maxResults, query });
    
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Gmail API error: ${response.status} - ${error}` };
    }
    
    const data = await response.json();
    
    // Fetch message details
    const messages = await Promise.all(
      (data.messages || []).map(async (msg: { id: string }) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return detailRes.ok ? detailRes.json() : null;
      })
    );
    
    return {
      success: true,
      output: {
        messages: messages.filter(Boolean).map(parseGmailMessage),
        totalEstimate: data.resultSizeEstimate || 0,
        hasMore: !!data.nextPageToken,
      },
      metadata: { messageCount: messages.filter(Boolean).length },
    };
  },
});

// Helper (can be in same file or shared)
function parseGmailMessage(msg: any) {
  const getHeader = (name: string) => 
    msg.payload?.headers?.find((h: any) => 
      h.name.toLowerCase() === name.toLowerCase()
    )?.value;
  
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    snippet: msg.snippet,
    labels: msg.labelIds,
    isUnread: msg.labelIds?.includes("UNREAD"),
  };
}
```

---

## Type Definitions

```typescript
// pkg/core/src/actions/types.ts

import { z } from "zod/v4";
import type { Logger } from "../types/schemas";

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export type ProviderCategory = 
  | "email"        // Gmail, Outlook
  | "messaging"    // Slack, Discord
  | "storage"      // Google Drive, S3
  | "database"     // PostgreSQL, MySQL
  | "development"  // GitHub, Jira
  | "ai"           // OpenAI, Anthropic
  | "http"         // Generic HTTP
  | "utility"      // JQ, Math
  | "custom";

export interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  category: ProviderCategory;
  description?: string;
  docsUrl?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL
// ═══════════════════════════════════════════════════════════════════════════

export interface CredentialRequirement {
  required: boolean;
  type?: "oauth2" | "api_key" | "basic_auth" | "database";
  oauth2Provider?: string;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARAMETERS
// ═══════════════════════════════════════════════════════════════════════════

export interface ParamField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "json" | "code";
  description?: string;
  placeholder?: string;
  defaultValue?: unknown;
  required?: boolean;
  options?: { label: string; value: string | number }[];
  extended?: boolean;      // Show in "More Options" section
  aiProvided?: boolean;    // For tools: AI provides this at runtime
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT (shared between node and tool)
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionExecutionContext {
  logger: Logger;
  
  /** Decrypted credential (if action requires one) */
  credential: {
    id: string;
    authType: string;
    config: Record<string, unknown>;
  } | null;
  
  /** Incoming data from upstream nodes (for Nunjucks templates) */
  incomingData?: Record<string, unknown>;
  
  /** Flow context (only present when executed as node) */
  flowContext?: {
    flowId: string;
    flowRunId: string;
    nodeId: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionDefinition<TParams = unknown> {
  /** 
   * Unique action ID: "provider.action_name" 
   * This becomes the node type when used in flows.
   * Examples: "gmail.send_message", "slack.post_message", "core.model"
   */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Description (shown to users and AI agents) */
  description: string;
  
  /** Provider grouping */
  provider: ProviderDef;
  
  /** Credential requirements */
  credential?: CredentialRequirement;
  
  /** Parameter definition */
  params: {
    schema: z.ZodType<TParams>;
    fields: ParamField[];
  };
  
  /** Tags for filtering */
  tags?: string[];
  
  /** Sub-category within provider */
  actionCategory?: "read" | "write" | "delete" | "manage";
  
  /** The execute function - same for node and tool */
  execute: (params: TParams, context: ActionExecutionContext) => Promise<ActionResult>;
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE TYPE (dynamic string, replaces GraphNodeType enum)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Node type is now a string - the action ID.
 * Format: "provider.action_name"
 * Examples: "gmail.send_message", "core.model", "http.request"
 */
export type NodeType = string;

/**
 * Core built-in node types (for type hints, not enforcement)
 */
export const CORE_NODE_TYPES = {
  TEMPLATE_STRING: "core.template_string",
  MODEL: "core.model", 
  SQL_QUERY: "core.sql_query",
  IF_ELSE: "core.if_else",
  INPUT: "core.input",
  OUTPUT: "core.output",
  JQ: "core.jq",
  HTTP_REQUEST: "core.http_request",
  AGENT: "core.agent",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// DEFINE ACTION HELPER
// ═══════════════════════════════════════════════════════════════════════════

export function defineAction<TParams>(
  definition: ActionDefinition<TParams>
): ActionDefinition<TParams> {
  return definition;
}
```

---

## Action Registry

```typescript
// pkg/core/src/actions/action-registry.ts

import type { ActionDefinition, ProviderDef, ParamField } from "./types";
import type { Logger } from "../types/schemas";
import type { NodeDefinition, NodeParamField } from "../types/node-definition.types";
import type { AgentToolDefinition, AgentToolCategory } from "../types/agent-tool.types";

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();
  private providerActions = new Map<string, Set<string>>();
  private providers = new Map<string, ProviderDef>();
  
  constructor(private logger?: Logger) {}
  
  /** Register an action */
  register(action: ActionDefinition): void {
    if (this.actions.has(action.id)) {
      this.logger?.warn(`Action ${action.id} already registered, overwriting`);
    }
    
    this.actions.set(action.id, action);
    
    // Track provider
    const providerId = action.provider.id;
    if (!this.providers.has(providerId)) {
      this.providers.set(providerId, action.provider);
      this.providerActions.set(providerId, new Set());
    }
    this.providerActions.get(providerId)!.add(action.id);
    
    // this.logger?.debug(`Registered action: ${action.id}`);
  }
  
  /** Get action by ID */
  get(actionId: string): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }
  
  /** Get all actions */
  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }
  
  /** Get all providers */
  getProviders(): ProviderDef[] {
    return Array.from(this.providers.values());
  }
  
  /** Get actions for a provider */
  getActionsForProvider(providerId: string): ActionDefinition[] {
    const actionIds = this.providerActions.get(providerId);
    if (!actionIds) return [];
    return Array.from(actionIds)
      .map(id => this.actions.get(id)!)
      .filter(Boolean);
  }
  
  /** Convert action → NodeDefinition (for existing node system) */
  toNodeDefinition(actionId: string): NodeDefinition | null {
    const action = this.get(actionId);
    if (!action) return null;
    
    const credentialField: NodeParamField | null = action.credential?.required 
      ? {
          name: "credentialId",
          label: `${action.provider.name} Credential`,
          type: "credential",
          required: true,
          credentialTypes: [action.credential.type || "oauth2"],
          oauth2Providers: action.credential.oauth2Provider 
            ? [action.credential.oauth2Provider] 
            : undefined,
        }
      : null;
    
    return {
      type: actionId,  // Dynamic string type - no enum needed
      label: action.name,
      description: action.description,
      category: "Integrations",
      icon: action.provider.icon,
      input: { id: "input", label: "Input", type: "object" },
      outputs: [{ id: "output", label: "Output", type: "object" }],
      paramFields: [
        ...(credentialField ? [credentialField] : []),
        ...action.params.fields.map(f => ({
          name: f.name,
          label: f.label,
          type: f.type as any,
          description: f.description,
          placeholder: f.placeholder,
          defaultValue: f.defaultValue,
          required: f.required,
          options: f.options,
          extended: f.extended,
        })),
      ],
      defaultParams: Object.fromEntries(
        action.params.fields
          .filter(f => f.defaultValue !== undefined)
          .map(f => [f.name, f.defaultValue])
      ),
    };
  }
  
  /** Convert action → AgentToolDefinition (for existing tool system) */
  toAgentToolDefinition(actionId: string): AgentToolDefinition | null {
    const action = this.get(actionId);
    if (!action) return null;
    
    // Only include fields that AI should provide at runtime
    const aiFields = action.params.fields.filter(f => f.aiProvided !== false);
    
    const categoryMap: Record<string, AgentToolCategory> = {
      email: "web",
      messaging: "web", 
      storage: "web",
      database: "data",
      development: "web",
      ai: "utility",
      http: "web",
      utility: "utility",
      custom: "custom",
    };
    
    return {
      id: action.id,
      name: action.name,
      description: action.description,
      category: categoryMap[action.provider.category] || "utility",
      tags: action.tags || [action.provider.id],
      enabledByDefault: false,
      inputSchema: this.buildJsonSchema(aiFields),
      nodeType: action.id,
    };
  }
  
  private buildJsonSchema(fields: ParamField[]): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    for (const field of fields) {
      const prop: Record<string, unknown> = { description: field.description };
      
      switch (field.type) {
        case "number":
          prop.type = "number";
          break;
        case "boolean":
          prop.type = "boolean";
          break;
        case "json":
          prop.type = "object";
          break;
        default:
          prop.type = "string";
      }
      
      properties[field.name] = prop;
      if (field.required) required.push(field.name);
    }
    
    return { type: "object", properties, required };
  }
}

// Global singleton
let globalActionRegistry: ActionRegistry | null = null;

export function getActionRegistry(): ActionRegistry {
  if (!globalActionRegistry) {
    globalActionRegistry = new ActionRegistry();
  }
  return globalActionRegistry;
}

export function initializeActionRegistry(logger?: Logger): ActionRegistry {
  globalActionRegistry = new ActionRegistry(logger);
  return globalActionRegistry;
}
```

---

## Universal Action Executor

Bridges actions with existing node/tool infrastructure:

```typescript
// pkg/core/src/actions/action-executor.ts

import { getActionRegistry } from "./action-registry";
import type { ActionExecutionContext, ActionResult } from "./types";
import type { NodeExecutionContext } from "../types-fresh";
import type { AgentToolExecutionContext, AgentToolResult } from "../types/agent-tool.types";
import { NodeExecutionStatus } from "../types/base";

/**
 * Executes actions as either nodes or tools.
 * The same execute() function is called either way.
 */
export class UniversalActionExecutor {
  constructor(private readonly actionId: string) {}
  
  /**
   * Execute as a flow node
   */
  async executeAsNode(
    nodeParams: Record<string, unknown>,
    context: NodeExecutionContext
  ): Promise<NodeExecutionResult> {
    const action = getActionRegistry().get(this.actionId);
    if (!action) {
      return this.nodeError(`Action not found: ${this.actionId}`);
    }
    
    // Separate credential from action params
    const { credentialId, ...actionParams } = nodeParams;
    
    // Validate params
    const parseResult = action.params.schema.safeParse(actionParams);
    if (!parseResult.success) {
      return this.nodeError(`Invalid parameters: ${parseResult.error.message}`);
    }
    
    // Get credential if required
    let credential = null;
    if (action.credential?.required && credentialId) {
      credential = await context.functions.getCredential?.(credentialId as string);
      if (!credential) {
        return this.nodeError(`Credential not found: ${credentialId}`);
      }
    }
    
    // Build execution context
    const execContext: ActionExecutionContext = {
      logger: context.logger,
      credential,
      incomingData: context.incomingData,
      flowContext: {
        flowId: context.flowId,
        flowRunId: context.flowRunId,
        nodeId: context.nodeId,
      },
    };
    
    // Execute the action
    const result = await action.execute(parseResult.data, execContext);
    
    if (!result.success) {
      return this.nodeError(result.error || "Action execution failed");
    }
    
    return {
      state: NodeExecutionStatus.SUCCESS,
      type: "output",
      output: {
        nodeType: this.actionId as any,
        data: {
          variables: {
            output: { value: result.output, type: "object" },
          },
          metadata: result.metadata,
        },
      },
    };
  }
  
  /**
   * Execute as an agent tool
   */
  async executeAsTool(
    aiInput: Record<string, unknown>,
    staticParams: Record<string, unknown>,
    context: AgentToolExecutionContext
  ): Promise<AgentToolResult> {
    const action = getActionRegistry().get(this.actionId);
    if (!action) {
      return { success: false, error: `Action not found: ${this.actionId}` };
    }
    
    // Merge: static params (from tool config) + AI input (runtime)
    const mergedParams = { ...staticParams, ...aiInput };
    
    // Validate
    const parseResult = action.params.schema.safeParse(mergedParams);
    if (!parseResult.success) {
      return { success: false, error: `Invalid parameters: ${parseResult.error.message}` };
    }
    
    // Get credential from static params
    let credential = null;
    const credentialId = staticParams.credentialId as string;
    if (action.credential?.required && credentialId) {
      credential = await context.nodeContext?.functions?.getCredential?.(credentialId);
      if (!credential) {
        return { success: false, error: `Credential not found: ${credentialId}` };
      }
    }
    
    // Build context
    const execContext: ActionExecutionContext = {
      logger: context.logger,
      credential,
    };
    
    // Execute - SAME function as node execution
    return action.execute(parseResult.data, execContext);
  }
  
  private nodeError(message: string) {
    return {
      state: NodeExecutionStatus.FAILED,
      type: "output" as const,
      errors: [message],
    };
  }
}
```

---

## More Action Examples

### Gmail: Send Email

```typescript
// pkg/core/src/actions/gmail/send-message.ts

import { defineAction } from "../define-action";
import { z } from "zod/v4";

export default defineAction({
  id: "gmail.send_message",
  name: "Send Email",
  description: "Send an email via Gmail",
  
  provider: {
    id: "gmail",
    name: "Gmail",
    icon: "Mail",
    category: "email",
  },
  
  credential: {
    required: true,
    type: "oauth2",
    oauth2Provider: "google_gmail",
  },
  
  actionCategory: "write",
  
  params: {
    schema: z.object({
      to: z.string().min(1, "Recipient is required"),
      subject: z.string().optional().default(""),
      body: z.string().optional().default(""),
      cc: z.string().optional(),
      bcc: z.string().optional(),
    }),
    
    fields: [
      { name: "to", label: "To", type: "text", required: true, aiProvided: true },
      { name: "subject", label: "Subject", type: "text", aiProvided: true },
      { name: "body", label: "Body", type: "textarea", aiProvided: true },
      { name: "cc", label: "CC", type: "text", extended: true },
      { name: "bcc", label: "BCC", type: "text", extended: true },
    ],
  },
  
  async execute(params, context) {
    const { to, subject, body, cc, bcc } = params;
    const accessToken = context.credential?.config.accessToken as string;
    
    if (!accessToken) {
      return { success: false, error: "No valid access token" };
    }
    
    // Build MIME message
    const raw = createMimeMessage(to, subject, body, cc, bcc);
    
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to send: ${error}` };
    }
    
    const data = await response.json();
    return {
      success: true,
      output: { messageId: data.id, threadId: data.threadId },
    };
  },
});

function createMimeMessage(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
  let message = `To: ${to}\r\n`;
  if (cc) message += `Cc: ${cc}\r\n`;
  if (bcc) message += `Bcc: ${bcc}\r\n`;
  message += `Subject: ${subject}\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
  message += body;
  return Buffer.from(message).toString("base64url");
}
```

### Slack: Send Message

```typescript
// pkg/core/src/actions/slack/send-message.ts

import { defineAction } from "../define-action";
import { z } from "zod/v4";

export default defineAction({
  id: "slack.send_message",
  name: "Send Slack Message",
  description: "Send a message to a Slack channel or user",
  
  provider: {
    id: "slack",
    name: "Slack",
    icon: "MessageSquare",
    category: "messaging",
  },
  
  credential: {
    required: true,
    type: "oauth2",
    oauth2Provider: "slack",
  },
  
  actionCategory: "write",
  
  params: {
    schema: z.object({
      channel: z.string().min(1, "Channel is required"),
      text: z.string().min(1, "Message text is required"),
      thread_ts: z.string().optional(),
    }),
    
    fields: [
      { 
        name: "channel", 
        label: "Channel", 
        type: "text", 
        placeholder: "#general or @username",
        aiProvided: true,
      },
      { 
        name: "text", 
        label: "Message", 
        type: "textarea",
        aiProvided: true,
      },
      { 
        name: "thread_ts", 
        label: "Thread ID", 
        type: "text",
        description: "Reply in thread (optional)",
        extended: true,
      },
    ],
  },
  
  async execute(params, context) {
    const { channel, text, thread_ts } = params;
    const accessToken = context.credential?.config.accessToken as string;
    
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text, thread_ts }),
    });
    
    const data = await response.json();
    
    if (!data.ok) {
      return { success: false, error: `Slack error: ${data.error}` };
    }
    
    return {
      success: true,
      output: { 
        ts: data.ts, 
        channel: data.channel,
        message: data.message,
      },
    };
  },
});
```

---

## Auto-Registration Pattern

Actions self-register when imported:

```typescript
// pkg/core/src/actions/gmail/index.ts

import { getActionRegistry } from "../action-registry";

// Import all Gmail actions
import listMessages from "./list-messages";
import sendMessage from "./send-message";
import getMessage from "./get-message";
import createDraft from "./create-draft";
import deleteDraft from "./delete-draft";
// ... etc

const gmailActions = [
  listMessages,
  sendMessage,
  getMessage,
  createDraft,
  deleteDraft,
];

// Register all on import
export function registerGmailActions() {
  const registry = getActionRegistry();
  gmailActions.forEach(action => registry.register(action));
}

// Auto-register
registerGmailActions();
```

```typescript
// pkg/core/src/actions/index.ts

// Import to trigger registration
import "./gmail";
import "./slack";
import "./github";
// etc.

export * from "./types";
export * from "./action-registry";
export * from "./action-executor";
```

---

## Complete Gmail Actions Reference

Based on Flowise implementation:

### Draft Actions
| Action ID | Name | Category |
|-----------|------|----------|
| `gmail.list_drafts` | List Drafts | read |
| `gmail.create_draft` | Create Draft | write |
| `gmail.get_draft` | Get Draft | read |
| `gmail.update_draft` | Update Draft | write |
| `gmail.send_draft` | Send Draft | write |
| `gmail.delete_draft` | Delete Draft | delete |

### Message Actions
| Action ID | Name | Category |
|-----------|------|----------|
| `gmail.list_messages` | List Emails | read |
| `gmail.get_message` | Get Email | read |
| `gmail.send_message` | Send Email | write |
| `gmail.modify_message` | Modify Labels | manage |
| `gmail.trash_message` | Trash Email | delete |
| `gmail.untrash_message` | Restore Email | manage |
| `gmail.delete_message` | Delete Email | delete |

### Label Actions
| Action ID | Name | Category |
|-----------|------|----------|
| `gmail.list_labels` | List Labels | read |
| `gmail.get_label` | Get Label | read |
| `gmail.create_label` | Create Label | write |
| `gmail.update_label` | Update Label | write |
| `gmail.delete_label` | Delete Label | delete |

### Thread Actions
| Action ID | Name | Category |
|-----------|------|----------|
| `gmail.list_threads` | List Threads | read |
| `gmail.get_thread` | Get Thread | read |
| `gmail.modify_thread` | Modify Thread | manage |
| `gmail.trash_thread` | Trash Thread | delete |
| `gmail.untrash_thread` | Restore Thread | manage |
| `gmail.delete_thread` | Delete Thread | delete |

---

## File Structure

> **Updated:** Reflects the actual implemented structure as of Phase 2 completion.

```
pkg/core/src/
├── actions/
│   ├── index.ts                 # Barrel export + registerBuiltinActions() + allBuiltinActions
│   ├── types.ts                 # ActionDefinition, ProviderDef, ActionExecutionContext, etc.
│   ├── define-action.ts         # defineAction<TParams>() identity helper
│   ├── action-registry.ts       # ActionRegistry class + global singleton
│   ├── action-executor.ts       # executeActionAsNode(), executeActionAsTool(), createToolExecutorForAction()
│   ├── providers.ts             # Shared ProviderDef constants (CORE, HTTP, GMAIL)
│   │
│   ├── core/                    # ✅ Core flow-control actions (7 actions)
│   │   ├── index.ts             # Barrel + coreActions array
│   │   ├── jq.ts                # core.jq
│   │   ├── template-string.ts   # core.template_string
│   │   ├── input.ts             # core.input
│   │   ├── output.ts            # core.output
│   │   ├── if-else.ts           # core.if_else
│   │   ├── sql-query.ts         # core.sql_query
│   │   └── model.ts             # core.model
│   │
│   ├── http/                    # ✅ HTTP provider (1 action)
│   │   ├── index.ts             # Barrel + httpActions array
│   │   └── request.ts           # http.request
│   │
│   ├── gmail/                   # ✅ Gmail provider (5 actions)
│   │   ├── index.ts             # Barrel + gmailActions array
│   │   ├── list-messages.ts     # gmail.list_messages
│   │   ├── send-message.ts      # gmail.send_message
│   │   ├── get-message.ts       # gmail.get_message
│   │   ├── create-draft.ts      # gmail.create_draft
│   │   └── modify-labels.ts     # gmail.modify_labels
│   │
│   ├── slack/                   # ✅ Slack provider (2 actions)
│   │   ├── index.ts             # Barrel + slackActions array
│   │   ├── send-message.ts      # slack.send_message
│   │   └── list-channels.ts     # slack.list_channels
│   │
│   ├── github/                  # ✅ GitHub provider (2 actions)
│   │   ├── index.ts             # Barrel + githubActions array
│   │   ├── create-issue.ts      # github.create_issue
│   │   └── list-repos.ts        # github.list_repos
│
├── nodes/                       # Legacy executors (still active, coexist with actions)
│   ├── executor-registry.ts
│   ├── base-node.ts
│   ├── model-executor.ts
│   ├── agent-executor.ts
│   ├── jq-executor.ts
│   ├── ... (all legacy executors still present)
```

---

## Benefits

1. **No duplication** - Single `execute()` function for both node and tool
2. **Easy 3rd-party development** - One file = one complete action
3. **Type-safe** - Zod schema validates params for both use cases
4. **Self-documenting** - All metadata in one place
5. **Flexible** - Same action can be used as node, tool, or both
6. **Scalable** - Add new providers/actions without touching core code
7. **No enum maintenance** - Dynamic string-based node types scale to hundreds of integrations

---

## Removing GraphNodeType Enum

### Current State (To Be Removed)

```typescript
// pkg/core/src/types/graph-node-types.ts - WILL BE DEPRECATED
export enum GraphNodeType {
  TEMPLATE_STRING = "TEMPLATE_STRING",
  MODEL = "MODEL",
  SQL_QUERY = "SQL_QUERY",
  IF_ELSE = "IF_ELSE",
  INPUT = "INPUT",
  OUTPUT = "OUTPUT",
  JQ = "JQ",
  HTTP_REQUEST = "HTTP_REQUEST",
  AGENT = "AGENT",
  GMAIL = "GMAIL",
}
```

### New Approach: String-Based Types

```typescript
// Node type is now just a string - the action ID
type NodeType = string;  // e.g., "gmail.list_messages", "slack.send_message"

// For core/built-in nodes, we keep a const object (not enum)
export const CORE_NODE_TYPES = {
  TEMPLATE_STRING: "core.template_string",
  MODEL: "core.model",
  SQL_QUERY: "core.sql_query",
  IF_ELSE: "core.if_else",
  INPUT: "core.input",
  OUTPUT: "core.output",
  JQ: "core.jq",
  HTTP_REQUEST: "core.http_request",
  AGENT: "core.agent",
} as const;

// Type helper for core nodes
type CoreNodeType = typeof CORE_NODE_TYPES[keyof typeof CORE_NODE_TYPES];
```

### Updated FlowNode Type

```typescript
// Before: node.type was GraphNodeType enum
interface FlowNode {
  id: string;
  type: GraphNodeType;  // Limited to enum values
  params: Record<string, unknown>;
  position: { x: number; y: number };
}

// After: node.type is any registered action ID
interface FlowNode {
  id: string;
  type: string;  // Any action ID: "gmail.send_message", "core.model", etc.
  params: Record<string, unknown>;
  position: { x: number; y: number };
}
```

### Executor Lookup Change

```typescript
// Before: Map<GraphNodeType, NodeExecutor>
const executors = new Map<GraphNodeType, NodeExecutor>();
executors.get(GraphNodeType.GMAIL);

// After: Map<string, ActionDefinition>
const actions = new Map<string, ActionDefinition>();
actions.get("gmail.list_messages");
actions.get("core.model");
```

### Database Schema Unchanged

The `type` column in flow nodes is already stored as `TEXT`/`VARCHAR`, so no migration needed:

```sql
-- Existing schema (already supports strings)
CREATE TABLE flow_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- Already a string, just stores different values
  params JSON,
  position_x REAL,
  position_y REAL
);
```

### Frontend Node Registry Change

```typescript
// Before: Static mapping from enum
const nodeComponents: Record<GraphNodeType, React.FC> = {
  [GraphNodeType.GMAIL]: GmailNode,
  [GraphNodeType.MODEL]: ModelNode,
};

// After: Dynamic lookup or generic component
function getNodeComponent(type: string): React.FC {
  // Core nodes have custom components
  if (type.startsWith("core.")) {
    return coreNodeComponents[type] || UniversalNode;
  }
  // All action-based nodes use UniversalNode (renders based on definition)
  return UniversalNode;
}
```

### Migration Strategy

1. **Keep existing core nodes working** - `TEMPLATE_STRING` becomes `core.template_string`
2. **Add compatibility layer** - Accept both old enum values and new action IDs during transition
3. **New integrations use action IDs** - `gmail.send_message`, `slack.post_message`, etc.
4. **Gradual migration** - Existing flows continue to work, new flows use action IDs

```typescript
// Compatibility helper during migration
function normalizeNodeType(type: string): string {
  // Map old enum values to new action IDs
  const legacyMap: Record<string, string> = {
    "GMAIL": "gmail.list_messages",  // Old single-action node
    "TEMPLATE_STRING": "core.template_string",
    "MODEL": "core.model",
    // ... etc
  };
  return legacyMap[type] || type;
}
```

---

## Refactoring Plan: Current Codebase → Clean Architecture

This section details how to refactor the existing codebase to align with the Provider-Actions architecture.

### Current State Analysis

**Problems with current structure:**

1. **`pkg/core/src/nodes/` is bloated** - Contains 13 executor files, each 200-600 lines
2. **Duplication in AgentToolCapable** - Each tool-capable node has ~100 lines of duplicate boilerplate
3. **Tight coupling to GraphNodeType enum** - Can't add nodes without modifying enum
4. **No clear separation** - Integration nodes (Gmail, HTTP) mixed with core flow nodes (Input, Output, If-Else)
5. **Service dependencies are complex** - Node executors reach into services inconsistently

### Target Architecture

```
pkg/core/src/
├── actions/                      # NEW: All action definitions
│   ├── index.ts                  # Registry + auto-registration
│   ├── types.ts                  # ActionDefinition, ProviderDef, etc.
│   ├── define-action.ts          # defineAction() helper
│   ├── action-registry.ts        # ActionRegistry class
│   ├── action-executor.ts        # UniversalActionExecutor
│   │
│   ├── core/                     # Core flow control actions
│   │   ├── index.ts
│   │   ├── template-string.ts
│   │   ├── model.ts
│   │   ├── if-else.ts
│   │   ├── input.ts
│   │   ├── output.ts
│   │   ├── jq.ts
│   │   ├── sql-query.ts
│   │   └── agent.ts
│   │
│   ├── http/                     # HTTP provider
│   │   ├── index.ts
│   │   └── request.ts
│   │
│   ├── gmail/                    # Gmail provider
│   │   ├── index.ts
│   │   ├── list-messages.ts
│   │   ├── send-message.ts
│   │   ├── get-message.ts
│   │   └── ...
│   │
│   └── slack/                    # Future: Slack provider
│       ├── index.ts
│       └── send-message.ts
│
├── nodes/                        # DEPRECATED → thin compatibility layer
│   └── legacy-executor-adapter.ts  # Maps old executor calls to actions
│
├── services/
│   ├── agent-tools/              # SIMPLIFIED
│   │   └── index.ts              # Just re-exports from action registry
│   └── ...
│
└── types/
    ├── graph-node-types.ts       # DEPRECATED → just type alias to string
    └── ...
```

### Refactoring Steps

#### Step 1: Create Action Infrastructure (New Files)

```typescript
// pkg/core/src/actions/types.ts
// (Already defined in this document)

// pkg/core/src/actions/define-action.ts  
export { defineAction } from "./types";

// pkg/core/src/actions/action-registry.ts
// (Already defined in this document)

// pkg/core/src/actions/action-executor.ts
// (Already defined in this document)
```

#### Step 2: Convert JQ Node (Simplest Example)

**Before:** `pkg/core/src/nodes/jq-executor.ts` (302 lines)
```typescript
export class JqNodeExecutor 
  extends BaseNodeExecutor<GraphNodeType.JQ, typeof jqNodeParamsSchema> 
  implements AgentToolCapable 
{
  // 50 lines: getDefinition()
  // 30 lines: getAgentToolDefinition() 
  // 40 lines: executeAsTool()
  // 80 lines: execute()
  // 100 lines: helpers
}
```

**After:** `pkg/core/src/actions/core/jq.ts` (80 lines)
```typescript
import { defineAction } from "../define-action";
import { z } from "zod/v4";
import jq from "node-jq";

export default defineAction({
  id: "core.jq",
  name: "JQ Query",
  description: "Transform and select data using JQ query language",
  
  provider: {
    id: "core",
    name: "Core",
    icon: "Code2",
    category: "utility",
  },
  
  params: {
    schema: z.object({
      query: z.string().min(1).default("."),
    }),
    fields: [
      { name: "query", label: "JQ Query", type: "code", aiProvided: true },
    ],
  },
  
  async execute(params, context) {
    const { query } = params;
    const data = context.incomingData;
    
    try {
      const result = await jq.run(query, data, { input: "json", output: "json" });
      return { success: true, output: result };
    } catch (error) {
      return { success: false, error: `JQ Error: ${error.message}` };
    }
  },
});
```

**Reduction: 302 lines → 80 lines (74% less code)**

#### Step 3: Convert HTTP Request Node

**Before:** `pkg/core/src/nodes/http-request.ts` (548 lines)

**After:** `pkg/core/src/actions/http/request.ts` (~150 lines)
```typescript
import { defineAction } from "../define-action";
import { z } from "zod/v4";

export default defineAction({
  id: "http.request",
  name: "HTTP Request",
  description: "Make HTTP requests to external APIs",
  
  provider: {
    id: "http",
    name: "HTTP",
    icon: "Globe",
    category: "http",
  },
  
  credential: {
    required: false,
    type: "api_key",
    description: "Optional Bearer/Basic auth credential",
  },
  
  params: {
    schema: z.object({
      url: z.string().url(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional().default({}),
      body: z.string().optional(),
      timeout: z.number().positive().default(30000),
    }),
    fields: [
      { name: "url", label: "URL", type: "text", required: true, aiProvided: true },
      { name: "method", label: "Method", type: "select", options: [...] },
      { name: "headers", label: "Headers", type: "json", extended: true },
      { name: "body", label: "Body", type: "textarea", aiProvided: true },
      { name: "timeout", label: "Timeout (ms)", type: "number", extended: true },
    ],
  },
  
  async execute(params, context) {
    const { url, method, headers, body, timeout } = params;
    const { credential } = context;
    
    // Build auth headers
    const authHeaders: Record<string, string> = {};
    if (credential) {
      const token = credential.config.apiKey || credential.config.accessToken;
      if (token) authHeaders.Authorization = `Bearer ${token}`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, ...authHeaders },
        body: method !== "GET" ? body : undefined,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      
      return {
        success: true,
        output: { data, status: response.status, ok: response.ok },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      return { success: false, error: error.message };
    }
  },
});
```

**Reduction: 548 lines → 150 lines (73% less code)**

#### Step 4: Convert Gmail Node → Multiple Actions

**Before:** `pkg/core/src/nodes/gmail-executor.ts` (597 lines, 1 action)

**After:** `pkg/core/src/actions/gmail/` (5 files, ~80 lines each)
- `list-messages.ts`
- `send-message.ts`
- `get-message.ts`
- `create-draft.ts`
- `modify-labels.ts`

**Result: 597 lines → 400 lines total, but now supports 5 actions instead of 1**

#### Step 5: Simplify Service Layer

**Remove:**
- `pkg/core/src/services/agent-tools/agent-tool-registry.ts` → Replace with `ActionRegistry.toAgentToolDefinition()`
- `pkg/core/src/services/agent-tools/builtin/` → Move to `actions/core/` or `actions/utility/`

**Simplify:**
```typescript
// pkg/core/src/services/agent-tools/index.ts
// Before: Complex registry with multiple registration paths
// After: Thin wrapper around ActionRegistry

import { getActionRegistry } from "../../actions";

export function getAgentTools(): AgentToolDefinition[] {
  return getActionRegistry()
    .getAll()
    .map(action => getActionRegistry().toAgentToolDefinition(action.id))
    .filter(Boolean);
}
```

#### Step 6: Update Node Executor Registry

```typescript
// pkg/core/src/nodes/executor-registry.ts
// Before: Map<GraphNodeType, NodeExecutor>
// After: Thin adapter that delegates to ActionRegistry

import { getActionRegistry, UniversalActionExecutor } from "../actions";

export class NodeExecutorRegistry {
  get(nodeType: string) {
    const action = getActionRegistry().get(nodeType);
    if (!action) return undefined;
    return new UniversalActionExecutor(nodeType);
  }
  
  getAll() {
    return getActionRegistry().getAll();
  }
  
  getAllDefinitions() {
    return getActionRegistry()
      .getAll()
      .map(a => getActionRegistry().toNodeDefinition(a.id));
  }
}
```

#### Step 7: Deprecate GraphNodeType Enum

```typescript
// pkg/core/src/types/graph-node-types.ts
// Before: Enum with fixed values
// After: String type with const helpers

/**
 * @deprecated Use action IDs directly (e.g., "gmail.send_message")
 */
export enum GraphNodeType {
  // Keep for backwards compatibility, map to action IDs
  TEMPLATE_STRING = "core.template_string",
  MODEL = "core.model",
  // ...
}

// New approach: just strings
export type NodeType = string;

// Helper for common core nodes
export const CORE_NODES = {
  TEMPLATE_STRING: "core.template_string",
  MODEL: "core.model",
  JQ: "core.jq",
  // ...
} as const;
```

### Summary of Changes

| Before | After | Impact |
|--------|-------|--------|
| 13 executor files, ~4000 lines | ~30 action files, ~2000 lines | 50% less code |
| `GraphNodeType` enum (manual updates) | String-based types (dynamic) | No core changes for new nodes |
| Separate Node + Tool registration | Single `ActionRegistry` | No duplication |
| `AgentToolCapable` interface | Built into `defineAction()` | No boilerplate |
| Mixed core + integration nodes | Clear separation by provider | Better organization |
| Complex `BaseNodeExecutor` class | Simple `defineAction()` function | Easier to extend |

### Files to Delete After Migration

```
pkg/core/src/nodes/
├── gmail-executor.ts      # → actions/gmail/*
├── http-request.ts        # → actions/http/request.ts
├── jq-executor.ts         # → actions/core/jq.ts
├── model-executor.ts      # → actions/core/model.ts
├── sql-query-executor.ts  # → actions/core/sql-query.ts
├── template-string-executor.ts # → actions/core/template-string.ts
├── if-else-executor.ts    # → actions/core/if-else.ts
├── input-executor.ts      # → actions/core/input.ts
├── output.ts              # → actions/core/output.ts
└── base-node.ts           # → actions/types.ts (simplified)

pkg/core/src/services/agent-tools/
├── agent-tool-registry.ts # → actions/action-registry.ts
└── builtin/               # → actions/utility/
```

---

## Migration Path & Status

### Phase 1: Infrastructure ✅ COMPLETE

Created the foundational files in `pkg/core/src/actions/`:

| File | Purpose | Status |
|------|---------|--------|
| `types.ts` | `ActionDefinition`, `ProviderDef`, `ActionExecutionContext`, `ActionResult`, `ActionCredential`, `ParamField`, etc. | ✅ Done |
| `define-action.ts` | `defineAction<TParams>()` identity helper with full type inference | ✅ Done |
| `action-registry.ts` | `ActionRegistry` class + global singleton helpers | ✅ Done |
| `action-executor.ts` | `executeActionAsNode()`, `executeActionAsTool()`, `createToolExecutorForAction()` bridges | ✅ Done |
| `providers.ts` | Shared provider constants (`CORE_PROVIDER`, `HTTP_PROVIDER`, `GMAIL_PROVIDER`, `SLACK_PROVIDER`, `GITHUB_PROVIDER`) | ✅ Done |
| `index.ts` | Barrel export + `registerBuiltinActions()` + `allBuiltinActions` array | ✅ Done |

**Key decisions made:**
- `GraphNodeType` enum kept for backwards compatibility — both old enum values and new action IDs work
- Action IDs use `provider.action_name` format (e.g. `core.jq`, `gmail.list_messages`)
- `ActionExecutionContext` includes optional `functions` bag mirroring `NodeExecutionContext.functions` so complex nodes (Model, If-Else, Template String) can access services

### Phase 2: Migrate Core Nodes ✅ COMPLETE

All core nodes now have action equivalents. The legacy executors remain untouched — both systems coexist via a fallback path in the coordinator.

#### Actions Created

| Action ID | File | Migrated From | Notes |
|-----------|------|---------------|-------|
| `core.jq` | `actions/core/jq.ts` | `JqNodeExecutor` | Self-contained, uses `node-jq` directly |
| `core.template_string` | `actions/core/template-string.ts` | `TemplateStringNodeExecutor` | Needs `runTemplateReplacement` from context |
| `core.input` | `actions/core/input.ts` | `InputNodeExecutor` | Reads from `context.flowInputs` |
| `core.output` | `actions/core/output.ts` | `OutputNodeExecutor` | Passthrough, template-resolved by coordinator |
| `core.if_else` | `actions/core/if-else.ts` | `IfElseNodeExecutor` | Uses `markDownstreamNodesAsSkipped` + `flowRunState.edges` |
| `core.sql_query` | `actions/core/sql-query.ts` | `SqlQueryNodeExecutor` | Uses `postgres` driver, credential-based |
| `core.model` | `actions/core/model.ts` | `ModelNodeExecutor` | Delegates to `submitPrompt`, handles batch |
| `http.request` | `actions/http/request.ts` | `HttpRequestNodeExecutor` | Full auth support (Bearer, Basic, API Key, OAuth2) |
| `gmail.list_messages` | `actions/gmail/list-messages.ts` | `GmailNodeExecutor` | OAuth2 Gmail API, searches + fetches metadata |

#### Integration Points Modified

| File | Change |
|------|--------|
| `invect-core.ts` | Calls `initializeGlobalActionRegistry()` + `registerBuiltinActions()` during `initialize()`. `getAvailableNodes()` merges action-based definitions with legacy definitions (deduplicating by type). `registerActionsAsTools()` converts actions to `AgentToolDefinition` for the agent tool registry. New public methods: `getActionRegistry()`, `registerAction()`. |
| `node-execution-coordinator.ts` | Action-aware fallback: tries legacy executor first → if not found, queries `getGlobalActionRegistry()` → if action found, calls `executeActionAsNode()` instead of `executor.execute()`. Template resolution skips the `template` key for `core.template_string` actions (same as the legacy `TEMPLATE_STRING` behavior). |
| `index.ts` (core package) | Exports all public action APIs: `defineAction`, `ActionRegistry`, `executeActionAsNode`, `executeActionAsTool`, `createToolExecutorForAction`, `registerBuiltinActions`, `allBuiltinActions`, provider bundles (`coreActions`, `httpActions`, `gmailActions`, `slackActions`, `githubActions`), and all types. |

#### NOT Migrated (Stay as Legacy Executors)

| Node | Reason |
|------|--------|
| `AgentNodeExecutor` | Very complex iterative loop with tool registry, streaming, parallel execution. Too entangled with the agent tool system to migrate without risk. Will be migrated in a later phase. |
| `LoopNodeExecutor` | Manages sub-flow iteration with its own coordinator calls. Needs careful migration. |

### Phase 3: Add New Integration Actions ✅ COMPLETE

Expanded Gmail from 1 action to 5, and added two entirely new providers (Slack, GitHub) with 2 actions each. Total action count: **9 core + 1 HTTP + 5 Gmail + 2 Slack + 2 GitHub = 19 actions across 5 providers**.

#### New Gmail Actions (4 added)

| Action ID | File | Description |
|-----------|------|-------------|
| `gmail.send_message` | `actions/gmail/send-message.ts` | Send email with plain text or HTML body, CC/BCC, thread replies. Builds RFC 2822 message + base64url encoding. |
| `gmail.get_message` | `actions/gmail/get-message.ts` | Fetch full email content by message ID — headers, text body, HTML body, attachment metadata. Decodes base64url MIME parts recursively. |
| `gmail.create_draft` | `actions/gmail/create-draft.ts` | Create a draft email for review before sending. Same compose features as send_message. |
| `gmail.modify_labels` | `actions/gmail/modify-labels.ts` | Add/remove labels on a message (mark read/unread, star, archive, trash, custom labels). |

#### New Slack Provider (2 actions)

| Action ID | File | Description |
|-----------|------|-------------|
| `slack.send_message` | `actions/slack/send-message.ts` | Post a message to a Slack channel or DM. Supports mrkdwn formatting, thread replies, unfurl control. Uses `chat.postMessage` API. |
| `slack.list_channels` | `actions/slack/list-channels.ts` | List public/private channels in a workspace. Returns channel IDs, names, topics, membership info. Uses `conversations.list` API. |

#### New GitHub Provider (2 actions)

| Action ID | File | Description |
|-----------|------|-------------|
| `github.create_issue` | `actions/github/create-issue.ts` | Create an issue in a GitHub repo. Supports title, body (Markdown), labels, assignees, milestone. Uses GitHub REST API v2022-11-28. |
| `github.list_repos` | `actions/github/list-repos.ts` | List repositories for authenticated user or an organisation. Supports filtering by type, sorting, pagination. |

#### Files Modified

| File | Change |
|------|--------|
| `providers.ts` | Added `SLACK_PROVIDER` and `GITHUB_PROVIDER` constants |
| `gmail/index.ts` | Updated barrel to export all 5 Gmail actions |
| `index.ts` (actions barrel) | Added `slackActions`, `githubActions` exports; updated `allBuiltinActions` to include both new providers |
| `index.ts` (core package) | Added `slackActions`, `githubActions`, `SLACK_PROVIDER`, `GITHUB_PROVIDER` to public exports |

#### OAuth2 Providers Referenced

All new actions reference OAuth2 provider IDs that already exist in `pkg/core/src/services/credentials/oauth2-providers.ts`:

| Action Provider | OAuth2 Provider ID | Scopes Used |
|----------------|-------------------|-------------|
| Gmail | `google_gmail` | Gmail API (send, read, modify) |
| Slack | `slack` | `chat:write`, `channels:read` |
| GitHub | `github` | `repo`, `read:user` |

#### Legacy `GmailNodeExecutor` Status

The old `GmailNodeExecutor` in `pkg/core/src/nodes/gmail-executor.ts` is **still active** — it handles the legacy `GraphNodeType.GMAIL` type for existing flows. The 5 new Gmail actions provide the same functionality plus send, get, draft, and label management. Once the frontend is updated to use the new action IDs (Phase 5), the legacy executor can be deprecated.

### Phase 4: Add More Providers ⬜ NOT STARTED

1. Google Drive, Google Sheets, Google Calendar
2. Microsoft 365 (Outlook, OneDrive)
3. Notion, Jira, Linear
4. Each provider = folder with action files
5. Auto-registration on import

### Phase 5: Frontend Updates ⬜ NOT STARTED

1. Update node palette to show providers → actions hierarchy
2. Create `UniversalNode` component that renders any action-based node from its definition
3. Group tools by provider in agent tool selector
4. Update `AgentToolsBox` to handle action-based tools
5. Consider provider icon/branding in the palette

### Phase 6: Remove Legacy ⬜ NOT STARTED

1. Migrate Agent and Loop executors to actions
2. Remove `GraphNodeType` enum (replace with string-based `CORE_NODE_TYPES` const)
3. Remove old executor classes from `pkg/core/src/nodes/`
4. Remove `BaseNodeExecutor` class and `AgentToolCapable` interface
5. Migrate existing flows in DB to new action IDs (one-time migration script)
6. Simplify `agent-tool-registry.ts` to just wrap `ActionRegistry`

---

## Implementation Learnings

### TypeScript Contravariance with Generics

`ActionDefinition<TParams>` has `execute(params: TParams, ...)` — the `params` argument is in a **contravariant** position. This means `ActionDefinition<{ query: string }>` is NOT assignable to `ActionDefinition<unknown>`. 

**Fix:** Use `ActionDefinition<any>` for arrays and registry methods:
```typescript
// ❌ Fails: ActionDefinition<{ query: string }> !⊂ ActionDefinition<unknown>
const actions: ActionDefinition[] = [jqAction, httpAction];

// ✅ Works: any suppresses contravariance check
const actions: ActionDefinition<any>[] = [jqAction, httpAction];

// Also in registry methods:
register(action: ActionDefinition<any>): void { ... }
registerMany(actions: ActionDefinition<any>[]): void { ... }
```

### Dual Dispatch Pattern (Legacy + Action Fallback)

The coordinator uses a **try-legacy-first, fallback-to-action** pattern:

```typescript
const executor = nodeRegistry.getExecutor(node.type);  // legacy lookup
const action = !executor ? actionRegistry.get(node.type) : undefined;  // action fallback

// ... later in execution:
if (executor) {
  result = await executor.execute(resolvedParams, node, context);
} else if (action) {
  result = await executeActionAsNode(action, resolvedParams, context);
} else {
  throw new Error(`No executor or action found for node type: ${node.type}`);
}
```

This means:
- **Existing flows** with `GraphNodeType` enum values still route through legacy executors
- **New action IDs** (e.g. `gmail.list_messages`) route through the action executor
- Both can coexist — no breaking changes during migration

### ActionExecutionContext Needs Service Functions

The original design assumed actions are fully self-contained. In practice, several core nodes need orchestrator services:

| Node | Service Function Needed |
|------|------------------------|
| `core.template_string` | `runTemplateReplacement()` — Nunjucks rendering |
| `core.model` | `submitPrompt()` — AI provider dispatch |
| `core.if_else` | `markDownstreamNodesAsSkipped()` — flow control |

**Solution:** `ActionExecutionContext.functions` is an optional bag that mirrors `NodeExecutionContext.functions`. Actions that need these functions check for their presence and fail gracefully if not available (e.g. when running as a standalone tool without flow context).

### Template Resolution Skip Keys

The coordinator skips Nunjucks template resolution for certain keys (e.g. the `template` field in Template String nodes should be resolved by the action itself, not pre-resolved). This logic needed updating for both the legacy `GraphNodeType.TEMPLATE_STRING` type AND the new `core.template_string` action ID:

```typescript
const skipTemplateResolutionKeys: Record<string, string[]> = {
  [GraphNodeType.TEMPLATE_STRING]: ["template"],
  ["core.template_string"]: ["template"],  // action ID variant
};
```

### ActionResult → NodeExecutionResult Mapping

The action executor bridges two type systems. Actions return `ActionResult { success, output, error }` but the coordinator expects `NodeExecutionResult` (a discriminated union with `state`, `type`, `output` etc.). The `executeActionAsNode()` function handles this mapping, including the edge case where Model actions return `__batchSubmitted` metadata for pending batch jobs.

### Provider Deduplication

Multiple action files reference the same `ProviderDef` (e.g. all `core.*` actions share `CORE_PROVIDER`). The registry de-duplicates by `provider.id` — only the first registration stores the provider, subsequent ones just add to the provider's action set. Shared provider constants live in `actions/providers.ts`.

### Frontend Types Safety

The `types-export.ts` / `types-fresh.ts` files MUST NOT import from `./actions` (which contains runtime code like Zod schemas and `node-jq`). Action types for frontend consumption should be exported as `import type` only. Currently, the action module is NOT exported through `types-export.ts` — only through the main `index.ts` entry point which is backend-only.

### Credential Resolution Pattern (Phase 3)

Every integration action follows the same credential resolution pattern:

```typescript
async execute(params, context) {
  // 1. Try the pre-resolved credential from the context (tool mode)
  let credential = context.credential;
  // 2. Fall back to fetching by credentialId from params (node mode)
  if (!credential && context.functions?.getCredential) {
    credential = await context.functions.getCredential(params.credentialId);
  }
  // 3. Validate credential exists + correct auth type
  if (!credential) return { success: false, error: 'Credential not found' };
  if (credential.authType !== 'oauth2') return { success: false, error: 'Wrong type' };
  // 4. Extract access token
  const accessToken = credential.config?.accessToken as string;
  if (!accessToken) return { success: false, error: 'No token' };
  // ... use accessToken for API calls
}
```

This dual-path works because:
- **Tool mode**: The action executor pre-resolves the credential and passes it in `context.credential`
- **Node mode**: The `credentialId` param is set in the node config UI, and `context.functions.getCredential` is available from the coordinator

### Slack API Quirks

- Slack uses a **bot token** (`xoxb-...`) rather than a user OAuth2 token. The `accessToken` from the OAuth2 flow is the bot token.
- Some Slack bots store the token as `config.token` rather than `config.accessToken`. The actions handle both: `credential.config?.accessToken ?? credential.config?.token`.
- Slack API responses always return `{ ok: true/false }` — even on HTTP 200, `ok: false` means an error. Must check the `ok` field, not just the HTTP status.

### GitHub API Versioning

- GitHub REST API uses the `X-GitHub-Api-Version` header (set to `2022-11-28`).
- GitHub OAuth2 tokens don't expire by default (`supportsRefresh: false`), so no token refresh logic needed — but the action still works if a refreshable token is used.
- GitHub also stores tokens as `config.accessToken` or `config.token` depending on how the credential was created.

### RFC 2822 Email Encoding for Gmail

The Gmail `send` and `drafts` APIs require a `raw` field containing the entire RFC 2822 email message, base64url-encoded (not standard base64). Key implementation details:

```typescript
// Standard base64 → base64url (no padding)
Buffer.from(rfc2822Message)
  .toString('base64')
  .replace(/\+/g, '-')   // + → -
  .replace(/\//g, '_')   // / → _
  .replace(/=+$/, '');    // strip padding
```

Headers (To, Subject, CC, BCC, In-Reply-To) must be set in the raw message — they cannot be passed separately.

### MIME Part Decoding for Gmail Get Message

Gmail `messages.get` with `format=full` returns a nested MIME tree. Email bodies are base64url-encoded in `payload.body.data` or in nested `payload.parts[].body.data`. The `get-message` action recursively walks the MIME tree to extract both `text/plain` and `text/html` bodies plus attachment metadata. This is significantly more complete than the `list_messages` action which only fetches metadata headers.

### Action Count Scaling

Phase 3 demonstrates the scaling advantage of the action architecture. Adding 8 new actions required:
- **8 new action files** (self-contained, ~100-250 lines each)
- **2 new barrel files** (Slack + GitHub index.ts)
- **3 modified files** (providers.ts, gmail/index.ts, actions/index.ts)
- **1 modified export file** (core/index.ts)
- **Zero changes** to: executor registry, coordinator, invect-core, database schemas, frontend

Compare to the old model where each new node required: enum addition, executor class, `AgentToolCapable` implementation, coordinator awareness, registry registration, and frontend component.
