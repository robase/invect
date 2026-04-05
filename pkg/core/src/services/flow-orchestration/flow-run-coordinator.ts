import { FlowRunStatus, NodeExecutionStatus } from 'src/types/base';
import { GraphNodeType } from 'src/types.internal';
import { InvectDefinition, FlowNodeDefinitions } from '../flow-versions/schemas-fresh';
import type { FlowRun } from '../flow-runs/flow-runs.model';
import type { FlowRunResult } from '../flow-runs/flow-runs.service';
import type { FlowRunsService } from '../flow-runs/flow-runs.service';
import type { NodeExecution } from '../node-executions/node-executions.model';
import type { NodeExecutionService } from '../node-executions/node-execution.service';
import type { NodeOutput } from 'src/types/node-io-types';
import type { BatchJobsService } from '../batch-jobs/batch-jobs.service';
import type { FlowsService } from '../flows/flows.service';
import type { Logger } from 'src/schemas';
import type { PluginHookRunner } from 'src/types/plugin.types';
import { ValidationError } from 'src/types/common/errors.types';
import { GraphService } from '../graph.service';
import { BatchStatus } from '../ai/base-client';
import { NodeExecutionCoordinator } from './node-execution-coordinator';

type FlowRunCoordinatorDeps = {
  logger: Logger;
  flowRunsService: FlowRunsService;
  nodeExecutionCoordinator: NodeExecutionCoordinator;
  graphService: GraphService;
  nodeExecutionService: NodeExecutionService;
  batchJobsService: BatchJobsService;
  flowsService: FlowsService;
  /** Interval in ms between heartbeat writes. 0 = disabled. */
  heartbeatIntervalMs: number;
  /** Plugin hook runner for lifecycle hooks (optional for backward compat). */
  pluginHookRunner?: PluginHookRunner;
};

/**
 * Coordinates full flow run execution including batch pauses and resumption.
 */
