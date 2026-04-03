// Node Executions Model for Invect core — adapter-based implementation
import type { InvectAdapter, WhereClause } from '../../database/adapter';
import { NodeExecutionStatus } from 'src/types/base';
import { DatabaseError } from 'src/types/common/errors.types';
import { Logger, PaginatedResponse, QueryOptions } from 'src/types/schemas';
import type { NodeOutput } from 'src/types/node-io-types';

/**
 * Execution Trace entity
 */
export interface NodeExecution {
  id: string;
  flowRunId: string;
  nodeId: string;
  nodeType: string;
  status: NodeExecutionStatus;
  inputs: Record<string, unknown>;
  outputs?: NodeOutput;
  error?: string;
  startedAt: Date | string;
  completedAt?: Date | string;
  duration?: number;
  retryCount: number;
}

/**
 * Input for creating a new execution trace
 */
export interface CreateNodeExecutionInput {
  flowRunId: string;
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
}

/**
 * Input for updating an execution trace
 */
export interface UpdateNodeExecutionInput {
  status?: NodeExecutionStatus;
  outputs?: NodeOutput;
  error?: string;
  completedAt?: Date | string;
  duration?: number;
  retryCount?: number;
}

/**
 * Execution trace query parameters
 */
interface NodeExecutionQuery {
  nodeExecutionId?: string;
  nodeId?: string;
  status?: NodeExecutionStatus;
  limit?: number;
  offset?: number;
}

const TABLE = 'execution_traces';

/**
 * Node Executions CRUD operations class — uses InvectAdapter.
 */
