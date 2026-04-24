import { NodeExecutionStatus } from 'src/types/base';
import type { FlowNodeDefinitions, FlowEdge } from '../flow-versions/schemas-fresh';
import type { NodeExecution } from '../node-executions/node-executions.model';
import type { NodeOutput } from 'src/types/node-io-types';
import type { Logger } from 'src/schemas';

export type SchedulerFailureMode = 'stop' | 'drain';
export type SchedulerBatchPolicy = 'pause-immediately' | 'drain-then-pause';

export interface SchedulerOptions {
  logger: Logger;
  nodes: readonly FlowNodeDefinitions[];
  edges: readonly FlowEdge[];
  /** Shared skip set. Mutated by onNodeSuccess and (indirectly) by actions
   *  via `functions.markDownstreamNodesAsSkipped`. The scheduler observes
   *  mutations after every completion and treats newly-added nodes as terminal. */
  skippedNodeIds: Set<string>;
  /** Shared output map. The scheduler writes SUCCESS outputs here; the
   *  `executeNode` closure is expected to read from it when building inputs
   *  for downstream nodes. On resume, callers pre-populate this with outputs
   *  from previously-completed nodes. */
  nodeOutputs: Map<string, NodeOutput>;
  /** Nodes already complete (used by resume). Treated as SUCCESS for readiness. */
  alreadyComplete?: Set<string>;
  /** Max nodes in flight. Defaults to 8. concurrency=1 ≡ sequential. */
  concurrency: number;
  /** What to do on node failure. Only 'stop' is implemented in v1. */
  failureMode: SchedulerFailureMode;
  /** What to do on batch submission. Only 'pause-immediately' is implemented in v1. */
  batchPolicy: SchedulerBatchPolicy;
  /** The unit of work. Expected to return a trace (not throw) in the common case. */
  executeNode: (node: FlowNodeDefinitions) => Promise<NodeExecution>;
  /** Called synchronously after a SUCCESS trace is recorded, before children are
   *  promoted. Callee may mutate `skippedNodeIds` (e.g. branch skipping); those
   *  mutations are absorbed on the next iteration. */
  onNodeSuccess?: (node: FlowNodeDefinitions, trace: NodeExecution) => void;
  /** Abort signal. When aborted, the scheduler stops launching new nodes and
   *  lets in-flight work drain. Existing nodes receive the signal via `executeNode`. */
  signal?: AbortSignal;
}

export interface SchedulerResult {
  /** All traces produced during this scheduler run (completion order, not
   *  topological order). Callers that need a deterministic ordering should
   *  re-fetch from the database. */
  traces: NodeExecution[];
  /** First failure encountered, if any. */
  failure?: { nodeId: string; error: string; errorDetails?: unknown };
  /** True if at least one node returned BATCH_SUBMITTED — the caller must
   *  pause the flow and wait for the batch to complete before resuming. */
  paused: boolean;
  /** Nodes that submitted a batch during this run. */
  batchPendingNodeIds: Set<string>;
}

type Completion =
  | { kind: 'ok'; nodeId: string; trace: NodeExecution }
  | { kind: 'throw'; nodeId: string; error: Error };

/**
 * Ready-set scheduler for parallel flow-node execution.
 *
 * A node becomes "ready" when all of its parents have reached a terminal state
 * (SUCCESS or SKIPPED). The scheduler launches up to `concurrency` ready nodes
 * concurrently. On each completion, children of the just-finished node are
 * re-evaluated for readiness. After `onNodeSuccess` runs (which may mutate
 * `skippedNodeIds` via branch skipping), any newly-skipped nodes are absorbed
 * as terminal and their children are re-evaluated too.
 *
 * Failure handling (`failureMode: 'stop'`): on first FAILED trace, the
 * scheduler stops launching new nodes. In-flight nodes are allowed to settle
 * naturally. The scheduler returns with `failure` populated.
 *
 * Batch handling (`batchPolicy: 'pause-immediately'`): on first BATCH_SUBMITTED
 * trace, the scheduler stops launching new nodes. In-flight nodes are allowed
 * to settle (they may succeed, fail, or batch-submit too — all are captured).
 * The scheduler returns with `paused: true`.
 *
 * Concurrency correctness: all bookkeeping (readiness checks, branch skipping,
 * output writes) runs in `handleCompletion`, which executes between `await`s
 * on the event loop. Two completions are never processed simultaneously, so
 * no locking is required.
 */