export class FlowRunCoordinator {
  /** Active heartbeat timers keyed by flowRunId */
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly deps: FlowRunCoordinatorDeps) {}

  /**
   * Start a periodic heartbeat for a flow run.
   * The first heartbeat is written immediately.
   */
  private startHeartbeat(flowRunId: string): void {
    const { heartbeatIntervalMs, flowRunsService, logger } = this.deps;
    if (!heartbeatIntervalMs || heartbeatIntervalMs <= 0) {
      return;
    }

    // Write initial heartbeat
    flowRunsService.updateHeartbeat(flowRunId).catch((_err) => {
      // Intentionally swallowed — initial heartbeat failure is non-fatal
    });

    const timer = setInterval(() => {
      flowRunsService.updateHeartbeat(flowRunId).catch((err) => {
        logger.debug('Heartbeat write failed (non-fatal)', { flowRunId, error: String(err) });
      });
    }, heartbeatIntervalMs);

    this.heartbeatTimers.set(flowRunId, timer);
  }

  /** Stop the heartbeat timer for a flow run. */
  private stopHeartbeat(flowRunId: string): void {
    const timer = this.heartbeatTimers.get(flowRunId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(flowRunId);
    }
  }

  /** Stop all active heartbeat timers (used during shutdown). */
  stopAllHeartbeats(): void {
    for (const [_id, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
  }

  async executeFlowDefinition(
    execution: FlowRun,
    definition: InvectDefinition,
    flowInputs: Record<string, unknown>,
    useBatchProcessing?: boolean,
  ): Promise<FlowRunResult> {
    // Allow plugins to mutate inputs via hooks
    let mutableFlowInputs = flowInputs;
    const { logger, nodeExecutionCoordinator } = this.deps;

    logger.debug('Executing flow definition', { flowRunId: execution.id });

    await this.markExecutionRunning(execution.id);

    // ── Plugin hook: beforeFlowRun ─────────────────────────────────────
    if (this.deps.pluginHookRunner) {
      const hookResult = await this.deps.pluginHookRunner.runBeforeFlowRun({
        flowId: execution.flowId,
        flowRunId: execution.id,
        flowVersion: execution.flowVersion,
        inputs: mutableFlowInputs,
      });

      if (hookResult.cancelled) {
        logger.info('Flow run cancelled by plugin hook', {
          flowRunId: execution.id,
          reason: hookResult.reason,
        });
        await this.markExecutionFailed(execution.id, hookResult.reason || 'Cancelled by plugin');
        const traces = await this.deps.nodeExecutionService.listNodeExecutionsByFlowRunId(
          execution.id,
        );
        return {
          flowRunId: execution.id,
          status: FlowRunStatus.FAILED,
          inputs: execution.inputs,
          outputs: {},
          error: hookResult.reason || 'Cancelled by plugin',
          startedAt:
            typeof execution.startedAt === 'string'
              ? new Date(execution.startedAt)
              : execution.startedAt,
          completedAt: new Date(),
          duration: 0,
          traces,
        };
      }

      // Allow plugins to modify inputs
      if (hookResult.inputs) {
        mutableFlowInputs = hookResult.inputs as Record<string, unknown>;
      }
    }

    const { nodes, edges } = definition;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const executionOrder = GraphService.topologicalSort(nodes, edges);

    logger.debug('Flow execution order determined', {
      flowRunId: execution.id,
      nodeCount: nodes.length,
      order: executionOrder,
    });

    const nodeExecutions: NodeExecution[] = [];
    const nodeOutputs = new Map<FlowNodeDefinitions['id'], NodeOutput>();
    const skippedNodeIds = new Set<string>();
    const batchPendingNodeIds = new Set<string>();
    let hasFailure = false;
    let hasBatchSubmission = false;

    for (const nodeId of executionOrder) {
      if (hasFailure || hasBatchSubmission) {
        break;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        logger.warn('Node not found in definition', { flowRunId: execution.id, nodeId });
        continue;
      }

      if (skippedNodeIds.has(nodeId)) {
        logger.debug('Skipping node execution due to conditional branching', {
          flowRunId: execution.id,
          nodeId,
          nodeType: node.type,
        });
        continue;
      }

      // D2: Skip inactive trigger nodes — when a flow is triggered by a specific
      // trigger node (webhook/cron), skip all other trigger nodes and their branches.
      // When activeTriggerNodeId is absent (manual run), all trigger nodes execute.
      const isTriggerNode = node.type.startsWith('trigger.');
      const activeTriggerNodeId = (mutableFlowInputs as Record<string, unknown>).__triggerNodeId as
        | string
        | undefined;

      if (isTriggerNode && activeTriggerNodeId && node.id !== activeTriggerNodeId) {
        skippedNodeIds.add(nodeId);
        this.deps.graphService.markDownstreamNodesAsSkipped(nodeId, edges, skippedNodeIds);
        logger.debug('Skipping inactive trigger node and its branch', {
          flowRunId: execution.id,
          nodeId,
          nodeType: node.type,
          activeTriggerNodeId,
        });
        continue;
      }

      const incomingEdges = edges.filter((edge) => edge.target === nodeId);
      const hasBatchPendingDependencies = incomingEdges.some((edge) =>
        batchPendingNodeIds.has(edge.source),
      );

      if (hasBatchPendingDependencies) {
        logger.debug('Skipping node execution due to batch-pending dependencies', {
          flowRunId: execution.id,
          nodeId,
          nodeType: node.type,
          batchPendingDependencies: incomingEdges
            .filter((edge) => batchPendingNodeIds.has(edge.source))
            .map((e) => e.source),
        });
        continue;
      }

      logger.debug('Node execution check', {
        flowRunId: execution.id,
        nodeId,
        nodeType: node.type,
        isSkipped: skippedNodeIds.has(nodeId),
        skippedNodeIds: Array.from(skippedNodeIds),
        skippedNodeCount: skippedNodeIds.size,
        batchPendingNodeIds: Array.from(batchPendingNodeIds),
      });

      try {
        const nodeInputs = nodeExecutionCoordinator.prepareNodeInputs(
          node,
          nodeOutputs,
          edges,
          nodeMap,
        );

        // Build incoming data object for template resolution
        const incomingData = nodeExecutionCoordinator.buildIncomingDataObject(
          node,
          nodeOutputs,
          edges,
          nodeMap,
        );

        const trace = await nodeExecutionCoordinator.executeNode(
          execution.id,
          node,
          nodeInputs,
          mutableFlowInputs,
          definition,
          skippedNodeIds,
          useBatchProcessing,
          incomingData,
        );
        nodeExecutions.push(trace);

        if (trace.status === NodeExecutionStatus.BATCH_SUBMITTED) {
          logger.debug('Batch submission detected - pausing flow', {
            flowRunId: execution.id,
            nodeId: trace.nodeId,
          });

          batchPendingNodeIds.add(nodeId);
          hasBatchSubmission = true;

          await this.pauseFlowForBatch(execution.id);
          return this.buildPausedFlowResult(execution.id, nodeExecutions);
        }

        if (trace.status === NodeExecutionStatus.SUCCESS) {
          if (trace.outputs) {
            nodeOutputs.set(nodeId, trace.outputs);
          }
        } else if (trace.status === NodeExecutionStatus.FAILED) {
          hasFailure = true;
          logger.warn('Node execution failed, stopping flow', {
            flowRunId: execution.id,
            nodeId,
            error: trace.error,
          });
          break;
        }
      } catch (error) {
        logger.error('Unexpected error during node execution', {
          flowRunId: execution.id,
          nodeId,
          error,
        });
        hasFailure = true;
        break;
      }
    }

    const success = !hasFailure;
    const finalOutputs = this.collectFlowOutputs(definition, nodeOutputs);

    if (success) {
      await this.markExecutionSuccess(execution.id, finalOutputs);
    } else {
      await this.markExecutionFailed(execution.id, 'One or more nodes failed');
    }

    const updatedExecution = await this.deps.flowRunsService.getRunById(execution.id);

    // ── Plugin hook: afterFlowRun ──────────────────────────────────────
    if (this.deps.pluginHookRunner) {
      try {
        await this.deps.pluginHookRunner.runAfterFlowRun({
          flowId: execution.flowId,
          flowRunId: execution.id,
          flowVersion: execution.flowVersion,
          inputs: mutableFlowInputs,
          status: success ? 'SUCCESS' : 'FAILED',
          outputs: finalOutputs as Record<string, unknown>,
          error: success ? undefined : 'One or more nodes failed',
          duration: updatedExecution.duration ?? undefined,
        });
      } catch (hookError) {
        // afterFlowRun hooks must not crash the flow result
        logger.warn('afterFlowRun plugin hook error (non-fatal)', {
          flowRunId: execution.id,
          error: hookError instanceof Error ? hookError.message : String(hookError),
        });
      }
    }

    return {
      flowRunId: execution.id,
      status: success ? FlowRunStatus.SUCCESS : FlowRunStatus.FAILED,
      inputs: execution.inputs,
      outputs: finalOutputs,
      startedAt:
        typeof updatedExecution.startedAt === 'string'
          ? new Date(updatedExecution.startedAt)
          : updatedExecution.startedAt,
      completedAt: updatedExecution.completedAt
        ? typeof updatedExecution.completedAt === 'string'
          ? new Date(updatedExecution.completedAt)
          : updatedExecution.completedAt
        : undefined,
      duration: updatedExecution.duration,
      traces: nodeExecutions,
    };
  }

  async resumeFromBatchCompletion(
    flowRunId: string,
    completedBatchNodeId: string,
    batchResult?: unknown,
    batchError?: string,
  ): Promise<FlowRunResult> {
    const { logger, nodeExecutionService, flowRunsService, flowsService } = this.deps;

    logger.debug('Resuming flow from batch completion', {
      flowRunId,
      completedBatchNodeId,
      hasError: !!batchError,
    });

    if (batchError) {
      await this.markExecutionFailed(flowRunId, `Batch processing failed: ${batchError}`);

      const traces = await nodeExecutionService.listNodeExecutionsByFlowRunId(flowRunId);
      return {
        flowRunId,
        status: FlowRunStatus.FAILED,
        inputs: {},
        outputs: {},
        error: `Batch processing failed: ${batchError}`,
        startedAt: new Date(),
        traces,
      };
    }

    const flowRun = await flowRunsService.getRunById(flowRunId);
    const flow = await flowsService.getFlowById(flowRun.flowId);

    if (!flow?.flowVersion?.invectDefinition) {
      throw new ValidationError('Flow definition not found for batch resume');
    }

    const definition = flow.flowVersion.invectDefinition as InvectDefinition;

    await flowRunsService.updateRunStatus(flowRunId, FlowRunStatus.RUNNING);

    return this.continueFlowRunFromBatch(flowRunId, definition, flowRun.inputs || {});
  }

  async continueFlowRunFromBatch(
    flowRunId: string,
    definition: InvectDefinition,
    flowInputs: Record<string, unknown>,
  ): Promise<FlowRunResult> {
    const {
      logger,
      nodeExecutionCoordinator,
      nodeExecutionService,
      batchJobsService,
      flowRunsService,
    } = this.deps;

    const { nodes, edges } = definition;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const executionOrder = GraphService.topologicalSort(nodes, edges);

    const existingNodeExecutions =
      await nodeExecutionService.listNodeExecutionsByFlowRunId(flowRunId);
    const processedNodeIds = new Set(existingNodeExecutions.map((trace) => trace.nodeId));

    const nodeOutputs = new Map<FlowNodeDefinitions['id'], NodeOutput>();
    const skippedNodeIds = new Set<string>();
    let hasFailure = false;

    for (const nodeExecution of existingNodeExecutions) {
      if (nodeExecution.status === NodeExecutionStatus.SUCCESS && nodeExecution.outputs) {
        nodeOutputs.set(nodeExecution.nodeId, nodeExecution.outputs);
      } else if (nodeExecution.status === NodeExecutionStatus.SKIPPED) {
        skippedNodeIds.add(nodeExecution.nodeId);
      } else if (nodeExecution.status === NodeExecutionStatus.BATCH_SUBMITTED) {
        const batchJobs = await batchJobsService.getBatchJobsByExecutionAndNode(
          flowRunId,
          nodeExecution.nodeId,
        );

        for (const batchJob of batchJobs) {
          if (batchJob.status === BatchStatus.COMPLETED && batchJob.responseData) {
            const batchResult = batchJob.responseData[0];

            if (batchResult.status === BatchStatus.COMPLETED) {
              const updatedTrace = await nodeExecutionService.updateNodeExecutionStatus(
                nodeExecution.id,
                NodeExecutionStatus.SUCCESS,
                {
                  outputs: {
                    data: {
                      variables: {
                        // batchResult.content is already a PromptResult (discriminated union)
                        output: batchResult.content,
                      },
                    },
                    nodeType: GraphNodeType.MODEL,
                  },
                },
              );

              if (updatedTrace.outputs) {
                nodeOutputs.set(nodeExecution.nodeId, updatedTrace.outputs);
              }
            } else if (batchResult.status === BatchStatus.FAILED) {
              await nodeExecutionService.updateNodeExecutionStatus(
                nodeExecution.id,
                NodeExecutionStatus.FAILED,
                {
                  error: batchResult.error || 'Batch processing failed',
                },
              );

              hasFailure = true;
              break;
            } else if (batchResult.status === BatchStatus.CANCELLED) {
              await nodeExecutionService.updateNodeExecutionStatus(
                nodeExecution.id,
                NodeExecutionStatus.FAILED,
                {
                  error: batchResult.error || 'Batch processing was cancelled',
                },
              );

              hasFailure = true;
              break;
            } else if (
              batchResult.status === BatchStatus.SUBMITTED ||
              batchResult.status === BatchStatus.PROCESSING
            ) {
              continue;
            } else {
              await nodeExecutionService.updateNodeExecutionStatus(
                nodeExecution.id,
                NodeExecutionStatus.FAILED,
                {
                  error: `Unknown batch status: ${batchResult.status}`,
                },
              );

              hasFailure = true;
              break;
            }
          }
        }
      }
    }

    const remainingNodes = executionOrder.filter(
      (nodeId) => !processedNodeIds.has(nodeId) && !skippedNodeIds.has(nodeId),
    );

    logger.debug('Continuing execution after batch', {
      flowRunId,
      totalNodes: nodes.length,
      processedNodes: processedNodeIds.size,
      remainingNodes: remainingNodes.length,
    });

    const newTraces: NodeExecution[] = [];

    for (const nodeId of remainingNodes) {
      if (hasFailure) {
        break;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      const nodeInputs = nodeExecutionCoordinator.prepareNodeInputs(
        node,
        nodeOutputs,
        edges,
        nodeMap,
      );

      // Build incoming data object for template resolution
      const incomingData = nodeExecutionCoordinator.buildIncomingDataObject(
        node,
        nodeOutputs,
        edges,
        nodeMap,
      );

      try {
        const trace = await nodeExecutionCoordinator.executeNode(
          flowRunId,
          node,
          nodeInputs,
          flowInputs,
          definition,
          skippedNodeIds,
          true,
          incomingData,
        );

        newTraces.push(trace);

        if (trace.status === NodeExecutionStatus.SUCCESS && trace.outputs) {
          nodeOutputs.set(nodeId, trace.outputs);
        } else if (trace.status === NodeExecutionStatus.FAILED) {
          hasFailure = true;
        }

        if (trace.status === NodeExecutionStatus.BATCH_SUBMITTED) {
          await this.pauseFlowForBatch(flowRunId);
          return this.buildPausedFlowResult(flowRunId, [...existingNodeExecutions, ...newTraces]);
        }
      } catch (error) {
        hasFailure = true;
        logger.error('Node execution failed during batch resume', {
          flowRunId,
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const finalOutputs = this.collectFlowOutputs(definition, nodeOutputs);

    if (hasFailure) {
      await this.markExecutionFailed(flowRunId, 'One or more nodes failed during batch resume');
    } else {
      await this.markExecutionSuccess(flowRunId, finalOutputs);
    }

    const updatedExecution = await flowRunsService.getRunById(flowRunId);
    const allTraces = await nodeExecutionService.listNodeExecutionsByFlowRunId(flowRunId);

    return {
      flowRunId,
      status: hasFailure ? FlowRunStatus.FAILED : FlowRunStatus.SUCCESS,
      inputs: updatedExecution.inputs,
      outputs: finalOutputs,
      startedAt:
        typeof updatedExecution.startedAt === 'string'
          ? new Date(updatedExecution.startedAt)
          : updatedExecution.startedAt,
      completedAt: updatedExecution.completedAt
        ? typeof updatedExecution.completedAt === 'string'
          ? new Date(updatedExecution.completedAt)
          : updatedExecution.completedAt
        : undefined,
      duration: updatedExecution.duration,
      traces: allTraces,
    };
  }

  private collectFlowOutputs(
    _definition: InvectDefinition,
    nodeOutputs: Map<string, NodeOutput | undefined>,
  ): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};
    for (const [nodeId, nodeOutput] of nodeOutputs) {
      outputs[nodeId] = nodeOutput;
    }
    return outputs;
  }

  private async pauseFlowForBatch(flowRunId: string): Promise<void> {
    const { logger, flowRunsService } = this.deps;
    this.stopHeartbeat(flowRunId);
    logger.debug('Pausing flow for batch processing', { flowRunId });
    await flowRunsService.updateRunStatus(flowRunId, FlowRunStatus.PAUSED_FOR_BATCH);
    logger.debug('Flow paused for batch processing', { flowRunId });
  }

  private async buildPausedFlowResult(
    flowRunId: string,
    traces: NodeExecution[],
  ): Promise<FlowRunResult> {
    const execution = await this.deps.flowRunsService.getRunById(flowRunId);

    return {
      flowRunId: execution.id,
      status: FlowRunStatus.PAUSED_FOR_BATCH,
      inputs: execution.inputs,
      outputs: {},
      startedAt:
        typeof execution.startedAt === 'string'
          ? new Date(execution.startedAt)
          : execution.startedAt,
      traces,
    };
  }

  private async markExecutionRunning(flowRunId: string): Promise<void> {
    const { logger, flowRunsService } = this.deps;
    logger.debug('Marking execution as running', { flowRunId });
    await flowRunsService.updateRunStatus(flowRunId, FlowRunStatus.RUNNING);
    this.startHeartbeat(flowRunId);
  }

  private async markExecutionSuccess(
    flowRunId: string,
    outputs: Record<string, unknown>,
  ): Promise<void> {
    const { logger, flowRunsService } = this.deps;
    this.stopHeartbeat(flowRunId);
    logger.debug('Marking execution as successful', { flowRunId });
    await flowRunsService.updateRunStatus(flowRunId, FlowRunStatus.SUCCESS, { outputs });
  }

  private async markExecutionFailed(flowRunId: string, error: string): Promise<void> {
    const { logger, flowRunsService } = this.deps;
    this.stopHeartbeat(flowRunId);
    logger.debug('Marking execution as failed', { flowRunId, error });
    await flowRunsService.updateRunStatus(flowRunId, FlowRunStatus.FAILED, { error });
  }

  /**
   * Execute a flow up to and including a specific target node.
   * Only executes the upstream nodes required to produce output for the target node.
   *
   * @param execution - The flow run record
   * @param definition - The flow definition
   * @param targetNodeId - The node to execute up to (this node will also be executed)
   * @param flowInputs - Flow-level inputs
   * @param useBatchProcessing - Whether to use batch processing for AI nodes
   */
  async executeFlowToNode(
    execution: FlowRun,
    definition: InvectDefinition,
    targetNodeId: string,
    flowInputs: Record<string, unknown>,
    useBatchProcessing?: boolean,
  ): Promise<FlowRunResult> {
    const { logger, nodeExecutionCoordinator, graphService } = this.deps;

    logger.debug('Executing flow to specific node', {
      flowRunId: execution.id,
      targetNodeId,
    });

    await this.markExecutionRunning(execution.id);

    const { nodes, edges } = definition;
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    // Verify target node exists
    const targetNode = nodeMap.get(targetNodeId);
    if (!targetNode) {
      throw new ValidationError(`Target node not found: ${targetNodeId}`);
    }

    // Get only the nodes needed to execute to the target
    const executionPath = graphService.getExecutionPathToNode(targetNodeId, nodes, edges);

    logger.debug('Flow execution path to target node', {
      flowRunId: execution.id,
      targetNodeId,
      executionPath,
      totalNodes: nodes.length,
      nodesToExecute: executionPath.length,
    });

    const nodeExecutions: NodeExecution[] = [];
    const nodeOutputs = new Map<FlowNodeDefinitions['id'], NodeOutput>();
    const nodeErrors: Record<string, string> = {};
    const skippedNodeIds = new Set<string>();
    const batchPendingNodeIds = new Set<string>();
    let hasFailure = false;
    let hasBatchSubmission = false;

    for (const nodeId of executionPath) {
      if (hasFailure || hasBatchSubmission) {
        break;
      }

      const node = nodeMap.get(nodeId);
      if (!node) {
        logger.warn('Node not found in definition', { flowRunId: execution.id, nodeId });
        continue;
      }

      if (skippedNodeIds.has(nodeId)) {
        logger.debug('Skipping node execution due to conditional branching', {
          flowRunId: execution.id,
          nodeId,
          nodeType: node.type,
        });
        continue;
      }

      logger.debug('Processing node in partial execution', {
        flowRunId: execution.id,
        nodeId,
        nodeType: node.type,
        isTargetNode: nodeId === targetNodeId,
      });

      try {
        const nodeInputs = nodeExecutionCoordinator.prepareNodeInputs(
          node,
          nodeOutputs,
          edges,
          nodeMap,
        );

        // Build incoming data object for template resolution
        const incomingData = nodeExecutionCoordinator.buildIncomingDataObject(
          node,
          nodeOutputs,
          edges,
          nodeMap,
        );

        const trace = await nodeExecutionCoordinator.executeNode(
          execution.id,
          node,
          nodeInputs,
          flowInputs,
          definition,
          skippedNodeIds,
          useBatchProcessing,
          incomingData,
        );
        nodeExecutions.push(trace);

        if (trace.status === NodeExecutionStatus.BATCH_SUBMITTED) {
          logger.debug('Batch submission detected - pausing partial flow', {
            flowRunId: execution.id,
            nodeId: trace.nodeId,
          });

          batchPendingNodeIds.add(nodeId);
          hasBatchSubmission = true;

          await this.pauseFlowForBatch(execution.id);
          return this.buildPausedFlowResult(execution.id, nodeExecutions);
        }

        if (trace.status === NodeExecutionStatus.SUCCESS) {
          if (trace.outputs) {
            nodeOutputs.set(nodeId, trace.outputs);
          }
        } else if (trace.status === NodeExecutionStatus.FAILED) {
          hasFailure = true;
          nodeErrors[nodeId] = trace.error || 'Node execution failed';
          logger.error('Node execution failed in partial execution', {
            flowRunId: execution.id,
            nodeId,
            nodeType: node.type,
          });
        }

        // Handle if-else node conditional branching
        if (node.type === GraphNodeType.IF_ELSE && trace.status === NodeExecutionStatus.SUCCESS) {
          const outputs = trace.outputs?.data?.variables;
          const executedBranch = (outputs as Record<string, { value: unknown }>)?.executedBranch
            ?.value;

          if (executedBranch && typeof executedBranch === 'string') {
            const allBranches = ['true_branch', 'false_branch'];
            const nonExecutedBranches = allBranches.filter((b) => b !== executedBranch);

            for (const branch of nonExecutedBranches) {
              const branchEdges = edges.filter(
                (e) => e.source === nodeId && e.sourceHandle === branch,
              );

              for (const edge of branchEdges) {
                graphService.markDownstreamNodesAsSkipped(edge.target, edges, skippedNodeIds, true);
              }
            }
          }
        }
      } catch (error) {
        hasFailure = true;
        nodeErrors[nodeId] = error instanceof Error ? error.message : String(error);
        logger.error('Node execution threw an exception in partial execution', {
          flowRunId: execution.id,
          nodeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const success = !hasFailure;

    // For partial execution, include outputs for all executed nodes
    const finalOutputs: Record<string, unknown> = {};
    for (const [executedNodeId, output] of nodeOutputs.entries()) {
      finalOutputs[executedNodeId] = output;
    }

    if (success) {
      await this.markExecutionSuccess(execution.id, finalOutputs);
    } else {
      await this.markExecutionFailed(execution.id, 'One or more nodes failed');
    }

    const updatedExecution = await this.deps.flowRunsService.getRunById(execution.id);

    return {
      flowRunId: execution.id,
      status: success ? FlowRunStatus.SUCCESS : FlowRunStatus.FAILED,
      inputs: execution.inputs,
      outputs: finalOutputs,
      nodeErrors: Object.keys(nodeErrors).length > 0 ? nodeErrors : undefined,
      startedAt:
        typeof updatedExecution.startedAt === 'string'
          ? new Date(updatedExecution.startedAt)
          : updatedExecution.startedAt,
      completedAt: updatedExecution.completedAt
        ? typeof updatedExecution.completedAt === 'string'
          ? new Date(updatedExecution.completedAt)
          : updatedExecution.completedAt
        : undefined,
      duration: updatedExecution.duration,
      traces: nodeExecutions,
    };
  }
}
