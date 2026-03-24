import { z } from 'zod/v4';
import { PaginationQuerySchema } from '../pagination-sort-filter'; // adjust import path as needed

/**
 * Flow ID parameter schema
 */
export const FlowIdParamsSchema = z.object({
  flowId: z.string().min(1, 'Flow ID is required and cannot be empty'),
});

/**
 * Flow executions specific query parameters
 */
export const FlowExecutionsFilterSchema = z.object({
  status: z
    .enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'PAUSED', 'CANCELLED', 'PAUSED_FOR_BATCH'])
    .optional(),
  sortBy: z
    .enum(['startedAt', 'endedAt', 'status', 'inputData', 'outputData', 'error'])
    .default('startedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Get flow executions query schema
 * Combines pagination with flow-specific filters
 */
export const GetFlowExecutionsQuerySchema = PaginationQuerySchema.merge(FlowExecutionsFilterSchema);

// Type exports
export type FlowIdParams = z.infer<typeof FlowIdParamsSchema>;
export type FlowExecutionsFilter = z.infer<typeof FlowExecutionsFilterSchema>;
export type GetFlowExecutionsQuery = z.infer<typeof GetFlowExecutionsQuerySchema>;