export class Scheduler {
  private readonly nodeMap: Map<string, FlowNodeDefinitions>;
  private readonly incomingByNode: Map<string, FlowEdge[]>;
  private readonly outgoingByNode: Map<string, FlowEdge[]>;

  private readonly readyQueue: string[] = [];
  private readonly readySet = new Set<string>();
  private readonly inFlight = new Map<string, Promise<Completion>>();
  /** SUCCESS or SKIPPED — children may become ready after this. */
  private readonly terminal = new Set<string>();
  /** All completed nodes (any terminal status, including FAILED and BATCH_SUBMITTED). */
  private readonly done = new Set<string>();
  private readonly traces: NodeExecution[] = [];
  private readonly batchPendingNodeIds = new Set<string>();
  private firstFailure?: { nodeId: string; error: string; errorDetails?: unknown };
  private paused = false;
  /** Size of `skippedNodeIds` last time we absorbed newly-skipped nodes. */
  private lastSkippedSize = 0;

  constructor(private readonly opts: SchedulerOptions) {
    this.nodeMap = new Map(opts.nodes.map((n) => [n.id, n]));
    this.incomingByNode = new Map();
    this.outgoingByNode = new Map();
    for (const node of opts.nodes) {
      this.incomingByNode.set(node.id, []);
      this.outgoingByNode.set(node.id, []);
    }
    for (const edge of opts.edges) {
      this.incomingByNode.get(edge.target)?.push(edge);
      this.outgoingByNode.get(edge.source)?.push(edge);
    }
    // Seed already-complete nodes (resume path) as terminal.
    if (opts.alreadyComplete) {
      for (const id of opts.alreadyComplete) {
        this.terminal.add(id);
        this.done.add(id);
      }
    }
    // Initially-skipped nodes are terminal too.
    for (const id of opts.skippedNodeIds) {
      this.terminal.add(id);
      this.done.add(id);
    }
    this.lastSkippedSize = opts.skippedNodeIds.size;
  }

