import type { DatabaseService } from '../database/database.service';
import { Logger, PaginatedResponse, QueryOptions } from 'src/types/schemas';
import { DatabaseError } from 'src/types/common/errors.types';
import { AgentToolExecution, CreateAgentToolExecutionInput } from './agent-tool-executions.model';

/**
 * Service for managing agent tool execution records
 *
 * Tracks individual tool calls made during agent (LLM with tools) execution.
 * Each tool call within an agent's iteration loop is recorded separately.
 */
export class AgentToolExecutionService {
  private initialized: boolean = false;

  constructor(
    private readonly logger: Logger,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Agent tool execution service already initialized');
      return;
    }

    try {
      await this.databaseService.initialize();
      this.initialized = true;
      this.logger.info('Agent tool execution service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize agent tool execution service', { error });
      throw new DatabaseError('Failed to initialize agent tool execution service', { error });
    }
  }

  /**
   * Record a tool execution
   */
  async recordToolExecution(input: CreateAgentToolExecutionInput): Promise<AgentToolExecution> {
    this.logger.debug('Recording agent tool execution', {
      nodeExecutionId: input.nodeExecutionId,
      toolId: input.toolId,
      toolName: input.toolName,
      iteration: input.iteration,
    });

    try {
      const record = await this.databaseService.agentToolExecutions.create(input);

      this.logger.debug('Agent tool execution recorded successfully', {
        id: record.id,
        toolId: input.toolId,
        success: record.success,
        duration: record.duration,
      });

      return record;
    } catch (error) {
      this.logger.error('Failed to record agent tool execution', {
        nodeExecutionId: input.nodeExecutionId,
        toolId: input.toolId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get tool executions for a specific node execution (agent node)
   */
  async getByNodeExecutionId(nodeExecutionId: string): Promise<AgentToolExecution[]> {
    this.logger.debug('Getting agent tool executions by node execution ID', {
      nodeExecutionId,
    });

    try {
      return await this.databaseService.agentToolExecutions.getByNodeExecutionId(nodeExecutionId);
    } catch (error) {
      this.logger.error('Failed to get agent tool executions by node execution ID', {
        nodeExecutionId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get all tool executions for a flow run
   * Useful for getting a complete picture of all tool calls across all agent nodes
   */
  async getByFlowRunId(flowRunId: string): Promise<AgentToolExecution[]> {
    this.logger.debug('Getting agent tool executions by flow run ID', { flowRunId });

    try {
      return await this.databaseService.agentToolExecutions.getByFlowRunId(flowRunId);
    } catch (error) {
      this.logger.error('Failed to get agent tool executions by flow run ID', {
        flowRunId,
        error,
      });
      throw error;
    }
  }

  /**
   * List tool executions with pagination and filtering
   */
  async list(
    options?: QueryOptions<AgentToolExecution>,
  ): Promise<PaginatedResponse<AgentToolExecution>> {
    this.logger.debug('Listing agent tool executions', { options });

    try {
      return await this.databaseService.agentToolExecutions.list(options);
    } catch (error) {
      this.logger.error('Failed to list agent tool executions', { options, error });
      throw error;
    }
  }
}
