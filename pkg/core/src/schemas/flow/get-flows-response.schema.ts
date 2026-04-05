import { z } from 'zod/v4';
import { PaginatedResponseSchema } from '../pagination-sort-filter';
import { flowSchema } from '../../types/validation/flow.schemas';

/**
 * GET /flows response schema
 * Paginated array of flow objects
 */
export const getFlowsResponseSchema = PaginatedResponseSchema(flowSchema);

export type GetFlowsResponse = z.infer<typeof getFlowsResponseSchema>;