  async run(): Promise<SchedulerResult> {
    this.seedReady();

    while (true) {
      // Launch as many ready nodes as concurrency allows.
      while (this.canLaunch()) {
        const nodeId = this.readyQueue.shift();
        if (!nodeId) {
          break;
        }
        this.readySet.delete(nodeId);
        this.launch(nodeId);
      }

      if (this.inFlight.size === 0) {
        break;
      }

      // Wait for at least one in-flight node to complete.
      const completion = await this.raceCompletion();
      this.handleCompletion(completion);
    }

    return {
      traces: this.traces,
      failure: this.firstFailure,
      paused: this.paused,
      batchPendingNodeIds: this.batchPendingNodeIds,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private seedReady(): void {
    for (const node of this.opts.nodes) {
      if (this.done.has(node.id)) {
        continue;
      }
      if (this.allParentsTerminal(node.id)) {
        this.enqueueReady(node.id);
      }
    }
  }

  private canLaunch(): boolean {
    if (this.readyQueue.length === 0) {
      return false;
    }
    if (this.inFlight.size >= this.opts.concurrency) {
      return false;
    }
    if (this.opts.signal?.aborted) {
      return false;
    }
    if (this.firstFailure && this.opts.failureMode === 'stop') {
      return false;
    }
    if (this.paused && this.opts.batchPolicy === 'pause-immediately') {
      return false;
    }
    return true;
  }

  private launch(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node) {
      // Defensive — a ready id should always have a node.
      this.opts.logger.warn('Scheduler: node id in ready queue has no node definition', {
        nodeId,
      });
      return;
    }
    const wrapped: Promise<Completion> = this.opts.executeNode(node).then(
      (trace) => ({ kind: 'ok' as const, nodeId, trace }),
      (err) => ({
        kind: 'throw' as const,
        nodeId,
        error: err instanceof Error ? err : new Error(String(err)),
      }),
    );
    this.inFlight.set(nodeId, wrapped);
  }

  private raceCompletion(): Promise<Completion> {
    return Promise.race(this.inFlight.values());
  }

  private handleCompletion(c: Completion): void {
    this.inFlight.delete(c.nodeId);
    this.done.add(c.nodeId);

    if (c.kind === 'throw') {
      // executeNode threw rather than returning a FAILED trace. Treat as a
      // fatal bookkeeping error — record and stop launching.
      this.opts.logger.error('Scheduler: executeNode threw', {
        nodeId: c.nodeId,
        error: c.error.message,
      });
      if (!this.firstFailure) {
        this.firstFailure = { nodeId: c.nodeId, error: c.error.message };
      }
      return;
    }

    this.traces.push(c.trace);
    const node = this.nodeMap.get(c.nodeId);
    if (!node) {
      return;
    }

    switch (c.trace.status) {
      case NodeExecutionStatus.SUCCESS: {
        if (c.trace.outputs) {
          this.opts.nodeOutputs.set(c.nodeId, c.trace.outputs);
        }
        this.terminal.add(c.nodeId);
        // Allow the caller (FlowRunCoordinator) to propagate branch skips.
        // This may mutate `skippedNodeIds` — we absorb that below.
        try {
          this.opts.onNodeSuccess?.(node, c.trace);
        } catch (err) {
          this.opts.logger.warn('Scheduler: onNodeSuccess threw (non-fatal)', {
            nodeId: c.nodeId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        this.promoteChildren(c.nodeId);
        this.absorbNewlySkipped();
        break;
      }
      case NodeExecutionStatus.SKIPPED: {
        // A node can be marked SKIPPED via the beforeNodeExecute hook.
        this.terminal.add(c.nodeId);
        this.opts.skippedNodeIds.add(c.nodeId);
        this.promoteChildren(c.nodeId);
        this.absorbNewlySkipped();
        break;
      }
      case NodeExecutionStatus.FAILED: {
        if (!this.firstFailure) {
          this.firstFailure = {
            nodeId: c.nodeId,
            error: c.trace.error || 'Node execution failed',
          };
        }
        // In 'stop' mode, no promotion — canLaunch will block new launches.
        // In-flight nodes are still allowed to settle.
        break;
      }
      case NodeExecutionStatus.BATCH_SUBMITTED: {
        this.batchPendingNodeIds.add(c.nodeId);
        this.paused = true;
        // In 'pause-immediately' mode, no promotion. Descendants stay queued.
        break;
      }
      default:
        // Other statuses (PENDING, RUNNING, CANCELLED) shouldn't reach the
        // scheduler — they're intermediate or handled elsewhere.
        this.opts.logger.debug('Scheduler: unexpected trace status', {
          nodeId: c.nodeId,
          status: c.trace.status,
        });
        break;
    }
  }

  private promoteChildren(parentId: string): void {
    const children = this.outgoingByNode.get(parentId) ?? [];
    for (const edge of children) {
      const childId = edge.target;
      if (this.done.has(childId)) {
        continue;
      }
      if (this.inFlight.has(childId)) {
        continue;
      }
      if (this.readySet.has(childId)) {
        continue;
      }
      if (this.opts.skippedNodeIds.has(childId)) {
        continue;
      }
      if (this.allParentsTerminal(childId)) {
        this.enqueueReady(childId);
      }
    }
  }

  private absorbNewlySkipped(): void {
    if (this.opts.skippedNodeIds.size === this.lastSkippedSize) {
      return;
    }
    for (const id of this.opts.skippedNodeIds) {
      if (this.done.has(id)) {
        continue;
      }
      this.done.add(id);
      this.terminal.add(id);
      this.promoteChildren(id);
    }
    this.lastSkippedSize = this.opts.skippedNodeIds.size;
  }

  private allParentsTerminal(nodeId: string): boolean {
    const incoming = this.incomingByNode.get(nodeId) ?? [];
    if (incoming.length === 0) {
      return true;
    }
    for (const edge of incoming) {
      if (!this.terminal.has(edge.source)) {
        return false;
      }
    }
    return true;
  }

  private enqueueReady(nodeId: string): void {
    this.readyQueue.push(nodeId);
    this.readySet.add(nodeId);
  }
}
