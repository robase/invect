/**
 * Execution Event Bus
 *
 * In-process pub/sub for flow-run and node-execution state changes.
 * Services emit events when they write to the database; SSE endpoints
 * subscribe per flow-run ID and forward events to connected clients.
 */
import { EventEmitter } from 'events';
import type { FlowRun } from './flow-runs/flow-runs.model';
import type { NodeExecution } from './node-executions/node-executions.model';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type ExecutionSnapshotEvent = {
  type: 'snapshot';
  flowRun: FlowRun;
  nodeExecutions: NodeExecution[];
};

export type FlowRunUpdatedEvent = {
  type: 'flow_run.updated';
  flowRun: FlowRun;
};

export type NodeExecutionCreatedEvent = {
  type: 'node_execution.created';
  nodeExecution: NodeExecution;
};

export type NodeExecutionUpdatedEvent = {
  type: 'node_execution.updated';
  nodeExecution: NodeExecution;
};

export type HeartbeatEvent = {
  type: 'heartbeat';
};

export type EndEvent = {
  type: 'end';
  flowRun: FlowRun;
};

export type ExecutionStreamEvent =
  | ExecutionSnapshotEvent
  | FlowRunUpdatedEvent
  | NodeExecutionCreatedEvent
  | NodeExecutionUpdatedEvent
  | HeartbeatEvent
  | EndEvent;

// ---------------------------------------------------------------------------
// Bus implementation
// ---------------------------------------------------------------------------

/**
 * Lightweight event bus scoped to flow-run IDs.
 *
 * Consumers call `subscribe(flowRunId, callback)` and receive all events for
 * that run. Producers call `emitFlowRunUpdate`, `emitNodeExecutionCreate`, etc.
 */
export class ExecutionEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many concurrent SSE listeners per flow-run
    this.emitter.setMaxListeners(0);
  }

  // ---- emit helpers -------------------------------------------------------

  emitFlowRunUpdate(flowRun: FlowRun): void {
    const event: FlowRunUpdatedEvent = { type: 'flow_run.updated', flowRun };
    this.emitter.emit(`run:${flowRun.id}`, event);

    // Also emit on the flow-level channel so the runs-list can update
    this.emitter.emit(`flow:${flowRun.flowId}`, event);
  }

  emitNodeExecutionCreate(nodeExecution: NodeExecution): void {
    const event: NodeExecutionCreatedEvent = {
      type: 'node_execution.created',
      nodeExecution,
    };
    this.emitter.emit(`run:${nodeExecution.flowRunId}`, event);
  }

  emitNodeExecutionUpdate(nodeExecution: NodeExecution): void {
    const event: NodeExecutionUpdatedEvent = {
      type: 'node_execution.updated',
      nodeExecution,
    };
    this.emitter.emit(`run:${nodeExecution.flowRunId}`, event);
  }

  // ---- subscription -------------------------------------------------------

  /**
   * Subscribe to events for a specific flow run.
   * Returns an unsubscribe function.
   */
  subscribe(flowRunId: string, callback: (event: ExecutionStreamEvent) => void): () => void {
    const channel = `run:${flowRunId}`;
    this.emitter.on(channel, callback);
    return () => {
      this.emitter.off(channel, callback);
    };
  }

  /**
   * Subscribe to all run-level events for a specific flow (e.g. runs list updates).
   */
  subscribeFlow(flowId: string, callback: (event: ExecutionStreamEvent) => void): () => void {
    const channel = `flow:${flowId}`;
    this.emitter.on(channel, callback);
    return () => {
      this.emitter.off(channel, callback);
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalBus: ExecutionEventBus | null = null;

export function getExecutionEventBus(): ExecutionEventBus {
  if (!globalBus) {
    globalBus = new ExecutionEventBus();
  }
  return globalBus;
}

/** Reset for tests */
export function resetExecutionEventBus(): void {
  globalBus = null;
}
