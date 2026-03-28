import type { DatabaseService } from '../database/database.service';
import { Logger } from 'src/types/schemas';
import { DatabaseError } from 'src/types/common/errors.types';
import { NodeExecutionStatus } from 'src/types/base';
import { PaginatedResponse, QueryOptions } from 'src/types/schemas/pagination-sort-filter';
import { NodeExecution } from './node-executions.model';
import type { NodeOutput } from 'src/types/node-io-types';
import type { ExecutionEventBus } from '../execution-event-bus';

/**
 * Core Execution Trace Service implementation using database models
 */
export class NodeExecutionService {
  private initialized: boolean = false;
  private eventBus: ExecutionEventBus | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly databaseService: DatabaseService,
  ) {}

  /** Attach the event bus so state changes are broadcast to SSE subscribers. */
  setEventBus(bus: ExecutionEventBus): void {
    this.eventBus = bus;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Execution trace service already initialized');
      return;
    }

    try {
      // Ensure database service is initialized
      await this.databaseService.initialize();
      this.initialized = true;
      this.logger.info('Execution trace service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize execution trace service', { error });
      throw new DatabaseError('Failed to initialize execution trace service', { error });
    }
  }

  /**
   * Create a new execution trace
   */
  async createNodeExecution(
    executionId: string,
    nodeId: string,
    nodeType: string,
    inputs: Record<string, unknown>,
  ) {
    this.logger.debug('Creating execution trace', { executionId, nodeId, nodeType });

    try {
      const trace = await this.databaseService.nodeExecutions.create({
        flowRunId: executionId,
        nodeId,
        nodeType,
        inputs,
      });

      this.logger.debug('Execution trace created successfully', {
        traceId: trace.id,
        executionId,
        nodeId,
      });
      this.eventBus?.emitNodeExecutionCreate(trace);
      return trace;
    } catch (error) {
      this.logger.error('Failed to create execution trace', {
        executionId,
        nodeId,
        nodeType,
        error,
      });
      throw error;
    }
  }

  /**
   * Update execution trace
   */
  async updateNodeExecution(nodeExecutionId: string, updates: Partial<NodeExecution>) {
    this.logger.debug('Updating execution trace', { nodeExecutionId, updates });

    try {
      // Map the updates to the model's update input type
      const updateInput = {
        status: updates.status,
        outputs: updates.outputs,
        error: updates.error,
        completedAt: updates.completedAt,
        duration: updates.duration,
        retryCount: updates.retryCount,
      };

      const updatedTrace = await this.databaseService.nodeExecutions.update(
        nodeExecutionId,
        updateInput,
      );

      this.logger.debug('Execution trace updated successfully', {
        nodeExecutionId,
        status: updatedTrace.status,
      });
      this.eventBus?.emitNodeExecutionUpdate(updatedTrace);
      return updatedTrace;
    } catch (error) {
      this.logger.error('Failed to update execution trace', { nodeExecutionId, error });
      throw error;
    }
  }

  /**
   * Get execution trace by ID
   */
  async getNodeExecutionById(nodeExecutionId: string) {
    this.logger.debug('Retrieving execution trace by ID', { nodeExecutionId });

    try {
      const trace = await this.databaseService.nodeExecutions.findById(nodeExecutionId);

      if (!trace) {
        throw new DatabaseError('Execution trace not found', { nodeExecutionId });
      }

      this.logger.debug('Execution trace retrieved successfully', { nodeExecutionId });
      return trace;
    } catch (error) {
      this.logger.error('Failed to retrieve execution trace', { nodeExecutionId, error });
      throw error;
    }
  }

  /**
   * Get all traces for an execution
   */
  async listNodeExecutionsByFlowRunId(flowRunId: string) {
    this.logger.debug('Retrieving execution traces', { flowRunId: flowRunId });

    try {
      const traces = await this.databaseService.nodeExecutions.findByFlowRunId(flowRunId);

      this.logger.debug('Execution traces retrieved successfully', {
        flowRunId: flowRunId,
        count: traces.length,
      });
      return traces;
    } catch (error) {
      this.logger.error('Failed to retrieve execution traces', { flowRunId: flowRunId, error });
      throw error;
    }
  }

  /**
   * Update trace status with optional additional data
   */
  async updateNodeExecutionStatus(
    traceId: string,
    status: NodeExecutionStatus,
    data?: {
      outputs?: NodeOutput;
      error?: string;
      reason?: string;
    },
  ): Promise<NodeExecution> {
    this.logger.debug('Updating node execution status', JSON.stringify({ traceId, status, data }));

    try {
      const updated = await this.databaseService.nodeExecutions.updateTraceStatus(traceId, status, data);
      this.eventBus?.emitNodeExecutionUpdate(updated);
      return updated;
    } catch (error) {
      this.logger.error('Failed to update trace status', { traceId, status, error });
      throw new DatabaseError('Failed to update trace status', { error });
    }
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(traceId: string) {
    return this.databaseService.nodeExecutions.incrementRetryCount(traceId);
  }

  /**
   * Get all executions across all flows with optional filtering, pagination, and sorting
   */
  async listNodeExecutions(
    options?: QueryOptions<NodeExecution>,
  ): Promise<PaginatedResponse<NodeExecution>> {
    try {
      this.logger.debug('Getting all node executions', { options });

      // Call the model's list method which now handles pagination, sorting, and filtering
      const result = await this.databaseService.nodeExecutions.list(options);

      this.logger.debug('Node executions retrieved successfully', {
        count: result.data.length,
        pagination: result.pagination,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to get all node executions', { options, error });
      throw new DatabaseError('Failed to get all node executions', { error });
    }
  }

  /**
   * Get execution with flow data (enhanced single execution retrieval)
   */
  async getExecutionWithFlowData(executionId: string) {
    try {
      this.logger.debug('Getting execution with flow data', { executionId });

      // Get the execution
      const execution = await this.databaseService.flowRuns.findById(executionId);
      if (!execution) {
        return null;
      }

      // Get the flow data
      const flow = await this.databaseService.flows.findById(execution.flowId);
      if (!flow) {
        this.logger.warn('Flow not found for execution', {
          executionId,
          flowId: execution.flowId,
        });
        return execution;
      }

      // Get the flow version data
      const flowVersion = await this.databaseService.flowVersions.findByKey(
        execution.flowId,
        execution.flowVersion,
      );
      if (!flowVersion) {
        this.logger.warn('Flow version not found for execution', {
          executionId,
          flowId: execution.flowId,
          flowVersion: execution.flowVersion,
        });
        return execution;
      }

      // Get execution traces
      const traces = await this.databaseService.nodeExecutions.findByFlowRunId(executionId);

      return {
        ...execution,
        flowData: flow,
        flowVersionData: flowVersion,
        traces,
      };
    } catch (error) {
      this.logger.error('Failed to get execution with flow data', { executionId, error });
      throw new DatabaseError('Failed to get execution with flow data', { error });
    }
  }

  /**
   * Close the service
   */
  async close(): Promise<void> {
    this.logger.debug('Closing execution trace service');
    this.initialized = false;
    // Database connection lifecycle is managed externally
  }
}
