// Invect Core Package - Types and Constants Only
// This file exports only TypeScript types, enums, and constants without runtime dependencies

// Re-export type definitions
export type { FlowRunContext } from './types.internal';

export type {
  InvectDefinition,
  FlowEdge,
  MapperConfig,
} from './services/flow-versions/schemas-fresh';

export type { FlowNodeDefinitions as FlowNode } from './services/flow-versions/schemas-fresh';

export type {
  FlowRunResult,
  FlowInputs,
  ExecuteFlowOptions,
} from './services/flow-runs/flow-runs.service';

export type {
  Flow,
  CreateFlowInput as CreateFlowRequest,
  UpdateFlowInput,
  CreateFlowInput as CreateFlowDto,
} from './services/flows/flows.model';

export type {
  CreateFlowVersionRequest as CreateFlowVersionDto,
  CreateFlowVersionRequest,
} from './services/flow-versions/schemas-fresh';

export type {
  FlowRun,
  CreateFlowRunInput,
  UpdateFlowRunInput,
} from './services/flow-runs/flow-runs.model';

export type {
  NodeExecution,
  CreateNodeExecutionInput,
  UpdateNodeExecutionInput,
  AgentToolExecution,
  CreateAgentToolExecutionInput,
} from './services/node-executions/node-executions.model';

export type { SubmitPromptRequest } from './services/node-data.service';

export type { Model } from './services/ai/base-client';

export type { PaginatedResponse, QueryOptions } from './schemas/pagination-sort-filter';

export type { InvectConfig } from './schemas/invect-config';

// Plugin system types (safe for frontend — no runtime imports)
export type {
  InvectPlugin,
  InvectPluginSchema,
  InvectPluginHooks,
  InvectPluginEndpoint,
  InvectPluginContext,
  InvectPluginInitResult,
  PluginEndpointContext,
  PluginDatabaseApi,
  PluginEndpointResponse,
  PluginFieldAttribute,
  PluginFieldType,
  PluginTableDefinition,
  PluginHookRunner,
  FlowRunHookContext,
  NodeExecutionHookContext,
  NodeExecutionHookResult,
  InvectPluginDefinition,
} from './types/plugin.types';

export type { ExecutionConfig, LoggingConfig, Logger, InvectDatabaseConfig } from './schemas';

// Re-export scoped logging types
export type { LogLevel, LogScopeName, ScopedLoggingConfig } from './utils/logger';

export type {
  NodeOutput,
  NodeOutputs,
  NodeInputData,
  NodeIncomingDataObject,
  InputMappingConfig,
  StructuredOutput,
  OutputVariable,
  OutputVariables,
} from './types/node-io-types';

export type {
  FlowValidationResult,
  FlowValidationError,
  FlowValidationWarning,
  ValidationIssue,
} from './types/validation';

export type { FlowVersion } from './database';

export type {
  ReactFlowNode,
  ReactFlowNodeData,
  ReactFlowEdge,
  ReactFlowData,
  TypedReactFlowData,
  NodeVisualStatus,
  NodeExecutionStatusInfo,
  Position,
} from './services/react-flow-renderer.service';

export type { NodeExecutionResult as ExecutionResult } from './types/node-execution.types';

// Agent tool types
export type {
  AgentToolDefinition,
  AgentToolCategory,
  AgentToolResult,
  AgentMessage,
  AgentToolCall,
  ToolExecutionRecord,
  AgentFinishReason,
  AgentStopCondition,
  AgentExecutionOutput,
  AddedToolInstance,
  ConfiguredToolDefinition,
} from './types/agent-tool.types';
export { newToolInstanceId } from './types/agent-tool.types';

// Node config update types
export type {
  NodeConfigUpdateEvent,
  NodeConfigUpdateResponse,
  NodeConfigUpdateContext,
} from './types/node-config-update.types';

// Trigger types (pure interfaces — safe for frontend)
export type {
  TriggerType,
  FlowTriggerRegistration,
  CreateTriggerInput,
  UpdateTriggerInput,
  TriggerExecutionOptions,
} from './services/triggers/trigger.types';

// Export enums and constants (these are runtime values but safe to bundle)
// CRITICAL: Import from pure types file, NOT from types-fresh.ts which has Zod
export { FlowRunStatus, NodeExecutionStatus } from './types/base';

export { GraphNodeType, GRAPH_NODE_TYPE_NAMES } from './types/graph-node-types';

export { BatchProvider, BatchStatus } from './services/ai/ai-types';

export { FLOW_VALIDATION_ERROR_TYPES } from './types/validation';

// Database schema types — used by CLI-generated schema files ($type<>() annotations)
export type { InvectDefinitionRuntime } from './services/flow-versions/schemas-fresh';
export type { JSONValue } from './database';
export type {
  CredentialType,
  CredentialAuthType,
  CredentialConfig,
} from './database/schema-sqlite';

// Dashboard stats type (pure interface — safe for frontend)
export type { DashboardStats } from './invect-core';

// InvectInstance type (the new namespaced API surface)
export type { InvectInstance } from './api/types';

// Execution streaming event types (SSE)
export type {
  ExecutionStreamEvent,
  ExecutionSnapshotEvent,
  FlowRunUpdatedEvent,
  NodeExecutionCreatedEvent,
  NodeExecutionUpdatedEvent,
  HeartbeatEvent,
  EndEvent,
} from './services/execution-event-bus';
