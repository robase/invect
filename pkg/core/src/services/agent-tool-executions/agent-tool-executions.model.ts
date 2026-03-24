// Agent Tool Executions Model for Invect core — adapter-based implementation
import type { InvectAdapter } from '../../database/adapter';
import { DatabaseError } from 'src/types/common/errors.types';
import { Logger, PaginatedResponse, QueryOptions } from 'src/types/schemas';

/**
 * Agent Tool Execution entity
 */
export interface AgentToolExecution {
  id: string;
  nodeExecutionId: string;
  flowRunId: string;
  toolId: string;
  toolName: string;
  iteration: number;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  startedAt: Date | string;
  completedAt?: Date | string;
  duration?: number;
}

/**
 * Input for creating a new agent tool execution
 */
export interface CreateAgentToolExecutionInput {
  nodeExecutionId: string;
  flowRunId: string;
  toolId: string;
  toolName: string;
  iteration: number;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  success: boolean;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

const TABLE = 'agent_tool_executions';

/**
 * Agent Tool Executions CRUD operations class — uses InvectAdapter.
 */
export class AgentToolExecutionsModel {
  constructor(
    private readonly adapter: InvectAdapter,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a new agent tool execution record
   */
  async create(input: CreateAgentToolExecutionInput): Promise<AgentToolExecution> {
    try {
      const result = await this.adapter.create({
        model: TABLE,
        data: {
          node_execution_id: input.nodeExecutionId,
          flow_run_id: input.flowRunId,
          tool_id: input.toolId,
          tool_name: input.toolName,
          iteration: input.iteration,
          input: input.input,
          output: input.output ?? null,
          error: input.error ?? null,
          success: input.success,
          started_at: new Date(input.startedAt),
          completed_at: input.completedAt ? new Date(input.completedAt) : null,
          duration: input.duration ?? null,
        },
      });
      return this.normalize(result);
    } catch (error) {
      this.logger.error('Failed to create agent tool execution', { input, error });
      throw new DatabaseError('Failed to create agent tool execution', { error });
    }
  }

  /**
   * Get agent tool executions by node execution ID
   */
  async getByNodeExecutionId(nodeExecutionId: string): Promise<AgentToolExecution[]> {
    try {
      const results = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'node_execution_id', value: nodeExecutionId }],
        sortBy: { field: 'iteration', direction: 'asc' },
      });
      return results.map((r) => this.normalize(r));
    } catch (error) {
      this.logger.error('Failed to get agent tool executions by node execution ID', {
        nodeExecutionId,
        error,
      });
      throw new DatabaseError('Failed to get agent tool executions', { error });
    }
  }

  /**
   * Get agent tool executions by flow run ID
   */
  async getByFlowRunId(flowRunId: string): Promise<AgentToolExecution[]> {
    try {
      const results = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'flow_run_id', value: flowRunId }],
        sortBy: { field: 'started_at', direction: 'asc' },
      });
      return results.map((r) => this.normalize(r));
    } catch (error) {
      this.logger.error('Failed to get agent tool executions by flow run ID', {
        flowRunId,
        error,
      });
      throw new DatabaseError('Failed to get agent tool executions', { error });
    }
  }

  /**
   * List agent tool executions with pagination
   */
  async list(
    options?: QueryOptions<AgentToolExecution>,
  ): Promise<PaginatedResponse<AgentToolExecution>> {
    const pagination = options?.pagination || { limit: 100, page: 1 };
    const offset = (pagination.page - 1) * pagination.limit;

    try {
      const [results, totalCount] = await Promise.all([
        this.adapter.findMany<Record<string, unknown>>({
          model: TABLE,
          sortBy: { field: 'started_at', direction: 'desc' },
          limit: pagination.limit,
          offset,
        }),
        this.adapter.count({ model: TABLE }),
      ]);

      const data = results.map((r) => this.normalize(r));
      const totalPages = Math.ceil(totalCount / pagination.limit);

      return {
        data,
        pagination: { page: pagination.page, limit: pagination.limit, totalPages },
      };
    } catch (error) {
      this.logger.error('Failed to list agent tool executions', { options, error });
      throw new DatabaseError('Failed to list agent tool executions', { error });
    }
  }

  /**
   * Normalize database result to AgentToolExecution interface
   */
  private normalize(raw: Record<string, unknown>): AgentToolExecution {
    return {
      id: raw.id as string,
      nodeExecutionId: (raw.node_execution_id ?? raw.nodeExecutionId) as string,
      flowRunId: (raw.flow_run_id ?? raw.flowRunId) as string,
      toolId: (raw.tool_id ?? raw.toolId) as string,
      toolName: (raw.tool_name ?? raw.toolName) as string,
      iteration: raw.iteration as number,
      input: (raw.input as Record<string, unknown>) || {},
      output: raw.output as unknown,
      error: raw.error as string | undefined,
      success: Boolean(raw.success),
      startedAt: (raw.started_at ?? raw.startedAt) as Date | string,
      completedAt: (raw.completed_at ?? raw.completedAt) as Date | string | undefined,
      duration: raw.duration as number | undefined,
    };
  }
}