export class NodeExecutionsModel {
  constructor(
    private readonly adapter: InvectAdapter,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a new execution trace
   */
  async create(input: CreateNodeExecutionInput): Promise<NodeExecution> {
    try {
      const result = await this.adapter.create({
        model: TABLE,
        data: {
          flow_run_id: input.flowRunId,
          node_id: input.nodeId,
          node_type: input.nodeType,
          status: 'PENDING' as NodeExecutionStatus,
          inputs: input.inputs,
          retry_count: 0,
          started_at: new Date(),
        },
      });
      return this.normalize(result);
    } catch (error) {
      this.logger.error('Failed to create execution trace', { input, error });
      throw new DatabaseError('Failed to create execution trace', { error });
    }
  }

  /**
   * Get all execution traces with optional filtering
   */
  async list(options?: QueryOptions<NodeExecution>): Promise<PaginatedResponse<NodeExecution>> {
    const pagination = options?.pagination || { limit: 100, page: 1 };
    const sort = options?.sort;
    const filter = options?.filter || {};
    const offset = (pagination.page - 1) * pagination.limit;
    const where = this.buildFilterWhere(filter);

    try {
      const [data, totalCount] = await Promise.all([
        this.adapter.findMany<Record<string, unknown>>({
          model: TABLE,
          where,
          limit: pagination.limit,
          offset,
          sortBy: sort
            ? { field: this.mapSortField(sort.sortBy as string), direction: sort.sortOrder }
            : { field: 'started_at', direction: 'desc' },
        }),
        this.adapter.count({ model: TABLE, where }),
      ]);

      return this.processPaginatedResults(data, totalCount, pagination);
    } catch (error) {
      this.logger.error('Failed to retrieve execution traces', { options, error });
      throw new DatabaseError('Failed to retrieve execution traces', { error });
    }
  }

  /**
   * Get execution trace by ID
   */
  async findById(id: string): Promise<NodeExecution | null> {
    try {
      const result = await this.adapter.findOne<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'id', value: id }],
      });
      return result ? this.normalize(result) : null;
    } catch (error) {
      this.logger.error('Failed to get execution trace by ID', { traceId: id, error });
      throw new DatabaseError('Failed to get execution trace by ID', { error });
    }
  }

  /**
   * Update execution trace
   */
  async update(id: string, input: UpdateNodeExecutionInput): Promise<NodeExecution> {
    try {
      const updateData: Record<string, unknown> = {};

      if (input.status !== undefined) {
        updateData.status = input.status;
      }
      if (input.outputs !== undefined) {
        updateData.outputs = this.serializeOutputs(input.outputs);
      }
      if (input.error !== undefined) {
        updateData.error = input.error;
      }
      if (input.completedAt !== undefined) {
        updateData.completed_at = new Date(input.completedAt as string);
      }
      if (input.duration !== undefined) {
        updateData.duration = input.duration;
      }
      if (input.retryCount !== undefined) {
        updateData.retry_count = input.retryCount;
      }

      const result = await this.adapter.update<Record<string, unknown>>({
        model: TABLE,
        where: [{ field: 'id', value: id }],
        update: updateData,
      });

      if (!result) {
        throw new DatabaseError('Execution trace not found');
      }
      return this.normalize(result);
    } catch (error) {
      this.logger.error('Failed to update execution trace', { traceId: id, error });
      throw new DatabaseError('Failed to update execution trace', { error });
    }
  }

  /**
   * Delete execution trace
   */
  async delete(id: string): Promise<void> {
    try {
      await this.adapter.delete({
        model: TABLE,
        where: [{ field: 'id', value: id }],
      });
    } catch (error) {
      this.logger.error('Failed to delete execution trace', { traceId: id, error });
      throw new DatabaseError('Failed to delete execution trace', { error });
    }
  }

  /**
   * Get execution traces by flow run ID
   */
  async findByFlowRunId(flowRunId: string): Promise<NodeExecution[]> {
    const result = await this.list({ filter: { flowRunId: [flowRunId] } });
    return result.data;
  }

  /**
   * Get execution traces by flow run ID and node ID
   */
  async findByExecutionAndNode(flowRunId: string, nodeId: string): Promise<NodeExecution[]> {
    try {
      const results = await this.adapter.findMany<Record<string, unknown>>({
        model: TABLE,
        where: [
          { field: 'flow_run_id', value: flowRunId },
          { field: 'node_id', value: nodeId },
        ],
        sortBy: { field: 'started_at', direction: 'desc' },
      });
      return results.map((r) => this.normalize(r));
    } catch (error) {
      this.logger.error('Failed to get execution traces by execution and node', {
        flowRunId,
        nodeId,
        error,
      });
      throw new DatabaseError('Failed to get execution traces by execution and node', { error });
    }
  }

  /**
   * Update trace status with optional additional data
   */
  async updateTraceStatus(
    id: string,
    status: NodeExecutionStatus,
    data?: {
      outputs?: NodeOutput;
      error?: string;
      reason?: string;
    },
  ): Promise<NodeExecution> {
    try {
      this.logger.debug('Updating trace status', { traceId: id, status, data });

      const updateInput: UpdateNodeExecutionInput = {
        status,
        completedAt: status !== 'PENDING' && status !== 'RUNNING' ? new Date() : undefined,
        ...data,
      };

      const updatedTrace = await this.update(id, updateInput);

      this.logger.debug('Trace status updated successfully', {
        traceId: id,
        status: updatedTrace.status,
      });
      return updatedTrace;
    } catch (error) {
      this.logger.error('Failed to update trace status', { traceId: id, status, error });
      throw new DatabaseError('Failed to update trace status', { error });
    }
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(id: string): Promise<NodeExecution> {
    try {
      const trace = await this.findById(id);
      if (!trace) {
        throw new DatabaseError('Execution trace not found');
      }
      return this.update(id, { retryCount: trace.retryCount + 1 });
    } catch (error) {
      this.logger.error('Failed to increment retry count', { traceId: id, error });
      throw new DatabaseError('Failed to increment retry count', { error });
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private serializeOutputs(outputs: NodeOutput | undefined): unknown {
    if (!outputs) {
      return undefined;
    }
    try {
      return JSON.parse(JSON.stringify(outputs));
    } catch (error) {
      throw new Error(`Failed to serialize node outputs: ${error}`);
    }
  }

  private calculatePaginationMetadata(
    totalCount: number,
    pagination: { page: number; limit: number },
  ) {
    const totalPages = Math.ceil(totalCount / pagination.limit);
    return { page: pagination.page, limit: pagination.limit, totalPages };
  }

  private processPaginatedResults(
    result: Record<string, unknown>[],
    totalCount: number,
    pagination: { page: number; limit: number },
  ): PaginatedResponse<NodeExecution> {
    const data = result.map((r) => this.normalize(r));
    return { data, pagination: this.calculatePaginationMetadata(totalCount, pagination) };
  }

  private normalize(raw: Record<string, unknown>): NodeExecution {
    return {
      id: String(raw.id),
      flowRunId: String(raw.flow_run_id ?? raw.flowRunId),
      nodeId: String(raw.node_id ?? raw.nodeId),
      nodeType: String(raw.node_type ?? raw.nodeType),
      status: (raw.status || 'PENDING') as NodeExecutionStatus,
      inputs: (raw.inputs || {}) as Record<string, unknown>,
      outputs: raw.outputs as NodeOutput | undefined,
      error: raw.error ? String(raw.error) : undefined,
      startedAt: (raw.started_at ?? raw.startedAt ?? new Date()) as Date | string,
      completedAt: (raw.completed_at ?? raw.completedAt ?? undefined) as Date | string | undefined,
      duration: raw.duration ? Number(raw.duration) : undefined,
      retryCount: Number(raw.retry_count ?? raw.retryCount ?? 0),
    };
  }

  private buildFilterWhere(filter: Record<string, unknown[]>): WhereClause[] {
    const clauses: WhereClause[] = [];
    for (const [key, values] of Object.entries(filter)) {
      if (!values || !Array.isArray(values) || values.length === 0) {
        continue;
      }
      const dbField = this.mapFilterField(key);
      if (values.length === 1) {
        clauses.push({ field: dbField, operator: 'eq', value: values[0] });
      } else {
        clauses.push({ field: dbField, operator: 'in', value: values });
      }
    }
    return clauses;
  }

  private mapFilterField(field: string): string {
    const map: Record<string, string> = {
      flowRunId: 'flow_run_id',
      nodeId: 'node_id',
      nodeType: 'node_type',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      retryCount: 'retry_count',
    };
    return map[field] ?? field;
  }

  private mapSortField(field: string): string {
    return this.mapFilterField(field);
  }
}
