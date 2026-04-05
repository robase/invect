import type { FlowRunsService } from './flow-runs/flow-runs.service';
import type { NodeExecutionService } from './node-executions/node-execution.service';
import type { FlowsService } from './flows/flows.service';
import type { CredentialsService } from './credentials/credentials.service';
import type { JsExpressionService } from './templating/js-expression.service';
import type { TemplateService } from './templating/template.service';
import type { BatchJobsService } from './batch-jobs/batch-jobs.service';
import { FlowRunResult } from './flow-runs/flow-runs.service';
import { Logger } from 'src/schemas';
import { DatabaseError, ValidationError } from 'src/types/common/errors.types';
import { FlowRunStatus } from 'src/types/base';
import { FlowRun } from './flow-runs/flow-runs.model';
import { Flow } from './flows/flows.model';
import { InvectDefinition } from './flow-versions/schemas-fresh';
import { NodeExecutorRegistry } from 'src/nodes/executor-registry';
import { NodeDataService } from './node-data.service';
import { GraphService } from './graph.service';
import { FlowVersion } from 'src/database';
import { BaseAIClient, BatchStatus } from './ai/base-client';
import { NodeExecutionCoordinator } from './flow-orchestration/node-execution-coordinator';
import { FlowRunCoordinator } from './flow-orchestration/flow-run-coordinator';
import type { PluginHookRunner } from 'src/types/plugin.types';

/**
 * Core Flow Orchestration Service implementation
 * Manages the complete flow execution lifecycle using service layer abstractions
 */
export class FlowOrchestrationService {
  private initialized: boolean = false;
  private batchPollingInterval?: NodeJS.Timeout;
  private staleRunCheckInterval?: NodeJS.Timeout;
  private isPollingActive: boolean = false;
  private readonly nodeExecutionCoordinator: NodeExecutionCoordinator;
  private readonly flowRunCoordinator: FlowRunCoordinator;
  private readonly flowTimeoutMs: number;
  private readonly staleRunCheckIntervalMs: number;

  constructor(
    private readonly logger: Logger,
    private readonly flowRunsService: FlowRunsService,
    private readonly nodeExecutionService: NodeExecutionService,
    private readonly flowsService: FlowsService,
    private readonly nodeDataService: NodeDataService,
    private readonly graphService: GraphService,
    private readonly nodeRegistry: NodeExecutorRegistry,
    private readonly batchJobsService: BatchJobsService,
    private readonly credentialsService?: CredentialsService, // Optional for now to avoid breaking changes
    private readonly baseAIClient?: BaseAIClient,
    private readonly nodeExecutionServiceForTools?: NodeExecutionService,
    executionConfig?: {
      heartbeatIntervalMs?: number;
      flowTimeoutMs?: number;
      staleRunCheckIntervalMs?: number;
    },
    private readonly pluginHookRunner?: PluginHookRunner,
    private readonly jsExpressionService?: JsExpressionService,
    private readonly templateService?: TemplateService,
  ) {
    if (!baseAIClient) {
      throw new Error('BaseAIClient is required for FlowOrchestrationService');
    }

    this.flowTimeoutMs = executionConfig?.flowTimeoutMs ?? 600_000; // 10 min default
    this.staleRunCheckIntervalMs = executionConfig?.staleRunCheckIntervalMs ?? 60_000; // 1 min default

    this.nodeExecutionCoordinator = new NodeExecutionCoordinator({
      logger,
      nodeExecutionService,
      nodeRegistry,
      nodeDataService,
      graphService,
      credentialsService,
      nodeExecutionServiceForTools: nodeExecutionServiceForTools ?? nodeExecutionService,
      templateService,
      jsExpressionService,
      baseAIClient,
      pluginHookRunner,
    });

    this.flowRunCoordinator = new FlowRunCoordinator({
      logger,
      flowRunsService,
      nodeExecutionCoordinator: this.nodeExecutionCoordinator,
      graphService,
      nodeExecutionService,
      batchJobsService,
      flowsService,
      heartbeatIntervalMs: executionConfig?.heartbeatIntervalMs ?? 30_000,
      pluginHookRunner,
    });
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Flow orchestration service already initialized');
      return;
    }

    this.logger.debug('Initializing flow orchestration service');

