// Database layer exports for Invect core
export * from './connection';

// Re-export database schema types
export type {
  Flow,
  NewFlow,
  FlowVersion,
  NewFlowVersion,
  FlowRun,
  NewFlowRun,
  NodeExecution,
  NewNodeExecution,
  BatchJob,
  NewBatchJob,
  FlowTrigger,
  NewFlowTrigger,
  TriggerType,
} from './schema-sqlite';

export type { ChatMessageRecord, NewChatMessageRecord } from './schema-sqlite';

export type JSONValue = Record<string, unknown>;

export * as drizzleSqliteSchema from './schema-sqlite';
export * as drizzleMySqlSchema from './schema-mysql';
export * as drizzlePostgresSchema from './schema-postgres';
