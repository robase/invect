/**
 * SDK Types
 *
 * Type definitions for the `defineFlow()` declarative SDK.
 * These mirror the runtime `InvectDefinition` shape but with ergonomic
 * shorthand for edges and typed param helpers for each node type.
 */

import type {
  InvectDefinition,
  FlowNodeDefinitions,
  FlowEdge,
  MapperConfig,
} from 'src/services/flow-versions/schemas-fresh';

// ── Re-exports for SDK consumers ────────────────────────────────────────

export type { InvectDefinition, FlowNodeDefinitions, FlowEdge, MapperConfig };

// ── Edge types ──────────────────────────────────────────────────────────

/** Tuple shorthand: [from, to] or [from, to, sourceHandle] */
export type EdgeTuple =
  | [from: string, to: string]
  | [from: string, to: string, sourceHandle: string];

/** Object form: { from, to, handle? } */
export interface EdgeObject {
  from: string;
  to: string;
  handle?: string;
}

/** Accepted edge input — either tuple or object */
export type EdgeInput = EdgeTuple | EdgeObject;

// ── Flow file definition ────────────────────────────────────────────────

export interface FlowFileDefinition {
  name: string;
  description?: string;
  tags?: string[];
  nodes: FlowNodeDefinitions[];
  edges: EdgeInput[];
}

// ── Node param types (matching each action's Zod schema) ────────────────

export interface InputParams {
  variableName?: string;
  defaultValue?: string;
}

export interface OutputParams {
  outputValue?: string;
  outputName?: string;
}

export interface ModelParams {
  credentialId: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  useBatchProcessing?: boolean;
}

export interface JavaScriptParams {
  code: string;
}

export interface IfElseParams {
  condition?: Record<string, unknown>;
}

export interface TemplateParams {
  template?: string;
}

export interface HttpRequestParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  credentialId?: string;
  timeout?: number;
}

// ── Provider action param types ─────────────────────────────────────────

export interface GmailSendMessageParams {
  credentialId: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  isHtml?: boolean;
  threadId?: string;
  inReplyTo?: string;
}

export interface GmailListMessagesParams {
  credentialId: string;
  query?: string;
  maxResults?: number;
  labelIds?: string;
}

export interface GmailGetMessageParams {
  credentialId: string;
  messageId: string;
  format?: string;
}

export interface GmailCreateDraftParams {
  credentialId: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  isHtml?: boolean;
}

export interface GmailModifyLabelsParams {
  credentialId: string;
  messageId: string;
  addLabelIds?: string;
  removeLabelIds?: string;
}

export interface SlackSendMessageParams {
  credentialId: string;
  channel: string;
  text: string;
  threadTs?: string;
  unfurlLinks?: boolean;
  unfurlMedia?: boolean;
}

export interface SlackListChannelsParams {
  credentialId: string;
  types?: string;
  limit?: number;
}

export interface GithubCreateIssueParams {
  credentialId: string;
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string;
  assignees?: string;
}

export interface GithubListReposParams {
  credentialId: string;
  type?: string;
  sort?: string;
  perPage?: number;
}

export interface GithubCreatePullRequestParams {
  credentialId: string;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface GithubListIssuesParams {
  credentialId: string;
  owner: string;
  repo: string;
  state?: string;
  labels?: string;
  sort?: string;
  perPage?: number;
}

// ── Generic action params (for actions without dedicated types) ─────────

export type GenericParams = Record<string, unknown>;

// ── Agent params ─────────────────────────────────────────────────────────

export interface AddedToolInstance {
  toolId: string;
  instanceId?: string;
  customName?: string;
  customDescription?: string;
  customParams?: Record<string, unknown>;
}

export interface AgentParams {
  credentialId: string;
  model: string;
  taskPrompt: string;
  systemPrompt?: string;
  provider?: string;
  addedTools?: AddedToolInstance[];
  maxIterations?: number;
  stopCondition?: 'explicit_stop' | 'tool_result' | 'max_iterations';
  temperature?: number;
  maxTokens?: number;
  toolTimeoutMs?: number;
  maxConversationTokens?: number;
  enableParallelTools?: boolean;
  useBatchProcessing?: boolean;
}

// ── Mapper shorthand ────────────────────────────────────────────────────

export interface MapperOptions {
  expression: string;
  mode?: 'auto' | 'iterate' | 'reshape';
  outputMode?: 'array' | 'object' | 'first' | 'last' | 'concat';
  keyField?: string;
  concurrency?: number;
  onEmpty?: 'error' | 'skip';
}
