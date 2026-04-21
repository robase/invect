/**
 * Unit tests: FlowRunCoordinator.handleBranchSkipping
 *
 * handleBranchSkipping is the private method that decides which downstream
 * nodes to skip after a branching node (if_else, switch) executes. It reads
 * the trace's outputVariables to determine which handles are active, then
 * marks targets on inactive handles as skipped.
 *
 * We access it via (coordinator as any) to unit-test the logic in isolation
 * without needing to run a full flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlowRunCoordinator } from 'src/services/flow-orchestration/flow-run-coordinator';
import { NodeExecutionStatus } from 'src/types/base';
import type { FlowEdge } from 'src/services/flow-versions/schemas-fresh';
import type { NodeExecution } from 'src/services/node-executions/node-executions.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function edge(id: string, source: string, target: string, sourceHandle?: string): FlowEdge {
  return { id, source, target, ...(sourceHandle !== undefined && { sourceHandle }) };
}

function successTrace(nodeId: string, variables: Record<string, unknown>): NodeExecution {
  return {
    id: `trace-${nodeId}`,
    nodeId,
    flowRunId: 'run-1',
    nodeType: 'core.if_else',
    status: NodeExecutionStatus.SUCCESS,
    outputs: {
      nodeType: 'core.if_else',
      data: { variables: variables as never },
    },
    inputs: {},
    createdAt: new Date(),
    startedAt: new Date(),
    retryCount: 0,
  } as unknown as NodeExecution;
}

const mockGraphService = {
  markDownstreamNodesAsSkipped: vi.fn(),
};

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeCoordinator(): FlowRunCoordinator {
  return new FlowRunCoordinator({
    logger: mockLogger,
    flowRunsService: {} as never,
    nodeExecutionCoordinator: {} as never,
    graphService: mockGraphService as never,
    nodeExecutionService: {} as never,
    batchJobsService: {} as never,
    flowsService: {} as never,
    heartbeatIntervalMs: 0,
  });
}

function callHandleBranchSkipping(
  coordinator: FlowRunCoordinator,
  nodeId: string,
  trace: NodeExecution,
  edges: readonly FlowEdge[],
  skippedNodeIds: Set<string>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (coordinator as any).handleBranchSkipping(nodeId, trace, edges, skippedNodeIds);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FlowRunCoordinator.handleBranchSkipping', () => {
  it('does nothing when trace status is not SUCCESS', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    const trace = { ...successTrace('if-1', {}), status: NodeExecutionStatus.FAILED };
    callHandleBranchSkipping(coordinator, 'if-1', trace, [], skipped);
    expect(skipped.size).toBe(0);
    expect(mockGraphService.markDownstreamNodesAsSkipped).not.toHaveBeenCalled();
  });

  it('does nothing when trace has no output variables', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    const trace: NodeExecution = {
      id: 'trace-1',
      nodeId: 'if-1',
      flowRunId: 'run-1',
      nodeType: 'core.if_else',
      status: NodeExecutionStatus.SUCCESS,
      outputs: undefined,
      inputs: {},
      createdAt: new Date(),
      startedAt: new Date(),
      retryCount: 0,
    } as unknown as NodeExecution;
    callHandleBranchSkipping(coordinator, 'if-1', trace, [], skipped);
    expect(skipped.size).toBe(0);
  });

  it('does nothing when there are no outgoing edges with sourceHandle', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    // Edges without sourceHandle → connectedHandles is empty
    const edges = [edge('e1', 'if-1', 'node-B')];
    const trace = successTrace('if-1', { true_output: 'yes' });
    callHandleBranchSkipping(coordinator, 'if-1', trace, edges, skipped);
    expect(skipped.size).toBe(0);
    expect(mockGraphService.markDownstreamNodesAsSkipped).not.toHaveBeenCalled();
  });

  it('skips the target of an inactive handle (false branch)', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    // if-1 has two handles: true_output → node-T, false_output → node-F
    // variables only contains true_output → false_output is inactive
    const edges = [
      edge('e1', 'if-1', 'node-T', 'true_output'),
      edge('e2', 'if-1', 'node-F', 'false_output'),
    ];
    const trace = successTrace('if-1', { true_output: 'yes' }); // false_output absent
    callHandleBranchSkipping(coordinator, 'if-1', trace, edges, skipped);

    expect(skipped.has('node-F')).toBe(true);
    expect(skipped.has('node-T')).toBe(false);
    expect(mockGraphService.markDownstreamNodesAsSkipped).toHaveBeenCalledWith(
      'node-F',
      edges,
      skipped,
      false,
    );
  });

  it('does not skip when both handles are active', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    const edges = [
      edge('e1', 'if-1', 'node-T', 'true_output'),
      edge('e2', 'if-1', 'node-F', 'false_output'),
    ];
    const trace = successTrace('if-1', { true_output: 'yes', false_output: 'no' });
    callHandleBranchSkipping(coordinator, 'if-1', trace, edges, skipped);

    expect(skipped.size).toBe(0);
    expect(mockGraphService.markDownstreamNodesAsSkipped).not.toHaveBeenCalled();
  });

  it('does not skip a target that also has an active-handle edge from the same node', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    // Both handles point to the same target node — if one is active, the target should NOT be skipped
    const edges = [
      edge('e1', 'if-1', 'node-X', 'true_output'),
      edge('e2', 'if-1', 'node-X', 'false_output'),
    ];
    const trace = successTrace('if-1', { true_output: 'yes' }); // false_output absent
    callHandleBranchSkipping(coordinator, 'if-1', trace, edges, skipped);

    expect(skipped.has('node-X')).toBe(false);
  });

  it('does not skip a target with a non-skipped incoming edge from another node', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    // if-1 → node-F (inactive), but external-node → node-F (active, not skipped)
    const edges = [
      edge('e1', 'if-1', 'node-T', 'true_output'),
      edge('e2', 'if-1', 'node-F', 'false_output'),
      edge('e3', 'external-node', 'node-F'), // another incoming edge from non-skipped node
    ];
    const trace = successTrace('if-1', { true_output: 'yes' });
    callHandleBranchSkipping(coordinator, 'if-1', trace, edges, skipped);

    expect(skipped.has('node-F')).toBe(false);
  });

  it('skips multiple inactive-handle targets and propagates via graphService', () => {
    const coordinator = makeCoordinator();
    const skipped = new Set<string>();
    // Switch node with 3 handles; only case_a is active
    const edges = [
      edge('e1', 'switch-1', 'node-A', 'case_a'),
      edge('e2', 'switch-1', 'node-B', 'case_b'),
      edge('e3', 'switch-1', 'node-C', 'case_c'),
    ];
    const trace = successTrace('switch-1', { case_a: 'matched' });
    callHandleBranchSkipping(coordinator, 'switch-1', trace, edges, skipped);

    expect(skipped.has('node-B')).toBe(true);
    expect(skipped.has('node-C')).toBe(true);
    expect(skipped.has('node-A')).toBe(false);
    expect(mockGraphService.markDownstreamNodesAsSkipped).toHaveBeenCalledTimes(2);
  });
});
