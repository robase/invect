/**
 * Invect Sub-API Type Definitions
 *
 * These interfaces define the namespaced public API surface returned by createInvect().
 * Each interface groups related operations into a cohesive domain.
 */

import type { Flow, CreateFlowInput, UpdateFlowInput } from '../services/flows/flows.model';
import type { FlowVersion } from '../database';
import type { FlowRun } from '../services/flow-runs/flow-runs.model';
import type { NodeExecution } from '../services/node-executions/node-executions.model';
import type {
  ExecuteFlowOptions,
  FlowRunResult,
  FlowInputs,
} from '../services/flow-runs/flow-runs.service';
import type {
  SubmitPromptRequest,
  SubmitSQLQueryRequest,
  SQLQueryResult,
} from '../services/node-data.service';
import type {
  Credential,
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilters,
} from '../services/credentials';
import type { OAuth2PendingState } from '../services/credentials/oauth2.service';
import type { OAuth2ProviderDefinition } from '../services/credentials/oauth2-providers';
import type {
  FlowTriggerRegistration,
  CreateTriggerInput,
  UpdateTriggerInput,
} from '../services/triggers';
import type { FlowValidationResult } from '../types/validation';
import type { ReactFlowData } from '../services/react-flow-renderer.service';
import type { NodeDefinition } from '../types/node-definition.types';
import type { BatchProvider, Model } from '../services/ai/base-client';
import type { PaginatedResponse, QueryOptions, InvectDatabaseConfig } from '../types/schemas';
import type { CreateFlowVersionRequest, FlowEdge } from '../services/flow-versions/schemas-fresh';
import type { ExecutionStreamEvent } from '../services/execution-event-bus';
import type { ActionDefinition, ProviderDef, LoadOptionsResult } from '../actions';
import type { ActionRegistry } from '../actions';
import type { AgentToolDefinition, AgentPromptResult } from '../types/agent-tool.types';
import type { SubmitAgentPromptRequest } from '../types-fresh';
import type {
  NodeConfigUpdateEvent,
  NodeConfigUpdateResponse,
} from '../types/node-config-update.types';
import type {
  InvectIdentity,
  InvectPermission,
  AuthorizationContext,
  AuthorizationResult,
  AuthEvent,
} from '../types/auth.types';
import type { AuthorizationService } from '../services/auth';
import type { InvectPlugin, InvectPluginEndpoint, PluginHookRunner } from '../types/plugin.types';
import type { DatabaseConnection } from '../database/connection';
import type { LoggerManager, ScopedLogger, LogLevel } from '../utils/logger';
import type { DashboardStats } from '../invect-core';
import type { ChatMessageRecord } from '../services/chat/chat-messages.model';
import type { ChatMessage, ChatContext, ChatStreamEvent } from '../services/chat/chat-types';

// =====================================
// FLOWS
// =====================================

export interface FlowsAPI {
  create(data: CreateFlowInput): Promise<Flow>;
  list(options?: QueryOptions<Flow>): Promise<PaginatedResponse<Flow>>;
  get(flowId: string): Promise<Flow>;
  update(flowId: string, data: UpdateFlowInput): Promise<Flow>;
  delete(flowId: string): Promise<void>;
  validate(flowId: string, definition: unknown): Promise<FlowValidationResult>;
  renderToReactFlow(
    flowId: string,
    options?: { version?: string | number | 'latest'; flowRunId?: string },
  ): Promise<ReactFlowData>;
  getDashboardStats(): Promise<DashboardStats>;
}

// =====================================
// FLOW VERSIONS
// =====================================

export interface FlowVersionsAPI {
  create(flowId: string, data: CreateFlowVersionRequest): Promise<FlowVersion>;
  list(
    flowId: string,
    options?: QueryOptions<FlowVersion>,
  ): Promise<PaginatedResponse<FlowVersion>>;
  get(flowId: string, version: string | number | 'latest'): Promise<FlowVersion | null>;
}

// =====================================
// FLOW RUNS
// =====================================