    try {
      // Ensure dependent services are initialized
      await this.flowsService.initialize();
      await this.flowRunsService.initialize();
      await this.nodeExecutionService.initialize();
      await this.batchJobsService.initialize();

      // Startup recovery: fail any flow runs that were RUNNING/PENDING when
      // the server previously stopped.  Their heartbeats will be stale.
      await this.recoverStaleRuns();

      // Start flow resumption polling for completed batches
      await this.startFlowResumptionPolling();

      // Start periodic stale-run detector
      this.startStaleRunDetector();

      this.initialized = true;
      this.logger.info('Flow orchestration service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize flow orchestration service', { error });
      throw new DatabaseError('Failed to initialize flow orchestration service', { error });
    }
  }

  // ─── Stale run detection ──────────────────────────────────────────────

  /**
   * Startup recovery: mark all RUNNING/PENDING runs with stale heartbeats as FAILED.
   * This handles flows that were mid-execution when the server last stopped.
   */
  private async recoverStaleRuns(): Promise<void> {
    try {
      const failedCount = await this.flowRunsService.failStaleRuns(this.flowTimeoutMs);
      if (failedCount > 0) {
        this.logger.warn(`Startup recovery: marked ${failedCount} stale flow run(s) as FAILED`);
      }
    } catch (error) {
      this.logger.error('Failed to recover stale runs on startup', { error });
      // Non-fatal — don't block initialization
    }
  }

  /**
   * Start a periodic check for stale flow runs.
   * Runs at the configured `staleRunCheckIntervalMs`.
   */
  private startStaleRunDetector(): void {
    if (this.staleRunCheckInterval) {
      return;
    }

    this.logger.info('Starting stale run detector', {
      flowTimeoutMs: this.flowTimeoutMs,
      checkIntervalMs: this.staleRunCheckIntervalMs,
    });

    this.staleRunCheckInterval = setInterval(async () => {
      try {
        const failedCount = await this.flowRunsService.failStaleRuns(this.flowTimeoutMs);
        if (failedCount > 0) {
          this.logger.warn(`Stale run detector: marked ${failedCount} run(s) as FAILED`);
        }
      } catch (error) {
        this.logger.error('Error in stale run detector', { error });
      }
    }, this.staleRunCheckIntervalMs);
  }

  /**
   * Stop the periodic stale run detector.
   */
  private stopStaleRunDetector(): void {
    if (this.staleRunCheckInterval) {
      clearInterval(this.staleRunCheckInterval);
      this.staleRunCheckInterval = undefined;
    }
  }

  /**
   * Execute a flow by ID with inputs and options
   */
  async executeFlow(
    flowId: string,
    inputs: Record<string, unknown> = {},
    options?: { version?: number | 'latest'; initiatedBy?: string; useBatchProcessing?: boolean },
  ): Promise<FlowRunResult> {
    this.logger.info('Starting flow execution', { flowId, inputs });

    try {
      // Get the flow using the injected FlowsService
      this.logger.debug('Getting flow', { flowId, options });

      const flow = await this.flowsService.getFlowById(flowId, {
        flowVersion: { version: options?.version || 'latest' },
      });
      if (!flow) {
        throw new ValidationError(`No flow found with ID: ${flowId}`);
      }

      this.logger.debug('Flow version found', {
        flowId,
        version: flow.flowVersion,
      });

      // Execute the flow - flow run will be created in initiateFlowRun
      const flowResult = await this.initiateFlowRun(
        flow,
        inputs,
        options?.initiatedBy,
        options?.useBatchProcessing,
      );

      return flowResult;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Failed to execute flow', {
        flowId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new DatabaseError('Failed to execute flow', { error });
    }
  }

  /**
   * Start a flow execution asynchronously - returns immediately with flow run ID.
   * The flow executes in the background.
   */
  async executeFlowAsync(
    flowId: string,
    inputs: Record<string, unknown> = {},
    options?: {
      version?: number | 'latest';
      initiatedBy?: string;
      useBatchProcessing?: boolean;
      // Trigger provenance (populated when started via webhook/cron)
      triggerType?: string;
      triggerId?: string;
      triggerNodeId?: string;
      triggerData?: Record<string, unknown>;
    },
  ): Promise<FlowRunResult> {
    this.logger.info('Starting async flow execution', { flowId, inputs });

    try {
      // Get the flow using the injected FlowsService
      const flow = await this.flowsService.getFlowById(flowId, {
        flowVersion: { version: options?.version || 'latest' },
      });
      if (!flow) {
        throw new ValidationError(`No flow found with ID: ${flowId}`);
      }

      // Validate flow definition exists
      if (!flow.flowVersion.invectDefinition) {
        throw new ValidationError('Flow version does not contain a valid flow definition');
      }

      // Create execution record immediately
      const execution = await this.flowRunsService.createFlowRun({
        flowId: flow.id,
        flowVersion: flow.flowVersion.version,
        inputs,
        createdBy: options?.initiatedBy,
        triggerType: options?.triggerType,
        triggerId: options?.triggerId,
        triggerNodeId: options?.triggerNodeId,
        triggerData: options?.triggerData,
      });

      this.logger.info('Created execution record for async execution', {
        flowRunId: execution.id,
        flowId: flow.id,
      });

      // Start execution in background (fire and forget)
      const typedDefinition = flow.flowVersion.invectDefinition as InvectDefinition;

      // Inject trigger context into flowInputs if present (see D1 in FLOW-TRIGGERS-PLAN.md)
      // Trigger actions read from context.flowInputs.__triggerData at runtime.
      const augmentedInputs: Record<string, unknown> = {
        ...execution.inputs,
        ...(execution.triggerData
          ? {
              __triggerData: execution.triggerData,
              __triggerNodeId: execution.triggerNodeId,
            }
          : {}),
      };

      this.flowRunCoordinator
        .executeFlowDefinition(
          execution,
          typedDefinition,
          augmentedInputs,
          options?.useBatchProcessing,
        )
        .then((result) => {
          this.logger.info('Async flow execution completed', {
            flowRunId: execution.id,
            status: result.status,
          });
        })
        .catch(async (error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('Async flow execution failed', {
            flowRunId: execution.id,
            error: errorMessage,
          });
          // Mark as failed
          await this.flowRunsService.updateRunStatus(execution.id, FlowRunStatus.FAILED, {
            error: errorMessage,
          });
        });

      // Return immediately with PENDING status
      return {
        flowRunId: execution.id,
        status: FlowRunStatus.PENDING,
        inputs: execution.inputs,
        outputs: {},
        startedAt:
          typeof execution.startedAt === 'string'
            ? new Date(execution.startedAt)
            : execution.startedAt,
        traces: [],
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Failed to start async flow execution', {
        flowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to start flow execution', { error });
    }
  }

  /**
   * Execute a complete flow (synchronous - waits for completion)
   */
  async initiateFlowRun(
    flow: Flow & {
      flowVersion: FlowVersion;
    },
    inputs: Record<string, unknown> = {},
    initiatedBy?: string,
    useBatchProcessing?: boolean,
  ): Promise<FlowRunResult> {
    this.logger.info('Starting flow orchestration', {
      flowId: flow.id,
      flowVersion: flow.flowVersion.version,
    });

    // Validate flow and version
    if (!flow.flowVersion.invectDefinition) {
      const error = 'Flow version does not contain a valid flow definition';
      this.logger.error(error, {
        flowId: flow.id,
        flowVersion: flow.flowVersion.version,
      });
      throw new ValidationError(error);
    }

    let execution: FlowRun | undefined;
    let finalExecutionResult: FlowRunResult;

    try {
      // Create execution record using FlowRunsService
      execution = await this.flowRunsService.createFlowRun({
        flowId: flow.id,
        flowVersion: flow.flowVersion.version,
        inputs,
        createdBy: initiatedBy,
      });

      this.logger.info('Created execution record', {
        flowRunId: execution.id,
        flowId: flow.id,
      });

      // Execute the flow definition - cast runtime type to inferred type
      const typedDefinition = flow.flowVersion.invectDefinition as InvectDefinition;
      finalExecutionResult = await this.flowRunCoordinator.executeFlowDefinition(
        execution,
        typedDefinition,
        execution.inputs,
        useBatchProcessing,
      );

      this.logger.info('Flow execution completed', {
        flowRunId: execution.id,
        status: finalExecutionResult.status,
      });

      return finalExecutionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Flow execution failed', {
        flowRunId: execution?.id,
        flowId: flow.id,
        error: errorMessage,
      });

      // If we have an execution record, mark it as failed
      if (execution) {
        await this.flowRunsService.updateRunStatus(execution.id, FlowRunStatus.FAILED, {
          error: errorMessage,
        });

        // Get traces for the failed execution
        const traces = await this.nodeExecutionService.listNodeExecutionsByFlowRunId(execution.id);

        // Build failed result with available data
        finalExecutionResult = {
          flowRunId: execution.id,
          status: FlowRunStatus.FAILED,
          inputs: execution.inputs,
          outputs: {},
          error: errorMessage,
          startedAt:
            typeof execution.startedAt === 'string'
              ? new Date(execution.startedAt)
              : execution.startedAt,
          completedAt: new Date(),
          duration: execution.duration || 0,
          traces,
        };

        return finalExecutionResult;
      }

      // Re-throw error if we couldn't create execution record
      throw new DatabaseError('Failed to orchestrate flow execution', { error, flowId: flow.id });
    }
  }

  /**
   * Execute a flow definition
   */

  /**
   * Execute a flow up to a specific target node.
   * Only executes the upstream nodes required to produce output for the target node.
   */
  async executeFlowToNode(
    flowId: string,
    targetNodeId: string,
    inputs: Record<string, unknown> = {},
    options?: { version?: number | 'latest'; initiatedBy?: string; useBatchProcessing?: boolean },
  ): Promise<FlowRunResult> {
    this.logger.info('Starting partial flow execution to node', { flowId, targetNodeId, inputs });

    try {
      // Get the flow using the injected FlowsService
      const flow = await this.flowsService.getFlowById(flowId, {
        flowVersion: { version: options?.version || 'latest' },
      });
      if (!flow) {
        throw new ValidationError(`No flow found with ID: ${flowId}`);
      }

      // Validate flow and version
      if (!flow.flowVersion.invectDefinition) {
        throw new ValidationError('Flow version does not contain a valid flow definition');
      }

      const definition = flow.flowVersion.invectDefinition as InvectDefinition;

      // Verify target node exists in the definition
      const targetNode = definition.nodes.find((n) => n.id === targetNodeId);
      if (!targetNode) {
        throw new ValidationError(`Target node not found in flow: ${targetNodeId}`);
      }

      // Create execution record
      const execution = await this.flowRunsService.createFlowRun({
        flowId: flow.id,
        flowVersion: flow.flowVersion.version,
        inputs,
        createdBy: options?.initiatedBy,
      });

      this.logger.info('Created execution record for partial flow', {
        flowRunId: execution.id,
        flowId: flow.id,
        targetNodeId,
      });

      // Execute the flow to the target node
      const result = await this.flowRunCoordinator.executeFlowToNode(
        execution,
        definition,
        targetNodeId,
        execution.inputs,
        options?.useBatchProcessing,
      );

      this.logger.info('Partial flow execution completed', {
        flowRunId: execution.id,
        targetNodeId,
        status: result.status,
      });

      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      this.logger.error('Failed to execute partial flow', {
        flowId,
        targetNodeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError('Failed to execute partial flow', { error });
    }
  }

  /**
   * Resume flow execution after batch completion
   */
  async resumeFromBatchCompletion(
    flowRunId: string,
    completedBatchNodeId: string,
    batchResult?: unknown,
    batchError?: string,
  ): Promise<FlowRunResult> {
    return this.flowRunCoordinator.resumeFromBatchCompletion(
      flowRunId,
      completedBatchNodeId,
      batchResult,
      batchError,
    );
  }

  /**
   * Continue flow execution after batch completion
   */
  async continueFlowRunFromBatch(
    flowRunId: string,
    definition: InvectDefinition,
    flowInputs: Record<string, unknown> = {},
  ): Promise<FlowRunResult> {
    return this.flowRunCoordinator.continueFlowRunFromBatch(flowRunId, definition, flowInputs);
  }

  /**
   * Get execution with traces
   */
  async getExecutionWithTraces(flowRunId: string): Promise<FlowRunResult | null> {
    try {
      const execution = await this.flowRunsService.getRunById(flowRunId);

      const traces = await this.nodeExecutionService.listNodeExecutionsByFlowRunId(flowRunId);

      return {
        flowRunId: execution.id,
        status: execution.status,
        inputs: execution.inputs,
        outputs: execution.outputs || {},
        error: execution.error,
        startedAt:
          typeof execution.startedAt === 'string'
            ? new Date(execution.startedAt)
            : execution.startedAt,
        completedAt: execution.completedAt
          ? typeof execution.completedAt === 'string'
            ? new Date(execution.completedAt)
            : execution.completedAt
          : undefined,
        duration: execution.duration,
        traces,
      };
    } catch (error) {
      this.logger.error('Failed to get execution with traces', { flowRunId, error });
      throw new DatabaseError('Failed to get execution with traces', { error });
    }
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(flowRunId: string): Promise<void> {
    try {
      const execution = await this.flowRunsService.getRunById(flowRunId);

      if (execution.status !== 'RUNNING' && execution.status !== 'PENDING') {
        throw new DatabaseError(`Cannot cancel execution in ${execution.status} state`);
      }

      await this.flowRunsService.updateRunStatus(flowRunId, 'CANCELLED' as FlowRunStatus);

      this.logger.info('Execution cancelled', { flowRunId });
    } catch (error) {
      this.logger.error('Failed to cancel execution', { flowRunId, error });
      throw error;
    }
  }

  /**
   * Start polling for completed batch jobs to resume flows
   */
  async startFlowResumptionPolling(intervalMs: number = 30000): Promise<void> {
    if (this.isPollingActive) {
      this.logger.debug('Flow resumption polling is already active');
      return;
    }

    this.logger.info('Starting flow resumption polling', { intervalMs });
    this.isPollingActive = true;

    const pollOnce = async () => {
      if (!this.isPollingActive) {
        return;
      }

      try {
        await this.pollForCompletedBatches();
      } catch (error) {
        this.logger.error('Error during flow resumption polling', { error });
      }
    };

    // Run initial poll
    await pollOnce();

    // Set up recurring polling
    this.batchPollingInterval = setInterval(pollOnce, intervalMs);
  }

  /**
   * Stop polling for completed batch jobs
   */
  async stopFlowResumptionPolling(): Promise<void> {
    if (!this.isPollingActive) {
      this.logger.debug('Flow resumption polling is not active');
      return;
    }

    this.logger.info('Stopping flow resumption polling');
    this.isPollingActive = false;

    if (this.batchPollingInterval) {
      clearInterval(this.batchPollingInterval);
      this.batchPollingInterval = undefined;
    }
  }

  /**
   * Poll for completed batch jobs and resume corresponding flows
   */
  private async pollForCompletedBatches(): Promise<void> {
    try {
      // Find flows that are paused for batch processing with completed batch jobs
      const flowsToResume = await this.findFlowsReadyForResumption();

      if (flowsToResume.length === 0) {
        this.logger.debug('No flows found ready for resumption');
        return;
      }

      this.logger.info('Found flows ready for resumption', {
        count: flowsToResume.length,
        flowRunIds: flowsToResume.map((f) => f.flowRunId),
      });

      // Resume each flow
      for (const flowResumption of flowsToResume) {
        try {
          await this.resumeFromBatchCompletion(
            flowResumption.flowRunId,
            flowResumption.nodeId,
            flowResumption.batchResult,
            flowResumption.batchError,
          );

          this.logger.info('Flow resumed successfully', {
            flowRunId: flowResumption.flowRunId,
            nodeId: flowResumption.nodeId,
          });
        } catch (error) {
          this.logger.error('Failed to resume flow', {
            flowRunId: flowResumption.flowRunId,
            nodeId: flowResumption.nodeId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error polling for completed batches', { error });
    }
  }

  /**
   * Find flows that are paused for batch processing but have completed batch jobs
   */
  private async findFlowsReadyForResumption(): Promise<
    Array<{
      flowRunId: string;
      nodeId: string;
      batchResult?: unknown;
      batchError?: string;
    }>
  > {
    try {
      // Get all flows paused for batch processing
      const pausedFlowsResult = await this.flowRunsService.listRuns({
        filter: {
          status: [FlowRunStatus.PAUSED_FOR_BATCH],
        },
      });

      const flowsToResume: Array<{
        flowRunId: string;
        nodeId: string;
        batchResult?: unknown;
        batchError?: string;
      }> = [];

      // Check each paused flow for completed batch jobs
      for (const flowRun of pausedFlowsResult.data) {
        const batchJobs = await this.batchJobsService.getBatchJobsByFlowRunId(flowRun.id);

        // Find completed batch jobs for this execution (completed, failed, or cancelled)
        const completedBatchJobs = batchJobs.filter(
          (job) =>
            job.status === BatchStatus.COMPLETED ||
            job.status === BatchStatus.FAILED ||
            job.status === BatchStatus.CANCELLED,
        );

        // If there are completed batch jobs, this flow is ready for resumption
        for (const batchJob of completedBatchJobs) {
          flowsToResume.push({
            flowRunId: flowRun.id,
            nodeId: batchJob.nodeId,
            batchResult:
              batchJob.status === BatchStatus.COMPLETED ? batchJob.responseData : undefined,
            batchError:
              batchJob.status === BatchStatus.FAILED || batchJob.status === BatchStatus.CANCELLED
                ? batchJob.error
                : undefined,
          });
        }
      }

      return flowsToResume;
    } catch (error) {
      this.logger.error('Failed to find flows ready for resumption', { error });
      return [];
    }
  }

  /**
   * Close the service
   */
  async close(): Promise<void> {
    this.logger.debug('Closing flow orchestration service');

    // Stop all heartbeat timers for in-progress flows
    this.flowRunCoordinator.stopAllHeartbeats();

    // Stop batch polling if it's running
    await this.stopFlowResumptionPolling();

    // Stop stale run detector
    this.stopStaleRunDetector();

    this.initialized = false;
    // Service lifecycle is managed externally
  }
}