export interface FlowRunsAPI {
  start(flowId: string, inputs?: FlowInputs, options?: ExecuteFlowOptions): Promise<FlowRunResult>;
  startAsync(
    flowId: string,
    inputs?: FlowInputs,
    options?: ExecuteFlowOptions,
  ): Promise<FlowRunResult>;
  executeToNode(
    flowId: string,
    targetNodeId: string,
    inputs?: FlowInputs,
    options?: ExecuteFlowOptions,
  ): Promise<FlowRunResult>;
  resume(executionId: string): Promise<{ message: string; timestamp: string }>;
  list(options?: QueryOptions<FlowRun>): Promise<PaginatedResponse<FlowRun>>;
  listByFlowId(flowId: string): Promise<PaginatedResponse<FlowRun>>;
  get(flowRunId: string): Promise<FlowRun>;
  cancel(flowRunId: string): Promise<{ message: string; timestamp: string }>;
  pause(flowRunId: string, reason?: string): Promise<{ message: string; timestamp: string }>;
  createEventStream(flowRunId: string): AsyncGenerator<ExecutionStreamEvent, void, undefined>;
  getNodeExecutions(flowRunId: string): Promise<NodeExecution[]>;
  listNodeExecutions(
    options?: QueryOptions<NodeExecution>,
  ): Promise<PaginatedResponse<NodeExecution>>;
}

// =====================================
// CREDENTIALS (includes OAuth2 + Webhooks)
// =====================================

export interface CredentialsAPI {
  create(input: CreateCredentialInput): Promise<Credential>;
  list(filters?: CredentialFilters): Promise<Array<Omit<Credential, 'config'>>>;
  get(id: string): Promise<Credential>;
  update(id: string, input: UpdateCredentialInput): Promise<Credential>;
  delete(id: string): Promise<void>;
  test(id: string): Promise<{ success: boolean; error?: string }>;
  updateLastUsed(id: string): Promise<void>;
  getExpiring(daysUntilExpiry?: number): Promise<Credential[]>;

  // Webhooks
  getWebhookInfo(id: string): Promise<{ webhookPath: string; fullUrl: string } | null>;
  enableWebhook(id: string): Promise<{ webhookPath: string; fullUrl: string }>;
  findByWebhookPath(webhookPath: string): Promise<Credential | null>;

  // OAuth2
  getOAuth2Providers(): OAuth2ProviderDefinition[];
  getOAuth2Provider(providerId: string): OAuth2ProviderDefinition | undefined;
  startOAuth2Flow(
    providerId: string,
    appConfig: { clientId: string; clientSecret: string; redirectUri: string },
    options?: { scopes?: string[]; returnUrl?: string; credentialName?: string },
  ): { authorizationUrl: string; state: string };
  getOAuth2PendingState(state: string): OAuth2PendingState | undefined;
  handleOAuth2Callback(
    code: string,
    state: string,
    appConfig: { clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<Credential>;
  refreshOAuth2Credential(credentialId: string): Promise<Credential>;
}

// =====================================
// TRIGGERS
// =====================================

export interface TriggersAPI {
  list(flowId: string): Promise<FlowTriggerRegistration[]>;
  get(triggerId: string): Promise<FlowTriggerRegistration | null>;
  create(input: CreateTriggerInput): Promise<FlowTriggerRegistration>;
  update(triggerId: string, input: UpdateTriggerInput): Promise<FlowTriggerRegistration | null>;
  delete(triggerId: string): Promise<void>;
  sync(
    flowId: string,
    definition: {
      nodes: Array<{ id: string; type: string; params?: Record<string, unknown> }>;
      edges?: FlowEdge[];
    },
  ): Promise<FlowTriggerRegistration[]>;
  getEnabledCron(): Promise<FlowTriggerRegistration[]>;
  executeCron(triggerId: string): Promise<{ flowRunId: string; flowId: string }>;
}

// =====================================
// AGENT
// =====================================

export interface AgentAPI {
  getTools(): AgentToolDefinition[];
  submitPrompt(
    request: SubmitAgentPromptRequest,
  ): Promise<
    | AgentPromptResult
    | { type: 'batch_submitted'; batchJobId: string; nodeId: string; flowRunId: string }
  >;
}

// =====================================
// CHAT
// =====================================

export interface ChatAPI {
  createStream(options: {
    messages: ChatMessage[];
    context: ChatContext;
    identity?: InvectIdentity;
  }): Promise<AsyncGenerator<ChatStreamEvent>>;
  isEnabled(): boolean;
  getMessages(flowId: string): Promise<ChatMessageRecord[]>;
  saveMessages(
    flowId: string,
    messages: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      toolMeta?: Record<string, unknown> | null;
    }>,
  ): Promise<ChatMessageRecord[]>;
  deleteMessages(flowId: string): Promise<void>;
}

// =====================================
// ACTIONS
// =====================================

export interface ActionsAPI {
  getRegistry(): ActionRegistry;
  register(action: ActionDefinition): void;
  getProviders(): ProviderDef[];
  getForProvider(providerId: string): ActionDefinition[];
  getAvailableNodes(): NodeDefinition[];
  handleConfigUpdate(event: NodeConfigUpdateEvent): Promise<NodeConfigUpdateResponse>;
  resolveFieldOptions(
    actionId: string,
    fieldName: string,
    deps: Record<string, unknown>,
  ): Promise<LoadOptionsResult>;
}

// =====================================
// TESTING
// =====================================

export interface TestingAPI {
  testNode(
    nodeType: string,
    params: Record<string, unknown>,
    inputData?: Record<string, unknown>,
  ): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }>;
  executeSqlQuery(request: SubmitSQLQueryRequest): Promise<SQLQueryResult>;
  testJsExpression(request: {
    expression: string;
    context: Record<string, unknown>;
  }): Promise<{ success: boolean; result?: unknown; error?: string }>;
  testMapper(request: {
    expression: string;
    incomingData: Record<string, unknown>;
    mode?: 'auto' | 'iterate' | 'reshape';
  }): Promise<{
    success: boolean;
    result?: unknown;
    resultType?: 'array' | 'object' | 'primitive';
    itemCount?: number;
    error?: string;
  }>;
  testModelPrompt(request: SubmitPromptRequest): Promise<unknown>;
  getAvailableModels(): Promise<unknown>;
  getModelsForProvider(
    provider: BatchProvider,
  ): Promise<{ provider: BatchProvider; models: Model[]; defaultModel: string }>;
  getModelsForCredential(
    credentialId: string,
  ): Promise<{ provider: BatchProvider; models: Model[]; defaultModel: string }>;
  getAvailableDatabases(): InvectDatabaseConfig[];
}

// =====================================
// AUTH
// =====================================

export interface AuthAPI {
  authorize(context: AuthorizationContext): Promise<AuthorizationResult>;
  hasPermission(identity: InvectIdentity | null, permission: InvectPermission): boolean;
  getPermissions(identity: InvectIdentity | null): InvectPermission[];
  getService(): AuthorizationService;
  getAvailableRoles(): ReturnType<AuthorizationService['getAvailableRoles']>;
  getResolvedRole(identity: InvectIdentity | null): string | null;
  onEvent<T extends AuthEvent['type']>(
    event: T,
    listener: (event: Extract<AuthEvent, { type: T }>) => void,
  ): void;
  isEnabled(): boolean;
  isPublicRoute(path: string): boolean;
}

// =====================================
// PLUGINS
// =====================================

export interface PluginsAPI {
  has(pluginId: string): boolean;
  get(pluginId: string): InvectPlugin | null;
  getAll(): readonly InvectPlugin[];
  getEndpoints(): InvectPluginEndpoint[];
  getHookRunner(): PluginHookRunner;
  getDatabaseConnection(): DatabaseConnection;
}

// =====================================
// INVECT INSTANCE (top-level)
// =====================================

export interface InvectInstance {
  readonly flows: FlowsAPI;
  readonly versions: FlowVersionsAPI;
  readonly runs: FlowRunsAPI;
  readonly credentials: CredentialsAPI;
  readonly triggers: TriggersAPI;
  readonly agent: AgentAPI;
  readonly chat: ChatAPI;
  readonly actions: ActionsAPI;
  readonly testing: TestingAPI;
  readonly auth: AuthAPI;
  readonly plugins: PluginsAPI;

  // Logging (root-level — too small for a namespace)
  getLogger(scope: string, context?: string): ScopedLogger;
  getLoggerManager(): LoggerManager;
  setLogLevel(scope: string, level: LogLevel): void;

  // Lifecycle
  shutdown(): Promise<void>;
  startBatchPolling(): Promise<void>;
  stopBatchPolling(): Promise<void>;
  startCronScheduler(): Promise<void>;
  stopCronScheduler(): void;
  refreshCronScheduler(): Promise<void>;
  healthCheck(): Promise<Record<string, boolean>>;
}
